# Issue #4 validation

Validated on the target Windows checkout with local Node 24.22.0 and pnpm 10.5.2 after rebasing onto main's merged PR #41 (`3756307`).

## Commands and evidence

- `pnpm test`: 42 tests passed. Real HTTPS clients validate the fixture certificate using an explicit test CA; no TLS trust bypass is used. Tests assert actual listener address `127.0.0.1`, serve built UI/SPA routes, reject untrusted TLS, and close the runtime listener.
- Actual Vite child starts through `startDesk('dev', ...)`, serves UI, `/@vite/client` and transformed React source through HTTPS, and fails closed when another desk already owns helper port 5173. The test supplies temporary certificates and synthetic configuration without loading the user's `.env`.
- Instrumented HTTP upstream records that Cookie, Authorization and CSRF headers never arrive. Two upstream Set-Cookie values are both absent from the HTTPS response. Unknown API, health and SSE routes remain local 404s. Test-only verify/session/logout handlers exercise the same HTTPS boundary and secure cookie headers. Host and Origin mismatches are rejected; upstream failure returns sanitized 502.
- Configuration tests reject unsafe modes, public binds, invalid origins/ports/operators, missing required values and browser-prefixed configuration. TLS tests reject invalid SAN, expired certificates, mismatched keys and unreadable files without echoing inputs. Vite environment tests exclude L2 values and Node injection variables.

- `pnpm check`: passed ESLint, workspace boundary checks, Prettier, TypeScript, production build and all 42 tests.
- `pnpm cert:local`: generated the ignored 30-day IP certificate/key pair successfully. No Windows trust store was changed.
- `node .tools/validate-issue4.mjs`: a temporary, ignored local smoke harness invoked Vite's production CLI with synthetic values in all three exact L2 variables and `VITE_POLYMARKET_API_SECRET`, recursively scanned every emitted frontend file, and found neither the values nor credential variable names. This was a synthetic experiment, not a scan of real credentials.
- The same harness started the actual built application with synthetic operator/SQL configuration and the generated certificate on the canonical port. `Get-NetTCPConnection -State Listen -LocalPort 8443 | Select-Object LocalAddress,LocalPort,State | ConvertTo-Json -Compress` returned `{"LocalAddress":"127.0.0.1","LocalPort":8443,"State":2}`. A certificate-validating HTTPS request returned 200; the harness then closed the listener.
- The harness launched `node scripts/serve.mjs start` with an empty operator and synthetic secret: exit 1, stderr exactly `CONFIG_REQUIRED: Set a valid DESK_OPERATOR_ALLOWLIST in the server environment.` No secret, stack or supplied value appeared.

## Proof limits

Fixtures prove transport/configuration behavior on Windows, not wallet ownership, authenticated sessions, real SQL connectivity, provider readiness or exchange private-read compatibility. No actual credentials are needed or used. The static scaffold still displays unavailable/unconfigured state.

Certificate generation does not install Windows trust. Browser trust and certificate inspection are explicit operator steps in [the setup guide](local-https.md); no trust-store mutation or manual browser acceptance is claimed by automated tests. Loopback binding is asserted on live Windows sockets by the tests; `Get-NetTCPConnection` commands are included for operator inspection.
