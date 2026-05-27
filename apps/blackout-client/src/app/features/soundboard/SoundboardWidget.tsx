import { useMemo, useState } from 'react';
import type { Room } from 'matrix-js-sdk';
import { useStateEvent } from '../../hooks/useStateEvent';
import { StateEvent } from '../../../types/matrix/room';
import {
    SOUNDBOARD_STATE_EVENT_TYPE,
    type SoundboardClip,
    addClip,
    parseSoundboard,
    removeClip,
} from './soundboardState';

const MOD_POWER = 50;

const buttonStyle: React.CSSProperties = {
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    background: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    padding: '6px 10px',
    cursor: 'pointer',
};

export const SoundboardWidget = ({ room }: { room: Room }) => {
    const mx = room.client;
    const event = useStateEvent(room, SOUNDBOARD_STATE_EVENT_TYPE as StateEvent);
    const clips = useMemo(
        () => parseSoundboard(event?.getContent<Record<string, unknown>>()),
        [event]
    );

    const myPower = room.getMember(mx.getUserId() ?? '')?.powerLevel ?? 0;
    const canManage = myPower >= MOD_POWER;

    const [name, setName] = useState('');
    const [mxc, setMxc] = useState('');
    const [error, setError] = useState<string | null>(null);

    const persist = async (next: SoundboardClip[]) => {
        await mx.sendStateEvent(room.roomId, SOUNDBOARD_STATE_EVENT_TYPE as never, { sounds: next } as never, '');
    };

    const play = (clip: SoundboardClip) => {
        const url = mx.mxcUrlToHttp(clip.mxc);
        if (!url) return;
        void new Audio(url).play().catch(() => {});
    };

    const onAdd = async () => {
        setError(null);
        const result = addClip(clips, {
            id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`),
            name,
            mxc,
        });
        if (!result.ok) {
            setError(result.reason);
            return;
        }
        await persist(result.clips);
        setName('');
        setMxc('');
    };

    return (
        <section aria-label="Soundboard" style={{ display: 'grid', gap: 10, padding: 12 }}>
            <header>
                <strong>Soundboard</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                    Short audio clips for this den. Plays locally; sharing into a live call is wired
                    through the call layer.
                </p>
            </header>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: 8,
                }}
            >
                {clips.length === 0 ? (
                    <small style={{ color: 'var(--text-secondary)' }}>No clips yet.</small>
                ) : null}
                {clips.map((clip) => (
                    <div key={clip.id} style={{ display: 'grid', gap: 4 }}>
                        <button type="button" style={buttonStyle} onClick={() => play(clip)}>
                            ▶ {clip.name}
                        </button>
                        {canManage ? (
                            <button
                                type="button"
                                style={{ ...buttonStyle, fontSize: 11, padding: '2px 6px' }}
                                onClick={() => void persist(removeClip(clips, clip.id))}
                            >
                                Remove
                            </button>
                        ) : null}
                    </div>
                ))}
            </div>

            {canManage ? (
                <div style={{ display: 'grid', gap: 6 }}>
                    <input
                        placeholder="Clip name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                    <input
                        placeholder="mxc://server/mediaId"
                        value={mxc}
                        onChange={(e) => setMxc(e.target.value)}
                    />
                    <button type="button" style={buttonStyle} onClick={() => void onAdd()}>
                        Add clip
                    </button>
                    {error ? (
                        <small style={{ color: 'var(--color-danger, #e5484d)' }}>{error}</small>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
};

export default SoundboardWidget;
