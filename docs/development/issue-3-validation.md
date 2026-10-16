# Issue #3 — workspace scaffold validation

Validated on **2026-10-17 (Asia/Calcutta)** on the target Windows checkout, rebased onto `origin/main` at `f13e46b` after PR #40 merged.

## Actual environment

- Local, checksum-verified Node **24.22.0**, pnpm **10.5.2**.
- The global Node **22.18.0** installation was left unchanged.
- Eight application/library workspaces plus the private root project.
- Official `@polymarket/client` **0.13.0** pinned in the adapter manifest and lockfile. No SDK client imported/initialized.

## Commands and outcomes

| Check                                   | Outcome                                                               |
| --------------------------------------- | --------------------------------------------------------------------- |
| Initial `pnpm install --ignore-scripts` | PASS; dependencies installed and lockfile generated.                  |
| `pnpm lint`                             | PASS; ESLint plus manifest/source boundary checks.                    |
| `pnpm format:check`                     | PASS.                                                                 |
| `pnpm typecheck`                        | PASS; strict referenced backend/library projects and browser.         |
| `pnpm build`                            | PASS; TypeScript server/libraries and Vite production browser bundle. |
| `pnpm test`                             | PASS; **18 tests, zero failures/skips**.                              |
| `git diff --check`                      | PASS.                                                                 |

`pnpm install --frozen-lockfile --ignore-scripts --offline` also passed with the lockfile unchanged. On this managed Windows sandbox, pnpm needed the same elevated filesystem permission used for the initial install to create its dependency symlinks. This is a tooling permission requirement, not an application runtime requirement.

## Behavioral evidence

Boundary tests accept the real scaffold and reject browser imports of SDK/server/persistence, cross-workspace relative paths, uncheckable dynamic imports, domain framework/Node imports, application-to-persistence edges, direct server SDK access, private package subpaths, dependency aliases, unused forbidden manifest dependencies, browser environment/credential references and known writer/paper identifiers.

The server test creates an unbound Fastify instance, asserts OBSERVE mode and three read-only **not-configured** descriptors, then uses in-process injection to verify representative order submission, live arm/start and paper start routes return 404. No network listener or provider call is needed. Readiness is also absent rather than reporting a fabricated healthy integration.

## Proof limits and next tasks

This validates scaffold structure and bounded regression cases. It does not prove general resistance to malicious code, exchange/account compatibility, SQL connectivity, wallet authentication or real market feeds. Those remain their own issues. The HTTPS/configuration/proxy implementation is issue #4; CI workflow is issue #5; actual API schemas are issue #9; real private SDK reads are issue #16.

The browser is a static scaffold message with no market prices, balance or profits. No full-product browser acceptance is claimed here.
