# ReachOS — Content Reach Optimizer

> Grammarly for Reach. A Chrome extension that optimizes tweet content against algorithm signals.

## What It Does

- Real-time **Reach Score (0-100)** as you type tweets on X.com
- **15 client-side rules** analyze hooks, structure, engagement potential, penalties
- **AI Slop Detector** identifies AI-generated writing patterns (30 heuristics + Claude LLM)
- **Hook quality assessment** and alternative suggestions via Claude
- Score overlay with breakdown bars, suggestions, and minimize mode

## Tech Stack

- **Extension:** React 19, Vite, CRXJS (Manifest V3), Shadow DOM
- **API:** Next.js 15, Vercel, Prisma 6, Neon PostgreSQL
- **AI:** Anthropic Claude (haiku for speed)
- **Monorepo:** Turborepo, pnpm

## Project Structure

```
reach-optimizer/
├── apps/
│   ├── extension/     # Chrome extension (React + Vite + CRXJS)
│   └── api/           # Next.js API (Vercel)
├── packages/
│   ├── rules-engine/  # 15 scoring rules + ScoreEngine
│   ├── ai-checks/     # AI Slop Detector + Claude integration
│   └── shared-types/  # TypeScript types
```

## Development

```bash
pnpm install
pnpm test          # Run all tests (64 passing)
pnpm dev           # Start dev servers

# Extension
pnpm --filter @reach/extension build
# Load dist/ as unpacked extension in chrome://extensions

# API
pnpm --filter @reach/api dev  # localhost:3100
```

## Deploy

```bash
pnpm deploy        # Deploy API to Vercel production
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| /api/health | GET | No | Health check |
| /api/auth/login | GET | No | Initiate X OAuth |
| /api/auth/callback | POST | No | Exchange OAuth code for JWT |
| /api/analyze | POST | JWT | Full analysis (rules + AI) |
| /api/suggest | POST | JWT | Hook/CTA suggestions |
