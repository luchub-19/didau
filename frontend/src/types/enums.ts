export type PlaceStatus = 'PROPOSED' | 'VOTING' | 'ACCEPTED' | 'REJECTED' | 'VISITED';

export type PlaceCategory =
  | 'FOOD'
  | 'DRINK'
  | 'ENTERTAINMENT'
  | 'SIGHTSEEING'
  | 'ACCOMMODATION'
  | 'SHOPPING'
  | 'OTHER';

export type VoteValue = -1 | 0 | 1;

export type ConflictLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

export type MemberRole = 'HOST' | 'MEMBER';

export type RoomStatus = 'PLANNING' | 'VOTING' | 'FINALIZED' | 'COMPLETED' | 'ARCHIVED';

export type TieBreakStrategyName =
  | 'EARLIEST_SUBMISSION'
  | 'MOST_UPVOTES'
  | 'CREATOR_PRIORITY'
  | 'RANDOM'
  | 'CATEGORY_DIVERSITY';
