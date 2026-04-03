# ReachOS Privacy Policy

**Last updated: April 3, 2026**

## What ReachOS Does

ReachOS is an open-source browser extension that analyzes tweet text you type on X.com and provides a Reach Score with optimization suggestions. It works primarily on your device. Server-side AI features are optional and use your own configured server (BYOK).

## What We Collect

### Data processed locally (never leaves your device)
- Tweet text you type in the X.com composer (analyzed in real time, not stored)
- Your browser language preference (for locale detection)
- Extension settings (API server URL, stored in chrome.storage)

### Data sent to your configured server (only when AI features are used)
- Tweet text content (sent to your API server for AI-enhanced scoring)
- If you sign in: X.com profile info (username, display name, profile image) for account health features

### Data we do NOT collect
- We do not operate a centralized data collection service
- Your tweets after they are posted
- Your browsing history outside of X.com
- Your direct messages, followers list, or any other X.com data
- Cookies or tracking identifiers for advertising

## Self-Hosted Architecture

ReachOS is fully open source (MIT license). You can:
- Use it with local scoring only (no server needed, 36 rules run on your device)
- Deploy your own API server and point the extension to it
- Inspect all source code at github.com/AytuncYildizli/reach-optimizer

## Data Sharing

- We do NOT sell your data
- We do NOT share your data with advertisers
- If you use AI features, tweet text is sent to your configured API server, which may use Anthropic Claude API for analysis
- No centralized analytics or telemetry

## Your Rights

- You can use ReachOS without any account or server (local scoring is fully functional)
- You can uninstall the extension at any time to stop all data processing
- All data is under your control — self-host for full ownership

## Security

- All data transmission uses HTTPS encryption
- Source code is publicly auditable
- No hardcoded API keys or tracking in the extension

## Contact

For privacy questions, open an issue on our GitHub repository:
github.com/AytuncYildizli/reach-optimizer
