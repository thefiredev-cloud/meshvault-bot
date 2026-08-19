import { describe, expect, it } from "vitest";
import {
  evaluateSkillImprove,
  parseSkillMarkdown,
  reassembleSkill,
  SKILL_IMPROVE_MAX_BYTES,
} from "./skill-improve.js";

const original = `---
name: inbox
description: Summarize the inbox
---

Read the inbox and write a short briefing.
`;

describe("MIT skill-improve gates", () => {
  it("parses and reassembles a SKILL.md", () => {
    const parsed = parseSkillMarkdown(original);
    expect(parsed.name).toBe("inbox");
    expect(parsed.description).toBe("Summarize the inbox");
    expect(reassembleSkill(parsed.frontmatter, "Keep the briefing under one page.")).toContain(
      "name: inbox",
    );
  });

  it("accepts a same-purpose candidate under the 15KB cap", () => {
    const result = evaluateSkillImprove({
      original,
      candidate: `---
name: inbox
description: Summarize the inbox
---

Read the inbox. Summarize the inbox in five bullets.
`,
    });
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("rejects size, mid-conversation mutation, and purpose drift", () => {
    expect(
      evaluateSkillImprove({
        original,
        candidate: `${original}\n${"x".repeat(SKILL_IMPROVE_MAX_BYTES)}`,
      }).failures,
    ).toContain("size");
    expect(
      evaluateSkillImprove({
        original,
        candidate: original,
        midConversation: true,
      }).failures,
    ).toContain("mid-conversation");
    expect(
      evaluateSkillImprove({
        original,
        candidate: "---\nname: inbox\n---\n\nWrite poetry.\n",
        purpose: "Summarize the inbox",
      }).failures,
    ).toContain("purpose");
  });
});
