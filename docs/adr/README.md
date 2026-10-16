# Architecture decision records

Accepted records for Iteration 1 runtime choices. Later tasks cite these instead of re-deciding them.

| ADR | Decision |
|---|---|
| [0001](0001-single-fastify-process.md) | One Node.js process, Fastify, pnpm workspace |
| [0002](0002-react-vite-frontend.md) | React, Vite, strict TypeScript browser app |
| [0003](0003-sql-server-windows-identity.md) | Local SQL Server, Windows integrated identity intended |
| [0004](0004-loopback-https-single-origin.md) | Loopback HTTPS, one browser origin |
| [0005](0005-server-sent-events-transport.md) | Server-Sent Events, not WebSocket |
| [0006](0006-public-read-access-boundary.md) | Anonymous public reads and the endpoint access matrix |
| [0007](0007-i1-observe-boundaries-and-sdk-proof.md) | OBSERVE-only I1 composition, module direction, SDK proof rules |

[Architecture.md](../../Architecture.md) remains the system contract. These ADRs resolve the I1 choices that document left open, including the public-market exception to authenticated APIs. They do not authorize order signing, exchange writes, paper execution, model forecasts, or non-loopback hosting.

## Review evidence (I1-001.01)

Reviewed on 2026-10-16 against Architecture §§2–5 and §§12–14 and UX §§3–4, plus the Iteration 1 plan’s public-market acceptance step.

No runtime, SQL, wallet, exchange, or SDK command was run. Driver support and `@polymarket/client` private-read behavior stay unproven here; ADR 0003 and ADR 0007 say what later tasks must prove, and that an unavailable prerequisite stays blocked.

Review corrections clarify the development-only Vite process exception and require explicit credential-header filtering at the Fastify-to-Vite proxy. ADR 0004 assigns concrete proxy isolation checks to I1-001.03; those checks remain unrun until the runtime is implemented.
