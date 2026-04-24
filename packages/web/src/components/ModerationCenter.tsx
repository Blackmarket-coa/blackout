import React, { useEffect, useMemo, useState } from 'react';
import {
  applyDraupnirPolicy,
  buildDraupnirPolicyPreview,
  loadIncidentTimeline,
  loadModerationSettings,
  moderationPresets,
  runQuickAction,
  type IncidentEntry,
  type ModerationPresetId,
  type ModerationSettings,
  type QuickAction,
  type ReasonCode,
} from '../lib/moderation';

const DEFAULT_REASON: ReasonCode = 'spam';

export function ModerationCenter({ communityId = 'main', actorId = 'mod-1' }: { communityId?: string; actorId?: string }) {
  const [draft, setDraft] = useState<ModerationSettings | null>(null);
  const [saved, setSaved] = useState<ModerationSettings | null>(null);
  const [timeline, setTimeline] = useState<IncidentEntry[]>([]);
  const [status, setStatus] = useState<string>('');
  const [reasonCode, setReasonCode] = useState<ReasonCode>(DEFAULT_REASON);
  const [reasonText, setReasonText] = useState('');
  const [targetId, setTargetId] = useState('demo-user');

  useEffect(() => {
    loadModerationSettings().then((settings) => {
      setDraft(settings);
      setSaved(settings);
    });
    void refreshTimeline();
  }, []);

  async function refreshTimeline() {
    setTimeline(await loadIncidentTimeline());
  }

  const preview = useMemo(() => (draft ? buildDraupnirPolicyPreview(draft) : null), [draft]);

  async function savePolicy() {
    if (!draft) return;
    await applyDraupnirPolicy(draft, actorId);
    setSaved(draft);
    setStatus('Saved policy to Draupnir rule APIs.');
    await refreshTimeline();
  }

  async function handleQuickAction(action: QuickAction) {
    if (!reasonText.trim()) {
      setStatus('Add a reason before running quick actions.');
      return;
    }

    await runQuickAction({
      communityId,
      actorId,
      targetId,
      action,
      reasonCode,
      reasonText,
    });

    setStatus(`${action} executed for ${targetId}.`);
    await refreshTimeline();
  }

  function applyPreset(id: ModerationPresetId) {
    setDraft({ ...moderationPresets[id].settings });
    setStatus(`Applied ${moderationPresets[id].label} template in preview.`);
  }

  if (!draft) return <section><h2>Moderation Center</h2><p>Loading...</p></section>;

  return (
    <section style={{ borderTop: '1px solid #2b2b2b', marginTop: 24, paddingTop: 16 }}>
      <h2>Moderation Center</h2>
      <p>Preview-before-save is enabled. Changes are staged until you click Save policy.</p>
      {status ? <p>{status}</p> : null}

      <h3>Preset templates</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(Object.keys(moderationPresets) as ModerationPresetId[]).map((presetId) => (
          <button key={presetId} onClick={() => applyPreset(presetId)}>
            {moderationPresets[presetId].label}
          </button>
        ))}
      </div>

      <h3>Common controls</h3>
      <label>
        Banned words (comma-separated):
        <input
          value={draft.bannedWords.join(', ')}
          onChange={(event) => setDraft({ ...draft, bannedWords: event.target.value.split(',').map((word) => word.trim()).filter(Boolean) })}
          style={{ marginLeft: 8, width: 420 }}
        />
      </label>
      <div>
        <label><input type="checkbox" checked={draft.blockLinks} onChange={(event) => setDraft({ ...draft, blockLinks: event.target.checked })} /> Block links</label>
      </div>
      <div>
        <label><input type="checkbox" checked={draft.allowMediaUploads} onChange={(event) => setDraft({ ...draft, allowMediaUploads: event.target.checked })} /> Allow media uploads</label>
      </div>
      <div>
        <label><input type="checkbox" checked={draft.raidProtectionEnabled} onChange={(event) => setDraft({ ...draft, raidProtectionEnabled: event.target.checked })} /> Enable raid protection</label>
      </div>
      <label>
        Raid join threshold per minute:
        <input type="number" min={1} value={draft.raidJoinThreshold} onChange={(event) => setDraft({ ...draft, raidJoinThreshold: Number(event.target.value) || 1 })} style={{ marginLeft: 8, width: 90 }} />
      </label>
      <div>
        <label>
          Slow mode (seconds):
          <input type="number" min={0} value={draft.slowModeSeconds} onChange={(event) => setDraft({ ...draft, slowModeSeconds: Number(event.target.value) || 0 })} style={{ marginLeft: 8, width: 90 }} />
        </label>
      </div>
      <label>
        Join gating:
        <select value={draft.joinGating} onChange={(event) => setDraft({ ...draft, joinGating: event.target.value as ModerationSettings['joinGating'] })} style={{ marginLeft: 8 }}>
          <option value="none">None</option>
          <option value="captcha">Captcha</option>
          <option value="account_age">Account age check</option>
          <option value="invite_only">Invite only</option>
        </select>
      </label>

      <h3>Policy preview (Draupnir API payload)</h3>
      <pre style={{ maxHeight: 180, overflow: 'auto', background: '#101010', padding: 12 }}>{JSON.stringify(preview, null, 2)}</pre>
      <button onClick={() => void savePolicy()}>Save policy</button>
      {saved ? <p>Last saved slow mode: {saved.slowModeSeconds}s</p> : null}

      <h3>Quick actions</h3>
      <label>
        Target user:
        <input value={targetId} onChange={(event) => setTargetId(event.target.value)} style={{ marginLeft: 8 }} />
      </label>
      <label style={{ marginLeft: 12 }}>
        Reason code:
        <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value as ReasonCode)} style={{ marginLeft: 8 }}>
          <option value="spam">spam</option>
          <option value="harassment">harassment</option>
          <option value="illegal_content">illegal_content</option>
          <option value="evasion">evasion</option>
          <option value="other">other</option>
        </select>
      </label>
      <div>
        <input placeholder="Moderator note" value={reasonText} onChange={(event) => setReasonText(event.target.value)} style={{ width: 380 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {(['warn', 'timeout', 'mute', 'ban', 'redact'] as QuickAction[]).map((action) => (
          <button key={action} onClick={() => void handleQuickAction(action)}>{action}</button>
        ))}
      </div>

      <h3>Incident timeline / audit log</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {timeline.map((entry) => (
          <li key={entry.id} style={{ border: '1px solid #3b3b3b', borderRadius: 8, marginTop: 8, padding: 8 }}>
            <strong>{entry.action}</strong> → {entry.targetId}
            <div>{entry.summary}</div>
            <small>
              {new Date(entry.timestamp).toLocaleString()} · actor {entry.actorId} · trigger {entry.triggerType}
              {entry.triggerRuleId ? ` · rule ${entry.triggerRuleId}` : ''}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
