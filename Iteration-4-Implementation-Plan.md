# Iteration-4-Implementation-Plan.md — Broker-Neutral Execution Workflow and Financial Ledger

> **Goal:** Build a reliable execution controller and auditable financial ledger that can run against an **in-memory/deterministic mock exchange**. Neither live nor fully enabled live-feed paper trading belongs in this iteration.  
> **Depends on:** I3 immutable risk-screened proposals, I1 account/markets, I2 forecasts.  
> **Hard limit:** No exchange order write, signing key or live money operation.  
> **References:** [Architecture](Architecture.md) §§8–10, 12–14; [UX](UX.md) §§10–11.

## 1. Architectural objectives

I4 creates the **same core order state machine and accounting authority** that I5's simulator and I6's live exchange adapter will reuse. Execution is **not** a strategy: it should not predict probabilities or decide to override risk. Orders may be pending, delayed, rejected, partially filled, unknown or cancelled while a fill still arrives. Accounting must remain correct after process restarts and duplicate events.

This iteration deliberately uses a deterministic fake adapter for tests and operating-demo UI. The actual I5 paper adapter will consume live data and decide fills conservatively; the I6 live adapter will sign/send on Polymarket. Fake demonstrations must be labeled `Mock Test`, not `Paper PnL` or actual earnings.

## 2. Ordered work packages

### [I4-001] Design execution domain and immutable identities

- Types: `AuthorizedExecutionPlan`, `OrderIntent`, `Order`, `OrderEvent`, `OrderFill`, `CancellationIntent`, `ExecutionIncident`, `PortfolioReservation`, `SettlementEvent`, `RunContext` and financial journal types.
- Required IDs: account ID, mode (`PAPER`/`LIVE`), market/condition ID, token, strategy/proposal ID, risk decision ID, intent GUID/deterministic correlation, optional exchange ID, book epoch, rule/model/fee versions and timestamps.
- Implement explicit state transitions: proposed -> approved -> intent persisted -> dispatching -> ack/unknown/rejected -> open/partially-filled/filled/cancel-pending/cancel-unknown/cancelled/expired -> settled or closed. Fills and settlement are separate from order status; cancel acknowledgement can race with later fills.
- `ExecutionPlan` may include multiple legs, but **never assumes an atomic Polymarket Up+Down order**. Each leg is tracked individually.
- Acceptance: invalid state transitions rejected, duplicate event no effect, cancellation cannot undo filled shares.

### [I4-002] Define explicit exchange ports and isolated capability injection

- Add `TradingExchangePort` with `place`, `cancel`, `getOpenOrders`, `getFills`, `getBalances`; preserve exact DTO schemas and separate `ReadOnlyAccountPort` from signed write capability.
- `DeterministicMockExchange` for I4; `LiveDataPaperExchange` for I5; `PolymarketLiveExchange` interface only for I6, **no concrete write class registered in this iteration**.
- No catch-all proxy endpoint to submit arbitrary orders. No raw SDK signing helper exposed in application use cases.
- Acceptance: DI graph/compile-time tests prove mock adapter only; SDK calls to order write endpoints are not reachable from host.

### [I4-003] Implement durable intent + reservation transaction

- Under one SQL transaction, check account/version/fence and risk invariants, reserve maximum cash/position liability accounting for existing open and unknown orders, append `RiskApproved` and `OrderIntentPersisted`, then commit.
- The dispatcher only sees committed intents. Use stable `intentId`, per-run idempotency guard and explicit `dispatchAttemptId`; prevent double allocation when two strategies contend.
- Record immutable inputs: originating forecast, book epoch, model version, cost policy, account snapshot, risk approval, quantity/price and expiry.
- On SQL failure, do not send. On partial failure after commit, safe recovery can resume only after checking dispatch state; no unconditionally repeated non-idempotent send.
- Acceptance: crash-before-commit sends zero orders; concurrent reservation beyond bankroll impossible.

### [I4-004] Dispatch, timeout and exchange reconciliation state machine

- Mock all external send outcomes: accepted, immediately rejected, partial fill before ack, accepted with lost response, never accepted, duplicate response, delayed fill, cancelled with late fill and network disconnect.
- `SubmitUnknown` / `CancelUnknown` are first-class safety states. A submit timeout **never** resends blindly. Worker pauses conflicting exposure and uses read-back of orders/fills/balances, matching stable IDs and source evidence.
- If exchange lacks sufficient lookup/idempotency to safely disambiguate, leave incident open and require operator review; do not assume missing order => safe to resubmit immediately.
- Reconcile after restart before any new risk. Persist durable loss/incident state; resume mock runs only through explicit operator action.
- Acceptance: double-send forbidden across repeat calls/restarts, arrival-order races yield correct final fills/held inventory.

### [I4-005] Build append-only balanced ledger

- SQL schema: `TradingRuns`, `OrderIntents`, `ExchangeOrders`, `OrderEvents`, `CancellationIntents`, `Fills`, `Reservations`, `Positions`, `PositionLots`, `LedgerEvents`, `LedgerEntries`, `SettlementObservations`, `ReconciliationRuns`, `ReconciliationDifferences`, `RiskDecisions`, `Incidents`.
- Separate **cash and outcome token quantity movement**, acquisition costs, individual matched lot cost basis, transaction fees, settlement, receivables and reserved funds. Use exact decimal/integer units; allocate platform fees to the actual fill. Distinguish `pUSD` trading collateral from other wallet assets.
- Enforce balanced entries under a single economic event: every debit has equal valued credit; position units and their asset denominations are separately traceable. Every event has unique `(accountId, mode, sourceEventId, ledgerEventKind)`, immutable post state, and compensating correction mechanism.
- Realized PnL = recognized sale/settlement payout minus allocated cost basis/fees; unmatched inventory unrealized at conservative sellable bid, net expected fees shown separately. No double recognition when settlement and asset transfer confirmations both arrive.
- Paired lots: equal complement matched **after fills**, associated costs. Unpaired shares retain directional downside and must be visible to risk.
- Acceptance: zero non-balanced postings, no double counted duplicate fills, no ability for paper events to mutate live account ledger.

