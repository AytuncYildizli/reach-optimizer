# ReachOS v4.0 — X Algorithm Alignment (Phoenix Era)

**Date:** 2026-05-15
**Status:** Design — pending user review
**Scope:** Full rewrite of `packages/rules-engine` to mirror the 22-signal taxonomy published by xAI at `github.com/xai-org/x-algorithm` on 2026-05-15.

## Why

On 2026-05-15 xAI published `x-algorithm` — a rewrite of X's recommendation pipeline replacing the 2023 Scala/Java code with a Rust serving layer plus a single Grok-based transformer (Phoenix). The published code exposes:

- 17 positive engagement signals and 5 negative signals scored by `home-mixer/scorers/ranking_scorer.rs`.
- Zero outbound-link penalty, zero hashtag penalty, zero competitor penalty, zero language penalty anywhere in source.
- No TweepCred / RealGraph / PageRank — author reputation is learned inside the transformer.

ReachOS v3.0 was calibrated against the 2023 leak: it penalizes links, hashtags, language, competitors, and uses 5 reachOS-internal categories (hook / structure / engagement / penalty / bonus) that have no direct mapping to X's published signal names.

v4.0 realigns reachOS to the May-2026 taxonomy. The shift is from "what makes a tweet good" (reachOS framing) to "which X signals does this tweet trigger" (X framing).

## Goals

1. Replace v3.0's 5-category scoring with **17 positive + 5 negative signal predictors**, named identically to `ranking_scorer.rs`.
2. Remove penalty rules with no representation in X's published code (link, hashtag, competitor, language).
3. Invert the link signal: links + descriptive anchor + curiosity gap become a **positive** `click` predictor.
4. Preserve client-side instant feedback and rule explainability — no model inference in the extension.

## Non-Goals

- Mirroring the Phoenix transformer or any ML inference inside reachOS.
- OON penalty, author-diversity decay, brand-safety BotMaker buckets — these are **viewer-side / serving-side** concerns. ReachOS is a composer tool and cannot influence them.
- Backward compatibility with v3.0 API response shape. v4.0 is a Big Bang release.

## Architecture

### Signal taxonomy

22 signals total, each implemented as its own rule family in `packages/rules-engine/src/signals/<signal-name>.ts`.

#### Positive signals (17, sum of maxPoints = 95)

| Signal | maxPoints | Applies when | What rules predict |
|---|---|---|---|
| `favorite` | 7 | Always | Identifiable emotion, validation-seeking framing, broad-appeal claim |
| `reply` | 12 | Always | Open question, 2nd-person address, takes a position, incomplete thought |
| `retweet` | 7 | Always | Quotable line, succinct insight, "everyone should know", aphoristic |
| `quote` | 6 | Always | Contrarian/polarizing, "but actually" room, confident-but-discussable |
| `share` | 5 | Always | Surprising fact, news-shaped content, exclusive-feeling framing |
| `share_via_dm` | 6 | Always | Insider framing, niche targeting, "send this to your boss" patterns |
| `share_via_copy_link` | 4 | Always | Framework/list, evergreen reference, tool/resource link |
| `click` | 8 | Always | Link present + descriptive anchor + curiosity gap. **Replaces v3.0 link penalty.** |
| `profile_click` | 7 | Always | First-person specific achievement, unusual POV, named credentials |
| `follow_author` | 5 | Always | Series marker (1/5), niche ownership, distinctive voice |
| `photo_expand` | 4 | Has image | Image-teaser text, partial visual hint, AI vision eval |
| `vqv` | 4 | Has video | Video caption hook, length-promise match |
| `dwell` | 8 | Always | Optimal length, paragraph breaks, no wall-of-text, vertical readability |
| `cont_dwell_time` | 4 | Always | Sustained-attention text, second-paragraph payoff, longer-form value |
| `cont_click_dwell_time` | 3 | Has clickable | Post-click reward signal, link-target value-promise |
| `quoted_click` | 3 | Quote-tweet | Quote commentary that drives click on the quoted post |
| `quoted_vqv` | 2 | Quote-tweet w/ video | Quote commentary on video that drives video view |

#### Negative signals (5, sum of maxPenalty = -50)

