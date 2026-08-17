import { describe, expect, it } from "vitest";
import {
  limitCommandOutput,
  SANDBOX_COMMAND_MAX_OUTPUT_BYTES,
  SANDBOX_COMMAND_TIMEOUT_MS,
  sandboxCommandMaxOutputBytes,
  sandboxCommandTimeoutMs,
} from "./sandbox-policy.js";

describe("sandbox command policy", () => {
  it("does not let callers raise command limits", () => {
    expect(sandboxCommandTimeoutMs(Number.POSITIVE_INFINITY)).toBe(SANDBOX_COMMAND_TIMEOUT_MS);
    expect(sandboxCommandTimeoutMs(SANDBOX_COMMAND_TIMEOUT_MS + 1)).toBe(
      SANDBOX_COMMAND_TIMEOUT_MS,
    );
    expect(sandboxCommandMaxOutputBytes(SANDBOX_COMMAND_MAX_OUTPUT_BYTES + 1)).toBe(
      SANDBOX_COMMAND_MAX_OUTPUT_BYTES,
    );
  });

  it("keeps UTF-8 output and its diagnostic inside the byte limit", () => {
    const output = limitCommandOutput("🧠".repeat(200), "e".repeat(300), 512, "output stopped");
    expect(Buffer.byteLength(output.stdout) + Buffer.byteLength(output.stderr)).toBeLessThanOrEqual(
      512,
    );
    expect(output.stderr).toMatch(/output stopped/);
    expect(output.stdout).not.toContain("�");
  });
});
