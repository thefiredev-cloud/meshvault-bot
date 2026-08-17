// Commands must stop before a run lease can expire and must not exhaust worker memory with output.
export const SANDBOX_COMMAND_TIMEOUT_MS = 4 * 60_000;
export const SANDBOX_COMMAND_MAX_OUTPUT_BYTES = 256 * 1024;
export const SANDBOX_CONTAINER_PID_LIMIT = 256;

export function sandboxCommandTimeoutMs(requested?: number) {
  return boundedInteger(requested, SANDBOX_COMMAND_TIMEOUT_MS, 1);
}

export function sandboxCommandMaxOutputBytes(requested?: number) {
  return boundedInteger(requested, SANDBOX_COMMAND_MAX_OUTPUT_BYTES, 64);
}

export function limitCommandOutput(
  stdout: string,
  stderr: string,
  maxBytes: number,
  diagnostic = "",
) {
  const limit = Math.max(0, Math.floor(maxBytes));
  const note = takeUtf8(diagnostic, limit);
  const separator = note.text && stderr && note.bytes < limit ? "\n" : "";
  let remaining = limit - note.bytes - (separator ? 1 : 0);
  const out = takeUtf8(stdout, remaining);
  remaining -= out.bytes;
  const err = takeUtf8(stderr, remaining);
  return {
    stdout: out.text,
    stderr: err.text ? `${err.text}${separator}${note.text}` : note.text,
  };
}

function boundedInteger(requested: number | undefined, ceiling: number, floor: number) {
  if (!Number.isFinite(requested)) return ceiling;
  return Math.min(ceiling, Math.max(floor, Math.floor(requested!)));
}

function takeUtf8(value: string, budget: number) {
  const characters: string[] = [];
  let bytes = 0;
  for (const character of value) {
    const size = new TextEncoder().encode(character).byteLength;
    if (bytes + size > budget) break;
    characters.push(character);
    bytes += size;
  }
  return { text: characters.join(""), bytes };
}
