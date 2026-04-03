# ─── Stage 1: Build the Vite frontend ────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY webapp/package.json webapp/package-lock.json ./webapp/
WORKDIR /app/webapp
RUN npm ci

# Copy source and build
COPY locales /app/locales
COPY webapp /app/webapp
RUN npm run build


# ─── Stage 2: Production image ───────────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy the built frontend from the builder stage
COPY --from=builder /app/webapp/dist /usr/share/nginx/html

# Optional: Add a custom nginx config if needed for SPA routing
# (React Router needs all paths to serve index.html)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

# Health check to ensure Nginx is serving the app
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Generate a config.js file on startup to inject runtime environment variables
# into the browser-side code. This makes the image portable.
CMD ["sh", "-c", "echo \"window.CONFIG = { SPACETIMEDB_NAME: '$SPACETIMEDB_NAME', SPACETIMEDB_URI: '$SPACETIMEDB_URI' };\" > /usr/share/nginx/html/config.js && exec nginx -g 'daemon off;'"]
