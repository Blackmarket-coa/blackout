import type { Context, Next } from 'hono';

export interface SecurityHeadersOptions {
  /** Enables HSTS. Disable only for non-HTTPS local dev. */
  hsts?: boolean;
  /** Extra hosts allowed by connect-src. The API's own origin is always allowed. */
  connectSrc?: string[];
  /** Extra hosts allowed by media-src (e.g. LiveKit ingress). */
  mediaSrc?: string[];
  /** Set true to send Content-Security-Policy-Report-Only instead of enforcing. */
  reportOnly?: boolean;
  /** Optional report-uri / report-to endpoint. */
  reportUri?: string;
}

const STATIC_DIRECTIVES: Record<string, ReadonlyArray<string>> = {
  'default-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'frame-src': ["'none'"],
};

const buildCsp = (opts: SecurityHeadersOptions): string => {
  const directives: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(STATIC_DIRECTIVES)) {
    directives[key] = [...values];
  }
  directives['connect-src'] = ["'self'", ...(opts.connectSrc ?? [])];
  directives['media-src'] = ["'self'", 'blob:', ...(opts.mediaSrc ?? [])];
  directives['upgrade-insecure-requests'] = [];

  const parts = Object.entries(directives).map(([key, values]) =>
    values.length > 0 ? `${key} ${values.join(' ')}` : key,
  );
  if (opts.reportUri) parts.push(`report-uri ${opts.reportUri}`);
  return parts.join('; ');
};

export const securityHeaders = (options: SecurityHeadersOptions = {}) => {
  const csp = buildCsp(options);
  const cspHeader = options.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  const sendHsts = options.hsts ?? process.env.NODE_ENV === 'production';

  return async function securityHeadersMiddleware(c: Context, next: Next) {
    await next();
    c.header(cspHeader, csp);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    c.header('Cross-Origin-Opener-Policy', 'same-origin');
    c.header('Cross-Origin-Resource-Policy', 'same-origin');
    c.header(
      'Permissions-Policy',
      'accelerometer=(), camera=(self), geolocation=(), gyroscope=(), microphone=(self), payment=(), usb=()',
    );
    if (sendHsts) {
      c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
  };
};

export const __test__ = { buildCsp };
