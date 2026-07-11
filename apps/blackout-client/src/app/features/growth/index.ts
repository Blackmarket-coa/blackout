/**
 * Growth-engine surface. The backend ledger lives in
 * `packages/api/src/services/growth.ts`; this module exposes the client
 * wrappers and now also registers the UI. The three growth features
 * (`growthReferralsFeature` / `growthAmbassadorsFeature` /
 * `growthQuestsFeature`) mount the referrals dashboard, ambassador
 * application, and quests routes, each gated by its own flag so they toggle
 * independently.
 */
export {
    recordReferral,
    fetchMyReferrals,
    applyAsAmbassador,
    fetchMyAmbassador,
    fetchActiveQuests,
    completeQuest,
    fetchMyQuestCompletions,
    createCreatorQuest,
    fetchMyQuests,
    endQuest,
    type CreateCreatorQuestInput,
    type MyQuestRecord,
    type ReferralRecord,
    type ReferralSourceKind,
    type ReferralStatus,
    type AmbassadorRecord,
    type AmbassadorTier,
    type QuestDefinitionRecord,
    type QuestCompletionRecord,
    type QuestSourceKind,
    type QuestRewardKind,
    issueMigrationCredit,
    fetchMyMigrationCredits,
    redeemMigrationCredit,
    type MigrationCreditRecord,
    type MigrationCreditSourceKind,
} from './growthClient';

export { growthReferralsFeature, growthAmbassadorsFeature, growthQuestsFeature } from './manifest';
export { growthReferralsRoutes, growthAmbassadorRoutes, growthQuestsRoutes } from './routes';
export { ReferralsPage } from './ReferralsPage';
export { AmbassadorPage } from './AmbassadorPage';
export { QuestsPage } from './QuestsPage';
