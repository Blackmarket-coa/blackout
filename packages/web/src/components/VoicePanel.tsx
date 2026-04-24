import React, { useEffect, useMemo, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';

type VoiceRole = 'member' | 'moderator' | 'admin';

type ParticipantView = {
  sid: string;
  identity: string;
  isSpeaking: boolean;
};

const API_ROOT = ((import.meta as any)?.env?.VITE_API_BASE_URL ?? 'http://localhost:8787/v1').replace(/\/$/, '');

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function VoicePanel({ canopyId, channelId, role = 'member' }: { canopyId: string; channelId: string; role?: VoiceRole }) {
  const [room] = useState(() => new Room());
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState<ParticipantView[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedCam, setSelectedCam] = useState('');
  const [micEnabled, setMicEnabled] = useState(false);
  const [camEnabled, setCamEnabled] = useState(false);
  const [roomLocked, setRoomLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canModerate = role === 'admin' || role === 'moderator';

  const syncParticipants = useMemo(
    () => () => {
      const remote = Array.from(room.remoteParticipants.values()).map((participant) => ({
        sid: participant.sid,
        identity: participant.identity,
        isSpeaking: participant.isSpeaking,
      }));

      const local = room.localParticipant
        ? [
            {
              sid: room.localParticipant.sid,
              identity: room.localParticipant.identity,
              isSpeaking: room.localParticipant.isSpeaking,
            },
          ]
        : [];

      setParticipants([...local, ...remote]);
    },
    [room]
  );

  useEffect(() => {
    let mounted = true;

    const enumerateDevices = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!mounted) return;
      setAudioDevices(devices.filter((d) => d.kind === 'audioinput'));
      setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
    };

    enumerateDevices().catch(() => undefined);
    const onDeviceChange = () => {
      enumerateDevices().catch(() => undefined);
    };
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);

    room.on(RoomEvent.ParticipantConnected, syncParticipants);
    room.on(RoomEvent.ParticipantDisconnected, syncParticipants);
    room.on(RoomEvent.ActiveSpeakersChanged, syncParticipants);
    room.on(RoomEvent.Disconnected, () => {
      setConnected(false);
      setParticipants([]);
    });

    return () => {
      mounted = false;
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
      room.off(RoomEvent.ParticipantConnected, syncParticipants);
      room.off(RoomEvent.ParticipantDisconnected, syncParticipants);
      room.off(RoomEvent.ActiveSpeakersChanged, syncParticipants);
      room.disconnect();
    };
  }, [room, syncParticipants]);

  const joinVoice = async () => {
    setError(null);
    const data = await requestJson<{
      livekit: { url: string; token: string };
      room: { isLocked: boolean };
    }>('/voice/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ canopyId, channelId, role }),
    });

    await room.connect(data.livekit.url, data.livekit.token);
    setConnected(true);
    setRoomLocked(data.room.isLocked);
    syncParticipants();
  };

  const leaveVoice = async () => {
    room.disconnect();
    await requestJson('/voice/rooms/leave', {
      method: 'POST',
      body: JSON.stringify({ canopyId, channelId }),
    });
    setConnected(false);
  };

  const toggleMic = async () => {
    const next = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicEnabled(next);
  };

  const toggleCam = async () => {
    const next = !camEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setCamEnabled(next);
  };

  const applyMic = async (deviceId: string) => {
    setSelectedMic(deviceId);
    if (!deviceId) return;
    await room.switchActiveDevice('audioinput', deviceId);
  };

  const applyCam = async (deviceId: string) => {
    setSelectedCam(deviceId);
    if (!deviceId) return;
    await room.switchActiveDevice('videoinput', deviceId);
  };

  const moderationAction = async (action: 'mute' | 'remove' | 'lock', targetUserId?: string, locked?: boolean) => {
    await requestJson(`/voice/rooms/moderation/${action}`, {
      method: 'POST',
      body: JSON.stringify({ canopyId, channelId, role, targetUserId, locked }),
    });

    if (action === 'mute' && targetUserId) {
      const remote = Array.from(room.remoteParticipants.values()).find((participant) => participant.identity === targetUserId);
      if (remote) {
        remote.trackPublications.forEach((publication) => {
          if (publication.kind === Track.Kind.Audio) {
            publication.setSubscribed(false);
          }
        });
      }
    }

    if (action === 'lock') {
      setRoomLocked(Boolean(locked));
    }
  };

  return (
    <section style={{ border: '1px solid #3b3b3b', borderRadius: 8, padding: 12, marginTop: 12 }}>
      <h3>Join Voice</h3>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <p>Room lock: {roomLocked ? 'Locked' : 'Open'}</p>

      {!connected ? (
        <button type="button" onClick={() => joinVoice().catch((err) => setError(String(err)))}>
          Join Voice
        </button>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => toggleMic().catch((err) => setError(String(err)))}>
              {micEnabled ? 'Mute Mic' : 'Unmute Mic'}
            </button>
            <button type="button" onClick={() => toggleCam().catch((err) => setError(String(err)))}>
              {camEnabled ? 'Disable Cam' : 'Enable Cam'}
            </button>
            <button type="button" onClick={() => leaveVoice().catch((err) => setError(String(err)))}>
              Leave Voice
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <label>
              Mic
              <select value={selectedMic} onChange={(e) => applyMic(e.target.value).catch((err) => setError(String(err)))}>
                <option value="">Default</option>
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 4)}`}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Camera
              <select value={selectedCam} onChange={(e) => applyCam(e.target.value).catch((err) => setError(String(err)))}>
                <option value="">Default</option>
                {videoDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(0, 4)}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginTop: 10 }}>
            {participants.map((participant) => (
              <article key={participant.sid} style={{ border: '1px solid #555', borderRadius: 6, padding: 8 }}>
                <strong>{participant.identity}</strong>
                <div>{participant.isSpeaking ? '🟢 Speaking' : '⚪ Silent'}</div>
                {canModerate && participant.identity !== room.localParticipant.identity ? (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button type="button" onClick={() => moderationAction('mute', participant.identity).catch((err) => setError(String(err)))}>
                      Mute
                    </button>
                    <button type="button" onClick={() => moderationAction('remove', participant.identity).catch((err) => setError(String(err)))}>
                      Remove
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          {canModerate ? (
            <div style={{ marginTop: 8 }}>
              <button type="button" onClick={() => moderationAction('lock', undefined, !roomLocked).catch((err) => setError(String(err)))}>
                {roomLocked ? 'Unlock Room' : 'Lock Room'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
