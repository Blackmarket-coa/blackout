import { Animated, Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { spacing } from "@blackout/config";
import type { VineAction } from "@blackout/core";

type VineActionsProps = {
  actions: VineAction[];
  animation: Animated.Value;
  onAction: (action: VineAction) => void;
  onOpenOverflow?: () => void;
  style?: ViewStyle;
};

const MAX_VISIBLE_ACTIONS = 5;

export function VineActions({ actions, animation, onAction, onOpenOverflow, style }: VineActionsProps) {
  const visibleActions = actions.slice(0, MAX_VISIBLE_ACTIONS);
  const hasOverflow = actions.length > MAX_VISIBLE_ACTIONS;

  return (
    <Animated.View
      style={[
        styles.vineActions,
        style,
        {
          opacity: animation,
          transform: [
            {
              translateY: animation.interpolate({
                inputRange: [0, 1],
                outputRange: [-4, 0],
              }),
            },
          ],
        },
      ]}
    >
      {visibleActions.map((action) => (
        <Pressable
          key={action.label}
          style={({ hovered }) => [styles.vineAction, action.primary && styles.vineActionPrimary, hovered && styles.vineActionHovered]}
          onPress={() => onAction(action)}
        >
          <Text style={[styles.vineActionLabel, action.primary && styles.vineActionLabelPrimary]}>{action.label}</Text>
        </Pressable>
      ))}
      {hasOverflow && onOpenOverflow && (
        <Pressable style={({ hovered }) => [styles.vineAction, hovered && styles.vineActionHovered]} onPress={onOpenOverflow}>
          <Text style={styles.vineActionLabel}>More</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  vineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginLeft: 48,
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
