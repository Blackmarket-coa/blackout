import { createHash } from 'node:crypto';
import type { HtmlTagDescriptor, Plugin } from 'vite';

/**
 * Inline plugin that injects `integrity` and `crossorigin` attributes onto
 * locally-built <script> and <link rel="stylesheet"> tags emitted into
 * index.html. Defense-in-depth against asset substitution at the CDN.
 *
 * Algorithm: sha384 (recommended by the SRI spec for new deployments).
 */
export function sri(): Plugin {
  const algorithm = 'sha384';
  return {
    name: 'blackout:sri',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;

        const hashFor = (fileName: string): string | undefined => {
          const chunk = bundle[fileName];
          if (!chunk) return undefined;
          const source = chunk.type === 'asset' ? chunk.source : chunk.code;
          if (typeof source === 'string') {
            return `${algorithm}-${createHash(algorithm).update(source).digest('base64')}`;
          }
          if (source instanceof Uint8Array) {
            return `${algorithm}-${createHash(algorithm).update(Buffer.from(source)).digest('base64')}`;
          }
          return undefined;
        };

        const tags: HtmlTagDescriptor[] = [];

        const rewritten = html.replace(
          /<(script|link)\b([^>]*)>/gi,
          (match, tag: string, attrs: string) => {
            const srcMatch = attrs.match(/\s(?:src|href)=["']([^"']+)["']/i);
            if (!srcMatch) return match;
            const url = srcMatch[1];
            if (/^(https?:|\/\/|data:)/i.test(url)) return match;
            const fileName = url.replace(/^\.?\//, '');
            const integrity = hashFor(fileName);
            if (!integrity) return match;
            if (/\sintegrity=/i.test(attrs)) return match;
            const next = `${attrs} integrity="${integrity}" crossorigin="anonymous"`;
            return `<${tag}${next}>`;
          },
        );

        return { html: rewritten, tags };
      },
    },
  };
}
