import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

function loadRootEnv() {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) {
      config({ path: candidate, override: false });
      if (process.env.DATA_DIR && !path.isAbsolute(process.env.DATA_DIR)) {
        process.env.DATA_DIR = path.resolve(dir, process.env.DATA_DIR);
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  config();
}
loadRootEnv();

import {
  createAgentRuntime,
  createConnectorStack,
  createRunExecutor,
  createRunSandbox,
  EncryptedSecretStore,
  ExpoPushProvider,
  enqueueQueuedRuns,
  GraphileWakeupDriver,
  InMemoryWakeupDriver,
  LocalAgentHomeStore,
  resolveComposioCallbackUrl,
  sleepComputerIfIdle,
} from "@meshbot/adapters";
import { deploymentModelKey, modelSecretsToRedact, resolveEncryptionKey } from "@meshbot/core";
import { createDb } from "@meshbot/db";
import { MarkdownMemoryStore } from "@meshbot/memory";

const QUEUED_RUN_RECOVERY_MS = 5_000;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const composioCallbackUrl = resolveComposioCallbackUrl(
    process.env.API_URL ?? "http://127.0.0.1:3100",
    process.env.NODE_ENV,
  );
  const { prisma } = createDb(databaseUrl);
  const runtime = createAgentRuntime(process.env.AGENT_RUNTIME ?? "hermes");
  const dataDir = process.env.DATA_DIR ?? "./data";
  const sandbox = createRunSandbox(process.env.SANDBOX_PROVIDER ?? "docker", {
    supervisorUrl: process.env.SANDBOX_SUPERVISOR_URL ?? "http://127.0.0.1:7091",
    e2bApiKey: process.env.E2B_API_KEY,
    dataDir,
    prisma,
  });
  const secrets = new EncryptedSecretStore(resolveEncryptionKey(process.env));
  const stack = createConnectorStack({
    prisma,
    secrets,
    callbackUrl: composioCallbackUrl,
  });
  const connector = stack.destination;
  await connector.start();
  const wakeup =
    process.env.WAKEUP_DRIVER === "memory"
      ? new InMemoryWakeupDriver()
      : new GraphileWakeupDriver(databaseUrl);
  const executor = createRunExecutor({
    prisma,
    runtime,
    sandbox,
    memory: new MarkdownMemoryStore(prisma),
    home: new LocalAgentHomeStore(dataDir),
    connector: stack.connector,
    secrets: modelSecretsToRedact(),
    secretStore: secrets,
    deploymentModelKey: deploymentModelKey(),
    dataDir,
    notifications: new ExpoPushProvider(dataDir),
    wakeup,
  });

  await wakeup.start({
    "run.continue": async (payload) => {
      await executor.continueRun(String(payload.runId), process.pid.toString());
    },
    "routine.wakeup": async (payload) => {
      await executor.wakeRoutine(String(payload.routineId), process.pid.toString());
    },
    "computer.sleep": async (payload) => {
      await sleepComputerIfIdle({ prisma, sandbox, wakeup }, String(payload.botId));
    },
  });

  await enqueueQueuedRuns(prisma, wakeup);
  setInterval(() => {
    void enqueueQueuedRuns(prisma, wakeup).catch((error) =>
      console.error("queued run recovery failed", error),
    );
  }, QUEUED_RUN_RECOVERY_MS).unref();

  console.log("meshbot worker ready");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
