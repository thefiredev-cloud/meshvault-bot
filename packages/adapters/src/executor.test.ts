import { describe, expect, it } from "vitest";
import { requireBotModelAccess, resolveBotModelSelection } from "./executor.js";

const none = { modelProvider: null, modelId: null };
const knownModels = new Set([
  "xai/grok-4",
  "anthropic/claude-sonnet",
  "qwen/qwen-plus",
  "openrouter/openrouter/auto",
  "scripted/scripted",
]);
const isKnown = ({ provider, id }: { provider: string; id: string }) =>
  knownModels.has(`${provider}/${id}`);

describe("bot model dispatch", () => {
  it.each([
    [
      "resumed run",
      { modelProvider: "xai", modelId: "grok-4" },
      { modelProvider: "anthropic", modelId: "claude-sonnet" },
      { provider: "qwen", defaultModel: "qwen-plus" },
      { defaultModelProvider: "openrouter", defaultModelId: "openrouter/auto" },
      { provider: "xai", id: "grok-4" },
    ],
    [
      "bot",
      none,
      { modelProvider: "anthropic", modelId: "claude-sonnet" },
      { provider: "qwen", defaultModel: "qwen-plus" },
      null,
      { provider: "anthropic", id: "claude-sonnet" },
    ],
    [
      "workspace default",
      none,
      none,
      { provider: "qwen", defaultModel: "qwen-plus" },
      { defaultModelProvider: "openrouter", defaultModelId: "openrouter/auto" },
      { provider: "qwen", id: "qwen-plus" },
    ],
    [
      "deployment default",
      none,
      none,
      null,
      { defaultModelProvider: "openrouter", defaultModelId: "openrouter/auto" },
      { provider: "openrouter", id: "openrouter/auto" },
    ],
    ["scripted fallback", none, none, null, null, { provider: "scripted", id: "scripted" }],
  ])("uses the exact %s selection", (_source, run, bot, workspace, deployment, expected) => {
    expect(resolveBotModelSelection(run, bot, workspace, deployment, isKnown)).toEqual(expected);
  });

  it("keeps two bots on different providers", () => {
    const workspace = { provider: "qwen", defaultModel: "qwen-plus" };
    expect(
      [
        { modelProvider: "anthropic", modelId: "claude-sonnet" },
        { modelProvider: "xai", modelId: "grok-4" },
      ].map((bot) => resolveBotModelSelection(none, bot, workspace, null, isKnown)),
    ).toEqual([
      { provider: "anthropic", id: "claude-sonnet" },
      { provider: "xai", id: "grok-4" },
    ]);
  });

  it("rejects an unverified model pair restored from a run", () => {
    expect(() =>
      resolveBotModelSelection(
        { modelProvider: "xai", modelId: "not-a-real-model" },
        none,
        null,
        null,
        isKnown,
      ),
    ).toThrow(/Unknown model xai\/not-a-real-model/);
  });

  it("rejects an incomplete persisted model pair", () => {
    expect(() =>
      resolveBotModelSelection({ modelProvider: "xai", modelId: null }, none, null, null, isKnown),
    ).toThrow(/Incomplete resumed run model selection/);
  });

  it("fails closed without a workspace credential or exact-provider ambient auth", async () => {
    const selection = { provider: "anthropic", id: "claude-sonnet" };
    await expect(
      requireBotModelAccess(selection, {
        scriptedRuntime: false,
        credentialPresent: false,
        hasAmbientAuth: async () => false,
      }),
    ).rejects.toThrow(/No workspace credential or configured provider authentication/);
    await expect(
      requireBotModelAccess(selection, {
        scriptedRuntime: false,
        credentialPresent: false,
        hasAmbientAuth: async (provider) => provider === "anthropic",
      }),
    ).resolves.toBeUndefined();
  });

  it("allows scripted selection only in the scripted runtime", async () => {
    await expect(
      requireBotModelAccess(
        { provider: "scripted", id: "scripted" },
        { scriptedRuntime: false, credentialPresent: false },
      ),
    ).rejects.toThrow(/Choose a model/);
    await expect(
      requireBotModelAccess(
        { provider: "scripted", id: "scripted" },
        { scriptedRuntime: true, credentialPresent: false },
      ),
    ).resolves.toBeUndefined();
  });

  it("does not borrow ambient auth after an unusable stored credential", async () => {
    let ambientChecked = false;
    await expect(
      requireBotModelAccess(
        { provider: "qwen", id: "qwen-plus" },
        {
          scriptedRuntime: false,
          credentialPresent: true,
          apiKey: " ",
          hasAmbientAuth: async () => {
            ambientChecked = true;
            return true;
          },
        },
      ),
    ).rejects.toThrow(/No workspace credential/);
    expect(ambientChecked).toBe(false);
  });
});
