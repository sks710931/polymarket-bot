# ADR 0006 — Public-read access boundary

- **Status:** Accepted
- **Date:** 2026-10-16
- **Task:** I1-001.01 (issue #2)

## Context

Architecture §13 said every internal `/api/v1` route requires an owner session except an explicitly public, non-sensitive health output. The Iteration 1 plan and UX §§3–4 also require the current BTC 5-minute market to be visible before MetaMask login, including when the account is disconnected or L2 credentials are missing.

Those rules are both kept. The anonymous set is a narrow public-read boundary, not an open API. Anonymous responses must not reveal account data or environment information: credential presence or values, operator addresses, Windows or SQL identity, connection strings, incident narratives, host eligibility, or SDK/host inventory beyond what is already in the browser bundle.

Login challenge issuance cannot require a session, because the session does not exist yet. After a session exists, state-changing routes need CSRF protection.

## Decision

Every route below is either registered in I1 under this policy or listed as **not registered**. A handler that exists but is “disabled” by a flag does not satisfy “not registered”.

Session means the ADR 0004 cookie for an unexpired owner session. CSRF means a token returned only by an authenticated `GET /api/v1/auth/session`, echoed in `X-CSRF-Token`, plus an `Origin` of the canonical desk origin. Challenge and verify run before a cookie exists, so they use origin binding and a one-use nonce instead of that CSRF token.

Private routes without a session return **401** and a typed unauthenticated body. They do not return resource payloads. Public market routes that do not know the requested market return a typed not-found or empty market state with no account fields.

### Endpoint access matrix

| Class | Method and path | Caller | CSRF | What the body may contain | I1 |
|---|---|---|---|---|---|
| Public read | `GET /health/live` | Anonymous | No | Process liveness only (`live`). No database, credential, host, or version detail. | Registered |
| Public read | `GET /health/ready` | Anonymous | No | Coarse `ready` or `not-ready`, plus checks `database`, `schema`, and `operatorConfig` as `ok`, `unavailable`, `incompatible`, or `invalid`. No server name, SQL login, allowlist address, credential name, or connection error text. External feed failure is not a readiness failure. | Registered |
| Challenge bootstrap | `POST /api/v1/auth/challenge` | Anonymous | Origin check, no session CSRF | One-use nonce and the public challenge text (origin, purpose, issue, expiry, chain). No session and no account profile. Rate limited. | Registered |
| Challenge bootstrap | `POST /api/v1/auth/verify` | Anonymous | Origin check, no session CSRF | Sets the session cookie on success. Failure reasons are the sanitized set in the Iteration 1 plan (rejected, expired, replay, wrong origin, wrong wallet, bad signature, not allowlisted). No L2 material. | Registered |
| Private read | `GET /api/v1/auth/session` | Anonymous or session | No | Without a session: `{ "authenticated": false }` only. With a session: operator address, expiry, and the CSRF token. No balances and no credential values. | Registered |
| Control | `POST /api/v1/auth/logout` | Session | Yes | Clears the session. Idempotent. Does not stop a future backend trading run (none exists in I1). | Registered |
| Public read | `GET /api/v1/markets/current` | Anonymous | No | Current BTC 5m identity, window, rules, token mapping, lifecycle, provenance. Unknown fields are null. No account or environment block. | Registered |
| Public read | `GET /api/v1/markets/upcoming` | Anonymous | No | Same public market shape for the next window, or an explicit empty state. | Registered |
| Public read | `GET /api/v1/markets/{id}` | Anonymous | No | One public market by id, or typed not-found. | Registered |
| Public read | `GET /api/v1/markets/{id}/book` | Anonymous | No | `ValidatedBookView` for that market’s own token pair: decimal strings, epoch, source and receive times, quality, public invalid reasons. Reasons come from a fixed market-data vocabulary, not raw provider errors. | Registered |
| Public read | `GET /api/v1/feeds/health` | Anonymous | No | Public Polymarket book and BTC venue quality: source id, instrument, quote asset, age, state. No SQL, credentials, incidents, or operator data. | Registered |
| Stream | `GET /api/v1/stream/public` | Anonymous | No | SSE envelopes for `market.snapshot` and public `feed.health` only. See ADR 0005. | Registered |
| Private read | `GET /api/v1/integrations/status` | Session | No | Enums only: L2 `missing`, `configured`, `authenticated`, `unauthorized`, or `unavailable`; sanitized probe codes; pinned SDK version string; OBSERVE mode. Never secret values, key prefixes, or env dumps. | Registered |
| Private read | `GET /api/v1/integrations/eligibility` | Session | No | Host-check diagnostic `supported`, `blocked`, `unknown`, or `unavailable`, with a sanitized reason and the time of the check. Not legal clearance and not a live-trading switch. | Registered |
| Private read | `GET /api/v1/account/identity` | Session | No | Browser signer, trading wallet, wallet type, mapping verified flag, and reasons. Unverified mapping stays unverified. | Registered |
| Private read | `GET /api/v1/account/balance` | Session and verified mapping | No | Collateral decimal string, asset id, retrieve time. Otherwise nulls and reasons. Unknown is not zero. Denied until mapping is verified. | Registered |
| Private read | `GET /api/v1/account/positions` | Session and verified mapping | No | Exchange-reported positions for the verified account only. | Registered |
| Private read | `GET /api/v1/account/orders` | Session and verified mapping | No | Existing exchange orders for the verified account only. Not bot orders. | Registered |
| Private read | `GET /api/v1/incidents` | Session | No | Sanitized severity, times, affected capability, and next step. No secrets, stack traces, or connection strings. | Registered |
| Stream | `GET /api/v1/stream/session` | Session | Origin check | SSE for session-scoped account, integration, and incident snapshots. Payloads obey the same redaction as the private reads. Closed on logout or expiry. | Registered |
| Control | `POST /api/v1/feeds/reconnect` | Session | Yes | Audited request to restart a named public collector. Not an order retry. Idempotent per collector. | Registered |
| Absent | Forecast, model, opportunity, risk, paper, live, `POST /api/v1/orders`, cancel, and transfer routes | — | — | Not registered. No I1 module mounts them. | Absent |

### Public response ban

Anonymous handlers, including their errors and SSE frames, must not include:

- `POLYMARKET_API_KEY`, `POLYMARKET_API_PASSPHRASE`, `POLYMARKET_API_SECRET`, or whether those variables are present
- operator allowlist entries, session ids, or CSRF tokens
- balances, positions, orders, wallet mapping, or another market’s book
- SQL errors, Windows identity, hostnames, certificate paths, or eligibility text
- incident records or collector control results

Credential status is shown only after login, which matches UX §4 step 3. The pre-login welcome copy for “local computer” and “Observe mode” comes from the client shell, not from an anonymous environment probe.

### Challenge bootstrap rules

- The challenge binds the canonical origin, the address, Polygon chain id, purpose `desk-login`, issue time, expiry, and a cryptographic one-use nonce.
- Verify atomically consumes the nonce. Replay and concurrent reuse fail.
- A browser wallet connection without a successful verify is not a session.
- These routes are rate limited. Exact thresholds are server configuration chosen in I1-004, and they default to on.

### Streaming rule

Public listeners receive public streams only. Session streams are a different URL. Sending a private payload to a public subscriber is a defect, not a filtered field on a shared event.

### Controls

I1 registers two mutations: logout and feed reconnect. Both require a session and CSRF. No control route accepts an order price, size, token id, or mode change.

## Consequences

- Issue #8’s health payloads, issue #14’s auth guards, issue #21’s market routes, and issue #26’s streams implement this matrix.
- OpenAPI marks anonymous and session operations explicitly so the generated client does not attach account types to public calls.
- Adding a public field that describes the account or the host environment requires a revision of this ADR.

## Non-authorization

The public market surface is read-only observation. Nothing in this matrix authorizes order signing, exchange place/cancel/transfer, paper execution, model forecasts, or non-loopback hosting.
