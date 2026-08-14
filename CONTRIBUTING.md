# Contributing to MeshVault Bot

Thanks for helping improve MeshVault. Keep changes focused and testable.

This repository is a fork of [Rakazo](https://github.com/elie222/rakazo) (Apache-2.0). Keep the product architecture: Electron desktop, Expo iOS, Pi runtime, Docker/E2B computers.

## Run locally

See [README.md](README.md) for full details. Quick start from the repo root:

```bash
cp .env.example .env
# Set BETTER_AUTH_SECRET and ENCRYPTION_KEY to long random strings.
docker compose -f infra/compose/docker-compose.yml up postgres -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm sandbox:build
pnpm dev
```

## Checks before you open a PR

| Command | What it does |
| --- | --- |
| `pnpm verify:fast` | **Default PR bar.** Unit, property, and in-process contract tests. Uses scripted runtime, fake sandbox, and in-memory wakeup — no live Composio, Qwen, or OpenRouter. |
| `pnpm verify` | Optional. Postgres via Testcontainers, emulators, API, Playwright. Needs Docker. |
| `pnpm verify:providers` | Optional. Live OpenRouter / E2B canaries. Needs Docker and real API keys. |
| `pnpm check` | TypeScript (`tsc`) across the monorepo. |
| `pnpm lint` | Biome lint and format check. |

CI runs `pnpm lint`, `pnpm check`, and `pnpm verify:fast` on every PR.

## Secrets and configuration

- **Never** commit `.env` files or secrets.
- **Never** paste API keys, tokens, or passwords in issues or PRs.
- Use placeholders in examples (`your-qwen-key`, `your-openrouter-key`, etc.).

The product path is **Pi + Docker + Graphile**. Default models are **Qwen** (DashScope / compatible OpenAI API); Spark+GX10 is the local plane when configured. Emulator settings (`AGENT_RUNTIME=scripted`, `SANDBOX_PROVIDER=fake`, `WAKEUP_DRIVER=memory`) are for tests only.

**Plugins** integrate via [Composio](https://composio.dev/) (optional `COMPOSIO_API_KEY`). MeshVault does not ship a Git- or MCP-based plugin marketplace.

## Pull requests

- Keep PRs small and easy to review.
- Target the `main` branch.
- Describe what changed and **how you tested** (e.g. `pnpm verify:fast`, manual steps).
- Link related issues when applicable.

## Contact

| Address | Use for |
| --- | --- |
| GitHub Security Advisories on [thefiredev-cloud/meshvault-bot](https://github.com/thefiredev-cloud/meshvault-bot) | Vulnerabilities — see [SECURITY.md](SECURITY.md) |
| [tanner@meshvault.ai](mailto:tanner@meshvault.ai) | Maintainer |
