import React, { useCallback, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAtomValue } from 'jotai';
import { OnboardingWizard } from './OnboardingWizard';
import { useOnboardingContent } from './useWelcome';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { roomToParentsAtom } from '../../state/room/roomToParents';
import { mDirectAtom } from '../../state/mDirectList';
import { resolvePostAcceptancePath } from '../../components/invite-landing/postAcceptanceRoute';

const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'var(--bg-surface, #111827)',
};

/**
 * Full-page host for the onboarding wizard, mounted at
 * `/onboarding/:spaceIdOrAlias/`. Invite acceptance routes brand-new users here
 * (with the invited room as `?room=`) before dropping them into the room. The
 * wizard is otherwise an in-`ClientLayout` modal; here it stands alone so a
 * first-time recipient sees a dedicated welcome before the app chrome.
 */
export const OnboardingPage: React.FC = () => {
    const params = useParams();
    const [search] = useSearchParams();
    const navigate = useNavigate();
    const mx = useMatrixClient();
    const roomToParents = useAtomValue(roomToParentsAtom);
    const mDirects = useAtomValue(mDirectAtom);

    const spaceId = params.spaceIdOrAlias ? decodeURIComponent(params.spaceIdOrAlias) : '';
    const roomId = search.get('room') ?? undefined;
    const onboarding = useOnboardingContent(spaceId);

    const goToRoom = useCallback(() => {
        const path = roomId
            ? resolvePostAcceptancePath(mx, roomToParents, mDirects, roomId, {
                  skipOnboarding: true,
              })
            : '/';
        navigate(path, { replace: true });
    }, [mx, roomToParents, mDirects, roomId, navigate]);

    // If the space has no onboarding configured (or it's disabled), the wizard
    // renders nothing — don't strand the user on a blank page, just proceed.
    useEffect(() => {
        if (!spaceId || onboarding.loading) return;
        if (!onboarding.data.enabled) goToRoom();
    }, [spaceId, onboarding.loading, onboarding.data.enabled, goToRoom]);

    return (
        <main data-shell="onboarding" style={pageStyle}>
            <OnboardingWizard
                spaceId={spaceId}
                open
                onClose={goToRoom}
                onComplete={goToRoom}
            />
        </main>
    );
};

export default OnboardingPage;
