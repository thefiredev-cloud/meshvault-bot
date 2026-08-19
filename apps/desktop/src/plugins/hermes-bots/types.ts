/** Types for Hermes Bot Mode. Ported from NousResearch/hermes-agent hermes-bots. */

export const HERMES_BOTS_ID = "hermes-bots";
export const BOT_CHAT_TITLE = "Bot Chat";
export const PROFILE_SESSION_LIST_LIMIT = 200;
export const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const BOT_MODE_SWEEP_TITLES = new Set(["Bot Chat", "Agent Inbox"]);
export const ROUTINES_KEY = [HERMES_BOTS_ID, "routines"] as const;

export type BotMeta = {
  title?: string;
  hidden?: boolean;
  chat?: string | null;
  group?: string | null;
  groups?: string[];
  image?: string;
  pet?: unknown;
  shape?: string;
  color?: string;
};

export type BotMetaMap = Record<string, BotMeta>;

export type RosterBot = {
  name: string;
  title?: string;
  display_name?: string;
  handle?: string;
  connectionId?: string;
  connectionKind?: string;
  connectionLabel?: string;
  remoteSource?: boolean;
  sourceScoped?: boolean;
  last_session?: {
    id?: string;
    last_active?: number;
    preview?: string;
    message_count?: number;
  } | null;
  preferred_session?: PreferredSession | null;
  ui_meta?: Record<string, BotMeta | undefined>;
};

export type PreferredSession = {
  id: string;
  resolved_id?: string;
  title?: string;
  preview?: string;
  started_at?: number;
  last_active?: number;
  message_count?: number;
};

export type SessionRow = {
  id: string;
  title?: string;
  preview?: string;
  source?: string;
  message_count?: number;
};

export type GroupRoom = {
  log?: Array<{ from?: { kind?: string; name?: string }; text?: string; at?: number }>;
  members?: RosterBot[];
  sessions?: Record<string, string>;
};

export type OpenSessionOptions = {
  profile?: string;
  intent?: string;
  awaitHydration?: boolean;
  expectHistory?: boolean;
};

export type BotModeHost = {
  request: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  openSession?: (id: string, options?: OpenSessionOptions) => Promise<void>;
  notify?: (input: { kind?: string; title?: string; message?: string }) => void;
  notifyError?: (error: unknown, title?: string) => void;
};

export type PluginStorage = {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  remove(key: string): void;
};

export type PluginOs = {
  notify: (input: unknown) => void;
  openExternal: (url: string) => Promise<boolean>;
  revealPath: (path: string) => Promise<boolean>;
  writeClipboard: (text: string) => Promise<boolean>;
};

export type PluginContribution = {
  id: string;
  kind?: string;
  [key: string]: unknown;
};

export type PluginContext = {
  readonly source: string;
  register: (contribution: PluginContribution) => () => void;
  registerMany: (contributions: PluginContribution[]) => () => void;
  onDispose: (fn: () => void) => void;
  storage: PluginStorage;
  os: PluginOs;
};

export type HermesPlugin = {
  id: string;
  name?: string;
  description?: string;
  defaultEnabled?: boolean;
  register: (ctx: PluginContext) => void;
};
