import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AdapterContext,
  CommandRequest,
  ComputerInput,
  ComputerRef,
  ControlLeaseRef,
  ProcessEvent,
  SandboxProvider,
  ScreenRequest,
  ScreenSession,
} from "@meshbot/adapter-kit";
import {
  limitCommandOutput,
  sandboxCommandMaxOutputBytes,
  sandboxCommandTimeoutMs,
} from "@meshbot/core";
import { SandboxMutationFence } from "./sandbox-mutation-permit.js";

interface DesktopBox {
  ref: ComputerRef;
  home: string;
  running: boolean;
  screen: string;
  processes: Set<ChildProcess>;
}

export class DesktopSandboxProvider implements SandboxProvider {
  readonly boxes = new Map<string, DesktopBox>();
  // This fence covers one desktop-provider process. Cross-process desktop fencing needs a host supervisor.
  private readonly mutationFence = new SandboxMutationFence();

  constructor(private readonly opts: { root?: string; hostRoots?: string[] } = {}) {}

  describe() {
    return {
      id: "desktop",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: {
        graphical: true,
        pty: true,
        snapshots: true,
        takeover: true,
        persistentHome: true,
      },
    };
  }

  async provision(
    request: { botId: string; homePath: string },
    context: AdapterContext,
  ): Promise<ComputerRef> {
    this.mutationFence.accept(request.botId, context, ["run", "lifecycle"]);
    const id = `desktop-${request.botId}-${randomUUID().slice(0, 8)}`;
    const home = path.resolve(
      this.opts.root ?? path.join(process.cwd(), "data"),
      "desktop-computers",
      request.botId,
    );
    await mkdir(home, { recursive: true });
    this.mutationFence.accept(request.botId, context, ["run", "lifecycle"]);
    const ref: ComputerRef = { id, botId: request.botId, kind: "desktop", providerRef: home };
    this.boxes.set(id, {
      ref,
      home,
      running: true,
      screen: "ready",
      processes: new Set(),
    });
    return ref;
  }

  async *execute(
    computer: ComputerRef,
    request: CommandRequest,
    context: AdapterContext,
  ): AsyncIterable<ProcessEvent> {
    this.mutationFence.accept(computer.botId, context, ["run"]);
    const box = this.boxFor(computer);
    if (!box?.running) {
      yield { type: "stderr", data: "computer not found" };
      yield { type: "exit", code: 1 };
      return;
    }
    const cwd = resolveExecuteCwd(request.cwd, box.home);
    if (!allowedPath(cwd, this.allowedRoots(box.home))) {
      yield { type: "stderr", data: "path is outside this computer's home" };
      yield { type: "exit", code: 1 };
      return;
    }
    await mkdir(cwd, { recursive: true });
    const environment = desktopCommandEnvironment(box.home);
    await mkdir(environment.TMPDIR!, { recursive: true });
    this.mutationFence.accept(computer.botId, context, ["run"]);
    const argv = request.argv.length ? request.argv : ["echo", "ready"];
    const result = await runCommand(argv, cwd, environment, {
      signal: context.signal,
      timeoutMs: sandboxCommandTimeoutMs(request.timeoutMs),
      maxOutputBytes: sandboxCommandMaxOutputBytes(request.maxOutputBytes),
      onStart: (child) => box.processes.add(child),
      onFinish: (child) => box.processes.delete(child),
    });
    if (result.stdout) yield { type: "stdout", data: result.stdout };
    if (result.stderr) yield { type: "stderr", data: result.stderr };
    yield { type: "exit", code: result.code };
  }

  async connectScreen(
    computer: ComputerRef,
    _request: ScreenRequest,
    _context: AdapterContext,
  ): Promise<ScreenSession> {
    return {
      url: `desktop://screen/${computer.id}`,
      mimeType: "text/plain",
      close: async () => undefined,
    };
  }

  async sendInput(
    computer: ComputerRef,
    input: ComputerInput,
    lease: ControlLeaseRef,
    context: AdapterContext,
  ): Promise<void> {
    this.mutationFence.accept(computer.botId, context, ["control"], lease.leaseId);
    const box = this.boxFor(computer);
    if (box && input.kind === "clipboard") box.screen = input.text;
  }

  async snapshot(computer: ComputerRef, _context: AdapterContext) {
    return { id: `desktop-snap-${computer.id}`, createdAt: new Date().toISOString() };
  }

  async quiesce(botId: string, context: AdapterContext): Promise<void> {
    this.mutationFence.accept(botId, context, ["run", "control", "lifecycle"]);
    const boxes = new Set([...this.boxes.values()].filter((box) => box.ref.botId === botId));
    await Promise.all([...boxes].map(quiesceBox));
  }

  async stop(computer: ComputerRef, context: AdapterContext): Promise<void> {
    this.mutationFence.accept(computer.botId, context, ["lifecycle"]);
    const box = this.boxFor(computer);
    if (box) await stopBox(box);
  }

