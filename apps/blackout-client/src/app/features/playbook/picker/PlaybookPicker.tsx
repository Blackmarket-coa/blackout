import React, { useCallback, useMemo, useState } from 'react';
import { Box, Button, Chip, Header, Icon, Icons, Text, config } from 'folds';
import type { Room } from 'matrix-js-sdk';
import {
    resolvePlaybookFromPicker,
    type PickerAnswers,
    type PickerDecisions,
    type PickerResources,
    type PickerSize,
} from '../../../../lib/bmc-core';
import { CreateRoomForm } from '../../create-room/CreateRoom';
import { BLACKOUT_TERMS } from '../../../lib/blackoutTerminology';
import { QuestionSize } from './QuestionSize';
import { QuestionDecisions } from './QuestionDecisions';
import { QuestionResources } from './QuestionResources';
import { PlaybookReveal } from './PlaybookReveal';
import { PickerNav, PickerStep } from './PlaybookPicker.css';

/**
 * 3-question playbook picker. Replaces the prior `CreateRoomForm`-only modal
 * body. The existing form is still reachable from the reveal's "Custom /
 * Advanced" escape hatch — every parameter remains editable later through
 * the same visual interface as the reveal.
 *
 * Step machine mirrors the shape of
 * `apps/blackout-client/src/app/features/welcome/OnboardingWizard.tsx`:
 * an explicit step pointer and a `canProceed` predicate gate Next.
 *
 * The picker is intentionally fast — target time-to-first-usable-den is
 * <60s on mobile. No icons, no animation, no decorative chrome.
 */
type PickerStepId = 'size' | 'decisions' | 'resources' | 'reveal' | 'custom';

const STEP_LABELS: Record<Exclude<PickerStepId, 'reveal' | 'custom'>, string> = {
    size: 'How many of us?',
    decisions: 'How do we decide?',
    resources: 'What do we share?',
};

const PROGRESS_ORDER: PickerStepId[] = ['size', 'decisions', 'resources'];

export interface PlaybookPickerProps {
    space?: Room;
    onCreate: (roomId: string) => void;
}

export function PlaybookPicker({ space, onCreate }: PlaybookPickerProps) {
    const [step, setStep] = useState<PickerStepId>('size');
    const [answers, setAnswers] = useState<Partial<PickerAnswers>>({});

    const completeAnswers: PickerAnswers | null = useMemo(() => {
        if (!answers.size || !answers.decisions || !answers.resources) return null;
        return {
            size: answers.size,
            decisions: answers.decisions,
            resources: answers.resources,
        };
    }, [answers.size, answers.decisions, answers.resources]);

    const resolvedPlaybookId = useMemo(
        () => (completeAnswers ? resolvePlaybookFromPicker(completeAnswers) : null),
        [completeAnswers],
    );

    const canProceed = useMemo(() => {
        if (step === 'size') return Boolean(answers.size);
        if (step === 'decisions') return Boolean(answers.decisions);
        if (step === 'resources') return Boolean(answers.resources);
        return true;
    }, [step, answers.size, answers.decisions, answers.resources]);

    const goNext = useCallback(() => {
        setStep((current) => {
            if (current === 'size') return 'decisions';
            if (current === 'decisions') return 'resources';
            if (current === 'resources') return 'reveal';
            return current;
        });
    }, []);

    const goBack = useCallback(() => {
        setStep((current) => {
            if (current === 'decisions') return 'size';
            if (current === 'resources') return 'decisions';
            if (current === 'reveal') return 'resources';
            if (current === 'custom') return 'reveal';
            return current;
        });
    }, []);

    const handleSize = useCallback((value: PickerSize) => {
        setAnswers((prev) => ({ ...prev, size: value }));
    }, []);
    const handleDecisions = useCallback((value: PickerDecisions) => {
        setAnswers((prev) => ({ ...prev, decisions: value }));
    }, []);
    const handleResources = useCallback((value: PickerResources) => {
        setAnswers((prev) => ({ ...prev, resources: value }));
    }, []);

    const enterCustom = useCallback(() => setStep('custom'), []);

    if (step === 'custom') {
        return (
            <Box direction="Column" gap="400">
                <Box alignItems="Center" gap="200">
                    <Chip
                        as="button"
                        type="button"
                        radii="Pill"
                        variant="SurfaceVariant"
                        onClick={goBack}
                        before={<Icon size="50" src={Icons.ArrowLeft} />}
                    >
                        <Text size="T200">Back to playbook</Text>
                    </Chip>
                </Box>
                <CreateRoomForm space={space} onCreate={onCreate} />
            </Box>
        );
    }

    if (step === 'reveal') {
        if (!completeAnswers || !resolvedPlaybookId) {
            // Defensive fallback — should be unreachable because canProceed
            // blocks the resources → reveal transition while answers are partial.
            return (
                <Box direction="Column" gap="200">
                    <Text size="T300">
                        Something is missing. Go back and finish the questions.
                    </Text>
                    <Button variant="Secondary" radii="400" size="400" onClick={goBack}>
                        <Text size="B400">Back</Text>
                    </Button>
                </Box>
            );
        }
        return (
            <PlaybookReveal
                playbookId={resolvedPlaybookId}
                space={space}
                onCreate={onCreate}
                onBack={goBack}
                onCustom={enterCustom}
            />
        );
    }

    const stepIndex = PROGRESS_ORDER.indexOf(step);
    const totalSteps = PROGRESS_ORDER.length;

    return (
        <Box direction="Column" gap="400" className={PickerStep}>
            <Header size="400" style={{ padding: 0 }}>
                <Box direction="Column" gap="100" grow="Yes">
                    <Text size="L400" priority="300">
                        Step {stepIndex + 1} of {totalSteps}
                    </Text>
                    <Text size="H5">{STEP_LABELS[step as keyof typeof STEP_LABELS]}</Text>
                </Box>
            </Header>

            {step === 'size' && (
                <QuestionSize value={answers.size} onSelect={handleSize} />
            )}
            {step === 'decisions' && (
                <QuestionDecisions value={answers.decisions} onSelect={handleDecisions} />
            )}
            {step === 'resources' && (
                <QuestionResources value={answers.resources} onSelect={handleResources} />
            )}

            <Box className={PickerNav} style={{ marginTop: config.space.S200 }}>
                {stepIndex > 0 ? (
                    <Chip
                        as="button"
                        type="button"
                        radii="Pill"
                        variant="SurfaceVariant"
                        onClick={goBack}
                        before={<Icon size="50" src={Icons.ArrowLeft} />}
                    >
                        <Text size="T200">Back</Text>
                    </Chip>
                ) : (
                    <Box />
                )}

                <Button
                    size="400"
                    radii="400"
                    variant="Primary"
                    type="button"
                    onClick={goNext}
                    disabled={!canProceed}
                    after={<Icon size="50" src={Icons.ArrowRight} />}
                >
                    <Text size="B400">
                        {step === 'resources' ? 'See our playbook' : 'Next'}
                    </Text>
                </Button>
            </Box>

            <Box justifyContent="Center">
                <Chip
                    as="button"
                    type="button"
                    radii="Pill"
                    variant="SurfaceVariant"
                    onClick={enterCustom}
                >
                    <Text size="T200" priority="300">
                        {BLACKOUT_TERMS.plant.custom}
                    </Text>
                </Chip>
            </Box>
        </Box>
    );
}
