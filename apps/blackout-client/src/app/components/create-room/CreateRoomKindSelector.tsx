import React from 'react';
import { Box, Text, Icon, Icons, config, IconSrc } from 'folds';
import { SequenceCard } from '../sequence-card';
import { SettingTile } from '../setting-tile';
import { BLACKOUT_TERMS } from '../../lib/blackoutTerminology';

import { CreateRoomKind } from './kind';

export { CreateRoomKind } from './kind';

type CreateRoomKindSelectorProps = {
    value?: CreateRoomKind;
    onSelect: (value: CreateRoomKind) => void;
    canRestrict?: boolean;
    disabled?: boolean;
    getIcon: (kind: CreateRoomKind) => IconSrc;
    targetLabel?: string;
    /**
     * True when the thing being created holds messages (a den), so each choice
     * can say what it means for end-to-end encryption. Leave it off for spaces
     * (canopies, categories): they hold hierarchy state, never messages, and
     * must not carry an encryption claim either way.
     */
    encryptionApplies?: boolean;
};
export function CreateRoomKindSelector({
    value,
    onSelect,
    canRestrict,
    disabled,
    getIcon,
    targetLabel = 'conversation',
    encryptionApplies = false,
}: CreateRoomKindSelectorProps) {
    // Encryption is on by default for a Private or Restricted den and can be
    // turned off in the form's advanced options, so "by default" is the true
    // claim. A Public den is never encrypted: the form forces it off.
    const encryptedNote = encryptionApplies ? ' Messages are end-to-end encrypted by default.' : '';
    const plaintextNote = encryptionApplies ? ' Messages are not end-to-end encrypted.' : '';
    return (
        <Box shrink="No" direction="Column" gap="100">
            {canRestrict && (
                <SequenceCard
                    style={{ padding: config.space.S300 }}
                    variant={value === CreateRoomKind.Restricted ? 'Primary' : 'SurfaceVariant'}
                    direction="Column"
                    gap="100"
                    as="button"
                    type="button"
                    aria-pressed={value === CreateRoomKind.Restricted}
                    onClick={() => onSelect(CreateRoomKind.Restricted)}
                    disabled={disabled}
                >
                    <SettingTile
                        before={<Icon size="400" src={getIcon(CreateRoomKind.Restricted)} />}
                        after={value === CreateRoomKind.Restricted && <Icon src={Icons.Check} />}
                    >
                        <Text size="H6">Restricted</Text>
                        <Text size="T300" priority="300">
                            Only members of the parent {BLACKOUT_TERMS.canopy.singular} can join
                            this {targetLabel}.{encryptedNote}
                        </Text>
                    </SettingTile>
                </SequenceCard>
            )}
            <SequenceCard
                style={{ padding: config.space.S300 }}
                variant={value === CreateRoomKind.Private ? 'Primary' : 'SurfaceVariant'}
                direction="Column"
                gap="100"
                as="button"
                type="button"
                aria-pressed={value === CreateRoomKind.Private}
                onClick={() => onSelect(CreateRoomKind.Private)}
                disabled={disabled}
            >
                <SettingTile
                    before={<Icon size="400" src={getIcon(CreateRoomKind.Private)} />}
                    after={value === CreateRoomKind.Private && <Icon src={Icons.Check} />}
                >
                    <Text size="H6">Private</Text>
                    <Text size="T300" priority="300">
                        Only invited people can join this {targetLabel}.{encryptedNote}
                    </Text>
                </SettingTile>
            </SequenceCard>
            <SequenceCard
                style={{ padding: config.space.S300 }}
                variant={value === CreateRoomKind.Public ? 'Primary' : 'SurfaceVariant'}
                direction="Column"
                gap="100"
                as="button"
                type="button"
                aria-pressed={value === CreateRoomKind.Public}
                onClick={() => onSelect(CreateRoomKind.Public)}
                disabled={disabled}
            >
                <SettingTile
                    before={<Icon size="400" src={getIcon(CreateRoomKind.Public)} />}
                    after={value === CreateRoomKind.Public && <Icon src={Icons.Check} />}
                >
                    <Text size="H6">Public</Text>
                    <Text size="T300" priority="300">
                        Anyone can find and join this {targetLabel}.{plaintextNote}
                    </Text>
                </SettingTile>
            </SequenceCard>
        </Box>
    );
}
