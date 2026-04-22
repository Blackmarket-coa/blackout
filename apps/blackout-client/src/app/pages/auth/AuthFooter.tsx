import React from 'react';
import { Box, Text } from 'folds';
import * as css from './styles.css';

export function AuthFooter() {
  return (
    <Box className={css.AuthFooter} justifyContent="Center" gap="400" wrap="Wrap">
      <Text
        as="a"
        size="T300"
        href="https://github.com/Blackmarket-coa/blackout"
        target="_blank"
        rel="noreferrer"
      >
        About
      </Text>
      <Text
        as="a"
        size="T300"
        href="https://github.com/Blackmarket-coa/blackout/releases"
        target="_blank"
        rel="noreferrer"
      >
        Blackout Client
      </Text>
      <Text as="a" size="T300" href="https://theblackout.app" target="_blank" rel="noreferrer">
        The Blackout
      </Text>
      <Text as="a" size="T300" href="https://matrix.org" target="_blank" rel="noreferrer">
        Powered by Matrix
      </Text>
    </Box>
  );
}
