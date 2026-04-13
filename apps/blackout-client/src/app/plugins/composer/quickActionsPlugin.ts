import { getMessageActions } from '../../../lib/bmc-core/quick-actions';
import { type MessageSpacing } from '../../state/settings';
import type { PluginDefinition } from '../contracts';
import { isRuntimePluginEnabled } from '../manifest';

interface TimelineMessage {
    msgtype?: string;
    type?: string;
    eventType?: string;
}

export type MessageSpacingItem = {
    name: string;
    spacing: MessageSpacing;
};

const baselineMessageSpacingItems: MessageSpacingItem[] = [
    { spacing: '200', name: 'Small' },
    { spacing: '400', name: 'Normal' },
    { spacing: '500', name: 'Large' },
];

const pluginMessageSpacingItems: MessageSpacingItem[] = [
    { spacing: '0', name: 'None' },
    { spacing: '100', name: 'Ultra Small' },
    { spacing: '200', name: 'Extra Small' },
    { spacing: '300', name: 'Small' },
    { spacing: '400', name: 'Normal' },
    { spacing: '500', name: 'Large' },
];

export const resolveComposerMessageSpacingItems = (pluginEnabled: boolean): MessageSpacingItem[] =>
    pluginEnabled ? pluginMessageSpacingItems : baselineMessageSpacingItems;

let unregisterLifecycle = (): void => {};

export const composerQuickActionsPlugin: PluginDefinition<'composer.quick-actions'> & {
    getMessageSpacingItems: () => MessageSpacingItem[];
    getTimelineQuickActions: (message: TimelineMessage) => ReturnType<typeof getMessageActions>;
} = {
    id: 'composer.quick-actions',
    isEnabled: (): boolean => isRuntimePluginEnabled('composer.quick-actions'),
    register: () => {
        unregisterLifecycle = (): void => {};
        return unregisterLifecycle;
    },
    unregister: () => {
        unregisterLifecycle();
    },
    getMessageSpacingItems: (): MessageSpacingItem[] =>
        resolveComposerMessageSpacingItems(isRuntimePluginEnabled('composer.quick-actions')),
    getTimelineQuickActions: (message: TimelineMessage) => getMessageActions(message),
};
