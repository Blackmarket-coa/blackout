import { useMemo, useState } from 'react';
import { BanListViewer } from './BanListViewer';
import { ProtectionStatus } from './ProtectionStatus';
import { useDraupnirClient, useDraupnirSnapshot, type DraupnirClientConfig } from './DraupnirClient';

export const ModDashboard = ({ config }: { config?: DraupnirClientConfig }) => {
  const draupnir = useDraupnirClient(config);
  const snapshot = useDraupnirSnapshot(config);

  const [banTarget, setBanTarget] = useState('');
  const [banReason, setBanReason] = useState('');
  const [kickTarget, setKickTarget] = useState('');
  const [redactEventId, setRedactEventId] = useState('');
  const [promptResponse, setPromptResponse] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const recentActions = useMemo(() => snapshot?.actions.slice(0, 12) ?? [], [snapshot]);

  const runCommand = async (label: string, command: string, args: string[]) => {
    if (!snapshot) return;

    setBusy(label);
    try {
      await draupnir.sendCommand(snapshot.roomId, command, args);
    } finally {
      setBusy(null);
    }
  };

  const sendPrompt = async () => {
    if (!snapshot || !promptResponse.trim()) return;
    setBusy('prompt');
    try {
      await draupnir.sendPromptResponse(snapshot.roomId, promptResponse.trim());
      setPromptResponse('');
    } finally {
      setBusy(null);
    }
  };

  if (!snapshot) {
    return <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Unable to locate Draupnir management room.</div>;
  }

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'grid', gap: 4 }}>
        <h2 style={{ margin: 0 }}>Draupnir Moderation Dashboard</h2>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Management room: <code>{snapshot.roomName || snapshot.roomId}</code>
        </div>
      </header>

      <div style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Raid status</strong>
        <span style={{ color: snapshot.raidActive ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: 600 }}>
          {snapshot.raidActive ? 'Active / Lockdown' : 'Normal'}
        </span>
      </div>

      <section style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
        <h3 style={{ margin: 0 }}>Quick Actions</h3>

        <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: 8, display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 13 }}>Ban user / server / pattern</strong>
            <input value={banTarget} onChange={(event) => setBanTarget(event.target.value)} placeholder="@user:server | bad.server | *spam*" />
            <input value={banReason} onChange={(event) => setBanReason(event.target.value)} placeholder="Reason" />
            <button
              type="button"
              disabled={busy === 'ban' || !banTarget.trim()}
              onClick={() => void runCommand('ban', 'ban', [banTarget.trim(), ...(banReason.trim() ? ['--reason', `"${banReason.trim()}"`] : [])])}
              style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--danger)', color: '#fff', padding: '4px 8px' }}
            >
              {busy === 'ban' ? 'Sending…' : 'Ban'}
            </button>
          </div>

          <div style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: 8, display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 13 }}>Kick user</strong>
            <input value={kickTarget} onChange={(event) => setKickTarget(event.target.value)} placeholder="@user:server" />
            <button
              type="button"
              disabled={busy === 'kick' || !kickTarget.trim()}
              onClick={() => void runCommand('kick', 'kick', [kickTarget.trim()])}
              style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)', padding: '4px 8px' }}
            >
              {busy === 'kick' ? 'Sending…' : 'Kick'}
            </button>
          </div>

          <div style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: 8, display: 'grid', gap: 6 }}>
            <strong style={{ fontSize: 13 }}>Redact message</strong>
            <input value={redactEventId} onChange={(event) => setRedactEventId(event.target.value)} placeholder="$eventId" />
            <button
              type="button"
              disabled={busy === 'redact' || !redactEventId.trim()}
              onClick={() => void runCommand('redact', 'redact', [redactEventId.trim()])}
              style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)', padding: '4px 8px' }}
            >
              {busy === 'redact' ? 'Sending…' : 'Redact'}
            </button>
          </div>
        </div>
      </section>

      {snapshot.prompts.length > 0 ? (
        <section style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Prompt Responses</h3>
          {snapshot.prompts.map((prompt) => (
            <div key={prompt.promptId} style={{ border: '1px solid var(--border-default)', borderRadius: 8, padding: 8, fontSize: 12 }}>
              <div>{prompt.promptText}</div>
              {prompt.options.length > 0 ? <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Options: {prompt.options.join(', ')}</div> : null}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={promptResponse}
              onChange={(event) => setPromptResponse(event.target.value)}
              placeholder="Reply value (e.g. 1)"
            />
            <button type="button" disabled={busy === 'prompt' || !promptResponse.trim()} onClick={() => void sendPrompt()}>
              {busy === 'prompt' ? 'Sending…' : 'Send'}
            </button>
          </div>
        </section>
      ) : null}

      <section style={{ border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden' }}>
        <header style={{ padding: 10, borderBottom: '1px solid var(--border-default)' }}>
          <h3 style={{ margin: 0 }}>Recent Actions Feed</h3>
        </header>
        {recentActions.length === 0 ? (
          <div style={{ padding: 10, fontSize: 12, color: 'var(--text-secondary)' }}>No actions parsed yet.</div>
        ) : (
          recentActions.map((action, index) => (
            <article key={action.eventId} style={{ padding: 10, borderTop: index === 0 ? 'none' : '1px solid var(--border-default)', display: 'grid', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{action.action}</strong>
                <time style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(action.timestamp).toLocaleString()}</time>
              </div>
              <div style={{ fontSize: 12 }}>
                {action.moderator}
                {action.target ? ` → ${action.target}` : ''}
              </div>
              {action.reason ? <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{action.reason}</div> : null}
            </article>
          ))
        )}
      </section>

      <ProtectionStatus config={config} />
      <BanListViewer config={config} />
    </section>
  );
};
