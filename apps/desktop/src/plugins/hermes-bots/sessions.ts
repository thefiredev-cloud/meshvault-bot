/**
 * Profile session workspace from Hermes Bot Mode.
 * Logic from NousResearch/hermes-agent hermes-bots/plugin.js. MIT © Nous Research.
 */

import { type BotModeHost, NAME_RE, type SessionRow } from "./types.js";

export function openBotSessionsWorkspace(bot: { name?: string } | null | undefined) {
  if (bot?.name && NAME_RE.test(bot.name)) return bot.name;
  return null;
}

export function filterProfileSessions(sessions: SessionRow[] | null | undefined, query: unknown) {
  const needle = String(query || "")
    .trim()
    .toLowerCase();
  const rows = Array.isArray(sessions) ? sessions : [];
  if (!needle) return rows;
  return rows.filter((session) =>
    `${session?.title || ""} ${session?.preview || ""} ${session?.source || ""}`
      .toLowerCase()
      .includes(needle),
  );
}

export async function openProfileSession(
  host: BotModeHost,
  botName: string,
  session: SessionRow | null | undefined,
  gatewayGeneration: number,
  currentGeneration: number,
) {
  const profile = String(botName || "");
  const id = String(session?.id || "");
  if (!NAME_RE.test(profile) || !id || gatewayGeneration !== currentGeneration) return null;
  if (typeof host.openSession !== "function") {
    throw new Error("This Hermes Desktop version cannot open stored sessions");
  }
  const hasAuthoritativeCount =
    typeof session?.message_count === "number" && Number.isFinite(session.message_count);
  const expectHistory = hasAuthoritativeCount
    ? (session.message_count ?? 0) > 0
    : Boolean(session?.preview);
  await host.openSession(id, { profile, awaitHydration: true, expectHistory });
  if (gatewayGeneration !== currentGeneration) return null;
  return id;
}

export function nextGatewayGeneration(current: number) {
  return current + 1;
}
