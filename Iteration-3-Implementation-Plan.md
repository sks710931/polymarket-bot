# Iteration-3-Implementation-Plan.md — Execution-Aware Opportunities and Central Risk

> **Goal:** Turn versioned probabilities and valid Up/Down depth into **transparent, cost-aware candidate trades**, then reject or rank them under a shared portfolio risk policy.  
> **Depends on:** I1 market order books/account reads and I2 forecasts/reference classification.  
> **Hard limit:** No real exchange order submission, no simulated order side effects. This is a decision engine only.  
> **References:** [Architecture](Architecture.md) §§7–8; [UX](UX.md) §9.

## 1. Scope and strategy priority

Initial engine supports **directional Up/Down buy proposals** and **simultaneous attempted paired-position proposals** with explicit two-leg risk; design an extension for sequential pair assembly and inventory-aware passive maker quotes. All three are independently attributable and share one portfolio/risk controller. An invalid model reference, aged book, insufficient depth, unpriced fees or poor expected value produces **NO TRADE**, not a forced action. Research-only calculations can be displayed even if they are not approved for paper/live.

Profit objective is after-cost expected payoff, not percentage of correct Up/Down guesses. Arbitrage is "locked" economically **only if both complementary legs actually fill** and normal contract payout/cost assumptions hold. Proposed pairs are not yet completed hedges.

## 2. Ordered work packages

### [I3-001] Define immutable proposals and cause/effect trace

- Add typed `TradeProposal`, `ProposalLeg`, `ExecutionCostBreakdown`, `ProposalRisk`, `OpportunityDecision`, `NoTradeReason` with versioned schema and trace `forecastId`, market/rule ID, validated book epoch, model version, fee schedule and generated/expiry times.
- Validate proposal quantity/price precision, buy/sell outcome token, identity and UTC cutoff; forbid raw SDK orders and direct strategy-to-exchange API access at type/import boundary.
- Decisions are persisted with input hashes for later auditing and paper replay, not every transient book tick.
- Acceptance: same input snapshot + config yields same scored decision; invalid/expired proposals rejected.

### [I3-002] Executable book sweep and marginal-quantity pricing

- For each side, compute best ask, cumulative depth, weighted average total fill price for multiple feasible sizes, tick/minimum order size and availability at each level.
- Exact decimal arithmetic; distinguish buying Up/Down from selling existing shares at **bid**. An order cannot assume filling full intended size at best ask if only 10 shares available there.
- Define depth validity and maximum acceptable snapshot age; detect crossed/empty books, missing side, inconsistent market token identity, invalid levels and non-monotone quantity aggregation. The engine returns `BookInvalid` instead of optimistic VWAP.
- Build a sensitivity function `totalCost(q)` and `marginalEdge(q)` so recommended size shrinks when later levels remove edge.
- Acceptance: multi-level 10/100/1,000-share fixtures reproduce precise VWAP and correctly stop at insufficient liquidity.

### [I3-003] Current fee schedule and execution friction

- Obtain live `market.trading.feeSchedule` or equivalent verified market metadata, market tick/size, taker/maker status, fee precision/rounding and rate changes. Current crypto documentation describes `fee = C × feeRate × p × (1-p)` per trade, with maker fee zero; **do not hardcode the current rate as universal**.
- Model fee at anticipated individual fill prices and relevant buy/sell leg, with broker-specified rounding; rebates only upon confirmed earnings, never assumed in initial projected profit.
- Track price-impact (book sweep) separately from additional latency/slippage/missed-fill uncertainty, reference/probability uncertainty and optional risk penalty: forbid double counting.
- Acceptance: fees can turn apparent pair `UpAsk + DownAsk < 1` into negative edge; fee change invalidates stale cost cache.

### [I3-004] Directional expected-value optimizer

- For buy-to-resolution, calculate `EVUpLower(q) = pUpLower - VWAPUp(q) - feePerShare(q) - buffer(q)` and `EVDownLower(q) = (1-pUpUpper) - VWAPDown(q) - fees - buffer`.
- Where calibrated probability bounds are missing, return research-only **point estimate with explicit uncertainty** and `ConservativeEVUnavailable`; never synthesize a 95% bound from a fixed buffer. A separately policy-defined *scenario* edge can be shown for paper investigation and labeled non-validated.
- Consider exit-before-settlement only as a separate strategy with feasible future sell bid/cost model. Avoid treating forecast EV as a guaranteed cash profit.
- Enumerate legal quantity increments and choose max conservative expected total value subject to policy limits and monotone fill costs; reject candidate when size, currency or tick is unsupported.
- Acceptance: cases near extreme prices, pUp close to pDown, no edge, missing bounds, no depth and early expiry all have clear reasons.

### [I3-005] Completed pair and sequential pair evaluation

- Evaluate equal-quantity Up+Down acquisition from independent valid books, **including both fees, time and leg execution uncertainty**. Define paired economic margin `normalPairPayout - combinedFillCost - fees - riskBuffer`.
- Model first-leg-at-risk explicitly: if only the Up leg fills, Down could become expensive/unavailable; cap worst-case directional liability and second-leg deadline. Never call the first fill locked arbitrage.
- Persist `PairPlanId`, `hedgeDeadline`, `maxUnpairedShares`, `maxHedgeCost`, recovery alternatives and abandonment policy for use by I4/I5. P&L requires actual per-lot matched cost later.
- Acceptance: adversarial tests where first leg fills and second never does, second jumps to 90¢, fee removes margin or market closes mid-pair — strategy is rejected or constrained, not assumed risk-free.

