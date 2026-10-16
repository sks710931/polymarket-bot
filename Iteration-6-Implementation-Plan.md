# Iteration-6-Implementation-Plan.md — Restricted Autonomous Live Trading

> **Goal:** Safely connect the validated trading workflow to **real Polymarket orders** from the operator's verified account with explicitly approved spending and loss limits, while keeping full ledger, reconciliation and emergency controls.  
> **Depends on:** Accepted I1–I5 implementations and independently reviewed forward-paper performance.  
> **Status by design:** **Conditional release gate**, not an automatic deployment step. The user has not yet provided capital limits or proved a supported unattended signer.  
> **References:** [Architecture](Architecture.md) §§4, 8–12, 16–17; [UX](UX.md) §10.3.

## 1. Definition and crucial prerequisites

Autonomous live means a **backend service**, not browser automation, can keep trading while the web page is closed. MetaMask is used for authenticating/authorizing the *operator*; order signatures must come from an explicitly supported signer granted limited authority over the actual trading account. The three existing environment credentials authenticate CLOB L2 private requests but **do not themselves authorize signed orders**. Never ask the operator to export a MetaMask seed/private key.

Live implementation can pass a **capability-ready-but-blocked** engineering acceptance while actual deployment remains prohibited if signing, eligibility, settlement or forward profitability evidence is missing. No undocumented bypass or "force trade" setting.

## 2. Ordered work packages

### [I6-001] Reconfirm official API, market rules, permissions and host eligibility

- Re-review current Polymarket CLOB V2/unified SDK, wallet types, order fields/signing, token/market mapping, fee parameters, available collateral (pUSD), tick/size, maker/FAK/FOK/GTC semantics, heartbeat, user stream and account status.
- Run real non-destructive account discovery with the existing L2 environment credentials, signer identity/wallet association, balances, current positions, open orders, fee schedule and read-only permissions.
- Evaluate current official geographic restrictions from the machine **actually transmitting orders**; separately record operator/account eligibility. Restrictions/unknown/mismatch block all writes. Do not change IP routing to evade restrictions.
- Inspect current BTC 5m settlement rule and oracle provenance, with versioned evidence. Proxy-only directional/maker promotion requires independently accepted conservative validation; unverified critical source semantics block that strategy's live gate.
- Acceptance: timestamped source/SDK review, real account mapping and explicit blockers; no signed test order at this stage.

### [I6-002] Select a supported autonomous signer and minimize authority

- Preferred option **only if account permits**: official beta Deposit Wallet Session Key, scoped to CLOB as narrowly as available and time-limited, subject to required Builder authorization. Inspect privileges, revocation, expiry and compatibility with the existing wallet. Do not assume a MetaMask-associated Safe/Proxy account is eligible.
- Alternate: a **separate limited-funds dedicated signer/account** under a reviewed supported wallet/order-signing flow, provisioned outside the web UI with explicit operator consent and wallet type proof. Do not silently create new wallet or transfer account funds.
- For unsupported or unapproved signer flows, display `Autonomous signing unavailable for this account` and stop here. Do not take ownership of MetaMask private keys as a convenience workaround.
- Session key or signer custody: local least-privilege secret store, access only to dedicated execution process; signing never occurs in browser. Define OS identity, secret rotation, expiration, revocation, host-backup exposure and compromised-machine response. Signing authority and L2 HMAC capability handled separately.
- Acceptance: real signer/account binding verified non-destructively, unauthorized key rejected, expiry/revoke path rehearsed; no keys in logs/DB/browser/network diagnostics.

### [I6-003] Implement live-only adapter with guarded dependency injection

- `PolymarketLiveExchange` implements I4's `TradingExchangePort` using reviewed/pinned official SDK and supported wallet signer. Bound to exact authenticated account wallet, Polygon chain, CLOB V2 and approved market/token family. No generic arbitrary-market order API.
- Separate live-capable runtime/startup manifest; do not enable a registered live order path merely from `TRADING_MODE=LIVE`. Require runtime capability + active verified signing authority + durable backend arm state + live policy + pass of real-time preflight.
- Validate candidate risk-approved orders against **current** market, liquidity, tick/min size, fees, quote age and settlement time immediately before send. Respect SDK return types, order status, post-only/FOK/FAK semantics, rate limits and maintenance conditions.
- Backend order generation produces signed exchange payloads only from committed authorized intents. No frontend raw order DTOs can bypass arbiter.
- Acceptance: dry-run signing/serialization via official supported test vectors without sending, negative schema and wrong-chain tests; live adapter unavailable in normal observe/paper runtime.

### [I6-004] Persist live capital policy and explicit arming ceremony

