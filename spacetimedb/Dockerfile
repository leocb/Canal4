# ─── Stage 1: Build the SpacetimeDB bundle ────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

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

# Note: This container is intended to be used as a one-shot CLI runner.
# The `module-init` service in docker-compose.yml will override the entrypoint.
ENTRYPOINT ["spacetime"]
