/**
 * Portable Hermes Bot Mode helpers.
 * Logic from NousResearch/hermes-agent apps/desktop/src/plugins/hermes-bots/plugin.js
 * (commit 395c70d616f6426e990632ff8b57cf1e9499702f). MIT © Nous Research.
 */

import {
  BOT_MODE_SWEEP_TITLES,
  type BotMeta,
  type BotMetaMap,
  HERMES_BOTS_ID,
  NAME_RE,
  type RosterBot,
} from "./types.js";

export function preferredSessionIds(allMeta: BotMetaMap | undefined | null) {
  const pins: Record<string, string> = {};
  for (const [name, meta] of Object.entries(allMeta || {})) {
    if (meta?.chat) pins[name] = meta.chat;
  }
  return pins;
}

export function botHandle(name: string | undefined, bot?: RosterBot | null) {
  if (bot?.handle && bot.handle !== name) return bot.handle;
  return (name || "").trim().toLowerCase() === "default" ? "hermes" : name;
}

export function botRosterKey(bot: RosterBot | null | undefined) {
  return `${bot?.connectionId || "legacy"}::${bot?.name || "default"}`;
}

export function botRosterMeta(bot: RosterBot | null | undefined, metaByName?: BotMetaMap | null) {
  return bot?.remoteSource ? null : (metaByName?.[bot?.name || ""] ?? undefined);
}

export function isBotHidden(bot: RosterBot, metaByName?: BotMetaMap | null) {
  return Boolean(botRosterMeta(bot, metaByName)?.hidden);
}

export function isBotModeSweepTitle(title: unknown) {
  const t = String(title || "").trim();
  return BOT_MODE_SWEEP_TITLES.has(t) || t.startsWith("Group: ");
}

