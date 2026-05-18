# ReachOS Launch Materials

## Product Hunt

**Tagline:** Open-source Grammarly for tweet reach — know your numbers before you post.

**Description:**
ReachOS is a Chrome extension that scores your tweets in real-time against 25 signal predictors — the 22 signals xAI published in xai-org/x-algorithm (May 2026) plus 3 ReachOS-original signals for ad-disclosure, post-frequency, and microniche consistency. It predicts how many people will see your tweet and shows exactly how to improve it with interactive What-If Scenarios.

Key features:
- Real-time Reach Score (0-100) as you type
- Reach Forecast: predicted impressions with confidence interval
- What-If Scenarios: "Add a curiosity gap before the link -> +18% reach, Add an image -> +35%"
- X-Ray Mode: scores every tweet on your timeline
- AI Slop Detection: flags AI-sounding patterns
- Fully open source, BYOK, self-hostable

No account needed. 25 signal predictors run locally in your browser. AI features are optional and use your own API key.

**Maker's First Comment:**
Hey PH! I built ReachOS because I was tired of guessing whether a tweet would perform before posting it.

The scoring is based on the 22 signals xAI published in `xai-org/x-algorithm` on May 15, 2026 — `favorite`, `reply`, `retweet`, `quote`, the three `share_*` variants, `click`, `profile_click`, `follow_author`, `dwell`, and 11 more — plus 3 ReachOS-original predictors (`ad_disclosure`, `post_frequency`, `topic_consistency`) reflecting observed 2026 algorithm shifts. ReachOS predicts the probability of each one from a single-file rule predictor.

The feature I'm most proud of is What-If Scenarios — it shows you in real-time what happens if you add a curiosity gap before a link, attach an image, or post at peak time. It turns optimization into a game.

**Heads-up (v4.0 change):** Outbound links are no longer penalized. xAI's new published code doesn't penalize them either, so we inverted the v3 link rule into a positive `click` signal. Older tutorials saying "always remove links" no longer apply.

Everything runs client-side. No data leaves your browser unless you opt into AI features. And it's fully open source (MIT) so you can inspect every line.

Would love your feedback on the scoring model — we're actively adding new rules based on algorithm research.

**Topics:** Productivity, Chrome Extensions, Twitter, Open Source, AI

---

## Reddit Posts

### r/SideProject

**Title:** I built an open-source Chrome extension that predicts your tweet's reach before you post

**Body:**
Hey r/SideProject! I just launched ReachOS — it's basically "Grammarly for reach."

It scores your tweets against 25 signal predictors from X's actual open-sourced algorithm, then predicts how many impressions you'll get. The coolest part is What-If Scenarios — it shows stuff like "remove this link and your reach goes up 52%."

Some stats:
- 36 scoring rules (hook quality, structure, engagement triggers, penalties)
- 132 passing tests
- Chrome Web Store: live
- Fully open source (MIT): github.com/AytuncYildizli/reach-optimizer
- No account needed, runs locally

Built with: TypeScript, React, Next.js, Turborepo, Claude API (optional)

Would love feedback, especially on scoring accuracy. What would you add to the rules?

### r/webdev

**Title:** Show r/webdev: Built a Chrome extension with 36 real-time scoring rules using Shadow DOM + MutationObserver

**Body:**
Just launched an open-source Chrome extension that overlays a scoring panel on X.com. Some interesting technical challenges:

- Shadow DOM for style isolation (X.com's CSS is aggressive)
- MutationObserver for real-time composer text detection with 300ms debounce
- Client-side rules engine (25 signal predictors, category-capped scoring, configurable weights)
- Reach Forecast engine: prediction model with what-if scenario computation
- X-Ray Mode: scores every tweet on the timeline using WeakSet deduplication + text cache for deterministic results

Stack: TypeScript monorepo (Turborepo), React 19, Vite + CRXJS for extension build, Next.js 15 API, Prisma + Neon PostgreSQL, Claude API for AI features.

All open source: github.com/AytuncYildizli/reach-optimizer

Happy to discuss the architecture — the Shadow DOM + X.com DOM detection was the hardest part.

### r/socialmedia

**Title:** Free tool that scores your tweets against X's actual algorithm signals before you post

**Body:**
I made a free Chrome extension called ReachOS that gives you a real-time score (0-100) for your tweets based on what X's algorithm actually rewards.

Some things it catches:
- External links kill your reach (-30 to -50%). Move them to the first reply.
- 3+ hashtags = ~40% engagement drop
- Tweets without questions or CTAs get buried
- AI-sounding language gets penalized by the algorithm
- Images get a confirmed 2x algorithmic boost
- Replies to your own tweet are worth 150x a like

It also predicts your reach and shows "what if" scenarios — like what happens if you add an image or remove a link.

Free on Chrome Web Store, open source on GitHub. No account needed.

### r/InternetIsBeautiful

**Title:** ReachOS: a Chrome extension that predicts how many people will see your tweet before you post it

**Body:**
It overlays a score panel on X.com that updates as you type. Shows a 0-100 score, predicted impressions, and interactive "what-if" scenarios (remove a link -> +52% reach, add image -> +38%).

Also has an "X-Ray Mode" that scores every tweet on your timeline with color-coded pills — so you can see at a glance what performs and what doesn't.

Free, open source, no account needed: github.com/AytuncYildizli/reach-optimizer

---

## IndieHackers

**Title:** I launched ReachOS — open-source "Grammarly for reach" on X/Twitter

**Body:**
Hey IH! Just shipped ReachOS after a few weeks of building. It's a Chrome extension that scores your tweets against X's algorithm signals in real-time.

The problem: I kept writing tweets that got zero engagement, deleting them, trying again. I wanted a way to know before posting.

The solution: 36 scoring rules derived from X's open-sourced algorithm (twitter/the-algorithm). The extension runs entirely in your browser — no account, no data sent anywhere.

My favorite feature is What-If Scenarios. It shows you in real time:
- Remove a link -> +52% reach
- Add an image -> +38%
- Post at peak time -> +25%
- All combined -> +77%

It's BYOK (bring your own keys) and fully self-hostable. MIT licensed.

Metrics so far: just launched today, first Chrome Web Store users coming in.

Would love feedback from the IH community on the scoring model and what rules to add next.

GitHub: github.com/AytuncYildizli/reach-optimizer
Chrome Web Store: [link]

---

## Newsletter Submissions

### Ben's Bites / TLDR
**Subject:** ReachOS — open-source Chrome extension that predicts tweet reach using X's algorithm signals

**One-liner:** Free Chrome extension that scores your tweets against 25 signal predictors from X's open-sourced algorithm, predicts impressions, and shows what-if optimization scenarios. Fully open source, BYOK.

**Link:** github.com/AytuncYildizli/reach-optimizer

### AI Tool Directories (ToolFinder, Futurepedia, TAAIFT)
**Name:** ReachOS
**Category:** Social Media / Content Optimization
**Pricing:** Free / Open Source
**Description:** Chrome extension that scores tweets in real-time against 36 algorithm-research-backed rules. Predicts reach with what-if scenarios. AI slop detection and auto-optimize powered by Claude (BYOK). Fully open source and self-hostable.
**URL:** github.com/AytuncYildizli/reach-optimizer
