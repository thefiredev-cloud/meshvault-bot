# Plan

Loop: **plan → decompose → validate → repeat**.
Front-load planning. If implementation fails, revise this file and retry. Do not enter an LLM review loop (review-agent finds issues → fix → review again).

## Goal

Add Mesh Bot agent rituals and a short planning template without mulch/seeds or new product features.

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

## Effect lifecycle subtask

- [x] Record tool effects as completed only after execution succeeds.
- [x] Retry failed effects under the same idempotency key and fail closed on ambiguous intent.
- [x] Prove a failed write retries once and a completed write never duplicates.
- [x] Pass focused tests, lint, check, build, and the full verification gate.

## Inline approval controls subtask

- [x] Render only the actions supplied by an ask message.
- [x] Submit the selected action id against the ask message's exact waiting run.
- [x] Disable stale, submitted, and in-flight approval controls.
- [x] Pass the focused web test and web checks.

## Mobile inline owner approval subtask

- [x] Preserve ask detail, supplied actions, message run id, and active run id in mobile types.
- [x] Render only server-supplied, accessible same-thread actions.
- [x] Submit the selected action to `threads.answer` for the exact bot and run.
- [x] Disable stale and in-flight actions and pass focused mobile checks.

## Inline owner approval subtask

- [x] Pause exact protected tool calls before any outward or destructive effect.
- [x] Bind Approve or Deny to the owner, workspace, bot, waiting run, and stored effect.
- [x] Execute an approved stored call at most once; denial and stale decisions execute nothing.
- [x] Render the supplied inline actions in web and mobile threads.
- [x] Protect shell commands and show bounded, secret-redacted command and target details.
- [x] Fence every run owner, fail uncertain protected effects closed, and recover committed queued runs.
- [x] Pass all six migrations, 194 tests with 5 expected skips, and both Chromium journeys.

## Public copy truth subtask

- [x] Remove absolutes about credential, session, and network locality.
- [x] Describe current routines, inline approval, and bot setup without promised features.
- [x] Preserve the Grok Bot alternative wording and current layout.
- [x] Pass the public-site check, build, and old-claim/name scan.

## iOS release configuration subtask

- [x] Keep the existing Expo development config working without Apple or Expo release identity.
- [x] Require owner-supplied bundle identifier, build number, Expo owner, and EAS project id for production.
- [x] Add one production EAS profile and one focused preflight check with exact missing-field output.
- [x] Document the release preflight and pass Expo config, TypeScript, focused test, and iOS export smoke.

## macOS remote client subtask

- [x] Replace the packaged `:5173` fallback with a bundled server connection screen.
- [x] Validate and persist one same-origin Mesh Bot web endpoint; require HTTPS outside loopback.
- [x] Keep `MESHBOT_WEB_URL` as the explicit startup override and allow failed/saved servers to be changed.
- [x] Prove origin validation and persistence with one focused test.
- [x] Pass desktop checks and produce an inspected unsigned ARM64 DMG without signing discovery.

## Product name truth subtask

- [x] Use Mesh Bot on shipped UI, public docs, issue forms, runtime messages, and generated metadata.
- [x] Make current mobile requests emit `meshbot://` while retaining inbound `meshvault://` compatibility.
- [x] Preserve FireDev LLC dba MeshVault, canonical domains, repository paths, and upstream attribution.
- [x] Add one focused brand regression and pass lint, all 19 checks, all 4 builds, and `verify:fast`.

## macOS direct-download release subtask

- [x] Keep normal package and directory smoke builds explicitly unsigned.
- [x] Require a certificate source/password and App Store Connect API inputs before release packaging.
- [x] Fail the release if electron-builder cannot find a valid signing identity.
- [x] Enable hardened runtime and built-in notarization only in the release configuration.
- [x] Prove the focused preflight, unsigned package smoke, and repository gates.

## macOS release artifact isolation subtask

- [x] Keep signed release output separate from ordinary unsigned package output.
- [x] Make release verification search only the signed-output directory.
- [x] Pass the release self-check and repository gates.

## Skills pack revenue path subtask

- [x] Add checkout and founding-install helpers that POST to meshvault.ai and never invent a Stripe URL.
- [x] Surface a first-run and in-app CTA in the web/Electron UI so a user can start the $49 pack checkout or submit a lead.
- [x] Add the same path on Expo without claiming Mac or iOS clients are released.
- [x] Keep Apache-2.0 / self-host copy honest; add tests for the network helpers; leave verify:fast green.

