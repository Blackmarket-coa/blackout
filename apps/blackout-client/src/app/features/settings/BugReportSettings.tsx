import React, { useMemo, useState, type ChangeEvent } from 'react';
import { useAtomValue } from 'jotai';
import { Box, Text, Switch, Button, Input, Scroll } from 'folds';
import { Page, PageContent, PageHeader } from '../../components/page';
import { SequenceCard } from '../../components/sequence-card';
import { SettingTile } from '../../components/setting-tile';
import { SequenceCardStyle } from './styles.css';
import { userIdAtom } from '../../state/auth';
import { collectDiagnostics } from '../../lib/diagnostics/collect';
import { trackSettingsInteraction } from './settingsTelemetry';
import {
  emptyDraft,
  buildBugReportPayload,
  isPayloadSubmittable,
  type BugReportCategory,
  type BugReportDraft,
  type BugReportSeverity,
} from './bugReportState';
import { useBugReportSubmission } from './useBugReportSubmission';
import { AsyncStatus } from '../../hooks/useAsyncCallback';

const CATEGORIES: ReadonlyArray<{ value: BugReportCategory; label: string }> = [
  { value: 'ui', label: 'UI / appearance' },
  { value: 'voice', label: 'Voice & video' },
  { value: 'matrix', label: 'Matrix / messaging' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'other', label: 'Other' },
];

const SEVERITIES: ReadonlyArray<{ value: BugReportSeverity; label: string }> = [
  { value: 'low', label: 'Low — minor annoyance' },
  { value: 'medium', label: 'Medium — workflow blocker' },
  { value: 'high', label: 'High — data loss or unusable' },
];

const SelectInline = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value as T)}
    style={{
      background: 'var(--bg-input)',
      color: 'var(--text-primary)',
      border: '1px solid var(--bg-surface-border)',
      borderRadius: 6,
      padding: '4px 8px',
    }}
  >
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

