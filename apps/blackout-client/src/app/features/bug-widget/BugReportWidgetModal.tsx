import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useAtomValue } from 'jotai';
import { Box, Button, Text, Switch } from 'folds';
import { userIdAtom } from '../../state/auth';
import { PortalModal } from '../../components/portal-modal/PortalModal';
import { useWidgetReportSubmission, type WidgetReportOutcome } from './useWidgetReportSubmission';
import {
  buildWidgetPayload,
  collectWidgetMetadata,
  emptyWidgetDraft,
  isWidgetDraftSubmittable,
  readWidgetDraftFromSession,
  writeWidgetDraftToSession,
  clearWidgetDraftFromSession,
  type WidgetReportAttachment,
  type WidgetReportDraft,
} from './widgetReportState';

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const panelStyle: CSSProperties = {
  width: 'min(560px, 92vw)',
  maxHeight: '88vh',
  overflow: 'auto',
  background: 'var(--bg-surface, #1e293b)',
  color: 'var(--text-primary, #f8fafc)',
  border: '1px solid var(--bg-surface-border, #334155)',
  borderRadius: 12,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const fieldStyle: CSSProperties = {
  width: '100%',
  background: 'var(--bg-input, #0f172a)',
  color: 'var(--text-primary, #f8fafc)',
  border: '1px solid var(--bg-surface-border, #334155)',
  borderRadius: 6,
  padding: 8,
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
};

const labelStyle: CSSProperties = { display: 'block', marginBottom: 4 };

type Phase =
  | { status: 'editing' }
  | { status: 'sending' }
  | { status: 'sent'; outcome: WidgetReportOutcome }
  | { status: 'rate_limited' }
  | { status: 'error'; message: string };

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });

