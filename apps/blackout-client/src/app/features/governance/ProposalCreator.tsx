import { useEffect, useMemo, useState } from 'react';
import {
    Badge,
    Button,
    Card,
    IconButton,
    Input,
    Select,
    Stack,
    TextArea,
} from '@blackout/ui/primitives';
import {
    useCreateProposal,
    type ProposalContent,
    type ProposalOption,
    type ProposalType,
} from './useProposals';
import { useDenPlaybook } from '../playbook/usePlaybook';

const defaultOptions = (type: ProposalType): ProposalOption[] => {
    if (type === 'consent') {
        // Consent proposals carry no options — the 🌱 / 🌾 / 🪨 reaction
        // palette is the choice space.
        return [];
    }
    if (type === 'binary') {
        return [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
        ];
    }

    return [
        { id: crypto.randomUUID(), label: 'Option A' },
        { id: crypto.randomUUID(), label: 'Option B' },
    ];
};

const defaultDraft = (initialType: ProposalType = 'binary'): ProposalContent => ({
    title: '',
    description: '',
    type: initialType,
    options: defaultOptions(initialType),
    quorum: 1,
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    eligibility: 'all',
    status: 'active',
});

const fieldLabelStyle = { display: 'grid', gap: 4, fontSize: 12 } as const;

