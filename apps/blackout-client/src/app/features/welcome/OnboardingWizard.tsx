import { useEffect, useMemo, useState } from 'react';
import { useOnboardingCompletion, useOnboardingContent } from './useWelcome';

export const OnboardingWizard = ({
  spaceId,
  open,
  onClose,
  onComplete,
}: {
  spaceId: string;
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}) => {
  const onboarding = useOnboardingContent(spaceId);
  const completion = useOnboardingCompletion(spaceId);

  const [stepIndex, setStepIndex] = useState(0);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);

  const steps = onboarding.data.steps;
  const totalSteps = steps.length;
  const activeStep = steps[stepIndex];

  useEffect(() => {
    if (!open || !onboarding.data.enabled) return;

    let mounted = true;
    void completion.readCompletion().then((done) => {
      if (!mounted || !done) return;
      setCompleted(true);
      onComplete?.();
    });

    return () => {
      mounted = false;
    };
  }, [completion, onboarding.data.enabled, onComplete, open]);

  const canProceed = useMemo(() => {
    if (!activeStep) return true;

    if (activeStep.type === 'rules' && activeStep.requireAccept) {
      return rulesAccepted;
    }

    return true;
  }, [activeStep, rulesAccepted]);

  if (!open || !onboarding.data.enabled || completed) return null;

  const finish = async () => {
    await completion.markCompleted();
    setCompleted(true);
    onComplete?.();
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 70 }} onClick={onClose}>
      <div
        style={{ width: 720, maxWidth: '95vw', margin: '8vh auto', border: '1px solid var(--border-default)', borderRadius: 14, background: 'var(--bg-surface)', padding: 14, display: 'grid', gap: 10 }}
        onClick={(event) => event.stopPropagation()}
      >
        <header style={{ display: 'grid', gap: 4 }}>
          <strong>Onboarding</strong>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Step {Math.min(stepIndex + 1, totalSteps + 1)} of {totalSteps + 1}</span>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--bg-input)', overflow: 'hidden' }}>
            <div style={{ width: `${((stepIndex + 1) / (totalSteps + 1)) * 100}%`, height: '100%', background: 'var(--accent-primary)' }} />
          </div>
        </header>

        {activeStep ? (
          <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 12, background: 'var(--bg-input)' }}>
            <h3 style={{ marginTop: 0 }}>{activeStep.title}</h3>

            {activeStep.type === 'rules' ? (
              <>
                <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{activeStep.content}</div>
                {activeStep.requireAccept ? (
                  <label style={{ display: 'inline-flex', marginTop: 10, gap: 6 }}>
                    <input type="checkbox" checked={rulesAccepted} onChange={(event) => setRulesAccepted(event.target.checked)} />
                    I accept the rules.
                  </label>
                ) : null}
              </>
            ) : null}

            {activeStep.type === 'roles' ? (
              <>
                <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>{activeStep.description}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(activeStep.roles ?? []).map((role) => {
                    const selected = selectedRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => {
                          setSelectedRoles((prev) => (selected ? prev.filter((item) => item !== role) : [...prev, role]));
                        }}
                        style={{ border: '1px solid var(--border-default)', borderRadius: 999, background: selected ? 'var(--accent-muted)' : 'var(--bg-surface)', color: 'var(--text-primary)', padding: '3px 10px', fontSize: 12 }}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {activeStep.type === 'channels' ? (
              <>
                <p style={{ marginTop: 0, color: 'var(--text-secondary)' }}>{activeStep.description}</p>
                <div style={{ display: 'grid', gap: 6 }}>
                  {(activeStep.channels ?? []).map((channel) => {
                    const selected = selectedChannels.includes(channel);
                    return (
                      <label key={channel} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            setSelectedChannels((prev) =>
                              event.target.checked
                                ? [...prev, channel]
                                : prev.filter((item) => item !== channel),
                            );
                          }}
                        />
                        <span>{channel}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : null}
          </section>
        ) : (
          <section style={{ border: '1px solid var(--border-default)', borderRadius: 12, padding: 16, background: 'var(--bg-input)' }}>
            <h3 style={{ marginTop: 0 }}>You're all set!</h3>
            <p style={{ marginBottom: 0, color: 'var(--text-secondary)' }}>Enjoy the space and jump into the conversation.</p>
          </section>
        )}

        <footer style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button
            type="button"
            onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
            disabled={stepIndex === 0}
            style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--text-primary)', padding: '6px 10px' }}
          >
            Back
          </button>

          {stepIndex < totalSteps ? (
            <button
              type="button"
              onClick={() => setStepIndex((prev) => prev + 1)}
              disabled={!canProceed}
              style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--accent-primary)', color: 'var(--bg-surface)', padding: '6px 10px' }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void finish()}
              style={{ border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--accent-primary)', color: 'var(--bg-surface)', padding: '6px 10px' }}
            >
              Complete
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default OnboardingWizard;
