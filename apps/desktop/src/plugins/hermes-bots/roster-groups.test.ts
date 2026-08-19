import { describe, expect, it } from "vitest";
import {
  botGroups,
  durableGroupChatMembers,
  groupChatMemberBots,
  groupChatNames,
  groupLastActivity,
  groupMembershipPatch,
  knownGroups,
  stripPreviewMarkdown,
} from "./core.js";

describe("roster groups", () => {
  it("botGroups: normalizes canonical and legacy membership without duplicates", () => {
    expect(
      botGroups({
        groups: [
          " Engineering ",
          "",
          "Research",
          "Engineering",
          null as never,
          7 as never,
          { name: "Nope" } as never,
        ],
        group: "Operations",
      }),
    ).toEqual(["Engineering", "Research"]);
    expect(botGroups({ group: "Legacy" })).toEqual(["Legacy"]);
    expect(botGroups({ groups: [] })).toEqual([]);
  });

  it("groupMembershipPatch: toggles one membership and keeps the legacy projection compatible", () => {
    const meta = { groups: ["Engineering", "Research"], group: "Engineering" };
    expect(groupMembershipPatch(meta, "Engineering", true)).toEqual({
      groups: ["Engineering", "Research"],
      group: "Engineering",
    });
    expect(groupMembershipPatch(meta, "Operations", true)).toEqual({
      groups: ["Engineering", "Research", "Operations"],
      group: "Engineering",
    });
    expect(groupMembershipPatch(meta, "Engineering", false)).toEqual({
      groups: ["Research"],
      group: "Research",
    });
    expect(groupMembershipPatch({ group: "Legacy" }, "Legacy", false)).toEqual({
      groups: [],
      group: null,
    });
  });

  it("groupChatNames: unions bot-meta groups with room records that carry members or log", () => {
    const meta = {
      researcher: { group: "Research" },
      pm: { groups: ["Ops", "Research"], group: "Ops" },
      scout: { groups: ["External"], group: "Stale" },
    };
    const rooms = {
      Research: { log: [], members: [] },
      Remote: { log: [], members: [{ name: "spark", remoteSource: true }] },
      Chatty: { log: [{ from: { kind: "user" }, text: "hi", at: 5 }] },
      Empty: { log: [], members: [] },
    };
    expect([...groupChatNames(meta, rooms)].sort()).toEqual([
      "Chatty",
      "External",
      "Ops",
      "Remote",
      "Research",
    ]);
  });

  it("groupLastActivity: newest room-log timestamp, 0 for silence", () => {
    expect(groupLastActivity({ log: [{ at: 3 }, { at: 9 }] })).toBe(9);
    expect(groupLastActivity({ log: [] })).toBe(0);
    expect(groupLastActivity(undefined)).toBe(0);
  });

  it("groupChatMemberBots: seats local meta members plus stored remote descriptors, preferring live rows", () => {
    const roster = [
      { name: "researcher" },
      { name: "builder" },
      { name: "spark", remoteSource: true, connectionId: "c1", sourceScoped: true },
    ];
    const members = groupChatMemberBots(
      "Research",
      roster,
      {
        researcher: { group: "Research" },
        builder: { groups: ["Ops", "Research"], group: "Ops" },
      },
      {
        Research: {
          log: [],
          members: [{ name: "spark", remoteSource: true, connectionId: "c1", sourceScoped: true }],
        },
      },
    );
    expect(members.map((row) => row.name)).toEqual(["researcher", "builder", "spark"]);
    expect(members[2]).toBe(roster[2]);
  });

  it("durableGroupChatMembers: retains active and remote source identities", () => {
    const members = durableGroupChatMembers([
      {
        name: "default",
        handle: "noah",
        connectionId: "noah",
        connectionKind: "remote",
        connectionLabel: "Noah",
      },
      {
        name: "default",
        handle: "maya",
        connectionId: "maya",
        connectionKind: "remote",
        connectionLabel: "Maya",
        remoteSource: true,
      },
    ]);
    expect(JSON.parse(JSON.stringify(members))).toEqual([
      {
        name: "default",
        handle: "noah",
        connectionId: "noah",
        connectionKind: "remote",
        connectionLabel: "Noah",
        remoteSource: true,
        sourceScoped: true,
      },
      {
        name: "default",
        handle: "maya",
        connectionId: "maya",
        connectionKind: "remote",
        connectionLabel: "Maya",
        remoteSource: true,
        sourceScoped: true,
      },
    ]);
  });

  it("knownGroups: unique, trimmed, alphabetical", () => {
    expect(
      knownGroups({
        a: { group: "research" },
        b: { groups: ["Ops", "research"], group: "Ops" },
        c: { groups: ["Design"] },
        d: { group: "" },
        e: {},
      }),
    ).toEqual(["Design", "Ops", "research"]);
  });

  it("stripPreviewMarkdown: flattens bold, quotes, code, and links out of previews", () => {
    expect(stripPreviewMarkdown("**Plan**: ship the `thing`")).toBe("Plan: ship the thing");
    expect(stripPreviewMarkdown("> quoted wisdom")).toBe("quoted wisdom");
    expect(stripPreviewMarkdown("see [the doc](https://x.y/z) now")).toBe("see the doc now");
    expect(stripPreviewMarkdown("## Heading\nbody")).toBe("Heading body");
    expect(stripPreviewMarkdown("")).toBe("");
  });
});
