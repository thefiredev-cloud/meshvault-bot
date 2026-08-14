# MeshVault Bot — agent brief

Open-source Grok Bot alternative. Electron desktop + Expo iOS. BYO model. Default: Qwen (DashScope / OpenAI-compatible). Spark+GX10 (DeepSeek V4 Flash) when `SPARK_GX10_BASE_URL` is set. Fork of [elie222/rakazo](https://github.com/elie222/rakazo) (Apache-2.0). Packages stay `@rakazo/*`.

Do not invent a Swift rewrite. Do not delete Electron or Expo. Do not add Aside/SimpleX/mesh-net as the sold app. Do not invent API keys.

## Commands

- `pnpm verify:fast` — default bar
- `pnpm lint` / `pnpm check` — CI
- `pnpm dev` — API `:3100`, worker, web `:5173`, supervisor `:7091`

## Rituals

### Start of every session

1. Read this file.
2. Query `.agents/context.json` for every path you will touch (match `paths`).
3. State the plan as atomic subtasks (use `PLAN.md`). One subtask = one fresh context.

### While working

- One subtask per agent / fresh context. Do not dump 500-line changes in one run.
- Write learnings as compact JSON records, not markdown novels.
- Keep the tree buildable after each subtask.

### Before finish

1. Append what worked / failed to `.agents/context.json`.
2. Close the subtask in `PLAN.md`.
3. Leave `pnpm verify:fast` green (or the repo’s equivalent fast test).
4. If implementation failed: revise the plan and retry. Do not enter an LLM review loop.

## Context substrate

File: `.agents/context.json`. Agent-first, structured, path-anchored.

```json
{"at":"ISO-date","paths":["file-or-dir"],"worked":"dense fact","failed":"dense fact or null"}
```

Query by path before edits. Append; do not rewrite history. No mulch/seeds dependency.
