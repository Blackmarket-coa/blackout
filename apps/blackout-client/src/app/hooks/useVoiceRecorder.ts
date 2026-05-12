import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reusable MediaRecorder wrapper extracted from MessageComposer.tsx so the
 * round-reply path (and any other surface that needs voice notes) doesn't
 * duplicate the API. Lifts the recorder lifecycle into a single hook with
 * a single stop semantics.
 *
 * Output: a File whose extension is inferred from the MediaRecorder's
 * mimeType (ogg / m4a / webm fallback) so consumers can pass it directly
 * to mx.uploadContent. The file name carries a timestamp so two recordings
 * in quick succession don't collide.
 */
export interface UseVoiceRecorderResult {
    /** True iff getUserMedia + MediaRecorder are available in this runtime. */
    supported: boolean;
    /** True while a recording is in flight. */
    recording: boolean;
    /** The completed recording, if any. Cleared by reset() or start(). */
    file: File | null;
    /** Last error from the recorder pipeline; cleared on next start. */
    error: Error | null;
    /** Begin recording. Resolves once the stream is open. */
    start: () => Promise<void>;
    /** Stop recording. The `file` field populates on the MediaRecorder onstop. */
    stop: () => void;
    /** Discard the current recording without sending. */
    reset: () => void;
}

export function useVoiceRecorder(): UseVoiceRecorderResult {
    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const [supported, setSupported] = useState(false);
    const [recording, setRecording] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        setSupported(
            typeof window !== 'undefined' &&
                !!navigator.mediaDevices?.getUserMedia &&
                typeof MediaRecorder !== 'undefined',
        );
        return () => {
            recorderRef.current?.stop();
            streamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    const start = useCallback(async () => {
        if (!supported || recording) return;
        setError(null);
        setFile(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            chunksRef.current = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, {
                    type: recorder.mimeType || 'audio/webm',
                });
                const extension = blob.type.includes('ogg')
                    ? 'ogg'
                    : blob.type.includes('mp4')
                      ? 'm4a'
                      : 'webm';
                const completed = new File(
                    [blob],
                    `voice-note-${Date.now()}.${extension}`,
                    { type: blob.type },
                );
                setFile(completed);
                streamRef.current?.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
                recorderRef.current = null;
                setRecording(false);
            };
            recorderRef.current = recorder;
            streamRef.current = stream;
            recorder.start();
            setRecording(true);
        } catch (cause) {
            setError(cause instanceof Error ? cause : new Error(String(cause)));
            setRecording(false);
        }
    }, [recording, supported]);

    const stop = useCallback(() => {
        if (!recording) return;
        recorderRef.current?.stop();
    }, [recording]);

    const reset = useCallback(() => {
        setFile(null);
        setError(null);
    }, []);

    return { supported, recording, file, error, start, stop, reset };
}
