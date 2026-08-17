import { Sandbox, SandboxNotFoundError } from "@e2b/desktop";
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
import { sandboxIdleMs } from "./computer-idle.js";
import { SandboxMutationFence } from "./sandbox-mutation-permit.js";

export function e2bCreateOptions(botId: string, apiKey: string) {
  return {
    apiKey,
    timeoutMs: sandboxIdleMs(),
    metadata: { botId, meshbot: "computer" },
    resolution: [1280, 800] as [number, number],
    lifecycle: { onTimeout: "pause" as const, autoResume: false },
  };
}

export function isUnrecoverableSandboxError(error: unknown): boolean {
  return (
    error instanceof SandboxNotFoundError ||
    (error instanceof Error && error.name === "SandboxNotFoundError")
  );
}

export const E2B_BROWSER_APPS = ["google-chrome", "firefox", "chromium"] as const;

export async function openDesktopBrowser(
  desktop: {
    launch: (application: string, uri?: string) => Promise<void>;
    open: (fileOrUrl: string) => Promise<void>;
  },
  beforeMutation: () => void = () => undefined,
): Promise<void> {
  for (const app of E2B_BROWSER_APPS) {
    beforeMutation();
    try {
      await desktop.launch(app);
      return;
    } catch {
      // try the next installed browser
    }
  }
  beforeMutation();
  await desktop.open("https://www.google.com").catch(() => undefined);
}

export class E2BSandboxProvider implements SandboxProvider {
  private readonly boxes = new Map<string, Sandbox>();
  private readonly boxBots = new Map<string, string>();
  private readonly mutationFence = new SandboxMutationFence();

  constructor(private readonly apiKey: string) {}

