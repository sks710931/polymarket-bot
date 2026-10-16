# ADR 0002 — React and Vite frontend

- **Status:** Accepted
- **Date:** 2026-10-16
- **Task:** I1-001.01 (issue #2)

## Context

Architecture §2 and UX §§2–4 require a strict TypeScript browser shell from Iteration 1: ten navigable routes, dark and light themes, and a first-launch wizard. Public market data must remain visible before MetaMask login. The browser is not the trading process and must not receive CLOB credentials.

## Decision

1. `apps/web` is a React application built with Vite and strict TypeScript.
2. Styling uses Tailwind. Server state uses TanStack Query against the generated OpenAPI client from `packages/shared-contracts`.
3. The browser talks only to the single desk origin in ADR 0004. It does not call Polymarket, BTC venues, or SQL directly.
4. Wallet UI uses a maintained browser-wallet library chosen in I1-004. Architecture allows viem/wagmi or another maintained compatible library. This record does not pick a version. The implementation cites the library release it actually integrates. Login is a signed challenge, not a transaction or token approval.
5. No server secret is exposed through `VITE_*` variables, import.meta env, or the production bundle. Client configuration may contain only the public origin and non-secret product labels.
6. Future-iteration screens ship as honest empty states. The client cannot switch the backend mode. The visible I1 mode is OBSERVE (ADR 0007).
7. `apps/web` may depend on `packages/shared-contracts` and browser UI libraries. It must not import `apps/server`, `packages/persistence`, `packages/polymarket-adapter`, `packages/application`, or `packages/market-data`.

## Consequences

- Page reloads restore state from the server, not from a private client cache of account data.
- Pre-login screens call only the anonymous routes in ADR 0006.
- A wallet showing as connected in the extension is `BrowserConnected` until `POST /api/v1/auth/verify` succeeds.

## Non-authorization

The frontend has no order ticket, paper runner, forecast calculator, or code path that asks for a seed phrase or private key.