- Owner enters numerical max risk: total bankroll committed (not whole displayed balance by default), spend per order/market, max daily and per-market loss, worst-case correlated exposure, unmatched pair shares/duration, min conservative edge, cutoffs before close, max maker quote age and maximum order count. **All live limits default to zero.**
- Trading control screen explains how the bot can place real orders when browser is closed. Use fresh MetaMask operator signature/reauth, typed consent text and short-lived challenge tied to exact account, signer and policy hash. Store audit evidence, never reusable generic approval.
- Require policy persisted immutably and matched on each risk decision; changing limits requires new signed approval. Moving from paper to live never carries virtual balance or approval state.
- Activate only after reconciling real positions/balances/orders and acquiring single-writer fencing lease. `LIVE_ARMED` not the same as `LIVE_RUNNING`.
- Acceptance: unauthorized/expired approval, missing zero-limit, account change, restart and concurrent writer all block execution.

### [I6-005] Order lifecycle, authenticated user events and reconciliation

- Before every send, durably commit intent/reservation/account epoch and then route only through I4 controller. Process authentic order ACKs, authenticated private user-stream order and trade updates plus periodic direct readback for account holdings/balances/orders/fills; source IDs and per-exchange status version retained.
- Handle `SubmitUnknown`, `CancelUnknown`, partial fill before ACK, duplicate events, rejected price/tick/size, L2 key expiry, network timeout, remote maintenance/closed-only state and late-on-chain finality. On uncertainty pause new conflicting exposure and reconcile; never blindly resend the economic intent.
- Submit/ack/fill/on-chain settle are different stages. Reconcile reserved funds/locked shares, receipt of actual fills and actual settlement cashflow. Use independent official reported resolution/payout source where supported; retain discrepancies as incidents and do not rewrite journals to hide them.
- Use documented exchange order heartbeat/dead-man controls if verified, with explicit scope and timing; verify behavior under API outage and shutdown. Risk of open orders that cannot be cancelled must be reflected in limits.
- Acceptance: repeated real account readback consistent and fault-injected tests pass before any real order. Unknown states require manual incident closure when evidence insufficient.

### [I6-006] Live risk, loss stops and exposure management

- Central risk controller accounts for **all** live positions, external/manual account orders if they consume balance, pending/unknown/cancel-pending bot orders, reservable collateral, fees, potential settlement liabilities and paired/unpaired directional exposure.
- Enforce limits on the authoritative backend. Loss caps computed from confirmed trading events and conservative equity marks with UTC daily reset rule; persist loss high water mark and HALT across restart. Never use a client-side toggle to override hard limits.
- Reject stale/unhealthy order books, unverified signer, incompatible oracle/rule, insufficient spendable funds, fee/version mismatch, losing model calibration, exceeded slippage, nearing end of trading period, and geographic restriction. Pair trades cannot claim guaranteed profit until both legs fill.
- `HALT`: immediately refuse new exposure; attempt supported cancels of existing resting orders (with current verified permission), then reconcile. **Filled positions remain exposed**; GUI shows them until settled or closed. Distinguish cancel pending/unknown from confirmed cancelled.
- Acceptance: adverse partial hedge, double reservation, halted-but-filled order, overnight/restart loss persistence and signer revocation block new orders.

### [I6-007] Full financial reconciliation and real PnL

- Keep **actual live account** and simulated paper books separate in SQL, UI, API, exports, metrics and run IDs. The system may discover pre-existing manual account positions/orders: assign separate attribution and include them in *risk*, but never book them as bot profits.
- Post actual executed fills, exact fees and fees/rebates **only when confirmed**, settlement/redemption cashflows, and lot cost basis. Compare internal ledger against official exchange position, fills, order balances, collateral and resolution records.
- Unknown/exceptional payouts remain pending; do not mark PnL realized before valid recognition. Equity and mark-to-bid are estimates, not spendable funds; maintain real free/reserved/committed cash separately.
- Schedule continuous reconciliation and run reconciliation at startup, incident resolution, every window rollover, at stop and before resume.
- Acceptance: double-entry invariants pass with real events, no duplicate fee/settlement posting, no negative spendable cash due to our reservation logic, manual positions isolated.

### [I6-008] Live UX, emergency and operator incident response

- Live page opens with **red-flag preflight checklist** displaying every trade-enabling dependency and concrete block reason. Display account address, spendable collateral, current exposure, limits, signer scope/expiry, last reconciliation and data age.
- Persistent **LIVE — REAL MONEY** across all pages, primary `Pause New Trades` and immediate authenticated `Emergency HALT`, order reconciliation status, positions that remain exposed and incident timeline.
- Live order view includes exact exchange IDs, actual execution fill prices/fees, signed action evidence (no secret payloads), market source and posting state. Paper tab never merges ledger sums with live.
- Revocation, logout and stop explain what each action **does and does not do**. A revoked signer may cancel its orders under documented exchange semantics; always verify rather than assume all positions are closed.
- Acceptance: owner can understand worst-case risk before pressing Start, an emergency halt immediately sends a backend control action, server truth displayed on reloading browser.

