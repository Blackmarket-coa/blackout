interface TimelineMessage {
    msgtype?: string;
    type?: string;
    eventType?: string;
}

export type ComposerCapabilityKey =
    | 'rich_composer'
    | 'composer_replies'
    | 'composer_edits'
    | 'composer_redactions'
    | 'typing_indicators'
    | 'steganography_layer'
    | 'stego_policy_lifecycle';

export type ComposerCapabilityCommand =
    | '/join'
    | '/invite'
    | '/composer-rich'
    | '/reply-latest'
    | '/edit-last'
    | '/redact-last'
    | '/typing-status'
    | '/steg-hide'
    | '/steg-policy';

export const COMPOSER_CAPABILITY_COMMANDS: Record<
    ComposerCapabilityKey,
    ComposerCapabilityCommand
> = {
    rich_composer: '/composer-rich',
    composer_replies: '/reply-latest',
    composer_edits: '/edit-last',
    composer_redactions: '/redact-last',
    typing_indicators: '/typing-status',
    steganography_layer: '/steg-hide',
    stego_policy_lifecycle: '/steg-policy',
};

export const invokeComposerCapability = (
    key: ComposerCapabilityKey,
    queueCommand: (command: ComposerCapabilityCommand) => void
): void => {
    queueCommand(COMPOSER_CAPABILITY_COMMANDS[key]);
};

export type VineAction = {
    label: string;
    primary?: boolean;
};

export type SelectionTarget =
    | { kind: 'message'; eventId: string }
    | { kind: 'avatar'; eventId: string };

export type DomainId = 'governance' | 'trade' | 'logistics' | 'discover';

export type CasualRadialLabel =
    | 'Vote'
    | 'People'
    | 'Create'
    | 'Map'
    | 'Events'
    | 'Settings'
    | 'Message'
    | 'Search';

export type GovernanceRadialLabel =
    | 'Propose'
    | 'Round'
    | 'Consent'
    | 'Role'
    | 'Treasury'
    | 'Party';

export type RadialLabel = CasualRadialLabel | GovernanceRadialLabel;

export type RadialAction = {
    label: RadialLabel;
    angle: number;
    pulses?: boolean;
};

export const DOMAIN_ACTIONS: Record<DomainId, string[]> = {
    governance: ['Active votes', 'Results', 'Proposals', 'Delegates'],
    trade: ['Marketplace', 'Payments', 'My orders'],
    logistics: ['Tracking', 'Fleet', 'Routing'],
    discover: ['Coliseum', 'Communities', 'Featured'],
};

export const RADIAL_ACTIONS: RadialAction[] = [
    { label: 'Vote', angle: 0 },
    { label: 'People', angle: 45 },
    { label: 'Create', angle: 90 },
    { label: 'Map', angle: 135 },
    { label: 'Events', angle: 180 },
    { label: 'Settings', angle: 225 },
    { label: 'Message', angle: 270 },
    { label: 'Search', angle: 315 },
];

export function detectMessageKind(message: TimelineMessage): 'proposal' | 'file' | 'plain' {
    const msgtype = message.msgtype ?? message.type;
    if (message.eventType === 'm.room.proposal' || msgtype === 'app.blackout.proposal')
        return 'proposal';
    if (msgtype === 'm.image' || msgtype === 'm.file' || msgtype === 'm.video') return 'file';
    return 'plain';
}

export function getMessageActions(message: TimelineMessage): VineAction[] {
    const kind = detectMessageKind(message);
    if (kind === 'proposal')
        return [
            { label: 'Vote yes', primary: true },
            { label: 'Thread' },
            { label: 'Share' },
            { label: 'React' },
        ];
    if (kind === 'file')
        return [{ label: 'Download' }, { label: 'Preview' }, { label: 'Share' }, { label: 'Pin' }];
    return [
        { label: 'React' },
        { label: 'Thread' },
        { label: 'Forward' },
        { label: 'Pin' },
        { label: 'Flag' },
    ];
}

export function getAvatarActions(): VineAction[] {
    return [{ label: 'DM' }, { label: 'View profile' }, { label: 'Trade' }, { label: 'Follow' }];
}
