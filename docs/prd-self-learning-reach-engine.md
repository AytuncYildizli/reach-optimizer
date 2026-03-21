# ReachOS PRD: Self-Learning Reach Engine and Viral Growth Loop

Status: Draft 0.1  
Date: 2026-03-21  
Product: ReachOS  
Positioning: "Grammarly for Reach" for X creators

## 1. Why This PRD Exists

ReachOS already has a credible wedge:

- in-composer scoring inside X
- client-side rules for hooks, structure, engagement, and penalties
- server-side AI checks and suggestions
- post tracking and a basic metrics dashboard

That is enough to prove usefulness, but not enough to build a durable moat.

Today, ReachOS is mostly a rules engine with AI assistance. To become defensible, it needs to become a learning system that:

- predicts likely reach before posting
- captures real outcomes after posting
- learns what works per user, niche, and format
- turns measurable wins into product distribution

## 2. Research Summary and Double-Check

Research date: 2026-03-21.

### Confirmed from official X documentation

1. X exposes the post metrics needed to train a scoring system.
   - The X metrics docs list `public_metrics.reply_count`, `quote_count`, `retweet_count`, `like_count`, and `impression_count`, plus `non_public_metrics.url_link_clicks` and `user_profile_clicks`.
   - This means ReachOS can train on both public engagement and owned-post private metrics when the user has connected OAuth.

2. Owned-post private metrics require user-context auth.
   - The X metrics docs explicitly say private metrics require OAuth for posts you own.
   - This supports keeping authenticated accounts as the main path for a real learning loop.

3. Bookmark counts are visible on X.
   - X Help states that bookmark counts on posts are visible to everyone, while the identities of bookmarking users remain private.
   - Bookmarks are valid as a first-class quality signal, not just an internal proxy.

### Confirmed from current external market data

1. Time-of-day matters, but it is a secondary optimization.
   - Buffer's "The Best Time to Post on Twitter/X in 2026" analysis of 1M posts says Wednesday is the strongest day overall, with weekday morning slots around 9-10 a.m. performing best.
   - This is useful as a scheduling feature, but it should not be the core product thesis.

2. The main creator-tool market is crowded on drafting, scheduling, and automation.
   - Tweet Hunter emphasizes scheduling, automation, analytics, and AI generation.
   - Hypefury emphasizes prompts, analytics, auto-retweets, and auto-comment "autoplugs."
   - Typefully offers AI quick edits, AI ideation, API-based draft/publish workflows, and engagement-triggered auto-plugs.

3. The gap is not "AI writes tweets."
   - Competitors already cover writing help, scheduling, automation, and post-performance views.
   - ReachOS's strongest differentiated position is live, in-composer, outcome-linked prediction and improvement on X itself.

### Confirmed from the current codebase

1. ReachOS already tracks pre-post score at publish time.
   - `apps/extension/src/content/post-tracker.ts` sends `content`, `reachScore`, and `tweetUrl` to `/api/tweets/track`.

2. ReachOS already stores tracked posts and metric snapshots.
   - `apps/api/prisma/schema.prisma` has `TrackedTweet` and `TweetMetric`.
   - `apps/api/app/api/cron/fetch-metrics/route.ts` fetches downstream metrics and stores them.

3. ReachOS already surfaces metrics in the popup and dashboard.
   - `apps/extension/src/popup/Popup.tsx` shows recent tracked tweets and latest metrics.
   - `apps/api/app/dashboard/page.tsx` shows tracked tweets and basic aggregate stats.

### Double-checked product risks in the current implementation

1. Attribution is likely unreliable.
   - `post-tracker.ts` sends `window.location.href` on click.
   - `tweets/track/route.ts` derives `xTweetId` only from `status/{id}`.
   - In normal compose flows, `window.location.href` at click time is often not the final status URL.
   - Result: `xTweetId` may be null, which blocks downstream metric fetches.