| Signal | maxPenalty | What rules predict |
|---|---|---|
| `not_dwelled` | -12 | Wall-of-text, generic opener, weak first line, AI slop patterns |
| `not_interested` | -8 | Pure rant, excessive self-promo ratio, off-topic |
| `block_author` | -8 | Ad-hominem, aggressive tone, harassment patterns |
| `mute_author` | -7 | Excessive posting cadence cues, repetitive thread spam |
| `report` | -15 | Spam patterns (repeated chars/words), explicit policy violations |

#### Scoring formula

```
finalScore = clamp(0, 100,
  baseScore
  + Σ positive_signals[i].score  // each 0..maxPoints
  + Σ negative_signals[j].score  // each maxPenalty..0
)
```

baseScore = 30. Theoretical max 125 → clamps to 100. Theoretical min -20 → clamps to 0. Realistic spread 15–85.

This mirrors `home-mixer/scorers/ranking_scorer.rs:146-172`:
```rust
let combined = Σ P(action_i) × weight_i;
let offset_score = (combined + negative_sum) / total_sum × NEGATIVE_SCORES_OFFSET;
```

Difference: reachOS predicts probabilities from rules (deterministic, client-side) rather than from a transformer.

### `weights.json` v4.0.0

```json
{
  "version": "4.0.0",
  "baseScore": 30,
  "signals": {
    "favorite":              { "maxPoints":  7,  "type": "positive" },
    "reply":                 { "maxPoints": 12,  "type": "positive" },
    "retweet":               { "maxPoints":  7,  "type": "positive" },
    "quote":                 { "maxPoints":  6,  "type": "positive" },
    "share":                 { "maxPoints":  5,  "type": "positive" },
    "share_via_dm":          { "maxPoints":  6,  "type": "positive" },
    "share_via_copy_link":   { "maxPoints":  4,  "type": "positive" },
    "click":                 { "maxPoints":  8,  "type": "positive" },
    "profile_click":         { "maxPoints":  7,  "type": "positive" },
    "follow_author":         { "maxPoints":  5,  "type": "positive" },
    "photo_expand":          { "maxPoints":  4,  "type": "positive", "conditional": "hasImage" },
    "vqv":                   { "maxPoints":  4,  "type": "positive", "conditional": "hasVideo" },
    "dwell":                 { "maxPoints":  8,  "type": "positive" },
    "cont_dwell_time":       { "maxPoints":  4,  "type": "positive" },
    "cont_click_dwell_time": { "maxPoints":  3,  "type": "positive", "conditional": "hasClickable" },
    "quoted_click":          { "maxPoints":  3,  "type": "positive", "conditional": "isQuoteTweet" },
    "quoted_vqv":            { "maxPoints":  2,  "type": "positive", "conditional": "isQuoteTweet,hasVideo" },
    "not_dwelled":           { "maxPenalty": -12, "type": "negative" },
    "not_interested":        { "maxPenalty":  -8, "type": "negative" },
    "block_author":          { "maxPenalty":  -8, "type": "negative" },
    "mute_author":           { "maxPenalty":  -7, "type": "negative" },
    "report":                { "maxPenalty": -15, "type": "negative" }
  },
  "tiers": {
    "critical":      { "min": 0,  "max": 20, "label": "Don't Post" },
    "below_average": { "min": 21, "max": 40, "label": "Significant Revision Needed" },
    "good":          { "min": 41, "max": 60, "label": "Average" },
    "excellent":     { "min": 61, "max": 79, "label": "Strong" },
    "perfect":       { "min": 80, "max": 100, "label": "Exceptional" }
  }
}
```

Conditional signals contribute 0 when their condition is false (they don't penalize; they're inert until applicable). `hasClickable` = post contains a URL or is long enough to trigger "Show more" expansion.

### File structure (new)

```
packages/rules-engine/src/
  config/
    weights.json
  signals/
    index.ts                       # registry of all 22 signal predictors
    favorite.ts
    reply.ts
    retweet.ts
    quote.ts
    share.ts
    share-via-dm.ts
    share-via-copy-link.ts
    click.ts
    profile-click.ts
    follow-author.ts
    photo-expand.ts
    vqv.ts
    dwell.ts
    cont-dwell-time.ts
    cont-click-dwell-time.ts
    quoted-click.ts
    quoted-vqv.ts
    not-dwelled.ts
    not-interested.ts
    block-author.ts
    mute-author.ts
    report.ts
  engine.ts                        # signal-vector sum, conditional gating
  index.ts                         # public exports
  __tests__/
    signals/                       # one test file per signal predictor
    engine.test.ts
```

