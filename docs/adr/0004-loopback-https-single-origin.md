# ADR 0004 — Loopback HTTPS and one browser origin

- **Status:** Accepted
- **Date:** 2026-10-16
- **Task:** I1-001.01 (issue #2)

## Context

MetaMask login challenges bind a domain, and the session cookie must be `Secure`. UX §4 and the Iteration 1 acceptance script open one local HTTPS URL. Architecture §2 and §12 require loopback hosting unless a later review explicitly allows something else. `localhost` and `127.0.0.1` are different browser origins, and on Windows `localhost` may resolve to IPv6.

## Decision

The single browser origin is:

`https://127.0.0.1:8443`

1. Fastify is the TLS terminator and the only process the browser uses. It serves `/api/v1`, `/health/*`, the SSE streams, and the web shell on that origin.
2. The listen address is `127.0.0.1` only. Startup fails if the bind host is any other address, including `0.0.0.0`, `::`, or `::1`. Non-loopback hosting is out of scope for every I1 decision.
3. Operators open `https://127.0.0.1:8443`. They do not use `https://localhost:8443`. Wallet challenges and request-origin checks bind the canonical origin. Cookies are host-scoped rather than port-isolated, so a different loopback port is not a cookie isolation boundary. There is no cross-origin CORS allowlist, because the UI and API share one origin.
4. The default port is `8443`. A local override may change the port, still on `127.0.0.1`, only by changing `DESK_ORIGIN` and the listen port together. The certificate, cookie, and wallet challenge must use that same origin.
5. TLS uses a locally trusted certificate whose SAN is exactly `127.0.0.1`. Certificate and key files stay outside git. Configuration names are `DESK_TLS_CERT_PATH` and `DESK_TLS_KEY_PATH`. I1-001.03 documents how to trust that certificate on Windows.
6. **Start mode:** Fastify serves the built Vite assets.
7. **Dev mode:** One Vite helper process listens on `http://127.0.0.1:5173` for Fastify to proxy frontend assets. This is the development-only process exception in ADR 0001, not another application backend. Its URL is not printed as the operator URL and the browser is not directed to it. Fastify must enforce the development proxy policy below; changing the port alone does not protect cookies.
8. Session cookies are `HttpOnly`, `Secure`, `SameSite=Strict`, and `Path=/`.
9. Startup fails when `DESK_MODE` is set to anything other than `OBSERVE`. The default is `OBSERVE`.

### Development proxy policy

- Fastify handles `/api/v1`, `/health/*`, and both SSE routes itself. These routes, including their errors, must never fall through to Vite or a frontend fallback.
- Forward only frontend asset/page requests to the fixed loopback Vite upstream. Strip `Cookie` and `Authorization` from every request forwarded upstream, including error/retry paths. Never put session, CSRF, or L2 credentials into a proxy URL, query string, or injected client configuration.
- Strip every `Set-Cookie` header from Vite responses before sending them to the browser. Only Fastify's authentication handlers may issue or clear the desk session cookie.
- Do not rely on `Secure`, `SameSite`, or a different port as a replacement for proxy header filtering. This policy prevents the Fastify proxy from forwarding desk credentials; it is not a claim that unrelated services on the same host are isolated by port. See [RFC 6265 §8.5](https://www.rfc-editor.org/rfc/rfc6265#section-8.5).
- I1-001.03 must validate the proxy with an instrumented development upstream: an authenticated page/asset request containing cookies and an authorization header reaches the upstream with both headers absent; an upstream response containing multiple `Set-Cookie` headers reaches the browser with none. Also verify that API, health, SSE, and unknown API paths never reach Vite, and that login/session/logout still work through the canonical HTTPS origin. Record this as a later implementation proof, not as a test already run by this ADR.

## Consequences

- Wallet challenges bind `https://127.0.0.1:8443` (or the single overridden loopback origin). A signature for another origin is rejected.
- HSTS preload is not set.
- LAN, tunnel, and reverse-proxy exposure require a new ADR and a security review. I1 does not add that bind “for convenience”.
- Issue #4 implements this topology; this record is the choice it implements.

## Non-authorization

Loopback HTTPS does not authorize remote access, order signing, exchange writes, paper execution, or forecasts.
