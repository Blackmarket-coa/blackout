/**
 * Account-data keys under which a space can be marked "onboarded".
 *
 * Two independent first-run systems each own one: the canopy wizard
 * (`features/welcome/OnboardingWizard`) and the member flow
 * (`features/onboarding/OnboardingFlow`). They stay separate keys — merging
 * them is a migration, not a fix — but the canopy wizard reads both so a user
 * who finished the member flow isn't greeted as brand new.
 *
 * Deliberately a leaf module: `welcome/useWelcome` imports these, and
 * `onboarding/OnboardingFlow` imports `welcome/useWelcome`, so anything with
 * imports of its own here would close a cycle.
 */

/** Canopy wizard. Shape: `{ spaces: { [spaceId]: boolean } }`. */
export const CANOPY_ONBOARDING_COMPLETED_KEY = 'co.bmc.onboarding.completed';

/** Member flow. Shape: `{ spaces: { [spaceId]: OnboardingProgress } }`. */
export const MEMBER_ONBOARDING_PROGRESS_KEY = 'co.bmc.onboarding.progress.v3';
