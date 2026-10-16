# Iteration-2-Implementation-Plan.md — Settlement-Aware Statistical Probability Model

> **Goal:** Run a lightweight, reproducible, causal statistical model continuously against actual current BTC 5-minute Up/Down markets and display honest forecasts in the GUI.  
> **Depends on:** I1 public BTC/CLOB data, verified market IDs/rules, source health, SQL/React shell.  
> **Excludes:** opportunities, order execution and real-money trading.  
> **References:** [Architecture](Architecture.md) §§5–6, 11; [UX](UX.md) §8.

## 1. What “done” means

Every active market can show a fresh, versioned **estimated** probability of official Up resolution, the corresponding Down probability, inputs, baseline comparison and source limitations. Predictions made *before* a market resolves are recorded immutably. Later authoritative reported outcomes are associated with the exact contract and scored when trustworthy. If the relevant settlement source or rule is unknown, the model shows `Unavailable` or explicitly **proxy research only**; it never silently equates Binance spot movement with the real contractual TWAP rule.

**Architecture constraint:** Polymarket's documented TWAP reference at start and finish, 5-minute market's exact rule/version, oracle report timing, and real execution price are separate phenomena. No paid Chainlink feed. Optional authenticated reference access is probed only if account/environment supports it, with no false equivalence claim.

## 2. Ordered work packages

### [I2-001] Freeze precise prediction target and rule registry

- Define `PUp(t) = P(official market UP outcome | locally received information by t)`. Save exact market/condition ID, token mapping, current contract text/hash and reported settlement semantics.
- Create immutable `SettlementRuleVersion` including contract duration, opening/closing instants, comparison boundary (`>=` if verified for that market), reference asset, source/lookback, source URL and verification grade.
- Unknown selectors, changed wording, missing end/open report, exceptional payouts and conflicting metadata are representable and block stronger claims. Do not coerce ambiguous cases to Down.
- Acceptance: independent rule input tests (equality boundary, swapped outcomes, mismatched tokens, missing report, future/late observations); research status correct.

### [I2-002] Introduce source-aware reference estimators

- `IReferenceProvider` returns `VerifiedContractual | EstimatedProxy | Unavailable` with value, source, observed-at timestamp, received-at timestamp, age, quality and uncertainty notes.
- For free proxy, consume labeled BTCUSD and BTCUSDT venue observations with clock alignment, stale exclusion, basis/divergence and a documented 60-second rolling computation that is **only an approximation**. Never average USD and USDT without basis treatment.
- If supported PolyBolt access exists, make a read-only optional reference probe and store stream identity, report timestamps and auth health. Authenticated price **alone** does not prove contract/selector equivalence.
- Decide defensible handling of unknown opening reference: use a distribution/band for a *research* forecast or output `Unavailable`; never select nearest tick and pretend authoritative.
- Acceptance: stale/diverging venue failures and opening/closing boundary tests; missing source never produces a plausible fake value.

### [I2-003] Build a causal online feature engine

- Rolling bounded feature windows: time to close; distance to the estimated opening reference; 1/5/15/30/60-second BTC returns, short-horizon realized volatility, jump flag, trade pressure if valid, book spread/depth imbalance, venue divergence, observation ages.
- Features keyed to market ID and reference/rule version; no contamination across previous and next market. First valid snapshot may be incomplete; report `FeatureUnavailable` reasons.
- Define causal cutoffs by local receipt time. Order events by explicit monotonic ingest sequence; future source-time events do not imply the local algorithm could have seen them earlier.
- Record immutable `FeatureSnapshot` IDs on actual model inference, with budgeted retention and source versions; do not persist every tick to SQL.
- Acceptance: synthetic late/out-of-order ticks cannot leak future information into previously computed forecast; bounded memory over many market rollovers.

### [I2-004] Implement M0 market-implied benchmark

- Derive non-tradable comparison probability from validated Up/Down best bid/ask or midpoint; include spread and liquidity metadata. Never label best ask as fair value or a tradable forecast.
- Emit baseline age and source epoch; if Up and Down quotes are inconsistent due to market microstructure, preserve observed discrepancy rather than automatically normalize away costs.
- Acceptance: baseline honest when only one side valid, depth is stale, spread wide or books unavailable. Unit test all contract price/quantity bounds.

### [I2-005] Implement M1 analytical statistical model

- Start with an explicit stochastic scenario model for the *proxy reference process*, using estimated opening threshold, current proxy, time to expiry, realized volatility plus near-boundary uncertainty. Use Monte Carlo with deterministic seeded RNG or closed-form approximation **only where assumptions apply**.
- Represent jumps/volatility regimes if evidence warrants; do not overfit arbitrary weights to a handful of first-day markets. Use a bounded CPU budget and model inference deadline; stale inference invalidates output.
- Compute `pUp`, `pDown=1-pUp`, model/reference version, timestamps and explicit blockers. If critical data missing, return unavailable. No model output as a trade instruction.
- Clearly expose difference between sampling standard error, model uncertainty and oracle proxy error; a small Monte Carlo standard error does **not** mean accurate settlement probability.
- Acceptance: deterministic seeded runs, probabilities finite/bounded/sum to 1, sensible behavior as time shrinks under fixed assumed process, no false oracle certification.

### [I2-006] Optional M2 microstructure correction, disabled by default

