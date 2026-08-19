/**
 * MeshVault desktop plugin host. Same contract as Hermes `createPluginContext`:
 * a plugin default-exports `{ id, register(ctx) }` and receives scoped storage.
 */

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { hermesBotsPlugin } from "./plugins/hermes-bots/plugin.js";
import type {
  HermesPlugin,
  PluginContext,
  PluginContribution,
  PluginStorage,
} from "./plugins/hermes-bots/types.js";

export type LoadedPlugin = {
  id: string;
  name: string;
  description?: string;
  kind: "bundled";
  status: "loaded" | "disabled" | "error";
  error?: string;
  contributions: PluginContribution[];
};

function memoryStorage(
  initial: Record<string, unknown> = {},
): PluginStorage & { snapshot: () => Record<string, unknown> } {
  const data = { ...initial };
  return {
    get(key, fallback) {
      return (Object.hasOwn(data, key) ? data[key] : fallback) as typeof fallback;
    },
    set(key, value) {
      data[key] = value;
    },
    remove(key) {
      delete data[key];
    },
    snapshot() {
      return { ...data };
    },
  };
}

export function createPluginStorage(initial?: Record<string, unknown>) {
  return memoryStorage(initial);
}

export function createPluginContext(
  pluginId: string,
  storage: PluginStorage,
  onDispose?: (dispose: () => void) => void,
): PluginContext & { contributions: PluginContribution[] } {
  const source = `plugin:${pluginId}`;
  const contributions: PluginContribution[] = [];
  const track = (dispose: () => void) => {
    onDispose?.(dispose);
    return dispose;
  };
  return {
    source,
    contributions,
    register(contribution) {
      const scoped = { ...contribution, id: `${pluginId}:${contribution.id}`, source };
      contributions.push(scoped);
      return track(() => {
        const index = contributions.indexOf(scoped);
        if (index >= 0) contributions.splice(index, 1);
      });
    },
    registerMany(items) {
      const disposers = items.map((item) => this.register(item));
      return track(() => {
        for (const dispose of disposers) dispose();
      });
    },
    onDispose(fn) {
      track(fn);
    },
    storage,
    os: {
      notify() {},
      async openExternal() {
        return false;
      },
      async revealPath() {
        return false;
      },
      async writeClipboard() {
        return false;
      },
    },
  };
}

export function bundledPlugins(): HermesPlugin[] {
  return [hermesBotsPlugin];
}

export function activateBundledPlugins(storageById: Record<string, PluginStorage> = {}) {
  const loaded: LoadedPlugin[] = [];
  for (const plugin of bundledPlugins()) {
    if (!plugin.id || typeof plugin.register !== "function") continue;
    const storage = storageById[plugin.id] ?? memoryStorage();
    const ctx = createPluginContext(plugin.id, storage);
    try {
      plugin.register(ctx);
      loaded.push({
        id: plugin.id,
        name: plugin.name ?? plugin.id,
        description: plugin.description,
        kind: "bundled",
        status: "loaded",
        contributions: ctx.contributions,
      });
    } catch (error) {
      loaded.push({
        id: plugin.id,
        name: plugin.name ?? plugin.id,
        description: plugin.description,
        kind: "bundled",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        contributions: [],
      });
    }
  }
  return loaded;
}

export async function readPluginStore(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("The Bot Mode store is invalid.");
  }
}

export async function writePluginStore(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try {
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
