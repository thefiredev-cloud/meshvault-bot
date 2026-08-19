/**
 * Local Bot Mode runtime for MeshVault desktop.
 * Uses the ported Hermes Bot Mode helpers; persists roster and sessions in userData.
 */

import {
  activateBundledPlugins,
  createPluginStorage,
  readPluginStore,
  writePluginStore,
} from "./plugin-host.js";
import {
  openBotCanonicalChat,
  resetCanonicalCreations,
} from "./plugins/hermes-bots/canonical-chat.js";
import {
  displayName,
  fallbackSelectionAfterHide,
  filterBots,
  isValidBotName,
  slugify,
  stripPreviewMarkdown,
  visibleRoster,
} from "./plugins/hermes-bots/core.js";
import {
  filterProfileSessions,
  openBotSessionsWorkspace,
  openProfileSession,
} from "./plugins/hermes-bots/sessions.js";
import type {
  BotMeta,
  BotMetaMap,
  BotModeHost,
  RosterBot,
  SessionRow,
} from "./plugins/hermes-bots/types.js";
import { HERMES_BOTS_ID } from "./plugins/hermes-bots/types.js";

export type StoredSession = SessionRow & {
  profile: string;
  hidden?: boolean;
  last_active?: number;
  messages?: Array<{ role: string; text: string; at: number }>;
};

export type BotModeState = {
  bots: RosterBot[];
  meta: BotMetaMap;
  sessions: Record<string, StoredSession>;
  selectedBot: string;
  showHidden: boolean;
  query: string;
  sessionsWorkspace: string | null;
  selectedSessions: Record<string, string>;
  gatewayGeneration: number;
  pluginStorage: Record<string, unknown>;
};

