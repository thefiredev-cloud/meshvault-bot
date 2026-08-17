import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DesktopSandboxProvider } from "./desktop-sandbox.js";
import { FakeSandboxProvider } from "./fake-sandbox.js";
import { HostAwareSandbox, sandboxKindForBot } from "./host-aware-sandbox.js";

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

describe("host-aware sandbox", () => {
  const hostRoot = mkdtempSync(path.join(tmpdir(), "meshbot-host-root-"));

  afterAll(() => {
    rmSync(hostRoot, { recursive: true, force: true });
  });

  it("lets this-mac cwd run under a host root", async () => {
    const desktop = new DesktopSandboxProvider({ hostRoots: [hostRoot] });
    const computer = await desktop.provision(
      { botId: "host", homePath: "/tmp/host-home" },
      lifecycleContext("host", 1),
    );
    let code = 1;
    for await (const event of desktop.execute(
      computer,
      { argv: ["echo", "ok"], cwd: hostRoot },
      runContext("host", 2),
    )) {
      if (event.type === "exit") code = event.code;
    }
    expect(code).toBe(0);
    await desktop.destroy(computer, lifecycleContext("host", 3));
  });

  it("still refuses paths outside home and host roots", async () => {
    const desktop = new DesktopSandboxProvider({ hostRoots: [hostRoot] });
    const computer = await desktop.provision(
      { botId: "deny", homePath: "/tmp/deny" },
      lifecycleContext("deny", 1),
    );
    let stderr = "";
    let code = 0;
    for await (const event of desktop.execute(
      computer,
      { argv: ["echo", "nope"], cwd: "/etc" },
      runContext("deny", 2),
    )) {
      if (event.type === "stderr") stderr += event.data;
      if (event.type === "exit") code = event.code;
    }
    expect(code).toBe(1);
    expect(stderr).toMatch(/outside this computer's home/i);
    await desktop.destroy(computer, lifecycleContext("deny", 3));
  });

  it("provisions on the host provider when enabled", async () => {
    const isolated = new FakeSandboxProvider();
    const host = new DesktopSandboxProvider();
    const sandbox = new HostAwareSandbox(isolated, host, async () => true);
    const computer = await sandbox.provision(
      { botId: "switch", homePath: "/tmp/switch" },
      lifecycleContext("switch", 1),
    );
    expect(computer.kind).toBe("desktop");
    await sandbox.destroy(computer, lifecycleContext("switch", 2));
  });

  it("provisions on the isolated provider when this-mac is off", async () => {
    const isolated = new FakeSandboxProvider();
    const host = new DesktopSandboxProvider();
    const sandbox = new HostAwareSandbox(isolated, host, async () => false);
    const computer = await sandbox.provision(
      { botId: "iso", homePath: "/tmp/iso" },
      lifecycleContext("iso", 1),
    );
    expect(computer.kind).toBe("fake");
    await sandbox.destroy(computer, lifecycleContext("iso", 2));
  });

  it("maps the Linux bot home cwd onto the desktop home", async () => {
    const desktop = new DesktopSandboxProvider();
    const computer = await desktop.provision(
      { botId: "alias", homePath: "/tmp/alias" },
      lifecycleContext("alias", 1),
    );
    let code = 1;
    for await (const event of desktop.execute(
      computer,
      { argv: ["echo", "ok"], cwd: "/home/meshbot" },
      runContext("alias", 2),
    )) {
      if (event.type === "exit") code = event.code;
    }
    expect(code).toBe(0);
    await desktop.destroy(computer, lifecycleContext("alias", 3));
  });

  it("quiesces both possible providers after a host switch", async () => {
    const isolated = new FakeSandboxProvider();
    const host = new FakeSandboxProvider();
    const sandbox = new HostAwareSandbox(isolated, host, async () => true);
    const request = { botId: "both", homePath: "/tmp/both" };
    const isolatedComputer = await isolated.provision(request, lifecycleContext("both", 1));
    const hostComputer = await host.provision(request, lifecycleContext("both", 1));
    await sandbox.quiesce("both", lifecycleContext("both", 5));
    const consume = async (provider: FakeSandboxProvider, computer: typeof isolatedComputer) => {
      for await (const _event of provider.execute(
        computer,
        { argv: ["echo", "stale"] },
        runContext("both", 4),
      )) {
        // drain
      }
    };
    await expect(consume(isolated, isolatedComputer)).rejects.toThrow(/stale/i);
    await expect(consume(host, hostComputer)).rejects.toThrow(/stale/i);
  });

  it("only switches docker deployments onto this Mac", () => {
    expect(sandboxKindForBot("docker", "this-mac")).toBe("desktop");
    expect(sandboxKindForBot("docker", "docker")).toBe("docker");
    expect(sandboxKindForBot("e2b", "this-mac")).toBe("e2b");
    expect(sandboxKindForBot("fake", "this-mac")).toBe("fake");
  });
});
