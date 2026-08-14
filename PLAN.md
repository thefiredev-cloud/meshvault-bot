# Plan

Loop: **plan → decompose → validate → repeat**.
Front-load planning. If implementation fails, revise this file and retry. Do not enter an LLM review loop (review-agent finds issues → fix → review again).

## Goal

Add MeshVault Bot agent rituals and a short planning template without mulch/seeds or new product features.

## Decompose

- [x] Write `AGENTS.md` (start / while / finish rituals + how to query `.agents/context.json`)
- [x] Write `PLAN.md` template (plan → decompose → validate → repeat)
- [x] Seed `.agents/context.json` with Qwen + rebrand learnings
- [x] Point CONTRIBUTING/CHANGELOG at the rituals; skip `CLAUDE.md` (repo had none)

## Validate

- [x] `pnpm verify:fast` still the product bar (no product code in this subtask)
- [x] tree buildable; no mulch/seeds dependency

## Repeat

Empty — first pass.

## Provider correctness subtask

- [x] Persist exact provider/model on each bot and expose it through existing bot contracts.
- [x] Scope credential defaults to one user workspace and make provider upserts atomic and unique.
- [x] Dispatch exact provider/model pairs without cross-provider model or key fallback.
- [x] Add the model selector to the existing bot settings panel.
- [x] Apply all four migrations, pass 175 tests, and pass both Chromium journeys.
- [x] Reject incomplete or unknown persisted run, bot, default, and usage model pairs.
- [x] Fail closed without a scoped credential while preserving exact-provider ambient and local gateway auth.
- [x] Preserve a provider's model/default when reconnecting without a model; require one for a new provider.
- [x] Re-run all four migrations, pass 181 tests, and pass both Chromium journeys.

## Takeover release sequencing subtask

- [x] Keep a takeover-requested run waiting while the owner controls the computer.
- [x] Atomically release owner control and queue only the matching waiting run.
- [x] Give Pi explicit post-takeover continuation context through the existing checkpoint.
- [x] Prove API, journey, and browser behavior cannot complete before release.
- [x] Pass focused tests, lint, check, build, and the full verification gate.
