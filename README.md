# MeshVault Bot

MeshVault Bot is a self-hostable bot application for people who want AI bots that each keep their own thread, memory, routines, and computer. The computer is a Docker container by default or an E2B sandbox. It ships web, Electron desktop, and Expo iOS clients. It is in beta and aimed at developers who run it themselves.

MeshVault is the model plus the application plus compute. That is the company, the offer, and the message.

> **About this fork.** This is a fork of [elie222/rakazo](https://github.com/elie222/rakazo) (Apache-2.0). Upstream is canonical for the original product and its documentation. This fork branched from upstream commit `fd445cd` and is maintained by FireDev LLC dba MeshVault ([thefiredev-cloud](https://github.com/thefiredev-cloud)). Issues are disabled here. Upstream's `LICENSE`, `NOTICE`, and git history are kept; provenance is in [`UPSTREAM.md`](./UPSTREAM.md).
>
> What the fork changes, by area:
>
> - **Branding and models.** Rebrand to MeshVault, `@meshbot/*` package scopes, Qwen (DashScope) as the default model path, and the `MESHBOT_GATEWAY_*` lane for a deployment-owned OpenAI-compatible endpoint.
> - **Agent runtime.** Hermes Agent v0.20.4 is the default runtime (`AGENT_RUNTIME=hermes`). `vendor/hermes-agent` is a sparse snapshot of Nous Research's code, mainly the Bot Mode plugin. Bot Mode is wired into the Electron desktop and ported to the Expo app.
> - **Action gateway.** `packages/gateway` evaluates a fail-closed policy and writes an audit row (`action_audits`) before a bot acts. It follows the architecture of CopilotKit's OpenBot but shares no code with it.
> - **Computers.** A `desktop` computer provider ("This Mac"), owner approvals for tool effects, takeover-run binding, and Rust viewer code in `native/meshbot-viewer-core`.
> - **Release paths.** A signed and notarized macOS release script for the desktop app and a production iOS preflight for the Expo app.
> - **Commerce.** An optional $49 skills pack checkout (`POST /api/create-checkout`) and a founding-install lead endpoint (`POST /api/install-lead`). Both return an error when their environment variables are unset.
>
> Upstream has moved on since the branch point (about 1,100 commits ahead as of 2026-10-10) and ships features this fork does not have, such as the published-image installer, Daytona, CreateOS and Box computers, and Pipedream Connect. Use upstream if you want those. Notable changes here are in [`CHANGELOG.md`](./CHANGELOG.md).

The agent spine is **Nous Research Hermes Agent v0.20.4** with in-tree **Bot Mode** (named roster, avatars, routines, bot-to-bot), licensed MIT and recorded in [`NOTICE`](./NOTICE). The default model path is **Qwen** (DashScope or a compatible OpenAI API). OpenRouter and the rest of the Pi catalog stay available.

Each bot has one thread, one computer, memory, routines, and history. A bot can also spawn more bots, each a regular peer with its own thread and computer, message another bot, or run short-lived subagents inside the current turn. The repository is the whole application and runs without a MeshVault-operated control plane.

Product notes live in [`PRODUCT.md`](./PRODUCT.md). License and upstream attribution are in [`LICENSE`](./LICENSE), [`NOTICE`](./NOTICE), and [`UPSTREAM.md`](./UPSTREAM.md).

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
- OpenRouter still works: `OPENROUTER_API_KEY`. For deployment-owned local models, set `MESHBOT_GATEWAY_URL`, `MESHBOT_GATEWAY_KEY`, and the exact comma-separated `MESHBOT_GATEWAY_MODELS` served by that endpoint.
- ChatGPT Plus or Pro, GitHub Copilot, or SuperGrok / X Premium: skip the key and sign in on the **Connect a model** screen. Pick **OpenAI Codex**, **GitHub Copilot**, or **xAI**, then sign in with the device code Pi shows. Claude API keys work. Claude Pro / Max login is not in the MeshVault web UI yet because Pi's Claude flow needs a localhost callback or manual code rather than a device code.
- Plugins use personal Composio sign-in through the fixed remote MCP endpoint.

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

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Sign up, pick a model from the Pi catalog (Claude, OpenAI, Codex, Grok, Qwen, OpenRouter, a configured local gateway, or Skip if a deployment key is set), create a bot, and send a message. The computer pane is a live Linux desktop with a browser. Take control to sign in; the bot keeps that session after you release. Ask a bot to spawn another bot, or to run a subagent for work that should stay inside this turn.

Confirm the product path:

```bash
curl -s http://127.0.0.1:3100/health
```

You want `"runtime":"hermes"`, `"sandbox":"docker"`, `"wakeup":"graphile"`. `"composio":true` means the personal OAuth connector is available; each user still connects Composio in Plugins.

Product defaults are Hermes + Docker + Graphile. `AGENT_RUNTIME=pi` is the pre-Hermes loop. `pnpm verify:fast` pins the emulators (`AGENT_RUNTIME=scripted`, `SANDBOX_PROVIDER=fake`, `WAKEUP_DRIVER=memory`) so default tests never call live models or Composio.

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
pnpm --filter @meshbot/db exec prisma migrate resolve --applied 0001_init
```

## Run the desktop app

The Electron shell loads the same web UI. Leave `pnpm dev` running, then:

```bash
pnpm --filter @meshbot/desktop dev
```

Native red / yellow / green buttons close, minimize, and zoom that window. They do nothing in the browser tab. On first launch the desktop app asks whether bots should keep using Docker or run on this Mac as you. Docker stays the default. macOS shows no permission prompt for that choice; the consent is MeshVault's.

Development defaults to `http://127.0.0.1:5173`. A packaged build has no default and asks for your server's address on first launch (HTTPS, except for loopback addresses), then remembers it. Use **MeshVault → Change Server…** to change it. `MESHBOT_WEB_URL` is the explicit startup override.

### Desktop Bot Mode

Hermes Bot Mode is bundled in the Electron app (from [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) `apps/desktop/src/plugins/hermes-bots`). It is a local roster of named bots with one canonical Bot Chat each. No Hermes API key is invented or required.

With `pnpm --filter @meshbot/desktop dev` running:

1. Choose **MeshVault → Bot Mode** (or **Open Bot Mode** on the connection screen).
2. Create an agent (`researcher`, `ops`, …) or open the default Hermes row.
3. Click a bot to pin and open its forever Bot Chat. **Sessions** lists that bot's stored conversations.
4. **Open MeshVault** returns to the connected MeshVault application (model + application + compute).

Roster state is stored in the desktop user-data directory (`bot-mode.json`, mode `0600`). The Expo/iOS client is unchanged.

Packaged installers (optional):

```bash
pnpm --filter @meshbot/desktop pack
```

Outputs land in `apps/desktop/out/` (macOS dmg/zip, Windows NSIS, Linux AppImage). Those builds still need a running API and web origin.
The public Mac download must be signed with a Developer ID Application certificate and notarized by Apple; an unsigned local package is only a smoke-test artifact.

For a direct-download macOS release, provide the Developer ID Application certificate and App Store Connect API notarization inputs to electron-builder, then run the release-only command:

```bash
export CSC_LINK='<certificate file, URL, or base64 data>'
export CSC_KEY_PASSWORD='<certificate password>'
export APPLE_API_KEY='<absolute path to AuthKey_*.p8>'
export APPLE_API_KEY_ID='<App Store Connect key id>'
export APPLE_API_ISSUER='<App Store Connect issuer id>'
pnpm --filter @meshbot/desktop release:mac
```

The preflight names every missing field before TypeScript compilation or packaging. It does not print credential values. The release config writes only to `apps/desktop/out/release/`, requires a valid signing identity, enables hardened runtime, and uses electron-builder's built-in notarization. Ordinary unsigned `pack` builds stay in `apps/desktop/out/` and cannot be mistaken for release output. Verify the produced app and disk image before publishing either artifact:

```bash
MESH_RELEASE_DIR="apps/desktop/out/release"
MESH_APP="$(find "$MESH_RELEASE_DIR" -maxdepth 2 -type d -name 'MeshVault.app' -print -quit)"
test -n "$MESH_APP"
codesign --verify --deep --strict --verbose=2 "$MESH_APP"
codesign -dvv "$MESH_APP" 2>&1 | grep -F 'Authority=Developer ID Application:'
xcrun stapler validate "$MESH_APP"
MESH_DMG="$(find "$MESH_RELEASE_DIR" -maxdepth 1 -type f -name '*.dmg' -print -quit)"
test -n "$MESH_DMG"
hdiutil verify "$MESH_DMG"
```

## Run the iOS app

Mobile is the existing Expo app (`apps/mobile`). Leave `pnpm dev` running, then:

```bash
pnpm --filter @meshbot/mobile start
```

Point the app at your API origin (`EXPO_PUBLIC_API_URL`, or **Use a custom server** on the sign-in screen).

Before a production iPhone build, supply the exact Apple and Expo identity assigned to this app:

```bash
export MESHBOT_IOS_BUNDLE_IDENTIFIER='<assigned bundle id>'
export MESHBOT_IOS_BUILD_NUMBER='<next build number>'
export MESHBOT_EXPO_OWNER='<Expo account>'
export MESHBOT_EXPO_PROJECT_ID='<EAS project id>'
pnpm --filter @meshbot/mobile release:ios:check
cd apps/mobile && eas build --platform ios --profile production
```

The same variables feed the `production` profile in `apps/mobile/eas.json` from the shell or Expo's production environment. Development does not require them. The preflight exits before EAS or Xcode when any value is missing.

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
vendor/hermes-agent vendor/hermes-agent-self-evolution
infra/compose sandboxes
```

`apps/www` is the public marketing site. It is not the signed-in product. Workspace packages use the `@meshbot/*` scope.

## Self-host and Cloud

See `docs/self-host.md`. Cloud and self-hosted editions share the same application and contracts. This repo has no MeshVault-hosted control plane yet. A public Cloud deploy is a VPS (or E2B) plus the marketing site, not a serverless push of the chat app.

Upstream and license records: [`UPSTREAM.md`](./UPSTREAM.md) · [`NOTICE`](./NOTICE)

## License

Apache-2.0, inherited from Rakazo. See [`LICENSE`](./LICENSE). Vendored Hermes Agent code is MIT; attributions are in [`NOTICE`](./NOTICE).
