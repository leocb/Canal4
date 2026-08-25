# Changelog

## [Unreleased] - Session Expiry & Reliability Fixes

### Fixed

#### CRITICAL - `login_with_passkey` now refreshes `lastLogin` on re-authentication
- **File:** `spacetimedb/src/index.ts`
- **Bug:** When a user re-authenticated via passkey and their identity already existed for the same user, `lastLogin` was never updated. This meant that even after a successful re-login, the server-side session remained stale/expired, leaving the user permanently locked out with "Sessao expirada" errors.
- **Fix:** Added an `else` branch to update `lastLogin` via `ctx.db.UserIdentity.identity.update()` whenever the existing identity matches the authenticating user.

#### HIGH - `extendSession` errors now handled; force re-login on session expiry
- **File:** `webapp/src/App.tsx`
- **Bug:** The `extendSession()` reducer was called on reconnect but its returned Promise was never awaited or caught. If the session had expired server-side, the error was silently swallowed and the user appeared "logged in" (subscription data was present) while being unable to perform any action.
- **Fix:** Added `.catch()` to the `extendSession()` call. On `session_expired` the auth token is cleared and the user is redirected to `/login`.

#### HIGH - Periodic session heartbeat (every 5 minutes)
- **File:** `webapp/src/App.tsx`
- **Bug:** `extendSession()` was called only once per connection transition. With no periodic keep-alive, the server-side session could expire while the user was actively using the app (e.g. tab left open for extended periods).
- **Fix:** Added a `setInterval` that calls `extendSession()` every 5 minutes while the user is online and logged in. The interval is properly cleaned up on disconnect/logout. Also handles session expiry mid-heartbeat.

#### MEDIUM - Removed debug `console.log` from `UserIdentitySelfView`
- **File:** `spacetimedb/src/schema.ts`
- **Bug:** A `console.log("UserIdentitySelfView", ctx.sender, ui)` statement was left in the view definition, causing server log spam on every subscription evaluation for every connected client.
- **Fix:** Removed the `console.log` call.

#### MEDIUM - Removed redundant `VenueMember` query in `send_message`
- **File:** `spacetimedb/src/index.ts`
- **Bug:** The `send_message` reducer queried `VenueMember.venue_member_venue_id.filter(ch.venueId)` twice to find the caller's membership. The second query (`myVenueMembership`) was unnecessary since the identical result was already stored in `member`.
- **Fix:** Replaced `myVenueMembership?.role.tag` with `member.role.tag`, eliminating the duplicate database scan.
