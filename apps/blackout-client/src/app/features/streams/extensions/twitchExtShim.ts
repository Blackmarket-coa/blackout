/**
 * Twitch Extensions compat — client-side `Twitch.ext` SDK shim.
 *
 * A Twitch extension bundle expects a global `Twitch.ext` object (normally
 * loaded from Twitch's CDN). We can't ship Twitch's proprietary helper, so we
 * inject a minimal polyfill into the sandboxed iframe *before* the extension
 * bundle runs. The polyfill:
 *   - fires `onAuthorized` synchronously with the Blackout-minted EBS auth
 *     (token + opaque/real ids + role) injected as `window.__BLACKOUT_EXT_AUTH__`,
 *   - exposes `onContext`, `rig.log`, `actions.requestIdShare`, and
 *     `viewer.{id,opaqueId,role,subscriptionStatus}`,
 *   - routes the few calls that need the host (rig.log, requestIdShare) over
 *     the same `postMessage({kind:'rpc-request'})` pipe the plugin sandbox uses.
 *
 * MVP surface: panel. Deferred (no-op / absent): bits.useBits, PubSub
 * broadcast, video-overlay/component/mobile surfaces.
 */

export interface ExtensionAuth {
  /** EBS JWT (HS256) the extension forwards to its own backend. */
  token: string;
  /** Twitch-style channel id this extension instance is scoped to. */
  channelId: string;
  /** Non-reversible per-(viewer, channel) id. */
  opaqueUserId: string;
  /** Real Twitch user id — present only after identity-share consent. */
  userId: string | null;
  /** Viewer relationship to the channel. */
  role: 'broadcaster' | 'moderator' | 'viewer';
}

/** RPC methods the in-iframe shim may send to the host. */
export const EXT_RPC = {
  RIG_LOG: 'twitch.ext.rig.log',
  REQUEST_ID_SHARE: 'twitch.ext.identityShare',
  SUBSCRIPTION_STATUS: 'twitch.ext.subscriptionStatus',
} as const;

export type ExtRpcMethod = (typeof EXT_RPC)[keyof typeof EXT_RPC];

/**
 * Capability each host RPC requires. Methods absent here (e.g. rig.log) need no
 * capability. The host checks this BEFORE dispatch — the in-iframe shim cannot
 * be trusted to gate itself.
 */
export const REQUIRED_EXT_CAPABILITY: Partial<Record<ExtRpcMethod, string>> = {
  [EXT_RPC.REQUEST_ID_SHARE]: 'twitch.ext.identityShare',
  [EXT_RPC.SUBSCRIPTION_STATUS]: 'twitch.ext.subscriptionStatus',
};

/**
 * The polyfill source, as a string injected into the iframe. Reads its auth
 * from `window.__BLACKOUT_EXT_AUTH__`. Kept dependency-free (it runs inside the
 * sandbox, not the host bundle).
 */
export const TWITCH_EXT_SHIM_SOURCE = `(function(){
  var auth = window.__BLACKOUT_EXT_AUTH__ || {};
  var pending = new Map();
  function rpc(method, params){
    var id = crypto.randomUUID();
    return new Promise(function(resolve, reject){
      pending.set(id, { resolve: resolve, reject: reject });
      parent.postMessage({ kind:'rpc-request', id: id, method: method, params: params }, '*');
    });
  }
  window.addEventListener('message', function(e){
    var data = e.data;
    if (!data || data.kind !== 'rpc-response') return;
    var entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.error) entry.reject(new Error(data.error.message));
    else entry.resolve(data.result);
  });
  var authCbs = [];
  var contextCbs = [];
  var authData = {
    channelId: auth.channelId,
    clientId: 'blackout-ext-compat',
    token: auth.token,
    helixToken: auth.token,
    userId: auth.userId || auth.opaqueUserId,
  };
  window.Twitch = window.Twitch || {};
  window.Twitch.ext = {
    onAuthorized: function(cb){ authCbs.push(cb); try { cb(authData); } catch (err) {} },
    onContext: function(cb){ contextCbs.push(cb); try { cb({ theme: 'dark', mode: 'viewer' }, ['theme','mode']); } catch (err) {} },
    onError: function(){},
    listen: function(){}, unlisten: function(){},
    actions: {
      requestIdShare: function(){ return rpc('${EXT_RPC.REQUEST_ID_SHARE}', { channelId: auth.channelId }); },
      onFollow: function(){},
    },
    rig: { log: function(msg){ return rpc('${EXT_RPC.RIG_LOG}', { message: String(msg) }); } },
    viewer: {
      id: auth.userId || null,
      opaqueId: auth.opaqueUserId,
      role: auth.role,
      subscriptionStatus: null,
      sessionToken: auth.token,
    },
    configuration: { broadcaster: undefined, developer: undefined, global: undefined },
  };
})();`;

const escapeForScript = (js: string): string =>
  js.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '\\u003c!--');

/**
 * Build the sandboxed-iframe `srcdoc` for a Twitch extension: inject the auth,
 * then the `Twitch.ext` shim, then the extension bundle. `<script>` sequences
 * inside untrusted strings are neutralized the same way the plugin sandbox host
 * does, so a bundle can't break out of its `<script>` block.
 */
export const buildExtIframeSrcdoc = (opts: {
  bundleJs: string;
  auth: ExtensionAuth;
}): string => {
  const authJson = JSON.stringify(opts.auth);
  return [
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    `<script>window.__BLACKOUT_EXT_AUTH__=${escapeForScript(authJson)};<\/script>`,
    `<script>${escapeForScript(TWITCH_EXT_SHIM_SOURCE)}<\/script>`,
    `<script>try{${escapeForScript(opts.bundleJs)}}catch(err){parent.postMessage({kind:'rpc-error',message:String(err&&err.message?err.message:err)},'*');}<\/script>`,
    '</body></html>',
  ].join('');
};

export interface ExtHostContext {
  /** Re-mint a token with identity shared; resolves the viewer's Twitch id (or null). */
  requestIdShare: () => Promise<string | null>;
  /** Resolve the viewer's subscription status for the channel. */
  getSubscriptionStatus?: () => Promise<unknown>;
  /** Sink for `Twitch.ext.rig.log` output. */
  onRigLog?: (message: string) => void;
}

export type ExtHostResult =
  | { ok: true; result: unknown }
  | { ok: false; code: string; message: string };

/**
 * Host-side dispatch for the RPC the shim emits. Pure given its context, so it
 * is unit-testable without standing up an iframe. Unknown methods are rejected
 * (the host must never blindly execute an in-iframe-named method).
 */
export const handleExtHostRpc = async (
  method: string,
  params: unknown,
  ctx: ExtHostContext,
): Promise<ExtHostResult> => {
  switch (method) {
    case EXT_RPC.RIG_LOG: {
      const message = (params as { message?: unknown })?.message;
      ctx.onRigLog?.(typeof message === 'string' ? message : String(message));
      return { ok: true, result: null };
    }
    case EXT_RPC.REQUEST_ID_SHARE: {
      const userId = await ctx.requestIdShare();
      return { ok: true, result: { userId } };
    }
    case EXT_RPC.SUBSCRIPTION_STATUS: {
      if (!ctx.getSubscriptionStatus) {
        return { ok: false, code: 'unsupported', message: 'subscriptionStatus is not available' };
      }
      return { ok: true, result: await ctx.getSubscriptionStatus() };
    }
    default:
      return { ok: false, code: 'unknown-method', message: `No host handler for ${method}` };
  }
};
