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
cd Canal4
```

### Install prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | ≥ 22 | Development |
| SpacetimeDB CLI | ≥ 2.0.5 | Logic & Schema |
| Docker + Compose | ≥ 24 | Deployment |

### Set up the local dev environment

```bash
# 1. Start SpacetimeDB locally
spacetime start

# 2. Build & publish the module
cd spacetimedb && npm install && npm run build && npm run publish-local
cd ..

# 3. Start the web dashboard (Vite)
cd webapp
npm install
cp .env.example .env
# Edit .env with your local SpacetimeDB values if needed
npm run dev

# 4. (Optional) Start the desktop display node (Electron)
cd ../display
npm install
npm run dev
```

---

## Development Workflow

### Making changes to the SpacetimeDB module

1. Edit `spacetimedb/src/index.ts` (reducers) or `spacetimedb/src/schema.ts` (tables)
2. Rebuild: `cd spacetimedb && npm run build`
3. Republish: `npm run deploy-local`

### Adding a new UI string

1. Add the key to `locales/en.json` (and other languages if applicable). Since both apps share the same file, the key will be available to both.
2. Use `t('your.key')` in the React component — never hardcode user-visible strings.

### Authentication (Passkeys)

Canal4 uses **WebAuthn (Passkeys)** for all user accounts.
- When developing locally, ensure you are using a browser that supports WebAuthn (Chrome, Edge, Safari, Firefox).
- Note that WebAuthn may behave differently over `localhost` vs `127.0.0.1` in some browsers; consistently using one is recommended.

---

## Submitting a Pull Request

1. **Create a branch** from `main`:s
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes.** Keep commits focused and atomic.

3. **Test locally** — both the web app and (if relevant) the desktop app.

4. **Check for TypeScript errors**:
   ```bash
   cd webapp && npx tsc -b
   cd ../display && npm run typecheck
   ```

5. **Open a PR** against `main` with:
   - A clear title describing what changed.
   - A short description of *why* (not just *what*).
   - Steps to test, if non-obvious.

### PR checklist

- [ ] No hardcoded user-visible strings (use `t()` with locale keys).
- [ ] New locale keys added to `locales/en.json`.
- [ ] TypeScript types are valid.
- [ ] If schema changed: bindings were regenerated and committed.

---

## Reporting Bugs

Open a [GitHub Issue](https://github.com/leocb/Canal4/issues) with:

- **What you expected** to happen.
- **What actually happened** (include console errors/logs if available).
- **Steps to reproduce**.
- **Environment**: OS, browser/Electron version, SpacetimeDB version.

---

## Commit Style

Use short, imperative commit messages:

```
feat: add channel role badge to venue list
fix: locale key missing for connection_error
chore: update SpacetimeDB module dependencies
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
| `refactor:` | Code restructure |
| `i18n:` | Locale / translation changes |

---

## License

By contributing to Canal4, you agree that your contributions will be licensed under the [AGPLv3](LICENSE).
