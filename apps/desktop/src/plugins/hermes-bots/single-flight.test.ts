import { describe, expect, it } from "vitest";
import { singleFlight } from "./core.js";

describe("singleFlight", () => {
  it("concurrent callers share one in-flight profile creation", async () => {
    const ref: { current: Promise<string> | null } = { current: null };
    let calls = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const create = async () => {
      calls += 1;
      await pending;
      return "researcher";
    };
    const first = singleFlight(ref, create);
    const second = singleFlight(ref, create);
    expect(calls).toBe(1);
    expect(first).toBe(second);
    release();
    expect(await first).toBe("researcher");
    expect(ref.current).toBe(first);
  });

  it("a failed creation clears the flight so retry can succeed", async () => {
    const ref: { current: Promise<string> | null } = { current: null };
    let calls = 0;
    await expect(
      singleFlight(ref, async () => {
        calls += 1;
        throw new Error("gateway unavailable");
      }),
    ).rejects.toThrow(/gateway unavailable/);
    expect(ref.current).toBeNull();
    expect(
      await singleFlight(ref, async () => {
        calls += 1;
        return "researcher";
      }),
    ).toBe("researcher");
    expect(calls).toBe(2);
  });
});
