import { lazy, Suspense, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router';
import {
    getDirectPath,
    getInboxInvitesPath,
    getInboxNotificationsPath,
} from '../../pages/pathUtils';
import { resolveMessagingTab, type MessagingTab } from './messagingTabs';

// Same lazy split as MarketShell: the tab bodies pull matrix hooks and the
// room-state atoms, so keep feature-registry composition jsdom-independent.
const MessagingTabBodyLazy = lazy(() =>
    import('./MessagingTabBody').then((mod) => ({ default: mod.MessagingTabBody }))
);

const layoutStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
    width: '100%',
    background: 'var(--bg-surface, #0f172a)',
    color: 'var(--text-primary, #f8fafc)',
};

const headerStyle: CSSProperties = {
    padding: '16px 20px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
};

const tabRowStyle: CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap' };

const tabLinkStyle = (active: boolean): CSSProperties => ({
    padding: '4px 12px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: active ? 'var(--bg-accent)' : 'var(--bg-surface)',
    color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
    fontSize: 13,
    textDecoration: 'none',
});

const bodyStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    padding: '8px 20px 24px',
    overflow: 'auto',
};

const TABS: Array<{ tab: MessagingTab; label: string; to: () => string }> = [
    { tab: 'dms', label: 'Locked In', to: getDirectPath },
    { tab: 'notifications', label: 'Notifications', to: getInboxNotificationsPath },
    { tab: 'invites', label: 'Invites', to: getInboxInvitesPath },
];

/**
 * Inbox destination at `/messages/*`: locked-in (DM) chats, mention
 * notifications, and room invites. The mode router already classifies these
 * paths as the `inbox` shell mode; this page supplies the missing surface.
 */
export const MessagingPage = (): JSX.Element => {
    const location = useLocation();
    const activeTab = resolveMessagingTab(location.pathname);

    return (
        <section style={layoutStyle} data-shell-region="inbox" data-testid="messaging-page">
            <header style={headerStyle}>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Messages</h1>
                <nav aria-label="Messaging sections" style={tabRowStyle}>
                    {TABS.map(({ tab, label, to }) => (
                        <Link
                            key={tab}
                            to={to()}
                            style={tabLinkStyle(
                                activeTab === tab || (tab === 'dms' && activeTab === 'create')
                            )}
                            data-testid={`messaging-tab-${tab}`}
                            aria-current={activeTab === tab ? 'page' : undefined}
                        >
                            {label}
                        </Link>
                    ))}
                </nav>
            </header>
            <div style={bodyStyle} data-testid="messaging-page-body">
                <Suspense fallback={null}>
                    <MessagingTabBodyLazy tab={activeTab} />
                </Suspense>
            </div>
        </section>
    );
};

export default MessagingPage;
