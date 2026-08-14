FROM node:22-bookworm
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @meshvault/web build
ENV NODE_ENV=production
EXPOSE 3100 5173 7091
CMD ["pnpm", "--filter", "@meshvault/api", "start"]
