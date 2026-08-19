import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const rpc = vi.fn();

vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    store.set(key, value);
  },
}));

vi.mock("./api", () => ({
  rpc: (...args: unknown[]) => rpc(...args),
}));

import {
  assertRoutineOwner,
  createBotRoutine,
  duplicateBotBody,
  duplicateRosterBot,
  identityFromBot,
  identityUpdateBody,
  loadHiddenBotIds,
  persistHiddenBotIds,
  saveBotIdentity,
  setBotHidden,
  testBotRoutine,
  updateBotRoutine,
} from "./bot-mode.js";

const source = {
  id: "bot_1",
  name: "Chief",
  title: "Ops",
  preview: "hello",
  color: "#9B5CF6",
  updatedAt: "2026-08-19T00:00:00.000Z",
  description: "Runs the week",
  instructions: "Be brief.",
  modelProvider: "qwen",
  modelId: "qwen-plus",
  notifyOnFinish: true,
};

describe("mobile bot mode identity", () => {
  beforeEach(() => {
    store.clear();
    rpc.mockReset();
  });

  it("saves identity through bots/update, not a second plugin host", async () => {
    const draft = identityFromBot(source);
    const parsed = identityUpdateBody(source.id, draft);
    expect(parsed).toMatchObject({
      ok: true,
      body: {
        botId: "bot_1",
        name: "Chief",
        title: "Ops",
        instructions: "Be brief.",
      },
    });
    rpc.mockResolvedValueOnce({ ...source, name: "Chief" });
    await saveBotIdentity(source.id, draft);
    expect(rpc).toHaveBeenCalledWith("bots/update", parsed.ok ? parsed.body : {});
    expect(rpc.mock.calls[0]?.[0]).not.toMatch(/profiles\.|hermes/);
  });

  it("duplicates via bots/create and keeps the source name taken", async () => {
    const parsed = duplicateBotBody(source, [source]);
    expect(parsed).toMatchObject({
      ok: true,
      input: { name: "Chief-2", title: "Ops (copy)", instructions: "Be brief." },
    });
    rpc.mockResolvedValueOnce({ ...source, id: "bot_2", name: "Chief-2" });
    await duplicateRosterBot(source, [source]);
    expect(rpc).toHaveBeenCalledWith("bots/create", parsed.ok ? parsed.input : {});
  });
});

describe("mobile bot mode hide + routines", () => {
  beforeEach(() => {
    store.clear();
    rpc.mockReset();
  });

  it("persists hide ids locally without deleting the bot", async () => {
    expect(await loadHiddenBotIds()).toEqual([]);
    const hidden = await setBotHidden("bot_1", []);
    expect(hidden).toEqual({ hiddenIds: ["bot_1"], hidden: true });
    expect(await loadHiddenBotIds()).toEqual(["bot_1"]);
    await persistHiddenBotIds(["bot_2", "bot_1", "bot_1"]);
    expect(await loadHiddenBotIds()).toEqual(["bot_1", "bot_2"]);
  });

  it("creates and toggles routines on the selected bot only", async () => {
    expect(assertRoutineOwner({ botId: "bot_1" }, "bot_2")).toBe(
      "This routine belongs to another bot.",
    );
    rpc.mockResolvedValueOnce({ id: "rtn_1", botId: "bot_1", name: "Morning" });
    await createBotRoutine({
      botId: "bot_1",
      name: "Morning",
      prompt: "Check inbox",
      cron: "0 9 * * *",
    });
    expect(rpc).toHaveBeenCalledWith(
      "routines/create",
      expect.objectContaining({ botId: "bot_1", name: "Morning", prompt: "Check inbox" }),
    );

    rpc.mockResolvedValueOnce({ id: "rtn_1", botId: "bot_1", active: true });
    await updateBotRoutine("bot_1", { id: "rtn_1", botId: "bot_1" }, { active: true });
    expect(rpc).toHaveBeenCalledWith("routines/update", { routineId: "rtn_1", active: true });

    await expect(testBotRoutine("bot_2", { id: "rtn_1", botId: "bot_1" })).rejects.toThrow(
      /another bot/,
    );
  });
});
