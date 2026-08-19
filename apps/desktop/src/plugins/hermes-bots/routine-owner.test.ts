import { describe, expect, it } from "vitest";
import { routineCreateTarget, routineQueryKey } from "./core.js";

describe("routine owner", () => {
  it("routine creation keeps its captured owner while another bot becomes active", () => {
    expect(routineCreateTarget("ops", "ops")).toBe("ops");
    expect(routineCreateTarget("ops", "default")).toBe("ops");
    expect(routineCreateTarget(null, "default")).toBe("default");
  });

  it("routine mutation invalidates only its immutable owner cache", () => {
    expect(routineQueryKey("ops")).toEqual(["hermes-bots", "routines", "ops"]);
  });
});
