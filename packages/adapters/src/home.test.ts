import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AdapterContext } from "@meshbot/adapter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalAgentHomeStore } from "./home.js";

const context = {
  operationId: "test",
  traceId: "test",
  workspaceId: "workspace",
  userId: "user",
  signal: new AbortController().signal,
};
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture(prisma?: never) {
  const root = await mkdtemp(path.join(tmpdir(), "meshbot-home-"));
  dirs.push(root);
  const store = new LocalAgentHomeStore(root, prisma);
  const home = store.pathFor("bot-1");
  await mkdir(home, { recursive: true });
  return { root, store, home };
}

function runFenceFixture(valid = true) {
  const query = vi.fn(async () => (valid ? [{ id: "run-1" }] : []));
  const tx = { $queryRaw: query };
  const transaction = vi.fn(async (run: (value: typeof tx) => Promise<unknown>) => run(tx));
  const runContext: AdapterContext = {
    ...context,
    botId: "bot-1",
    runId: "run-1",
    mutationPermit: {
      purpose: "run",
      operationFence: 7,
      runId: "run-1",
      runLeaseFence: 11,
    },
  };
  return {
    context: runContext,
    query,
    transaction,
    prisma: { $transaction: transaction } as never,
  };
}

describe("LocalAgentHomeStore path containment", () => {
  it("rejects lexical traversal and sibling-prefix paths", async () => {
    const { store } = await fixture();
    await expect(store.readFile("bot-1", "../../homes-other/secret", context)).rejects.toThrow(
      /escapes|invalid/i,
    );
  });

  it("allows symlinks whose resolved target stays inside the bot home", async () => {
    const { store, home } = await fixture();
    await writeFile(path.join(home, "target.txt"), "before");
    await symlink("target.txt", path.join(home, "link.txt"));

    expect(await store.readFile("bot-1", "link.txt", context)).toBe("before");
    await store.writeFile("bot-1", "link.txt", "after", context);
    expect(await readFile(path.join(home, "target.txt"), "utf8")).toBe("after");
  });

  it("allows directory symlinks that remain inside the bot home", async () => {
    const { store, home } = await fixture();
    await mkdir(path.join(home, "target-dir"));
    await symlink("target-dir", path.join(home, "linked-dir"));

    await store.writeFile("bot-1", "linked-dir/result.txt", "safe", context);
    expect(await readFile(path.join(home, "target-dir", "result.txt"), "utf8")).toBe("safe");
    expect(await store.list("bot-1", "linked-dir", context)).toEqual([
      { path: "linked-dir/result.txt", kind: "file", size: 4 },
    ]);
  });

  it("rejects reads and writes through symlinks outside the bot home", async () => {
    const { root, store, home } = await fixture();
    const outside = path.join(root, "outside.txt");
    await writeFile(outside, "secret");
    await symlink(outside, path.join(home, "escape.txt"));

    await expect(store.readFile("bot-1", "escape.txt", context)).rejects.toThrow(/escapes/i);
    await expect(store.writeFile("bot-1", "escape.txt", "changed", context)).rejects.toThrow(
      /escapes/i,
    );
    expect(await readFile(outside, "utf8")).toBe("secret");
  });

  it("does not create directories through an external symlink", async () => {
    const { root, store, home } = await fixture();
    const outside = path.join(root, "outside-dir");
    await mkdir(outside);
    await symlink(outside, path.join(home, "escape-dir"));

    await expect(
      store.writeFile("bot-1", "escape-dir/new/result.txt", "changed", context),
    ).rejects.toThrow(/escapes/i);
    await expect(readFile(path.join(outside, "new", "result.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("hides external symlinks from listings and exports", async () => {
    const { root, store, home } = await fixture();
    await writeFile(path.join(home, "safe.txt"), "safe");
    await symlink(path.join(root, "outside"), path.join(home, "external"));
    await writeFile(path.join(root, "outside"), "secret");

    expect(await store.list("bot-1", "", context)).toEqual([
      { path: "safe.txt", kind: "file", size: 4 },
    ]);
    const exported = [];
    for await (const file of store.exportHome("bot-1", context)) exported.push(file.path);
    expect(exported).toEqual(["safe.txt"]);
  });

  it("holds the exact run and computer fence while writing", async () => {
    const fence = runFenceFixture();
    const { store, home } = await fixture(fence.prisma);

    await store.writeFile("bot-1", "result.txt", "safe", fence.context);

    expect(await readFile(path.join(home, "result.txt"), "utf8")).toBe("safe");
    expect(fence.query).toHaveBeenCalledWith(
      expect.anything(),
      "run-1",
      "workspace",
      "user",
      "bot-1",
      11,
      7,
    );
    expect(fence.transaction).toHaveBeenCalledOnce();
  });

  it("leaves the home unchanged when the run fence is stale", async () => {
    const fence = runFenceFixture(false);
    const { store, home, root } = await fixture(fence.prisma);
    await writeFile(path.join(home, "kept.txt"), "before");
    const source = path.join(root, "source");
    await mkdir(source);
    await writeFile(path.join(source, "new.txt"), "after");

    await expect(store.commit("bot-1", source, fence.context)).rejects.toThrow(/no longer valid/i);

    expect(await readFile(path.join(home, "kept.txt"), "utf8")).toBe("before");
    await expect(readFile(path.join(home, "new.txt"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
