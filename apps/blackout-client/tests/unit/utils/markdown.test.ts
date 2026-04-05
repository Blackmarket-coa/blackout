/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { mdToHtml, htmlToMd, sanitizeMatrixHtml } from '../../../src/app/utils/markdown';

describe('markdown utils', () => {
  it('mdToHtml converts markdown to formatted html', () => {
    expect(mdToHtml('**bold**')).toBe('<strong>bold</strong>');
    expect(mdToHtml('*italic*')).toBe('<em>italic</em>');
    expect(mdToHtml('`code`')).toBe('<code>code</code>');
    expect(mdToHtml('line1\nline2')).toBe('line1<br />line2');
  });

  it('mdToHtml escapes HTML entities', () => {
    expect(mdToHtml('<script>alert("xss")</script>')).not.toContain('<script>');
    expect(mdToHtml('a & b')).toContain('&amp;');
  });

  it('htmlToMd converts html back to markdown', () => {
    expect(htmlToMd('<strong>bold</strong>')).toBe('**bold**');
    expect(htmlToMd('<em>italic</em>')).toBe('*italic*');
    expect(htmlToMd('<code>code</code>')).toBe('`code`');
    expect(htmlToMd('line1<br />line2')).toBe('line1\nline2');
  });

  it('htmlToMd strips unknown tags', () => {
    expect(htmlToMd('<div>text</div>')).toBe('text');
  });

  it('sanitizeMatrixHtml strips unsafe html', () => {
    const result = sanitizeMatrixHtml('<strong>safe</strong><script>alert("xss")</script>');
    expect(result).toContain('<strong>safe</strong>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('alert("xss")');
  });

  it('sanitizeMatrixHtml preserves allowed tags and safe attributes', () => {
    const html = '<a href="https://example.org" onclick="evil()">link</a>';
    const result = sanitizeMatrixHtml(html);
    expect(result).toContain('href="https://example.org"');
    expect(result).not.toContain('onclick');
  });

  it('sanitizeMatrixHtml removes unsafe href schemes', () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeMatrixHtml(html);
    expect(result).not.toContain('javascript:');
  });
});
