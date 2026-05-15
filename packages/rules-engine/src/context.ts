import type { PostContext, TweetInput } from '@reach/shared-types';

const URL_REGEX = /https?:\/\/\S+/i;

export function buildContext(input: TweetInput): PostContext {
  const text = input.text ?? '';
  const lines = text.split('\n');
  const firstLine = lines[0] ?? '';
  const hasImage = input.hasMedia && (input.mediaType === 'image' || input.mediaType === 'gif');
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
  };
}