const emptyState = (): BotModeState => ({
  bots: [{ name: "default", title: "Hermes" }],
  meta: {},
  sessions: {},
  selectedBot: "default",
  showHidden: false,
  query: "",
  sessionsWorkspace: null,
  selectedSessions: {},
  gatewayGeneration: 0,
  pluginStorage: {},
});

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBotModeRuntime(storeFile: string) {
  let state = emptyState();
  let loaded = false;
  const plugins = () => {
    const storage = createPluginStorage(state.pluginStorage);
    const records = activateBundledPlugins({ [HERMES_BOTS_ID]: storage });
    state.pluginStorage = storage.snapshot();
    return records;
  };

  async function persist() {
    await writePluginStore(storeFile, state);
  }

  async function ensureLoaded() {
    if (loaded) return;
    const raw = await readPluginStore(storeFile);
    if (raw && typeof raw === "object" && Array.isArray((raw as BotModeState).bots)) {
      state = { ...emptyState(), ...(raw as BotModeState) };
    }
    if (!state.bots.some((bot) => bot.name === "default")) {
      state.bots.unshift({ name: "default", title: "Hermes" });
    }
    loaded = true;
    plugins();
    resetCanonicalCreations();
  }

  function saveBotMeta(name: string, patch: Partial<BotMeta>) {
    state.meta = { ...state.meta, [name]: { ...state.meta[name], ...patch } };
  }

  function host(): BotModeHost {
    return {
      async request(method, params = {}) {
        if (method === "session.create") {
          const id = newId("chat");
          const runtime = newId("runtime");
          const profile = String(params.profile || "default");
          state.sessions[id] = {
            id,
            profile,
            title: String(params.title || "Bot Chat"),
            preview: "",
            source: "desktop",
            hidden: Boolean(params.hidden),
            last_active: Date.now(),
            message_count: 0,
            messages: [],
          };
          return { stored_session_id: id, session_id: runtime };
        }
        if (method === "profiles.list") {
          const pins = (params.preferred_session_ids || {}) as Record<string, string>;
          return {
            profiles: state.bots.map((bot) => {
              const pin = pins[bot.name];
              const session = pin ? state.sessions[pin] : undefined;
              return {
                ...bot,
                preferred_session: session
                  ? {
                      id: session.id,
                      resolved_id: session.id,
                      title: session.title,
                      preview: session.preview,
                      last_active: session.last_active,
                      message_count: session.message_count,
                    }
                  : pin
                    ? null
                    : undefined,
                ui_meta: { [HERMES_BOTS_ID]: state.meta[bot.name] },
              };
            }),
          };
        }
        if (method === "prompt.submit") {
          const runtimeOrStored = String(params.session_id || "");
          const session =
            state.sessions[runtimeOrStored] ||
            Object.values(state.sessions).find((row) => row.id === runtimeOrStored);
          if (session) {
            const text = String(params.text || "");
            session.messages = [
              ...(session.messages || []),
              { role: "user", text, at: Date.now() },
            ];
            session.preview = stripPreviewMarkdown(text);
            session.message_count = session.messages.length;
            session.last_active = Date.now();
          }
          return {};
        }
        if (method === "session.list") {
          const profile = String(params.profile || "");
          return {
            sessions: Object.values(state.sessions)
              .filter((row) => row.profile === profile)
              .sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
              .slice(0, Number(params.limit) || 200),
          };
        }
        return {};
      },
      async openSession(id) {
        if (!state.sessions[id]) throw new Error("session vanished");
      },
    };
  }

  function snapshot() {
    const roster = visibleRoster(state.bots, state.meta, state.showHidden);
    const filtered = filterBots(roster, state.meta, state.query);
    return {
      plugin: plugins()[0],
      selectedBot: state.selectedBot,
      showHidden: state.showHidden,
      query: state.query,
      hiddenCount: state.bots.filter((bot) => state.meta[bot.name]?.hidden).length,
      sessionsWorkspace: state.sessionsWorkspace,
      roster: filtered.map((bot) => {
        const meta = state.meta[bot.name] || {};
        const pin = meta.chat ? state.sessions[meta.chat] : undefined;
        return {
          name: bot.name,
          title: displayName(bot, meta),
          handle: bot.name === "default" ? "hermes" : bot.name,
          hidden: Boolean(meta.hidden),
          preview: pin?.preview || "",
          chat: meta.chat || null,
          groups: meta.groups || (meta.group ? [meta.group] : []),
        };
      }),
      sessions: state.sessionsWorkspace
        ? filterProfileSessions(
            Object.values(state.sessions).filter((row) => row.profile === state.sessionsWorkspace),
            "",
          )
        : [],
      messages: (() => {
        const pin = state.meta[state.selectedBot]?.chat;
        return pin ? state.sessions[pin]?.messages || [] : [];
      })(),
    };
  }

  return {
    async load() {
      await ensureLoaded();
      return snapshot();
    },
    async createBot(input: { name?: string; title?: string; description?: string }) {
      await ensureLoaded();
      const name = isValidBotName(input.name || "")
        ? input.name!
        : slugify(input.title || input.name || "");
      if (!isValidBotName(name)) throw new Error("Enter a bot name like researcher or ops.");
      if (state.bots.some((bot) => bot.name === name))
        throw new Error("A bot with that name already exists.");
      state.bots.push({ name, title: input.title || name });
      if (input.title || input.description) {
        saveBotMeta(name, { title: input.title || name });
      }
      state.selectedBot = name;
      await persist();
      return snapshot();
    },
    async hideBot(name: string, hidden: boolean) {
      await ensureLoaded();
      saveBotMeta(name, { hidden });
      state.selectedBot = fallbackSelectionAfterHide(
        name,
        state.selectedBot,
        state.bots,
        state.meta,
      );
      await persist();
      return snapshot();
    },
    async setQuery(query: string) {
      await ensureLoaded();
      state.query = query;
      return snapshot();
    },
    async setShowHidden(showHidden: boolean) {
      await ensureLoaded();
      state.showHidden = showHidden;
      return snapshot();
    },
    async openChat(name: string) {
      await ensureLoaded();
      if (!isValidBotName(name)) throw new Error("Unknown bot.");
      const bot = state.bots.find((row) => row.name === name);
      if (!bot) throw new Error("Unknown bot.");
      state.selectedBot = name;
      state.sessionsWorkspace = null;
      const pin = state.meta[name]?.chat || null;
      const history = bot.last_session?.id
        ? { id: bot.last_session.id, message_count: bot.last_session.message_count }
        : pin
          ? null
          : Object.values(state.sessions)
              .filter((row) => row.profile === name)
              .sort((a, b) => (b.last_active || 0) - (a.last_active || 0))[0] || null;
      await openBotCanonicalChat({ host: host(), saveBotMeta }, name, pin, history);
      await persist();
      return snapshot();
    },
    async sendMessage(text: string) {
      await ensureLoaded();
      const name = state.selectedBot;
      const pin = state.meta[name]?.chat;
      if (!pin || !state.sessions[pin]) await this.openChat(name);
      const chat = state.meta[name]?.chat;
      if (!chat || !state.sessions[chat]) throw new Error("Open a Bot Chat first.");
      const session = state.sessions[chat]!;
      const trimmed = text.trim();
      if (!trimmed) throw new Error("Enter a message.");
      session.messages = [
        ...(session.messages || []),
        { role: "user", text: trimmed, at: Date.now() },
      ];
      session.preview = stripPreviewMarkdown(trimmed);
      session.message_count = session.messages.length;
      session.last_active = Date.now();
      await persist();
      return snapshot();
    },
    async openSessions(name: string) {
      await ensureLoaded();
      state.sessionsWorkspace = openBotSessionsWorkspace({ name });
      await persist();
      return snapshot();
    },
    async openSession(botName: string, sessionId: string) {
      await ensureLoaded();
      const session = state.sessions[sessionId];
      const opened = await openProfileSession(
        host(),
        botName,
        session,
        state.gatewayGeneration,
        state.gatewayGeneration,
      );
      if (opened) {
        state.selectedBot = botName;
        state.selectedSessions = { ...state.selectedSessions, [botName]: opened };
        saveBotMeta(botName, { chat: opened });
      }
      await persist();
      return snapshot();
    },
    snapshot,
  };
}

export type BotModeRuntime = ReturnType<typeof createBotModeRuntime>;
