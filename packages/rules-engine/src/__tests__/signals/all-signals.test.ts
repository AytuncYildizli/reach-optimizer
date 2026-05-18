import { describe, expect, it } from 'vitest';
import { buildContext } from '../../context';
import {
  predictAdDisclosure,
  predictBlockAuthor,
  predictClick,
  predictContClickDwellTime,
  predictContDwellTime,
  predictDwell,
  predictFavorite,
  predictFollowAuthor,
  predictMuteAuthor,
  predictNotDwelled,
  predictNotInterested,
  predictPhotoExpand,
  predictPostFrequency,
  predictProfileClick,
  predictQuote,
  predictQuotedClick,
  predictQuotedVqv,
  predictReply,
  predictReport,
  predictRetweet,
  predictShare,
  predictShareViaCopyLink,
  predictShareViaDm,
  predictTopicConsistency,
  predictVqv,
} from '../../signals';
import type { TweetInput } from '@reach/shared-types';

function ctx(partial: Partial<TweetInput> & { text: string }) {
  return buildContext({
    platform: 'x',
    isThread: false,
    hasMedia: false,
    ...partial,
  });
}

describe('positive signals', () => {
  it('favorite rewards emotion + first-person + aphoristic shape', () => {
    const low = predictFavorite(ctx({ text: 'hi' }));
    const high = predictFavorite(
      ctx({ text: "I love how everyone is sleeping on this. Truth is, momentum compounds." }),
    );
    expect(high.score).toBeGreaterThan(low.score);
    expect(high.max).toBe(7);
  });

  it('reply rewards questions, 2nd-person, opinions', () => {
    const low = predictReply(ctx({ text: 'just shipped a thing.' }));
    const high = predictReply(
      ctx({ text: 'Hot take: you should always pick boring tech. Agree or change my mind?' }),
    );
    expect(high.score).toBeGreaterThanOrEqual(8);
    expect(low.score).toBeLessThan(high.score);
  });

  it('retweet rewards aphoristic + "everyone should know"', () => {
    const high = predictRetweet(
      ctx({ text: 'Everyone should know: 80% of bugs ship after midnight.' }),
    );
    expect(high.score).toBeGreaterThanOrEqual(4);
  });

  it('quote rewards contrarian + confident claims', () => {
    const high = predictQuote(
      ctx({ text: "Actually, async is overrated and most teams should use boring sync queues. Change my mind." }),
    );
    expect(high.score).toBeGreaterThan(0);
  });

  it('share rewards surprising news-shaped content', () => {
    const high = predictShare(
      ctx({ text: 'Just in: researchers report 73% drop in deploy time after switching CI.' }),
    );
    expect(high.score).toBeGreaterThanOrEqual(3);
  });

  it('share_via_dm rewards insider + niche targeting', () => {
    const high = predictShareViaDm(
      ctx({ text: 'The secret hiring trick agencies don\'t tell you. Every founder should see this.' }),
    );
    expect(high.score).toBeGreaterThanOrEqual(4);
  });

  it('share_via_copy_link rewards frameworks/lists', () => {
    const high = predictShareViaCopyLink(
      ctx({ text: '5 frameworks for product-market fit:\n1. ICP\n2. JTBD\n3. CAC/LTV\n4. NPS\n5. WOM' }),
    );
    expect(high.score).toBeGreaterThanOrEqual(2);
  });

  it('click rewards link with curiosity gap (NOT penalty)', () => {
    const baseline = predictClick(ctx({ text: 'no link here' }));
    const withLink = predictClick(
      ctx({ text: "Here's why TypeScript won. Read the full breakdown → https://example.com/article" }),
    );
    expect(withLink.score).toBeGreaterThan(baseline.score);
    expect(withLink.score).toBeGreaterThanOrEqual(5);
  });

  it('click never returns a negative score for a link', () => {
    const r = predictClick(ctx({ text: 'check https://example.com' }));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.type).toBe('positive');
  });

  it('profile_click rewards specific achievements + credentials', () => {
    const high = predictProfileClick(
      ctx({ text: 'I shipped a $1M ARR SaaS as a solo founder. Ex-Stripe engineer. Here\'s what nobody talks about.' }),
    );
    expect(high.score).toBeGreaterThanOrEqual(5);
  });

  it('follow_author rewards series markers', () => {
    const high = predictFollowAuthor(
      ctx({ text: 'Day 47/100 building in public. My rule: ship every Friday.' }),
    );
    expect(high.score).toBeGreaterThanOrEqual(3);
  });

  it('photo_expand is inert without image', () => {
    const inert = predictPhotoExpand(ctx({ text: 'look at this →' }));
    expect(inert.applicable).toBe(false);
    expect(inert.score).toBe(0);
  });

  it('photo_expand fires with image present', () => {
    const active = predictPhotoExpand(
      ctx({ text: 'Look at this. Notice the detail in the corner.', hasMedia: true, mediaType: 'image' }),
    );
    expect(active.applicable).toBe(true);
    expect(active.score).toBeGreaterThanOrEqual(2);
  });

  it('vqv is inert without video', () => {
    expect(predictVqv(ctx({ text: 'watch this' })).applicable).toBe(false);
  });

  it('vqv fires with video', () => {
    const active = predictVqv(
      ctx({ text: 'Watch until the 30 second mark. Sound on.', hasMedia: true, mediaType: 'video' }),
    );
    expect(active.applicable).toBe(true);
    expect(active.score).toBeGreaterThan(0);
  });

  it('dwell rewards optimal length and line breaks', () => {
    const lowWall = predictDwell(
      ctx({ text: 'a'.repeat(500) }),
    );
    const high = predictDwell(
      ctx({ text: 'Three things I learned shipping reachOS this week.\n\nFirst: scope creep is real.\n\nSecond: ship daily.' }),
    );
    expect(high.score).toBeGreaterThan(lowWall.score);
  });

  it('cont_dwell_time rewards second-paragraph payoff', () => {
    const r = predictContDwellTime(
      ctx({
        text: "Here's how I doubled output:\n\nFirst, I cut meetings. Step 1 was saying no to standups. Then I batched messages. Finally, I shipped early.",
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(1);
  });

  it('cont_click_dwell_time conditional on hasClickable', () => {
    const inert = predictContClickDwellTime(ctx({ text: 'tiny post' }));
    expect(inert.applicable).toBe(false);
    const active = predictContClickDwellTime(
      ctx({ text: "Full breakdown in the article → https://example.com" }),
    );
    expect(active.applicable).toBe(true);
  });

  it('quoted_click conditional on isQuoteTweet', () => {
    expect(predictQuotedClick(ctx({ text: 'no quote' })).applicable).toBe(false);
    const active = predictQuotedClick(
      ctx({ text: 'Exactly this. The point below is huge.', isQuoteTweet: true, quotedText: 'short quoted text' }),
    );
    expect(active.applicable).toBe(true);
  });

  it('quoted_vqv requires both isQuoteTweet and the quoted post having a video', () => {
    // Quoting a video-less post → inactive even with your own video attached.
    expect(
      predictQuotedVqv(
        ctx({ text: 'watch at 0:30', isQuoteTweet: true, hasMedia: true, mediaType: 'video' }),
      ).applicable,
    ).toBe(false);
    // Quoting a video post → active.
    expect(
      predictQuotedVqv(
        ctx({ text: 'watch at 0:30', isQuoteTweet: true, quotedMediaType: 'video' }),
      ).applicable,
    ).toBe(true);
  });
});

describe('negative signals', () => {
  it('not_dwelled penalizes wall-of-text + generic openers', () => {
    const wall = predictNotDwelled(
      ctx({ text: "So today I want to talk about leverage and " + "synergy ".repeat(60) }),
    );
    expect(wall.score).toBeLessThan(0);
    expect(wall.type).toBe('negative');
  });

  it('not_dwelled clean post = 0 penalty', () => {
    const clean = predictNotDwelled(ctx({ text: 'I shipped a thing today. Took 3 hours.' }));
    expect(clean.score).toBe(0);
  });

  it('not_interested penalizes pure rants', () => {
    const rant = predictNotInterested(
      ctx({ text: 'I am so sick of these recruiters. Nobody cares anymore.' }),
    );
    expect(rant.score).toBeLessThan(0);
  });

  it('block_author penalizes ad-hominem', () => {
    const hostile = predictBlockAuthor(
      ctx({ text: 'You are an idiot. Everyone block this delusional moron.' }),
    );
    expect(hostile.score).toBeLessThan(-3);
  });

  it('mute_author penalizes repetitive spam', () => {
    const spam = predictMuteAuthor(
      ctx({ text: 'crypto crypto crypto crypto crypto to the moon to the moon' }),
    );
    expect(spam.score).toBeLessThan(0);
  });

  it('report penalizes spam patterns', () => {
    const spam = predictReport(
      ctx({ text: 'Free crypto airdrop here!!!! DM for details. Buy followers cheap.' }),
    );
    expect(spam.score).toBeLessThan(-3);
  });

  it('ad_disclosure penalizes promo language without disclosure', () => {
    const undisclosed = predictAdDisclosure(
      ctx({ text: 'Use code TUNC10 for a discount on my favourite headphones — link in bio.' }),
    );
    expect(undisclosed.score).toBeLessThan(0);
  });

  it('ad_disclosure is silent when #ad is present', () => {
    const disclosed = predictAdDisclosure(
      ctx({ text: 'Use code TUNC10 for a discount — link in bio. #ad' }),
    );
    expect(disclosed.score).toBe(0);
  });

  it('ad_disclosure ignores non-promo posts', () => {
    const clean = predictAdDisclosure(ctx({ text: 'Shipped a thing today. Took 3 hours.' }));
    expect(clean.score).toBe(0);
  });

  it('ad_disclosure does NOT treat bare narrative "ads" as disclosure', () => {
    // Regression: an earlier regex matched the word "ads" anywhere, letting
    // promo+narrative posts silence the penalty by accident.
    const sneaky = predictAdDisclosure(
      ctx({ text: 'I had ads running last year. Use code DEAL10, link in bio.' }),
    );
    expect(sneaky.score).toBeLessThan(0);
  });

  it('ad_disclosure accepts parenthesised disclosure', () => {
    const ok = predictAdDisclosure(
      ctx({ text: 'Use code DEAL10 (sponsored) — link in bio.' }),
    );
    expect(ok.score).toBe(0);
  });

  it('post_frequency is inert when extension did not report a count', () => {
    const r = predictPostFrequency(ctx({ text: 'just a post' }));
    expect(r.applicable).toBe(false);
    expect(r.score).toBe(0);
  });

  it('post_frequency does not penalise the first or second post', () => {
    expect(predictPostFrequency(ctx({ text: 'first post', postsToday: 0 })).score).toBe(0);
    expect(predictPostFrequency(ctx({ text: 'second post', postsToday: 1 })).score).toBe(0);
  });

  it('post_frequency escalates after the third post', () => {
    const third = predictPostFrequency(ctx({ text: 'third post', postsToday: 2 }));
    const fifth = predictPostFrequency(ctx({ text: 'fifth post', postsToday: 4 }));
    expect(third.score).toBeLessThan(0);
    expect(fifth.score).toBeLessThan(third.score);
  });
});

describe('curiosity signals', () => {
  it('topic_consistency is inert without recent topics', () => {
    const r = predictTopicConsistency(ctx({ text: 'building reachOS today' }));
    expect(r.applicable).toBe(false);
  });

  it('topic_consistency rewards microniche overlap', () => {
    const drift = predictTopicConsistency(
      ctx({
        text: 'random thoughts about cooking pasta tonight',
        recentTopics: ['typescript', 'extension', 'reach', 'algorithm'],
      }),
    );
    const onBrand = predictTopicConsistency(
      ctx({
        text: 'shipping a TypeScript extension that scores the reach algorithm',
        recentTopics: ['typescript', 'extension', 'reach', 'algorithm', 'scoring'],
      }),
    );
    expect(onBrand.score).toBeGreaterThan(drift.score);
    expect(onBrand.score).toBeGreaterThanOrEqual(3);
  });
});

describe('signal contract', () => {
  it('every signal returns the v4 SignalScore shape', () => {
    const c = ctx({ text: 'A reasonably normal tweet about shipping software.' });
    const all = [
      predictFavorite(c),
      predictReply(c),
      predictRetweet(c),
      predictQuote(c),
      predictShare(c),
      predictShareViaDm(c),
      predictShareViaCopyLink(c),
      predictClick(c),
      predictProfileClick(c),
      predictFollowAuthor(c),
      predictPhotoExpand(c),
      predictVqv(c),
      predictDwell(c),
      predictContDwellTime(c),
      predictContClickDwellTime(c),
      predictQuotedClick(c),
      predictQuotedVqv(c),
      predictNotDwelled(c),
      predictNotInterested(c),
      predictBlockAuthor(c),
      predictMuteAuthor(c),
      predictReport(c),
      predictAdDisclosure(c),
      predictPostFrequency(c),
      predictTopicConsistency(c),
    ];
    for (const s of all) {
      expect(s).toHaveProperty('signal');
      expect(s).toHaveProperty('type');
      expect(s).toHaveProperty('bucket');
      expect(s).toHaveProperty('score');
      expect(s).toHaveProperty('max');
      expect(s).toHaveProperty('applicable');
      expect(s).toHaveProperty('firedRules');
      expect(s).toHaveProperty('subRules');
    }
  });
});