## iOS pre-release money / founding-install subtask

- [x] Add `POST /api/create-checkout` and `POST /api/install-lead` with the meshvault-scroll #17 contract.
- [x] Fail closed with 503 when Stripe or Resend env is missing; never invent a checkout URL or inbox.
- [x] Add a visible Expo founding path: honest pre-release copy, lead form, Buy the $49 pack.
- [x] Do not add, enable, or label an App Store / TestFlight / Download on iPhone control.
- [x] Prove the form POST, mocked checkout open, and absent download state with tests.

## iOS founding PR rebase / check-green subtask

- [x] Rebase `cursor/ios-founding-checkout-2e10` onto current main after #13.
- [x] Annotate `handleCreateCheckout` and `handleInstallLead` so the public return type is `Promise<Response>`.
- [x] Push the same PR #14 and leave `pnpm check` green.

## Expo iOS locked MeshVault sell subtask

- [x] Keep one local mobile string with the exact locked MeshVault sell; do not paraphrase.
- [x] Show that string on Expo founding, commerce, and existing mobile checkout/footer surfaces only.
- [x] Do not pitch MeshVault as only a model, only an app, or only compute; do not invent other copy, Rakazo leftovers, or store IDs.
- [x] Leave Electron/desktop/www untouched; prove the string and pass `pnpm verify:fast`.

## MeshVault sell copy subtask

- [x] Lock one MeshVault sell string: the model plus the application plus compute, sold as one product.
- [x] Put that wording on README, marketing, splash, onboarding, about, settings, and window titles.
- [x] Replace leftover generic, Grok-alternative, and Rakazo product pitches on user-facing surfaces.
- [x] Leave providers, models, keys, schemes, and runtime behavior unchanged.
- [x] Pass `pnpm verify:fast` and open a PR.

## MeshVault sell rebase subtask

- [x] Rebase `cursor/meshvault-sell-961d` onto current main after #15.
- [x] Keep the locked sentence exactly: MeshVault is the model plus the application plus compute. That is the company, the offer, and the message.
- [x] Resolve Expo overlap by keeping #15's iOS sell; apply remaining surfaces.
- [x] Fix lint and leave `pnpm verify:fast` green.
- [x] Push the same branch so #16 is mergeable.

## Expo Hermes Bot Mode subtask

- [x] Add portable roster / identity / routine helpers in `@meshbot/contracts` (no Electron plugin host).
- [x] Persist hide locally; talk to existing `bots/*` and `routines/*` RPC from Expo.
- [x] Add Expo identity + routines screens; keep founding/checkout; use the locked sell on touched surfaces.
- [x] Add tests and leave `pnpm verify:fast` green.

## Desktop Hermes Bot Mode merge subtask

- [x] Extract the portable hermes-bots core (identity, search, canonical chat, sessions, groups, hide, mentions, routines owner) from NousResearch/hermes-agent.
- [x] Add an Electron plugin host and a local Bot Mode page; do not dump the 10k-line Hermes React UI.
- [x] Port hermes-bots tests that can run here as Vitest. Skip self-evolution (DSPy/GEPA, not Electron).
- [x] Keep MIT attribution. Do not touch Expo/iOS. Leave desktop typecheck and tests green.

## Rebase #19 onto main after #17

- [x] Rebase `cursor/hermes-bot-mode-desktop-9bae` onto `origin/main`.
- [x] Resolve `PLAN.md`, `UPSTREAM.md`, `.agents/context.json` by keeping both Expo #17 and desktop Hermes Bot Mode.
- [x] Do not drop Electron Bot Mode; do not touch Expo/iOS.

## Keep #19 off the #18 vendor spine

- [x] Rebase #19 only onto `origin/main`. Do not merge `cursor/hermes-bot-mode-0f98` (#18).
- [x] Leave `vendor/hermes-agent` and `vendor/hermes-agent-self-evolution` out of this branch.
- [x] Keep the PR as desktop/Electron Hermes Bot Mode only so it stays MERGEABLE without #18's files.

## Fix #19 lint after rebase

- [x] Format `.agents/context.json` so `biome check .` passes. Do not take #18. Do not touch iOS.
