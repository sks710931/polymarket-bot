# ADR 0001 — One Node.js Fastify process

- **Status:** Accepted
- **Date:** 2026-10-16
- **Task:** I1-001.01 (issue #2)

## Context

Architecture §2 chooses a single-instance modular monolith: Node.js LTS, strict TypeScript, and Fastify, so the official `@polymarket/client` can run in-process without a language bridge. Background work is in-process. The GUI is an operator surface; closing the browser does not start or stop a backend run.

Iteration 1 has no second backend service to justify another application process. A separate Vite process is permitted only as development tooling, under the loopback proxy boundary in ADR 0004.

## Decision

1. One application backend process hosts the HTTP API, the single-origin web shell (ADR 0004), supervised collectors, and later in-process workers. In start mode this is the only application process. In dev mode one separate Vite helper may serve frontend assets on `http://127.0.0.1:5173` behind Fastify; it hosts no API, collector, signing, execution, or account service. The browser still uses only the canonical HTTPS origin.
2. The HTTP framework is Fastify. Application routes live under `/api/v1`. Process probes live at `/health/live` and `/health/ready`.
3. The workspace package manager is **pnpm**. Scaffolding uses pnpm workspaces and a lockfile. Do not mix npm or Yarn installs in the same tree.
4. Node.js is the Active LTS on the scaffold date. I1-001.02 records the exact version in the engine field and lockfile after checking the release line. This record does not freeze a version number in advance, and it forbids a floating `latest` runtime.
5. I1 registers no second listener for a worker, admin port, or public bind. Collectors do not open their own browser-facing port.
6. The I1 composition root wires read-only modules only (ADR 0007). A second process must not be introduced to host signing or execution.

## Consequences

- Restart, logs, and the SQL fencing lease (when later iterations need it) refer to this one process.
- pnpm’s non-hoisted layout is part of the import-boundary plan in ADR 0007.
- CI uses the same pinned Node line and pnpm version as the workspace.
- Kafka, Redis, a separate realtime gateway, and a non-Node trading sidecar are out of scope.

## Non-authorization

This decision does not enable order signing, exchange writes, paper execution, forecasts, or a bind address other than loopback.
