import React, { useEffect, useMemo, useState } from 'react';

type DirectoryApp = {
  id: string;
  name: string;
  description: string;
  verified: boolean;
  defaultScopes: string[];
};

type Installation = {
  appId: string;
  canopyId: string;
  permissions: string[];
  status: string;
};

type DirectoryResponse = {
  apps: DirectoryApp[];
  installations: Installation[];
};

const API_BASE = 'http://localhost:8787/v1/apps';

export function SettingsPage() {
  const [canopyId, setCanopyId] = useState('main');
  const [data, setData] = useState<DirectoryResponse>({ apps: [], installations: [] });
  const [error, setError] = useState<string | null>(null);

  async function loadDirectory() {
    setError(null);
    const response = await fetch(`${API_BASE}/directory?canopyId=${encodeURIComponent(canopyId)}`);
    if (!response.ok) {
      setError('Unable to load app directory');
      return;
    }
    setData((await response.json()) as DirectoryResponse);
  }

  useEffect(() => {
    void loadDirectory();
  }, [canopyId]);

  const installMap = useMemo(() => new Map(data.installations.map((entry) => [entry.appId, entry])), [data.installations]);

  async function installApp(appId: string, permissions: string[]) {
    await fetch(`${API_BASE}/directory/${appId}/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ canopyId, permissions }),
    });
    await loadDirectory();
  }

  async function revokeApp(appId: string) {
    await fetch(`${API_BASE}/directory/${appId}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ canopyId }),
    });
    await loadDirectory();
  }

  return (
    <section style={{ borderTop: '1px solid #2b2b2b', marginTop: 24, paddingTop: 16 }}>
      <h2>App Directory</h2>
      <label>
        Canopy:
        <input value={canopyId} onChange={(event) => setCanopyId(event.target.value)} style={{ marginLeft: 8 }} />
      </label>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {data.apps.map((app) => {
          const installed = installMap.get(app.id);
          return (
            <li key={app.id} style={{ border: '1px solid #3b3b3b', borderRadius: 8, marginTop: 12, padding: 12 }}>
              <strong>{app.name}</strong> {app.verified ? '✅ verified' : '⚠️ unverified'}
              <p>{app.description}</p>
              <p>
                <strong>Permissions review:</strong> {app.defaultScopes.join(', ')}
              </p>
              <p>
                <strong>Status:</strong> {installed?.status ?? 'not installed'}
              </p>
              {installed?.status === 'active' ? (
                <button onClick={() => void revokeApp(app.id)}>Revoke</button>
              ) : (
                <button onClick={() => void installApp(app.id, app.defaultScopes)}>Install</button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
