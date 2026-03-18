# ─── Stage 1: Build the Vite frontend ────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN tsc -b && npx vite build


# ─── Stage 2: Production image ───────────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy the built frontend from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

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

CMD ["nginx", "-g", "daemon off;"]
