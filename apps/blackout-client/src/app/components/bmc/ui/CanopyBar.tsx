import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import type { DomainId } from "../../../lib/bmc-core";
import { DOMAIN_ACTIONS } from "../../../lib/bmc-core";

type CanopyBarProps = {
  activeDomain: DomainId | null;
  composerFocused: boolean;
  pendingVoteCount: number;
  animation: Animated.Value;
  onToggleDomain: (domain: DomainId) => void;
};

export function CanopyBar({ activeDomain, composerFocused, pendingVoteCount, animation, onToggleDomain }: CanopyBarProps) {
  return (
    <>
      <View style={styles.canopyBar}>
        {(["governance", "trade", "logistics", "discover"] as DomainId[]).map((domain) => (
          <Pressable
            key={domain}
            onPress={() => onToggleDomain(domain)}
            style={({ hovered }) => [styles.canopyPill, activeDomain === domain && styles.canopyPillActive, hovered && styles.canopyPillHovered]}
          >
            <Text style={[styles.canopyPillLabel, activeDomain === domain && styles.canopyPillLabelActive]}>
              {domain.charAt(0).toUpperCase() + domain.slice(1)}
            </Text>
            {domain === "governance" && pendingVoteCount > 0 && (
              <View style={styles.canopyBadge}>
                <Text style={styles.canopyBadgeText}>{pendingVoteCount > 99 ? "99+" : pendingVoteCount}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {activeDomain && !composerFocused && (
        <Animated.View
          style={[
            styles.canopyExpand,
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
          {DOMAIN_ACTIONS[activeDomain].map((label) => (
            <Pressable key={`${activeDomain}-${label}`} style={({ hovered }) => [styles.canopySub, hovered && styles.canopySubHovered]}>
              <Text style={styles.canopySubLabel}>
                {label}
                {activeDomain === "governance" && label === "Active votes" && pendingVoteCount > 0 ? ` (${pendingVoteCount})` : ""}
              </Text>
            </Pressable>
          ))}
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  canopyBar: {
    flexDirection: "row",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#0d1f14",
    borderTopWidth: 0.5,
    borderTopColor: "rgba(26,188,156,0.1)",
  },
  canopyPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: "rgba(26,188,156,0.12)",
    backgroundColor: "rgba(22,129,61,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  canopyPillHovered: {
    backgroundColor: "rgba(26,188,156,0.12)",
    borderColor: "rgba(26,188,156,0.25)",
  },
  canopyPillActive: {
    backgroundColor: "rgba(26,188,156,0.15)",
    borderColor: "#1ABC9C",
  },
  canopyPillLabel: {
    color: "#6aaa7a",
    fontSize: 11,
    fontWeight: "500",
  },
  canopyPillLabelActive: {
    color: "#1ABC9C",
  },
  canopyBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#1ABC9C",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  canopyBadgeText: {
    color: "#0a1a0f",
    fontSize: 8,
    fontWeight: "600",
  },
  canopyExpand: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(26,188,156,0.06)",
    backgroundColor: "#0d1f14",
  },
  canopySub: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "rgba(26,188,156,0.1)",
    backgroundColor: "rgba(22,129,61,0.08)",
  },
  canopySubHovered: {
    backgroundColor: "rgba(26,188,156,0.18)",
    borderColor: "#1ABC9C",
  },
  canopySubLabel: {
    fontSize: 12,
    color: "#8ce0a8",
    fontWeight: "500",
  },
});
