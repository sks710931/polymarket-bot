# Iteration-5-Implementation-Plan.md — Live-Feed Autonomous Paper Trading and Forward Evaluation

> **Goal:** Operate a strategy-driven **paper account** on genuine live BTC 5m market data, controlled entirely from the web UI, using the same proposal/risk/order/ledger code intended for future live trading.  
> **Depends on:** I1 live market/account GUI, I2 forecaster, I3 opportunity and risk, I4 deterministic execution and ledger.  
> **Hard limit:** No real Polymarket order writes or private trading signer. Paper PnL always explicitly simulated.  
> **References:** [Architecture](Architecture.md) §§9–11, 15–16; [UX](UX.md) §§10–11, 13.

## 1. Definition of the paper experiment

When the owner clicks **Start Paper Trading**, the backend starts one durable supervised trading run for a chosen virtual-account bankroll and risk policy. It consumes real market feeds, creates model forecasts and opportunities, risk-screens them, simulates real-world order executions with conservative latency/queue assumptions, tracks both Up/Down inventory across market rollovers, waits for actual official outcomes, and posts after-cost **simulated** PnL to a separate book. It keeps running if the browser closes, until operator stop/pause or an automatic safety halt.

**No historical backtesting prerequisite.** Multiweek forward observation is the principal evidence. Recorded input snapshots can be locally replayed to diagnose a decision/incident; this is not a claim of independently backtested profitability.

## 2. Ordered work packages

### [I5-001] Create durable paper account/run model and controls

- SQL `PaperAccounts` and `TradingRuns` with paper bankroll, asset units, risk policy version, strategy set, run status, start/stop/pause UTC, simulated broker configuration, code/model/fee versions and deterministic scenario RNG seed.
- Operators can create named paper accounts, start, pause-new-orders, resume after revalidation, stop and inspect prior runs. Reset creates a **new versioned account**; prior ledger/metrics never deleted or quietly overwritten.
- Start requires validated feed, current market, model reference status and explicit paper acknowledgement; no general external exchange authorization is involved.
- Acceptance: browser refresh/close/reconnect does not alter backend paper run; duplicate Start clicks yield one run, restart safely restores or requires explicit resume.

### [I5-002] Implement conservative `LiveDataPaperExchange`

- Consume validated live depth snapshots at **simulated arrival time** (not signal time), with bounded artificial compute/network delay. Marketable orders walk displayed levels, observe depth and min/tick constraints and may be partially filled/rejected/expired; do not assume snapshot liquidity was still available in real exchange.
- Define modeled fill states for `FAK`, `FOK`, `GTC/post-only` only where actual SDK/order semantics have been verified; otherwise disable order type in paper. Distinguish marketable taker versus resting maker executions.
- Maker execution model uses simulated queue position/uncertainty, visible market trades/depth changes as suggestive signals, not proof that our order would fill. Publish conservative/baseline/optimistic sensitivity results, using conservative only for readiness evidence.
- No guaranteed fills when price touches limit; no forward-looking future events, no slippage=zero default and no rebated maker fee assumed. Unavailable CLOB depth means **no fill claim**, not execution at last displayed price.
- Acceptance: fixtures showing price racing away, no fill, partial fill, stale book, queue misses and cancellation collision; paper broker never sends exchange write.

### [I5-003] Integrate shared forecast -> opportunity -> risk -> execution flow

- At real feed events and controlled cadence, evaluate live `ProbabilityForecast`, cost-aware proposals, current virtual portfolio and limits, then create/approve paper order intents using I4's exact SQL transaction and ledger engine.
- No browser-side trading logic. A paper risk rejection must include reason, and trade proposal expired while waiting cannot proceed.
- Enforce one active paper writer per paper account; independent of existing Polymarket holdings. Paper bankroll is never borrowed from exchange account balance.
- End-of-window handles open resting orders, pending simulated cancellations and exposure until official result, not chart-switch liquidation.
- Acceptance: true end-to-end `feed -> forecast -> opportunity -> risk -> simulated order -> fill -> ledger` trace from one market to the next.

### [I5-004] Implement positions, hedging, fees and settlement

- Use actual market fee schedule (if missing, no new orders), fee rounding, partial fills, lot basis and explicit Up/Down pair matching; nonzero first-leg-only exposure always counted as risk.
- Attempt hedge only if risk-approved at current depth; timeout/expiry/missing opposite liquidity triggers conservative fallback/hold/reduce policy rather than magically completed pair.
- Resolve only against official reported/confirmed Polymarket outcomes; separate unreconciled/exceptional outcomes and negative-case handling. External BTC spot closing price never substitutes for missing official payout.
- Track conservative liquidation marks and unsold inventory separate from settled PnL. Ledger cash conservation proven after settlements.
- Acceptance: all three strategy types (where enabled) attribute economic costs exactly once; incomplete pair example can lose and is properly reported.

### [I5-005] Implement GUI paper trading control center

- `Trading -> Paper` view: create bankroll, choose strategy modules, set paper limits and fill model, inspect feed/preflight checklist, **Start Paper Trading**, **Pause**, **Stop**, run timer and mode.
- Persistent `PAPER • SIMULATED MONEY` header plus separate blue paper portfolio cards; `Account/Live` shows real account read-only independently. Expose running status even after browser reload; no modal that confuses stopping new trades with liquidating holdings.
- `Orders & Trades`: real-time paper intent, simulated fill/partial/unknown, fees, per-market receipts and order timeline; `Portfolio`: virtual free/reserved balance, paired/unpaired shares, equity, realized/unrealized paper PnL.
- `Performance`: equity/drawdown, after-cost PnL, fills/misses, average signal/executable edge, losses by strategy, model vs baseline Brier/log-loss, unsettled exposure, quality coverage and no-trade reasons.
- Acceptance: layman can tell fake money from real balance at all times; view help and limitations without technical vocabulary.

