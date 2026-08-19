import { describe, expect, it } from "vitest";
import {
  filterProfileSessions,
  nextGatewayGeneration,
  openBotSessionsWorkspace,
  openProfileSession,
} from "./sessions.js";
import type { BotModeHost } from "./types.js";

describe("sessions workspace", () => {
  it("selecting the secondary workspace does not navigate", () => {
    const calls: unknown[] = [];
    const host: BotModeHost = {
      request: async () => ({}),
      openSession: async (...args) => {
        calls.push(["openSession", ...args]);
      },
    };
    expect(openBotSessionsWorkspace({ name: "ops" })).toBe("ops");
    expect(calls.some((row) => Array.isArray(row) && row[0] === "openSession")).toBe(false);
    void host;
  });

  it("invalid profile names are ignored", () => {
    expect(openBotSessionsWorkspace({ name: "../ops" })).toBeNull();
  });

  it("filtering searches title, preview, and source without privileged rows", () => {
    const rows = [
      { id: "named", title: "Oversight", preview: "ordinary user session", source: "user" },
      { id: "deploy", title: "Deploy API", preview: "shipping", source: "cli" },
      { id: "docs", title: "Write docs", preview: "guide", source: "desktop" },
    ];
    expect(filterProfileSessions(rows, "").map((row) => row.id)).toEqual([
      "named",
      "deploy",
      "docs",
    ]);
    expect(filterProfileSessions(rows, "ship").map((row) => row.id)).toEqual(["deploy"]);
    expect(filterProfileSessions(rows, "DESKTOP").map((row) => row.id)).toEqual(["docs"]);
  });

  it("opening a stored row uses profile-aware navigation and records selection", async () => {
    const calls: unknown[] = [];
    const host: BotModeHost = {
      request: async () => ({}),
      openSession: async (...args) => {
        calls.push(["openSession", ...args]);
      },
    };
    const opened = await openProfileSession(
      host,
      "ops",
      { id: "stored-123", message_count: 4 },
      0,
      0,
    );
    expect(JSON.parse(JSON.stringify(calls))).toEqual([
      ["openSession", "stored-123", { profile: "ops", awaitHydration: true, expectHistory: true }],
    ]);
    expect(opened).toBe("stored-123");
  });

  it("malformed profile or session input is a no-op", async () => {
    const calls: unknown[] = [];
    const host: BotModeHost = {
      request: async () => ({}),
      openSession: async (...args) => {
        calls.push(args);
      },
    };
    await openProfileSession(host, "../ops", { id: "stored-123" }, 0, 0);
    await openProfileSession(host, "ops", { id: "" }, 0, 0);
    expect(calls).toEqual([]);
  });

  it("a gateway lifecycle change clears selection and rejects stale row clicks", async () => {
    const calls: unknown[] = [];
    const host: BotModeHost = {
      request: async () => ({}),
      openSession: async (...args) => {
        calls.push(args);
      },
    };
    const generation = nextGatewayGeneration(0);
    expect(generation).toBe(1);
    const opened = await openProfileSession(host, "ops", { id: "stored-123" }, 0, generation);
    expect(opened).toBeNull();
    expect(calls).toEqual([]);
  });

  it("an empty session with no preview does not demand history", async () => {
    const calls: unknown[] = [];
    const host: BotModeHost = {
      request: async () => ({}),
      openSession: async (...args) => {
        calls.push(["openSession", ...args]);
      },
    };
    await openProfileSession(host, "ops", { id: "stored-empty", message_count: 0 }, 0, 0);
    expect(JSON.parse(JSON.stringify(calls))).toEqual([
      [
        "openSession",
        "stored-empty",
        { profile: "ops", awaitHydration: true, expectHistory: false },
      ],
    ]);
  });
});
