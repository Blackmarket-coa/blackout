import React from 'react';
import { useAtomValue } from 'jotai';
import { joinedRoomsAtom } from '../../../state/bmc-rooms';
import { userIdAtom } from '../../../state/bmc-auth';
import { ModDashboard } from './ModDashboard';
import { hasModeratorAccess } from './access';

export const DraupnirRoutePage = () => {
    const rooms = useAtomValue(joinedRoomsAtom);
    const userId = useAtomValue(userIdAtom);

    const allowed = hasModeratorAccess(rooms, userId);

    if (!allowed) {
        return (
            <main style={{ padding: 20, display: 'grid', gap: 8 }}>
                <h1 style={{ margin: 0, fontSize: 22 }}>Draupnir Moderation Dashboard</h1>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Moderator or admin capability is required to view this page.
                </div>
            </main>
        );
    }

    return (
        <main style={{ padding: 20, display: 'grid', gap: 12 }}>
            <ModDashboard />
        </main>
    );
};

export default DraupnirRoutePage;
