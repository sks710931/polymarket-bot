# Iteration-1-Implementation-Plan.md — Complete GUI, Wallet Authentication, Account & Live Markets

> **Goal:** Deliver a usable, elegant, *real-data* local web trading desk immediately, including secure MetaMask login, Polymarket CLOB connection using existing server environment credentials, account views and current/next BTC 5-minute market data.  
> **Prerequisites:** None (fresh repository).  
> **Hard limit:** Read-only exchange. No signed orders, live wallet private keys, account transfers, automated paper orders or fabricated forecasts.  
> **References:** [Architecture](Architecture.md) §§2–5, 12–14; [UX](UX.md) §§2–7, 12–15.  
> **Exit output:** One locally running URL, real read-only flows, screenshot/evidence report and stable I2 contracts.

## 1. Definition of finished Iteration 1

A nontechnical owner opens one local HTTPS URL, understands the setup wizard, connects MetaMask with a visible login signature, sees what account identity was verified, inspects public current/next BTC 5-minute Up/Down markets and valid live book data, checks authenticated account balance/positions/orders *only if account binding is proven*, and can view Health/Settings. All planned app pages are navigable from day one, even where the real feature is deferred; no fake signals, trades or profits.

**Important:** L2 credentials (`POLYMARKET_API_KEY`, `POLYMARKET_API_PASSPHRASE`, `POLYMARKET_API_SECRET`) live in the **backend process environment**. They can authenticate supported private API reads. They do not establish the wallet signing permissions needed for future autonomous trading. Do not request seed phrases or private keys.

## 2. Ordered work packages

### [I1-001] Bootstrap greenfield workspace and documented decisions

- Create TypeScript monorepo (`apps/web`, `apps/server`, `packages/{domain,application,polymarket-adapter,market-data,persistence,shared-contracts}`), npm or pnpm workspace, strict TS and import boundary rules.
- Add `.env.example` listing **names only** (never secrets), dev/start scripts, formatter/linter, minimal local setup docs, CI that compiles both halves. Pin Node LTS and `@polymarket/client` reviewed version.
- Architecture-decision record: single process, official SDK, SQL Server/Windows auth, data transport choice, local HTTPS binding and I1 **read-only-only runtime**.
- Acceptance: clean clone + setup completes on target Windows PC with no manual code edits; no live write method imported/registered.

### [I1-002] Prove SQL Server connectivity, persistence and startup readiness

- Verify actual local SQL Server driver compatibility with Windows integrated identity under Node process; choose and document supported driver; migrations executed by explicit command (not app startup).
- Define DB migrations: `SchemaVersions`, `OperatorSessions`, `AccountProfiles`, `CredentialProbeRuns`, `Markets`, `MarketRuleVersions`, `TokenMappings`, `FeedHealthEvents`, `OperatorActions`, `Incidents`, `AppConfigVersions`.
- Unique identity keys, conservative timestamps, decimal market precision; no env credentials in SQL. Reject unsupported/missing DB startup with actionable diagnostics.
- Add `/health/live` vs `/health/ready`; ready requires DB/schema/operator configuration; external market feed failures are reported separately rather than hidden.
- Acceptance: fresh SQL initialization, repeat migration, restart and invalid DB failure tested; no accidental mutation from reading dashboard.

### [I1-003] Build the complete React app and design system

- Deliver responsive sidebar/top strip for **Overview, Markets, My Account, Predictions, Opportunities, Trading, Orders & Trades, Portfolio & PnL, Performance, Settings & Health**.
- Build reusable components: time/number formatters, source-age badges, wallet identity card, two-sided token price tiles, depth table, countdown, incident panel, loading/error/empty states, account action toaster, status ribbon, run/mode banner.
- Dark theme default plus light theme, keyboard navigation, accessibility labels and responsive mobile read-only layout.
- Future iteration pages clearly explain their requirements; no fake balances, trade lists, charts or example PnL on a real-looking dashboard.
- Acceptance: all nav routes work on page reload, screen-reader/keyboard smoke, 360px/768px/1440px browser review, UX wording matches UX.md.

### [I1-004] Implement owner login with MetaMask

