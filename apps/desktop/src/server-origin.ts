import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";

const DEVELOPMENT_ORIGIN = "http://127.0.0.1:5173";

function isLoopback(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host === "::1") return true;
  return isIP(host) === 4 && host.split(".")[0] === "127";
}

export function normalizeServerOrigin(value: string) {
  const candidate = value.trim();
  if (!candidate) throw new Error("Enter the Mesh Bot server address.");

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a complete server address, including https://.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The server address must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Do not put credentials in the server address.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Enter the server origin without a path, query, or fragment.");
  }
  if (url.protocol === "http:" && !isLoopback(url.hostname)) {
    throw new Error("HTTPS is required unless the server is on this computer.");
  }

  return url.origin;
}

export function resolveStartupOrigin(input: {
  override?: string;
  saved?: string;
  packaged: boolean;
}) {
  if (input.override?.trim()) return normalizeServerOrigin(input.override);
  if (input.saved) return normalizeServerOrigin(input.saved);
  return input.packaged ? undefined : DEVELOPMENT_ORIGIN;
}

export async function readSavedServerOrigin(file: string) {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as { origin?: unknown };
    if (typeof parsed.origin !== "string") throw new Error("missing origin");
    return normalizeServerOrigin(parsed.origin);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error("The saved server setting is invalid. Enter it again.");
  }
}

export async function saveServerOrigin(file: string, value: string) {
  const origin = normalizeServerOrigin(value);
  const temporary = `${file}.${process.pid}.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify({ origin })}\n`, { mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
  return origin;
}
