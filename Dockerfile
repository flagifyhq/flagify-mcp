# Dockerfile for @flagify/mcp — used by Glama's MCP server directory to
# verify the server boots and responds to protocol introspection.
#
# Builds from source so the image always matches the repo HEAD. For local
# runs prefer `npx -y @flagify/mcp` (the published npm package), this file
# exists for hosted verification + anyone who wants a containerised MCP.
#
# Usage (stdio, via Glama or a local test):
#   docker build -t flagify-mcp .
#   docker run --rm -i flagify-mcp
#
# Auth: the server reads ~/.flagify/config.json by default. Inside a
# container mount your host config or pass FLAGIFY_ACCESS_TOKEN /
# FLAGIFY_API_URL / FLAGIFY_PROJECT_ID as env.

# ---- build stage ------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Install deps first so the layer caches across source-only changes.
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate \
    && pnpm install --frozen-lockfile

# Compile TypeScript to dist/.
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

# Drop dev deps so the runtime image stays lean.
RUN pnpm prune --prod

# ---- runtime stage ----------------------------------------------------
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Copy everything we need to actually run the server.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Don't run as root. `node` user (uid 1000) is bundled in the image.
USER node

# stdio transport — the MCP host pipes JSON-RPC via stdin/stdout.
ENTRYPOINT ["node", "dist/index.js"]