- Integrate current wallet provider library, detect MetaMask, request appropriate Polygon network and signed login challenge. Server challenge must bind origin/domain, address, purpose, issue/expiry and one-use cryptographic nonce; verify signature and enforce one approved operator identity.
- Session cookies HttpOnly/Secure/SameSite; CSRF protection on mutations; login expiry, logout and replay/mismatched-origin rejection. Wallet connection without server verification is only `BrowserConnected`, never authenticated.
- Do not require a financial transaction or token approval for login. MetaMask retains the private key.
- Acceptance: legitimate signed login works; rejected, expired, replayed, wrong-wallet/wrong-origin messages cannot authenticate; browser never receives API secrets.

### [I1-005] Implement server-only CLOB credential and account discovery

- Read the three exact env names at server startup; display only `Missing`, `Configured`, `Authenticated`, `Unauthorized` state and sanitized diagnostics.
- Use the official SDK for supported read-only account paths. Prove read-only L2 path works without a private order signer; if SDK requires a signer for secure creation, build the **narrow L2 read-only HMAC transport** per official API documentation, not a fake signer.
- Inspect wallet type and reconcile MetaMask address, CLOB L2 signer identity and account-wallet/funder mapping; support explicit operator-verified association backed by exchange/account evidence, never claim arbitrary wallet association merely because two values look related.
- Obtain spendable trading collateral and existing positions/orders only after account mapping is verified. Distinguish `pUSD` trading funds from a general MetaMask Polygon asset balance and show balance timestamp.
- Handle zero balance, inaccessible private account data, unknown wallet type, closed-only state and revoked keys. Do not create/rotate keys silently.
- Acceptance: real private read and verified account mapping if credentials permit; otherwise correct `AccountUnverified`/`Unauthorized` state and public feed works. No destructive exchange action.

### [I1-006] Implement BTC 5m discovery and market identity

- Query actual published market catalog/current series; identify active and upcoming BTC five-minute Up/Down windows, official market and condition IDs, outcomes/token mappings, start/end UTC, trading rules, active flags, fee schedules, tick/minimum sizes.
- Build strict validator for incomplete/contradictory market mapping, swapped outcomes, wrong rule family, expired/closed market. Prewarm upcoming market; handle clock boundaries cleanly.
- Cache metadata with provenance and hashes; do not infer market eligibility from slug alone. Expose `GET /api/v1/markets/current`, `/upcoming`, `/{id}` with typed schemas.
- Acceptance: demonstrate two consecutive market turnovers and correct token IDs; malformed metadata fails with visible reason rather than mapping unknown shares to Up.

### [I1-007] Build and validate real-time collectors

- Polymarket Up & Down book snapshots/updates, BTC public venue feeds (e.g. Binance BTCUSDT and Coinbase BTCUSD; no fabricated USD parity), receive/source timestamps, TTL and quality states.
- Enforce documented event structure; if continuity cannot be established from the supplied feed, invalidate affected book, resubscribe, obtain validated snapshot. No guessed sequence IDs or assuming heartbeats equal depth freshness. Bound memory/event queues; overflow creates `Invalid` and incident.
- Avoid paid Chainlink. Record only the reference *rule publication* here; exact proxy is I2. Include market data refresh, disconnect/reconnect and next-window subscription.
- Expose latest book with epoch and validity in `/markets/{id}/book`; stream coalesced updates to authenticated GUI, not every raw tick.
- Acceptance: genuine live updates and rendered gap/stale/recovery state, repeat rollover, no negative/misaligned book levels or stale book marked executable.

### [I1-008] Complete read-only GUI views

- Overview: exact current market, countdown, source last update, live Up/Down bids and asks, account status, spendable balance **if verified**, disconnected/unknown state otherwise.
- Markets: BTC chart and source legend, market rule panel, paired Up/Down depth, spreads, next market, useful explanatory tooltips. Missing segments are gaps.
- My Account: signer vs account-wallet addresses, balance, current positions, open orders and recent history from real returned data; do not label external/manual holdings as bot trades.
- Settings & Health: read-only status of env credentials, wallet identity, feed ages/gaps, DB health, host/SDK version and incidents; include safe reconnect controls, no arbitrary order controls.
- All other pages are polished empty states with no hypothetical active PnL.
- Acceptance: full click-through manual walkthrough with screenshots of connected, disconnected, stale and blocked states.

