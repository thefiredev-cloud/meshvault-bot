import { execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SandboxNotFoundError } from "@e2b/desktop";
import type { SandboxProvider } from "@meshbot/adapter-kit";
import { afterAll, describe, expect, it, vi } from "vitest";
import { DesktopSandboxProvider, desktopCommandEnvironment } from "./desktop-sandbox.js";
import { DockerSandboxProvider } from "./docker-sandbox.js";
import { ManagedSandboxEmulator } from "./e2b-emulator.js";
import { E2BSandboxProvider } from "./e2b-sandbox.js";
import { FakeSandboxProvider } from "./fake-sandbox.js";

const ctx = {
  operationId: "1",
  traceId: "1",
  workspaceId: "w",
  userId: "u",
  signal: new AbortController().signal,
};

function lifecycleContext(botId: string, operationFence: number) {
  return {
    ...ctx,
    botId,
    mutationPermit: { purpose: "lifecycle" as const, operationFence },
  };
}

function runContext(botId: string, operationFence: number) {
  const runId = `run-${botId}`;
  return {
    ...ctx,
    botId,
    runId,
    mutationPermit: { purpose: "run" as const, operationFence, runId, runLeaseFence: 1 },
  };
}

function controlContext(botId: string, operationFence: number, controlLeaseId: string) {
  return {
    ...ctx,
    botId,
    mutationPermit: { purpose: "control" as const, operationFence, controlLeaseId },
  };
}

async function drain(
  provider: SandboxProvider,
  computer: {
    id: string;
    botId: string;
    kind: "fake" | "e2b" | "docker" | "desktop";
    providerRef: string;
  },
) {
  let stdout = "";
  for await (const event of provider.execute(
    computer,
    { argv: ["echo", "graphical-ok"] },
    runContext(computer.botId, 2),
  )) {
    if (event.type === "stdout") stdout += event.data;
    if (event.type === "exit") expect(event.code).toBe(0);
  }
  return stdout;
}

async function capture(
  provider: SandboxProvider,
  computer: Parameters<SandboxProvider["execute"]>[0],
  request: Parameters<SandboxProvider["execute"]>[1],
  operationFence = 2,
) {
  let stdout = "";
  let stderr = "";
  let code = 1;
  for await (const event of provider.execute(
    computer,
    request,
    runContext(computer.botId, operationFence),
  )) {
    if (event.type === "stdout") stdout += event.data;
    if (event.type === "stderr") stderr += event.data;
    if (event.type === "exit") code = event.code;
  }
  return { stdout, stderr, code };
}