### [I4-006] Correct position/portfolio and reservation accounting

- For each mode/account/market track free/reserved/committed cash, UP/DOWN shares, cost basis, pending order liabilities, paired share lots, directional delta and worst-case payout by ordinary binary outcome.
- Charge full worst-case funds for pending buy orders including cancel-pending or submit-unknown; release only on authoritative known terminal status/unfilled amount. For sell orders ensure shares cannot be oversold.
- Idempotent reconciliation snapshots compare local book against mock authoritative balances/orders/fills; display discrepancies rather than silently overwrite financial history.
- Acceptance: balance conservation after buy/sell/cancel/settlement, cash not double-spent, outstanding liabilities preserved through kill switch.

### [I4-007] Settlement posting workflow

- Represent market close distinct from resolved/settled. Use precise condition/outcome map and official payout data. Pending/exceptional/non-binary payouts remain explicitly unresolved until confirmed.
- On terminal normal binary payout, apply one payout per winning share at exact posted quantity with fees/costs recognized once; losing shares go to zero according to verified outcome. Track redemption/chain cash movements separately from result label if not yet complete.
- No assumption that external BTC spot close equals market payout. No automatic entry of oracle-equality edge when exact reference unavailable.
- Acceptance: winning/losing/exceptional/pending cases, repeated official resolution, contradicting provider observations and partial redemption handled without doubling PnL.

### [I4-008] Durable operations and single-writer fencing

- Create SQL-backed `RuntimeLease` (account+mode+owner+epoch), serialized risk approval and fencing tokens. Only active run can submit, and a second app instance is refused active writer role.
- Graceful process shutdown stops new intents and tracks unsettled ones; crash restore detects open/unknown/cancel-pending orders and opens `Reconciling` state.
- Correlation IDs across proposal->risk->intent->order->fill->ledger; structured redacted incident logs. Storage and DB failures stop financial operations.
- Acceptance: concurrent processes cannot approve overlapping live-capable writer lease, failover does not create duplicate economic intent.

### [I4-009] GUI: Orders, Ledger and Trading workflow

- Orders & Trades page with filters: mode, strategy, market, order ID, state and time. Order detail timeline includes intent, authorization, dispatch, ack, partial fill, cancel and journal.
- Portfolio & PnL screen displays **Mock Test** data only for deterministic demonstrations; actual account holdings remain read-only and separate. Real paper/live balances stay unavailable until respective iterations.
- Trading screen illustrates state machine, pending reservations, risk decisions and incidents; no functional paper/live Start button yet. Provide accessible reason labels for `SubmitUnknown`, `CancelPending`, `Settled`.
- Acceptance: browser shows mock fill and cancel race honestly, no run status mislabeled paper or live.

### [I4-010] Critical adversarial suite and evidence

- Critical tests: crash after intent but before send; send accepted and response lost; send rejected; duplicate user fill; fill before ack; cancel while fill in flight; unknown cancel; two simultaneous proposed orders; strategy conflict; SQL outage; negative/corrupt cash; price precision; paired lot mismatches; repeated settlement; re-run journal posting.
- Cross-check conservation equations across generated sequences: initial cash - buys - fees + sells + payouts = final cash; net positions and matched lots consistent with actual fills. Use property-based tests for critical conservation if practical, not a massive test suite.
- Produce `docs/evidence/I4-Validation.md` with mock scenarios, SQL checksums/counts, known unsupported live capabilities, API/UI screenshots and reset/restart results.

## 3. Required state and accounting invariants

```text
1. Every dispatched order maps to exactly one durably approved intent.
2. Every fill maps to exactly one economic ledger posting, despite repeats.
3. Cash available + cash reserved <= reconciled total spendable collateral
   under stated liability convention.
4. Filled shares are never cancelled by a later cancellation event.
5. A submit/cancel timeout is uncertain until reconciled, never silent failure.
6. Paired shares <= min(filled UP shares, filled DOWN shares) per same contract.
7. Normal binary settlement payout is counted once; other cases remain pending.
8. PAPER and LIVE modes never share a financial account, writer or ledger rows.
9. HALT stops new risk, not existing economic exposure.
```

## 4. Manual demo and exit

1. Seed mock account with **clearly labeled fake test funds**, run a deterministic proposal through full approval, intent and fill.
2. Simulate partial first-leg fill, missing hedge and late cancellation; inspect matched/unmatched shares and reserved collateral.
3. Inject accepted-but-response-lost; see `SubmitUnknown`, block new risk and reconcile instead of resending.
4. Restart app and mock worker; verify no duplicate intent/fill or changes to final ledger totals.
5. Apply winning/losing official-like **mock** settlement and reconcile double-entry totals; keep real account read-only.
6. Confirm no exchange order submission, signer secrets or real trading controls are enabled.

**PASS:** deterministic mock execution state machine, persisted accounting, strict mode separation, auditable UI, recovery/fault safety and robust handoff. I5 receives the **same** engine and implements only the realistic live-data paper adapter, paper account wizard and forward evaluation loop. Do not label the mock test a profitable trading strategy.