  async destroy(computer: ComputerRef, context: AdapterContext): Promise<void> {
    this.mutationFence.accept(computer.botId, context, ["lifecycle"]);
    const box = this.boxFor(computer);
    if (box) await stopBox(box);
    if (box) this.boxes.delete(box.ref.id);
    this.boxes.delete(computer.id);
    if (box && this.opts.root) {
      await writeFile(path.join(box.home, ".stopped"), new Date().toISOString(), "utf8").catch(
        () => undefined,
      );
    }
    if (box && !this.opts.root) {
      await rm(box.home, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private boxFor(computer: ComputerRef): DesktopBox | undefined {
    const existing = this.boxes.get(computer.id);
    if (existing) return existing;
    for (const box of this.boxes.values()) {
      if (box.ref.botId === computer.botId || box.home === computer.providerRef) return box;
    }
    if (!computer.providerRef) return undefined;
    const box: DesktopBox = {
      ref: computer,
      home: path.resolve(computer.providerRef),
      running: true,
      screen: "ready",
      processes: new Set(),
    };
    this.boxes.set(computer.id, box);
    return box;
  }

  private allowedRoots(home: string) {
    return [home, ...(this.opts.hostRoots ?? [])];
  }
}

function resolveExecuteCwd(requestCwd: string | undefined, home: string) {
  if (!requestCwd || requestCwd === "/home/meshbot" || requestCwd === "/home/user") return home;
  return path.resolve(home, requestCwd);
}

function allowedPath(target: string, roots: string[]) {
  const resolved = path.resolve(target);
  return roots.some((root) => {
    const base = path.resolve(root);
    return resolved === base || resolved.startsWith(base + path.sep);
  });
}

export function desktopCommandEnvironment(
  home: string,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    HOME: home,
    PATH: source.PATH ?? "/usr/bin:/bin",
    TMPDIR: path.join(home, ".tmp"),
  };
  for (const key of ["LANG", "LC_ALL", "LC_CTYPE", "LOGNAME", "SHELL", "USER"] as const) {
    if (source[key]) environment[key] = source[key];
  }
  return environment;
}

function runCommand(
  argv: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: {
    signal: AbortSignal;
    timeoutMs: number;
    maxOutputBytes: number;
    onStart(child: ChildProcess): void;
    onFinish(child: ChildProcess): void;
  },
): Promise<{ stdout: string; stderr: string; code: number }> {
  if (options.signal.aborted) {
    return Promise.resolve({ stdout: "", stderr: "command cancelled", code: 1 });
  }
  return new Promise((resolve) => {
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd,
      env,
      detached: process.platform !== "win32",
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let capturedBytes = 0;
    let termination: string | undefined;
    let settled = false;
    options.onStart(child);

    const finish = (code: number, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal.removeEventListener("abort", onAbort);
      killProcessTree(child);
      options.onFinish(child);
      const output = limitCommandOutput(
        Buffer.concat(stdout).toString("utf8"),
        Buffer.concat(stderr).toString("utf8"),
        options.maxOutputBytes,
        [error, termination].filter(Boolean).join("\n"),
      );
      resolve({
        ...output,
        code: termination ? 1 : code,
      });
    };
    const terminate = (reason: string) => {
      if (termination) return;
      termination = reason;
      killProcessTree(child);
    };
    const capture = (target: Buffer[], chunk: Buffer) => {
      const remaining = options.maxOutputBytes - capturedBytes;
      if (remaining > 0) target.push(chunk.subarray(0, remaining));
      capturedBytes += Math.min(remaining, chunk.length);
      if (chunk.length > remaining) terminate("command output limit exceeded");
    };
    const onAbort = () => terminate("command cancelled");
    const timer = setTimeout(() => terminate("command timed out"), options.timeoutMs);
    timer.unref();
    options.signal.addEventListener("abort", onAbort, { once: true });

    child.stdout?.on("data", (chunk: Buffer) => {
      capture(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      capture(stderr, chunk);
    });
    child.on("error", (error) => {
      finish(1, error.message);
    });
    child.on("close", (code) => {
      finish(code ?? 1);
    });
  });
}

async function stopBox(box: DesktopBox) {
  box.running = false;
  await quiesceBox(box);
}

async function quiesceBox(box: DesktopBox) {
  const processes = [...box.processes];
  for (const child of processes) killProcessTree(child);
  await Promise.all(processes.map(waitForProcessTree));
}

function killProcessTree(child: ChildProcess) {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // The process may have exited between the event and the kill.
    }
  }
  child.kill("SIGKILL");
}

function waitForExit(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    child.once("close", () => resolve());
  });
}

async function waitForProcessTree(child: ChildProcess) {
  await waitForExit(child);
  if (!child.pid || process.platform === "win32") return;
  while (processGroupExists(child.pid)) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function processGroupExists(pid: number) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}