  describe() {
    return {
      id: "e2b",
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

  private remember(botId: string, desktop: Sandbox): void {
    this.boxes.set(desktop.sandboxId, desktop);
    this.boxBots.set(desktop.sandboxId, botId);
  }

  private forget(id: string): void {
    this.boxes.delete(id);
    this.boxBots.delete(id);
  }

  private async box(computer: ComputerRef, stream = false): Promise<Sandbox> {
    const id = computer.providerRef || computer.id;
    const existing = this.boxes.get(id);
    if (existing) {
      if (stream) await this.startStream(existing);
      return existing;
    }
    const connected = await Sandbox.connect(id, {
      apiKey: this.apiKey,
      timeoutMs: sandboxIdleMs(),
    });
    this.remember(computer.botId, connected);
    if (stream) await this.startStream(connected);
    return connected;
  }

  private async startStream(desktop: Sandbox, beforeMutation: () => void = () => undefined) {
    beforeMutation();
    try {
      await desktop.stream.start({ requireAuth: true });
    } catch {
      beforeMutation();
      await desktop.stream.start();
    }
  }

  async provision(
    request: { botId: string; homePath: string; providerRef?: string },
    context: AdapterContext,
  ): Promise<ComputerRef> {
    const verify = () => {
      this.mutationFence.accept(request.botId, context, ["run", "lifecycle"]);
    };
    verify();
    if (request.providerRef) {
      try {
        verify();
        const desktop = await Sandbox.connect(request.providerRef, {
          apiKey: this.apiKey,
          timeoutMs: sandboxIdleMs(),
        });
        this.remember(request.botId, desktop);
        try {
          verify();
          await this.startStream(desktop, verify);
          verify();
        } catch (error) {
          await this.pauseProvisionFailure(desktop);
          throw error;
        }
        return {
          id: desktop.sandboxId,
          botId: request.botId,
          kind: "e2b",
          providerRef: desktop.sandboxId,
        };
      } catch (error) {
        if (!isUnrecoverableSandboxError(error)) throw error;
        this.forget(request.providerRef);
      }
    }
    verify();
    const desktop = await Sandbox.create(e2bCreateOptions(request.botId, this.apiKey));
    this.remember(request.botId, desktop);
    try {
      verify();
      await desktop.files.makeDir("/home/user/meshbot-home").catch(() => undefined);
      verify();
      await this.startStream(desktop, verify);
      verify();
      await openDesktopBrowser(desktop, verify);
      verify();
    } catch (error) {
      await this.killProvisionFailure(desktop);
      throw error;
    }
    return {
      id: desktop.sandboxId,
      botId: request.botId,
      kind: "e2b",
      providerRef: desktop.sandboxId,
    };
  }

  async *execute(
    computer: ComputerRef,
    _request: CommandRequest,
    context: AdapterContext,
  ): AsyncIterable<ProcessEvent> {
    this.mutationFence.accept(computer.botId, context, ["run"]);
    yield {
      type: "stderr",
      data: "E2B command execution is disabled because this SDK starts a writable login shell; use the Docker or desktop sandbox",
    };
    yield { type: "exit", code: 1 };
  }

  async connectScreen(
    computer: ComputerRef,
    _request: ScreenRequest,
    _context: AdapterContext,
  ): Promise<ScreenSession> {
    const desktop = await this.box(computer, true);
    let authKey: string | undefined;
    try {
      authKey = desktop.stream.getAuthKey();
    } catch {
      authKey = undefined;
    }
    const url =
      typeof desktop.stream.getUrl === "function"
        ? desktop.stream.getUrl({
            autoConnect: true,
            resize: "scale",
            ...(authKey ? { authKey } : {}),
          })
        : null;
    return {
      url,
      mimeType: "text/html",
      close: async () => {
        await desktop.stream.stop().catch(() => undefined);
      },
    };
  }

  async sendInput(
    computer: ComputerRef,
    input: ComputerInput,
    lease: ControlLeaseRef,
    context: AdapterContext,
  ): Promise<void> {
    const verify = () => {
      this.mutationFence.accept(computer.botId, context, ["control"], lease.leaseId);
    };
    verify();
    const desktop = await this.box(computer);
    if (input.kind === "key") {
      verify();
      await desktop.press(input.key);
    } else if (input.kind === "pointer") {
      verify();
      if (input.type === "move") await desktop.moveMouse(input.x, input.y);
      else if (input.type === "click" || input.type === "down") {
        if (input.button === "right") await desktop.rightClick(input.x, input.y);
        else await desktop.leftClick(input.x, input.y);
      }
    } else if (input.kind === "clipboard") {
      verify();
      await desktop.write(input.text);
    }
  }

  async snapshot(computer: ComputerRef, _context: AdapterContext) {
    const desktop = await this.box(computer);
    await desktop.screenshot().catch(() => undefined);
    return { id: `e2b-${computer.id}-${Date.now()}`, createdAt: new Date().toISOString() };
  }

  async keepAlive(computer: ComputerRef): Promise<void> {
    const desktop = await this.box(computer);
    await desktop.setTimeout(sandboxIdleMs()).catch(() => undefined);
  }

  async quiesce(botId: string, context: AdapterContext): Promise<void> {
    const verify = () => {
      this.mutationFence.accept(botId, context, ["run", "control", "lifecycle"]);
    };
    verify();
    const boxes = [...this.boxes.entries()].filter(([id]) => this.boxBots.get(id) === botId);
    await Promise.all(
      boxes.map(async ([id, desktop]) => {
        verify();
        try {
          await desktop.pause({ signal: context.signal });
          this.forget(id);
        } catch (error) {
          if (!isUnrecoverableSandboxError(error)) throw error;
          this.forget(id);
        }
      }),
    );
  }

  async stop(computer: ComputerRef, context: AdapterContext): Promise<void> {
    this.mutationFence.accept(computer.botId, context, ["lifecycle"]);
    const id = computer.providerRef || computer.id;
    const desktop = this.boxes.get(id);
    try {
      if (desktop) await desktop.pause({ signal: context.signal });
      else await Sandbox.pause(id, { apiKey: this.apiKey, signal: context.signal });
      this.forget(id);
    } catch (error) {
      if (!isUnrecoverableSandboxError(error)) throw error;
      this.forget(id);
    }
  }

  async destroy(computer: ComputerRef, context: AdapterContext): Promise<void> {
    this.mutationFence.accept(computer.botId, context, ["lifecycle"]);
    const id = computer.providerRef || computer.id;
    const desktop = this.boxes.get(id);
    try {
      if (desktop) await desktop.kill({ signal: context.signal });
      else await Sandbox.kill(id, { apiKey: this.apiKey, signal: context.signal });
      this.forget(id);
    } catch (error) {
      if (!isUnrecoverableSandboxError(error)) throw error;
      this.forget(id);
    }
  }

  private async pauseProvisionFailure(desktop: Sandbox): Promise<void> {
    try {
      await desktop.pause();
      this.forget(desktop.sandboxId);
    } catch (error) {
      if (!isUnrecoverableSandboxError(error)) throw error;
      this.forget(desktop.sandboxId);
    }
  }

  private async killProvisionFailure(desktop: Sandbox): Promise<void> {
    try {
      await desktop.kill();
      this.forget(desktop.sandboxId);
    } catch (error) {
      if (!isUnrecoverableSandboxError(error)) throw error;
      this.forget(desktop.sandboxId);
    }
  }
}
