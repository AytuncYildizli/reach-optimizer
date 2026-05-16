# Changelog

## v4.0.0 — 2026-05-15 (Phoenix alignment, Big Bang)

Realigned to [`xai-org/x-algorithm`](https://github.com/xai-org/x-algorithm) (May 2026). Links are no longer penalized; new signal taxonomy. **This is a breaking release** — API response shape, extension overlay, and Reach Forecast scenarios all changed.

### What changed

- **22-signal scoring engine.** The v3.0 five-category model (Hook / Structure / Engagement / Penalties / Bonuses) is replaced by a one-file-per-signal predictor in `packages/rules-engine/src/signals/`. Signal names match `home-mixer/scorers/ranking_scorer.rs` exactly (`favorite`, `reply`, `retweet`, `quote`, `share`, `share_via_dm`, `share_via_copy_link`, `click`, `profile_click`, `follow_author`, `photo_expand`, `vqv`, `dwell`, `cont_dwell_time`, `cont_click_dwell_time`, `quoted_click`, `quoted_vqv`, `not_dwelled`, `not_interested`, `block_author`, `mute_author`, `report`).
- **Link penalty inverted.** v3.0 cut reach ~30–50% for outbound links. v4.0 treats a link with a descriptive anchor and a curiosity gap as a **positive** `click` signal (max +8). The Forecast scenario "Remove the link" is replaced by "Add a curiosity gap before the link".
- **No more hashtag / language / competitor penalties.** None had any representation in the May-2026 published code, so they were removed entirely. All-caps spam detection moved into `report` and `mute_author` predictors.
- **Conditional signal gating.** `photo_expand` only fires when an image is attached; `vqv` only when a video is attached; `quoted_click` / `quoted_vqv` only when composing a quote-tweet; `cont_click_dwell_time` only when there is clickable content. Inert signals contribute 0, not negative.
- **New buckets in the X-Ray overlay.** The 5-category breakdown bar is replaced by 4 buckets — Engagement, Curiosity, Dwell, Risk — that sum the underlying signals for display only.

### Breaking API changes

- `AnalyzeResponse.data` is now `AnalysisResult`:
  - `reachScore` → `score`
  - `breakdown: { hook, structure, engagement, penalties, bonuses }` → `signalScores: Record<SignalName, SignalScore>` + `applicableSignals: SignalName[]`
  - `baseScore` is now part of the response (was a hidden config value before)
- The legacy v3 `categoryScores` field is **gone** with no compat layer (per the v4 Big Bang plan).
- `ScoreEngine` constructor no longer takes a `rules` array — the signal registry is internal. Use `new ScoreEngine()`.
- `@reach/rules-engine` no longer exports `allClientRules`, `linkDetectionRule`, or any of the v3 rule modules.

### Migration notes for self-hosters

- **Re-deploy the API.** The analyze route writes the v4 single score into the existing `reachScore` DB column and serializes the full `signalScores` object into the existing `ruleResults` JSON column. **No Prisma migration is required.**
- **Reload the extension.** Existing chrome.storage state is forward-compatible; only the in-memory analysis shape changed.
- **Update integrations.** Any client that parsed `data.breakdown.*` or `data.reachScore` from `/api/analyze` must switch to `data.score` and `data.signalScores.<signal>.score`.
- **Calibration corpus.** v4 ships a 200-post calibration corpus in `packages/rules-engine/src/__tests__/corpus.test.ts`. Each post is bucketed (dead / average / strong / viral / spam) and the engine output is asserted to bucket correctly within a 20% noise tolerance. If you fork the rules, re-run this test to make sure your tuning didn't degrade calibration.

### Why this release

xAI published `x-algorithm` on 2026-05-15. It deliberately omits numeric weights, but the **signal names** and the **score-combination math** are now public. v4.0 mirrors both:

```rust
// from home-mixer/scorers/ranking_scorer.rs:146-172
let combined = Σ P(action_i) × weight_i;
let offset_score = (combined + negative_sum) / total_sum × NEGATIVE_SCORES_OFFSET;
```

ReachOS predicts P(action_i) from explicit rules (deterministic, client-side, explainable). X predicts the same probabilities from the Phoenix transformer. The shape of the math is identical — only the predictor differs.

### What's still v3-shaped (intentional)

- **No OON penalty / author-diversity decay / brand-safety BotMaker buckets.** Those are X's serving-side concerns and a composer tool cannot influence them.
- **No Phoenix transformer inference.** ReachOS stays deterministic + client-side so the overlay can update on every keystroke.
- **No DB schema migration.** The v3 `hookScore` / `structureScore` etc. columns are still in the schema but are written as `0`. The full v4 signal vector lands in `ruleResults` (JSON). A schema cleanup will land in v4.1.

### Spec & references

- Full design: [`docs/superpowers/specs/2026-05-15-reachos-v4-x-algorithm-alignment-design.md`](docs/superpowers/specs/2026-05-15-reachos-v4-x-algorithm-alignment-design.md)
- Source signal definitions: [`github.com/xai-org/x-algorithm/home-mixer/scorers/ranking_scorer.rs`](https://github.com/xai-org/x-algorithm)

---

## v3.0 and earlier

See git history for v3.0 (algorithm research), v2.x (BYOK + Chrome Web Store launch), and v1.x (initial open-source release).
