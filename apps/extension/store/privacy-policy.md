# ReachOS Privacy Policy

**Last updated: October 27, 2026**

## What ReachOS Does

ReachOS is an open-source browser extension that analyzes tweet text you type on X.com and provides a Reach Score with optimization suggestions. Scoring runs on your device. Signing in to a ReachOS server and adding your own Anthropic key are both optional.

## What We Collect

### Without signing in (default)
- Tweet text you type in the X.com composer is scored on your device and is never sent to a ReachOS server
- Your browser language preference (for locale detection) and extension settings stay in chrome.storage on your device
- If you add your own Anthropic API key (BYOK), the text you run AI features on is sent directly from your browser to Anthropic (api.anthropic.com), not to a ReachOS server

### If you sign in to a ReachOS server
Signing in (with X) connects the extension to a ReachOS API server: the hosted instance at reach-optimizer.vercel.app, or your own server if you configure one. The server then receives and stores:
- Your X profile info (user ID, username, display name, profile image), for your account and account-health features
- Draft text and its score while you compose, for server AI checks (skipped when you have your own Anthropic key set)
- The text, score and URL of tweets you post, plus their public engagement metrics (views, likes, replies, reposts), to show your tweet history and to learn which signals work for your account

This data is tied to your account and only returned to you. Signing out stops all of it.

### Data we do NOT collect
- Anything at all from users who are not signed in
- Your browsing history outside of X.com
- Your direct messages, followers list, or any other X.com data
- Cookies or tracking identifiers for advertising

## Self-Hosted Architecture

ReachOS is fully open source (MIT license). You can:
- Use it with local scoring only (no server needed, 25 signal predictors run on your device)
- Deploy your own API server and point the extension to it
- Inspect all source code at github.com/AytuncYildizli/reach-optimizer

## Data Sharing

- We do NOT sell your data
- We do NOT share your data with advertisers
- If you are signed in and use server AI features, tweet text is sent to that API server, which uses the Anthropic Claude API for analysis
- No centralized analytics or telemetry

## Your Rights

- You can use ReachOS without any account or server (local scoring is fully functional)
- To delete the data stored for your account on the hosted instance, open an issue on GitHub
- You can uninstall the extension at any time to stop all data processing
- All data is under your control — self-host for full ownership

## Security

- All data transmission uses HTTPS encryption
- Source code is publicly auditable
- No hardcoded API keys or tracking in the extension

## Contact

For privacy questions, open an issue on our GitHub repository:
github.com/AytuncYildizli/reach-optimizer
