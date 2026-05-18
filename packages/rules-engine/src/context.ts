import type { PostContext, TweetInput } from '@reach/shared-types';

const URL_REGEX = /https?:\/\/\S+/i;

export function buildContext(input: TweetInput): PostContext {
  const text = input.text ?? '';
  const lines = text.split('\n');
  const firstLine = lines[0] ?? '';
  // When the caller knows media is attached but can't differentiate the type
  // (the composer detector's most common case — DOM only confirms presence),
  // treat it as an image. Image is the majority case on X, and over-counting
  // photo_expand on a video attachment is cheaper than missing the signal
  // entirely. Video is only credited when the type is explicitly known.
  const hasImage =
    input.hasMedia &&
    (input.mediaType === 'image' || input.mediaType === 'gif' || input.mediaType === undefined);
  const hasVideo = input.hasMedia && input.mediaType === 'video';
  const hasUrl = URL_REGEX.test(text);
  const hasClickable = hasUrl || text.length > 280;

  return {
    text,
    firstLine,
    platform: input.platform,
    isThread: input.isThread,
    threadLength: input.threadLength ?? (input.isThread ? 2 : 1),
    hasImage,
    hasVideo,
    hasClickable,
    isQuoteTweet: input.isQuoteTweet ?? false,
    quotedText: input.quotedText ?? '',
    quotedHasVideo: input.quotedMediaType === 'video',
    charCount: text.length,
    lineCount: lines.length,
    // `postsToday` is optional on the wire; -1 sentinel means "extension did
    // not report it", which `post_frequency` reads as non-applicable.
    postsToday: input.postsToday ?? -1,
    recentTopics: input.recentTopics ?? [],
  };
}