2. The current learning loop is too narrow in time.
   - `fetch-metrics/route.ts` only fetches tracked tweets from the last 24 hours.
   - That is enough for early velocity, but not enough for 72-hour or 7-day outcome capture.

3. Suggestions currently learn from predicted winners, not actual winners.
   - `tweets/suggestions/route.ts` uses prior `reachScore` as the ranking signal for "top tweets."
   - This risks self-confirming bias: the system imitates its own predictions instead of real performance.

## 3. Problem Statement

Creators do not need another generic AI writer. They need a tool that answers:

- Will this post likely outperform my baseline before I publish it?
- What exact changes would improve it?
- Did the prediction hold up after posting?
- What is working for my account specifically, not for "creators in general"?

ReachOS currently answers the second question reasonably well. It does not yet answer the first, third, or fourth with enough rigor.

## 4. Product Goal

Build a self-learning reach engine for X that improves post quality before publishing, measures actual performance after publishing, and personalizes recommendations based on real outcomes.

## 5. Non-Goals

- Become a general-purpose cross-platform scheduler
- Compete head-on on bulk automation or auto-DM tooling
- Promise "virality" as a deterministic outcome
- Optimize for low-quality engagement bait

## 6. Product Principles

1. Optimize for trustworthy lift, not flashy scores.
2. Separate prediction from outcome.
3. Personalization must learn from the user's own data first.
4. Reach should not come at the cost of spam risk or voice collapse.
5. Distribution features should amplify genuine wins, not fabricate them.

## 7. User Value Proposition

ReachOS should become:

- the fastest way to improve a draft before posting
- the clearest way to understand why a post won or lost
- the only X-native tool that ties real-time writing feedback to real outcome learning

## 8. Core Product Model

ReachOS should move from one score to three scores.

### 8.1 Potential Score

What it is:

- a pre-post predictive score from 0-100
- shown in the composer
- built from rules, AI checks, and learned weights

Inputs:

- hook type
- hook strength
- first 7 words
- draft length bucket
- sentence count
- question vs statement
- presence of numbers
- first-person voice
- CTA style
- link presence
- hashtag count
- emoji count
- AI-slop markers
- topic cluster
- planned publish time
- media presence when detectable

Output:

- `potentialScore`
- score breakdown by component
- confidence band
- fix suggestions ranked by expected lift

### 8.2 Fit Score

What it is:

- a personalized compatibility score for the current account
- answers "does this draft resemble what works for this user?"

Inputs:

- user's winning hook patterns
- user's winning topic clusters
- user's winning length buckets
- user's winning engagement patterns
- user's historical reply-rate and bookmark-rate clusters

Output:

- `fitScore`
- explanation such as "strong fit for your historical short contrarian posts"

### 8.3 Outcome Score

What it is:

- a post-publish normalized performance score
- used for training and product proof
- never treated as a raw popularity vanity metric

First version formula:

```text
weighted_engagement =
  replies * 8 +
  quotes * 6 +
  bookmarks * 5 +
  retweets * 3 +
  likes * 1

engagement_rate = weighted_engagement / max(impressions, 1)
reply_rate = replies / max(impressions, 1)
bookmark_rate = bookmarks / max(impressions, 1)

outcome_score =
  0.50 * percentile_vs_account_baseline(engagement_rate) +
  0.30 * percentile_vs_account_baseline(reply_rate) +
  0.20 * percentile_vs_account_baseline(bookmark_rate)
```

Notes:

- If owned-post metrics are available, add `profile_click_rate` and `url_click_rate`.
- Outcome must be normalized against the account's own rolling baseline, not against global raw counts.
- A 5,000-view post can be a bigger win than a 100,000-view post for a smaller account.

## 9. Why This Structure Wins

This three-score model fixes three common product failures:

1. It avoids pretending prediction equals reality.
2. It avoids teaching the product from raw vanity counts.
3. It avoids a generic model that ignores creator-specific patterns.

