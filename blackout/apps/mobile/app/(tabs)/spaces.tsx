import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography } from "@blackout/config";

export default function SpacesTab() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Canopies</Text>
      <Text style={styles.subtitle}>
        Community canopies and cooperative groups will appear here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: typography.h2.fontSize,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: typography.body.fontSize,
    textAlign: "center",
  },
});
