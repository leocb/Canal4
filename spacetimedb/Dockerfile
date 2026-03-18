# ─── Stage 1: Build the SpacetimeDB bundle ────────────────────────────────────
# Note: Using bookworm because the spacetime CLI binary requires glibc
FROM node:22-bookworm AS builder

WORKDIR /app

# Copy the `spacetime` CLI binary from the official image
# This is much more reliable than the install script in a container environment.
COPY --from=clockworklabs/spacetime:latest /usr/local/bin/spacetime /usr/local/bin/spacetime

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy sources and build the bundle
# Note: We use `npm run build:bundle` to avoid generating bindings 
# for adjacent project folders that don't exist in this build context.
COPY . .
RUN npm run build:bundle


# ─── Stage 2: Final image with built module ───────────────────────────────────
# We use the official SpacetimeDB image which contains the CLI tools.
FROM clockworklabs/spacetime:latest

WORKDIR /module

# Copy the built bundle from the builder stage
COPY --from=builder /app/dist/bundle.js /module/bundle.js
COPY package.json /module/package.json

# Create a minimal spacetime.json to satisfy project detection
RUN echo '{"module-path": ".", "server": "local"}' > /module/spacetime.json

# Note: This container is intended to be used as a one-shot CLI runner.
# The `module-init` service in docker-compose.yml will override the entrypoint.
ENTRYPOINT ["spacetime"]
