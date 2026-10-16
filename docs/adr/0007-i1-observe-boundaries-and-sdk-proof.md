# ADR 0007 — I1 OBSERVE boundaries and SDK proof

- **Status:** Accepted
- **Date:** 2026-10-16
- **Task:** I1-001.01 (issue #2)

## Context

Iteration 1 is an observe-and-read desk: wallet login, public BTC 5-minute markets, and private account reads only where a mapping is proved. Architecture §§1, 2, 4, 9, and 14 separate `OBSERVE`, `PAPER`, and `LIVE`, and they keep exchange writes out until Iteration 6. The browser must not import credential or persistence modules.

The official SDK’s current secure-client constructor is a compatibility fact to recheck, not something this record invents. Architecture §2.1 already states the documented L1/L2 split; whether today’s `@polymarket/client` can perform private reads without a signer is unproved until the I1-005 probe.

## Decision

### I1 capabilities

The only runtime mode is `OBSERVE`.

Registered capabilities are:

- local HTTPS shell and the access matrix in ADR 0006
- MetaMask challenge login for one operator allowlist (`DESK_OPERATOR_ALLOWLIST`, addresses only, never logged)
- server-side L2 **read** probes using `POLYMARKET_API_KEY`, `POLYMARKET_API_PASSPHRASE`, and `POLYMARKET_API_SECRET` from the server process environment
- public market catalog, validated books, and public BTC venue observations
- persisted sessions, mapping evidence, market publications, feed health, and incidents
- authenticated collector reconnect

Not I1 capabilities, and not represented by a disabled live adapter:

- order signing, session keys, and any `OrderSigning` capability
- exchange place, cancel, replace, or transfer
- paper execution and paper accounts
- probability forecasts, opportunity proposals, and risk approvals that submit trades
- non-loopback hosting (ADR 0004)

The signer capability enum exposed to the UI is `unavailable` until a later iteration proves otherwise. I1 does not report `verified-capable`. `I6 Live signer readiness` stays `not configured`.

### Module direction

Target packages follow Architecture §14. The I1 scaffold (issue #3) creates only:

`apps/web`, `apps/server`, `packages/domain`, `packages/application`, `packages/polymarket-adapter`, `packages/market-data`, `packages/persistence`, `packages/shared-contracts`.

`packages/model`, `packages/strategies`, and `packages/execution` are not created in I1. Creating them “empty but wired” is out of scope.

Import direction:

| Package | May depend on | Must not depend on |
|---|---|---|
| `domain` | Nothing in this repo except its own types | Fastify, React, SDK, SQL, env secrets |
| `application` | `domain` and port interfaces | SDK clients, SQL drivers, Fastify, React |
| `polymarket-adapter`, `market-data`, `persistence` | `domain` ports and their own infrastructure libraries | Each other’s private internals; browser code |
| `shared-contracts` | Schema library and generated types | Server env, SDK, SQL |
| `apps/server` | All server-side packages, as the composition root | — |
| `apps/web` | `shared-contracts` and browser libraries | `apps/server`, `application`, adapters, `persistence`, `market-data` |

The server composition root for I1 does not import an order-write or paper-execution module. CI for the scaffold rejects those imports and rejects a browser import of server credential modules.

### SDK and driver proof rules

These are requirements on later tasks. They are not a claim that the proof already passed.

1. Pin an exact `@polymarket/client` version in the lockfile after reading that version’s release notes. Do not depend on `latest` or an unbounded range.
2. I1-005 rechecks the official authentication docs for the pinned version and records the citation date in the evidence file.
3. The private-read probe must succeed **without** a private order signer. If the secure client requires a signer, do not generate a dummy key, do not ask for a seed phrase, and do not create or rotate API keys. Implement only a documented L2 HMAC read transport, or a typed wrapper limited to documented read endpoints.
4. That transport’s allowlist is read methods only. Place, cancel, and credential-management methods are not wrapped “for later”.
5. If credentials, network, or the account are unavailable, the result is `blocked` or `unauthorized` with a sanitized reason. It is not a mocked success.
6. SQL integrated authentication is proved only by the I1-002.01 smoke test (ADR 0003). This record does not name a driver and does not claim the test passed.
7. Session keys stay unused. Whether they fit this account is an I1-009 document, not a key provisioned now.

## Consequences

- Unknown account fields stay `null`. They are not coerced to zero.
- L2 secrets exist only in the server process environment. They are absent from browser bundles, logs, SQL rows, SSE frames, screenshots, and git.
- A green I1 build can still have account reads **blocked**. Public markets can work in that state (ADR 0006).

## Non-authorization

No sentence in this ADR authorizes order signing, exchange writes, paper execution, model forecasts, or non-loopback hosting. Those remain later-iteration work, each behind its own gate.
