# Contributing to ReachOS

Thanks for your interest in contributing. This guide covers the most common contribution types.

## Adding a New Scoring Rule

This is the most impactful contribution you can make. The rules engine is in `packages/rules-engine/src/rules/`.

### 1. Create or edit a rule file

Rules are grouped by category. Pick the right file:

| File | Category | Examples |
|------|----------|---------|
| `hook-rules.ts` | Hook quality | Opening line patterns |
| `advanced-hook-rules.ts` | Advanced hooks | Open loops, contrarian claims |
| `structure-rules.ts` | Structure | Length, hashtags, line breaks |
| `engagement-rules.ts` | Engagement | CTAs, bookmark-worthy formats |
| `penalty-rules.ts` | Penalties | Engagement bait, text walls |
| `ai-detection-rules.ts` | AI detection | Slop words, formulaic structure |
| `link-detection.ts` | Links | External link penalty |
| `reply-potential-rules.ts` | Reply potential | Questions, dead endings, tone |
| `quality-signal-rules.ts` | Quality | Sentiment, readability, contrast |

### 2. Write the rule

```typescript
import type { RuleDefinition, TweetInput, RuleResult } from '@reach/shared-types';

export const myNewRule: RuleDefinition = {
  id: 'category-descriptive-name',     // kebab-case, unique
  name: 'Human Readable Name',
  category: 'hook',                     // hook | structure | engagement | penalty | bonus
  runOn: 'client',                      // always 'client' for rules-engine rules
  evaluate: (input: TweetInput): RuleResult => {
    const text = input.text;

    // Your detection logic here
    const detected = /some-pattern/i.test(text);

    if (detected) {
      return {
        ruleId: 'category-descriptive-name',
        triggered: true,
        points: 6,                       // positive = good, negative = penalty
        severity: 'positive',            // critical | warning | info | positive
        suggestion: 'Why this is good and what to do about it.',
      };
    }

    return {
      ruleId: 'category-descriptive-name',
      triggered: false,
      points: 0,
      severity: 'info',
    };
  },
};
```

### 3. Register the rule

Add it to `packages/rules-engine/src/all-client-rules.ts`:

```typescript
import { myNewRule } from './rules/your-file';

export const allClientRules: RuleDefinition[] = [
  // ... existing rules
  myNewRule,
];
```

### 4. Write tests

Add tests in `packages/rules-engine/src/__tests__/rules/`:

```typescript
import { myNewRule } from '../../rules/your-file';
import type { TweetInput } from '@reach/shared-types';

const base: TweetInput = { text: '', platform: 'x', isThread: false, hasMedia: false };

describe('myNewRule', () => {
  it('should trigger on matching text', () => {
    const result = myNewRule.evaluate({ ...base, text: 'text that matches' });
    expect(result.triggered).toBe(true);
    expect(result.points).toBe(6);
  });

  it('should not trigger on non-matching text', () => {
    const result = myNewRule.evaluate({ ...base, text: 'normal text' });
    expect(result.triggered).toBe(false);
  });
});
```

### 5. Update weights if needed

If your rule shifts the score distribution significantly, you may need to adjust `packages/rules-engine/src/config/weights.json`. Category caps prevent any single rule from breaking the balance.

### 6. Run checks

```bash
pnpm test        # All tests pass
pnpm typecheck   # No type errors
```

## Rule Guidelines

- **Evidence over intuition.** Link to research, algorithm source code, or data that supports the rule. Add a comment explaining the evidence.
- **No /g flag on regexes used with .test().** The `/g` flag causes non-deterministic `.test()` results due to `lastIndex` advancement. Use `/g` only with `.match()` or `.replace()`.
- **Reasonable point values.** Most rules: 3-8 points. Critical penalties: up to -14. Check the existing rules for calibration.
- **Clear suggestions.** The suggestion text should tell the user what to do, not just what's wrong.
- **Bilingual awareness.** If your rule uses word lists, consider both English and Turkish patterns (check `i18n.ts` and existing rules for examples).

## Bug Fixes and Improvements

1. Fork the repo
2. Create a branch: `git checkout -b fix/description`
3. Make your changes
4. Run `pnpm test && pnpm typecheck`
5. Open a PR with a clear description of what changed and why

## Development Setup

```bash
git clone https://github.com/AytuncYildizli/reach-optimizer.git
cd reach-optimizer
pnpm install
cp .env.example apps/api/.env.local
# Fill in at least DATABASE_URL and JWT_SECRET
pnpm dev
```

Extension hot-reload: `pnpm --filter @reach/extension dev` then reload the extension in Chrome.

## Commit Style

```
feat(rules): add thread-hook detection rule
fix(ext): score overlay not showing on compose page
docs: update rule contribution guide
```

## Questions?

Open an issue. We're friendly.
