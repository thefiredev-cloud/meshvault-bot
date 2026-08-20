# Mesh Bot — agent brief

MeshVault product on a Hermes Agent + Bot Mode spine. Electron desktop + Expo iOS. BYO model. Default: Qwen (DashScope / OpenAI-compatible); deployment-owned local models use the explicit `MESHBOT_GATEWAY_*` lane. Packages use `@meshbot/*`; upstream and license records live in `UPSTREAM.md`, `NOTICE`, and `LICENSE`.

Do not invent a Swift rewrite. Do not delete Electron or Expo. Do not add Aside/SimpleX/mesh-net as the sold app. Do not invent API keys.

## Architecture (OpenBot)

The action architecture is [CopilotKit/openbot](https://github.com/CopilotKit/openbot) (MIT, AG-UI). Adopt the outcome, not a line-by-line copy. **Do not reverse-engineer Grok Bot. Do not clone Grok Bot.** OpenBot is the source of the architecture.

Locked spine:

1. **Per-bot computer** — isolated workspace, own browser profile, own tools. One supervisor provisions them. MeshVault already does this (Docker supervisor / E2B).
2. **One gateway** — the only path to act. Resolve the target from a server-held snapshot, evaluate policy, write an audit row, **then** act or refuse and name the rule. No silent side door. Code: `@meshbot/gateway`. First wired path: executor `shell`.
3. **Fail-closed policy** — deny before allow; missing or empty policy permits nothing; a broken deny refuses; a broken allow does not permit. Unset `MESHBOT_ACTION_POLICY` uses the shipped explicit default `deny: []` / `allow: ["true"]`.
4. **Bots are AG-UI endpoints** — built-in or remote. Bring any AG-UI agent. Hermes/Pi remain the in-process runtimes until a remote endpoint is configured.
5. **Take-the-wheel** — login / 2FA / help_requested → human drives; bot actions are refused while they drive; the refusal is recorded as `take_the_wheel`.
6. **Secrets never enter the transcript** — credentials encrypted at rest, write-only; audit redacts secret values and credential fields.
7. **Skills are instructions, not capabilities.** MCP is governed (writes are writes unless classified read).
8. **Audit trail** of permitted / refused / failed actions in MeshVault Postgres (`action_audits`), not CopilotKit Intelligence.

Customer-owned product: the model plus the application plus compute. Do **not** make CopilotKit Intelligence / `COPILOTKIT_LICENSE_TOKEN` a required production dependency. Threads and memory stay in MeshVault's own store (Prisma `threads` / `memory_documents` on local Postgres). Keep MeshVault branding. No leftover Rakazo/OpenBot product name in the UI.

Electron/Hermes chat already calls tools through the API executor. Put computer actions behind the gateway there. Do not add a desktop side door.

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