export function displayName(bot: RosterBot, meta?: BotMeta | null) {
  if (
    bot?.remoteSource &&
    (bot.name || "").trim().toLowerCase() === "default" &&
    bot.connectionLabel
  ) {
    return bot.connectionLabel;
  }
  if (meta?.title?.trim()) return meta.title.trim();
  if (typeof bot?.display_name === "string" && bot.display_name.trim())
    return bot.display_name.trim();
  if ((bot.name || "").trim().toLowerCase() === "default" && !bot.title) return "Hermes";
  const raw = (bot.title || bot.name || "").replace(/[-_]+/g, " ").trim();
  return raw.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function filterBots(roster: RosterBot[], metaByName: BotMetaMap | undefined, query: string) {
  const needle = query.trim().toLowerCase().replace(/^@/, "");
  if (!needle) return roster;
  return roster.filter((bot) => {
    const display = displayName(bot, botRosterMeta(bot, metaByName)).toLowerCase();
    const profile = (bot.name || "").toLowerCase();
    const handle = String(botHandle(bot.name, bot) || "").toLowerCase();
    const sourceLabel = (bot.connectionLabel || "").toLowerCase();
    return (
      display.includes(needle) ||
      profile.includes(needle) ||
      handle.includes(needle) ||
      sourceLabel.includes(needle)
    );
  });
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function isValidBotName(name: string) {
  return NAME_RE.test(name);
}

export function stripPreviewMarkdown(text: unknown) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`\n]*)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|\s)[*_](\S(?:.*?\S)?)[*_](?=\s|$|[.,;:!?])/g, "$1$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function botGroups(meta?: BotMeta | null) {
  const groups: string[] = [];
  const seen = new Set<string>();
  const values = Array.isArray(meta?.groups) ? meta.groups : [meta?.group];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const group = value.trim();
    if (group && !seen.has(group)) {
      seen.add(group);
      groups.push(group);
    }
  }
  return groups;
}

export function groupMembershipPatch(meta: BotMeta | undefined, group: string, enabled: boolean) {
  const name = String(group || "").trim();
  let groups = botGroups(meta);
  if (enabled) {
    if (name && !groups.includes(name)) groups = [...groups, name];
  } else {
    groups = groups.filter((existing) => existing !== name);
  }
  return { groups, group: groups[0] || null };
}

export function knownGroups(metaByName?: BotMetaMap | null) {
  const names = new Set<string>();
  for (const meta of Object.values(metaByName || {})) {
    for (const group of botGroups(meta)) names.add(group);
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function groupChatNames(
  metaByName?: BotMetaMap | null,
  rooms?: Record<string, { members?: unknown[]; log?: unknown[] }>,
) {
  const names = new Set(knownGroups(metaByName));
  for (const [name, room] of Object.entries(rooms || {})) {
    if (
      (Array.isArray(room?.members) && room.members.length) ||
      (Array.isArray(room?.log) && room.log.length)
    ) {
      names.add(name);
    }
  }
  return [...names];
}

export function groupLastActivity(room?: { log?: Array<{ at?: number }> } | null) {
  const log = Array.isArray(room?.log) ? room.log : [];
  return log.length ? log[log.length - 1]?.at || 0 : 0;
}

export function groupMemberKey(member: RosterBot | null | undefined) {
  return member?.remoteSource ? botRosterKey(member) : member?.name;
}

export function groupChatMemberBots(
  group: string,
  roster: RosterBot[] | null | undefined,
  metaByName: BotMetaMap | undefined,
  rooms: Record<string, { members?: RosterBot[] }> = {},
) {
  const local = (roster || []).filter(
    (bot) => !bot.remoteSource && botGroups(botRosterMeta(bot, metaByName)).includes(group),
  );
  const stored = rooms[group]?.members || [];
  const seated = new Set(local.map(botRosterKey));
  const remote: RosterBot[] = [];
  for (const descriptor of stored) {
    const key = botRosterKey(descriptor);
    if (seated.has(key)) continue;
    seated.add(key);
    remote.push((roster || []).find((bot) => botRosterKey(bot) === key) || descriptor);
  }
  return [...local, ...remote];
}

export function durableGroupChatMembers(bots: RosterBot[] | null | undefined) {
  return (bots || []).map((bot) => ({
    name: bot.name,
    handle: bot.handle || bot.name,
    connectionId: bot.connectionId,
    connectionKind: bot.connectionKind,
    connectionLabel: bot.connectionLabel,
    remoteSource: true as const,
    sourceScoped: true as const,
  }));
}

export function isActiveRosterBot(
  bot: RosterBot,
  active: { name?: string; connectionId?: string } = {},
) {
  const activeName = String(active?.name || "default").trim() || "default";
  const activeId = String(active?.connectionId || "").trim();
  const botId = String(bot?.connectionId || "").trim();
  const botName = String(bot?.name || "").trim() || "default";
  if (bot?.remoteSource) return Boolean(activeId) && activeId === botId && botName === activeName;
  if (activeId && activeId !== "local" && botId && activeId !== botId) return false;
  return botName === activeName;
}

export function resolveRosterMentions(
  text: unknown,
  roster: RosterBot[] | null | undefined,
  active: { name?: string; connectionId?: string } = {},
) {
  const members = Array.isArray(roster) ? roster : [];
  const prose = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ");
  const byForm = new Map<string, RosterBot | null>();
  for (const bot of members) {
    if (!bot?.name || isActiveRosterBot(bot, active)) continue;
    const handle = String(botHandle(bot.name, bot) || "").toLowerCase();
    const name = String(bot.name || "").toLowerCase();
    const forms = new Set([handle, name]);
    if (bot.handle) forms.add(String(bot.handle).toLowerCase());
    for (const form of forms) {
      if (!form) continue;
      const existing = byForm.get(form);
      if (existing && existing !== bot) {
        byForm.set(form, null);
        continue;
      }
      if (!existing) byForm.set(form, bot);
    }
  }
  const mentioned: RosterBot[] = [];
  const seen = new Set<string>();
  for (const match of prose.matchAll(/(^|\s)@([a-z0-9][a-z0-9_-]*)/gi)) {
    let token = (match[2] || "").toLowerCase();
    if (token === "hermes") token = byForm.has("hermes") ? "hermes" : token;
    const bot = byForm.get(token);
    if (!bot) continue;
    const key = botRosterKey(bot);
    if (seen.has(key)) continue;
    seen.add(key);
    mentioned.push(bot);
  }
  return mentioned;
}

export function fallbackSelectionAfterHide(
  name: string,
  selected: string,
  roster: RosterBot[],
  meta: BotMetaMap,
) {
  if (selected !== name) return selected;
  const visible = roster.filter(
    (bot) => !bot.remoteSource && bot.name !== name && !meta[bot.name]?.hidden,
  );
  if (visible.length) return visible[0]!.name;
  if (name !== "default" && !meta.default?.hidden) return "default";
  return selected;
}

export function mergeServerMeta(local: BotMetaMap, roster: RosterBot[]) {
  let changed = false;
  const next = { ...local };
  for (const bot of roster) {
    const server = bot.ui_meta?.["hermes-bots"];
    if (!server || typeof server !== "object") continue;
    const mine = next[bot.name] || {};
    const merged: BotMeta = { ...mine, ...server };
    if (mine.image) merged.image = mine.image;
    if (Object.hasOwn(mine, "chat") && !Object.hasOwn(server, "chat")) delete merged.chat;
    if (
      Array.isArray(server.groups) &&
      Object.hasOwn(mine, "group") &&
      !Object.hasOwn(server, "group")
    ) {
      delete merged.group;
    }
    if (JSON.stringify(next[bot.name] || null) !== JSON.stringify(merged)) {
      next[bot.name] = merged;
      changed = true;
    }
  }
  return { next, changed };
}

const LIVE_CONNECTION_OMITTED = Symbol("live-connection-omitted");

export function mergeMultiSourceRoster(
  local: { profiles?: RosterBot[] } | null | undefined,
  union:
    | {
        agents?: Array<{
          profile?: string;
          handle?: string;
          connectionId?: string;
          connectionKind?: string;
          connectionLabel?: string;
        }>;
        primaryConnectionId?: string;
        sources?: Array<{ connectionId?: string; error?: string; reachable?: boolean }>;
      }
    | null
    | undefined,
  activeConnectionId:
    | string
    | null
    | undefined
    | typeof LIVE_CONNECTION_OMITTED = LIVE_CONNECTION_OMITTED,
  previous: RosterBot[] = [],
) {
  const localProfiles = Array.isArray(local?.profiles) ? local.profiles : [];
  const agents = Array.isArray(union?.agents) ? union.agents : [];
  const liveProvided = activeConnectionId !== LIVE_CONNECTION_OMITTED;
  const liveId = String((liveProvided ? activeConnectionId : "") || "").trim();
  let activeId = liveId || (liveProvided ? "" : String(union?.primaryConnectionId || "").trim());

  if (!activeId && liveProvided) {
    const primaryId = String(union?.primaryConnectionId || "").trim();
    const richNames = new Set(
      localProfiles.map((profile) => String(profile?.name || "").trim()).filter(Boolean),
    );
    const localMatches = agents.some(
      (agent) =>
        agent?.connectionKind === "local" && richNames.has(String(agent?.profile || "").trim()),
    );
    const primaryMatches = agents.some(
      (agent) =>
        String(agent?.connectionId || "").trim() === primaryId &&
        richNames.has(String(agent?.profile || "").trim()),
    );
    if (!localMatches && primaryId && primaryMatches) activeId = primaryId;
  }

  const activeByName = new Map<string, RosterBot>();
  for (const profile of localProfiles) {
    const name = String(profile?.name || "").trim();
    if (!name || profile?.remoteSource) continue;
    if (profile?.sourceScoped && activeId && profile.connectionId !== activeId) continue;
    if (!activeByName.has(name)) activeByName.set(name, { ...profile, name });
  }

  const profiles = [...activeByName.values()];
  const seenSources = new Set<string>();
  for (const agent of agents) {
    const profile = String(agent?.profile || "").trim();
    const connectionId = String(agent?.connectionId || "").trim();
    const sourceKey = `${connectionId}::${profile || "default"}`;
    if (!profile || seenSources.has(sourceKey)) continue;
    seenSources.add(sourceKey);
    const isActiveSource = activeId ? connectionId === activeId : agent.connectionKind === "local";
    const row = isActiveSource ? activeByName.get(profile) : null;
    if (row) {
      row.handle = agent.handle;
      row.connectionId = agent.connectionId;
      row.connectionKind = agent.connectionKind;
      row.connectionLabel = agent.connectionLabel;
      row.sourceScoped = true;
      continue;
    }
    if (isActiveSource) continue;
    profiles.push({
      name: profile,
      handle: agent.handle,
      connectionId,
      connectionKind: agent.connectionKind,
      connectionLabel: agent.connectionLabel,
      remoteSource: true,
      sourceScoped: true,
    });
  }

  if (Array.isArray(previous) && previous.length > 0) {
    const present = new Set(profiles.map((row) => `${row.connectionId || ""}::${row.name}`));
    const unionSourceIds = new Set(
      agents.map((agent) => String(agent?.connectionId || "").trim()).filter(Boolean),
    );
    const omitted = new Set(
      (Array.isArray(union?.sources) ? union.sources : [])
        .filter((source) => source?.error === "connect-on-demand" || source?.reachable === false)
        .map((source) => String(source.connectionId || "").trim())
        .filter(Boolean),
    );
    const registered = new Set(
      (Array.isArray(union?.sources) ? union.sources : [])
        .map((source) => String(source?.connectionId || "").trim())
        .filter(Boolean),
    );
    for (const row of previous) {
      const connectionId = String(row?.connectionId || "").trim();
      const name = String(row?.name || "").trim();
      const key = `${connectionId}::${name || "default"}`;
      if (!row?.remoteSource || !connectionId || !name || present.has(key)) continue;
      if (registered.size > 0 && !registered.has(connectionId)) continue;
      if (omitted.has(connectionId) || !unionSourceIds.has(connectionId)) {
        profiles.push({ ...row, remoteSource: true, sourceScoped: true });
        present.add(key);
      }
    }
  }

  return { ...local, profiles };
}

export function routineCreateTarget(owner: string | null | undefined, activeBot: string) {
  return owner || activeBot;
}

export function routineQueryKey(profile?: string | null) {
  return [HERMES_BOTS_ID, "routines", profile || ""] as const;
}

export function singleFlight<T>(ref: { current: Promise<T> | null }, start: () => T | Promise<T>) {
  if (ref.current) return ref.current;
  let flight: Promise<T>;
  try {
    flight = Promise.resolve(start());
  } catch (err) {
    flight = Promise.reject(err);
  }
  ref.current = flight;
  flight.catch(() => {
    if (ref.current === flight) ref.current = null;
  });
  return flight;
}

export function visibleRoster(
  roster: RosterBot[],
  metaByName: BotMetaMap | undefined,
  showHidden: boolean,
) {
  return showHidden ? roster : roster.filter((bot) => !isBotHidden(bot, metaByName));
}
