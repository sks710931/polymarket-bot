# ADR 0005 — Server-Sent Events for the GUI

- **Status:** Accepted
- **Date:** 2026-10-16
- **Task:** I1-001.01 (issue #2)

## Context

Architecture §2 left the GUI transport as “Server-Sent Events or authenticated WebSocket” for I1 to choose. The server reconciles venue feeds and sends coalesced snapshots. The browser must not hold exchange credentials or consume raw venue ticks.

Two product rules pull in opposite directions if there is only one authenticated socket:

- UX §3.3 and §4, and the Iteration 1 acceptance script, show public markets before wallet login.
- Account, incident, and control data require an owner session (ADR 0006).
- I1 controls are ordinary form posts (logout and collector reconnect), not messages on a bidirectional socket.

## Decision

Use **Server-Sent Events**. Do not open a WebSocket for the GUI in I1.

1. `GET /api/v1/stream/public` is anonymous. It emits only public event types: `market.snapshot` and public `feed.health`.
2. `GET /api/v1/stream/session` requires the owner session cookie and the canonical origin. It may emit operator-scoped snapshots defined in ADR 0006. Logout and session expiry close it.
3. The two streams are separate connections. The public stream never upgrades in place to include private fields. The server does not multiplex private frames onto a public listener.
4. Events are versioned envelopes from `packages/shared-contracts`, coalesced to a bounded GUI rate. Each market payload carries market id, token id, epoch, and quality. A heartbeat does not mark a book executable.
5. On connect and reconnect the client fetches the authoritative REST snapshot and replaces local state. `Last-Event-ID` is not an authority and is not used to replay a private backlog.
6. Slow clients are disconnected when their bounded queue overflows. Disconnect does not change server book validity.
7. Mutations do not travel on SSE. I1 mutations use the CSRF-protected routes in ADR 0006.

## Why this rejects WebSocket

A WebSocket would be a second command channel for an app whose I1 commands are CSRF-protected POSTs. An authenticated socket also cannot serve the required pre-login market view without a second public socket, which SSE already expresses as two GET streams on the same origin. Cookie-authenticated WebSocket handshakes would still need the same origin checks, with fewer browser-native reconnect semantics.

Later iterations may add event types on the session stream. They need a new ADR to replace SSE with WebSocket.

## Consequences

- Issue #26 implements these two routes and the reconnect rule.
- Proxies and the dev Fastify proxy must flush SSE without buffering the whole response.
- Public and session event schemas are generated with the REST contracts. Private fields are not optional fields on the public schema.

## Non-authorization

Streaming does not authorize order entry, paper execution, or forecast events. Forecast, opportunity, run, order, and portfolio event names in Architecture §13 are not registered in I1.
