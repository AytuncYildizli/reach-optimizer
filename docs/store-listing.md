# Chrome Web Store — Listing Copy

Source of truth for the **detailed description** field in the Chrome Web Store dev console listing for ReachOS. Keep in sync with reality whenever a release ships.

CWS limits: 132 char manifest description (set in `apps/extension/manifest.json`); detailed listing description up to ~16,000 chars (set in dashboard, pasted from this file).

---

## Detailed description (paste into CWS dashboard)

ReachOS — Know your reach before you post.

Open-source Chrome extension that scores your tweets in real time against 25 signal predictors from xAI's open-sourced X algorithm, predicts your reach, and shows you exactly how to improve it. BYOK (Bring Your Own Keys), fully self-hostable.

--- NEW IN v4.1 ---

Ad Disclosure Detection: Flags undisclosed promo language and referral links before you post. X deboosts undisclosed ads — disclose with #ad or (sponsored) and the penalty disappears.

Video-First Scoring: Video posts now get a baseline boost matching X's stated 2024+ distribution priority. Quote-tweeting a video post also gets a boost.

Daily Post-Frequency Decay: Detects when each additional post earns less distribution than the last (3rd–4th post penalised, 5th+ heavier). Stop spamming the timeline against your own reach.

--- CORE FEATURES ---

Score Overlay: A live 0–100 Reach Score appears on X.com as you type. Bucket bars (Engagement, Curiosity, Dwell, Risk) update in real time.

Reach Forecast: Predicts how many impressions your tweet will get. Shows reply probability, bookmark chance, and viral breakout percentage.

What-If Scenarios: See exactly what happens if you remove a link (+52%), add an image (+38%), post at peak time (+25%), or align with a trending topic (+15%). Click to apply.

X-Ray Mode: Scores every tweet on your timeline as you scroll. Color-coded pills (red to purple) show reach potential at a glance. See what works and what doesn't.

AI Auto-Optimize: One click runs 5 rounds of iterative AI rewriting to find the highest-reach version of your tweet. Powered by Claude.

AI Slop Detection: Flags AI-sounding language patterns (heuristic + LLM verification). The algorithm penalizes robotic content.

Reply Coach: Notifies you about unanswered replies on your tweets. Replying to engaged followers gives a heavy algorithm distribution boost.

Self-Reply Strategy: Generate a conversation-starting self-reply. Author replies carry significant distribution weight.

Trending Alignment: Detects when your tweet matches currently trending topics for bonus reach points.

Posting Time Optimizer: Shows optimal posting windows based on UTC peak engagement data.

Self-Learning: The system tracks your predictions vs actual performance and auto-calibrates over time. The longer you use it, the more accurate it gets.

BYOK (Bring Your Own Keys): Deploy your own API server or use the hosted instance. Configure in Settings. Fully open-source on GitHub.

--- HOW IT WORKS ---

1. Install ReachOS and open X.com
2. Start composing a tweet — score appears instantly
3. Check the Reach Forecast to see predicted impressions
4. Use What-If Scenarios to optimize before posting
5. Browse your timeline with X-Ray Mode to learn what works

--- BACKED BY RESEARCH ---

25 signal predictors, 65+ tests. Every signal is derived from xAI's open-sourced X algorithm (xai-org/x-algorithm, May 2026). Not guesswork.

Algorithm weights mirrored from the source: Reply = 27x a like. Bookmark = 20x. Media = 2x Earlybird boost. External links = -30 to -50% reach. 3+ hashtags = -40% engagement.

Key 2026 algorithm findings reflected in v4.1: undisclosed ads get deboosted, video-first distribution is real, daily post-frequency decays distribution, microniche topical consistency rewarded.

Open source: github.com/AytuncYildizli/reach-optimizer

---

## Short description (manifest.json, ≤132 chars)

Real-time Reach Score for tweets. Aligned to xai-org/x-algorithm. 25 signal predictors, video-first scoring, BYOK AI.

(Currently 117 chars — leaves 15 chars of headroom for future tweaks.)
