# Upstream provenance

This repository is derived from [elie222/rakazo](https://github.com/elie222/rakazo) at commit `fd445cd06ee51a9974bdc28379de1a92bc4aca75`.

Rakazo is licensed under Apache License 2.0. The upstream `LICENSE` file and Git history are retained. FireDev LLC dba MeshVault began modifying this derivative on 2026-08-13.

Mesh Bot changes include product identity, package scopes, local protocol names, container identity, model routing, a bounded Brain surface, personal Composio OAuth, build coverage, and release hardening. The original name remains only in this provenance record, `NOTICE`, `LICENSE`, and retained Git history.

MeshVault is not affiliated with or endorsed by xAI. Do not reverse-engineer Grok Bot. Do not clone Grok Bot. Grok Bot is not an architecture source.

## OpenBot

MeshVault Bot's action architecture is [CopilotKit/openbot](https://github.com/CopilotKit/openbot) (MIT, AG-UI): one gateway that resolves the target, evaluates fail-closed policy, writes an audit row, then acts or refuses and names the rule; one computer per bot; take-the-wheel; secrets off the transcript.

The implementation is MeshVault-owned (`@meshbot/gateway`, Prisma `action_audits`). OpenBot files were not vendored. CopilotKit Intelligence and `COPILOTKIT_LICENSE_TOKEN` are not required. Threads and memory stay in this repo's PostgreSQL. CopilotKit is not affiliated with MeshVault.

Expo Bot Mode roster, identity, and routines adapt concepts from [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) Bot Mode (`apps/desktop/src/plugins/hermes-bots`) onto the existing Mesh Bot API.

## Hermes Agent

Mesh Bot's agent spine is [Nous Research / hermes-agent](https://github.com/NousResearch/hermes-agent) **v0.20.4** (git tag `v2026.8.18`, commit `e624e9fde561e1add9388384012b295fde669ade`), MIT License. The snapshot is `vendor/hermes-agent`, including Desktop Bot Mode at `apps/desktop/src/plugins/hermes-bots`. The archived [Hermes-Bot-Mode](https://github.com/NousResearch/Hermes-Bot-Mode) repo is a reference only.

Useful MIT skill-improve pieces come from [hermes-agent-self-evolution](https://github.com/NousResearch/hermes-agent-self-evolution) commit `0a929e3aa20e15cf04dc7c28492a7d41a5139125`. Darwinian Evolver (AGPL) is not vendored.

Nous Research is not affiliated with MeshVault. This is an MIT reuse, not an official Nous product.

## Hermes Bot Mode

The Electron desktop hosts Hermes Bot Mode, ported from [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) `apps/desktop/src/plugins/hermes-bots` at commit `395c70d616f6426e990632ff8b57cf1e9499702f` (MIT). The vendored LICENSE is `apps/desktop/src/plugins/hermes-bots/LICENSE`.

Taken: plugin contract (`id` + `register`), roster identity/search, hide/unhide, groups, canonical Bot Chat pin/open rules, profile session workspace, routine-owner targeting, and single-flight. The 10k-line Hermes React UI and `@hermes/plugin-sdk` host were not copied; MeshVault wires the same helpers through a local Electron plugin host and Bot Mode page.

The Electron port does not vendor the Python DSPy + GEPA training loop. MIT skill-improve sources from [hermes-agent-self-evolution](https://github.com/NousResearch/hermes-agent-self-evolution) live under `vendor/hermes-agent-self-evolution`.
