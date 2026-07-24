import React, { useCallback, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useAtomValue } from 'jotai';
import { OnboardingWizard } from './OnboardingWizard';
import { DEFAULT_ONBOARDING_STEPS } from './useWelcome';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { roomToParentsAtom } from '../../state/room/roomToParents';
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

    const spaceId = params.spaceIdOrAlias ? decodeURIComponent(params.spaceIdOrAlias) : '';
    const roomId = search.get('room') ?? undefined;

    const goToRoom = useCallback(() => {
        const path = roomId
            ? resolvePostAcceptancePath(mx, roomToParents, roomId, { skipOnboarding: true })
            : '/';
        navigate(path, { replace: true });
    }, [mx, roomToParents, roomId, navigate]);

    // No space in the URL — nothing to onboard against; go straight on.
    useEffect(() => {
        if (!spaceId) goToRoom();
    }, [spaceId, goToRoom]);

    return (
        <main data-shell="onboarding" style={pageStyle}>
            <OnboardingWizard
                spaceId={spaceId}
                open
                onClose={goToRoom}
                onComplete={goToRoom}
                fallbackSteps={DEFAULT_ONBOARDING_STEPS}
            />
        </main>
    );
};

export default OnboardingPage;
