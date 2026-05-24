import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { tokens } from './uiTokens';
import {
  isNativeReportSubmittable,
  submitWidgetReport,
  type NativeReportResult,
} from './bugReportClient';

type Phase =
  | { status: 'editing' }
  | { status: 'sending' }
  | { status: 'sent'; result: Extract<NativeReportResult, { kind: 'ok' }> }
  | { status: 'rate_limited' }
  | { status: 'error'; message: string };

export function BugReportFab() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [phase, setPhase] = useState<Phase>({ status: 'editing' });

  const close = useCallback(() => {
    setOpen(false);
    setPhase({ status: 'editing' });
  }, []);

  const submittable = isNativeReportSubmittable(description) && phase.status !== 'sending';

  const onSubmit = useCallback(async () => {
    if (!isNativeReportSubmittable(description)) return;
    setPhase({ status: 'sending' });
    const result = await submitWidgetReport({ description, steps, suggestions });
    if (result.kind === 'ok') {
      setDescription('');
      setSteps('');
      setSuggestions('');
      setPhase({ status: 'sent', result });
    } else if (result.kind === 'rate_limited') {
      setPhase({ status: 'rate_limited' });
    } else {
      setPhase({ status: 'error', message: result.message });
    }
  }, [description, steps, suggestions]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report a problem"
        style={styles.fab}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.fabIcon}>🐞</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {phase.status === 'sent' ? (
              <View style={styles.gap}>
                <Text style={styles.title}>Thanks — report received</Text>
                <Text style={styles.muted}>
                  {phase.result.devNoop
                    ? 'Your report was captured.'
                    : 'It’s posted in the contributors’ #bugs room.'}
                </Text>
                {phase.result.messageLink ? (
                  <Text
                    style={styles.link}
                    onPress={() => void Linking.openURL(phase.result.messageLink as string)}
                  >
                    View in #bugs →
                  </Text>
                ) : null}
                <Pressable style={styles.primaryBtn} onPress={close}>
                  <Text style={styles.primaryBtnText}>Done</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.gap} keyboardShouldPersistTaps="handled">
                <Text style={styles.title}>Report a problem</Text>
                <Text style={styles.muted}>
                  Goes to the contributors’ #bugs room. Device details are attached automatically.
                </Text>

                <Text style={styles.label}>What went wrong? *</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  multiline
                  value={description}
                  onChangeText={(t) => setDescription(t.slice(0, 8_000))}
                  placeholder="When I tapped… I expected… instead…"
                  placeholderTextColor={tokens.colors.textMuted}
                  accessibilityLabel="What went wrong?"
                />

                <Text style={styles.label}>Steps to reproduce</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  multiline
                  value={steps}
                  onChangeText={(t) => setSteps(t.slice(0, 4_000))}
                  placeholder="1. Open a room  2. …"
                  placeholderTextColor={tokens.colors.textMuted}
                  accessibilityLabel="Steps to reproduce"
                />

                <Text style={styles.label}>Suggestions</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  multiline
                  value={suggestions}
                  onChangeText={(t) => setSuggestions(t.slice(0, 4_000))}
                  placeholder="How might we fix it?"
                  placeholderTextColor={tokens.colors.textMuted}
                  accessibilityLabel="Suggestions"
                />

                {phase.status === 'rate_limited' ? (
                  <Text style={styles.warn}>
                    You’re filing reports quickly — give it a minute before sending another.
                  </Text>
                ) : null}
                {phase.status === 'error' ? (
                  <Text style={styles.error}>Couldn’t send: {phase.message}</Text>
                ) : null}

                <View style={styles.row}>
                  <Pressable style={styles.secondaryBtn} onPress={close}>
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryBtn, !submittable && styles.disabledBtn]}
                    disabled={!submittable}
                    onPress={() => void onSubmit()}
                  >
                    {phase.status === 'sending' ? (
                      <ActivityIndicator color={tokens.colors.textPrimary} />
                    ) : (
                      <Text style={styles.primaryBtnText}>Send report</Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: tokens.spacing.lg,
    bottom: tokens.spacing.xl + 56,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  fabIcon: { fontSize: 24 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: tokens.colors.surface,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    padding: tokens.spacing.lg,
    maxHeight: '90%',
  },
  gap: { gap: tokens.spacing.sm },
  title: { color: tokens.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  muted: { color: tokens.colors.textSecondary, fontSize: 13 },
  label: { color: tokens.colors.textPrimary, fontSize: 13, marginTop: tokens.spacing.xs },
  input: {
    backgroundColor: tokens.colors.background,
    borderColor: tokens.colors.border,
    borderWidth: 1,
    borderRadius: tokens.radius.sm,
    color: tokens.colors.textPrimary,
    padding: tokens.spacing.sm,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  warn: { color: '#fbbf24', fontSize: 13 },
  error: { color: tokens.colors.errorText, fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: tokens.spacing.sm, marginTop: tokens.spacing.sm },
  primaryBtn: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
  },
  primaryBtnText: { color: tokens.colors.textPrimary, fontWeight: '600' },
  secondaryBtn: {
    backgroundColor: tokens.colors.surfaceElevated,
    borderRadius: tokens.radius.sm,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
  },
  secondaryBtnText: { color: tokens.colors.textSecondary },
  disabledBtn: { backgroundColor: tokens.colors.disabled },
  link: { color: tokens.colors.link, fontSize: 14 },
});

export default BugReportFab;
