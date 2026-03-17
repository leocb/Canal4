# Canal4

**Canal4** is an open-source, real-time broadcast notification system for venues. It lets venue staff send structured broadcast messages through a web dashboard, which are instantly delivered and displayed as scrolling ticker banners on dedicated desktop display nodes (e.g. lobby TVs, back-office screens).

Built on [SpacetimeDB](https://spacetimedb.com) for real-time, low-latency synchronization — no polling, no REST round-trips.

---

## How It Works

```
┌─────────────────────────────────┐
│   Web Dashboard (Canal4 webapp) │   ← Venue staff send broadcasts here
│   React + Express · Port 3001   │
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

---

## Project Structure

```
spacetimedb-node-project/
├── webapp/             # Web dashboard (React + Vite SPA + Express API server)
├── display/          # Desktop display node (Electron + React)
├── spacetimedb/        # SpacetimeDB module (TypeScript reducers & schema)
├── docker-compose.yml  # Production deployment
└── .env.example        # Environment variable template
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org) | ≥ 22 | Web app & display node |
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
spacetime publish --skip-clippy canal4-dev
cd ..
```

### 3. Run the web dashboard

```bash
cd webapp
npm install
cp .env.example .env   # edit with your local values
npm run dev            # starts Vite dev server + Express API on :3001
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

The compiled module must be built locally before first deploy (the module publisher runs as a one-shot Docker container):

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

Edit `.env` — the key values:

| Variable | Description |
|---|---|
| `SPACETIMEDB_NAME` | Database name (e.g. `canal4`) |
| `SPACETIMEDB_URI` | Public WebSocket URI browsers connect to (e.g. `wss://yourdomain.com`) |
| `SPACETIMEDB_SERVER_PRIVATE_KEY` | Secret key for server-to-DB calls (generated on first publish) |
| `SMTP_*` | Outgoing email for login PIN delivery |

### 3. Start all services

```bash
docker compose up -d
```

This starts:
- **SpacetimeDB** on `localhost:3000` (data persisted in a Docker volume)
- **module-init** — publishes `dist/bundle.js` into SpacetimeDB, then exits
- **Canal4 web app** on `localhost:3001`

### 4. Re-deploy after schema changes

Whenever reducers or the schema are updated:

```bash
cd spacetimedb && npm run build && cd ..
docker compose run --rm module-init   # re-publishes the module
docker compose restart webapp         # picks up any env changes
```

### Putting it behind a reverse proxy (HTTPS)

Point Nginx/Caddy at `localhost:3001` for the web app and `localhost:3000` for the SpacetimeDB WebSocket. Update `SPACETIMEDB_URI` in `.env` to `wss://yourdomain.com` (no rebuild needed — it's injected at request time).

Example minimal Caddy config:

```
yourdomain.com {
    reverse_proxy /v1/* localhost:3000
    reverse_proxy * localhost:3001
}
```

---

## Desktop Installers

Pre-built installers are published on each [GitHub Release](https://github.com/leocb/Canal4/releases):

| Platform | File |
|---|---|
| macOS (Apple Silicon) | `Canal4 Display node-*-arm64.dmg` |
| macOS (Intel) | `Canal4 Display node-*-x64.dmg` |
| Windows | `Canal4 Display node-*-windows-setup.exe` |

### Building installers locally

```bash
cd display
npm install

npm run build:mac        # both Intel + Apple Silicon DMGs
npm run build:mac:intel  # Intel only
npm run build:mac:silicon # Apple Silicon only
npm run build:win        # Windows NSIS installer
```

Output goes to `display/dist/`.

---

## Internationalization

The UI is fully internationalized. Use the Crowdin platform to translate the application.
If the language you want to translate is not available on Crowdin, open an issue requesting it.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Real-time DB | [SpacetimeDB](https://spacetimedb.com) (TypeScript module) |
| Web frontend | React 19, Vite, react-router-dom, react-i18next |
| Web backend | Node.js, Express (serves SPA + `/api/request-pin`) |
| Desktop app | Electron 39, electron-vite, React |
| Styling | Vanilla CSS (glassmorphism design system) |
| Icons | [Lucide React](https://lucide.dev) |
| Installer | electron-builder (DMG + NSIS) |
| CI/CD | GitHub Actions |
| Container | Docker + Docker Compose |

---

## License

[GNU Affero General Public License v3.0](LICENSE) — see `LICENSE` for details.

Canal4 is free software: you may use, study, modify, and distribute it under the terms of the AGPLv3. If you deploy a modified version as a network service, you must make the modified source available.
