# ReachOS status

ReachOS scores a draft and, only when a model trained on that account beats a naive baseline, shows an impression range. It does not rewrite the draft and it does not post to X. Draftroom should call `score(draftText, meta)`. The checklist (25 signals) stays the output whenever the range is withheld.

The posts file is not in this repo. A local `reach train` on the owner's imported history is recorded below. The synthetic fixture is separate.

## What works

- Local checklist scoring as you type (25 signals, extension overlay). Weights are still the hand-set checklist, not a fitted reach model.
- Per-account ridge on `log(impressions / rolling median)`, time-ordered holdout, and the gate from PR #23. The extension shows an 80% interval only when that gate passes. The old fixed multipliers (image ×1.35 and the rest) are not shown.
- Backtest CLI (`pnpm --filter @reach/rules-engine backtest`) for one account, a pooled fit, early-engagement snapshots, and the ablation menu.
- File import of an X archive (`tweets.js`) joined to a metrics CSV or JSON. Stored metrics: impressions, likes, reposts, replies, quotes, bookmarks.
- `trainAccountModel` / `score` uses the `backtest --study` menu. The winner is the largest raw-MAE gain on a training-only slice. That one config is gated on the newer posts. Thresholds stay 40 / 20 / 5% raw MAE, with Spearman positive and above the rolling median. Weights are stored either way. A failed gate still returns `withheld` and no range. Quote permalinks and media t.co links are not counted as external links.
- CLI: `reach import`, `reach train`, `reach score --json`. Training reads local files only.

## What is stubbed

- The fitted @aytunc model is not committed. `score` reads a local `model.json`. A failed gate writes `status: "uncalibrated"` and returns `withheld` with no range. The weights are still in the file.
- The extension still reads the PR #23 ratio-ridge snapshot (calibrate cron on tracked tweets). It does not call `score`. Draftroom should.
- Bulk history is not pulled from the X API. The existing cron only refreshes metrics for tweets already tracked in the app database, and only when `TWITTER_API_IO_KEY` is set in the environment. This trainer does not call that cron and does not open the database.
- Early-engagement snapshots and the pooled multi-account fit are backtests. They are not what `score` ships.
- Gradient boosting is one row in the train menu. It ships only when that row wins the training slice and then passes the holdout. On this account it did not win.
- `score` predicts impressions. It does not emit a separate engagement-rate range. Bookmarks, likes, replies, and reposts are stored at import and are not used as features, because they are outcomes rather than something known at compose time.

## What is heuristic

- Checklist points (reply +12, report −15, and the rest) are not fit to this account's impressions.
- `legacyHeuristicImpressions` still replays the old multiplier chain inside backtest reports so the gate can be compared with it. It is not a forecast.
- Account-health still exposes a follower-based reach multiplier. `score` ignores it.
- Store listing copy still says the product predicts impressions. The forecast withholds the number unless the gate passes.
- A suggestion is a counterfactual from the fitted weights (add an image, drop a link, try another hour). It is omitted when the gate fails. The 80% band uses residual quantiles from the training slice. The holdout is not used to choose the config or the band. Holdout coverage is the confidence input, so a nominal 80% band can come back lower.

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
  "range": { "low": 4605, "high": 8236 },
  "confidence": 0.827,
  "topFactors": [{ "name": "image", "contribution": 0.671, "direction": "higher" }],
  "suggestions": [{ "id": "later-hour", "text": "Posting around a later hour is associated with a higher range on your past posts.", "range": null }],
  "reason": "Held-out Spearman 0.906 vs baseline -0.046; MAE 74.8% lower than the rolling median."
}
```

`meta` is `{ model, hasMedia, mediaType, isQuote, isThread, now }`. `model` is the JSON from `train`. When the gate fails, `status` is `"withheld"`, `range` is null, `confidence` is 0, and `suggestions` is empty. The example object above is the synthetic fixture, not @aytunc.

## @aytunc holdout

Local run only. The 797-post import is not committed. Timezone Europe/Istanbul, `asOf` 2026-10-28T11:00:38.036Z, minimum age 3 days. Originals 326, quotes 291, self-replies 180. The chosen config keeps self-replies: eligible 777, modeled 769.

The training slice picked `self_reply_extended_shrink` (select-slice raw-MAE gain +5.8%, the largest of the eight). Shipped fit: ridge, relative target, lambda 300, shrink k 0.75. Holdout **passes**.

| | Train / test | Spearman (model vs median) | MAE | log-MAE | 80% coverage | Gate |
|---|---:|---:|---:|---:|---:|---|
| @aytunc | 538 / 231 | 0.664 vs 0.332 | 5113.4 vs 5471.0 (6.5% lower) | 0.677 vs 0.835 | 0.736 | pass |

Largest standardized weights: `log_baseline_impressions` −0.188, `log_ewma_gap` +0.170, `log1p_hours_since_prev` +0.146, `is_self_reply` −0.122, `is_quote` +0.099, `has_link` +0.061, `paragraph_breaks` +0.056, `any_number_count` +0.055.

## Synthetic fixture

180 daily posts, timezone UTC, `asOf` 2026-06-01, minimum age 0. Signal fixture: stable base, impressions move with image (×3), an 18:00 UTC hour (×2), and one hashtag (×1.7). Flat fixture: every impression is 1000, so the median cannot be beaten. Gate unchanged. Tests: 105 rules-engine, 13 ai-checks.

| Fixture | Config | Train / test | Spearman (model vs median) | MAE (model vs median) | log-MAE | 80% coverage | Gate |
|---|---|---:|---:|---:|---:|---:|---|
| Signal | relative_ridge | 120 / 52 | 0.906 vs −0.046 | 421.1 vs 1672.8 (74.8% lower) | 0.168 vs 0.718 | 0.827 | pass |
| Flat | relative_ridge | 120 / 52 | undefined | 0 vs 0 | 0 vs 0 | not shown | fail, withheld |

An image draft at 2026-06-02 09:00 UTC on the signal model scored 4605–8236 (confidence 0.827). The same text with no image scored 1203–2151. Those ranges are the planted pattern.
