/**
 * Fail-closed action policy. Same outcome as OpenBot CEL: deny before allow,
 * missing or empty policy permits nothing, a broken deny refuses, a broken
 * allow does not permit.
 */

export type PolicyMode = "dry-run" | "enforce";

export type ActionPolicy = {
  mode: PolicyMode;
  deny: string[];
  allow: string[];
};

/** Shipped default. The engine is fail-closed; this explicit allow is what existing bots run under. */
export const DEFAULT_ACTION_POLICY: ActionPolicy = {
  mode: "enforce",
  deny: [],
  allow: ["true"],
};

export const TAKE_THE_WHEEL_RULE = "take_the_wheel";

export type PolicyContext = {
  tool: { name: string };
  bot: { id: string };
  actor: { id: string };
  page: { url: string; host: string };
  repeat: { count: number };
  control: { holder: string };
  intent?:
    | "activate"
    | "type"
    | "navigate"
    | "read"
    | "read_file"
    | "write_file"
    | "list_files"
    | "write"
    | "read_tool"
    | "write_tool";
  element?: { ref: string; role: string; name: string; type?: string };
  key?: string;
  file?: { path: string; name: string; extension: string };
  mcp?: { server: string; tool: string; effect: "read" | "write" };
};

export type PolicyDecision = {
  allowed: boolean;
  mode: PolicyMode;
  matched: string | null;
  source: "deny" | "allow" | "default" | "take_the_wheel";
  forward: boolean;
  reason: string;
};

export function evaluateActionPolicy(
  policy: ActionPolicy | null | undefined,
  context: PolicyContext,
): PolicyDecision {
  const mode: PolicyMode = policy?.mode ?? "enforce";
  const deny = policy?.deny ?? [];
  const allow = policy?.allow ?? [];

  for (const expression of deny) {
    if (matches(expression, context, true)) {
      return {
        allowed: false,
        mode,
        matched: expression,
        source: "deny",
        forward: mode === "dry-run",
        reason: describeRefusal(context, expression),
      };
    }
  }

  for (const expression of allow) {
    if (matches(expression, context, false)) {
      return {
        allowed: true,
        mode,
        matched: expression,
        source: "allow",
        forward: true,
        reason: "Permitted by policy.",
      };
    }
  }

  return {
    allowed: false,
    mode,
    matched: null,
    source: "default",
    forward: mode === "dry-run",
    reason:
      "No rule in this deployment's policy permits that action, so it was refused. " +
      "An administrator can add one.",
  };
}

export function takeTheWheelDecision(): PolicyDecision {
  return {
    allowed: false,
    mode: "enforce",
    matched: TAKE_THE_WHEEL_RULE,
    source: "take_the_wheel",
    forward: false,
    reason: "A person has the wheel. Bot actions are refused until they release control.",
  };
}

export function loadActionPolicy(source: NodeJS.ProcessEnv = process.env): ActionPolicy {
  const raw = source.MESHBOT_ACTION_POLICY?.trim();
  if (!raw) return DEFAULT_ACTION_POLICY;
  return parseActionPolicy(raw);
}