export function BugReportSettings() {
  const userId = useAtomValue(userIdAtom);
  const [draft, setDraft] = useState<BugReportDraft>(emptyDraft);
  const [showPreview, setShowPreview] = useState(false);
  const [state, submit] = useBugReportSubmission();

  const diagnostics = useMemo(
    () => (draft.includeDiagnostics ? collectDiagnostics() : null),
    [draft.includeDiagnostics],
  );

  const payload = useMemo(
    () => buildBugReportPayload({ draft, matrixId: userId, diagnostics }),
    [draft, userId, diagnostics],
  );

  const submittable = isPayloadSubmittable(payload) && state.status !== AsyncStatus.Loading;

  const handleSubmit = async () => {
    trackSettingsInteraction('bug-report', 'submit', payload.category);
    try {
      await submit(payload);
    } catch {
      // useAsyncCallback already routes the error into `state`.
    }
  };

  if (state.status === AsyncStatus.Success) {
    return <SuccessView response={state.data} payload={payload} onReset={() => setDraft(emptyDraft())} />;
  }

  return (
    <Page>
      <PageHeader outlined={false}>
        <Box grow="Yes" alignItems="Center" gap="200">
          <Text size="H3" truncate>Report a bug</Text>
        </Box>
      </PageHeader>

      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="500">
              <Text size="T200" priority="300">
                Your report is forwarded to our log receiver and, if configured, also filed as a
                public GitHub issue. Review the payload preview below before submitting — nothing
                is sent until you press Submit.
              </Text>

              <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
                <SettingTile title="Title">
                  <Input
                    radii="300"
                    size="300"
                    value={draft.title}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setDraft((d) => ({ ...d, title: e.target.value.slice(0, 140) }))
                    }
                    outlined
                    placeholder="Short summary — what's broken?"
                  />
                </SettingTile>
              </SequenceCard>

              <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
                <SettingTile
                  title="What happened?"
                  description="Markdown is supported. Include steps to reproduce if you can."
                >
                  <textarea
                    value={draft.description}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, description: e.target.value.slice(0, 8_000) }))
                    }
                    rows={8}
                    placeholder="When I clicked... I expected... instead..."
                    style={{
                      width: '100%',
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--bg-surface-border)',
                      borderRadius: 6,
                      padding: 8,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </SettingTile>
              </SequenceCard>

              <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
                <SettingTile
                  title="Category"
                  after={
                    <SelectInline
                      value={draft.category}
                      onChange={(v) => setDraft((d) => ({ ...d, category: v }))}
                      options={CATEGORIES}
                    />
                  }
                />
                <SettingTile
                  title="Severity"
                  after={
                    <SelectInline
                      value={draft.severity}
                      onChange={(v) => setDraft((d) => ({ ...d, severity: v }))}
                      options={SEVERITIES}
                    />
                  }
                />
              </SequenceCard>

              <SequenceCard className={SequenceCardStyle} variant="SurfaceVariant" direction="Column">
                <SettingTile
                  title="Include diagnostics"
                  description="Client version, OS, browser, and the last 50 console lines. Tokens and access keys are scrubbed automatically."
                  after={
                    <Switch
                      variant="Primary"
                      value={draft.includeDiagnostics}
                      onChange={(v) => setDraft((d) => ({ ...d, includeDiagnostics: v }))}
                    />
                  }
                />
                <SettingTile
                  title="Include a hash of my Matrix ID"
                  description={
                    userId
                      ? 'A one-way hash so maintainers can correlate multiple reports from the same person without learning who you are.'
                      : 'You’re not logged in, so there’s no ID to hash.'
                  }
                  after={
                    <Switch
                      variant="Primary"
                      value={draft.includeMatrixIdHash}
                      onChange={(v) => setDraft((d) => ({ ...d, includeMatrixIdHash: v }))}
                    />
                  }
                />
              </SequenceCard>

              <Box direction="Column" gap="200">
                <Button
                  variant="Secondary"
                  size="300"
                  radii="300"
                  onClick={() => setShowPreview((v) => !v)}
                >
                  <Text size="B300">
                    {showPreview ? 'Hide payload preview' : 'Preview payload (will be sent)'}
                  </Text>
                </Button>
                {showPreview && (
                  <pre
                    data-testid="payload-preview"
                    style={{
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      padding: 12,
                      borderRadius: 6,
                      maxHeight: 320,
                      overflow: 'auto',
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(payload, null, 2)}
                  </pre>
                )}
              </Box>

              {state.status === AsyncStatus.Error && (
                <Text size="T200" style={{ color: 'var(--color-critical, #c33)' }}>
                  Couldn’t submit: {state.error.message}
                </Text>
              )}

              <Box>
                <Button
                  variant="Primary"
                  size="400"
                  radii="300"
                  disabled={!submittable}
                  onClick={handleSubmit}
                >
                  <Text size="B400">
                    {state.status === AsyncStatus.Loading ? 'Submitting…' : 'Submit bug report'}
                  </Text>
                </Button>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
}

const SuccessView = ({
  response,
  payload,
  onReset,
}: {
  response: import('./useBugReportSubmission').BugReportResponse;
  payload: ReturnType<typeof buildBugReportPayload>;
  onReset: () => void;
}) => {
  const [showSent, setShowSent] = useState(false);

  const ghOk = response.issueUrl !== null;
  const rsOk = response.rageshakeId !== null || response.rageshakeError === null;
  const bothOk = ghOk && rsOk && !response.partial;

  return (
    <Page>
      <PageHeader outlined={false}>
        <Text size="H3" truncate>Report submitted</Text>
      </PageHeader>
      <Box grow="Yes">
        <Scroll hideTrack visibility="Hover">
          <PageContent>
            <Box direction="Column" gap="400">
              {bothOk && (
                <Text size="T300">
                  Thanks. Your report was filed and the diagnostic logs were attached.
                </Text>
              )}
              {response.partial && ghOk && (
                <Text size="T300">
                  Issue filed, but the log upload failed — maintainers can still triage from the
                  issue description. {response.rageshakeError ? `(rageshake error: ${response.rageshakeError})` : null}
                </Text>
              )}
              {response.partial && rsOk && !ghOk && (
                <Text size="T300">
                  Logs uploaded (id <code>{response.rageshakeId}</code>), but the public GitHub
                  issue could not be created. {response.issueError ?? ''}
                </Text>
              )}
              {!ghOk && !rsOk && (
                <Text size="T300">
                  Neither destination accepted the report. Please try again later.
                </Text>
              )}

              {response.issueUrl && (
                <Box>
                  <a
                    href={response.issueUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    Track on GitHub →
                  </a>
                </Box>
              )}

              <Box direction="Column" gap="200">
                <Button
                  variant="Secondary"
                  size="300"
                  radii="300"
                  onClick={() => setShowSent((v) => !v)}
                >
                  <Text size="B300">
                    {showSent ? 'Hide payload that was sent' : 'View payload that was sent'}
                  </Text>
                </Button>
                {showSent && (
                  <pre
                    style={{
                      background: 'var(--bg-input)',
                      color: 'var(--text-primary)',
                      padding: 12,
                      borderRadius: 6,
                      maxHeight: 320,
                      overflow: 'auto',
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {JSON.stringify(payload, null, 2)}
                  </pre>
                )}
              </Box>

              <Box>
                <Button variant="Secondary" size="300" radii="300" onClick={onReset}>
                  <Text size="B300">File another</Text>
                </Button>
              </Box>
            </Box>
          </PageContent>
        </Scroll>
      </Box>
    </Page>
  );
};

export default BugReportSettings;
