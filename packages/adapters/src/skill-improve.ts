import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** MIT skill-improve gates from Nous Research hermes-agent-self-evolution. */
export const SKILL_IMPROVE_MAX_BYTES = 15 * 1024;
export const TOOL_DESCRIPTION_MAX_CHARS = 500;

export type SkillDocument = {
  raw: string;
  frontmatter: string;
  body: string;
  name: string;
  description: string;
};

export function parseSkillMarkdown(raw: string): SkillDocument {
  let frontmatter = "";
  let body = raw;
  if (raw.trim().startsWith("---")) {
    const parts = raw.split("---", 3);
    if (parts.length >= 3) {
      frontmatter = parts[1]!.trim();
      body = parts[2]!.trim();
    }
  }
  let name = "";
  let description = "";
  for (const line of frontmatter.split("\n")) {
    const trimmed = line.trim();
    const colon = trimmed.indexOf(":");
    if (colon < 1) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key === "name") name = value;
    if (key === "description") description = value;
  }
  return { raw, frontmatter, body, name, description };
}

export function reassembleSkill(frontmatter: string, evolvedBody: string): string {
  if (!frontmatter.trim()) return evolvedBody.trimEnd() + "\n";
  return `---\n${frontmatter.trim()}\n---\n\n${evolvedBody.trim()}\n`;
}

export function findSkillMarkdown(skillsRoot: string, skillName: string): string | null {
  const stack = [skillsRoot];
  const fuzzy: string[] = [];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry !== "SKILL.md") continue;
      if (path.basename(dir) === skillName) return full;
      try {
        const head = readFileSync(full, "utf8").slice(0, 500);
        if (head.includes(`name: ${skillName}`) || head.includes(`name: "${skillName}"`)) {
          fuzzy.push(full);
        }
      } catch {
        continue;
      }
    }
  }
  return fuzzy[0] ?? null;
}

export type SkillImproveInput = {
  original: string;
  candidate: string;
  purpose?: string;
  midConversation?: boolean;
};

export type SkillImproveResult = {
  ok: boolean;
  failures: string[];
  candidate: SkillDocument;
};

export function evaluateSkillImprove(input: SkillImproveInput): SkillImproveResult {
  const failures: string[] = [];
  const candidate = parseSkillMarkdown(input.candidate);
  const original = parseSkillMarkdown(input.original);

  if (!input.candidate.trim()) failures.push("empty");
  if (Buffer.byteLength(input.candidate, "utf8") > SKILL_IMPROVE_MAX_BYTES) {
    failures.push("size");
  }
  if (input.midConversation) failures.push("mid-conversation");
  const purpose = (input.purpose ?? original.description || original.name).trim();
  if (purpose && !input.candidate.toLowerCase().includes(purpose.toLowerCase())) {
    failures.push("purpose");
  }
  if (original.name && candidate.name && original.name !== candidate.name) {
    failures.push("name");
  }

  return { ok: failures.length === 0, failures, candidate };
}
