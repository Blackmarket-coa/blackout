import { createElement, useState, type FormEvent } from 'react';
import { tipsApi, formatCents, type TipContextKind, type Tip } from '../monetizationApi';
import { readBlackoutApiToken } from '../marketplace/useMarketplaceAuth';

interface TipButtonProps {
    /** User receiving the tip. */
    recipientUserId: string;
    /** Display name for the recipient (used in confirmation copy). */
    recipientLabel?: string;
    /** What the tip is attached to — drives the analytics context. */
    contextKind: TipContextKind;
    /** Optional reference id for the context (streamId, postId, channelMessageId). */
    contextRef?: string;
    /** Pre-set quick amounts in cents. */
    quickAmounts?: number[];
    /** Force-collapse to a button-only render (popover opens on click). */
    compact?: boolean;
    /** Notified after a tip is created so callers can refresh chat / dashboards. */
    onTipCreated?: (tip: Tip) => void;
}

const DEFAULT_QUICK_AMOUNTS = [100, 250, 500, 1000, 2500];
const MIN_TIP_CENTS = 100;

const buttonStyle = {
    padding: '6px 14px',
    borderRadius: 999,
    border: '1px solid var(--border-default)',
    background: 'var(--bg-accent)',
    color: 'var(--text-on-accent)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};

const popoverStyle: Record<string, string | number> = {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    width: 280,
    border: '1px solid var(--border-default)',
    borderRadius: 12,
    background: 'var(--bg-surface)',
    padding: 12,
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
    zIndex: 20,
    display: 'grid',
    gap: 10,
};

const chipStyle = (active: boolean): Record<string, string | number> => ({
    padding: '4px 8px',
    borderRadius: 999,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
    background: active ? 'var(--bg-accent)' : 'var(--bg-input)',
    color: active ? 'var(--text-on-accent)' : 'var(--text-primary)',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: active ? 600 : 500,
});

const inputStyle = {
    padding: '6px 8px',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    fontSize: 12,
    width: '100%',
    boxSizing: 'border-box' as const,
};

export function TipButton({
    recipientUserId,
    recipientLabel,
    contextKind,
    contextRef,
    quickAmounts = DEFAULT_QUICK_AMOUNTS,
    compact = false,
    onTipCreated,
}: TipButtonProps) {
    const [open, setOpen] = useState(false);
    const [amountCents, setAmountCents] = useState<number>(quickAmounts[0] ?? MIN_TIP_CENTS);
    const [customCents, setCustomCents] = useState<string>('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<string | null>(null);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setError(null);
        setConfirmation(null);
        const finalCents = customCents ? Math.floor(Number(customCents) * 100) : amountCents;
        if (!Number.isFinite(finalCents) || finalCents < MIN_TIP_CENTS) {
            setError(`Tip must be at least ${formatCents(MIN_TIP_CENTS)}`);
            return;
        }
        setSubmitting(true);
        try {
            const token = readBlackoutApiToken();
            const { tip } = await tipsApi.create(
                {
                    recipientUserId,
                    contextKind,
                    contextRef,
                    grossCents: finalCents,
                    currency: 'USD',
                    note: note || undefined,
                },
                token
            );
            const display = formatCents(finalCents);
            setConfirmation(
                `Sent ${display}${recipientLabel ? ` to ${recipientLabel}` : ''} — they'll receive ${formatCents(tip.netCents)} after the 3% platform fee.`
            );
            setNote('');
            setCustomCents('');
            onTipCreated?.(tip);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Could not send tip. Please try again.'
            );
        } finally {
            setSubmitting(false);
        }
    }

    return createElement(
        'div',
        { style: { position: 'relative', display: 'inline-block' } },
        createElement(
            'button',
            {
                type: 'button',
                style: buttonStyle,
                onClick: () => setOpen((v) => !v),
                'aria-haspopup': 'dialog',
                'aria-expanded': open,
                'data-testid': 'tip-button',
            },
            compact ? '$ Tip' : 'Send a tip'
        ),
        open
            ? createElement(
                  'form',
                  {
                      style: popoverStyle,
                      onSubmit: submit,
                      role: 'dialog',
                      'aria-label': 'Send tip',
                  },
                  createElement(
                      'div',
                      { style: { fontSize: 13, fontWeight: 600 } },
                      recipientLabel ? `Tip ${recipientLabel}` : 'Send a tip'
                  ),
                  createElement(
                      'div',
                      { style: { fontSize: 11, color: 'var(--text-secondary)' } },
                      'FreeBlackMarket takes a flat 3%. The rest goes straight to the recipient.'
                  ),
                  createElement(
                      'div',
                      { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                      ...quickAmounts.map((cents) =>
                          createElement(
                              'button',
                              {
                                  type: 'button',
                                  key: cents,
                                  style: chipStyle(amountCents === cents && !customCents),
                                  onClick: () => {
                                      setAmountCents(cents);
                                      setCustomCents('');
                                  },
                              },
                              formatCents(cents)
                          )
                      )
                  ),
                  createElement(
                      'label',
                      { style: { display: 'grid', gap: 4, fontSize: 11 } },
                      'Custom amount ($)',
                      createElement('input', {
                          type: 'number',
                          step: '0.01',
                          min: '1',
                          value: customCents,
                          placeholder: '5.00',
                          style: inputStyle,
                          onChange: (e: { currentTarget: { value: string } }) =>
                              setCustomCents(e.currentTarget.value),
                      })
                  ),
                  createElement(
                      'label',
                      { style: { display: 'grid', gap: 4, fontSize: 11 } },
                      'Note (optional)',
                      createElement('input', {
                          type: 'text',
                          maxLength: 280,
                          value: note,
                          placeholder: 'Great work!',
                          style: inputStyle,
                          onChange: (e: { currentTarget: { value: string } }) =>
                              setNote(e.currentTarget.value),
                      })
                  ),
                  error
                      ? createElement(
                            'div',
                            { style: { fontSize: 11, color: 'var(--text-danger)' } },
                            error
                        )
                      : null,
                  confirmation
                      ? createElement(
                            'div',
                            { style: { fontSize: 11, color: 'var(--text-success)' } },
                            confirmation
                        )
                      : null,
                  createElement(
                      'div',
                      { style: { display: 'flex', justifyContent: 'flex-end', gap: 6 } },
                      createElement(
                          'button',
                          {
                              type: 'button',
                              style: { ...buttonStyle, background: 'var(--bg-input)', color: 'var(--text-primary)' },
                              onClick: () => setOpen(false),
                          },
                          'Close'
                      ),
                      createElement(
                          'button',
                          {
                              type: 'submit',
                              style: buttonStyle,
                              disabled: submitting,
                          },
                          submitting ? 'Sending…' : 'Send tip'
                      )
                  )
              )
            : null
    );
}