- Define stable feature schema for a bounded logistic calibration/correction using only causal 1–60s market flow, pressure and BTC motion. It does not need to ship enabled in the initial model baseline.
- Reserve model-artifact and version interfaces; never train on the same market's future outcome before its real-time forecasts were emitted. Any fitted model is frozen and evaluated in later non-overlapping forward observations.
- Acceptance: no training dependency for first real-time model, no auto-retraining or nondeterministic changed model on restart.

### [I2-007] Store pre-decision forecasts and official labels

- SQL tables `ReferenceObservations`, `ReferenceQualityEvents`, `FeatureSnapshots`, `ModelVersions`, `Forecasts`, `SettlementObservations`, `ModelEvaluations` with IDs/unique keys and provenance.
- Write sampled forecasts at well-defined ticks/meaningful changes (e.g. 1-second maximum with budget), with source timestamp, receive timestamp, immutable model version, feature snapshot, rule hash and uncertainty status. Sampling policy versioned.
- Poll official final outcomes after close; retain `Pending`, `Reported`, `Finalized`, `Conflicting`, `Exceptional` as distinct states; do not fabricate outcome from Coinbase/Binance close. Tie official results to exact condition/market token and payout.
- Acceptance: scoring ignores unresolved/invalid labels; duplicated responses do not produce duplicate final outcomes, contradicting reports remain visible.

### [I2-008] Add calibration measurement **without inventing confidence**

- Compute Brier score/log-loss by market, time-remaining buckets and volatility regime for pre-decision forecasts. Avoid counting hundreds of highly correlated ticks from one five-minute market as hundreds of independent events; report sample markets and how per-market aggregation works.
- Compare M1 to M0 and a no-information reference, with fresh forward-only evaluation. Emit `Uncalibrated` when insufficient reliable outcomes, and `Provisional` only with disclosed sample size.
- Empirical probability ranges may be introduced only after valid calibration evidence, training/validation split and coverage checks; otherwise lower/upper are `null`.
- Acceptance: no invented “95% confidence” or “70% accuracy” headline from tiny samples; log loss handles extreme probabilities safely.

### [I2-009] Implement real model GUI

- Predictions page: large Up/Down probability, actual baseline, model and source version, age, verified/proxy/unavailable badge, explanatory feature values, score history, source warnings and label coverage.
- Overview and Markets page: coalesced `forecast.updated` stream, visual probability trend and age; show gap on data outage and `Unavailable` instead of stale model output.
- Plain-language helper: “The model estimates the chance of **official contract resolution**, using an approximate reference because the oracle selector has not been verified.” No BUY/SELL display here.
- Acceptance: screenshots/browser proof at live window, stale feed, missing opening reference, market rollover, model not calibrated and reported settlement.

### [I2-010] Critical tests, measurement and handoff

- Tests: no-lookahead, exact market-rule mapping, decimal compare, proxy divergence, missing provider, simulated sudden jumps, expiry boundary, chronology ordering, probability invariants, official result dedup/conflict, feature cache rollover and model-version pinning.
- CPU/inference loop benchmark on target machine, prove no event starvation or unbounded memory; internal scheduler cancels obsolete forecasts.
- `docs/evidence/I2-Validation.md`: real source observations and sample inferred probabilities with no fabricated efficacy claims; score only where official results actually available.

## 3. Typed forecast contract

```ts
export interface ProbabilityForecast {
  forecastId: string;
  marketId: string;
  settlementSpecHash: string;
  modelVersion: string;
  featureSnapshotId: string;
  referenceBasis: 'verified-contractual' | 'estimated-proxy' | 'unavailable';
  pUp: number;
  pDown: number;
  conservativeUpLower: number | null;
  conservativeUpUpper: number | null;
  calibration: 'uncalibrated' | 'provisional' | 'validated';
  generatedAtUtc: string;
  validUntilUtc: string;
  blockers: readonly string[];
}
```

**Statistical-only `number`:** financial quotes/fees stay decimal strings and integer base units. Model and baseline scores do not authorize orders.

## 4. Operator manual verification

1. Launch live Markets and Predictions together during a full 5-minute window; inspect time remaining, model age and different source categories.
2. Disconnect BTC feed; observe model `Unavailable` or explicitly degraded, not a frozen probability quietly labeled live.
3. Rollover into next market; opening feature state resets, forecast obtains new exact ID; old window remains available for official scoring.
4. Compare displayed model probability versus actual public market bid/ask; see explanatory baseline distinction.
5. After finality, inspect official reported winner, associated stored pre-decision forecast and Brier/log loss; no label assigned before result.
6. Confirm no Opportunities can place orders and all exchange order writes remain absent.

## 5. Exit gate and I3 handoff

**PASS:** trustworthy point-in-time forecast object, versioned reference classification, real GUI, persistence/scoring discipline, honest `Unavailable` behavior and critical fault cases. **NOT required:** a profitable edge, historical backtest, paid Chainlink feed, statistically validated probability band or live trading.

Handoff to I3: `ProbabilityForecast` + `FeatureSnapshot` provenance, rule/ref quality, current paired Up/Down book epochs, tick/fee schedules and official resolved-label service. If proxy is still unverified, I3 may show research opportunities but must mark conservative edge/eligibility limits honestly.