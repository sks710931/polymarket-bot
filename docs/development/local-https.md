# Windows local HTTPS setup

Use Node 24.22.0 and pnpm 10.5.2 from the repository root. Install with `pnpm install --frozen-lockfile --ignore-scripts`. Build/test commands need no account, SQL connection or trusted certificate; runtime startup requires the configuration below.

## Generate and trust the certificate

```powershell
pnpm cert:local
```

This generates an ignored `.tools/https/local.crt` and `local.key`, valid for 30 days with only the IP SAN `127.0.0.1`. It prints the certificate SHA256 fingerprint and refuses to overwrite either existing file. The private key stays local. Windows file permissions inherit from the containing directory; restrict that directory to your Windows account and do not share it.

Review the generated certificate and fingerprint before explicitly trusting it for your current Windows user:

```powershell
Import-Certificate -FilePath .tools/https/local.crt -CertStoreLocation Cert:\CurrentUser\Root
```

The application never changes the trust store. Restart the browser if required and confirm the certificate identity and valid HTTPS at `https://127.0.0.1:8443`. A browser with an independent trust store may require importing this same certificate there. Do not bypass certificate errors. For renewal, stop the app, remove the old certificate from your user trust store, deliberately retire the old local files, generate a new pair and repeat fingerprint verification and trust. Never commit a certificate private key.

## Configure the server

Copy `.env.example` to `.env` and edit it locally. Do not overwrite an existing `.env`.

| Variable                    | Required value                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `DESK_MODE`                 | `OBSERVE` (default and only supported mode)                                                                      |
| `DESK_HOST`                 | `127.0.0.1` (default and only allowed bind address)                                                              |
| `DESK_PORT`                 | `8443` by default; integer 1–65535 except reserved helper port 5173                                              |
| `DESK_ORIGIN`               | Exact `https://127.0.0.1:8443`, matching the selected port, without a path; for port 443 use `https://127.0.0.1` |
| `DESK_TLS_CERT_PATH`        | `.tools/https/local.crt`                                                                                         |
| `DESK_TLS_KEY_PATH`         | `.tools/https/local.key`                                                                                         |
| `DESK_OPERATOR_ALLOWLIST`   | Your one nonzero public Ethereum wallet address; no list, private key or seed phrase                             |
| `DESK_SQL_SERVER`           | Your intended SQL Server instance name; presence only is validated in this issue                                 |
| `DESK_SQL_DATABASE`         | Your intended database name; presence only is validated in this issue                                            |
| `POLYMARKET_API_KEY`        | Optional existing server-only L2 key                                                                             |
| `POLYMARKET_API_PASSPHRASE` | Optional existing server-only L2 passphrase                                                                      |
| `POLYMARKET_API_SECRET`     | Optional existing server-only L2 secret                                                                          |

TLS paths resolve from the repository root, or may be absolute. The launcher loads only root `.env`; existing process variables take precedence. Vite does not load `.env` files or export custom environment variables to browser code. Runtime rejects nonempty `VITE_*` configuration. Its Vite child receives a small OS environment allowlist and no server configuration or `NODE_OPTIONS`.

Missing L2 credentials leave presence `missing`; an incomplete set is `partial`, and all three present is `configured`. These are presence labels, not claims of authentication, ownership or private-read capability. No credentials are used yet. Do not supply SQL passwords or wallet secrets; this issue creates no connections or authentication flows.

## Start and verify

```powershell
pnpm build
pnpm start
```

For source development:

```powershell
pnpm dev
```

Open only the printed HTTPS origin. Development uses the same origin and certificate as built mode. Vite runs internally on fixed IPv4 loopback port 5173, with HMR disabled; reload after edits. Do not use the helper's HTTP URL for login or app usage. If port 5173 is already occupied, startup fails without attaching to that process. Ctrl+C closes the desk and its child helper.

While the app is running, inspect Windows listeners:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 8443
# Development only:
Get-NetTCPConnection -State Listen -LocalPort 5173
```

Expect `LocalAddress` exactly `127.0.0.1`. When changing the HTTPS port, change both `DESK_PORT` and `DESK_ORIGIN`, and use the new port in the inspection command. HTTP, `localhost`, paths appended to the configured origin and non-loopback binds are rejected.

Fastify handles all `/api` and `/health` paths itself, including unknown routes and future SSE paths. They currently return 404 until their owning issues register handlers; they never become SPA HTML or reach Vite. The frontend proxy forwards only selected cache/content request headers, strips Cookie, Authorization and CSRF headers, drops every upstream Set-Cookie, and rejects upstream redirects. Future authentication cookies belong to the HTTPS API and use HttpOnly, Secure, SameSite=Strict and Path=/. Current production code issues no cookies; auth route tests are fixtures only.

## Startup diagnostics

Errors print stable codes and corrective instructions without input values, paths, credentials or stacks:

| Code                                                         | Action                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `CONFIG_REQUIRED`                                            | Fill the named server variable                                                 |
| `CONFIG_MODE`, `CONFIG_HOST`, `CONFIG_PORT`, `CONFIG_ORIGIN` | Restore the OBSERVE loopback values or match the custom HTTPS port             |
| `CONFIG_OPERATOR`                                            | Supply exactly one valid nonzero public address                                |
| `CONFIG_PUBLIC_ENV`                                          | Remove `VITE_*` configuration and keep server values server-only               |
| `TLS_FILES`, `TLS_INVALID`                                   | Check file existence, read permissions and unencrypted PEM format              |
| `TLS_IDENTITY`, `TLS_EXPIRY`, `TLS_PAIR`                     | Generate a current matching pair with only IP SAN 127.0.0.1, then verify trust |
| `DEV_HELPER`                                                 | Free reserved port 5173 and confirm dependencies are installed                 |
| `START_FAILED`                                               | Run `pnpm build`, check `.env` syntax, TLS setup and HTTPS port availability   |

The runtime remains OBSERVE with adapters explicitly unconfigured. SQL, wallet login, sessions, health endpoints, feeds and exchange compatibility need their own implementation and evidence.
