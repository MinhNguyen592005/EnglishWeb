export type Profile = {
  id: number; username: string; displayName: string; role: string;
  totalXp: number; level: number; xpInLevel: number; placementEligible?: boolean;
  pvpElo?: number; pvpPeakElo?: number; pvpRankTier?: string; pvpRankTitle?: string;
  pvpWins?: number; pvpLosses?: number; pvpDraws?: number; pvpWinStreak?: number;
  equippedFrame?: string; equippedBadge?: string | null;
}
export type Difficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
export type Lesson = { id: number; topicSlug: string; topicTitle?: string; topicSortOrder?: number; title: string; summary: string; theory: string | null; ordinalNo: number; difficulty: Difficulty; status: 'LOCKED' | 'AVAILABLE' | 'COMPLETED'; chapterCompleted: boolean }
export type Topic = { slug:string; title:string; description:string; outcome:string; sortOrder:number; planetStyle:string; unlocked:boolean; chapterCompleted:boolean; lessonCount:number }
export type CurriculumTopic = Omit<Topic,'unlocked'|'chapterCompleted'|'lessonCount'> & {published:boolean}
export type TeacherCurriculum = {topics:CurriculumTopic[];lessons:AdminLesson[];questions:AdminQuestion[]}
export type Question = { ordinalNo: number; questionType: 'MCQ'|'FILL_BLANK'|'ERROR_CORRECTION'|'REWRITE'; prompt: string; options: string[]; answer: string | null; correct: boolean | null; correctOption: string | null; explanation: string | null }
export type Attempt = { id: number; kind: 'PRACTICE' | 'LESSON_BOSS' | 'CHAPTER_BOSS'; status: 'IN_PROGRESS' | 'WON' | 'LOST'; lessonId: number | null; totalQuestions: number; requiredCorrect: number; correctCount: number; bossHp: number; awardedXp: number; questions: Question[] }
export type AnswerResult = { ordinalNo: number; correct: boolean; correctOption: string | null; explanation: string | null; correctCount: number; bossHp: number; finished: boolean; won: boolean; awardedXp: number }
export type Classroom = { id: number; name: string; joinCode: string; teacherId: number; teacherName: string; memberCount?: number; members?: {id:number; username:string; displayName:string; role:string}[]; assignments?: Assignment[] }
export type Assignment = {id:number; title:string; instructions:string; lessonId:number; lessonTitle:string; passPercent:number; dueAt:string; status:string}
export type ClassMessage = {id:number; userId:number; displayName:string; body:string; createdAt:string}
export type AssignmentResult = {userId:number; displayName:string; attemptId:number; status:string; correctCount:number; totalQuestions:number; completedAt:string|null; passed:boolean}
export type ArenaRoom = {
  id:number; code:string; status:string; stateVersion:number;
  pausedUserId:number|null; pauseExpiresAt:string|null;
  hostId:number; guestId:number|null; hostName:string; guestName:string|null;
  hostReady:boolean; guestReady:boolean; hostScore:number; guestScore:number;
  currentRound:number; questionLimit:number; deadlineAt:string|null; winnerId:number|null; isHost:boolean;
  isMatchmade?:boolean; confirmDeadlineAt?:string|null; countdownUntil?:string|null; matchDeadlineAt?:string|null;
  hostElo?:number; guestElo?:number;
  hostRankTier?:string; hostRankTitle?:string; guestRankTier?:string; guestRankTitle?:string;
  hostFrame?:string; hostBadge?:string|null; guestFrame?:string; guestBadge?:string|null;
  hostEloBefore?:number; guestEloBefore?:number; hostEloChange?:number; guestEloChange?:number;
  resultType?:string|null; cancelReason?:string|null;
  question?:{roundNo:number;prompt:string;options:string[]};
  myAnswer?:string|null; opponentAnswered?:boolean;
  lastResult?:{roundNo:number;correctOption:string;explanation:string;hostCorrect:boolean;guestCorrect:boolean}
}
export type ArenaMessage = {id:number;roomId:number;userId:number;displayName:string;body:string;createdAt:string}
export type ArenaHistory = {
  id:number;code:string;status:string;hostId:number;guestId:number;
  hostName:string;guestName:string;hostScore:number;guestScore:number;
  winnerId:number|null;createdAt:string;
  hostEloBefore?:number;guestEloBefore?:number;hostEloChange?:number;guestEloChange?:number;resultType?:string|null;
}
export type PvpRankTier = { code: string; title: string; minElo: number; nextElo: number | null; colorClass: string }
export type PvpMyStats = {
  userId: number; username: string; displayName: string; rank: number;
  elo: number; peakElo: number; rankTier: string; rankTitle: string; rankColorClass: string;
  minElo: number; nextElo: number | null;
  wins: number; losses: number; draws: number; totalMatches: number; winRate: number;
  winStreak: number; bestWinStreak: number;
  declineCount: number; maxDeclines: number; banUntil: string | null; banRemainingSeconds: number;
  equippedFrame: string; equippedBadge: string | null;
}
export type PvpLeaderEntry = {
  rank: number; userId: number; username: string; displayName: string;
  elo: number; peakElo: number; rankTier: string; rankTitle: string; rankColorClass: string;
  wins: number; losses: number; draws: number; totalMatches: number; winRate: number;
  winStreak: number; bestWinStreak: number;
  equippedFrame: string; equippedBadge: string | null;
  equippedBadgeName?: string | null; equippedBadgeCss?: string | null; equippedFrameCss?: string | null;
}
export type PvpLeaderboardResponse = { tiers: PvpRankTier[]; myStats: PvpMyStats; leaders: PvpLeaderEntry[] }
export type PvpCosmeticItem = {
  code: string; type: 'FRAME' | 'BADGE'; name: string; description: string;
  unlockType: string; unlockThreshold: number; currentProgress: number;
  rankTier: string | null; cssClass: string; icon: string;
  unlocked: boolean; equipped: boolean; unlockedAt: string | null;
}
export type PvpCosmeticsResponse = { equippedFrame: string; equippedBadge: string | null; items: PvpCosmeticItem[]; profile: Profile }
export type AdminUser = {id:number;username:string;displayName:string;role:string;locked:boolean;totalXp:number;createdAt:string}
export type AdminReport = {id:number;source:'CLASS'|'ARENA'|'USER';reason:string;status:string;decision:string|null;createdAt:string;messageBody:string;accusedId:number;accusedName:string;reporterId:number}
export type AdminLesson = {id:number;topicSlug:string;ordinalNo:number;title:string;summary:string;theory:string;difficulty:Difficulty;published:boolean}
export type AdminQuestion = {id:number;lessonId:number;prompt:string;optionA:string;optionB:string;optionC:string;optionD:string;correctOption:string;explanation:string;published:boolean;ownerId?:number|null;questionType?:string;acceptedAnswer?:string|null}
export type AdminContent = {lessons:AdminLesson[];questions:AdminQuestion[]}
export type TeacherQuestion = {id:number;lessonId:number;prompt:string;optionA:string;optionB:string;optionC:string;optionD:string;correctOption:string;explanation:string;questionType:'MCQ'|'FILL_BLANK'|'ERROR_CORRECTION'|'REWRITE';acceptedAnswer:string|null;active:boolean;adminBlocked?:boolean}
export type TeacherOverview = {classes:number;students:number;openAssignments:number;questions:number;recent:{id:number;classId:number;className:string;title:string;dueAt:string;status:string;students:number;submitted:number}[]}
export type DailyQuest = { id: number; code: string; tier: string; title: string; description: string; category: string; targetType: string; targetCount: number; currentProgress: number; rewardXp: number; icon: string; completed: boolean; claimed: boolean }
export type DailyQuestMilestone = { totalQuests: number; completedQuests: number; allCompleted: boolean; claimed: boolean; rewardXp: number }
export type UserStreak = { currentStreak: number; longestStreak: number; completedToday: boolean }
export type DailyQuestOverview = { quests: DailyQuest[]; milestone: DailyQuestMilestone; streak: UserStreak }
export type QuestClaimResponse = { quest: DailyQuest; profile: Profile }
export type MilestoneClaimResponse = { milestone: DailyQuestMilestone; streak: UserStreak; profile: Profile }
