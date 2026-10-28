# ReachOS status

ReachOS scores a draft and, only when a model trained on that account beats a naive baseline, shows an impression range. It does not rewrite the draft and it does not post to X. Draftroom should call `score(draftText, meta)`. The checklist (25 signals) stays the output whenever the range is withheld.

No model of @aytunc is in this repo. His posts are not here. The numbers below are from a synthetic fixture with a planted pattern.

## What works

- Local checklist scoring as you type (25 signals, extension overlay). Weights are still the hand-set checklist, not a fitted reach model.
- Per-account ridge on `log(impressions / rolling median)`, time-ordered holdout, and the gate from PR #23. The extension shows an 80% interval only when that gate passes. The old fixed multipliers (image ×1.35 and the rest) are not shown.
- Backtest CLI (`pnpm --filter @reach/rules-engine backtest`) for one account, a pooled fit, early-engagement snapshots, and the ablation menu.
- File import of an X archive (`tweets.js`) joined to a metrics CSV or JSON. Stored metrics: impressions, likes, reposts, replies, quotes, bookmarks.
- `trainAccountModel` / `score`: ridge on `log(impressions)` using text, format, length, media, time of day, topic overlap, and hashtag count. Same gate: at least 40 older and 20 newer modeled posts, Spearman positive and above the rolling median, raw MAE at least 5% lower. The rolling median is the baseline, not a feature. Constant columns are dropped.
- CLI: `reach import`, `reach train`, `reach score --json`. Training reads local files only.

## What is stubbed

- There is no fitted model for @aytunc until he provides the files below and `train` passes the gate. A failed gate writes `status: "uncalibrated"` and `score` returns `withheld` with no range.
- The extension still reads the PR #23 ratio-ridge snapshot (calibrate cron on tracked tweets). It does not call `score`. Draftroom should.
- Bulk history is not pulled from the X API. The existing cron only refreshes metrics for tweets already tracked in the app database, and only when `TWITTER_API_IO_KEY` is set in the environment. This trainer does not call that cron and does not open the database.
- Early-engagement snapshots and the pooled multi-account fit are backtests. They are not what `score` ships.
- Gradient boosting exists only inside `backtest --study`. It is not the scorer.
- `score` predicts impressions. It does not emit a separate engagement-rate range. Bookmarks, likes, replies, and reposts are stored at import and are not used as features, because they are outcomes rather than something known at compose time.

## What is heuristic

- Checklist points (reply +12, report −15, and the rest) are not fit to this account's impressions.
- `legacyHeuristicImpressions` still replays the old multiplier chain inside backtest reports so the gate can be compared with it. It is not a forecast.
- Account-health still exposes a follower-based reach multiplier. `score` ignores it.
- Store listing copy still says the product predicts impressions. The forecast withholds the number unless the gate passes.
- A suggestion is a counterfactual from the fitted weights (add an image, drop a link, try another hour). It is not a causal guarantee and it is omitted when the gate fails. The 80% band uses residual quantiles from an inner slice of the training period; coefficients are refit on train and test only after the gate passes. Holdout coverage is the confidence input, so a nominal 80% band can come back with lower confidence.

## What the owner provides

Two local files. No token. Do not commit them.

1. X archive `tweets.js` (`window.YTD.tweets.part0 = [...]`), from the account download. Repeat `--archive` for extra parts. The archive has text, time, media, replies, and quotes. It does not have impressions.
2. Metrics CSV or JSON, one row per post, ids as text (a spreadsheet will mangle long ids).

CSV headers are flexible. This is enough:

```csv
tweet_id,impressions,likes,reposts,replies,bookmarks,quotes
```

`views`, `retweets`, `favorite_count`, `bookmark_count`, and a status permalink also map. An analytics export with `Tweet id`, `Tweet text`, `time`, and `impressions` can be used without the archive, but then media, quote, and self-thread flags are missing. Bookmarks are optional and default to 0.

JSON may be an array of `{ "id", "impressions", "likes", "reposts", "replies", "bookmarks" }` or posts with `public_metrics`.

```bash
pnpm --filter @reach/rules-engine reach -- import --archive tweets.js --metrics metrics.csv --account aytunc --out posts.json
pnpm --filter @reach/rules-engine reach -- train --posts posts.json --timezone Europe/Istanbul --account aytunc --out model.json
pnpm --filter @reach/rules-engine reach -- score --model model.json --text "draft" --media image --json
```

Replies to other people and retweets are dropped. A self-thread is kept when `in_reply_to_screen_name` matches `--account`. Posts younger than 3 days are dropped so the impression count can settle. The first 8 kept posts only warm the rolling median. Plan on well over 70 original or quote posts with impressions. More is better, and a pass is not guaranteed: if the recent median already explains reach, the range stays hidden.

`score(draftText, meta)` returns:

```json
{
  "status": "scored",
  "range": { "low": 2932, "high": 3072 },
  "confidence": 0.712,
  "topFactors": [{ "name": "image", "contribution": 0.726, "direction": "higher" }],
  "suggestions": [{ "id": "add-hashtag", "text": "One hashtag is associated with a higher range on your past posts. This does not choose the tag.", "range": { "low": 4987, "high": 5225 } }],
  "reason": "Held-out Spearman 0.940 vs baseline -0.046; MAE 97.4% lower than the rolling median."
}
```

`meta` is `{ model, hasMedia, mediaType, isQuote, isThread, now }`. `model` is the JSON from `train`. When the gate fails, `status` is `"withheld"`, `range` is null, `confidence` is 0, and `suggestions` is empty. The example object above is the synthetic fixture, not @aytunc.

## Synthetic fixture

180 daily posts, account `aytunc`, timezone UTC, `asOf` 2026-06-01, minimum age 0. Signal fixture: stable base, impressions move with image (×3), an 18:00 UTC hour (×2), and one hashtag (×1.7), plus tiny noise. Drift fixture: impressions rise over the year and the same features are coin flips that do not affect reach. Gate unchanged: 40 / 20 / 5% raw MAE. Tests: 104 rules-engine, 13 ai-checks.

| Fixture | Train / test | Spearman (model vs median) | MAE (model vs median) | log-MAE | 80% coverage | Gate |
|---|---:|---:|---:|---:|---:|---|
| Signal | 120 / 52 | 0.940 vs −0.046 | 43.6 vs 1672.8 (97.4% lower) | 0.016 vs 0.718 | 0.712 | pass |
| Drift | 120 / 52 | 0.095 vs 0.327 | 1055.5 vs 201.3 (worse) | 0.604 vs 0.089 | not shown | fail, withheld |

Eligible 180, modeled 172 (8 posts warm the median). Signal features that varied: `has_image`, `hashtag_count`, `hour_sin`, `hour_cos`, `dow_sin`, `dow_cos`. One image draft at 2026-06-02 09:00 UTC scored 2932–3072 (confidence 0.712). The same text with no image scored 687–720. Top factors: image +0.726, time of day −0.229, hashtags −0.105. Suggestions on that image draft: add a hashtag (4987–5225) and a later hour (8068–8453). Those ranges are the planted pattern, not a claim about the live account.
