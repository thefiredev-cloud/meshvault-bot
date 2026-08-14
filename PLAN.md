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
