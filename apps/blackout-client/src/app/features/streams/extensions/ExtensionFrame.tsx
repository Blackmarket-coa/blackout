import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { fetchExtensionToken, type TwitchExtensionPanel } from '../streamsClient';
import {
  REQUIRED_EXT_CAPABILITY,
  buildExtIframeSrcdoc,
  handleExtHostRpc,
  type ExtensionAuth,
  type ExtHostContext,
} from './twitchExtShim';

/**
 * Renders one Twitch-extension-compat panel in a visible sandboxed iframe.
 *
 * Unlike the hidden code-plugin sandbox (PluginSandboxHost), an extension must
 * be SEEN, so this iframe is visible and `sandbox="allow-scripts"` only — no
 * same-origin, no DOM access to the host. The `Twitch.ext` shim + EBS auth are
 * injected into the `srcdoc`; the extension bundle then runs as it would on
 * Twitch. Host RPC (rig.log, requestIdShare) is capability-gated here, never in
 * the iframe.
 */

const frameStyle: CSSProperties = {
  width: '100%',
  minHeight: 300,
  border: '1px solid var(--border-default, #374151)',
  borderRadius: 8,
  background: '#fff',
};

interface ExtensionFrameProps {
  streamId: string;
  panel: TwitchExtensionPanel;
}

export const ExtensionFrame = ({ streamId, panel }: ExtensionFrameProps): JSX.Element => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [srcdoc, setSrcdoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const granted = useRef<Set<string>>(new Set(panel.capabilities));

  useEffect(() => {
    let cancelled = false;
    granted.current = new Set(panel.capabilities);
    Promise.all([fetchExtensionToken(streamId), fetch(panel.bundleUrl).then((r) => r.text())])
      .then(([tokenRes, bundleJs]) => {
        if (cancelled) return;
        const auth: ExtensionAuth = {
          token: tokenRes.token,
          channelId: tokenRes.channelId,
          opaqueUserId: tokenRes.opaqueUserId,
          userId: tokenRes.userId,
          role: tokenRes.role,
        };
        setSrcdoc(buildExtIframeSrcdoc({ bundleJs, auth }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'failed to load extension');
      });
    return () => {
      cancelled = true;
    };
  }, [streamId, panel.bundleUrl, panel.capabilities]);

  useEffect(() => {
    const hostCtx: ExtHostContext = {
      requestIdShare: async () => {
        const res = await fetchExtensionToken(streamId, { shareIdentity: true });
        return res.userId;
      },
    };

    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as { kind?: string; id?: number; method?: string; params?: unknown };
      if (!data || data.kind !== 'rpc-request' || typeof data.id !== 'number' || !data.method) return;

      const respond = (body: { result?: unknown; error?: { code: string; message: string } }) =>
        frame.contentWindow?.postMessage({ kind: 'rpc-response', id: data.id, ...body }, '*');

      const required = REQUIRED_EXT_CAPABILITY[data.method as keyof typeof REQUIRED_EXT_CAPABILITY];
      if (required && !granted.current.has(required)) {
        respond({ error: { code: 'capability-denied', message: `Missing capability: ${required}` } });
        return;
      }

      void handleExtHostRpc(data.method, data.params, hostCtx).then((out) => {
        if (out.ok) respond({ result: out.result });
        else respond({ error: { code: out.code, message: out.message } });
      });
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [streamId]);

  if (error) {
    return (
      <div data-testid="extension-frame-error" style={{ ...frameStyle, padding: 12, background: 'transparent' }}>
        Couldn’t load the {panel.label} extension.
      </div>
    );
  }
  if (!srcdoc) {
    return <div style={{ ...frameStyle, padding: 12, background: 'transparent' }}>Loading {panel.label}…</div>;
  }
  return (
    <iframe
      ref={iframeRef}
      title={`twitch-extension-${panel.id}`}
      sandbox="allow-scripts"
      srcDoc={srcdoc}
      style={frameStyle}
      data-testid="extension-frame"
      data-panel-id={panel.id}
    />
  );
};

/** Renders the stack of extension panels declared on a stream. */
export const ExtensionPanelStack = ({
  streamId,
  panels,
}: {
  streamId: string;
  panels: TwitchExtensionPanel[];
}): JSX.Element | null => {
  if (panels.length === 0) return null;
  return (
    <div
      data-testid="extension-panel-stack"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 16px' }}
    >
      {panels.map((panel) => (
        <ExtensionFrame key={panel.id} streamId={streamId} panel={panel} />
      ))}
    </div>
  );
};

export default ExtensionFrame;
