import { describe, expect, it } from "vitest";
import {
  createCanonicalChat,
  openBotCanonicalChat,
  resetCanonicalCreations,
} from "./canonical-chat.js";
import { preferredSessionIds } from "./core.js";
import type { BotModeHost } from "./types.js";

const HISTORY = {
  id: "hist-1",
  title: "Weekly review",
  preview: "history preview",
  last_active: 1000,
};

function loadOpenPath({
  openSession,
  request,
}: {
  openSession?: BotModeHost["openSession"];
  request: NonNullable<BotModeHost["request"]>;
}) {
  resetCanonicalCreations();
  const saved: Array<{ name: string; patch: { chat: string | null } }> = [];
  const requests: Array<{ method: string; params?: Record<string, unknown> }> = [];
  const host: BotModeHost = {
    openSession,
    request: async (method, params) => {
      requests.push({ method, params });
      return request(method, params);
    },
  };
  const hooks = {
    host,
    saveBotMeta: (name: string, patch: { chat: string | null }) => {
      saved.push({ name, patch: JSON.parse(JSON.stringify(patch)) });
    },
    delay: async () => undefined,
  };
  return {
    openBotCanonicalChat: (name: string, pinned: string | null, history: typeof HISTORY | null) =>
      openBotCanonicalChat(hooks, name, pinned, history),
    saved,
    requests,
  };
}

