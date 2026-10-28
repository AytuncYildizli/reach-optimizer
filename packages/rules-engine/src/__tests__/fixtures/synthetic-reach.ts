import type { HistoryPost } from '../../forecast/dataset';

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function post(index: number, hour: number, hasImage: boolean, hashtag: boolean, impressions: number, textPrefix: string): HistoryPost {
  const created = new Date(Date.UTC(2024, 0, 1) + index * 86400000);
  created.setUTCHours(hour, 15, 0, 0);
  return {
    id: `${textPrefix}${index}`,
    createdAt: created.toISOString(),
    text: `${textPrefix} note ${String(index).padStart(3, '0')} ${hashtag ? '#build' : '......'} for the log`,
    kind: 'original',
    lang: 'en',
    mediaType: hasImage ? 'image' : null,
    impressions,
    likes: Math.max(0, Math.round(impressions * 0.02)),
    retweets: Math.max(0, Math.round(impressions * 0.004)),
    replies: Math.max(0, Math.round(impressions * 0.003)),
    quotes: 0,
    bookmarks: Math.max(0, Math.round(impressions * 0.005)),
    followerCount: null,
    account: 'aytunc',
  };
}

/** Stable level. Image, evening hour, and a hashtag move impressions a lot. */
export function signalPosts(): HistoryPost[] {
  const rng = mulberry32(1);
  return Array.from({ length: 180 }, (_, index) => {
    const hasImage = index % 2 === 0;
    const evening = index % 3 === 0;
    const hashtag = index % 5 === 0;
    let logImp = Math.log(1000);
    if (hasImage) logImp += Math.log(3);
    else logImp += Math.log(0.7);
    if (evening) logImp += Math.log(2);
    if (hashtag) logImp += Math.log(1.7);
    logImp += (rng() - 0.5) * 0.06;
    return post(index, evening ? 18 : 9, hasImage, hashtag, Math.max(1, Math.round(Math.exp(logImp))), 'signal');
  });
}

/**
 * Impressions sit on one level. Media, hour, and hashtags are coin flips
 * that do not move reach, so no config should clear the 5% raw-MAE bar.
 */
export function driftPosts(): HistoryPost[] {
  const rng = mulberry32(7);
  return Array.from({ length: 180 }, (_, index) => {
    const hasImage = rng() > 0.5;
    const evening = rng() > 0.5;
    const hashtag = rng() > 0.5;
    return post(index, evening ? 18 : 9, hasImage, hashtag, 1000, 'drift');
  });
}

/**
 * Small stand-in for an imported archive: originals, quotes, and a self-thread,
 * with an external URL and an x.com status URL in the text.
 */
export function archiveShapedPosts(): HistoryPost[] {
  const rng = mulberry32(11);
  return Array.from({ length: 90 }, (_, index) => {
    const created = new Date(Date.UTC(2024, 10, 1) + index * 2 * 86400000);
    created.setUTCHours(index % 5 === 0 ? 18 : 9, 5, 0, 0);
    const hasImage = index % 2 === 0;
    const selfReply = index % 17 === 0 && index > 0;
    const quote = !selfReply && index % 11 === 0;
    let logImp = Math.log(900);
    if (hasImage) logImp += Math.log(2.4);
    if (selfReply) logImp -= Math.log(1.8);
    logImp += (rng() - 0.5) * 0.05;
    const link = quote ? ' https://x.com/someone/status/77' : index % 13 === 0 ? ' https://example.com/story' : '';
    return {
      id: `arch${index}`,
      createdAt: created.toISOString(),
      text: `archive note ${String(index).padStart(3, '0')}${link}`,
      kind: selfReply ? 'reply' : quote ? 'quote' : 'original',
      lang: 'en',
      mediaType: hasImage ? 'image' : null,
      impressions: Math.max(1, Math.round(Math.exp(logImp))),
      likes: 3,
      retweets: 1,
      replies: 1,
      quotes: quote ? 1 : 0,
      bookmarks: 1,
      followerCount: null,
      account: 'aytunc',
      selfReply,
    };
  });
}
