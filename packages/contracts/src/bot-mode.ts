import { CreateBotInput, CreateRoutineInput, UpdateBotInput } from "./domain.js";

export type BotModeIdentity = {
  name: string;
  title: string;
  description: string;
  instructions: string;
};

export type RosterBot = {
  id: string;
  name: string;
  title?: string;
  preview?: string;
};

export type RoutineDraft = {
  botId: string;
  name: string;
  prompt: string;
  cron: string;
  timezone?: string;
  notify?: boolean;
  active?: boolean;
};

export const ROUTINE_PRESETS = [
  { id: "daily", label: "Every day", cron: "0 9 * * *" },
  { id: "weekdays", label: "Weekdays", cron: "0 9 * * 1-5" },
  { id: "hourly", label: "Every hour", cron: "0 * * * *" },
  { id: "weekly", label: "Every week", cron: "0 9 * * 1" },
] as const;

export function slugifyBotName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function botHandle(name: string) {
  const slug = slugifyBotName(name);
  return slug ? `@${slug}` : "";
}

export function botDisplayName(bot: { name: string; title?: string | null }) {
  const title = bot.title?.trim();
  if (title) return title;
  const raw = (bot.name || "").replace(/[-_]+/g, " ").trim();
  return raw || "Bot";
}

export function botIdentitySummary(identity: BotModeIdentity) {
  return [identity.name.trim(), identity.title.trim(), identity.description.trim()]
    .filter(Boolean)
    .join(" — ");
}

export function nextDuplicateBotName(base: string, taken: Iterable<string>, maxLength = 80) {
  const used = new Set(taken);
  const source = base.trim();
  if (!source) return null;
  for (let n = 2; n < 100; n += 1) {
    const suffix = `-${n}`;
    const candidate = source.slice(0, Math.max(1, maxLength - suffix.length)) + suffix;
    if (!used.has(candidate)) return candidate;
  }
  return null;
}

export function parseBotIdentityDraft(draft: BotModeIdentity) {
  return CreateBotInput.safeParse({
    name: draft.name.trim(),
    title: draft.title,
    description: draft.description,
    instructions: draft.instructions || draft.description,
  });
}

export function parseBotIdentityUpdate(
  botId: string,
  draft: BotModeIdentity & { modelProvider?: string | null; modelId?: string | null },
) {
  return UpdateBotInput.safeParse({
    botId,
    name: draft.name.trim(),
    title: draft.title,
    description: draft.description,
    instructions: draft.instructions,
    modelProvider: draft.modelProvider,
    modelId: draft.modelId,
  });
}

export function duplicateBotCreateInput(
  source: BotModeIdentity & {
    color?: string;
    notifyOnFinish?: boolean;
    modelProvider?: string | null;
    modelId?: string | null;
  },
  takenNames: Iterable<string>,
) {
  const name = nextDuplicateBotName(source.name, takenNames);
  if (!name) return { ok: false as const, error: "No free name for the duplicate." };
  const parsed = CreateBotInput.safeParse({
    name,
    title: source.title.trim() ? `${source.title.trim()} (copy)` : "",
    description: source.description,
    instructions: source.instructions || source.description,
    notifyOnFinish: source.notifyOnFinish ?? true,
    color: source.color,
    modelProvider: source.modelProvider,
    modelId: source.modelId,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Could not duplicate bot",
    };
  }
  return { ok: true as const, input: parsed.data };
}

export function filterRoster<T extends RosterBot>(bots: T[], query: string): T[] {
  const needle = query.trim().toLowerCase().replace(/^@/, "");
  if (!needle) return bots;
  return bots.filter((bot) => {
    const display = botDisplayName(bot).toLowerCase();
    const name = bot.name.toLowerCase();
    const handle = slugifyBotName(bot.name);
    const preview = (bot.preview ?? "").toLowerCase();
    return (
      display.includes(needle) ||
      name.includes(needle) ||
      handle.includes(needle) ||
      preview.includes(needle)
    );
  });
}

export function parseHiddenBotIds(raw: string | null | undefined) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0)),
    ];
  } catch {
    return [];
  }
}

export function toggleHiddenBotId(hiddenIds: Iterable<string>, botId: string) {
  const next = new Set(hiddenIds);
  const hidden = !next.has(botId);
  if (hidden) next.add(botId);
  else next.delete(botId);
  return { hiddenIds: [...next], hidden };
}

export function rosterForDisplay<T extends { id: string }>(
  bots: T[],
  hiddenIds: Iterable<string>,
  showHidden: boolean,
) {
  if (showHidden) return bots;
  const hidden = new Set(hiddenIds);
  return bots.filter((bot) => !hidden.has(bot.id));
}

export function routineInputError(name: string, prompt: string) {
  if (name.includes("\0")) return "Routine name cannot contain NUL.";
  if (prompt.includes("\0")) return "Routine prompt cannot contain NUL.";
  if (!name.trim()) return "Routine name is required.";
  if (!prompt.trim()) return "Routine prompt cannot be empty.";
  return null;
}

export function routineOwnerError(routineBotId: string, selectedBotId: string) {
  if (routineBotId !== selectedBotId) return "This routine belongs to another bot.";
  return null;
}

export function parseRoutineDraft(draft: RoutineDraft) {
  const inputError = routineInputError(draft.name, draft.prompt);
  if (inputError) return { ok: false as const, error: inputError };
  const parsed = CreateRoutineInput.safeParse({
    botId: draft.botId,
    name: draft.name.trim(),
    prompt: draft.prompt.trim(),
    cron: draft.cron.trim(),
    timezone: draft.timezone ?? "UTC",
    notify: draft.notify ?? true,
    active: draft.active ?? false,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Could not save routine",
    };
  }
  return { ok: true as const, input: parsed.data };
}

export function routinePresetCron(id: string) {
  return ROUTINE_PRESETS.find((preset) => preset.id === id)?.cron ?? ROUTINE_PRESETS[0].cron;
}

export const BOT_CHAT_TITLE = "Bot Chat";

export function hermesProfileSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "bot"
  );
}

export function botToBotMessage(senderName: string, text: string): string {
  const handle = hermesProfileSlug(senderName);
  return `Message from 🤖 ${senderName.trim()} (@${handle}): ${text.trim()}`;
}

export function parseBotToBotMessage(
  value: string,
): { senderName: string; handle: string; text: string } | null {
  const match = /^Message from 🤖\s+(.+?)\s+\(@([^)]+)\):\s*([\s\S]+)$/u.exec(value.trim());
  if (!match) return null;
  return { senderName: match[1]!, handle: match[2]!, text: match[3]!.trim() };
}

export function parseBotMention(text: string): { handle: string; rest: string } | null {
  const match = /^@([A-Za-z0-9][A-Za-z0-9_-]{0,39})\s+([\s\S]+)$/.exec(text.trim());
  if (!match) return null;
  return { handle: match[1]!, rest: match[2]!.trim() };
}

export function routineNamespace(botName: string, routineName: string): string {
  return `[bot:${hermesProfileSlug(botName)}] ${routineName.trim()}`;
}

export function matchPeerBots<T extends { id: string; name: string }>(peers: T[], to: string): T[] {
  const wanted = to.trim();
  const slug = hermesProfileSlug(wanted);
  return peers.filter((bot) => bot.name === wanted || hermesProfileSlug(bot.name) === slug);
}
