import { NextResponse } from 'next/server';
import { env } from '@lib/env';
import { ScoreEngine, allClientRules } from '@reach/rules-engine';
import pg from 'pg';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min for batch processing

const engine = new ScoreEngine(allClientRules);

export async function GET() {
  if (!env.OPS_DATABASE_URL) {
    return NextResponse.json({ error: 'OPS_DATABASE_URL not configured' }, { status: 503 });
  }

  const client = new pg.Client({ connectionString: env.OPS_DATABASE_URL });
  await client.connect();

  try {
    // 1. Read pending tweets
    const { rows: pendingTweets } = await client.query(
      "SELECT id, tweet_text FROM tweets WHERE status = 'pending' AND tweet_text IS NOT NULL ORDER BY id DESC LIMIT 20",
    );

    const results = [];

    for (const tweet of pendingTweets) {
      // 2. Score original
      const original = engine.evaluate({
        text: tweet.tweet_text,
        platform: 'x',
        isThread: false,
        hasMedia: false,
      });

      let bestText = tweet.tweet_text;
      let bestScore = original.reachScore;
      let hookType = 'generic';

      // 3. If score < 70, run optimization (up to 3 rounds)
      if (original.reachScore < 70 && env.ANTHROPIC_API_KEY) {
        for (let round = 1; round <= 3; round++) {
          const variations = await generateVariations(env.ANTHROPIC_API_KEY, bestText, round);

          for (const v of variations) {
            const scored = engine.evaluate({
              text: v,
              platform: 'x',
              isThread: false,
              hasMedia: false,
            });
            if (scored.reachScore > bestScore) {
              bestText = v;
              bestScore = scored.reachScore;
            }
          }

          // Plateau check
          if (bestScore === original.reachScore) break;
          if (bestScore >= 75) break;
        }
      }

      // Detect hook type from suggestions
      const finalResult = engine.evaluate({
        text: bestText,
        platform: 'x',
        isThread: false,
        hasMedia: false,
      });
      const hookSuggestion = finalResult.suggestions.find((s) => s.ruleId.includes('hook'));
      if (hookSuggestion) {
        hookType = hookSuggestion.ruleId.replace('hook-', '').replace('penalty-', '');
      }

      // 4. Update DB - write optimized text + score + hook type
      await client.query(
        'UPDATE tweets SET tweet_text = $1, rating = $2, hook_type = $3, char_count = $4 WHERE id = $5',
        [bestText, bestScore, hookType, bestText.length, tweet.id],
      );

      results.push({
        id: tweet.id,
        originalScore: original.reachScore,
        newScore: bestScore,
        improved: bestScore > original.reachScore,
        delta: bestScore - original.reachScore,
      });
    }

    await client.end();

    const improved = results.filter((r) => r.improved).length;
    return NextResponse.json({
      success: true,
      processed: results.length,
      improved,
      avgDelta:
        results.length > 0
          ? Math.round(results.reduce((s, r) => s + r.delta, 0) / results.length)
          : 0,
      results,
    });
  } catch (error) {
    await client.end();
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

async function generateVariations(
  apiKey: string,
  seedText: string,
  round: number,
): Promise<string[]> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        temperature: 0.8 + round * 0.05,
        system:
          'You rewrite tweets to maximize reach. Keep EXACT same facts. Sound human. Return ONLY valid JSON.',
        messages: [
          {
            role: 'user',
            content: `Round ${round}. Rewrite this tweet 3 ways to get more reach:
- Keep EXACT same facts and message
- Complete tweet under 280 chars
- End with reply-trigger (question, "thoughts?", choice)
- NO AI words (delve, landscape, leverage)
- V1: Bold claim. V2: Number/data lead. V3: Provocative question.

Tweet: "${seedText.replace(/"/g, '\\"')}"

Return JSON: {"suggestions": ["v1", "v2", "v3"]}`,
          },
        ],
      }),
    });

    if (!response.ok) return [];
    const data = await response.json();
    const raw = data.content?.[0]?.text ?? '{}';
    const cleaned = raw
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const result = JSON.parse(cleaned);
    return (result.suggestions || []).filter(
      (s: string) => s && s.length > 10 && s.length <= 280,
    );
  } catch {
    return [];
  }
}
