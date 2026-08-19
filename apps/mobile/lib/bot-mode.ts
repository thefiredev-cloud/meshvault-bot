import {
  type BotModeIdentity,
  duplicateBotCreateInput,
  parseBotIdentityUpdate,
  parseHiddenBotIds,
  parseRoutineDraft,
  type RoutineDraft,
  routineOwnerError,
  toggleHiddenBotId,
} from "@meshbot/contracts";
import * as SecureStore from "expo-secure-store";
import { type MobileBot, rpc } from "./api";

const HIDDEN_KEY = "meshbot.hidden_bots";

export type MobileBotIdentity = MobileBot & {
  description: string;
  instructions: string;
  modelProvider: string | null;
  modelId: string | null;
  notifyOnFinish: boolean;
};

export type MobileRoutine = {
  id: string;
  botId: string;
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  active: boolean;
  notify: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
};

export type MobileCatalogModel = {
  provider: string;
  providerName?: string;
  id: string;
  label: string;
};

export function identityFromBot(bot: MobileBot): BotModeIdentity {
  return {
    name: bot.name,
    title: bot.title,
    description: bot.description ?? "",
    instructions: bot.instructions ?? bot.description ?? "",
  };
}

export function identityUpdateBody(
  botId: string,
  draft: BotModeIdentity & { modelProvider?: string | null; modelId?: string | null },
) {
  const parsed = parseBotIdentityUpdate(botId, draft);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Could not save identity",
    };
  }
  return { ok: true as const, body: parsed.data };
}

export function duplicateBotBody(source: MobileBotIdentity, roster: MobileBot[]) {
  return duplicateBotCreateInput(
    source,
    roster.map((bot) => bot.name),
  );
}

export function routineCreateBody(draft: RoutineDraft) {
  return parseRoutineDraft(draft);
}

export function assertRoutineOwner(routine: Pick<MobileRoutine, "botId">, botId: string) {
  return routineOwnerError(routine.botId, botId);
}

export async function loadHiddenBotIds() {
  try {
    return parseHiddenBotIds(await SecureStore.getItemAsync(HIDDEN_KEY));
  } catch {
    return [];
  }
}

export async function persistHiddenBotIds(ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))].sort();
  await SecureStore.setItemAsync(HIDDEN_KEY, JSON.stringify(unique));
  return unique;
}

export async function setBotHidden(botId: string, hiddenIds: string[]) {
  const next = toggleHiddenBotId(hiddenIds, botId);
  return { ...next, hiddenIds: await persistHiddenBotIds(next.hiddenIds) };
}

export async function fetchBotIdentity(botId: string) {
  return rpc<MobileBotIdentity>("bots/get", { botId });
}

export async function saveBotIdentity(
  botId: string,
  draft: BotModeIdentity & { modelProvider?: string | null; modelId?: string | null },
) {
  const parsed = identityUpdateBody(botId, draft);
  if (!parsed.ok) throw new Error(parsed.error);
  return rpc<MobileBotIdentity>("bots/update", parsed.body);
}

export async function duplicateRosterBot(source: MobileBotIdentity, roster: MobileBot[]) {
  const parsed = duplicateBotBody(source, roster);
  if (!parsed.ok) throw new Error(parsed.error);
  return rpc<MobileBotIdentity>("bots/create", parsed.input);
}

export async function removeRosterBot(botId: string) {
  return rpc<{ ok: true }>("bots/remove", { botId });
}

export async function listBotRoutines(botId: string) {
  return rpc<MobileRoutine[]>("routines/list", { botId });
}

export async function createBotRoutine(draft: RoutineDraft) {
  const parsed = routineCreateBody(draft);
  if (!parsed.ok) throw new Error(parsed.error);
  return rpc<MobileRoutine>("routines/create", parsed.input);
}

export async function updateBotRoutine(
  botId: string,
  routine: Pick<MobileRoutine, "id" | "botId">,
  patch: { active?: boolean; name?: string; prompt?: string; cron?: string },
) {
  const owner = assertRoutineOwner(routine, botId);
  if (owner) throw new Error(owner);
  return rpc<MobileRoutine>("routines/update", { routineId: routine.id, ...patch });
}

export async function removeBotRoutine(
  botId: string,
  routine: Pick<MobileRoutine, "id" | "botId">,
) {
  const owner = assertRoutineOwner(routine, botId);
  if (owner) throw new Error(owner);
  return rpc<{ ok: true }>("routines/remove", { routineId: routine.id });
}

export async function testBotRoutine(botId: string, routine: Pick<MobileRoutine, "id" | "botId">) {
  const owner = assertRoutineOwner(routine, botId);
  if (owner) throw new Error(owner);
  return rpc<{ runId: string }>("routines/testRun", { routineId: routine.id });
}

export async function listCatalogModels() {
  return rpc<MobileCatalogModel[]>("models/list");
}
