import type {
  AdapterContext,
  CommandRequest,
  ComputerInput,
  ComputerRef,
  ControlLeaseRef,
  MutationPermit,
  ProcessEvent,
  SandboxProvider,
  ScreenRequest,
  ScreenSession,
} from "@meshbot/adapter-kit";
import {
  limitCommandOutput,
  resolveSupervisorToken,
  sandboxCommandMaxOutputBytes,
  sandboxCommandTimeoutMs,
} from "@meshbot/core";
import { SandboxMutationFence } from "./sandbox-mutation-permit.js";

export class DockerSandboxProvider implements SandboxProvider {
  private readonly supervisorToken: string;
  private readonly mutationFence = new SandboxMutationFence();

  constructor(
    private readonly supervisorUrl: string,
    supervisorToken?: string,
  ) {
    this.supervisorToken = supervisorToken ?? resolveSupervisorToken(process.env);
  }

  describe() {
    return {
      id: "docker",
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

  private url(path: string) {
    return `${this.supervisorUrl.replace(/\/$/, "")}${path}`;
  }

  private headers(context: AdapterContext, botId?: string) {
    return {
      authorization: `Bearer ${this.supervisorToken}`,
      "x-meshbot-workspace-id": context.workspaceId,
      ...(botId ? { "x-meshbot-bot-id": botId } : {}),
    };
  }

  private mutationHeaders(
    context: AdapterContext,
    botId: string,
    allowedPurposes: readonly MutationPermit["purpose"][],
    requireLifecycleBootToken = false,
    controlLeaseId?: string,
  ) {
    const permit = this.mutationFence.accept(botId, context, allowedPurposes, controlLeaseId);
    return {
      ...this.headers(context, botId),
      ...mutationPermitHeaders(permit, requireLifecycleBootToken),
    };
  }

  async provision(
    request: { botId: string; homePath: string },
    context: AdapterContext,
  ): Promise<ComputerRef> {
    const res = await fetch(this.url("/computers"), {
      method: "POST",
      headers: {
        ...this.mutationHeaders(context, request.botId, ["run", "lifecycle"], true),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        botId: request.botId,
        homePath: request.homePath,
        workspaceId: context.workspaceId,
      }),
      signal: context.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`sandbox provision failed: ${res.status} ${detail}`.trim());
    }
    const body = (await res.json()) as { id: string };
    return { id: body.id, botId: request.botId, kind: "docker", providerRef: body.id };
  }

  async *execute(
    computer: ComputerRef,
    request: CommandRequest,
    context: AdapterContext,
  ): AsyncIterable<ProcessEvent> {
    const timeoutMs = sandboxCommandTimeoutMs(request.timeoutMs);
    const maxOutputBytes = sandboxCommandMaxOutputBytes(request.maxOutputBytes);
    const res = await fetch(this.url(`/computers/${computer.id}/exec`), {
      method: "POST",
      headers: {
        ...this.mutationHeaders(context, computer.botId, ["run"]),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...request,
        cwd: request.cwd ?? "/home/meshbot",
        timeoutMs,
        maxOutputBytes,
      }),
      signal: context.signal,
    });
    if (!res.ok) {
      yield { type: "stderr", data: `exec failed: ${res.status}` };
      yield { type: "exit", code: 1 };
      return;
    }
    const body = (await res.json()) as { stdout: string; stderr: string; code: number };
    const exceeded =
      Buffer.byteLength(body.stdout) + Buffer.byteLength(body.stderr) > maxOutputBytes;
    const output = limitCommandOutput(
      body.stdout,
      body.stderr,
      maxOutputBytes,
      exceeded ? "command output limit exceeded" : "",
    );
    if (output.stdout) yield { type: "stdout", data: output.stdout };
    if (output.stderr) yield { type: "stderr", data: output.stderr };
    yield { type: "exit", code: exceeded ? 1 : body.code };
  }

  async connectScreen(
    computer: ComputerRef,
    _request: ScreenRequest,
    context: AdapterContext,
  ): Promise<ScreenSession> {
    const res = await fetch(this.url(`/computers/${computer.id}`), {
      headers: this.headers(context, computer.botId),
      signal: context.signal,
    });
    if (!res.ok) {
      return { url: null, mimeType: "text/html", close: async () => undefined };
    }
    const body = (await res.json()) as { screenUrl?: string };
    return {
      url: body.screenUrl ?? this.url(`/computers/${computer.id}/screen`),
      mimeType: "text/html",
      close: async () => undefined,
    };
  }

  async sendInput(
    computer: ComputerRef,
    input: ComputerInput,
    lease: ControlLeaseRef,
    context: AdapterContext,
  ): Promise<void> {
    const res = await fetch(this.url(`/computers/${computer.id}/input`), {
      method: "POST",
      headers: {
        ...this.mutationHeaders(context, computer.botId, ["control"], false, lease.leaseId),
        "content-type": "application/json",
      },
      body: JSON.stringify({ input, leaseId: lease.leaseId }),
      signal: context.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`sandbox input failed: ${res.status} ${detail}`.trim());
    }
  }

  async snapshot(computer: ComputerRef, _context: AdapterContext) {
    return { id: `docker-snap-${computer.id}`, createdAt: new Date().toISOString() };
  }

  async quiesce(botId: string, context: AdapterContext): Promise<void> {
    const response = await fetch(this.url("/computers/quiesce"), {
      method: "POST",
      headers: {
        ...this.mutationHeaders(context, botId, ["run", "lifecycle"]),
        "content-type": "application/json",
      },
      body: JSON.stringify({ botId }),
      signal: context.signal,
    });
    await requireCleanupResponse(response, "sandbox quiesce");
  }

  async stop(computer: ComputerRef, context: AdapterContext): Promise<void> {
    const response = await fetch(this.url(`/computers/${computer.id}/stop`), {
      method: "POST",
      headers: this.mutationHeaders(context, computer.botId, ["lifecycle"]),
      signal: context.signal,
    });
    await requireCleanupResponse(response, "sandbox stop");
  }

  async destroy(computer: ComputerRef, context: AdapterContext): Promise<void> {
    const response = await fetch(this.url(`/computers/${computer.id}`), {
      method: "DELETE",
      headers: this.mutationHeaders(context, computer.botId, ["lifecycle"]),
      signal: context.signal,
    });
    await requireCleanupResponse(response, "sandbox destroy");
  }
}

function mutationPermitHeaders(permit: MutationPermit, requireLifecycleBootToken: boolean) {
  const common = {
    "x-meshbot-permit-purpose": permit.purpose,
    "x-meshbot-operation-fence": String(permit.operationFence),
  };
  if (permit.purpose === "run") {
    return {
      ...common,
      "x-meshbot-run-id": permit.runId,
      "x-meshbot-run-lease-fence": String(permit.runLeaseFence),
    };
  }
  if (permit.purpose === "control") {
    return { ...common, "x-meshbot-control-lease-id": permit.controlLeaseId };
  }
  if (requireLifecycleBootToken && !permit.bootToken) {
    throw new Error("missing Docker lifecycle boot token");
  }
  return { ...common, ...(permit.bootToken ? { "x-meshbot-boot-token": permit.bootToken } : {}) };
}

async function requireCleanupResponse(response: Response, action: string): Promise<void> {
  if (response.ok || response.status === 404) return;
  const detail = (await response.text().catch(() => "")).slice(0, 1_024).trim();
  throw new Error(`${action} failed: ${response.status}${detail ? ` ${detail}` : ""}`);
}