## 10. MVP Scope

### Phase 1: Reliable Learning Loop

Goal:

- make outcome training trustworthy

Requirements:

1. Fix publish attribution.
   - Replace "current URL at click time" as the primary source of `xTweetId`.
   - Capture the final published tweet ID or status URL after publish success.
   - Store attribution confidence.

2. Expand metric snapshots.
   - Capture snapshots at:
     - 30 minutes
     - 2 hours
     - 24 hours
     - 72 hours
   - Keep latest snapshot plus historical snapshots.

3. Add normalized outcome computation.
   - Compute account baseline windows.
   - Compute per-post `outcomeScore`.

4. Re-rank suggestion memory on actual outcomes.
   - Replace "top tweets by reachScore" with "top tweets by outcomeScore" for authenticated users.

5. Add prediction audit logging.
   - Store the prediction, feature vector, and final outcome for each tracked post.

### Phase 2: Personalized Composer Intelligence

Goal:

- shift from generic advice to account-specific advice

Requirements:

1. Add fit-based recommendations.
2. Surface "why this matches your winners."
3. Rank suggestions by estimated expected lift, not severity alone.
4. Add per-user pattern summaries:
   - winning hooks
   - winning lengths
   - winning days/times
   - winning topic clusters

### Phase 3: Viral Product Loops

Goal:

- turn user wins into product distribution

Requirements:

1. Before/after proof cards.
   - Example: "ReachOS helped improve this post from 48 to 81."

2. Prediction vs actual proof.
   - Example: "Predicted high reply potential. Actual reply rate: +62% vs your baseline."

3. Weekly creator report.
   - strongest post
   - best hook pattern
   - best posting window
   - biggest missed opportunity

4. Consent-based public win gallery.
   - only for users who opt in
   - highlights real post improvements and actual outcomes

## 11. User Stories

1. As a creator drafting on X, I want to know whether this post is likely to outperform my normal posts before I publish it.
2. As a creator, I want precise edits that improve likely reach without making me sound generic or AI-generated.
3. As a creator, I want the system to learn what works for my account, not just from broad creator averages.
4. As a creator, I want to see whether ReachOS's prediction was right after the post goes live.
5. As the ReachOS team, we want measurable proof that optimized posts outperform the user's baseline.

## 12. Functional Requirements

### 12.1 Tracking and Attribution

- The system must store a stable X post identifier for each tracked post.
- The system must distinguish:
  - tracked with confirmed post ID
  - tracked with inferred post ID
  - tracked without post ID
- The system must retry unresolved attribution for recent posts.

### 12.2 Metrics Collection

- The system must fetch available metrics for tracked posts on a recurring schedule.
- The system must support both public metrics and owned-post private metrics when OAuth is present.
- The system must preserve historical metric snapshots.

### 12.3 Scoring

- The system must compute `potentialScore` pre-post.
- The system must compute `fitScore` when enough account history exists.
- The system must compute `outcomeScore` post-publish.
- The system must log the features used in scoring for later analysis.

### 12.4 Suggestions

- Suggestions must be prioritized by estimated lift.
- Suggestions must preserve creator voice where possible.
- Suggestions must avoid engagement-bait or spam-policy-risk patterns.

### 12.5 Dashboard and Popup

- Popup should show the latest outcome status:
  - tracking
  - metrics captured
  - outperforming baseline
  - underperforming baseline
- Dashboard should show:
  - predicted vs actual
  - top winning patterns
  - account baseline trends
  - confidence of learning quality

## 13. Data Model Changes

Minimal-first approach:

### Extend existing tables

`TrackedTweet`

- add `predictionVersion`
- add `potentialScore`
- add `fitScore`
- add `outcomeScore`
- add `attributionStatus`
- add `attributionConfidence`
- add `featureSnapshot` as JSON

`TweetMetric`

