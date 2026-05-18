import type {
  PostContext,
  SignalName,
  SignalScore,
} from '@reach/shared-types';
import { SIGNAL_NAMES } from '@reach/shared-types';

import { predictFavorite } from './favorite';
import { predictReply } from './reply';
import { predictRetweet } from './retweet';
import { predictQuote } from './quote';
import { predictShare } from './share';
import { predictShareViaDm } from './share-via-dm';
import { predictShareViaCopyLink } from './share-via-copy-link';
import { predictClick } from './click';
import { predictProfileClick } from './profile-click';
import { predictFollowAuthor } from './follow-author';
import { predictPhotoExpand } from './photo-expand';
import { predictVqv } from './vqv';
import { predictDwell } from './dwell';
import { predictContDwellTime } from './cont-dwell-time';
import { predictContClickDwellTime } from './cont-click-dwell-time';
import { predictQuotedClick } from './quoted-click';
import { predictQuotedVqv } from './quoted-vqv';
import { predictNotDwelled } from './not-dwelled';
import { predictNotInterested } from './not-interested';
import { predictBlockAuthor } from './block-author';
import { predictMuteAuthor } from './mute-author';
import { predictReport } from './report';
import { predictAdDisclosure } from './ad-disclosure';
import { predictPostFrequency } from './post-frequency';
import { predictTopicConsistency } from './topic-consistency';

export type SignalPredictor = (ctx: PostContext) => SignalScore;

export const signalPredictors: Record<SignalName, SignalPredictor> = {
  favorite: predictFavorite,
  reply: predictReply,
  retweet: predictRetweet,
  quote: predictQuote,
  share: predictShare,
  share_via_dm: predictShareViaDm,
  share_via_copy_link: predictShareViaCopyLink,
  click: predictClick,
  profile_click: predictProfileClick,
  follow_author: predictFollowAuthor,
  photo_expand: predictPhotoExpand,
  vqv: predictVqv,
  dwell: predictDwell,
  cont_dwell_time: predictContDwellTime,
  cont_click_dwell_time: predictContClickDwellTime,
  quoted_click: predictQuotedClick,
  quoted_vqv: predictQuotedVqv,
  topic_consistency: predictTopicConsistency,
  not_dwelled: predictNotDwelled,
  not_interested: predictNotInterested,
  block_author: predictBlockAuthor,
  mute_author: predictMuteAuthor,
  report: predictReport,
  ad_disclosure: predictAdDisclosure,
  post_frequency: predictPostFrequency,
};

export function runAllSignals(ctx: PostContext): Record<SignalName, SignalScore> {
  const out = {} as Record<SignalName, SignalScore>;
  for (const name of SIGNAL_NAMES) {
    out[name] = signalPredictors[name](ctx);
  }
  return out;
}

export {
  predictFavorite,
  predictReply,
  predictRetweet,
  predictQuote,
  predictShare,
  predictShareViaDm,
  predictShareViaCopyLink,
  predictClick,
  predictProfileClick,
  predictFollowAuthor,
  predictPhotoExpand,
  predictVqv,
  predictDwell,
  predictContDwellTime,
  predictContClickDwellTime,
  predictQuotedClick,
  predictQuotedVqv,
  predictNotDwelled,
  predictNotInterested,
  predictBlockAuthor,
  predictMuteAuthor,
  predictReport,
  predictAdDisclosure,
  predictPostFrequency,
  predictTopicConsistency,
};
