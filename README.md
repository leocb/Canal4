# Canal4

**Canal4** is an open-source, real-time broadcast notification system for venues. It lets venue staff send structured broadcast messages through a web dashboard, which are instantly delivered and displayed as scrolling ticker banners on dedicated desktop display nodes (e.g. lobby TVs, back-office screens).

Built on [SpacetimeDB](https://spacetimedb.com) for real-time, low-latency synchronization — no polling, no REST round-trips.

---

## How It Works

```
┌─────────────────────────────────┐
│   Web Dashboard (Canal4 webapp) │   ← Venue staff send broadcasts here
│   React SPA + Nginx             │   ← Passkey-only authentication
└────────────────┬────────────────┘
                 │ WebSocket (SpacetimeDB protocol)
                 ▼
┌─────────────────────────────────┐
│        SpacetimeDB Server       │   ← Real-time database & reducer engine
│        Port 3000                │
└────────────────┬────────────────┘
                 │ WebSocket (SpacetimeDB protocol)
                 ▼
┌─────────────────────────────────┐
│  Canal4 Display Node (Electron) │   ← Scrolling ticker on display screens
│  macOS (Intel + Apple Silicon)  │
│  Windows                        │
└─────────────────────────────────┘
```

### Core concepts

| Concept | Description |
|---|---|
| **Venue** | An organization (e.g. a company, restaurant, event space) |
| **Channel** | A topic within a venue (e.g. "Kitchen Alerts", "Sales Feed") |
| **Message Template** | A structured schema defining what fields a broadcast must include |
| **Display Node** | An Electron desktop app paired to a venue, showing incoming messages as a scrolling ticker |
| **Pairing PIN** | A 6-digit code the display node generates; entered in the web dashboard to link the two |
| **Passkeys** | The primary and only authentication method (using WebAuthn) |

---

## Project Structure

```
Canal4/
├── webapp/             # Web dashboard (React 19 + Vite SPA)
├── display/            # Desktop display node (Electron + React)
├── locales/            # Shared translation files (JSON)
├── spacetimedb/        # SpacetimeDB module (TypeScript reducers & schema)
├── docker-compose.yml  # Production deployment
└── .env.example        # Environment variable template
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org) | ≥ 22 | Web app & display node development |
| [SpacetimeDB CLI](https://spacetimedb.com/install) | ≥ 1.0 | Local development & module publishing |
| [Docker + Compose](https://docs.docker.com/get-docker/) | ≥ 24 | Production deployment |

---

## Quick Start — Local Development

### 1. Start SpacetimeDB locally

```bash
spacetime start
```

### 2. Build & publish the module

```bash
cd spacetimedb
npm install
npm run build          # compiles TypeScript → dist/bundle.js
spacetime publish canal4-dev
cd ..
```

### 3. Run the web dashboard

```bash
cd webapp
npm install
cp .env.example .env   # edit with your local values
npm run dev            # starts Vite dev server
```

Open [http://localhost:5173](http://localhost:5173).

### 4. Run the desktop display node

```bash
cd display
npm install
npm run dev            # starts Electron app
```

---

## Production Deployment (Docker Compose)

### 1. Build the SpacetimeDB module

The compiled module must be built locally before first deploy:

```bash
cd spacetimedb
npm install
npm run build         # → spacetimedb/dist/bundle.js
cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — only the following are required:

| Variable | Description | Default |
|---|---|---|
| `SPACETIMEDB_NAME` | Database name | `canal4-dev` |
| `SPACETIMEDB_URI` | Public SpacetimeDB WebSocket URI | `wss://maincloud.spacetimedb.com` |

### 3. Start all services

```bash
docker compose up -d
```

This starts:
- **SpacetimeDB** on `localhost:3000` (data persisted in a Docker volume)
- **module-init** — publishes `dist/bundle.js` into SpacetimeDB, then exits
- **Canal4 web webapp** on `http://localhost:3001` (Nginx serving SPA)

### 4. Re-deploy after schema changes

Whenever reducers or the schema are updated:

```bash
cd spacetimedb && npm run build && cd ..
docker compose run --rm module-init   # re-publishes the module
docker compose restart webapp         # restarts the webapp container
```

---

## Desktop Installers

Pre-built installers are published on each [GitHub Release](https://github.com/leocb/Canal4/releases).

### Building installers locally

```bash
cd display
npm install
npm run build            # builds for your current OS
```

Output goes to `display/dist/`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Real-time DB | [SpacetimeDB](https://spacetimedb.com) (TypeScript module) |
| Web frontend | React 19, Vite, react-router-dom, react-i18next |
| Desktop app | Electron 39, electron-vite, React |
| Auth | WebAuthn (Passkeys) |
| Styling | Vanilla CSS (glassmorphism design system) |
| Icons | [Lucide React](https://lucide.dev) |
| CI/CD | GitHub Actions (Docker builds & Electron installers) |
| Container | Docker + Nginx |

---

## License

[GNU Affero General Public License v3.0](LICENSE) — see `LICENSE` for details.
