import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { radii, spacing, typography, colors } from "../../../lib/bmc-core";
import type { VineAction } from "../../../lib/bmc-core";

type OverflowSheetProps = {
  open: boolean;
  actions: VineAction[];
  onClose: () => void;
  onAction: (action: VineAction) => void;
};

export function OverflowSheet({ open, actions, onClose, onAction }: OverflowSheetProps) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.sheetTitle}>Quick actions</Text>
          <View style={styles.sheetActions}>
            {actions.map((action) => (
              <Pressable
                key={`sheet-${action.label}`}
                style={({ hovered }) => [styles.vineAction, action.primary && styles.vineActionPrimary, hovered && styles.vineActionHovered]}
                onPress={() => onAction(action)}
              >
                <Text style={[styles.vineActionLabel, action.primary && styles.vineActionLabelPrimary]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#0a1a0f",
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderTopWidth: 1,
    borderColor: "rgba(26,188,156,0.25)",
    padding: spacing.md,
    gap: spacing.sm,
  },
  sheetTitle: {
    color: colors.textPrimary,
    fontSize: typography.h3.fontSize,
    fontWeight: "600",
  },
  sheetActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  vineAction: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "rgba(22,129,61,0.12)",
    borderWidth: 0.5,
    borderColor: "rgba(26,188,156,0.2)",
  },
  vineActionHovered: {
    backgroundColor: "rgba(26,188,156,0.25)",
  },
  vineActionPrimary: {
    backgroundColor: "rgba(26,188,156,0.2)",
    borderColor: "#1ABC9C",
  },
  vineActionLabel: {
    color: "#1ABC9C",
    fontSize: 11,
    fontWeight: "500",
  },
  vineActionLabelPrimary: {
    fontWeight: "600",
  },
});
