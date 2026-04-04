import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BLACKOUT_THEME_IDS, normalizeThemeId } from '@blackout/core';

describe('theme parity (blackout-web)', () => {
  it('normalizes persisted legacy values to canonical ids', () => {
    expect(normalizeThemeId('dark')).toBe('dark_canopy');
    expect(normalizeThemeId('light')).toBe('light_grove');
    expect(normalizeThemeId('amoled')).toBe('amoled_night');
  });

  it('declares styles for every non-default canonical theme id', () => {
    const stylesheet = fs.readFileSync(path.resolve('src/styles.css'), 'utf8');
    for (const themeId of BLACKOUT_THEME_IDS.filter((id) => id !== 'dark_canopy')) {
      expect(stylesheet).toContain(`:root[data-theme="${themeId}"]`);
    }
  });
});