### [I5-006] Build forward evaluation instrumentation

- Freeze comparison model/strategy/config version at each run; capture *all* proposals (including rejected), order intent, relevant pre/arrival depth epochs, fee schedule, expected edge, model/reference basis, simulated events and official result.
- Define trade-independent primary metrics: `NetPaperPnL after costs`, `MaxDrawdown`, `UnhedgedWorstCase`, `FillRate by order type`, `ExpectedEdge vs captured PnL`, `Confidence interval/uncertainty where justified`, `FeeTotal`, `MarketCoverage`, `TradingHalts`, `PerMarketPnL`, `Brier/log-loss by time remaining`.
- Distinguish **hypothetical execution PnL**, **settled simulated PnL** and actual account PnL. No annualization extrapolation from tiny samples, no win rate unaccompanied by absolute $ performance and drawdown.
- Report all no-trade periods and ignored/unavailable windows in denominator; exclude unresolved markets from finalized-result metrics but disclose their count.
- Acceptance: reproducible metrics from ledger and archived decision receipts, correct strategy attribution and explicit assumptions.

### [I5-007] Run the forward protocol and calibration comparison

- Suggested program: week 1 benchmark/model observation; week 2 frozen baseline directional+pair paper; week 3 additional strategy/model comparisons on fresh windows; week 4 untouched frozen candidate evaluation. These are **recommended phases**, not mandatory wall-clock conditions for I5 code completion.
- Keep strategy versions and parameter selections fixed during final forward holdout. Compare market baseline, M1 model and optional M2 corrections on actual official outcomes; sufficiently large and representative sample required before an evidence-based promotion claim.
- Record incomplete data, network restarts, provider changes, settlement gaps and simulation sensitivity. Explicitly classify conclusion `Inconclusive / Negative edge / Positive provisional edge`.
- Acceptance: no future leakage, no mixing training and holdout, independent holdout documented or transparently not yet available.

### [I5-008] Harden for unattended operation

- Start/pause/halt continues independently of browser; data loss, SQL outage, runner conflict, outdated reference, invalid feed, risk cap or disk-low triggers fail-closed paper stop-new-risk.
- Startup reconciliation of run/ledger, order state and invalid market transitions; safe controlled resumption with operator approval after critical incidents. Bound telemetry, snapshots and retention.
- Provide daily HTML/CSV/JSON performance report from real ledger data, with exact paper label, timestamps and model/fill assumptions. Optional UI notification only; no email integration requirement.
- Acceptance: 24h and multi-market soak on target host (for operational reliability), deliberate disconnect and restart. Resource/memory growth and missed windows disclosed.

### [I5-009] Critical tests and reproducible verification

- Tests: paper cannot invoke live SDK; race between stop and new proposal; no-fill/partial-fill maker behavior; live order-book age rejection; sequential pair missing hedge; market rollover with unsettled shares; simulated balance cannot go negative; fee/lot PnL conservation; duplicate official settlements; model/reference unavailability; browser reconnect; correct PnL source labels.
- Manual 5-minute full window: watch a paper opportunity, simulated order, partial or missed fill, PnL and official later settlement; validate every number from ledger and inputs. If no opportunity, use **separately labeled seeded fixture** to demonstrate UI, not fictional live execution.
- Produce `docs/evidence/I5-Validation.md`: live observation coverage, paper run details, sampled orders, calibration status, realized/unrealized separation, fill assumption sensitivity and outstanding limitations.

## 3. Paper simulator assumptions as mandatory configuration

| Item | Required behavior |
|---|---|
| Signal-to-arrival latency | Configured and recorded; event-time causality; no same-instant best-price promise |
| Available depth | Only validated, fresh epochs; quantity swept across levels; residual unfilled possible |
| Taker fees | Actual market schedule/precision applied per fill |
| Maker fills | Conservative queue and missed-fill model, with sensitivity scenarios |
| Partial execution | Models missing hedges, reserved cash, cancelled remainder and adverse moves |
| Settlement | Authoritative reported outcome when available; otherwise unresolved |
| Capital | User-defined **virtual** starting amount, never exchange cash |
| Safety | Pauses new risk on stale data/unknown inventory/risk/DB failure |

If data quality is inadequate for a convincing fill assumption, the system may still produce **signals-only shadow research**, but it must not label those opportunities as realistically executed paper orders.

## 4. Manual operator acceptance and I6 gate

1. Sign in, start a named paper account using virtual money, review model and trading limits; verify persistent paper banner.
2. Watch actual BTC 5m live feeds and opportunity decisions; document any no-trade decision honestly.
3. Observe simulated orders and fills, including a case where paper does **not** fill at the displayed price.
4. Stop browser and reopen; backend run state persists. Pause new trades; already-held shares remain until resolved.
5. Review paired/unpaired lot costs, fee-adjusted paper PnL, official outcome and failed/missing market cases.
6. Compare ledger-derived equity with GUI totals; export CSV/JSON with assumptions and version IDs.
7. Verify real account funds/orders unchanged and **no** live writer registered.

**I5 implementation PASS:** autonomous live-feed paper run, safe controls, credible uncertainty-aware simulation, truthful PnL and reproducible forward-evaluation report. **I6 eligibility is separate:** require reviewed adequate forward evidence, actual safe signer and account/geographic eligibility. An I5 PASS is not a profitability claim or permission to trade real money.
