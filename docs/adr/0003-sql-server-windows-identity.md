# ADR 0003 — SQL Server with Windows identity

- **Status:** Accepted
- **Date:** 2026-10-16
- **Task:** I1-001.01 (issue #2)

## Context

Architecture §2 selects local Microsoft SQL Server and prefers Windows Integrated Authentication so the repo does not carry a database password. The same section says the Node driver must be proved under the real process identity. That proof is I1-002.01, not this record.

I1 stores operator sessions, account-mapping evidence, market publications, feed health, incidents, and configuration versions. It does not store L2 secrets or wallet keys. Migrations run from an explicit command, not from process startup.

## Decision

1. The only database is a local Microsoft SQL Server instance. I1 does not fall back to SQLite, an embedded engine, or another server product.
2. The intended authentication mode is Windows Integrated Authentication for the identity of the Node process. `.env.example` names the server and database only (`DESK_SQL_SERVER`, `DESK_SQL_DATABASE`). It does not define a SQL user or password variable on this path.
3. The Node driver is **not** chosen here. I1-002.01 selects a driver only after a bounded smoke test reports that integrated authentication works for that driver, runtime, and process identity. The smoke output must not print credentials.
4. If that smoke test shows integrated authentication is unsupported, implementation stops on the database path and documents one explicit alternate credential mechanism. It does not silently switch drivers, servers, or authentication modes. Alternate credentials are still never logged, committed, or returned to the browser.
5. Schema changes run only through an explicit migration command. Startup checks compatibility and fails with an actionable diagnostic when the schema is missing or wrong.
6. Money, prices, and quantities that reach SQL use decimal types. Unknown stays unknown. Raw `POLYMARKET_API_*` values and MetaMask secrets are not columns.

## Consequences

- Readiness may depend on this database (ADR 0006), but a failed external market feed does not by itself mark the database down.
- CI does not require the owner’s SQL instance. Tests that need SQL stay separate from deterministic CI, and a missing instance is reported as not run.
- Claiming “Windows auth works” without the I1-002.01 smoke result is a false pass.

## Non-authorization

A working database does not authorize paper fills, live orders, or storing signing keys.
