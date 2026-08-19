# Changelog

Notable product changes in MeshVault. This is for people following the repo, not a dump of every commit. GitHub Releases still mark tagged builds.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- User-facing copy now states the MeshVault sell: MeshVault is the model plus the application plus compute. That is the company, the offer, and the message.
- Renamed the shipped product and workspace scope to Mesh Bot and `@meshbot/*`. Required upstream attribution remains in `UPSTREAM.md` and `NOTICE`.
- Default model path is Qwen (DashScope / compatible OpenAI API) via `QWEN_API_KEY` / `DASHSCOPE_API_KEY` and optional `QWEN_BASE_URL` / `DASHSCOPE_BASE_URL`. OpenRouter and the rest of the Pi catalog remain.
- Deployment-owned local models use the explicit `MESHBOT_GATEWAY_*` OpenAI-compatible lane; DGX Spark and ASUS GX10 remain separate inference hosts.

### Added

- Electron Hermes Bot Mode: a local Bots roster with canonical Bot Chats, session workspace, hide/unhide, and search, ported from NousResearch/hermes-agent `apps/desktop/src/plugins/hermes-bots`. Open it from MeshVault → Bot Mode or the connection screen. iOS/Expo is unchanged.
- Optional $49 Agent Skills Starter Pack checkout and founding-install lead in first-run onboarding, the web/Electron sidebar, and the Expo inbox. The Apache-2.0 self-hosted runtime stays free; native Mac and iPhone clients are in development and are not released.
- Electron first-run: Docker (default) or this Mac. This Mac runs the bot shell as you, with working directories under your home folder. macOS does not show its own permission dialog; the consent is Mesh Bot's. The choice is owner-only and is refused when `SANDBOX_PROVIDER` is not `docker` (so E2B and test fakes cannot enable it).
- GitHub Copilot and SuperGrok / X Premium sign-in via Pi device-code OAuth (`openai-codex`, `github-copilot`, `xai`). Claude Pro is still omitted because Pi's Claude login uses a localhost callback that does not work from the web app.
- Agent rituals in `AGENTS.md` plus `PLAN.md` (plan → decompose → validate → repeat) and path-anchored learnings in `.agents/context.json`.
- Spawn peer bots (each with its own thread and computer) and short-lived in-thread subagents.
- ChatGPT Plus or Pro sign-in for model access.
- Mobile: point the app at a self-hosted API origin, a native iOS inbox, and take control of the live desktop.
- Revoke for connected Composio plugins.
- Routines in plain language instead of raw cron.

### Removed

- Unused Grant folder picker in the desktop app. Bots never got a host folder that way.

## [0.1.0-beta] - 2026-08-13

Initial upstream beta: web, Electron, and Expo clients; Pi runtime; Docker and E2B computers; plugins; one thread, computer, memory, routines, and history per bot.
