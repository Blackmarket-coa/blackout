import { useMemo } from 'react';
import { MessageLayout } from '../state/compat-settings';

export type MessageLayoutItem = {
  name: string;
  layout: MessageLayout;
};

export const useMessageLayoutItems = (): MessageLayoutItem[] =>
  useMemo(
    () => [
      {
        layout: MessageLayout.Modern,
        name: 'Modern',
      },
      {
        layout: MessageLayout.Compact,
        name: 'Compact',
      },
      {
        layout: MessageLayout.Bubble,
        name: 'Bubble',
      },
    ],
    []
  );