export function parseActionPolicy(raw: string): ActionPolicy {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MESHBOT_ACTION_POLICY must be JSON with mode, deny, and allow");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MESHBOT_ACTION_POLICY must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  const mode = record.mode === "dry-run" ? "dry-run" : record.mode === "enforce" ? "enforce" : null;
  if (!mode) throw new Error("MESHBOT_ACTION_POLICY.mode must be enforce or dry-run");
  if (!isStringList(record.deny) || !isStringList(record.allow)) {
    throw new Error("MESHBOT_ACTION_POLICY.deny and allow must be string arrays");
  }
  return { mode, deny: record.deny, allow: record.allow };
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function matches(expression: string, context: PolicyContext, onError: boolean): boolean {
  try {
    return evaluateExpression(expression, context) === true;
  } catch {
    return onError;
  }
}

function describeRefusal(context: PolicyContext, expression: string): string {
  if (context.file) {
    return (
      `This deployment's policy does not allow that: the file ${context.file.path} ` +
      `is blocked by the rule \`${expression}\`.`
    );
  }
  return (
    `This deployment's policy does not allow that: ${context.tool.name} ` +
    `is blocked by the rule \`${expression}\`.`
  );
}

type Token =
  | { kind: "true" | "false" | "and" | "or" | "lparen" | "rparen" | "comma" | "dot" }
  | { kind: "op"; value: "==" | "!=" | ">=" | "<=" | ">" | "<" }
  | { kind: "ident"; value: string }
  | { kind: "number"; value: number }
  | { kind: "string"; value: string };

export function evaluateExpression(source: string, context: PolicyContext): boolean {
  const tokens = tokenize(source);
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];

  const parseOr = (): unknown => {
    let left = parseAnd();
    while (peek()?.kind === "or") {
      take();
      left = Boolean(left) || Boolean(parseAnd());
    }
    return left;
  };

  const parseAnd = (): unknown => {
    let left = parseComparison();
    while (peek()?.kind === "and") {
      take();
      left = Boolean(left) && Boolean(parseComparison());
    }
    return left;
  };

  const parseComparison = (): unknown => {
    const left = parseUnary();
    const next = peek();
    if (next?.kind !== "op") return left;
    take();
    const right = parseUnary();
    switch (next.value) {
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      case ">":
        return Number(left) > Number(right);
      case "<":
        return Number(left) < Number(right);
      case ">=":
        return Number(left) >= Number(right);
      case "<=":
        return Number(left) <= Number(right);
    }
  };

  const parseUnary = (): unknown => {
    const token = peek();
    if (token?.kind === "ident" && tokens[index + 1]?.kind === "lparen") {
      return parseCall();
    }
    return parseAtom();
  };

  const parseCall = (): unknown => {
    const name = take();
    if (name?.kind !== "ident") throw new Error("expected function name");
    if (take()?.kind !== "lparen") throw new Error("expected (");
    const args: unknown[] = [];
    if (peek()?.kind !== "rparen") {
      args.push(parseOr());
      while (peek()?.kind === "comma") {
        take();
        args.push(parseOr());
      }
    }
    if (take()?.kind !== "rparen") throw new Error("expected )");
    if (name.value === "contains") {
      return String(args[0] ?? "")
        .toLowerCase()
        .includes(String(args[1] ?? "").toLowerCase());
    }
    if (name.value === "matches") {
      return new RegExp(String(args[1] ?? ""), "i").test(String(args[0] ?? ""));
    }
    throw new Error(`unknown function ${name.value}`);
  };

  const parseAtom = (): unknown => {
    const token = take();
    if (!token) throw new Error("unexpected end of policy expression");
    if (token.kind === "true") return true;
    if (token.kind === "false") return false;
    if (token.kind === "number") return token.value;
    if (token.kind === "string") return token.value;
    if (token.kind === "lparen") {
      const inner = parseOr();
      if (take()?.kind !== "rparen") throw new Error("expected )");
      return inner;
    }
    if (token.kind !== "ident") throw new Error("invalid policy expression");
    const parts = [token.value];
    while (peek()?.kind === "dot") {
      take();
      const field = take();
      if (field?.kind !== "ident") throw new Error("expected field");
      parts.push(field.value);
    }
    return readPath(parts, context);
  };

  const value = parseOr();
  if (index !== tokens.length) throw new Error("unexpected tokens in policy expression");
  return value === true;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i]!;
    if (/\s/.test(char)) {
      i += 1;
      continue;
    }
    if (source.startsWith("&&", i)) {
      tokens.push({ kind: "and" });
      i += 2;
      continue;
    }
    if (source.startsWith("||", i)) {
      tokens.push({ kind: "or" });
      i += 2;
      continue;
    }
    if (
      source.startsWith("==", i) ||
      source.startsWith("!=", i) ||
      source.startsWith(">=", i) ||
      source.startsWith("<=", i)
    ) {
      tokens.push({ kind: "op", value: source.slice(i, i + 2) as "==" | "!=" | ">=" | "<=" });
      i += 2;
      continue;
    }
    if (char === ">" || char === "<") {
      tokens.push({ kind: "op", value: char });
      i += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ kind: "comma" });
      i += 1;
      continue;
    }
    if (char === ".") {
      tokens.push({ kind: "dot" });
      i += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      i += 1;
      let value = "";
      while (i < source.length && source[i] !== char) {
        if (source[i] === "\\") {
          value += source[i + 1] ?? "";
          i += 2;
          continue;
        }
        value += source[i];
        i += 1;
      }
      if (source[i] !== char) throw new Error("unterminated string in policy expression");
      i += 1;
      tokens.push({ kind: "string", value });
      continue;
    }
    if (/[0-9]/.test(char)) {
      const start = i;
      while (i < source.length && /[0-9.]/.test(source[i]!)) i += 1;
      tokens.push({ kind: "number", value: Number(source.slice(start, i)) });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = i;
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i]!)) i += 1;
      const value = source.slice(start, i);
      if (value === "true") tokens.push({ kind: "true" });
      else if (value === "false") tokens.push({ kind: "false" });
      else tokens.push({ kind: "ident", value });
      continue;
    }
    throw new Error(`unexpected character in policy expression: ${char}`);
  }
  return tokens;
}

function readPath(parts: string[], context: PolicyContext): unknown {
  let current: unknown = context;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