export const ProposalCreator = ({
    roomId,
    onCreated,
}: {
    roomId: string;
    onCreated?: () => void;
}) => {
    const createProposal = useCreateProposal(roomId);
    const playbook = useDenPlaybook(roomId);
    // Playbooks with consent or consensus leadership default to consent
    // proposals — sociocratic primitives ship as the *default*, not as an
    // opt-in. Other playbooks keep the historical 'binary' default.
    const defaultType: ProposalType =
        playbook && (playbook.leadership === 'consent' || playbook.leadership === 'consensus')
            ? 'consent'
            : 'binary';

    const [draft, setDraft] = useState<ProposalContent>(() => defaultDraft(defaultType));
    const [touchedType, setTouchedType] = useState(false);
    const [preview, setPreview] = useState(false);
    const [saving, setSaving] = useState(false);

    // If the playbook loads after first render and the user hasn't picked a
    // type yet, re-seed the draft so the default reflects the den's culture.
    useEffect(() => {
        if (touchedType) return;
        setDraft((prev) => {
            if (prev.title.trim().length > 0 || prev.description.trim().length > 0) return prev;
            if (prev.type === defaultType) return prev;
            return { ...prev, type: defaultType, options: defaultOptions(defaultType) };
        });
    }, [defaultType, touchedType]);

    const canSubmit = useMemo(() => {
        const hasTitle = draft.title.trim().length > 0;
        const hasDeadline = Number.isFinite(Date.parse(draft.deadline));
        if (draft.type === 'consent') {
            return hasTitle && draft.quorum > 0 && hasDeadline;
        }
        const hasOptions =
            draft.options.length >= 2 &&
            draft.options.every((option) => option.label.trim().length > 0);
        return hasTitle && hasOptions && draft.quorum > 0 && hasDeadline;
    }, [draft.deadline, draft.options, draft.quorum, draft.title, draft.type]);

    const onChangeType = (type: ProposalType) => {
        setTouchedType(true);
        setDraft((prev) => ({
            ...prev,
            type,
            options: defaultOptions(type),
        }));
    };

    const submit = async () => {
        if (!canSubmit) return;

        setSaving(true);
        try {
            await createProposal(draft);
            setDraft(defaultDraft());
            setPreview(false);
            onCreated?.();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card style={{ display: 'grid', gap: 10 }}>
            <header
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
                <strong>Create Proposal</strong>
                <Button tone="neutral" size="sm" onClick={() => setPreview((prev) => !prev)}>
                    {preview ? 'Edit' : 'Preview'}
                </Button>
            </header>

            {preview ? (
                <Card style={{ display: 'grid', gap: 8 }}>
                    <h3 style={{ margin: 0 }}>{draft.title || 'Untitled proposal'}</h3>
                    <pre
                        style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            font: 'inherit',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        {draft.description || '(No description)'}
                    </pre>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Type: {draft.type}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Quorum: {draft.quorum}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Deadline: {new Date(draft.deadline).toLocaleString()}
                    </div>
                    <Stack direction="row" gap={6} style={{ flexWrap: 'wrap' }}>
                        {draft.options.map((option) => (
                            <Badge key={option.id}>{option.label}</Badge>
                        ))}
                    </Stack>
                </Card>
            ) : (
                <>
                    <Input
                        value={draft.title}
                        onChange={(event) =>
                            setDraft((prev) => ({ ...prev, title: event.target.value }))
                        }
                        placeholder="Proposal title"
                    />

                    <TextArea
                        value={draft.description}
                        onChange={(event) =>
                            setDraft((prev) => ({ ...prev, description: event.target.value }))
                        }
                        placeholder="Description (Markdown)"
                        rows={6}
                    />

                    <label style={fieldLabelStyle}>
                        Vote type
                        <Select
                            value={draft.type}
                            onChange={(event) => onChangeType(event.target.value as ProposalType)}
                        >
                            <option value="consent">Consent (🌱 / 🌾 / 🪨)</option>
                            <option value="binary">Binary</option>
                            <option value="multiple_choice">Multiple choice</option>
                            <option value="ranked">Ranked</option>
                        </Select>
                    </label>

                    {draft.type === 'consent' ? (
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
                            Consent proposals carry no options — the circle reacts with{' '}
                            <span aria-hidden>🌱 / 🌾 / 🪨</span> and concerns or objections open
                            inline. Any paramount objection blocks until resolved.
                        </p>
                    ) : (
                        <div style={{ display: 'grid', gap: 6 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                    Options
                                </span>
                                {draft.type !== 'binary' ? (
                                    <Button
                                        tone="neutral"
                                        size="sm"
                                        onClick={() =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                options: [
                                                    ...prev.options,
                                                    {
                                                        id: crypto.randomUUID(),
                                                        label: `Option ${prev.options.length + 1}`,
                                                    },
                                                ],
                                            }))
                                        }
                                    >
                                        Add option
                                    </Button>
                                ) : null}
                            </div>

                            {draft.options.map((option, index) => (
                                <div
                                    key={option.id}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr auto auto auto',
                                        gap: 6,
                                    }}
                                >
                                    <Input
                                        value={option.label}
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            setDraft((prev) => {
                                                const options = [...prev.options];
                                                options[index] = {
                                                    ...options[index],
                                                    label: value,
                                                };
                                                return { ...prev, options };
                                            });
                                        }}
                                    />
                                    <IconButton
                                        size="sm"
                                        aria-label={`Move ${option.label} up`}
                                        onClick={() => {
                                            if (index === 0) return;
                                            setDraft((prev) => {
                                                const options = [...prev.options];
                                                const [moved] = options.splice(index, 1);
                                                options.splice(index - 1, 0, moved);
                                                return { ...prev, options };
                                            });
                                        }}
                                    >
                                        ↑
                                    </IconButton>
                                    <IconButton
                                        size="sm"
                                        aria-label={`Move ${option.label} down`}
                                        onClick={() => {
                                            if (index >= draft.options.length - 1) return;
                                            setDraft((prev) => {
                                                const options = [...prev.options];
                                                const [moved] = options.splice(index, 1);
                                                options.splice(index + 1, 0, moved);
                                                return { ...prev, options };
                                            });
                                        }}
                                    >
                                        ↓
                                    </IconButton>
                                    <Button
                                        tone="danger"
                                        size="sm"
                                        aria-label={`Remove ${option.label}`}
                                        disabled={
                                            draft.type === 'binary' || draft.options.length <= 2
                                        }
                                        onClick={() => {
                                            setDraft((prev) => ({
                                                ...prev,
                                                options: prev.options.filter(
                                                    (candidate) => candidate.id !== option.id
                                                ),
                                            }));
                                        }}
                                    >
                                        ✕
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: 8,
                        }}
                    >
                        <label style={fieldLabelStyle}>
                            Quorum
                            <Input
                                type="number"
                                min={1}
                                value={draft.quorum}
                                onChange={(event) =>
                                    setDraft((prev) => ({
                                        ...prev,
                                        quorum: Number(event.target.value) || 1,
                                    }))
                                }
                            />
                        </label>

                        <label style={fieldLabelStyle}>
                            Deadline
                            <Input
                                type="datetime-local"
                                value={draft.deadline.slice(0, 16)}
                                onChange={(event) =>
                                    setDraft((prev) => ({
                                        ...prev,
                                        deadline: new Date(event.target.value).toISOString(),
                                    }))
                                }
                            />
                        </label>

                        <label style={fieldLabelStyle}>
                            Eligibility
                            <Select
                                value={draft.eligibility}
                                onChange={(event) =>
                                    setDraft((prev) => ({
                                        ...prev,
                                        eligibility: event.target
                                            .value as ProposalContent['eligibility'],
                                    }))
                                }
                            >
                                <option value="all">All members</option>
                                <option value="role:Moderator">Role: Moderator</option>
                                <option value="role:Admin">Role: Admin</option>
                                <option value="power:50+">Power: 50+</option>
                            </Select>
                        </label>
                    </div>
                </>
            )}

            <footer style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                    tone="primary"
                    loading={saving}
                    disabled={!canSubmit || saving}
                    onClick={() => void submit()}
                >
                    {saving ? 'Submitting…' : 'Submit proposal'}
                </Button>
            </footer>
        </Card>
    );
};

export default ProposalCreator;