- keep current snapshot rows
- add `snapshotType` with values like `m30`, `h2`, `h24`, `h72`, `manual`
- add `profileClicks` if using private metrics
- add `urlClicks` if using private metrics

### Add new tables

`AccountBaseline`

- `userId`
- `windowStart`
- `windowEnd`
- `medianEngagementRate`
- `medianReplyRate`
- `medianBookmarkRate`
- `medianProfileClickRate`
- `sampleSize`

`ModelWeightSnapshot`

- `scope` (`global`, `segment`, `user`)
- `scopeId`
- `version`
- `weights`
- `createdAt`

`SuggestionOutcome`

- `trackedTweetId`
- `suggestionRuleId`
- `wasApplied`
- `estimatedLift`
- `actualLift`

## 14. Analytics and Success Metrics

Primary north-star metric:

- median lift in `outcomeScore` for optimized posts versus each user's own trailing baseline

Secondary metrics:

- attribution success rate
- percentage of tracked posts with confirmed `xTweetId`
- percentage of posts with 24-hour and 72-hour metric snapshots
- prediction calibration error
- suggestion acceptance rate
- retained weekly active creators
- share rate on proof cards and weekly reports

## 15. Rollout Plan

### Milestone 1

- reliable post ID capture
- snapshot collection at multiple windows
- outcome scoring
- dashboard update for predicted vs actual

### Milestone 2

- fit score
- personalized suggestion ranking
- account pattern summaries

### Milestone 3

- proof cards
- weekly creator reports
- consent-based win gallery

## 16. Risks

1. Attribution may remain fragile if X DOM flows change.
2. Low-volume users may not have enough history for strong personalization.
3. Aggressive optimization can drift toward sameness if the product overfits obvious hook patterns.
4. If the product markets "virality" too hard, trust will fall when outcomes vary.

## 17. Open Questions

1. Should ReachOS remain X-only through Phase 2, or should the data model already reserve room for LinkedIn and Threads?
2. Should anonymous users get any learning loop, or should full personalization require OAuth?
3. Should the composer show one final score, or separate `Potential` and `Fit` visibly?
4. Do we want suggestions to optimize for replies, bookmarks, or link clicks depending on creator goal?
5. How much historical data is required before enabling personalized weights?

## 18. Recommended Immediate Next Steps

1. Fix post-to-status attribution.
2. Add multi-window metric snapshots.
3. Compute `outcomeScore` against account baseline.
4. Change suggestion memory to actual winners.
5. Update popup and dashboard to show predicted vs actual.

## 19. Sources

Official X documentation:

- X metrics documentation: https://docs.x.com/x-api/fundamentals/metrics
- X Help on bookmark counts: https://help.x.com/en/using-x/bookmark-counts
- X Developer Platform overview: https://docs.x.com/overview
- X open-source recommendation repository: https://github.com/twitter/the-algorithm

Market and industry references:

- Buffer, "The Best Time to Post on Twitter/X in 2026: 1 Million Posts Analyzed": https://buffer.com/resources/best-time-to-post-on-twitter-x/
- Tweet Hunter homepage: https://tweethunter.io/
- Hypefury homepage: https://hypefury.com/homepage/
- Typefully AI Quick Edits: https://support.typefully.com/en/articles/8717738-ai-quick-edits
- Typefully Auto-plugs: https://support.typefully.com/en/articles/9882161-auto-plugs
- Typefully API overview: https://support.typefully.com/en/articles/8718287-typefully-api

Internal product references:

- `README.md`
- `apps/extension/src/content/post-tracker.ts`
- `apps/api/app/api/tweets/track/route.ts`
- `apps/api/app/api/cron/fetch-metrics/route.ts`
- `apps/api/app/api/tweets/suggestions/route.ts`
- `apps/api/prisma/schema.prisma`
- `apps/extension/src/popup/Popup.tsx`
- `apps/api/app/dashboard/page.tsx`
