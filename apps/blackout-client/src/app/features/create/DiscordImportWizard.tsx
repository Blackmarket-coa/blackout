import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { useMatrixClient } from '../../hooks/useMatrixClient';
import { buildCommunitiesPath, CREATE_PATH } from '../../pages/paths';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';
import type { DenKind } from '../canopy/denKind';
import {
    DiscordStructureError,
    countPlanItems,
    parseDiscordStructure,
    type DenPlan,
    type ImportPlan,
} from './discordStructure';
import {
    runDiscordImport,
    type DiscordImportReport,
    type ImportProgress,
} from './runDiscordImport';

// Same glyphs the canopy channel sidebar uses for den kinds
// (`features/canopy/CanopyChannelSidebar.tsx`), so the preview tree reads the
// same as the sidebar the import will produce.
const KIND_GLYPHS: Record<DenKind, string> = {
    text: '💬',
    voice: '🔊',
    forum: '📋',
    stage: '🎤',
    announcement: '📢',
};

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
    gap: 4,
};

const titleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 700 };
const mutedStyle: CSSProperties = {
    margin: 0,
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 13,
    lineHeight: 1.5,
};

const bodyStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: '8px 20px 24px',
    maxWidth: 760,
};

const panelStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 16,
    border: '1px solid var(--border-default, #374151)',
    borderRadius: 12,
    background: 'var(--bg-input, #111827)',
};

const panelTitleStyle: CSSProperties = { margin: 0, fontSize: 15, fontWeight: 600 };

const textareaStyle: CSSProperties = {
    width: '100%',
    minHeight: 140,
    resize: 'vertical',
    padding: 10,
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-surface, #0f172a)',
    color: 'inherit',
    font: 'inherit',
    fontSize: 12,
    fontFamily: 'monospace',
};

const inputStyle: CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-surface, #0f172a)',
    color: 'inherit',
    font: 'inherit',
    fontSize: 14,
};

const buttonStyle: CSSProperties = {
    alignSelf: 'flex-start',
    padding: '8px 14px',
    borderRadius: 8,
    border: '1px solid var(--border-default, #374151)',
    background: 'var(--bg-surface-hover, #1f2937)',
    color: 'inherit',
    font: 'inherit',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
};

const errorStyle: CSSProperties = {
    margin: 0,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--critical-main, #b91c1c)',
    color: 'var(--critical-main, #fca5a5)',
    fontSize: 13,
};

const treeListStyle: CSSProperties = {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: 13,
};

const denRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    paddingLeft: 18,
};

const categoryRowStyle: CSSProperties = {
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontSize: 12,
    color: 'var(--text-muted, #9ca3af)',
    marginTop: 6,
};

const kindTagStyle: CSSProperties = {
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 11,
};