### [I1-009] Signing and eligibility feasibility **read-only**

- Identify actual wallet/account type and document whether autonomous trading can use an officially authorized scoped Session Key (beta, supported Deposit Wallet and Builder approval only), or needs a separate operator-provisioned signer; status `Supported / Unsupported / Unknown` with cited evidence.
- Check and **display** exchange geographic/host eligibility as diagnostics; avoid bypass and never turn this status into a promise of legal eligibility. Recheck immediately before real trading in I6.
- Document signing authorization plan and required account actions for I6 without taking them now.
- Acceptance: clear `I6 Live signer readiness: not configured` until verified; no private key creation or asks for seed phrase.

### [I1-010] End-to-end hardening and delivery

- Run critical tests: challenge replay/wrong domain, account mapping isolation, absent/revoked L2 credentials, malformed token pairing, rollover, book resync, secret redaction, startup migration and browser CSRF.
- Security scan built assets, logs and SQL for env secret values (without printing them). No external URL/remote web exposure by default.
- Provide `scripts/setup`, `scripts/dev`, `scripts/start`, explicit migrations and a short failure troubleshooting guide; full app starts on target PC.
- Produce `docs/evidence/I1-Validation.md` with actual run timestamps/real versus mocked outcomes, browser screenshots, health and remaining blockers.

## 3. Data contracts created in I1

```ts
export type ConnectivityState =
  | 'missing' | 'configured' | 'authenticated' | 'unauthorized' | 'unavailable';
export type MarketDataState =
  | 'connected' | 'stale' | 'invalid' | 'resyncing' | 'disconnected';

export interface AccountConnectionView {
  browserSigner: string | null;
  tradingWallet: string | null;
  walletType: 'eoa' | 'proxy' | 'safe' | 'deposit' | 'unknown';
  accountMappingVerified: boolean;
  clobL2: ConnectivityState;
  orderSigning: 'unavailable' | 'unknown' | 'verified-capable';
  availableCollateral: string | null; // exact decimal text, never JS Number
  collateralAsset: string | null;
  retrievedAtUtc: string | null;
  reasons: readonly string[];
}

export interface ValidatedBookView {
  marketId: string;
  outcomeTokenId: string;
  side: 'UP' | 'DOWN';
  epochId: string;
  sourceAtUtc: string | null;
  receivedAtUtc: string;
  state: MarketDataState;
  bids: readonly { price: string; quantity: string }[];
  asks: readonly { price: string; quantity: string }[];
  invalidReasons: readonly string[];
}
```

Use a generated OpenAPI TypeScript client plus runtime validation. `null` means unknown, **never zero**.

## 4. Manual operator acceptance script

1. Start SQL; run migrations; start server and web app; open the single local HTTPS origin.
2. Check public market visible before wallet login; show real clock, market ID and source status.
3. Connect MetaMask, approve clearly stated challenge; verify profile, account address mapping and observed read-only balance/positions; reject mismatch case safely.
4. Disconnect/reconnect a feed and verify stale/recovering indicators; wait through full five-minute rollover and confirm next market is correct.
5. Visit all sidebar pages; ensure no dead links or fake PnL; reload browser and confirm real server state restored.
6. Verify environment keys absent from network payloads, UI, DB and logs. Confirm zero live order methods reachable and no signed orders sent.
7. Record known limitations (e.g. SDK/account mapping, PolyBolt, geography, later signer support) as explicit blockers rather than simulated passes.

## 5. Exit and handoff to I2

**PASS only when:** the app genuinely loads current/next BTC 5m, authenticates the operator, performs honest server-side read-only connection/account discovery, demonstrates validated Up/Down book continuity/failure handling, and provides real operational UI with no wallet-key exposure. `I1 account verified` may legitimately remain **BLOCKED** if the supplied L2 credentials cannot be bound; the application and public GUI can be marked implemented, but any acceptance criteria requiring private account reads cannot be called complete until real evidence exists.

Handoff: versioned market snapshots, rule publications, source-age/continuity semantics, mode-safe contracts, operational database and UI streaming. I2 adds proxy/reference process, probability service and forecasting screens without altering authentication or inventing authoritative settlement values.