# MeshVault Bot

Open-source [Grok Bot](https://x.ai) alternative we ship. Electron desktop + Expo iOS. Bring your own model.

Default model path is **Qwen** (DashScope / compatible OpenAI API). **Spark+GX10** (DeepSeek V4 Flash) is the local inference plane when `SPARK_GX10_BASE_URL` is set. OpenRouter and the rest of the Pi catalog stay available.

Each bot has one thread, one computer, memory, routines, and history. A bot can also spawn more bots — each a regular peer with its own thread and computer — or run short-lived subagents inside the current turn. This repository is the complete core product — it runs without a MeshVault-operated control plane.

MeshVault Bot is a fork of [Rakazo](https://github.com/elie222/rakazo) (Apache-2.0) by Inbox Zero Inc. / Rakazo contributors. Maintained by Tanner Osterkamp / [thefiredev-cloud](https://github.com/thefiredev-cloud).

Web, desktop (Electron), and mobile (Expo iOS). The product is still early (beta). Notable product changes are in [`CHANGELOG.md`](./CHANGELOG.md).

## Demo

https://github.com/user-attachments/assets/dccdeddb-2134-4a56-8eed-b2e591736b1c

## Stack

- TypeScript
- React 19, Vite, Tailwind
- Electron
- Expo
- Hono, oRPC
- Postgres, Prisma
- Better Auth
- Graphile Worker
- Pi
- Any sandbox provider (tested with Docker and E2B)
- Composio

## Requirements

- Node.js 22+
- pnpm 9
- Docker Desktop (Postgres plus the graphical bot computer)

## Run locally (web)

From the repo root:

```bash
cp .env.example .env
```

Edit `.env`:

- Set `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` to long random strings before any network exposure. Placeholder values only work in local `development` / `test` runs.
- Put your Qwen / DashScope key in `QWEN_API_KEY` or `DASHSCOPE_API_KEY` (or skip the key and paste one during onboarding). Optional: `QWEN_BASE_URL` / `DASHSCOPE_BASE_URL` for a compatible OpenAI API (default DashScope international).
- OpenRouter still works: `OPENROUTER_API_KEY`. Spark+GX10 local DeepSeek V4 Flash: set `SPARK_GX10_BASE_URL` (OpenAI-compatible, e.g. vLLM on the box).
- ChatGPT Plus or Pro, GitHub Copilot, or SuperGrok / X Premium: skip the key and sign in on the **Connect a model** screen. Pick **OpenAI Codex**, **GitHub Copilot**, or **xAI**, then sign in with the device code Pi shows. Claude Pro is not in the MeshVault UI yet — Pi's Claude login opens a localhost callback, which does not work from the web app.
- Optional: `COMPOSIO_API_KEY` if you want Plugins to talk to live apps.

Then:

```bash
docker compose -f infra/compose/docker-compose.yml up postgres -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm sandbox:build
pnpm dev
```

`pnpm dev` starts the API (`:3100`), Graphile Worker, Vite web app (`:5173`), and sandbox supervisor (`:7091`).

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Sign up, pick a model from the Pi catalog (Qwen, OpenRouter, Spark+GX10, ChatGPT / Copilot / SuperGrok, or Skip if a deployment key is set), create a bot, send a message. The computer pane is a live Linux desktop with a browser. Take control to sign in; the bot keeps that session after you release. Ask a bot to spawn another bot, or to run a subagent for work that should stay inside this turn.

Confirm the product path:

```bash
curl -s http://127.0.0.1:3100/health
```

You want `"runtime":"pi"`, `"sandbox":"docker"`, `"wakeup":"graphile"`. `"composio":true` only if the Composio key is set.

Product defaults are Pi + Docker + Graphile. `pnpm verify:fast` pins the emulators (`AGENT_RUNTIME=scripted`, `SANDBOX_PROVIDER=fake`, `WAKEUP_DRIVER=memory`) so default tests never call live models or Composio.

### Computer and app modes

The app you open and the computer provider are separate choices. Web, Electron, and mobile are clients of the same API. Docker stays the default. In the Electron app the deployment owner is asked once whether bots should keep using Docker or run on this Mac as you.

| `SANDBOX_PROVIDER` | Where agent commands run | Best fit | Isolation notes |
| --- | --- | --- | --- |
| `docker` (default) | A per-bot Docker container on your machine. The Electron app can switch this to This Mac without changing the env var. | Quick local setup and trusted single-machine self-hosting | Good local isolation and persistent bot homes. The supervisor controls the local Docker daemon, so keep its port private; MeshVault does this by default. |
| `e2b` | A remote E2B sandbox | Public or multi-user deployments | Stronger separation from the MeshVault application host. Requires `E2B_API_KEY`. This Mac is not available. |
| `desktop` | Directly on the API/worker host. Working directories under the process user's home folder are allowed. | A trusted single-user local process | Least isolated. Model-initiated shell commands run with the MeshVault process's OS permissions. Do not use it on a public or shared server. The Electron first-run "This Mac" choice uses this provider while leaving `SANDBOX_PROVIDER=docker`. |
| `fake` | An in-process emulator | Tests only | Does not run a real computer. |

Docker remains the recommended quick start for someone running MeshVault on their own machine. E2B is the safer boundary when untrusted users or public traffic share a deployment.

If this Postgres was created with `prisma db push` before checked-in migrations existed, mark the baseline once:

```bash
pnpm --filter @rakazo/db exec prisma migrate resolve --applied 0001_init
```

## Run the desktop app

The Electron shell loads the same web UI. Leave `pnpm dev` running, then:

```bash
pnpm --filter @rakazo/desktop dev
```

Native red / yellow / green buttons close, minimize, and zoom that window. They do nothing in the browser tab. On first launch the desktop app asks whether bots should keep using Docker or run on this Mac as you. Docker stays the default. macOS will not show a permission prompt for that choice — the consent is MeshVault's.

Point Electron at a different origin with `MESHVAULT_WEB_URL` or `RAKAZO_WEB_URL` (default `http://127.0.0.1:5173`).

Packaged installers (optional):

```bash
pnpm --filter @rakazo/desktop pack
```

Outputs land in `apps/desktop/out/` (macOS dmg/zip, Windows NSIS, Linux AppImage). Those builds still need a running API and web origin.

## Run the iOS app

Mobile is the existing Expo app (`apps/mobile`). Leave `pnpm dev` running, then:

```bash
pnpm --filter @rakazo/mobile start
```

Point the app at your API origin (`EXPO_PUBLIC_API_URL`, or **Use a custom server** on the sign-in screen).

## Verify

```bash
pnpm verify:fast       # unit, property, and in-process contract tests
pnpm verify            # Postgres via Testcontainers, emulators, API, Playwright
pnpm verify:providers  # optional live OpenRouter / E2B canaries
```

## Layout

```
apps/web api worker desktop mobile www
packages/core contracts db auth memory ui-web adapter-kit adapters testkit
infra/compose sandboxes
```

`apps/www` is the public marketing site (`meshvault.ai`). It is not the signed-in product. Workspace packages stay `@rakazo/*` so pnpm installs the same as upstream.

## Self-host and Cloud

See `docs/self-host.md`. Cloud and self-hosted editions share the same application and contracts. There is no separate MeshVault-hosted control plane in this repo yet — a public Cloud deploy is a VPS (or E2B) plus the marketing site, not a serverless push of the chat app.

---

Fork of [Rakazo](https://github.com/elie222/rakazo) · [Inbox Zero Inc.](https://www.getinboxzero.com/?utm_source=meshvault&utm_medium=github&utm_campaign=readme)
