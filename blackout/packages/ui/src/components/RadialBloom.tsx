import { Animated, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { X } from "lucide-react-native";
import type { RadialAction } from "@blackout/core";
import { RADIAL_ACTIONS } from "@blackout/core";

type RadialBloomProps = {
  open: boolean;
  scales: Animated.Value[];
  onClose: () => void;
  onAction: (action: RadialAction["label"]) => void;
};

export function RadialBloom({ open, scales, onClose, onAction }: RadialBloomProps) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.radialOverlay} onPress={onClose}>
        <Text style={styles.radialHint}>Tap outside to close · Esc to dismiss</Text>
        <Pressable style={styles.radialHub} onPress={() => undefined}>
          <View style={styles.radialRingCircle} />
          {RADIAL_ACTIONS.map((action, index) => {
            const radius = 100;
            const radians = (action.angle * Math.PI) / 180;
            const x = radius * Math.cos(radians);
            const y = radius * Math.sin(radians);
            return (
              <Animated.View
                key={action.label}
                style={[styles.radialNodeWrap, { transform: [{ translateX: x }, { translateY: y }, { scale: scales[index] }] }]}
              >
                <Pressable style={({ hovered }) => [styles.radialNode, hovered && styles.radialNodeHovered]} onPress={() => onAction(action.label)}>
                  <Text style={styles.radialNodeLabel}>{action.label}</Text>
                </Pressable>
              </Animated.View>
            );
          })}
          <Pressable style={styles.radialCenterBtn} onPress={onClose}>
            <X size={20} color="#1ABC9C" />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  radialOverlay: {
    flex: 1,
    backgroundColor: "rgba(5,12,8,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  radialHint: {
    position: "absolute",
    top: 16,
    fontSize: 11,
    color: "rgba(184,232,200,0.4)",
  },
  radialHub: {
    width: 300,
    height: 300,
    alignItems: "center",
    justifyContent: "center",
  },
  radialRingCircle: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: "rgba(26,188,156,0.06)",
  },
  radialNodeWrap: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -29,
    marginTop: -29,
  },
  radialNode: {
    width: 58,
    height: 58,
    borderRadius: 999,
    borderWidth: 0.5,
    borderColor: "rgba(26,188,156,0.25)",
    backgroundColor: "rgba(22,129,61,0.15)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  radialNodeHovered: {
    backgroundColor: "rgba(26,188,156,0.3)",
    borderColor: "#1ABC9C",
  },
  radialNodeLabel: {
    color: "#b0d8c0",
    fontSize: 9,
    fontWeight: "600",
    textAlign: "center",
  },
  radialCenterBtn: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: "rgba(22,129,61,0.4)",
    borderWidth: 1.5,
    borderColor: "#1ABC9C",
    justifyContent: "center",
    alignItems: "center",
  },
});
