# Stage 1: Build
FROM node:20-slim AS builder

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@8.14.0 --activate

WORKDIR /app

# Copy workspace root config files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy backend package.json
COPY packages/backend/package.json packages/backend/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy backend source and build config
COPY packages/backend/src packages/backend/src
COPY packages/backend/tsup.config.ts packages/backend/tsup.config.ts
COPY packages/backend/tsconfig.json packages/backend/tsconfig.json

# Build the backend
RUN pnpm --filter @tranzmit/exit-button-backend build

# Stage 2: Production runner
FROM node:20-slim AS runner

WORKDIR /app

# Copy built output and dependencies from builder
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/backend/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
