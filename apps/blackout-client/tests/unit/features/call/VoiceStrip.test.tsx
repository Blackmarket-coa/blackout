// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { VoiceStrip } from '../../../../src/app/features/call/VoiceStrip';

const createRoom = (roomId: string, name: string) => ({ roomId, name } as never);

describe('VoiceStrip', () => {
    it('handles join/leave/mute/unmute state transitions from strip controls', () => {
        const onJoin = vi.fn();
        const onLeave = vi.fn();
        const onToggleMuted = vi.fn();
        const onToggleDeafened = vi.fn();
        const onSelectAudioDevice = vi.fn();
        const container = document.createElement('div');
        const root = ReactDOM.createRoot(container);
        document.body.appendChild(container);

        act(() => {
            root.render(
                <VoiceStrip
                    enabled
                    joined={false}
                    roomId={null}
                    selectedRoomId="!voice:example.org"
                    rooms={[createRoom('!voice:example.org', 'Ops Voice')]}
                    muted={false}
                    deafened={false}
                    membership={{}}
                    audioLevels={{}}
                    audioDevices={[{ deviceId: 'mic-1', label: 'Built in mic' } as MediaDeviceInfo]}
                    selectedAudioDeviceId="mic-1"
                    onJoin={onJoin}
                    onLeave={onLeave}
                    onToggleMuted={onToggleMuted}
                    onToggleDeafened={onToggleDeafened}
                    onSelectAudioDevice={onSelectAudioDevice}
                />
            );
        });

        const joinButton = container.querySelector('button');
        act(() => {
            joinButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onJoin).toHaveBeenCalledWith('!voice:example.org');

        act(() => {
            root.render(
                <VoiceStrip
                    enabled
                    joined
                    roomId="!voice:example.org"
                    selectedRoomId="!voice:example.org"
                    rooms={[createRoom('!voice:example.org', 'Ops Voice')]}
                    muted={false}
                    deafened={false}
                    membership={{
                        '@alice:example.org': {
                            userId: '@alice:example.org',
                            membership: 'joined',
                        },
                    }}
                    audioLevels={{
                        '@alice:example.org': {
                            userId: '@alice:example.org',
                            speaking: true,
                            level: 0.7,
                        },
                    }}
                    audioDevices={[{ deviceId: 'mic-1', label: 'Built in mic' } as MediaDeviceInfo]}
                    selectedAudioDeviceId="mic-1"
                    onJoin={onJoin}
                    onLeave={onLeave}
                    onToggleMuted={onToggleMuted}
                    onToggleDeafened={onToggleDeafened}
                    onSelectAudioDevice={onSelectAudioDevice}
                />
            );
        });

        const buttons = [...container.querySelectorAll('button')];
        const leaveButton = buttons.find((button) => button.textContent?.includes('Leave'));
        act(() => {
            buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            leaveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(onToggleMuted).toHaveBeenCalledTimes(1);
        expect(onLeave).toHaveBeenCalledTimes(1);

        act(() => {
            root.render(
                <VoiceStrip
                    enabled
                    joined
                    roomId="!voice:example.org"
                    selectedRoomId="!voice:example.org"
                    rooms={[createRoom('!voice:example.org', 'Ops Voice')]}
                    muted
                    deafened
                    membership={{
                        '@alice:example.org': {
                            userId: '@alice:example.org',
                            membership: 'joined',
                        },
                    }}
                    audioLevels={{}}
                    audioDevices={[{ deviceId: 'mic-1', label: 'Built in mic' } as MediaDeviceInfo]}
                    selectedAudioDeviceId="mic-1"
                    onJoin={onJoin}
                    onLeave={onLeave}
                    onToggleMuted={onToggleMuted}
                    onToggleDeafened={onToggleDeafened}
                    onSelectAudioDevice={onSelectAudioDevice}
                />
            );
        });
        expect(container.textContent).toContain('Unmute');
        expect(container.textContent).toContain('Undeafen');

        root.unmount();
    });

    it('keeps shell placement marker stable across live and idle states', () => {
        const container = document.createElement('div');
        const root = ReactDOM.createRoot(container);
        document.body.appendChild(container);

        const renderStrip = (joined: boolean) => {
            act(() => {
                root.render(
                    <VoiceStrip
                        enabled
                        joined={joined}
                        roomId={joined ? '!voice:example.org' : null}
                        selectedRoomId="!voice:example.org"
                        rooms={[createRoom('!voice:example.org', 'Ops Voice')]}
                        muted={false}
                        deafened={false}
                        membership={{}}
                        audioLevels={{}}
                        audioDevices={[
                            { deviceId: 'mic-1', label: 'Built in mic' } as MediaDeviceInfo,
                        ]}
                        selectedAudioDeviceId="mic-1"
                        onJoin={vi.fn()}
                        onLeave={vi.fn()}
                        onToggleMuted={vi.fn()}
                        onToggleDeafened={vi.fn()}
                        onSelectAudioDevice={vi.fn()}
                    />
                );
            });
        };

        renderStrip(false);
        const idleStrip = container.querySelector('[data-testid="voice-strip-shell"]');
        expect(idleStrip).toBeTruthy();
        expect(idleStrip?.textContent).toContain('Voice idle');

        renderStrip(true);
        const liveStrip = container.querySelector('[data-testid="voice-strip-shell"]');
        expect(liveStrip).toBeTruthy();
        expect(liveStrip?.textContent).toContain('LIVE');

        root.unmount();
    });
});