### Files deleted (v3.0 → v4.0)

```
packages/rules-engine/src/
  rules/                           # entire directory
    advanced-hook-rules.ts
    ai-detection-rules.ts
    engagement-rules.ts
    hook-rules.ts
    link-detection.ts
    penalty-rules.ts
    quality-signal-rules.ts
    reply-potential-rules.ts
    structure-rules.ts
  all-client-rules.ts              # superseded by signals/index.ts
```

### Rule predictor anatomy

Each signal file exports a single function:

```ts
// signals/reply.ts
import type { PostContext, SignalScore } from "../types";

export function predictReply(ctx: PostContext): SignalScore {
  const subRules = [
    { name: "ends_with_question",   weight: 4, fired: /\?[\s)]*$/.test(ctx.text) },
    { name: "uses_second_person",   weight: 2, fired: /\b(you|your|you're)\b/i.test(ctx.text) },
    { name: "takes_a_position",     weight: 3, fired: hasOpinionMarkers(ctx.text) },
    { name: "incomplete_thought",   weight: 2, fired: invitesCompletion(ctx.text) },
    { name: "controversy_marker",   weight: 1, fired: hasControversyMarker(ctx.text) },
  ];
  const score = subRules.filter(r => r.fired).reduce((sum, r) => sum + r.weight, 0);
  return {
    signal: "reply",
    score: Math.min(score, 12),       // clamp to maxPoints
    firedRules: subRules.filter(r => r.fired).map(r => r.name),
  };
}
```

This shape gives reachOS:
- One file per signal — easy to update one without touching others.
- `firedRules` array preserved on the response for explainability (X-Ray overlay shows exactly which sub-rules contributed).
- Sub-rule weights tunable independently — each signal's maxPoints is its own optimization budget.

### Engine changes (`engine.ts`)

v3.0 engine sums 5 category subtotals. v4.0 engine:

1. Builds the `PostContext` (text, media, isQuoteTweet, hasClickable).
2. Calls every signal predictor (gated by `conditional` field in weights.json).
3. Sums positive signal scores + negative signal penalties + baseScore.
4. Clamps to [0, 100].
5. Returns `{ finalScore, signalScores: Record<SignalName, SignalScore>, baseScore }`.

### API response shape (BREAKING)

```ts
// v3.0 (removed)
type V3Response = {
  score: number;
  categoryScores: { hook, structure, engagement, penalty, bonus };
  firedRules: string[];
};

// v4.0 (new)
type V4Response = {
  score: number;
  baseScore: number;
  signalScores: Record<SignalName, {
    score: number;
    maxPoints: number;
    type: "positive" | "negative";
    firedRules: string[];
  }>;
  applicableSignals: SignalName[];  // excludes inert conditional signals
};
```

Server (`apps/api/app/api/analyze/route.ts`) and extension (`apps/extension/src/content/ScoreOverlay.tsx`, `apps/extension/src/popup/Popup.tsx`) consume the new shape. v3.0 response shape is deleted — no compat layer.

## Migration

### What user-facing flows change

1. **X-Ray Mode overlay** — currently shows 5 category bars. v4.0 shows 22-signal grid (or grouped into 4 visual buckets: Engagement / Curiosity / Dwell / Risk). The bucket grouping is a UI choice, not a scoring choice — buckets sum per-signal scores for display only.

2. **Reach Forecast "what-if" scenarios** — currently has `remove link +52%`, `add media +38%`, `peak time +25%`, `trending +15%`. After v4.0:
   - `remove link +52%` → **deleted**. Links are now positive.
   - `add curiosity gap before link +X%` → new scenario. Predicts increased `click` signal.
   - `add media +38%` → split into `add image` (predicts `photo_expand`) and `add video` (predicts `vqv`).
   - `peak time +25%`, `trending +15%` → unchanged (these are timing scenarios, not text scenarios).

