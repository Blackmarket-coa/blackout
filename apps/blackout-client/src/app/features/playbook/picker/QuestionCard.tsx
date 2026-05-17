import React, { ReactNode } from 'react';
import { Box, Icon, Icons, Text, config } from 'folds';
import { SequenceCard } from '../../../components/sequence-card';
import { SettingTile } from '../../../components/setting-tile';

/**
 * Shared building block for the three picker questions. Each option is a
 * SequenceCard rendered as a button — same vocabulary as
 * `CreateRoomKindSelector`, so the picker doesn't introduce a new visual
 * idiom and existing keyboard/aria affordances continue to work.
 *
 * Copy is conversational, never imperative. The picker UI calls in a
 * second-person plural register ("we"), not "you" — playbook choice is a
 * group act, not a settings click.
 */
export interface QuestionOption<TValue extends string> {
    value: TValue;
    title: string;
    helper: string;
}

interface QuestionCardListProps<TValue extends string> {
    options: ReadonlyArray<QuestionOption<TValue>>;
    selected?: TValue;
    onSelect: (value: TValue) => void;
    disabled?: boolean;
    /** Optional leading icon shared across every option in this group. */
    leadingIcon?: ReactNode;
}

export function QuestionCardList<TValue extends string>({
    options,
    selected,
    onSelect,
    disabled,
    leadingIcon,
}: QuestionCardListProps<TValue>) {
    return (
        <Box direction="Column" gap="200">
            {options.map((option) => {
                const isSelected = selected === option.value;
                return (
                    <SequenceCard
                        key={option.value}
                        style={{ padding: config.space.S300 }}
                        variant={isSelected ? 'Primary' : 'SurfaceVariant'}
                        direction="Column"
                        gap="100"
                        as="button"
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelect(option.value)}
                        disabled={disabled}
                    >
                        <SettingTile
                            before={leadingIcon}
                            after={isSelected && <Icon src={Icons.Check} />}
                        >
                            <Text size="H6">{option.title}</Text>
                            <Text size="T300" priority="300">
                                {option.helper}
                            </Text>
                        </SettingTile>
                    </SequenceCard>
                );
            })}
        </Box>
    );
}
