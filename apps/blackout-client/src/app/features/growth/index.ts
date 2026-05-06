/**
 * Growth-engine SDK surface (PR 5). The backend ledger lives in
 * `packages/api/src/services/growth.ts`; this module exposes the
 * client wrappers each surface (referrals dashboard, ambassador
 * application, quests bar) will consume in subsequent PRs. No
 * features-registry feature is registered yet — UI ships in a
 * follow-up so the ledger has a stable backend to integrate against.
 */
export {
    recordReferral,
    fetchMyReferrals,
    applyAsAmbassador,
    fetchMyAmbassador,
    fetchActiveQuests,
    completeQuest,
    fetchMyQuestCompletions,
    type ReferralRecord,
    type ReferralSourceKind,
    type ReferralStatus,
    type AmbassadorRecord,
    type AmbassadorTier,
    type QuestDefinitionRecord,
    type QuestCompletionRecord,
    type QuestSourceKind,
    type QuestRewardKind,
} from './growthClient';
