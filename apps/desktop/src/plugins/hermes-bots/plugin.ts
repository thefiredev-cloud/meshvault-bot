/**
 * Hermes Bot Mode plugin for MeshVault desktop.
 * Contract and behavior from NousResearch/hermes-agent hermes-bots. MIT © Nous Research.
 */

import { HERMES_BOTS_ID, type HermesPlugin, type PluginContext } from "./types.js";

export const hermesBotsPlugin: HermesPlugin = {
  id: HERMES_BOTS_ID,
  name: "Hermes Bot Mode",
  description:
    "A roster of named bots with their own canonical chats, avatars, routines, and bot-to-bot messaging.",
  defaultEnabled: true,
  register(ctx: PluginContext) {
    ctx.register({
      id: "roster",
      kind: "pane",
      title: "Bots",
      area: "bots",
    });
    ctx.register({
      id: "routines",
      kind: "pane",
      title: "Routines",
      area: "routines",
    });
    const activityToasts = ctx.storage.get("activity-toasts", false);
    if (typeof activityToasts !== "boolean") ctx.storage.set("activity-toasts", false);
  },
};

export default hermesBotsPlugin;
