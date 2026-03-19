import { createGlobalTheme } from '@vanilla-extract/css';

export const themeVars = createGlobalTheme(':root', {
  color: {
    background: '#000000',
    foreground: '#e5f9f0',
    accent: '#17b890',
  },
});