describe("sandbox conformance", () => {
  it("runs the same graphical command on fake, managed-sandbox emulator, and desktop", async () => {
    const fake = new FakeSandboxProvider();
    const managed = new ManagedSandboxEmulator();
    const desktop = new DesktopSandboxProvider();
    const a = await fake.provision(
      { botId: "bot-a", homePath: "/tmp/a" },
      lifecycleContext("bot-a", 1),
    );
    const b = await managed.provision(
      { botId: "bot-b", homePath: "/tmp/b" },
      lifecycleContext("bot-b", 1),
    );
    const c = await desktop.provision(
      { botId: "bot-c", homePath: "/tmp/c" },
      lifecycleContext("bot-c", 1),
    );
    const outA = await drain(fake, a);
    const outB = await drain(managed, b);
    const outC = await drain(desktop, c);
    expect(outA).toContain("graphical-ok");
    expect(outB).toContain("graphical-ok");
    expect(outC).toContain("graphical-ok");
    expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    await fake.destroy(a, lifecycleContext("bot-a", 3));
    await managed.destroy(b, lifecycleContext("bot-b", 3));
    await desktop.destroy(c, lifecycleContext("bot-c", 3));
  });

  it("rejects missing, wrong-purpose, and stale mutation permits", async () => {
    const fake = new FakeSandboxProvider();
    await expect(fake.provision({ botId: "fenced", homePath: "/tmp/fenced" }, ctx)).rejects.toThrow(
      /mutation permit/i,
    );
    await expect(
      fake.provision(
        { botId: "fenced", homePath: "/tmp/fenced" },
        controlContext("fenced", 1, "lease"),
      ),
    ).rejects.toThrow(/mutation permit/i);
    const cold = await fake.provision(
      { botId: "cold", homePath: "/tmp/cold" },
      runContext("cold", 1),
    );
    await fake.destroy(cold, lifecycleContext("cold", 2));
    const computer = await fake.provision(
      { botId: "fenced", homePath: "/tmp/fenced" },
      lifecycleContext("fenced", 2),
    );
    const lease = { leaseId: "lease", holder: "user" as const, fence: 1 };
    await expect(
      fake.sendInput(
        computer,
        { kind: "clipboard", text: "blocked" },
        lease,
        controlContext("fenced", 3, "other"),
      ),
    ).rejects.toThrow(/control mutation permit/i);
    await fake.sendInput(
      computer,
      { kind: "clipboard", text: "accepted" },
      lease,
      controlContext("fenced", 3, "lease"),
    );
    await fake.quiesce("fenced", lifecycleContext("fenced", 5));
    await expect(capture(fake, computer, { argv: ["echo", "stale"] }, 4)).rejects.toThrow(/stale/i);
    await expect(fake.snapshot(computer, ctx)).resolves.toMatchObject({ id: expect.any(String) });
    await fake.destroy(computer, lifecycleContext("fenced", 6));
  });

  it("desktop executor refuses paths outside the computer home", async () => {
    const desktop = new DesktopSandboxProvider();
    const computer = await desktop.provision(
      { botId: "grant", homePath: "/tmp/grant" },
      lifecycleContext("grant", 1),
    );
    let stderr = "";
    let code = 0;
    for await (const event of desktop.execute(
      computer,
      { argv: ["echo", "nope"], cwd: "/etc" },
      runContext("grant", 2),
    )) {
      if (event.type === "stderr") stderr += event.data;
      if (event.type === "exit") code = event.code;
    }
    expect(code).toBe(1);
    expect(stderr).toMatch(/outside this computer's home/i);
    await desktop.destroy(computer, lifecycleContext("grant", 3));
  });

  it("keeps service secrets out of desktop commands", () => {
    const environment = desktopCommandEnvironment("/bot/home", {
      PATH: "/trusted/bin",
      LANG: "en_US.UTF-8",
      DATABASE_URL: "postgres://secret",
      ENCRYPTION_KEY: "secret-key",
      OPENAI_API_KEY: "secret-model-key",
    });
    expect(environment).toEqual({
      HOME: "/bot/home",
      PATH: "/trusted/bin",
      TMPDIR: "/bot/home/.tmp",
      LANG: "en_US.UTF-8",
    });
  });

  it("stops desktop commands at their deadline", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "meshbot-desktop-timeout-"));
    const desktop = new DesktopSandboxProvider({ root });
    const computer = await desktop.provision(
      { botId: "timeout", homePath: root },
      lifecycleContext("timeout", 1),
    );
    const result = await capture(desktop, computer, {
      argv: [process.execPath, "-e", "setTimeout(() => {}, 5_000)"],
      timeoutMs: 50,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/command timed out/i);
    await desktop.destroy(computer, lifecycleContext("timeout", 3));
    rmSync(root, { recursive: true, force: true });
  });

  it("caps combined desktop command output", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "meshbot-desktop-output-"));
    const desktop = new DesktopSandboxProvider({ root });
    const computer = await desktop.provision(
      { botId: "output", homePath: root },
      lifecycleContext("output", 1),
    );
    const result = await capture(desktop, computer, {
      argv: [
        process.execPath,
        "-e",
        'process.stdout.write("o".repeat(384)); process.stderr.write("e".repeat(384))',
      ],
      maxOutputBytes: 512,
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/output limit exceeded/i);
    expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(
      512,
    );
    await desktop.destroy(computer, lifecycleContext("output", 3));
    rmSync(root, { recursive: true, force: true });
  });

  it.skipIf(process.platform === "win32")(
    "kills desktop command descendants on quiesce and stays reusable",
    async () => {
      const root = mkdtempSync(path.join(tmpdir(), "meshbot-desktop-stop-"));
      const ready = path.join(root, "ready");
      const survived = path.join(root, "survived");
      const childScript =
        'setTimeout(() => require("node:fs").writeFileSync(process.argv[1], "survived"), 600)';
      const parentScript = [
        'const { spawn } = require("node:child_process")',
        'require("node:fs").writeFileSync(process.argv[1], "ready")',
        `spawn(process.execPath, ["-e", ${JSON.stringify(childScript)}, process.argv[2]], { stdio: "ignore" })`,
        "setTimeout(() => {}, 5_000)",
      ].join(";");
      const desktop = new DesktopSandboxProvider({ root });
      const computer = await desktop.provision(
        { botId: "stop", homePath: root },
        lifecycleContext("stop", 1),
      );
      const running = capture(desktop, computer, {
        argv: [process.execPath, "-e", parentScript, ready, survived],
      });
      await waitForPath(ready, 1_000);
      await desktop.quiesce("stop", lifecycleContext("stop", 3));
      expect((await running).code).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 800));
      expect(existsSync(survived)).toBe(false);
      expect((await capture(desktop, computer, { argv: ["echo", "still-running"] }, 4)).code).toBe(
        0,
      );
      await desktop.destroy(computer, lifecycleContext("stop", 5));
      rmSync(root, { recursive: true, force: true });
    },
  );

  it("fails E2B commands closed while its SDK inserts a writable login shell", async () => {
    const e2b = new E2BSandboxProvider("unused");
    const events = [];
    for await (const event of e2b.execute(
      { id: "e2b-1", botId: "bot-e2b", kind: "e2b", providerRef: "e2b-1" },
      { argv: ["echo", "must-not-run"] },
      runContext("bot-e2b", 1),
    )) {
      events.push(event);
    }
    expect(events).toEqual([
      { type: "stderr", data: expect.stringMatching(/writable login shell/) },
      { type: "exit", code: 1 },
    ]);
  });

  it("retains E2B cleanup state across transient provider failures", async () => {
    const provider = new E2BSandboxProvider("unused");
    const boxes = Reflect.get(provider, "boxes") as Map<string, unknown>;
    const computer = { id: "box", botId: "bot", kind: "e2b" as const, providerRef: "box" };
    const desktop = {
      pause: vi.fn().mockRejectedValue(new Error("rate limited")),
      kill: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    };
    boxes.set("box", desktop);
    await expect(provider.stop(computer, lifecycleContext("bot", 1))).rejects.toThrow(
      "rate limited",
    );
    expect(boxes.has("box")).toBe(true);
    await expect(provider.destroy(computer, lifecycleContext("bot", 1))).rejects.toThrow(
      "provider unavailable",
    );
    expect(boxes.has("box")).toBe(true);
  });

  it("forgets E2B cleanup state after success or confirmed absence", async () => {
    const provider = new E2BSandboxProvider("unused");
    const boxes = Reflect.get(provider, "boxes") as Map<string, unknown>;
    const computer = { id: "box", botId: "bot", kind: "e2b" as const, providerRef: "box" };
    boxes.set("box", { pause: vi.fn().mockResolvedValue(true) });
    await expect(provider.stop(computer, lifecycleContext("bot", 1))).resolves.toBeUndefined();
    expect(boxes.has("box")).toBe(false);
    boxes.set("box", {
      kill: vi.fn().mockRejectedValue(new SandboxNotFoundError("sandbox not found")),
    });
    await expect(provider.destroy(computer, lifecycleContext("bot", 1))).resolves.toBeUndefined();
    expect(boxes.has("box")).toBe(false);
  });

  it("quiesces known E2B boxes and rejects their stale permits", async () => {
    const provider = new E2BSandboxProvider("unused");
    const boxes = Reflect.get(provider, "boxes") as Map<string, unknown>;
    const boxBots = Reflect.get(provider, "boxBots") as Map<string, string>;
    const pause = vi.fn().mockResolvedValue(true);
    const screenshot = vi.fn().mockResolvedValue(new Uint8Array());
    boxes.set("box", { pause, screenshot });
    boxBots.set("box", "bot");
    const computer = { id: "box", botId: "bot", kind: "e2b" as const, providerRef: "box" };
    await expect(provider.snapshot(computer, ctx)).resolves.toMatchObject({
      id: expect.any(String),
    });
    await provider.quiesce("bot", lifecycleContext("bot", 5));
    expect(pause).toHaveBeenCalledOnce();
    expect(boxes.has("box")).toBe(false);
    await expect(provider.destroy(computer, lifecycleContext("bot", 4))).rejects.toThrow(/stale/i);
  });
});

