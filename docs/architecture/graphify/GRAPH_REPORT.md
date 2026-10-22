# Graph Report - meshvault-bot  (2026-10-21)

## Corpus Check
- 379 files · ~277,353 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 30 file(s) not represented in the graph (top: (none) 13, .css 4, .ico 3)

## Summary
- 3806 nodes · 7153 edges · 218 communities (180 shown, 38 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 107 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- hermes-agent/apps/desktop/package.json
- pi-runtime.ts
- plugin.js
- dependencies
- scripts
- ref_node_assert
- chat-ui/package.json
- interfaces.ts
- domain.ts
- adapters/package.json
- lib/bot-mode.ts
- contracts/src/commerce.ts
- Composio Platform
- api/package.json
- executor.ts
- mobile/package.json
- evolve_skill.py
- package.json
- adapters/src/index.ts
- AdapterContext
- testkit/package.json
- supervisor/src/index.ts
- BotsPane
- router.ts
- core.ts
- Shell.tsx
- home.ts
- worker/package.json
- biome.json
- client_wire.rs
- client.rs
- pi-models.ts
- app.ts
- Onboarding.tsx
- contracts/src/bot-mode.ts
- db/package.json
- Plan
- api/src/commerce.ts
- index.tsx
- api.ts
- ProductDemo
- tls.rs
- ViewerError
- supervisor/package.json
- main.ts
- expo
- web/package.json
- artifacts.ts
- ref_node_vm
- sign-in.tsx
- ComputerRef
- pi-oauth.ts
- cron.ts
- hermes-bots/types.ts
- lib/commerce.test.ts
- auth/package.json
- devDependencies
- DestinationEmulator
- ref_node_fs
- index.astro
- ui-web/package.json
- CreateAgentDialog
- ProductDemo.tsx
- db/src/events.ts
- core/package.json
- ui-web/src/index.ts
- lib.rs
- ComposioConnector
- desktop-sandbox.ts
- memory/package.json
- model-env.ts
- www/package.json
- bots.js
- PinnedServerCertVerifier
- adapter-kit/package.json
- composio-connector.ts
- contracts/package.json
- compilerOptions
- desktop/src/bot-mode.ts
- dependencies
- MeshBotClient
- address.rs
- composio-connector.test.ts
- gateway/src/index.ts
- build
- runGroupChatRounds
- dependencies
- vite.config.ts
- PersistentComposioOAuthProvider
- apps/desktop/package.json
- ref_vitest
- Brain.tsx
- PrismaComposioOAuthStore
- createRunExecutor
- tasks
- computer.tsx
- computer-action.ts
- journeys.test.ts
- ui-tokens/package.json
- dependencies
- Hermes Agent ☤
- canonical-chat.ts
- MeshVault Bot
- address_pairing.rs
- gateway/package.json
- policy.ts
- components.json
- BotFace
- build
- scripts
- verify.ts
- auth/src/index.ts
- register
- compilerOptions
- compilerOptions
- compilerOptions
- e2b-sandbox.ts
- skill-improve.ts
- compilerOptions
- audit.ts
- compilerOptions
- devDependencies
- desktop.test.ts
- CONTRIBUTING.md
- TestServer
- providers.canary.test.ts
- Mesh Bot — agent brief
- connect.js
- RealtimeFanout
- db/src/index.ts
- secrets-guard.ts
- McpEmulator
- AvatarPicker
- 🧬 Hermes Agent Self-Evolution
- api/tsconfig.json
- sessions.ts
- www/tsconfig.json
- certificate
- HostAwareSandbox
- testkit/tsconfig.json
- dmg
- roster-preview.test.mjs
- check-macos-release.mjs
- linux
- scripts
- scripts
- worker/tsconfig.json
- dependencies
- devDependencies
- [Unreleased]
- start.sh
- supervisor/tsconfig.json
- .certificate_is_allowed
- adapter-kit/tsconfig.json
- adapters/tsconfig.json
- auth/tsconfig.json
- contracts/tsconfig.json
- core/tsconfig.json
- db/tsconfig.json
- gateway/tsconfig.json
- memory/tsconfig.json
- ui-tokens/tsconfig.json
- MeshVault
- mac
- nsis
- extendInfo
- legacy-sdk-compat.test.mjs
- mac
- golden.spec.ts
- BaseLayout.astro
- Contributing to Mesh Bot
- face-clock.test.mjs
- nsis
- devDependencies
- app.config.js
- scripts
- devDependencies
- Security
- linux
- ensureMessagingProtocol
- bots-search.test.mjs
- canonical-chat-identity.test.mjs
- group-chat.test.mjs
- client_config
- win
- active-now-strip.test.mjs
- activity-toasts.test.mjs
- hub-picker-guard.test.mjs
- mention-completions.test.mjs
- model-inherit.test.mjs
- profile-prewarm.test.mjs
- routine-owner.test.mjs
- routines-error.test.mjs
- directories
- ui-tokens/src/index.ts
- peerDependencies
- scripts
- repository
- bot-meta-hydrate.test.mjs
- canonical-chat-creation.test.mjs
- hide-bot-chats.test.mjs
- hide-bots.test.mjs
- single-flight.test.mjs
- exports
- backup.sh
- restore.sh
- engines
- optionalDependencies
- hermes-agent-self-evolution/VENDOR.md
- hermes-agent/VENDOR.md
- hermes-agent
- hermes-agent-self-evolution
- meshbot-viewer-core

## God Nodes (most connected - your core abstractions)
1. `AdapterContext` - 138 edges
2. `scripts` - 65 edges
3. `ComputerRef` - 63 edges
4. `ViewerError` - 50 edges
5. `SandboxProvider` - 32 edges
6. `Plan` - 32 edges
7. `createRouter()` - 31 edges
8. `ShellPage()` - 31 edges
9. `ProductDemo()` - 31 edges
10. `BotsPane()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `What “MeshVault Cloud” still needs` --references--> `LocalAgentHomeStore`  [INFERRED]
  docs/self-host.md → packages/adapters/src/home.ts
- `iOS founding PR rebase / check-green subtask` --references--> `handleCreateCheckout()`  [INFERRED]
  PLAN.md → apps/api/src/commerce.ts
- `iOS founding PR rebase / check-green subtask` --references--> `handleInstallLead()`  [INFERRED]
  PLAN.md → apps/api/src/commerce.ts
- `Bundled plugins` --references--> `HermesPlugin`  [INFERRED]
  vendor/hermes-agent/apps/desktop/src/plugins/README.md → apps/desktop/src/plugins/hermes-bots/types.ts
- `Computer and app modes` --references--> `desktop()`  [INFERRED]
  README.md → apps/web/src/lib/desktop.test.ts

## Import Cycles
- 1-file cycle: `native/meshbot-viewer-core/src/tls.rs -> native/meshbot-viewer-core/src/tls.rs`
- 2-file cycle: `native/meshbot-viewer-core/src/client.rs -> native/meshbot-viewer-core/src/lib.rs -> native/meshbot-viewer-core/src/client.rs`
- 2-file cycle: `native/meshbot-viewer-core/src/lib.rs -> native/meshbot-viewer-core/src/pairing.rs -> native/meshbot-viewer-core/src/lib.rs`
- 3-file cycle: `native/meshbot-viewer-core/src/client.rs -> native/meshbot-viewer-core/src/pairing.rs -> native/meshbot-viewer-core/src/lib.rs -> native/meshbot-viewer-core/src/client.rs`
- 3-file cycle: `native/meshbot-viewer-core/src/client.rs -> native/meshbot-viewer-core/src/tls.rs -> native/meshbot-viewer-core/src/lib.rs -> native/meshbot-viewer-core/src/client.rs`
- 3-file cycle: `native/meshbot-viewer-core/src/address.rs -> native/meshbot-viewer-core/src/lib.rs -> native/meshbot-viewer-core/src/pairing.rs -> native/meshbot-viewer-core/src/address.rs`
- 4-file cycle: `native/meshbot-viewer-core/src/address.rs -> native/meshbot-viewer-core/src/lib.rs -> native/meshbot-viewer-core/src/client.rs -> native/meshbot-viewer-core/src/pairing.rs -> native/meshbot-viewer-core/src/address.rs`
- 4-file cycle: `native/meshbot-viewer-core/src/address.rs -> native/meshbot-viewer-core/src/lib.rs -> native/meshbot-viewer-core/src/client.rs -> native/meshbot-viewer-core/src/tls.rs -> native/meshbot-viewer-core/src/address.rs`

## Communities (218 total, 38 thin omitted)

### Community 0 - "hermes-agent/apps/desktop/package.json"
Cohesion: 0.02
Nodes (103): @assistant-ui/core, @assistant-ui/react, @assistant-ui/react-streamdown, @audiowave/react, bippy, @chenglou/pretext, cmdk, @codemirror/commands (+95 more)

### Community 1 - "pi-runtime.ts"
Cohesion: 0.06
Nodes (52): AgentRuntime, AgentRunRequest, AgentRuntimeEvent, isOwnerApprovalRequired(), builtinAgentTools, DELEGATION_TOOL_NAMES, HermesAgentRuntime, hermesChatArgv() (+44 more)

### Community 2 - "plugin.js"
Cohesion: 0.04
Nodes (69): $activityToasts, AVATAR_COLORS, AVATAR_PICKER_SHAPES, AVATAR_SHAPES, avatarFetchInflight, avatarPushInflight, BOT_MODE_SWEEP_TITLES, $botMeta (+61 more)

### Community 3 - "dependencies"
Cohesion: 0.03
Nodes (71): dependencies, @assistant-ui/core, @assistant-ui/react, @assistant-ui/react-streamdown, @audiowave/react, @chenglou/pretext, class-variance-authority, clsx (+63 more)

### Community 4 - "scripts"
Cohesion: 0.03
Nodes (65): scripts, build, builder, check, check:lint, check:test:desktop:all, check:test:desktop:platforms, check:test:plugins (+57 more)

### Community 5 - "ref_node_assert"
Cohesion: 0.05
Nodes (22): pluginSource, pluginSource, source, initialMatch, source, source, pluginSource, source (+14 more)

### Community 6 - "chat-ui/package.json"
Cohesion: 0.05
Nodes (45): dependencies, react-markdown, remark-gfm, @ronradtke/react-native-markdown-display, devDependencies, react, react-native, @types/react (+37 more)

### Community 7 - "interfaces.ts"
Cohesion: 0.08
Nodes (21): ExecutionRunner, MemoryStore, ModelProvider, AdapterDescriptor, AgentRuntimeCapabilities, ConnectorCapabilities, MemoryCapabilities, MemoryCommitRequest (+13 more)

### Community 8 - "domain.ts"
Cohesion: 0.07
Nodes (42): ArtifactSchema, BotSchema, BrainEdge, BrainEdgeSchema, BrainGraphSchema, BrainNodeSchema, CapabilityInstall, CapabilityInstallSchema (+34 more)

### Community 9 - "adapters/package.json"
Cohesion: 0.04
Nodes (47): dependencies, dockerode, @e2b/desktop, @earendil-works/pi-agent-core, @earendil-works/pi-ai, graphile-worker, @meshbot/adapter-kit, @meshbot/contracts (+39 more)

### Community 10 - "lib/bot-mode.ts"
Cohesion: 0.11
Nodes (42): BotIdentity(), confirmDelete(), duplicate(), save(), toggleHidden(), chipStyle(), Field(), linkStyle (+34 more)

### Community 11 - "contracts/src/commerce.ts"
Cohesion: 0.11
Nodes (37): Commerce(), buyPack(), submitLead(), openUrl(), styles, CommerceOverlay(), CommercePanel(), buyPack() (+29 more)

### Community 12 - "Composio Platform"
Cohesion: 0.05
Nodes (39): Branding and production auth, Canonical follow-up, Common provider constraints, Composio project or session 401, Errors and provider gotchas, For You client authentication, Identify the authentication boundary, Provider connected-account 401 (+31 more)

### Community 13 - "api/package.json"
Cohesion: 0.05
Nodes (41): dependencies, dotenv, hono, @hono/node-server, @meshbot/adapter-kit, @meshbot/adapters, @meshbot/auth, @meshbot/contracts (+33 more)

### Community 14 - "executor.ts"
Cohesion: 0.09
Nodes (38): OwnerApprovalRequired, approvalActionDetail(), approvalActionName(), approvalPreview(), ApprovalRun, approvalTargets(), approvedEffectInstruction(), boundedApprovalDetail() (+30 more)

### Community 15 - "mobile/package.json"
Cohesion: 0.06
Nodes (31): Layout(), NewBot(), loadApiBase(), config, { getDefaultConfig }, pinned, devDependencies, @types/react (+23 more)

### Community 16 - "evolve_skill.py"
Cohesion: 0.07
Nodes (7): evolve(), main(), find_skill(), load_skill(), reassemble_skill(), SkillModule, TaskWithSkill

### Community 17 - "package.json"
Cohesion: 0.05
Nodes (39): devDependencies, @biomejs/biome, tsx, turbo, @types/node, typescript, vitest, engines (+31 more)

### Community 18 - "adapters/src/index.ts"
Cohesion: 0.11
Nodes (12): SandboxProvider, ComputerInput, ControlLeaseRef, ManagedSandboxEmulator, FakeSandboxProvider, sandboxKindForBot(), ctx, ctx (+4 more)

### Community 19 - "AdapterContext"
Cohesion: 0.10
Nodes (7): AgentHomeStore, ConnectionAuthProvider, SecretStore, AdapterContext, SecretRecord, DockerSandboxProvider, keyFrom()

### Community 20 - "testkit/package.json"
Cohesion: 0.05
Nodes (37): dependencies, fast-check, @hono/node-server, @meshbot/adapter-kit, @meshbot/adapters, @meshbot/auth, @meshbot/contracts, @meshbot/core (+29 more)

### Community 21 - "supervisor/src/index.ts"
Cohesion: 0.08
Nodes (21): COMPUTER_IMAGE, ComputerCreateInput, containerCreateOptions(), containerNameFor(), mapKey(), PointerInput, SandboxInput, SCREEN_HOST (+13 more)

### Community 22 - "BotsPane"
Cohesion: 0.13
Nodes (36): activeBots(), ActiveNowStrip(), botAppearance(), botGroups(), botHandle(), botRosterKey(), botRosterMeta(), BotRow() (+28 more)

### Community 23 - "router.ts"
Cohesion: 0.12
Nodes (28): BRAIN_EDGE_LIMIT, BRAIN_NODE_LIMIT, brainFailure(), normalizeBrainGraph(), RawGraphSchema, computerHostFor(), computerStatus(), createRouter() (+20 more)

### Community 24 - "core.ts"
Cohesion: 0.11
Nodes (27): snapshot(), meta, roster, botGroups(), botHandle(), botRosterKey(), botRosterMeta(), displayName() (+19 more)

### Community 25 - "Shell.tsx"
Cohesion: 0.10
Nodes (29): message, applyThreadEvent(), approvalAnswerInput(), BotSettings(), CreateBotForm(), embeddableScreenUrl(), MessageView(), answer() (+21 more)

### Community 26 - "home.ts"
Cohesion: 0.12
Nodes (21): Backup, Choosing a computer provider, Docker Compose (single machine), Local (source checkout), Restore, Self-hosting MeshVault, Upgrade, What “MeshVault Cloud” still needs (+13 more)

### Community 27 - "worker/package.json"
Cohesion: 0.06
Nodes (33): dependencies, dotenv, graphile-worker, @meshbot/adapter-kit, @meshbot/adapters, @meshbot/contracts, @meshbot/core, @meshbot/db (+25 more)

### Community 28 - "biome.json"
Cohesion: 0.06
Nodes (33): noSvgWithoutTitle, useExhaustiveDependencies, css, parser, files, includes, formatter, enabled (+25 more)

### Community 29 - "client_wire.rs"
Cohesion: 0.12
Nodes (12): malformed_unknown_and_oversized_json_fail_with_fixed_categories(), non_success_status_and_reflective_body_are_never_exposed(), pair(), pair_posts_exact_json_and_protected_calls_attach_one_bearer_internally(), paired_client(), Requests, take_error(), task_json() (+4 more)

### Community 30 - "client.rs"
Cohesion: 0.08
Nodes (21): ChatRequest, encode_segment(), MAX_DEVICE_LABEL_CHARS, MAX_EVIDENCE_CHARS, MAX_EVIDENCE_ITEMS, MAX_IDENTIFIER_CHARS, MAX_MESSAGES, MAX_MODELS (+13 more)

### Community 31 - "pi-models.ts"
Cohesion: 0.12
Nodes (26): GATEWAY_PROVIDER_ID, GatewayConfig, gatewayConfigFromEnv(), gatewayProvider(), registerGateway(), buildPiCatalog(), byPreferredProvider(), catalogBilling() (+18 more)

### Community 32 - "app.ts"
Cohesion: 0.12
Nodes (14): createApp(), isTrustedOrigin(), sessionHeaders(), AppEnv, main(), resolveComposioCallbackUrl(), createConnectorStack(), sleepComputerIfIdle() (+6 more)

### Community 33 - "Onboarding.tsx"
Cohesion: 0.11
Nodes (16): App(), authClient, link, rpc, queryClient, AuthPage(), CatalogEntry, OnboardingPage() (+8 more)

### Community 34 - "contracts/src/bot-mode.ts"
Cohesion: 0.14
Nodes (27): confirmSpawnedBotName(), deleteSpawnedBot(), messagePeerBot(), spawnBot(), botDisplayName(), botHandle(), botIdentitySummary(), BotModeIdentity (+19 more)

### Community 35 - "db/package.json"
Cohesion: 0.06
Nodes (30): dependencies, dotenv, @meshbot/contracts, pg, @prisma/adapter-pg, @prisma/client, zod, devDependencies (+22 more)

### Community 36 - "Plan"
Cohesion: 0.06
Nodes (31): Decompose, Desktop Hermes Bot Mode merge subtask, Effect lifecycle subtask, Expo Hermes Bot Mode subtask, Expo iOS locked MeshVault sell subtask, Fix #19 lint after rebase, Goal, Hermes Agent + Bot Mode spine subtask (+23 more)

### Community 37 - "api/src/commerce.ts"
Cohesion: 0.14
Nodes (28): assertStripeCheckoutUrl(), buildCheckoutSessionParams(), buildLeadEmail(), checkoutResponse(), cleanField(), clientKey(), CommerceDeps, CommerceOffer (+20 more)

### Community 38 - "index.tsx"
Cohesion: 0.12
Nodes (16): BotRow(), styles, BotAvatar(), MobileBot, MobileMe, botTag(), filterBots(), formatThreadTime() (+8 more)

### Community 39 - "api.ts"
Cohesion: 0.14
Nodes (25): submit(), MessageBubble(), Thread(), refresh(), send(), submitAnswer(), NativeSymbol(), applyMobileThreadEvent() (+17 more)

### Community 40 - "ProductDemo"
Cohesion: 0.11
Nodes (27): cloneBots(), ComputerDesktop(), defaultTrigger(), describeTrigger(), OnboardThread(), parseWhen(), previewForBot(), ProductDemo() (+19 more)

### Community 41 - "tls.rs"
Cohesion: 0.09
Nodes (5): MAX_CERTIFICATE_LIFETIME_SECONDS, OID_EC_PUBLIC_KEY, OID_ECDSA_SHA256, OID_P256, TEST_NOW

### Community 42 - "ViewerError"
Cohesion: 0.10
Nodes (23): collect_body(), decode_json_response(), ensure_success(), ViewerError, Authentication, Conflict, Forbidden, InvalidAddress (+15 more)

### Community 43 - "supervisor/package.json"
Cohesion: 0.07
Nodes (29): dependencies, dockerode, hono, @hono/node-server, @meshbot/core, pino, zod, devDependencies (+21 more)

### Community 44 - "main.ts"
Cohesion: 0.14
Nodes (17): BOT_MODE_PAGE, CONNECTION_PAGE, createWindow(), developmentIcon(), errorMessage(), focusedWindow(), installMenu(), loadServer() (+9 more)

### Community 45 - "expo"
Cohesion: 0.07
Nodes (27): backgroundColor, foregroundImage, monochromeImage, adaptiveIcon, icon, expo, android, icon (+19 more)

### Community 46 - "web/package.json"
Cohesion: 0.07
Nodes (27): better-auth, lucide-react, @meshbot/chat-ui, @meshbot/contracts, @meshbot/core, @meshbot/ui-tokens, @meshbot/ui-web, @orpc/client (+19 more)

### Community 47 - "artifacts.ts"
Cohesion: 0.10
Nodes (10): ArtifactStore, NotificationProvider, ArtifactPut, NotificationMessage, CapturingNotificationProvider, LocalArtifactStore, loadPushToken(), pushTokenPath() (+2 more)

### Community 48 - "ref_node_vm"
Cohesion: 0.07
Nodes (9): pluginSource, pluginSource, source, pluginSource, source, pluginSource, pluginSource, pluginSource (+1 more)

### Community 49 - "sign-in.tsx"
Cohesion: 0.20
Nodes (24): CircleButton(), Home(), openAccountMenu(), ServerSheet(), restoreDefault(), save(), SignIn(), usesCustomApiBase() (+16 more)

### Community 50 - "ComputerRef"
Cohesion: 0.15
Nodes (5): ComputerRef, ScreenRequest, ScreenSession, E2BSandboxProvider, FakeBox

### Community 51 - "pi-oauth.ts"
Cohesion: 0.12
Nodes (18): resolveModelKey(), CHATGPT_OAUTH_PROVIDER, COPILOT_OAUTH_PROVIDER, defaultLogin(), deferred(), isOAuthCredential(), loadProviderOAuth(), LoginFn (+10 more)

### Community 52 - "cron.ts"
Cohesion: 0.14
Nodes (22): NUMBERS, RoutineSchedule(), TIMED, TIMES, UNITS, CRON_FREQS, CronFreq, cronFromPreset() (+14 more)

### Community 53 - "hermes-bots/types.ts"
Cohesion: 0.14
Nodes (20): activateBundledPlugins(), bundledPlugins(), createPluginContext(), createPluginStorage(), LoadedPlugin, memoryStorage(), hermesBotsPlugin, BOT_MODE_SWEEP_TITLES (+12 more)

### Community 54 - "lib/commerce.test.ts"
Cohesion: 0.16
Nodes (21): Field(), Founding(), buy(), submitLead(), checkoutErrorMessage(), checkoutRequestUrl(), INSTALL_INBOX, INSTALL_LEAD_PATH (+13 more)

### Community 55 - "auth/package.json"
Cohesion: 0.08
Nodes (24): dependencies, better-auth, @meshbot/contracts, @meshbot/core, @meshbot/db, zod, devDependencies, typescript (+16 more)

### Community 56 - "devDependencies"
Cohesion: 0.08
Nodes (25): devDependencies, bippy, concurrently, cross-env, electron, electron-builder, @electron/rebuild, esbuild (+17 more)

### Community 57 - "DestinationEmulator"
Cohesion: 0.14
Nodes (9): AppHandles, ConnectorProvider, ConnectorCall, ConnectorEvent, ConnectorTool, CompositeConnector, isComposioAuthenticationFailure(), DestinationEmulator (+1 more)

### Community 58 - "ref_node_fs"
Cohesion: 0.11
Nodes (11): root, dir, root, here, rootEnv, nameSurfaces, sellSurfaces, backupScript (+3 more)

### Community 59 - "index.astro"
Cohesion: 0.18
Nodes (15): Props, Props, { href = "/" }, Props, fetchGithubStars(), formatStarCount(), CHANGELOG_URL, DOCS_URL (+7 more)

### Community 60 - "ui-web/package.json"
Cohesion: 0.08
Nodes (23): class-variance-authority, clsx, lucide-react, @meshbot/contracts, @meshbot/ui-tokens, react, react-dom, tailwind-merge (+15 more)

### Community 61 - "CreateAgentDialog"
Cohesion: 0.12
Nodes (24): AdvancedProfileConfig(), applyAdvancedConfig(), CheckList(), closeGroupChatMainTab(), CreateAgentDialog(), createCanonicalChat(), deleteBot(), disbandGroupChat() (+16 more)

### Community 62 - "ProductDemo.tsx"
Cohesion: 0.11
Nodes (21): BOOT_STEPS, BOT_COLORS, ExtraMessages, FREQS, LiveBot, NUMBERS, ONBOARD, PanelMode (+13 more)

### Community 63 - "db/src/events.ts"
Cohesion: 0.13
Nodes (14): Bot, Actor, BOT_COLORS, Db, eventsAfter(), followThreadEvents(), sleep(), waitForThreadNotify() (+6 more)

### Community 64 - "core/package.json"
Cohesion: 0.09
Nodes (22): dependencies, @meshbot/adapter-kit, @meshbot/contracts, zod, devDependencies, fast-check, typescript, vitest (+14 more)

### Community 65 - "ui-web/src/index.ts"
Cohesion: 0.17
Nodes (13): cachedCatalog, markConnected(), PluginsOverlay(), connect(), revoke(), setItemConnected(), ConnectionCatalogItem, BotAvatar() (+5 more)

### Community 66 - "lib.rs"
Cohesion: 0.13
Nodes (12): CreateTaskRequest, Message, Model, ModelsResponse, TaskStatus, Completed, Failed, Leased (+4 more)

### Community 67 - "ComposioConnector"
Cohesion: 0.19
Nodes (3): startDeviceSignIn(), ComposioConnector, ComposioOAuthStore

### Community 68 - "desktop-sandbox.ts"
Cohesion: 0.16
Nodes (7): CommandRequest, ProcessEvent, allowedPath(), DesktopBox, DesktopSandboxProvider, resolveExecuteCwd(), runCommand()

### Community 69 - "memory/package.json"
Cohesion: 0.10
Nodes (20): dependencies, @meshbot/adapter-kit, @meshbot/contracts, @meshbot/db, devDependencies, typescript, vitest, exports (+12 more)

### Community 70 - "model-env.ts"
Cohesion: 0.29
Nodes (16): loadEnv(), required(), base, DEFAULT_OPENROUTER_MODEL, DEFAULT_QWEN_BASE_URL, DEFAULT_QWEN_MODEL, defaultPiModel(), defaultPiProvider() (+8 more)

### Community 71 - "www/package.json"
Cohesion: 0.11
Nodes (17): @meshbot/ui-web, react, react-dom, tailwindcss, @tailwindcss/vite, @types/react, @types/react-dom, typescript (+9 more)

### Community 72 - "bots.js"
Cohesion: 0.12
Nodes (18): chatMeta, chatTitle, createBtn, createForm, draftEl, fail(), hideBtn, meshvaultBtn (+10 more)

### Community 74 - "adapter-kit/package.json"
Cohesion: 0.11
Nodes (18): dependencies, @meshbot/contracts, zod, devDependencies, typescript, vitest, exports, @meshbot/contracts (+10 more)

### Community 75 - "composio-connector.ts"
Cohesion: 0.16
Nodes (15): asConnectorTools(), asObject(), collectLogIds(), COMPOSIO_MCP_URL, COMPOSIO_META_TOOL_SET, ComposioMcpSession, connectionSelect, InvalidComposioCallbackError (+7 more)

### Community 76 - "contracts/package.json"
Cohesion: 0.11
Nodes (18): dependencies, @orpc/contract, zod, devDependencies, typescript, vitest, exports, @orpc/contract (+10 more)

### Community 77 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, customConditions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, lib (+10 more)

### Community 78 - "desktop/src/bot-mode.ts"
Cohesion: 0.16
Nodes (13): BotModeRuntime, BotModeState, createBotModeRuntime(), ensureLoaded(), persist(), emptyState(), StoredSession, readPluginStore() (+5 more)

### Community 79 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, expo, expo-notifications, expo-router, expo-secure-store, expo-status-bar, expo-symbols, @expo/vector-icons (+10 more)

### Community 80 - "MeshBotClient"
Cohesion: 0.26
Nodes (6): MeshBotClient, Task, valid_response_string(), valid_response_text(), validate_task(), validate_thread()

### Community 81 - "address.rs"
Cohesion: 0.20
Nodes (11): Address, allowed_ipv4(), allowed_ipv6(), DEFAULT_PORT, ExpectedHost, Dns, Ip, parse_host() (+3 more)

### Community 82 - "composio-connector.test.ts"
Cohesion: 0.16
Nodes (6): COMPOSIO_META_TOOLS, ComposioConnectionRecord, ComposioMcpSessionFactory, ComposioOAuthBundle, context, MemoryOAuthStore

### Community 83 - "gateway/src/index.ts"
Cohesion: 0.20
Nodes (13): recordAuditEvent(), ActionGateway, ActionGatewayOptions, ActionRefusedError, ActionSnapshotElement, ActionSubject, createActionGateway(), GovernRequest (+5 more)

### Community 84 - "build"
Cohesion: 0.11
Nodes (18): build, afterPack, afterSign, appId, artifactName, asar, asarUnpack, beforeBuild (+10 more)

### Community 85 - "runGroupChatRounds"
Cohesion: 0.22
Nodes (18): appendGroupChatEntry(), botConnectionRoute(), buildGroupChatTurnPrompt(), ensureGroupChatSession(), formatGroupChatLine(), groupMemberKey(), groupSpeakerLabel(), harvestStrandedGroupReply() (+10 more)

### Community 86 - "dependencies"
Cohesion: 0.12
Nodes (17): dependencies, better-auth, lucide-react, @meshbot/chat-ui, @meshbot/contracts, @meshbot/core, @meshbot/ui-tokens, @meshbot/ui-web (+9 more)

### Community 87 - "vite.config.ts"
Cohesion: 0.22
Nodes (9): isAllowedTargetName(), resolveNovncTarget(), safeProxyHeaders(), safeProxyResponseHeaders(), SENSITIVE_FORWARD_HEADERS, SENSITIVE_RESPONSE_HEADERS, stripSensitiveHandshakeHeaders(), attachNovncProxy() (+1 more)

### Community 89 - "apps/desktop/package.json"
Cohesion: 0.12
Nodes (15): author, dependencies, @meshbot/contracts, description, homepage, electron, electron-builder, @meshbot/contracts (+7 more)

### Community 90 - "ref_vitest"
Cohesion: 0.13
Nodes (7): baseConfig, before, configure, releaseKeys, require, AdapterRegistry, slots

### Community 91 - "Brain.tsx"
Cohesion: 0.17
Nodes (12): BrainCanvas(), BrainOverlay(), close(), BrainState(), failureCopy, ForceGraph3D, GraphHint(), GraphLoading() (+4 more)

### Community 92 - "PrismaComposioOAuthStore"
Cohesion: 0.15
Nodes (4): adapterContext(), ComposioCredentialError, parseComposioOAuthBundle(), PrismaComposioOAuthStore

### Community 93 - "createRunExecutor"
Cohesion: 0.22
Nodes (11): createRunExecutor(), ACTIVE, allowed, assertTransition(), canAcquireRunLease(), canTransition(), nextFence(), OwnerApprovalDecision (+3 more)

### Community 94 - "tasks"
Cohesion: 0.12
Nodes (15): dependsOn, outputs, dependsOn, cache, persistent, cache, $schema, tasks (+7 more)

### Community 95 - "computer.tsx"
Cohesion: 0.29
Nodes (12): Computer(), bootComputer(), openComputer(), refresh(), releaseComputer(), ScreenWebView(), COMPUTER_HEARTBEAT_MS, ComputerStatus (+4 more)

### Community 96 - "computer-action.ts"
Cohesion: 0.21
Nodes (11): createPrismaAuditStore(), createExecutorActionGateway(), executeGovernedShell(), RefusedAction, ShellResult, prisma, ExecutorDeps, AuditStore (+3 more)

### Community 97 - "journeys.test.ts"
Cohesion: 0.19
Nodes (12): App, Bot, cookieHeader(), hasDb, Me, raw(), rpc(), sendAndWait() (+4 more)

### Community 98 - "ui-tokens/package.json"
Cohesion: 0.13
Nodes (14): devDependencies, typescript, vitest, exports, ./css, typescript, vitest, license (+6 more)

### Community 99 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, class-variance-authority, clsx, lucide-react, @meshbot/contracts, @meshbot/ui-tokens, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu (+7 more)

### Community 100 - "Hermes Agent ☤"
Cohesion: 0.13
Nodes (14): CLI vs Messaging Quick Reference, Community, Contributing, Documentation, Getting Started, Hermes Agent ☤, License, Linux, macOS, WSL2, Termux (+6 more)

### Community 101 - "canonical-chat.ts"
Cohesion: 0.22
Nodes (12): CanonicalChatHooks, canonicalCreations, createCanonicalChat(), HISTORY, loadOpenPath(), openBotCanonicalChat(), openStoredBotChat(), resetCanonicalCreations() (+4 more)

### Community 102 - "MeshVault Bot"
Cohesion: 0.15
Nodes (14): desktop(), Computer and app modes, Demo, Desktop Bot Mode, Layout, License, MeshVault Bot, Requirements (+6 more)

### Community 103 - "address_pairing.rs"
Cohesion: 0.16
Nodes (7): validate_address(), CODE, pairing_uri_rejects_boundary_changes_and_field_smuggling(), pairing_uri_rejects_noncanonical_encoding_values_and_pins(), PIN, uri(), validation_errors_are_fixed_and_redacted()

### Community 104 - "gateway/package.json"
Cohesion: 0.14
Nodes (13): devDependencies, typescript, vitest, exports, typescript, vitest, license, name (+5 more)

### Community 105 - "policy.ts"
Cohesion: 0.25
Nodes (12): DEFAULT_ACTION_POLICY, describeRefusal(), evaluateActionPolicy(), evaluateExpression(), isStringList(), matches(), parseActionPolicy(), PolicyMode (+4 more)

### Community 106 - "components.json"
Cohesion: 0.14
Nodes (13): aliases, components, ui, utils, rsc, $schema, style, tailwind (+5 more)

### Community 107 - "BotFace"
Cohesion: 0.18
Nodes (14): BotFace(), cubicAt(), facePose(), isDarkColor(), paintMathFace(), projectFacePoint(), ringToPath(), sampleArc() (+6 more)

### Community 108 - "build"
Cohesion: 0.15
Nodes (13): build, appId, artifactName, copyright, executableName, extraMetadata, files, productName (+5 more)

### Community 109 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, build, check, dev, pack, pack:dir, pack:linux, pack:mac (+5 more)

### Community 110 - "verify.ts"
Cohesion: 0.21
Nodes (7): env, loadRootEnv(), main(), providers, run(), waitForHealth(), @testcontainers/postgresql

### Community 111 - "auth/src/index.ts"
Cohesion: 0.32
Nodes (7): AuthEnv, blockedAuthPaths, createAuth(), newId(), emailAllowed(), parseAllowlist(), signupsOpen()

### Community 112 - "register"
Cohesion: 0.18
Nodes (12): deliverRemoteRosterMentions(), ensureRemoteCanonicalChat(), handleSessionsGatewayTransition(), hideOwnedBotSessions(), isActiveRosterBot(), isBotModeSweepTitle(), pollRemoteDmReply(), register() (+4 more)

### Community 113 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, lib, noEmit, outDir, rootDir, types, exclude, extends (+2 more)

### Community 114 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, module, moduleResolution, noEmit, rootDir, extends (+2 more)

### Community 115 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, module, moduleResolution, noEmit, rootDir, extends (+2 more)

### Community 116 - "e2b-sandbox.ts"
Cohesion: 0.38
Nodes (7): ACTIVE_RUN, DEFAULT_SANDBOX_IDLE_MS, sandboxIdleMs(), E2B_BROWSER_APPS, e2bCreateOptions(), isUnrecoverableSandboxError(), openDesktopBrowser()

### Community 117 - "skill-improve.ts"
Cohesion: 0.27
Nodes (8): evaluateSkillImprove(), parseSkillMarkdown(), reassembleSkill(), SKILL_IMPROVE_MAX_BYTES, SkillDocument, SkillImproveInput, SkillImproveResult, TOOL_DESCRIPTION_MAX_CHARS

### Community 118 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, module, moduleResolution, noEmit, rootDir, extends (+2 more)

### Community 119 - "audit.ts"
Cohesion: 0.27
Nodes (8): createMemoryAuditStore(), GATEWAY_AUDIT_EVENTS, GatewayAuditEventType, isSensitiveKey(), normalizedKey(), redactAuditPayload(), SENSITIVE_KEYS, insert()

### Community 120 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, jsx, lib, module, moduleResolution, noEmit, rootDir, extends (+2 more)

### Community 121 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, @playwright/test, tailwindcss, @tailwindcss/vite, @types/react, @types/react-dom, typescript, vite (+2 more)

### Community 122 - "desktop.test.ts"
Cohesion: 0.33
Nodes (6): desktopBridge(), MeshBotDesktop, Window, windowChromeKind(), HostComputerPrompt(), WindowChrome()

### Community 123 - "CONTRIBUTING.md"
Cohesion: 0.22
Nodes (4): Hermes Agent, Hermes Bot Mode, OpenBot, Upstream provenance

### Community 125 - "providers.canary.test.ts"
Cohesion: 0.20
Nodes (5): App, liveE2b, livePi, livePiApp, Snap

### Community 126 - "Mesh Bot — agent brief"
Cohesion: 0.22
Nodes (8): Architecture (OpenBot), Before finish, Commands, Context substrate, Mesh Bot — agent brief, Rituals, Start of every session, While working

### Community 127 - "connect.js"
Cohesion: 0.25
Nodes (8): botModeButton, button, form, hint, input, loadSettings(), showStatus(), status

### Community 130 - "secrets-guard.ts"
Cohesion: 0.44
Nodes (6): DEV_AUTH_SECRET_PLACEHOLDER, DEV_ENCRYPTION_KEY_PLACEHOLDER, isDevSecretAllowed(), resolveAuthSecret(), resolveEncryptionKey(), resolveSupervisorToken()

### Community 132 - "AvatarPicker"
Cohesion: 0.25
Nodes (9): AvatarPicker(), generateAvatarImage(), normalizeAvatarImage(), petFrameIcon(), PetTab(), PetThumb(), pickImageFromDevice(), probeImagen() (+1 more)

### Community 133 - "🧬 Hermes Agent Self-Evolution"
Cohesion: 0.22
Nodes (8): Engines, Full Plan, Guardrails, 🧬 Hermes Agent Self-Evolution, How It Works, License, Quick Start, What It Optimizes

### Community 134 - "api/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, noEmit, rootDir, exclude, extends, include, ../../tsconfig.base.json

### Community 135 - "sessions.ts"
Cohesion: 0.43
Nodes (6): filterProfileSessions(), nextGatewayGeneration(), openBotSessionsWorkspace(), openProfileSession(), BotModeHost, NAME_RE

### Community 136 - "www/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, jsxImportSource, exclude, extends, include, astro/tsconfigs/strict

### Community 137 - "certificate"
Cohesion: 0.39
Nodes (6): accepts_one_current_self_signed_p256_server_certificate_with_the_exact_pin_and_san(), certificate(), rejects_missing_or_unsafe_basic_constraints_key_usage_and_extended_key_usage(), rejects_wrong_curve_signature_validity_lifetime_and_self_signature(), rejects_wrong_pin_san_wildcard_and_intermediate_chain(), valid_params()

### Community 139 - "testkit/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, noEmit, rootDir, exclude, extends, include, ../../tsconfig.base.json

### Community 140 - "dmg"
Cohesion: 0.25
Nodes (8): dmg, backgroundColor, contents, iconSize, title, window, height, width

### Community 141 - "roster-preview.test.mjs"
Cohesion: 0.29
Nodes (5): DM_BOT, fromBotOf(), runtime(), source, textOf()

### Community 142 - "check-macos-release.mjs"
Cohesion: 0.38
Nodes (5): packageJson, release, check(), missingFields(), REQUIRED

### Community 143 - "linux"
Cohesion: 0.29
Nodes (7): linux, category, icon, maintainer, synopsis, target, vendor

### Community 144 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, android, check, ios, release:ios:check, start, test

### Community 145 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, check, dev, e2e, preview, test

### Community 146 - "worker/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, ../../tsconfig.base.json

### Community 147 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, astro, @astrojs/react, cookie, @meshbot/ui-web, react, react-dom

### Community 148 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, @astrojs/check, tailwindcss, @tailwindcss/vite, @types/react, @types/react-dom, typescript

### Community 149 - "[Unreleased]"
Cohesion: 0.29
Nodes (6): [0.1.0-beta] - 2026-08-13, Added, Changed, Changelog, Removed, [Unreleased]

### Community 150 - "start.sh"
Cohesion: 0.29
Nodes (6): DISPLAY, HOME, NPM_CONFIG_PREFIX, PATH, PIP_USER, start.sh script

### Community 151 - "supervisor/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, ../../../tsconfig.base.json

### Community 152 - ".certificate_is_allowed"
Cohesion: 0.48
Nodes (4): valid_algorithms(), valid_extensions(), valid_san(), valid_time()

### Community 153 - "adapter-kit/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, ../../tsconfig.base.json

### Community 154 - "adapters/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, ../../tsconfig.base.json

### Community 155 - "auth/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, ../../tsconfig.base.json

### Community 156 - "contracts/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, ../../tsconfig.base.json

### Community 157 - "core/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, ../../tsconfig.base.json

### Community 158 - "db/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, ../../tsconfig.base.json

### Community 159 - "gateway/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, ../../tsconfig.base.json

### Community 160 - "memory/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, ../../tsconfig.base.json

### Community 161 - "ui-tokens/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, noEmit, rootDir, extends, include, ../../tsconfig.base.json

### Community 162 - "MeshVault"
Cohesion: 0.29
Nodes (7): Acceptance, Current slice, Host boundaries, MeshVault, Product contract, Purpose, Visual direction

### Community 163 - "mac"
Cohesion: 0.29
Nodes (7): mac, category, entitlements, entitlementsInherit, gatekeeperAssess, hardenedRuntime, target

### Community 164 - "nsis"
Cohesion: 0.29
Nodes (7): nsis, allowToChangeInstallationDirectory, oneClick, perMachine, shortcutName, uninstallDisplayName, warningsAsErrors

### Community 165 - "extendInfo"
Cohesion: 0.29
Nodes (7): CFBundleDisplayName, CFBundleExecutable, CFBundleName, NSAudioCaptureUsageDescription, NSCameraUsageDescription, NSMicrophoneUsageDescription, extendInfo

### Community 166 - "legacy-sdk-compat.test.mjs"
Cohesion: 0.43
Nodes (6): OPTIONAL_CAPABILITY_EXPORTS, pluginSource, proxyModule(), sdkNamedImports(), writeLegacySdk(), writeReactStubs()

### Community 167 - "mac"
Cohesion: 0.33
Nodes (6): mac, category, icon, identity, notarize, target

### Community 169 - "BaseLayout.astro"
Cohesion: 0.33
Nodes (4): canonical, Props, socialImage, SITE_NAME

### Community 170 - "Contributing to Mesh Bot"
Cohesion: 0.33
Nodes (6): Checks before you open a PR, Contact, Contributing to Mesh Bot, Pull requests, Run locally, Secrets and configuration

### Community 171 - "face-clock.test.mjs"
Cohesion: 0.33
Nodes (4): clockSource, end, pluginSource, start

### Community 172 - "nsis"
Cohesion: 0.40
Nodes (5): nsis, allowToChangeInstallationDirectory, oneClick, perMachine, shortcutName

### Community 173 - "devDependencies"
Cohesion: 0.40
Nodes (5): devDependencies, electron, electron-builder, typescript, vitest

### Community 174 - "app.config.js"
Cohesion: 0.50
Nodes (3): { readIosReleaseConfig }, readIosReleaseConfig(), RELEASE_FIELDS

### Community 175 - "scripts"
Cohesion: 0.40
Nodes (5): scripts, build, check, dev, preview

### Community 176 - "devDependencies"
Cohesion: 0.40
Nodes (5): devDependencies, @types/react, @types/react-dom, typescript, vitest

### Community 177 - "Security"
Cohesion: 0.40
Nodes (5): Other contact, Reporting vulnerabilities, Scope, Security, Supported versions

### Community 178 - "linux"
Cohesion: 0.40
Nodes (5): linux, category, maintainer, synopsis, target

### Community 179 - "ensureMessagingProtocol"
Cohesion: 0.60
Nodes (5): backfillMessagingProtocol(), composeSoul(), ensureMessagingProtocol(), hasMessagingProtocol(), messagingProtocolSection()

### Community 180 - "bots-search.test.mjs"
Cohesion: 0.40
Nodes (3): meta, roster, source

### Community 184 - "win"
Cohesion: 0.50
Nodes (4): win, legalTrademarks, signAndEditExecutable, target

### Community 187 - "hub-picker-guard.test.mjs"
Cohesion: 0.50
Nodes (3): section, source, start

### Community 190 - "profile-prewarm.test.mjs"
Cohesion: 0.67
Nodes (3): renderBotRow(), source, sourceBetween()

### Community 193 - "directories"
Cohesion: 0.67
Nodes (3): directories, buildResources, output

### Community 195 - "peerDependencies"
Cohesion: 0.67
Nodes (3): peerDependencies, react, react-dom

### Community 196 - "scripts"
Cohesion: 0.67
Nodes (3): scripts, check, test

### Community 197 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

## Knowledge Gaps
- **318 isolated node(s):** `@hono/node-server`, `@meshbot/adapter-kit`, `@meshbot/adapters`, `@meshbot/auth`, `@meshbot/contracts` (+313 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1899 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AdapterContext` connect `AdapterContext` to `app.ts`, `pi-runtime.ts`, `contracts/src/bot-mode.ts`, `ComposioConnector`, `desktop-sandbox.ts`, `interfaces.ts`, `HostAwareSandbox`, `composio-connector.ts`, `artifacts.ts`, `ComputerRef`, `adapters/src/index.ts`, `composio-connector.test.ts`, `e2b-sandbox.ts`, `DestinationEmulator`, `home.ts`, `PrismaComposioOAuthStore`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `@hono/node-server`, `@meshbot/adapter-kit`, `@meshbot/adapters` to the rest of the system?**
  _318 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `hermes-agent/apps/desktop/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.019230769230769232 - nodes in this community are weakly interconnected._
- **Why does `react-router-dom` connect `Onboarding.tsx` to `Shell.tsx`, `web/package.json`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Should `pi-runtime.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05502392344497608 - nodes in this community are weakly interconnected._
- **Why does `@testcontainers/postgresql` connect `verify.ts` to `testkit/package.json`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Should `plugin.js` be split into smaller, more focused modules?**
  _Cohesion score 0.04024144869215292 - nodes in this community are weakly interconnected._