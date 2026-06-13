import { useMeshFeatures } from './useMeshFeatures';

type MeshTransportSettingsProps = {
    requestClose?: () => void;
};

const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 10,
    padding: 10,
};

/**
 * Mesh / offline-transport surface (OSS-manifest group G6). Enterprise-tier
 * store-and-forward peer sync over local transports. First-party greenfield
 * gossip — no Briar/Bramble code (GPLv3, reference-only). Default-off behind the
 * `meshTransport` flag; the relay never inspects message payloads.
 */
export function MeshTransportSettings({ requestClose }: MeshTransportSettingsProps = {}) {
    const mesh = useMeshFeatures();

    return (
        <section style={{ display: 'grid', gap: 12 }} data-testid="feature-toggle-mesh-transport">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0 }}>Mesh · Offline transport</h3>
                {requestClose ? (
                    <button type="button" onClick={requestClose}>
                        Close
                    </button>
                ) : null}
            </div>

            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13 }}>
                Store-and-forward peer sync over local transports for when the homeserver is
                unreachable. Messages stay end-to-end encrypted; relays never read them. Bounded by
                a TTL and hop cap. Enterprise tier (current plan: {mesh.tier}).
            </p>

            <div style={sectionStyle}>
                <dl
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'max-content 1fr',
                        gap: '4px 12px',
                        margin: 0,
                    }}
                >
                    <dt style={{ color: 'var(--text-secondary)' }}>Store-and-forward</dt>
                    <dd style={{ margin: 0 }} data-testid="mesh-store-forward-state">
                        {mesh.storeForward ? 'Available' : 'Enterprise tier'}
                    </dd>
                    <dt style={{ color: 'var(--text-secondary)' }}>Peer sync</dt>
                    <dd style={{ margin: 0 }} data-testid="mesh-peer-sync-state">
                        {mesh.peerSync ? 'Available' : 'Enterprise tier'}
                    </dd>
                </dl>
            </div>
        </section>
    );
}

export default MeshTransportSettings;