### [I6-009] Fault injection, custody/security assessment and release evidence

- Critical tests: signer mismatch/expiry/revoke, malicious cross-origin/CSRF, wrong trading account, unsupported geo, bad SDK/API version, double application instance, send timeout accepted/rejected, fill during cancel, stale book, source/reference divergence, inability to cancel, SQL crash, ledger replay/recovery, daily loss, market close and resume requiring fresh authorization.
- Perform least-privilege host/SDK dependency audit, verify no sensitive values in browser/log/SQL, software bill of materials if practical, secure DB backup and rollback/runbook. No public port/wallet-signing bridge.
- `docs/evidence/I6-Readiness.md`: signed-off gate list with exact real operational tests, current references, remaining uncertainties, explicit permitted bankroll, and status `BLOCKED / RESEARCH-READY / RESTRICTED-LIVE-APPROVED`.
- Approval is not delegated to automated CI or AI agent. User/operator must provide informed authorization after current evidence is reviewed.

### [I6-010] Monitored small-capital launch (separate human decision)

- Start tiny limited-capital live run **only after explicit I6 gate signoff**; verify one or a few small exchange orders with current fee/order/settlement semantics under close supervision. Never assume unlimited funding or auto-scale.
- Pause and reconcile after the first cycle; compare internal fill/fee/available balance/settlement to exchange records and paper assumptions. Stop immediately on unknown order, mismatch, unexpected fee, or unverified market rule.
- Expand allocation only through a new policy version and explicit operator authorization based on actual after-cost evidence. The system must still be able to produce zero trades.
- Acceptance: no hidden authorization escalation, safe stop, actual ledger reconciliation and operator-reviewed data. This task can remain **blocked indefinitely** without failing the research/paper product.

## 3. Live enablement checklist (all mandatory)

| Gate | Required result |
|---|---|
| Account owner & trade wallet | Verified signer/account mapping, supported chain, no ambiguity |
| L2 private API | Authenticated, expected permission and account, secrets secure |
| Order signer | Supported, restricted, verified signature, key protection/revocation tested |
| SDK/CLOB | Current V2-compatible signed order schema/fee/tick/size independently exercised |
| Market settlement | Contract rule/expiry/normal payout and reference quality assessed per strategy |
| Geography/compliance | Eligible from execution host and account, never bypassed |
| Feed quality | Both token books fresh/valid, BTC sources/reference policy satisfied |
| Portfolio | Reconciled free collateral, resting/unknown orders, inventory and reservations |
| Paper evidence | Reviewed independent forward holdout, after-cost positive evidence under conservative fills; else stay paper |
| Risk policy | Owner-set real numbers, zero by default, manual signed activation |
| Failure recovery | Unknown submit/cancel, fill races, restart, dual writer, halts fault-tested |
| Observability | Operator can pause/halt, inspect positions, risk and incident timeline |

## 4. Operator acceptance script

1. Show clean Observe startup; connect MetaMask and verify actual trading account with read-only L2 credentials.
2. View signer support, host geo check, real balance and existing orders; any `Unknown` blocks Arm.
3. Review independently measured paper report, current rules, live exposure limits; digitally approve exact account+policy.
4. Verify live runtime is separately enabled and single lease held; `ARMED` requires a second explicit `Start Live` action.
5. Only with authorized small funds: run tiny real order, reconcile ACK versus fill and actual fees; handle partial fill/uncertain response as separate statuses.
6. Trigger HALT; verify **no new orders**, safe cancel attempts and displayed remaining filled holdings. Revoke/expire signer test on a safe isolated setup.
7. Restart process; confirm it comes up `Reconciling/LiveDisabled`, not automatically running, until all gates pass and operator explicitly acts.
8. Compare posted ledger, account cash and official settlement evidence; export clearly `LIVE` report with actual source timestamps.

## 5. Exit classification

- **Engineering Complete / Live Blocked:** secure signer/order adapter and risk controls have passed non-destructive testing, but some eligibility, settlement semantics, paper sample or account authorization prerequisite is not satisfied. No live orders.
- **Restricted Live Approved:** all gates independently pass and operator signs off numerical bankroll/loss policy. Initial orders are small and monitored. Approval must be revocable and not permanent.
- **Operationally Verified:** a monitored actual execution/fill/reconciliation/settlement cycle completed without unresolved incidents; still **not** evidence of future profitability.

**Never interpret a successful code build, a positive paper PnL, or functioning MetaMask login as a license to place real exchange orders.**