### [I3-006] Inventory-aware passive maker proposal (paper-first)

- Design reservation-price adjustment for signed inventory, volatility and adverse selection. Produce maker quotes with explicit maximum rest age, queue/fill uncertainty, cancel/replace threshold and expiry cutoff.
- Initially mark `ResearchOnly` or `PaperEligible` as permitted by coverage; do not pretend a posted order would fill. Keep proposed maker orders mutually exclusive with conflicting buy/taker actions.
- Acceptance: quotes become more conservative as position imbalance increases; stale market and unverified fill model disable actionable proposals.

### [I3-007] Portfolio actor and central risk policy

- A **single** backend risk arbiter reads account snapshot, existing exchange orders/positions, portfolio reservations and mode-specific exposures; its decisions are serializable and version fenced.
- For I3, calculate risk/approval hypothetically without reserving real collateral. I4 will persist reservations atomically alongside order intents. Distinct paper vs live limits established even when not yet enabled.
- Hard constraints: max per-market cash, aggregate correlated BTC exposure, max unpaired shares/duration, time to close, max orders, stale sources, unknown wallet/ref/rules, daily loss budget and mode permissions. **Live maximum spend remains zero** until I6.
- Avoid double-spend from multiple opportunity candidates: select one coherent plan or explicit compatible basket under a single projected account snapshot. `NoTrade` is default.
- Acceptance: rival directional/pair/maker proposals cannot each use the same dollar; test stale portfolio version, pending orders, conflict, unsupported account.

### [I3-008] Opportunity priority ranking and decision reasons

- Rank proposals by a documented risk-adjusted *total* expected value and executability, not simply maximum probability delta or best-ask spread. Penalize unhedged first-leg exposure and fill uncertainty.
- Apply expiry/staleness gates at proposal evaluation, before risk and again at future execution handoff. `OpportunityId` immutable. Publish rejection reason codes and assumptions in SQL and UI.
- Acceptance: a superior theoretical edge with 1 executable share does not automatically outrank a lower percentage edge with realistic capacity; score rationale auditable.

### [I3-009] Integrate GUI and diagnostic endpoints

- `/api/v1/markets/{id}/opportunities`, `/api/v1/risk/policy`, `/api/v1/risk/decisions`; stream coalesced `opportunity.updated` with the forecast/model/book identity.
- Each opportunity card displays projected action, side, max fillable size, inspected VWAP, fee/slippage/uncertainty, estimated PnL, risk reason, expiry, and visible `Research Only / Paper Candidate / Rejected` status.
- Nontechnical explanation: “The model estimates 57% Up; the real cost for 30 shares is approximately X, after fees. We cannot validate the reference, so the bot will not trade.”
- Acceptance: explainable **No Trade** state and stale invalidation demonstrated, no "trade now" button or endpoint.

### [I3-010] Reproducibility, fault cases and handoff

- Critical fixtures: high best ask but thin liquidity, both books out of sync, missing fee, early close, partial hedge, bad decimal precision, unknown sell inventory, stale forecast and account balance, double spend, reservation version race.
- Benchmark CPU cost on real book feed and bounded proposal publication; record only meaningful changes with stable IDs to prevent GUI churn.
- Write `docs/evidence/I3-Validation.md` including real observations and scenarios without claiming actual fill or profit.

## 3. Typed domain output

```ts
export type ProposalStatus =
  | 'research-only' | 'paper-eligible' | 'live-eligible' | 'rejected';

export interface TradeProposal {
  proposalId: string;
  strategy: 'directional' | 'paired' | 'sequential-pair' | 'maker';
  marketId: string;
  forecastId: string;
  validatedBookEpochs: readonly string[];
  status: ProposalStatus;
  targetShares: string; // exact decimal
  projectedTotalCost: string;
  feeEstimate: string;
  estimatedEdge: string | null;
  conservativeEdge: string | null;
  riskPolicyVersion: string;
  expiresAtUtc: string;
  rejectionReasons: readonly string[];
}
```

`live-eligible` is reserved in the type for later use; **I3 must never emit actionable live authorization**. Only I6 live gates may do so. Proposal status does not imply a wallet signature or reserved capital.

## 4. Operator verification and exit

1. During a real market, view model Up/Down probability, two complete order books and per-quantity costs on Opportunities.
2. Increase hypothetical quantity; verify VWAP worsens or depth runs out, fees increase, and edge may disappear.
3. Introduce missing/invalid UP or DOWN depth; pair candidate immediately becomes unavailable.
4. Inspect a sequential pair's first-leg-at-risk warning and conservative maximum exposure.
5. Open Settings & Health to see reasons for `No Trade` and portfolio/forecast age.
6. Confirm zero placed orders, no order signing, and no real/cash ledger effects.

**PASS:** deterministic, precise, transparent, risk-screened proposals and an explainable GUI. A positive edge based on an **unvalidated** probability is not sufficient to promote it to live eligibility. I4 receives typed proposals, risk decisions, assumptions, account portfolio snapshot and exact order-execution requirements.
