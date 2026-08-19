/**
 * Canonical Bot Chat open/create path from Hermes Bot Mode.
 * Logic from NousResearch/hermes-agent hermes-bots/plugin.js. MIT © Nous Research.
 */

import {
  BOT_CHAT_TITLE,
  type BotModeHost,
  type PreferredSession,
  type SessionRow,
} from "./types.js";

export type CanonicalChatHooks = {
  host: BotModeHost;
  saveBotMeta: (name: string, patch: { chat: string | null }) => void | Promise<void>;
  delay?: (ms: number) => Promise<void>;
};

const canonicalCreations = new Map<string, Promise<string | null>>();

export function resetCanonicalCreations() {
  canonicalCreations.clear();
}

export async function openStoredBotChat(
  host: BotModeHost,
  name: string,
  storedId: string,
  summary?: { message_count?: number } | null,
) {
  if (!storedId || typeof host.openSession !== "function") {
    throw new Error("This Hermes Desktop version cannot open stored sessions");
  }
  const hasAuthoritativeCount =
    typeof summary?.message_count === "number" && Number.isFinite(summary.message_count);
  const expectHistory = hasAuthoritativeCount ? (summary.message_count ?? 0) > 0 : true;
  await host.openSession(storedId, {
    profile: name,
    intent: "main",
    awaitHydration: true,
    expectHistory,
  });
  return storedId;
}

export function createCanonicalChat(hooks: CanonicalChatHooks, name: string) {
  const inflight = canonicalCreations.get(name);
  if (inflight) return inflight;

  const run = (async () => {
    const res = (await hooks.host.request("session.create", {
      profile: name,
      title: BOT_CHAT_TITLE,
      hidden: true,
    })) as { stored_session_id?: string; session_id?: string } | undefined;
    const sid = res?.stored_session_id;
    const runtime = res?.session_id;
    if (sid) await hooks.saveBotMeta(name, { chat: sid });

    let opened = false;
    if (sid && typeof hooks.host.openSession === "function") {
      try {
        await hooks.host.openSession(sid, { profile: name, intent: "main" });
        opened = true;
      } catch {
        /* stored row may not exist until kickoff persists */
      }
    }

    if (runtime) {
      const wait =
        hooks.delay ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
      await wait(400);
      try {
        await hooks.host.request("prompt.submit", {
          session_id: runtime,
          text: "Hey, tell me about yourself!",
        });
        if (!opened && sid && typeof hooks.host.openSession === "function") {
          await hooks.host.openSession(sid, { profile: name, intent: "main" });
        }
      } catch {
        /* keep the pin so the next click opens instead of forking */
      }
    }

    return sid || null;
  })().finally(() => canonicalCreations.delete(name));

  canonicalCreations.set(name, run);
  return run;
}

export async function openBotCanonicalChat(
  hooks: CanonicalChatHooks,
  name: string,
  pinned: string | null | undefined,
  history: SessionRow | null | undefined,
) {
  const { host, saveBotMeta } = hooks;

  if (!pinned) {
    const adoptId = history?.id;
    if (adoptId && typeof host.openSession === "function") {
      await openStoredBotChat(host, name, adoptId, history);
      await saveBotMeta(name, { chat: adoptId });
      return adoptId;
    }
    return createCanonicalChat(hooks, name);
  }

  let preferred: PreferredSession | null | undefined;
  let lookupFailed = false;
  try {
    const res = (await host.request("profiles.list", {
      include_sessions: true,
      preferred_session_ids: { [name]: pinned },
    })) as { profiles?: Array<{ name?: string; preferred_session?: PreferredSession | null }> };
    const row = (res?.profiles ?? []).find((profile) => profile.name === name);
    preferred = row?.preferred_session;
    if (preferred === undefined) lookupFailed = true;
  } catch {
    lookupFailed = true;
  }

  if (lookupFailed) return openStoredBotChat(host, name, pinned, history);

  if (preferred) {
    await openStoredBotChat(host, name, preferred.resolved_id || preferred.id, preferred);
    return pinned;
  }

  const recoveryId = history?.id;
  if (recoveryId && typeof host.openSession === "function") {
    await openStoredBotChat(host, name, recoveryId, history);
    await saveBotMeta(name, { chat: recoveryId });
    return recoveryId;
  }
  await saveBotMeta(name, { chat: null });
  return createCanonicalChat(hooks, name);
}
