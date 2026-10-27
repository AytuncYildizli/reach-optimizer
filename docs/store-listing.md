# Chrome Web Store — Listing Copy

Source of truth for the **detailed description** field in the Chrome Web Store dev console listing for ReachOS. Keep in sync with reality whenever a release ships.

CWS limits: 132 char manifest description (set in `apps/extension/manifest.json`); detailed listing description up to ~16,000 chars (set in dashboard, pasted from this file).

---

## Detailed description (paste into CWS dashboard)

_Saved in the dashboard with the v4.2.1 package on 2026-10-28._

ReachOS - Know your reach before you post.

Open-source Chrome extension that scores your tweets in real time against 25 signal predictors aligned to xAI's open-sourced X algorithm, predicts your reach, and shows you exactly how to improve it. BYOK (Bring Your Own Keys), fully self-hostable.

--- NEW IN v4.2: TIME SPENT & READ-THROUGH ---

X's ranking now rewards posts people actually stop on and read to the end. Its published weights for dwell time and post-click time spent went up, while raw clicks and video views went down. ReachOS v4.2 follows that shift:

Read-Through Scoring: Rewards posts that land a takeaway on the final line ("The lesson:", "Bottom line", "Result:"), so readers who reach the end get a payoff.

Dwell Signals +60%: The Dwell bucket grows from 15 to 24 points. Concrete numbers, scannable lists and a second-paragraph payoff all add time spent.

Hook Without Payoff Warning: Flags curiosity hooks ("nobody tells you...", "you won't believe...") that your post never pays off. Readers bail before the end.

Better Links: A link scores well when the value behind it is specific (a number, a case study), not when it's bait. X now counts the seconds spent after the click, not the click itself.

Rebalanced to X's published weights: smaller video and click credit, a stronger "not interested" penalty.

--- CORE FEATURES ---

Score Overlay: A live 0-100 Reach Score appears on X.com as you type. Bucket bars (Engagement, Curiosity, Dwell, Risk) update in real time.

Reach Forecast: Predicts how many impressions your tweet will get. Shows reply probability, bookmark chance, and viral breakout percentage.

What-If Scenarios: See what happens if you add an image (+35%), post at peak time (+25%), align with a trending topic (+15%), add a video (+15%), or add a curiosity gap before your link (+18%). Click to apply.

X-Ray Mode: Scores every tweet on your timeline as you scroll. Color-coded pills (red to purple) show reach potential at a glance. See what works and what doesn't.

AI Auto-Optimize: One click runs 5 rounds of iterative AI rewriting to find the highest-reach version of your tweet. Powered by Claude (your own key, or sign in to use the hosted server).

AI Slop Detection: Flags AI-sounding language patterns (heuristic + LLM verification). Robotic content gets scrolled past.

Ad Disclosure Detection: Flags undisclosed promo language and referral links before you post. Disclose with #ad or (sponsored) and the penalty disappears.

Daily Post-Frequency Decay: Warns when each additional post that day earns less distribution than the last.

Reply Coach (signed in): Notifies you about unanswered replies on your tweets. Replies are one of the heaviest positive signals in X's ranking.

Self-Reply Strategy: Generate a conversation-starting self-reply.

Trending Alignment: Detects when your tweet matches currently trending topics.

Posting Time Optimizer: Shows optimal posting windows based on UTC peak engagement data.

Self-Learning (signed in): Tracks your predictions vs actual performance, calibrates the forecast, and learns which signals lift your tweets. Your Reach Score then applies those learned weights.

BYOK (Bring Your Own Keys): Deploy your own API server or use the hosted instance. Configure in Settings. Fully open-source on GitHub.

--- HOW IT WORKS ---

1. Install ReachOS and open X.com
2. Start composing a tweet - the score appears instantly
3. Check the Reach Forecast to see predicted impressions
4. Use What-If Scenarios to optimize before posting
5. Browse your timeline with X-Ray Mode to learn what works

--- BACKED BY THE SOURCE ---

25 signal predictors, 71 tests. Every signal maps to a prediction head in xAI's open-sourced X algorithm (github.com/xai-org/x-algorithm), and point budgets follow the default weights X publishes in that repo.

From X's published weights (October 2026): a reply is worth about 7.5x a like, a quote about 7.5x, a DM share about 7.5x. Copy-link shares carry the highest per-action weight. "Not interested", mute and block are heavy penalties, and a report is the heaviest at -234. Links are not penalized: clicks and time spent after the click are positive signals.

Open source: github.com/AytuncYildizli/reach-optimizer

---

## Short description (manifest.json, ≤132 chars)

Real-time Reach Score for tweets. Aligned to xai-org/x-algorithm. 25 signal predictors, time-spent scoring, BYOK AI.

(Currently 117 chars — leaves 15 chars of headroom for future tweaks.)
