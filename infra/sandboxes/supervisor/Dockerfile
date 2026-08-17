FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/adapter-kit/package.json packages/adapter-kit/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/core/package.json packages/core/package.json
COPY infra/sandboxes/supervisor/package.json infra/sandboxes/supervisor/package.json
RUN pnpm install --frozen-lockfile --prod --filter @meshbot/sandbox-supervisor...
COPY packages/adapter-kit packages/adapter-kit
COPY packages/contracts packages/contracts
COPY packages/core packages/core
COPY infra/sandboxes/supervisor infra/sandboxes/supervisor
CMD ["pnpm", "--filter", "@meshbot/sandbox-supervisor", "start"]
