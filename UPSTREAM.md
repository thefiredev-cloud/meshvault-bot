# Upstream provenance

This repository is derived from [elie222/rakazo](https://github.com/elie222/rakazo) at commit `fd445cd06ee51a9974bdc28379de1a92bc4aca75`.

Rakazo is licensed under Apache License 2.0. The upstream `LICENSE` file and Git history are retained. FireDev LLC dba MeshVault began modifying this derivative on 2026-08-13.

Mesh Bot changes include product identity, package scopes, local protocol names, container identity, model routing, a bounded Brain surface, personal Composio OAuth, build coverage, and release hardening. The original name remains only in this provenance record, `NOTICE`, `LICENSE`, and retained Git history.

MeshVault is not affiliated with or endorsed by xAI. Grok Bot is used only as a public behavior reference.

Expo Bot Mode roster, identity, and routines adapt concepts from [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) Bot Mode (`apps/desktop/src/plugins/hermes-bots`) onto the existing Mesh Bot API.

## Hermes Bot Mode

The Electron desktop hosts Hermes Bot Mode, ported from [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) `apps/desktop/src/plugins/hermes-bots` at commit `395c70d616f6426e990632ff8b57cf1e9499702f` (MIT). The vendored LICENSE is `apps/desktop/src/plugins/hermes-bots/LICENSE`.

Taken: plugin contract (`id` + `register`), roster identity/search, hide/unhide, groups, canonical Bot Chat pin/open rules, profile session workspace, routine-owner targeting, and single-flight. The 10k-line Hermes React UI and `@hermes/plugin-sdk` host were not copied; MeshVault wires the same helpers through a local Electron plugin host and Bot Mode page.

[NousResearch/hermes-agent-self-evolution](https://github.com/NousResearch/hermes-agent-self-evolution) is a Python DSPy + GEPA training loop. Nothing from it was vendored: it does not compile or run inside Electron.