3. **Self-calibrating prediction loop** (Session 6 feature) — already stores `predictedReach`. The cron that compares predicted-vs-actual still works; only the inputs change. No schema migration to user data needed.

4. **AI server `/api/suggest`** — prompts updated to suggest per-signal improvements:
   - Old: "Improve hook strength, reduce penalty."
   - New: "Increase `click` (add descriptive link anchor) and `profile_click` (specify which startup you ran)."

### Versioning & comms

- Bump `version` in weights.json to `4.0.0`.
- Bump extension manifest version (last shipped v2 to Chrome Web Store).
- Add `CHANGELOG.md` entry: "v4.0 — realigned to xai-org/x-algorithm (May 2026). Links no longer penalized; new signal taxonomy."
- Update README: replace v3.0 algorithm research bullets with v4.0 signal table.
- Update launch-materials.md with the Forecast scenario changes.

## Testing

### Unit tests

- One test file per signal: `signals/__tests__/<signal>.test.ts`.
- Each tests sub-rule firing in isolation + clamp behavior at maxPoints.
- Snapshot: a corpus of 50 example posts with expected per-signal scores.

### Integration tests

- `engine.test.ts`: full-engine on a diverse post corpus, assert score in [0, 100], all conditional signals correctly gated.
- `all-signals-integration.test.ts` (replaces `all-rules-integration.test.ts`): verifies every signal predictor is registered and reachable.

### Calibration corpus

Build a 200-post corpus tagged with known X-side outcomes (likes, replies, RTs from public tweets). Run v4.0 engine; verify high-reply tweets score high on `reply` signal, viral tweets score high on `retweet` + `share`, etc. This is a **validation pass**, not a learning loop — weights stay rule-defined.

## Risks & tradeoffs

1. **Removed link penalty is the most public-facing change.** Users who've used reachOS may have internalized "remove links". Changelog should explicitly state: "X's published code no longer penalizes outbound links; v4.0 treats descriptive links as a positive `click` signal."

2. **Weights are speculative.** X's repo ships signal *names* but not numeric weights. Our weight allocation (reply=12, report=-15, etc.) is informed by the 2023 leak's relative scaling and reachOS's own field experience. A future v4.1 may recalibrate after validation-corpus results.

3. **Conditional signal complexity.** 5 of 22 signals (`photo_expand`, `vqv`, `cont_click_dwell_time`, `quoted_click`, `quoted_vqv`) only apply when the post has specific structural properties. Engine must gate correctly or scores get inflated/deflated unfairly.

4. **Rule overlap.** Some sub-rules will logically belong to multiple signals (e.g., "ends with question" is both `reply` and possibly `dwell`). Each signal's predictor is independent; overlap is by design and expected. The total score correctly aggregates the dual contribution.

5. **AI server cost.** Adding `photo_expand` multimodal evaluation increases per-analyze cost (Claude vision call). Make multimodal eval **opt-in via env flag** so self-hosted instances can disable it.

6. **No telemetry yet on whether links are actually penalized.** X's repo absence is suggestive, not proof. The Phoenix transformer could still penalize links via learned weights. v4.0 treats absence as the working assumption and will recalibrate if field data contradicts.

## Open questions

None blocking implementation. All resolved during brainstorming:
- Faithfulness level: full 17+5 taxonomy.
- Rollout: Big Bang, no v3.0 backward compat.
- Penalties: removed for link/hashtag/language/competitor.
- New positive `click` signal: yes, replaces inverted link penalty.

## References

- `github.com/xai-org/x-algorithm` — May 2026 release
  - `home-mixer/scorers/ranking_scorer.rs:12-115` — full signal weight struct
  - `home-mixer/scorers/weighted_scorer.rs:49-67` — weight application
  - `home-mixer/scorers/ranking_scorer.rs:146-172` — final score formula
  - `home-mixer/scorers/author_diversity_scorer.rs:29-31` — diversity decay (not reachOS scope)
  - `home-mixer/scorers/oon_scorer.rs:20-23` — OON multiplier (not reachOS scope)
- ReachOS v3.0 algorithm research — `~/.claude/projects/-Users-aytuncyildizli-session5/memory/reachos_algorithm_research.md`
- ReachOS v3.0 source — `packages/rules-engine/src/`
