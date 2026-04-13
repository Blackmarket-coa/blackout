import { useMemo } from 'react';
import { composerQuickActionsPlugin, type MessageSpacingItem } from '../plugins/composer';

export const useMessageSpacingItems = (): MessageSpacingItem[] =>
  useMemo(() => composerQuickActionsPlugin.getMessageSpacingItems(), []);