export const BugReportWidgetModal = ({ onClose }: { onClose: () => void }) => {
  const userId = useAtomValue(userIdAtom);
  const submit = useWidgetReportSubmission();
  const [draft, setDraft] = useState<WidgetReportDraft>(
    () => readWidgetDraftFromSession() ?? emptyWidgetDraft(),
  );
  const [attachment, setAttachment] = useState<WidgetReportAttachment | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [includeReporterHash, setIncludeReporterHash] = useState(false);
  const [phase, setPhase] = useState<Phase>({ status: 'editing' });
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    descriptionRef.current?.focus();
  }, []);

  useEffect(() => {
    writeWidgetDraftToSession(draft);
  }, [draft]);

  const submittable = useMemo(
    () => isWidgetDraftSubmittable(draft) && phase.status !== 'sending',
    [draft, phase.status],
  );

  const handleSubmit = useCallback(async () => {
    if (!isWidgetDraftSubmittable(draft)) return;
    setPhase({ status: 'sending' });
    const payload = buildWidgetPayload({
      draft,
      metadata: collectWidgetMetadata(),
      attachment,
      matrixId: userId,
      includeReporterHash,
    });
    const result = await submit(payload);
    if (result.kind === 'ok') {
      clearWidgetDraftFromSession();
      setPhase({ status: 'sent', outcome: result.outcome });
    } else if (result.kind === 'rate_limited') {
      setPhase({ status: 'rate_limited' });
    } else {
      setPhase({ status: 'error', message: result.message });
    }
  }, [draft, attachment, userId, includeReporterHash, submit]);

  const onRootKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      // Cmd/Ctrl+Enter submits from anywhere in the form (plain Enter in a
      // textarea inserts a newline, so we require the modifier).
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && submittable) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [onClose, submittable, handleSubmit],
  );

  const onPickFile = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    setAttachmentError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setAttachment(null);
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachment(null);
      setAttachmentError('That file is larger than 8 MB — please attach something smaller.');
      return;
    }
    try {
      const base64 = await readFileAsBase64(file);
      setAttachment({ filename: file.name, contentType: file.type || 'application/octet-stream', base64 });
    } catch {
      setAttachmentError('Could not read that file.');
    }
  }, []);

  return (
    <PortalModal onClose={onClose} backdropTestId="bug-widget-backdrop">
      <div
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Report a problem"
        onKeyDown={onRootKeyDown}
      >
        {phase.status === 'sent' ? (
          <SentView outcome={phase.outcome} onClose={onClose} />
        ) : (
          <>
            <Text size="H4">Report a problem</Text>
            <Text size="T200" priority="300">
              Goes straight to the contributors’ #bugs room. Device and screen details are attached
              automatically.
            </Text>

            <div>
              <Text size="L400" as="label" style={labelStyle}>
                What went wrong? <span aria-hidden>*</span>
              </Text>
              <textarea
                ref={descriptionRef}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value.slice(0, 8_000) }))}
                rows={4}
                placeholder="When I clicked… I expected… instead…"
                style={fieldStyle}
                aria-label="What went wrong?"
              />
            </div>

            <div>
              <Text size="L400" as="label" style={labelStyle}>
                Steps to reproduce
              </Text>
              <textarea
                value={draft.steps}
                onChange={(e) => setDraft((d) => ({ ...d, steps: e.target.value.slice(0, 4_000) }))}
                rows={3}
                placeholder="1. Open a room  2. …"
                style={fieldStyle}
                aria-label="Steps to reproduce"
              />
            </div>

            <div>
              <Text size="L400" as="label" style={labelStyle}>
                Suggestions
              </Text>
              <textarea
                value={draft.suggestions}
                onChange={(e) => setDraft((d) => ({ ...d, suggestions: e.target.value.slice(0, 4_000) }))}
                rows={2}
                placeholder="How might we fix it?"
                style={fieldStyle}
                aria-label="Suggestions"
              />
            </div>

            <div>
              <Text size="L400" as="label" style={labelStyle}>
                Attach a screenshot or recording (optional)
              </Text>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={onPickFile}
                aria-label="Attach a screenshot or recording"
              />
              {attachment && (
                <Text size="T200" priority="300">
                  Attached: {attachment.filename}
                </Text>
              )}
              {attachmentError && (
                <Text size="T200" style={{ color: 'var(--color-critical, #f87171)' }}>
                  {attachmentError}
                </Text>
              )}
            </div>

            {userId && (
              <Box alignItems="Center" gap="200">
                <Switch
                  variant="Primary"
                  value={includeReporterHash}
                  onChange={setIncludeReporterHash}
                />
                <Text size="T200" priority="300">
                  Include a one-way hash of my ID so maintainers can follow up
                </Text>
              </Box>
            )}

            {phase.status === 'rate_limited' && (
              <Text size="T200" style={{ color: 'var(--color-warning, #fbbf24)' }}>
                You’re filing reports quickly — give it a minute before sending another. Your text is
                still here.
              </Text>
            )}
            {phase.status === 'error' && (
              <Text size="T200" style={{ color: 'var(--color-critical, #f87171)' }}>
                Couldn’t send: {phase.message}
              </Text>
            )}

            <Box gap="200" justifyContent="End">
              <Button variant="Secondary" size="300" radii="300" onClick={onClose}>
                <Text size="B300">Cancel</Text>
              </Button>
              <Button
                variant="Primary"
                size="300"
                radii="300"
                disabled={!submittable}
                onClick={() => void handleSubmit()}
              >
                <Text size="B300">{phase.status === 'sending' ? 'Sending…' : 'Send report'}</Text>
              </Button>
            </Box>
          </>
        )}
      </div>
    </PortalModal>
  );
};

const SentView = ({ outcome, onClose }: { outcome: WidgetReportOutcome; onClose: () => void }) => (
  <>
    <Text size="H4">Thanks — report received</Text>
    <Text size="T200" priority="300">
      {outcome.messageLink
        ? 'It’s posted in the contributors’ #bugs room with a triage thread.'
        : outcome.devNoop
          ? 'Your report was captured. (No #bugs room is configured in this environment.)'
          : 'Your report was filed for the team to triage.'}
    </Text>
    {outcome.messageLink && (
      <a
        href={outcome.messageLink}
        target="_blank"
        rel="noreferrer noopener"
        style={{ color: 'var(--accent-primary, #60a5fa)' }}
      >
        View in #bugs →
      </a>
    )}
    <Box justifyContent="End">
      <Button variant="Primary" size="300" radii="300" onClick={onClose}>
        <Text size="B300">Done</Text>
      </Button>
    </Box>
  </>
);

export default BugReportWidgetModal;