const topicStyle: CSSProperties = {
    color: 'var(--text-muted, #9ca3af)',
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

type Phase = 'input' | 'preview' | 'running' | 'done';

const errorText = (error: unknown): string => {
    if (error instanceof DiscordStructureError) return error.message;
    if (error instanceof Error) return error.message;
    return String(error);
};

const DenRow = ({ den }: { den: DenPlan }): JSX.Element => (
    <li style={denRowStyle}>
        <span aria-hidden>{KIND_GLYPHS[den.kind]}</span>
        <span>{den.name}</span>
        <span style={kindTagStyle}>{den.kind}</span>
        {den.topic ? <span style={topicStyle}>— {den.topic}</span> : null}
    </li>
);

/**
 * Discord structure importer at `/create/import`.
 *
 * Paste (or load from a .json file) the response of Discord's
 * "Get Guild Channels" API, preview the mapped canopy structure, then create
 * it den-by-den via the Matrix SDK. Structure only: categories, channels,
 * channel kinds, and topics. Roles and members are NOT imported — Discord
 * user ids are not Matrix ids.
 */
export const DiscordImportWizard = (): JSX.Element => {
    const mx = useMatrixClient();
    const [rawJson, setRawJson] = useState('');
    const [phase, setPhase] = useState<Phase>('input');
    const [plan, setPlan] = useState<ImportPlan | null>(null);
    const [canopyName, setCanopyName] = useState('');
    const [parseError, setParseError] = useState<string | null>(null);
    const [runError, setRunError] = useState<string | null>(null);
    const [progress, setProgress] = useState<ImportProgress[]>([]);
    const [report, setReport] = useState<DiscordImportReport | null>(null);
    // Guards the async import callbacks against setState-after-unmount when
    // the user navigates away mid-run (same intent as `hooks/useAlive`).
    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    const preview = (text: string): void => {
        setRunError(null);
        setReport(null);
        setProgress([]);
        try {
            const parsed = parseDiscordStructure(text);
            setPlan(parsed);
            setCanopyName(parsed.canopyName);
            setParseError(null);
            setPhase('preview');
        } catch (error) {
            setPlan(null);
            setParseError(errorText(error));
            setPhase('input');
        }
    };

    const handleFile = (event: ChangeEvent<HTMLInputElement>): void => {
        const file = event.target.files?.[0];
        if (!file) return;
        void file
            .text()
            .then((text) => {
                setRawJson(text);
                preview(text);
            })
            .catch((error: unknown) => {
                setParseError(`Could not read the file: ${errorText(error)}`);
            });
    };

    const handleImport = (): void => {
        if (!plan || phase === 'running') return;
        const effectivePlan: ImportPlan = {
            ...plan,
            canopyName: canopyName.trim() || plan.canopyName,
        };
        setPhase('running');
        setRunError(null);
        setReport(null);
        setProgress([]);
        runDiscordImport(mx, effectivePlan, (event) => {
            if (!aliveRef.current) return;
            setProgress((previous) => {
                const next = [...previous];
                next[event.itemIndex] = event;
                return next;
            });
        })
            .then((result) => {
                if (!aliveRef.current) return;
                setReport(result);
                setPhase('done');
            })
            .catch((error: unknown) => {
                if (!aliveRef.current) return;
                setRunError(errorText(error));
                setPhase('preview');
            });
    };

    const reset = (): void => {
        setPhase('input');
        setPlan(null);
        setReport(null);
        setProgress([]);
        setParseError(null);
        setRunError(null);
        setRawJson('');
        setCanopyName('');
    };

    const busy = phase === 'running';
    const totalItems = plan ? countPlanItems(plan) : 0;

    return (
        <section
            style={layoutStyle}
            data-shell-region="create-import"
            data-testid="discord-import-wizard"
        >
            <header style={headerStyle}>
                <h1 style={titleStyle}>Import from Discord</h1>
                <p style={mutedStyle}>
                    Rebuild a Discord server as a {BLACKOUT_TERMS.canopy.singular}. Structure only —
                    categories, channels, channel kinds, and topics. Roles and members are not
                    imported: Discord user ids aren&apos;t Matrix ids, so people join the new{' '}
                    {BLACKOUT_TERMS.canopy.singular} themselves.
                </p>
                <p style={mutedStyle}>
                    <Link to={CREATE_PATH} style={{ color: 'inherit' }}>
                        ← Back to Create
                    </Link>
                </p>
            </header>
            <div style={bodyStyle}>
                <div style={panelStyle}>
                    <h2 style={panelTitleStyle}>1. Paste the channel list</h2>
                    <p style={mutedStyle}>
                        Paste the JSON response of Discord&apos;s &quot;Get Guild Channels&quot; API
                        (GET /guilds/&#123;guild.id&#125;/channels), or an export saved as a .json
                        file. A wrapper object with a &quot;name&quot; and a &quot;channels&quot;
                        array works too.
                    </p>
                    <textarea
                        style={textareaStyle}
                        value={rawJson}
                        onChange={(event) => setRawJson(event.target.value)}
                        placeholder='[{"id":"1","type":0,"name":"general","position":0}]'
                        disabled={busy}
                        data-testid="discord-import-json"
                    />
                    <div
                        style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
                    >
                        <button
                            type="button"
                            style={buttonStyle}
                            onClick={() => preview(rawJson)}
                            disabled={busy}
                            data-testid="discord-import-preview"
                        >
                            Preview structure
                        </button>
                        <input
                            type="file"
                            accept=".json,application/json"
                            onChange={handleFile}
                            disabled={busy}
                            data-testid="discord-import-file"
                        />
                    </div>
                    {parseError ? <p style={errorStyle}>{parseError}</p> : null}
                </div>

                {plan ? (
                    <div style={panelStyle} data-testid="discord-import-preview-tree">
                        <h2 style={panelTitleStyle}>2. Preview</h2>
                        <label
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                                fontSize: 13,
                            }}
                        >
                            New {BLACKOUT_TERMS.canopy.singular} name
                            <input
                                style={inputStyle}
                                value={canopyName}
                                onChange={(event) => setCanopyName(event.target.value)}
                                disabled={busy}
                                data-testid="discord-import-name"
                            />
                        </label>
                        <ul style={treeListStyle}>
                            {plan.uncategorized.map((den, index) => (
                                <DenRow den={den} key={`u-${index}-${den.name}`} />
                            ))}
                            {plan.categories.map((category, categoryIndex) => (
                                <li key={`c-${categoryIndex}-${category.name}`}>
                                    <div style={categoryRowStyle}>▾ {category.name}</div>
                                    <ul style={treeListStyle}>
                                        {category.dens.map((den, denIndex) => (
                                            <DenRow den={den} key={`d-${denIndex}-${den.name}`} />
                                        ))}
                                    </ul>
                                </li>
                            ))}
                        </ul>
                        <p style={mutedStyle}>
                            {totalItems} room{totalItems === 1 ? '' : 's'} will be created
                            (including the {BLACKOUT_TERMS.canopy.singular} itself).
                        </p>
                        {plan.skipped.length > 0 ? (
                            <div>
                                <p style={{ ...mutedStyle, fontWeight: 600 }}>
                                    Skipped ({plan.skipped.length})
                                </p>
                                <ul style={treeListStyle} data-testid="discord-import-skipped">
                                    {plan.skipped.map((entry, index) => (
                                        <li style={denRowStyle} key={`s-${index}-${entry.name}`}>
                                            <span>{entry.name}</span>
                                            <span style={kindTagStyle}>{entry.reason}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                        {runError ? <p style={errorStyle}>Import failed: {runError}</p> : null}
                        {phase !== 'done' ? (
                            <button
                                type="button"
                                style={buttonStyle}
                                onClick={handleImport}
                                disabled={busy}
                                data-testid="discord-import-run"
                            >
                                {busy ? 'Importing…' : 'Import'}
                            </button>
                        ) : null}
                    </div>
                ) : null}

                {progress.length > 0 ? (
                    <div style={panelStyle}>
                        <h2 style={panelTitleStyle}>3. Progress</h2>
                        <ul style={treeListStyle} data-testid="discord-import-progress">
                            {progress.map((event, index) =>
                                event ? (
                                    <li style={denRowStyle} key={`p-${index}`}>
                                        <span aria-hidden>
                                            {event.status === 'created'
                                                ? '✓'
                                                : event.status === 'failed'
                                                ? '✗'
                                                : '…'}
                                        </span>
                                        <span>
                                            {event.step === 'canopy'
                                                ? BLACKOUT_TERMS.canopy.singular
                                                : event.step}
                                            : {event.name}
                                        </span>
                                        {event.error ? (
                                            <span style={kindTagStyle}>{event.error}</span>
                                        ) : null}
                                    </li>
                                ) : null
                            )}
                        </ul>
                    </div>
                ) : null}

                {report ? (
                    <div style={panelStyle} data-testid="discord-import-report">
                        <h2 style={panelTitleStyle}>Done</h2>
                        <p style={mutedStyle}>
                            Created {report.created.length} of {totalItems} rooms
                            {report.failed.length > 0
                                ? `; ${report.failed.length} failed (see progress above).`
                                : '.'}
                        </p>
                        <Link
                            to={buildCommunitiesPath(report.canopyId, null)}
                            style={buttonStyle}
                            data-testid="discord-import-open-canopy"
                        >
                            Open your new {BLACKOUT_TERMS.canopy.singular}
                        </Link>
                        <button type="button" style={buttonStyle} onClick={reset}>
                            Import another
                        </button>
                    </div>
                ) : null}
            </div>
        </section>
    );
};

export default DiscordImportWizard;
