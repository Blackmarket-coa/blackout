// @vitest-environment jsdom
import React, { useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAttachPhoto } from '../../../../../src/app/features/room/attachments/useAttachPhoto';

type HarnessProps = {
    pickPhoto?: Parameters<typeof useAttachPhoto>[0]['pickPhoto'];
    isNative: () => boolean;
    onState: (state: { files: File[]; clicks: number }) => void;
    onAttach: (run: () => Promise<void>) => void;
};

const Harness = ({ pickPhoto, isNative, onState, onAttach }: HarnessProps) => {
    const [files, setFiles] = useState<File[]>([]);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const clicksRef = useRef(0);
    const attach = useAttachPhoto({
        setAttachments: setFiles,
        attachmentInputRef: inputRef,
        pickPhoto,
        isNative,
    });
    React.useEffect(() => {
        onState({ files, clicks: clicksRef.current });
    }, [files, onState]);
    React.useEffect(() => {
        onAttach(attach);
    }, [attach, onAttach]);
    return (
        <input
            type="file"
            ref={(el) => {
                inputRef.current = el;
                if (el && !(el as HTMLInputElement & { _patched?: true })._patched) {
                    const original = el.click.bind(el);
                    el.click = () => {
                        clicksRef.current += 1;
                        original();
                    };
                    (el as HTMLInputElement & { _patched?: true })._patched = true;
                }
            }}
            data-testid="attachment-input"
        />
    );
};

const mountHarness = async (props: Omit<HarnessProps, 'onState' | 'onAttach'>) => {
    let lastState: { files: File[]; clicks: number } = { files: [], clicks: 0 };
    let attach: () => Promise<void> = async () => {};
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);
    await act(async () => {
        root.render(
            <Harness
                {...props}
                onState={(state) => {
                    lastState = state;
                }}
                onAttach={(run) => {
                    attach = run;
                }}
            />,
        );
        await Promise.resolve();
    });
    return {
        container,
        root,
        getState: () => lastState,
        run: async () => {
            await act(async () => {
                await attach();
            });
        },
        clickCount: () => {
            const input = container.querySelector(
                '[data-testid="attachment-input"]',
            ) as HTMLInputElement | null;
            return input ? (input.click as unknown as { calls?: number }).calls ?? 0 : 0;
        },
    };
};

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('useAttachPhoto (Port 4 carry-over — native composer attach branch)', () => {
    it('appends the picked File to attachments on native', async () => {
        const file = new File(['hello'], 'photo.jpg', { type: 'image/jpeg' });
        const pickPhoto = vi.fn().mockResolvedValue({ file, source: 'capacitor-camera' });
        const harness = await mountHarness({
            pickPhoto,
            isNative: () => true,
        });

        await harness.run();
        await act(async () => {
            await Promise.resolve();
        });

        expect(pickPhoto).toHaveBeenCalledWith({ source: 'auto' });
        expect(harness.getState().files).toHaveLength(1);
        expect(harness.getState().files[0]).toBe(file);
    });

    it('leaves attachments untouched when the native picker is cancelled', async () => {
        const pickPhoto = vi.fn().mockResolvedValue(null);
        const harness = await mountHarness({
            pickPhoto,
            isNative: () => true,
        });

        await harness.run();
        await act(async () => {
            await Promise.resolve();
        });

        expect(pickPhoto).toHaveBeenCalled();
        expect(harness.getState().files).toHaveLength(0);
    });

    it('clicks the hidden file input on web and never invokes the native picker', async () => {
        const pickPhoto = vi.fn();
        const clickSpy = vi.fn();
        // Replace the input.click via a JSDOM-aware patch before run.
        const harness = await mountHarness({
            pickPhoto,
            isNative: () => false,
        });
        const input = document.querySelector(
            '[data-testid="attachment-input"]',
        ) as HTMLInputElement;
        input.click = clickSpy;

        await harness.run();

        expect(clickSpy).toHaveBeenCalledTimes(1);
        expect(pickPhoto).not.toHaveBeenCalled();
        expect(harness.getState().files).toHaveLength(0);
    });
});
