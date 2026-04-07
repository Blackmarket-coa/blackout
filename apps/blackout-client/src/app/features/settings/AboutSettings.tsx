const version = import.meta.env?.VITE_APP_VERSION ?? '0.1.0';
const channel = import.meta.env?.VITE_BUILD_CHANNEL ?? 'production';
const buildSha = import.meta.env?.VITE_BUILD_SHA ?? 'local';

const links = [
    { label: 'Support Center', href: 'https://blackoutchat.example/support' },
    { label: 'Status Page', href: 'https://blackoutchat.example/status' },
    { label: 'Contact Email', href: 'mailto:support@blackoutchat.example' },
];

const AboutSettings = () => (
    <section style={{ display: 'grid', gap: 16 }}>
        <header>
            <h3 style={{ marginBottom: 6 }}>About</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                Build information and official support channels.
            </p>
        </header>

        <div style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: 12 }}>
            <div>
                <strong>Version:</strong> <code>{version}</code>
            </div>
            <div>
                <strong>Build channel:</strong> <code>{channel}</code>
            </div>
            <div>
                <strong>Build ID:</strong> <code>{buildSha}</code>
            </div>
        </div>

        <section>
            <h4 style={{ marginTop: 0, marginBottom: 8 }}>Support</h4>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
                {links.map((link) => (
                    <li key={link.href}>
                        <a href={link.href} target="_blank" rel="noreferrer">
                            {link.label}
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    </section>
);

export default AboutSettings;
