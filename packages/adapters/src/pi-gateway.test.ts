import assert from "node:assert/strict";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { describe, it } from "vitest";
import { GATEWAY_PROVIDER_ID, gatewayConfigFromEnv, registerGateway } from "./pi-gateway.js";

describe("pi-gateway: MeshVault fleet gateway provider", () => {
  it("is unconfigured without a URL and registers nothing", () => {
    assert.equal(gatewayConfigFromEnv({}), null);
    assert.equal(gatewayConfigFromEnv({ MESHVAULT_GATEWAY_URL: "  " }), null);
    assert.equal(
      gatewayConfigFromEnv({
        MESHVAULT_GATEWAY_URL: "http://gw:4000",
        MESHVAULT_GATEWAY_MODELS: " , ",
      }),
      null,
    );
    const models = builtinModels();
    assert.equal(registerGateway(models, {}), null);
    assert.equal(models.getProvider(GATEWAY_PROVIDER_ID), undefined);
  });

  it("registers an OpenAI-completions provider with the env models", () => {
    const models = builtinModels();
    const config = registerGateway(models, {
      MESHVAULT_GATEWAY_URL: "http://100.119.150.81:4000/",
      MESHVAULT_GATEWAY_MODELS: "local-deepseek-flash, mesh-ai-light",
    });
    assert.deepEqual(config, {
      baseUrl: "http://100.119.150.81:4000",
      modelIds: ["local-deepseek-flash", "mesh-ai-light"],
    });
    const provider = models.getProvider(GATEWAY_PROVIDER_ID);
    assert.ok(provider, "gateway provider registered");
    const listed = models.getModels(GATEWAY_PROVIDER_ID);
    assert.equal(listed.length, 2);
    const first = listed[0];
    assert.ok(first);
    assert.equal(first.id, "local-deepseek-flash");
    assert.equal(first.api, "openai-completions");
    // Owned endpoint: the meter reads zero on purpose, there is no bill.
    assert.equal(first.cost.input, 0);
    assert.equal(first.cost.output, 0);
  });

  it("defaults to the cluster flash model when no list is given", () => {
    assert.deepEqual(gatewayConfigFromEnv({ MESHVAULT_GATEWAY_URL: "http://gw:4000" }), {
      baseUrl: "http://gw:4000",
      modelIds: ["local-deepseek-flash"],
    });
  });
});
