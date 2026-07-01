import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * MediaRecorder wrapper for in-arena video capture — the video sibling of
 * `hooks/useVoiceRecorder.ts`. Fighters are on camera, so a Round/Shout can be
 * recorded in place instead of picking a file. Output is a webm File ready to
 * hand to the Coliseum video uploader.
 */
export interface UseVideoRecorderResult {
    supported: boolean;
    recording: boolean;
    file: File | null;
    error: Error | null;
    start: () => Promise<void>;
    stop: () => void;
    reset: () => void;
    /** Live camera stream while recording, for a self-view <video>. */
    stream: MediaStream | null;
}

export function useVideoRecorder(): UseVideoRecorderResult {
    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const [supported, setSupported] = useState(false);
    const [recording, setRecording] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);

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

    const start = useCallback(async () => {
        if (!supported || recording) return;
        setError(null);
        setFile(null);
        try {
            const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const recorder = new MediaRecorder(media);
            chunksRef.current = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, {
                    type: recorder.mimeType || 'video/webm',
                });
                const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
                const completed = new File([blob], `coliseum-clip-${Date.now()}.${extension}`, {
                    type: blob.type,
                });
                setFile(completed);
                streamRef.current?.getTracks().forEach((track) => track.stop());
                streamRef.current = null;
                setStream(null);
                recorderRef.current = null;
                setRecording(false);
            };
            recorderRef.current = recorder;
            streamRef.current = media;
            setStream(media);
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

    return { supported, recording, file, error, start, stop, reset, stream };
}