describe("docker sandbox", () => {
  let spawned: ReturnType<typeof spawn> | undefined;
  const dataDir = mkdtempSync(path.join(tmpdir(), "meshbot-docker-conformance-"));

  afterAll(async () => {
    spawned?.kill("SIGTERM");
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("requires permits and forwards only their exact authority headers", async () => {
    const mockedFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "box" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ stdout: "ok", stderr: "", code: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    try {
      const provider = new DockerSandboxProvider("http://supervisor.invalid", "test-token");
      await expect(provider.provision({ botId: "bot", homePath: "/tmp/bot" }, ctx)).rejects.toThrow(
        /mutation permit/i,
      );
      expect(mockedFetch).not.toHaveBeenCalled();
      const bootContext = {
        ...lifecycleContext("bot", 7),
        mutationPermit: {
          purpose: "lifecycle" as const,
          operationFence: 7,
          bootToken: "boot-1",
        },
      };
      const computer = await provider.provision(
        { botId: "bot", homePath: "/tmp/bot" },
        bootContext,
      );
      await capture(provider, computer, { argv: ["echo", "ok"] }, 8);
      const lease = { leaseId: "control-1", holder: "user" as const, fence: 1 };
      await provider.sendInput(
        computer,
        { kind: "clipboard", text: "safe" },
        lease,
        controlContext("bot", 9, "control-1"),
      );
      await provider.quiesce("bot", runContext("bot", 10));
      await provider.stop(computer, lifecycleContext("bot", 11));
      await provider.destroy(computer, lifecycleContext("bot", 12));

      const headers = mockedFetch.mock.calls.map(([, init]) => new Headers(init?.headers));
      expect(headers[0]?.get("x-meshbot-permit-purpose")).toBe("lifecycle");
      expect(headers[0]?.get("x-meshbot-boot-token")).toBe("boot-1");
      expect(headers[0]?.get("x-meshbot-run-id")).toBeNull();
      expect(headers[1]?.get("x-meshbot-permit-purpose")).toBe("run");
      expect(headers[1]?.get("x-meshbot-run-id")).toBe("run-bot");
      expect(headers[1]?.get("x-meshbot-run-lease-fence")).toBe("1");
      expect(headers[2]?.get("x-meshbot-permit-purpose")).toBe("control");
      expect(headers[2]?.get("x-meshbot-control-lease-id")).toBe("control-1");
      expect(headers[3]?.get("x-meshbot-permit-purpose")).toBe("run");
      expect(headers[4]?.get("x-meshbot-operation-fence")).toBe("11");
      expect(headers[5]?.get("x-meshbot-operation-fence")).toBe("12");
    } finally {
      mockedFetch.mockRestore();
    }
  });

  it("rejects oversized supervisor output", async () => {
    const mockedFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ stdout: "o".repeat(384), stderr: "e".repeat(384), code: 0 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    try {
      const provider = new DockerSandboxProvider("http://supervisor.invalid", "test-token");
      const result = await capture(
        provider,
        { id: "box", botId: "bot", kind: "docker", providerRef: "box" },
        { argv: ["echo", "test"], maxOutputBytes: 512 },
      );
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/output limit exceeded/i);
      expect(
        Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr),
      ).toBeLessThanOrEqual(512);
      const request = mockedFetch.mock.calls[0]?.[1];
      expect(JSON.parse(String(request?.body))).toMatchObject({
        timeoutMs: 240_000,
        maxOutputBytes: 512,
      });
    } finally {
      mockedFetch.mockRestore();
    }
  });

  it("rejects cleanup failures but accepts a confirmed missing computer", async () => {
    const mockedFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("x".repeat(4_096), { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    try {
      const provider = new DockerSandboxProvider("http://supervisor.invalid", "test-token");
      const computer = { id: "box", botId: "bot", kind: "docker" as const, providerRef: "box" };
      const lifecycle = lifecycleContext("bot", 1);
      const stopError = await provider.stop(computer, lifecycle).catch((error: unknown) => error);
      expect(stopError).toBeInstanceOf(Error);
      expect((stopError as Error).message).toMatch(/^sandbox stop failed: 503/);
      expect((stopError as Error).message.length).toBeLessThan(1_100);
      await expect(provider.stop(computer, lifecycle)).resolves.toBeUndefined();
      await expect(provider.destroy(computer, lifecycle)).rejects.toThrow(
        "sandbox destroy failed: 401 unauthorized",
      );
      await expect(provider.destroy(computer, lifecycle)).resolves.toBeUndefined();
    } finally {
      mockedFetch.mockRestore();
    }
  });

  it("runs the same graphical command through the supervisor", async ({ skip }) => {
    if (
      !dockerAvailable() ||
      !hasAnySandboxImage() ||
      !process.env.MESHBOT_DOCKER_CONFORMANCE_DATABASE_URL
    ) {
      skip();
      return;
    }
    const port = 17991;
    const token = "sandbox-conformance-token";
    const url = `http://127.0.0.1:${port}`;
    const root = path.resolve(import.meta.dirname, "../../..");
    spawned = spawn("pnpm", ["--filter", "@meshbot/sandbox-supervisor", "start"], {
      cwd: root,
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        DATABASE_URL: process.env.MESHBOT_DOCKER_CONFORMANCE_DATABASE_URL,
        SANDBOX_SUPERVISOR_TOKEN: token,
        SUPERVISOR_PORT: String(port),
      },
      stdio: "ignore",
    });
    const up = await waitForHealth(`${url}/health`, 20_000);
    if (!up) {
      skip();
      return;
    }
    const provider = new DockerSandboxProvider(url, token);
    const botId = `conf-${Date.now()}`;
    const computer = await provider.provision(
      { botId, homePath: path.join(dataDir, "homes", botId) },
      {
        ...lifecycleContext(botId, 1),
        mutationPermit: {
          purpose: "lifecycle",
          operationFence: 1,
          bootToken: "prepared-conformance-boot",
        },
      },
    );
    const out = await drain(provider, computer);
    expect(out).toContain("graphical-ok");
    const session = await provider.connectScreen(computer, { view: "stream" }, ctx);
    expect(session.url).toMatch(/embed\.html/);
    await provider.destroy(computer, lifecycleContext(botId, 3));
  }, 60_000);
});

function dockerAvailable() {
  try {
    execSync("docker info", { stdio: "ignore", timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

function hasAnySandboxImage() {
  try {
    execSync("docker image inspect meshbot/computer:local", { stdio: "ignore", timeout: 8_000 });
    return true;
  } catch {
    return false;
  }
}

async function ping(url: string) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(url: string, ms: number) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await ping(url)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function waitForPath(file: string, ms: number) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (existsSync(file)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${path.basename(file)}`);
}
