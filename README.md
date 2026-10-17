# Polymarket Trading Desk

A local, single-operator BTC five-minute observation desk. This checkout implements the **issue #3 workspace scaffold**, not a running trading product.

## Prerequisites

- Node.js **24.22.0** (the pinned Active LTS release; see `.nvmrc` and `.node-version`).
- pnpm **10.5.2**, matching `packageManager` and `engines`. If needed, install this exact version with your preferred package-manager setup.
- No SQL instance, wallet, exchange credentials, or certificate is needed to build and validate this scaffold.

The project intentionally rejects other Node/pnpm versions instead of silently selecting another runtime. On the development PC, an ignored local Node runtime can be selected for the current PowerShell session:

```powershell
$env:PATH = (Join-Path (Get-Location) '.tools/node-v24.22.0-win-x64') + [IO.Path]::PathSeparator + $env:PATH
```

That local runtime is not required for a clean checkout with the correct Node version installed.

## Install and verify

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
```

Third-party install scripts are not needed by this scaffold. The lockfile records exact dependency resolutions and integrity hashes. Node and SDK versions are reviewed in [the toolchain record](docs/development/toolchain.md).

Individual checks:

```powershell
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
```

`typecheck` first builds the backend/library project references and declarations, then checks the browser project. `build` also bundles the browser with Vite. Library and server output is emitted into each workspace's `dist/`; the browser bundle is `apps/web/dist/`.

There is deliberately no operator-facing `dev` or `start` command yet. [Issue #4](https://github.com/sks710931/polymarket-bot/issues/4) owns the canonical HTTPS origin, local configuration and development proxy. `createServer()` creates an unbound Fastify instance with no registered routes. It does not claim liveness/readiness, connect an account or make an exchange call.

## Workspaces

| Workspace                     | Purpose                                          | Allowed production dependencies  |
| ----------------------------- | ------------------------------------------------ | -------------------------------- |
| `packages/domain`             | Framework-free types and OBSERVE constant        | None                             |
| `packages/application`        | Read-only composition and future ports/use cases | Domain                           |
| `packages/polymarket-adapter` | Unconfigured read-adapter descriptor; SDK pin    | Domain, official SDK             |
| `packages/market-data`        | Unconfigured market-data descriptor              | Domain                           |
| `packages/persistence`        | Unconfigured persistence descriptor              | Domain                           |
| `packages/shared-contracts`   | Browser-safe static OBSERVE label                | None yet                         |
| `apps/server`                 | Fastify composition root                         | Server workspaces, Fastify       |
| `apps/web`                    | React/Vite scaffold                              | Shared contracts, React/ReactDOM |

Libraries expose only typed ESM package entry points. Import them as `@desk/domain`, for example, rather than reaching into another package's `src/` or `dist/`.

## Boundaries and proof limits

`pnpm check:boundaries` uses the TypeScript parser and module resolver to check source imports, re-exports, literal dynamic imports, require calls, manifest dependencies and package exports. Cross-workspace private/relative imports, undeclared dependencies, hidden dependency aliases and uncheckable dynamic module paths fail. Domain/application/browser restrictions and the eight-package I1 inventory follow [ADR 0007](docs/adr/0007-i1-observe-boundaries-and-sdk-proof.md). Negative tests demonstrate representative bypass attempts.

All runtime descriptors are explicitly `not-configured`. The server does not import or instantiate the SDK; installing an SDK containing signing/write exports is not authority to use those exports. The scaffold guard rejects known exchange-writer/paper identifiers, and runtime smoke tests verify that representative order/paper/live routes are absent. These are bounded regression checks, not a proof against arbitrary malicious code; changes to the checker or adapter still require review.

Real API schemas, SQL connectivity, authentication, feeds, SDK/L2 private-read compatibility and the HTTPS proxy are separate issues. No live or paper execution, order signing, key provisioning, fabricated market values or bot PnL is implemented.

See [Architecture.md](Architecture.md), [the I1 plan](Iteration-1-Implementation-Plan.md), [UX.md](UX.md) and [accepted ADRs](docs/adr/README.md).