describe("canonical chat identity", () => {
  it("grandfather: no pin + history opens and pins THAT session, no new chat", async () => {
    const runtime = loadOpenPath({
      openSession: async () => undefined,
      request: async () => ({}),
    });
    const result = await runtime.openBotCanonicalChat("ops", null, HISTORY);
    expect(result).toBe("hist-1");
    expect(runtime.saved).toEqual([{ name: "ops", patch: { chat: "hist-1" } }]);
    expect(runtime.requests.some((row) => row.method === "session.create")).toBe(false);
  });

  it("grandfather: no pin + no history keeps the creation flow", async () => {
    const runtime = loadOpenPath({
      openSession: async () => undefined,
      request: async (method) =>
        method === "session.create"
          ? { stored_session_id: "stored-1", session_id: "runtime-1" }
          : {},
    });
    const result = await runtime.openBotCanonicalChat("ops", null, null);
    expect(result).toBe("stored-1");
    expect(runtime.requests.some((row) => row.method === "session.create")).toBe(true);
  });

  it("grandfather: adoption hydration failure surfaces without forking a replacement chat", async () => {
    const runtime = loadOpenPath({
      openSession: async (id) => {
        if (id === "hist-1") throw new Error("session vanished");
      },
      request: async (method) =>
        method === "session.create"
          ? { stored_session_id: "stored-2", session_id: "runtime-2" }
          : {},
    });
    await expect(runtime.openBotCanonicalChat("ops", null, HISTORY)).rejects.toThrow(
      /session vanished/,
    );
    expect(runtime.saved.some((row) => row.patch?.chat === "hist-1")).toBe(false);
    expect(runtime.requests.some((row) => row.method === "session.create")).toBe(false);
  });

  it("pin: preferred_session present opens the resolved session and keeps the pin", async () => {
    const opened: Array<{ id: string; options?: unknown }> = [];
    const runtime = loadOpenPath({
      openSession: async (id, options) => {
        opened.push({ id, options });
      },
      request: async (method) => {
        if (method === "profiles.list") {
          return {
            profiles: [
              {
                name: "ops",
                preferred_session: {
                  id: "pin-1",
                  resolved_id: "pin-1",
                  title: "Bot Chat",
                  preview: "latest",
                  started_at: 1,
                  last_active: 2,
                  message_count: 3,
                },
              },
            ],
          };
        }
        return {};
      },
    });
    const result = await runtime.openBotCanonicalChat("ops", "pin-1", HISTORY);
    expect(result).toBe("pin-1");
    expect(JSON.parse(JSON.stringify(opened))).toEqual([
      {
        id: "pin-1",
        options: { profile: "ops", intent: "main", awaitHydration: true, expectHistory: true },
      },
    ]);
    expect(runtime.saved).toHaveLength(0);
    expect(runtime.requests.some((row) => row.method === "session.create")).toBe(false);
    expect(runtime.requests.some((row) => row.method === "session.list")).toBe(false);
  });

  it("pin: compression-rotated pin opens the live tip, keeps the durable pin", async () => {
    const opened: string[] = [];
    const runtime = loadOpenPath({
      openSession: async (id) => {
        opened.push(id);
      },
      request: async (method) => {
        if (method === "profiles.list") {
          return {
            profiles: [
              {
                name: "ops",
                preferred_session: {
                  id: "root-1",
                  resolved_id: "tip-9",
                  title: "Bot Chat",
                  preview: "post-compression",
                  started_at: 1,
                  last_active: 9,
                  message_count: 42,
                },
              },
            ],
          };
        }
        return {};
      },
    });
    const result = await runtime.openBotCanonicalChat("ops", "root-1", HISTORY);
    expect(opened).toEqual(["tip-9"]);
    expect(result).toBe("root-1");
    expect(runtime.saved).toHaveLength(0);
  });

  it("pin: definitively gone pin re-pins to the previewed session, not rows[0]", async () => {
    const runtime = loadOpenPath({
      openSession: async () => undefined,
      request: async (method) => {
        if (method === "profiles.list")
          return { profiles: [{ name: "ops", preferred_session: null }] };
        return {};
      },
    });
    const result = await runtime.openBotCanonicalChat("ops", "dead-pin", HISTORY);
    expect(result).toBe("hist-1");
    expect(runtime.saved).toEqual([{ name: "ops", patch: { chat: "hist-1" } }]);
    expect(runtime.requests.some((row) => row.method === "session.create")).toBe(false);
  });

  it("pin: gone pin + no history clears the pin and creates", async () => {
    const runtime = loadOpenPath({
      openSession: async () => undefined,
      request: async (method) => {
        if (method === "profiles.list")
          return { profiles: [{ name: "ops", preferred_session: null }] };
        if (method === "session.create")
          return { stored_session_id: "stored-3", session_id: "runtime-3" };
        return {};
      },
    });
    const result = await runtime.openBotCanonicalChat("ops", "dead-pin", null);
    expect(result).toBe("stored-3");
    expect(runtime.saved).toEqual([
      { name: "ops", patch: { chat: null } },
      { name: "ops", patch: { chat: "stored-3" } },
    ]);
  });

  it("pin: precise hit but failed hydration keeps the pin and surfaces the failure", async () => {
    const runtime = loadOpenPath({
      openSession: async () => {
        throw new Error("socket hiccup");
      },
      request: async (method) => {
        if (method === "profiles.list") {
          return {
            profiles: [
              {
                name: "ops",
                preferred_session: {
                  id: "pin-1",
                  resolved_id: "pin-1",
                  title: "Bot Chat",
                  preview: "latest",
                  started_at: 1,
                  last_active: 2,
                  message_count: 3,
                },
              },
            ],
          };
        }
        return {};
      },
    });
    await expect(runtime.openBotCanonicalChat("ops", "pin-1", HISTORY)).rejects.toThrow(
      /socket hiccup/,
    );
    expect(runtime.saved).toHaveLength(0);
    expect(runtime.requests.some((row) => row.method === "session.create")).toBe(false);
  });

  it("transient: profiles.list failure keeps the pin when the direct open works", async () => {
    const runtime = loadOpenPath({
      openSession: async () => undefined,
      request: async (method) => {
        if (method === "profiles.list") throw new Error("gateway reconnecting");
        return {};
      },
    });
    const result = await runtime.openBotCanonicalChat("ops", "pin-1", HISTORY);
    expect(result).toBe("pin-1");
    expect(runtime.saved).toHaveLength(0);
    expect(runtime.requests.some((row) => row.method === "session.create")).toBe(false);
  });

  it("transient: profiles.list failure + failed direct open preserves pin and surfaces Retry", async () => {
    const runtime = loadOpenPath({
      openSession: async (id) => {
        if (id === "pin-1") throw new Error("resume rejected");
      },
      request: async (method) => {
        if (method === "profiles.list") throw new Error("gateway reconnecting");
        if (method === "session.create")
          return { stored_session_id: "stored-4", session_id: "runtime-4" };
        return {};
      },
    });
    await expect(runtime.openBotCanonicalChat("ops", "pin-1", HISTORY)).rejects.toThrow(
      /resume rejected/,
    );
    expect(runtime.saved).toEqual([]);
    expect(runtime.requests.some((row) => row.method === "session.create")).toBe(false);
  });

  it("preferredSessionIds: collects only live pins", () => {
    expect(
      preferredSessionIds({
        ops: { chat: "pin-1" },
        scribe: { chat: null },
        chef: { title: "Chef" },
      }),
    ).toEqual({
      ops: "pin-1",
    });
    expect(preferredSessionIds({})).toEqual({});
    expect(preferredSessionIds(undefined)).toEqual({});
  });

  it("createCanonicalChat single-flights concurrent opens", async () => {
    resetCanonicalCreations();
    let creates = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hooks = {
      host: {
        request: async (method: string) => {
          if (method === "session.create") {
            creates += 1;
            await pending;
            return { stored_session_id: "stored-1", session_id: "runtime-1" };
          }
          return {};
        },
        openSession: async () => undefined,
      },
      saveBotMeta: () => undefined,
      delay: async () => undefined,
    };
    const first = createCanonicalChat(hooks, "ops");
    const second = createCanonicalChat(hooks, "ops");
    expect(first).toBe(second);
    expect(creates).toBe(1);
    release();
    expect(await first).toBe("stored-1");
  });
});
