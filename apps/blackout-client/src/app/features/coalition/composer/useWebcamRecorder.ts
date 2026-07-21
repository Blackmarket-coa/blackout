import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * In-app camera recorder for the video composer (getUserMedia +
 * MediaRecorder), modeled on useVoiceRecorder. This is the capture path for
 * environments where the file-input `capture` hint cannot launch a native
 * camera — desktop browsers foremost — so "record a video" works everywhere
 * the app runs, not only in mobile webviews.
 *
 * Lifecycle is two-phase: open() turns the camera on and exposes the live
 * MediaStream for a preview element; start()/stop() bracket the actual
 * recording. close() (and unmount) always release the camera — never leave
 * an indicator light on behind the user's back.
 */
export interface UseWebcamRecorderResult {
    /** True iff getUserMedia + MediaRecorder exist in this runtime. */
    supported: boolean;
    /** Live camera stream while open — attach to a muted <video> preview. */
    stream: MediaStream | null;
    /** True while a recording is in flight. */
    recording: boolean;
    /** The completed take, if any. Cleared by reset() or the next start(). */
    file: File | null;
    /** Last error from the camera/recorder pipeline; cleared on next open. */
    error: Error | null;
    /** Turn the camera on (no recording yet). Resolves once the stream is live. */
    open: () => Promise<void>;
    /** Begin recording the open stream (opens the camera first if needed). */
    start: () => Promise<void>;
    /** Stop recording. `file` populates on the MediaRecorder onstop. */
    stop: () => void;
    /** Release the camera and clear any in-flight state. */
    close: () => void;
    /** Discard the completed take without releasing the camera. */
    reset: () => void;
}

/** Hook-free probe so surfaces can gate the record button without a camera. */
export const webcamRecordingSupported = (): boolean =>
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined';

/** Preferred container/codec order: mp4 where native (Safari), else webm. */
const MIME_CANDIDATES = [
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
];

const pickMimeType = (): string | undefined => {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
        return undefined;
    }
    return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate));
};

export function useWebcamRecorder(): UseWebcamRecorderResult {
    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const [supported, setSupported] = useState(false);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [recording, setRecording] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<Error | null>(null);

    const releaseCamera = useCallback(() => {
        recorderRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setStream(null);
        setRecording(false);
    }, []);

    useEffect(() => {
        setSupported(
            typeof window !== 'undefined' &&
                !!navigator.mediaDevices?.getUserMedia &&
                typeof MediaRecorder !== 'undefined'
        );
        return () => {
            recorderRef.current?.stop();
            streamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    const open = useCallback(async () => {
        if (!supported || streamRef.current) return;
        setError(null);
        try {
            const opened = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true,
            });
            streamRef.current = opened;
            setStream(opened);
        } catch (cause) {
            setError(cause instanceof Error ? cause : new Error(String(cause)));
        }
    }, [supported]);

    const start = useCallback(async () => {
        if (!supported || recording) return;
        if (!streamRef.current) {
            await open();
            if (!streamRef.current) return;
        }
        setError(null);
        setFile(null);
        try {
            const mimeType = pickMimeType();
            const recorder = new MediaRecorder(
                streamRef.current,
                mimeType ? { mimeType } : undefined
            );
            chunksRef.current = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, {
                    type: recorder.mimeType || 'video/webm',
                });
                const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
                setFile(
                    new File([blob], `recording-${Date.now()}.${extension}`, {
                        type: blob.type,
                    })
                );
                setRecording(false);
            };
            recorderRef.current = recorder;
            recorder.start();
            setRecording(true);
        } catch (cause) {
            setError(cause instanceof Error ? cause : new Error(String(cause)));
            setRecording(false);
        }
    }, [supported, recording, open]);

    const stop = useCallback(() => {
        if (!recording) return;
        recorderRef.current?.stop();
    }, [recording]);

    const close = useCallback(() => {
        recorderRef.current = null;
        releaseCamera();
    }, [releaseCamera]);

    const reset = useCallback(() => {
        setFile(null);
        setError(null);
    }, []);

    return { supported, stream, recording, file, error, open, start, stop, close, reset };
}
