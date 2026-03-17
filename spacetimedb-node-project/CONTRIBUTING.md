# Contributing to Canal4

Thanks for your interest in contributing! Canal4 is an AGPLv3-licensed open-source project and welcomes bug reports, feature requests, and pull requests.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Commit Style](#commit-style)

---

## Code of Conduct

Be respectful and constructive. Harassment, personal attacks, and dismissive behaviour are not welcome.

---

## Getting Started

### Fork & clone

```bash
git clone https://github.com/YOUR_USERNAME/Canal4.git
cd Canal4/spacetimedb-node-project
```

### Install prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 22 |
| SpacetimeDB CLI | ≥ 1.0 |
| Docker + Compose | ≥ 24 (optional, for full-stack testing) |

### Set up the local dev environment

```bash
# 1. Start SpacetimeDB locally
spacetime start

# 2. Build & publish the module
cd spacetimedb && npm install && npm run build
spacetime publish --skip-clippy canal4-dev
cd ..

# 3. Start the web dashboard
cd client && npm install && cp .env.example .env
# Edit .env with your local SpacetimeDB values
npm run dev

# 4. (Optional) Start the desktop display node
cd ../messenger && npm install && npm run dev
```

---

## Project Structure

```
spacetimedb-node-project/
│
├── spacetimedb/          # SpacetimeDB module (TypeScript)
│   ├── src/
│   │   ├── index.ts      # All reducers (business logic)
│   │   └── schema.ts     # Table definitions
│   └── dist/bundle.js    # Compiled output (committed for Docker deploy)
│
├── client/               # Web dashboard
│   ├── src/
│   │   ├── pages/        # Route-level React components
│   │   ├── components/   # Shared UI components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── locales/      # i18n JSON files (en, pt-BR)
│   │   └── module_bindings/  # Auto-generated SpacetimeDB client types
│   └── server.js         # Express: serves SPA + /api/request-pin + /env-config.js
│
├── messenger/            # Desktop display node (Electron)
│   └── src/
│       ├── main/         # Electron main process
│       └── renderer/     # React renderer (pages, hooks, locales)
│
├── docker-compose.yml    # Production orchestration
└── .env.example          # Environment template
```

---

## Development Workflow

### Making changes to the SpacetimeDB module

1. Edit `spacetimedb/src/index.ts` (reducers) or `spacetimedb/src/schema.ts` (tables)
2. Rebuild: `cd spacetimedb && npm run build`
3. Republish: `spacetime publish --skip-clippy canal4-dev`
4. Regenerate client bindings if the schema changed:
   ```bash
   spacetime generate --lang typescript --out-dir client/src/module_bindings canal4-dev
   spacetime generate --lang typescript --out-dir messenger/src/renderer/src/module_bindings canal4-dev
   ```

### Adding a new UI string

1. Add the key to `client/src/locales/en.json` (and `messenger/src/renderer/src/locales/en.json` if it's in the desktop app)
2. Add the Portuguese translation to the corresponding `pt-BR.json`
3. Use `t('your.key')` in the component — never hardcode user-visible strings

### Adding a new page (web app)

1. Create `client/src/pages/YourScreen.tsx`
2. Register the route in `client/src/App.tsx`
3. Wrap with `<ProtectedRoute>` if login is required

---

## Submitting a Pull Request

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes.** Keep commits focused and atomic.

3. **Test locally** — both the web app and (if relevant) the desktop app.

4. **Check for TypeScript errors**:
   ```bash
   cd client && npm run typecheck
   cd ../messenger && npm run typecheck
   ```

5. **Open a PR** against `main` with:
   - A clear title describing what changed
   - A short description of *why* (not just *what*)
   - Steps to test, if non-obvious

### PR checklist

- [ ] No hardcoded user-visible strings (use `t()` with locale keys)
- [ ] New locale keys added to both `en.json` and `pt-BR.json`
- [ ] TypeScript errors resolved
- [ ] If schema changed: `dist/bundle.js` rebuilt and committed

---

## Reporting Bugs

Open a [GitHub Issue](https://github.com/leocb/Canal4/issues) with:

- **What you expected** to happen
- **What actually happened** (include console errors/logs if available)
- **Steps to reproduce**
- **Environment**: OS, browser/Electron version, SpacetimeDB version

---

## Commit Style

Use short, imperative commit messages:

```
feat: add channel role badge to venue list
fix: locale key missing for connection_error
chore: rebuild SpacetimeDB module bundle
docs: update deploy instructions in README
```

Prefix convention:

| Prefix | Use for |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `chore:` | Build, tooling, dependencies |
| `docs:` | Documentation only |
| `style:` | Formatting, CSS tweaks |
| `refactor:` | Code restructure without behaviour change |
| `i18n:` | Locale / translation changes |

---

## License

By contributing to Canal4, you agree that your contributions will be licensed under the [AGPLv3](LICENSE).
