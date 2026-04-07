const baseUrl = process.env.SYNTHETIC_CALL_BASE_URL;
if (!baseUrl) {
  console.error('SYNTHETIC_CALL_BASE_URL is required. Example: https://blackout-staging.example.org');
  process.exit(1);
}

const withTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const toHttpProbeUrl = (focusUrl) => {
  if (focusUrl.startsWith('wss://')) return `https://${focusUrl.slice('wss://'.length)}`;
  if (focusUrl.startsWith('ws://')) return `http://${focusUrl.slice('ws://'.length)}`;
  return focusUrl;
};

const results = [];

const wellKnownUrl = new URL('/.well-known/matrix/client', baseUrl).toString();
const wk = await withTimeout(wellKnownUrl, { headers: { Accept: 'application/json' } });
results.push({ check: 'well-known', ok: wk.ok, detail: `HTTP ${wk.status}` });
if (!wk.ok) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}

const wkBody = await wk.json();
const foci = wkBody['org.matrix.msc4143.rtc_foci'] ?? wkBody.rtc_foci;
const livekit = Array.isArray(foci)
  ? foci.find((focus) => focus?.type === 'livekit' || focus?.type === 'livekit-service')
  : null;
const livekitUrl = livekit?.livekit_service_url ?? livekit?.livekit_alias ?? null;

if (!livekitUrl) {
  results.push({ check: 'rtc_foci', ok: false, detail: 'missing livekit focus in well-known' });
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
results.push({ check: 'rtc_foci', ok: true, detail: livekitUrl });

const sfuProbe = await withTimeout(toHttpProbeUrl(livekitUrl), { method: 'GET' });
results.push({ check: 'livekit_sfu', ok: sfuProbe.status < 500, detail: `HTTP ${sfuProbe.status}` });

const jwtUrl = new URL('/livekit/jwt/', baseUrl).toString();
const jwtProbe = await withTimeout(jwtUrl, { method: 'GET' });
results.push({ check: 'livekit_jwt', ok: jwtProbe.status < 500, detail: `HTTP ${jwtProbe.status}` });

console.log(JSON.stringify(results, null, 2));
if (results.some((result) => !result.ok)) process.exit(1);
