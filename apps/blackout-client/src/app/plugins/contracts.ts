export type PluginUnregister = () => void;

export interface PluginLifecycle {
    register: () => PluginUnregister;
    unregister: () => void;
}

export interface PluginDefinition<PluginId extends string> extends PluginLifecycle {
    id: PluginId;
    isEnabled: () => boolean;
}

export type UISlotRenderer<Props> = (props: Props) => JSX.Element;

export type UISlotRegistry<SlotName extends string, Props> = Partial<
    Record<SlotName, UISlotRenderer<Props>>
>;
