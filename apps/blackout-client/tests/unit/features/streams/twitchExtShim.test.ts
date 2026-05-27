import { describe, expect, it, vi } from 'vitest';
import {
  EXT_RPC,
  buildExtIframeSrcdoc,
  handleExtHostRpc,
  type ExtensionAuth,
  type ExtHostContext,
} from '../../../../src/app/features/streams/extensions/twitchExtShim';

const auth: ExtensionAuth = {
  token: 'jwt-token',
  channelId: 'chan-1',
  opaqueUserId: 'Uabc',
  userId: null,
  role: 'viewer',
};

describe('buildExtIframeSrcdoc', () => {
  it('injects the auth payload and the Twitch.ext shim before the bundle', () => {
    const html = buildExtIframeSrcdoc({ bundleJs: 'console.log("ext")', auth });
    expect(html).toContain('__BLACKOUT_EXT_AUTH__');
    expect(html).toContain('"channelId":"chan-1"');
    expect(html).toContain('window.Twitch.ext');
    // The auth script must come before the bundle script.
    expect(html.indexOf('__BLACKOUT_EXT_AUTH__')).toBeLessThan(html.indexOf('console.log("ext")'));
  });

  it('neutralizes a </script> breakout attempt in the bundle', () => {
    const malicious = '</script><script>alert(1)</script>';
    const html = buildExtIframeSrcdoc({ bundleJs: malicious, auth });
    // No raw closing-script from the bundle survives.
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('<\\/script');
  });
});

describe('handleExtHostRpc', () => {
  const baseCtx = (): ExtHostContext => ({
    requestIdShare: vi.fn(async () => '999'),
  });

  it('routes rig.log to the onRigLog sink', async () => {
    const onRigLog = vi.fn();
    const ctx: ExtHostContext = { ...baseCtx(), onRigLog };
    const out = await handleExtHostRpc(EXT_RPC.RIG_LOG, { message: 'hi' }, ctx);
    expect(out).toEqual({ ok: true, result: null });
    expect(onRigLog).toHaveBeenCalledWith('hi');
  });

  it('resolves the shared identity on requestIdShare', async () => {
    const ctx = baseCtx();
    const out = await handleExtHostRpc(EXT_RPC.REQUEST_ID_SHARE, {}, ctx);
    expect(out).toEqual({ ok: true, result: { userId: '999' } });
    expect(ctx.requestIdShare).toHaveBeenCalledOnce();
  });

  it('reports subscriptionStatus as unsupported when no getter is wired', async () => {
    const out = await handleExtHostRpc(EXT_RPC.SUBSCRIPTION_STATUS, {}, baseCtx());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('unsupported');
  });

  it('rejects unknown methods rather than executing them', async () => {
    const out = await handleExtHostRpc('twitch.ext.danger', {}, baseCtx());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('unknown-method');
  });
});
