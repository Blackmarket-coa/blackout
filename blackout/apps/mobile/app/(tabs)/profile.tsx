import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LogOut, Shield, Moon } from "lucide-react-native";
import { useBlackoutAuth } from "../../lib/auth-context";
import { colors, spacing, radii, typography } from "@blackout/config";

export default function ProfileTab() {
  const { userId, logout } = useBlackoutAuth();

  const displayName = userId?.split(":")[0]?.replace("@", "") || "User";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      {/* User card */}
      <View style={styles.userCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.displayName}>{displayName}</Text>
        <Text style={styles.userId}>{userId}</Text>
      </View>

      {/* Settings list */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.settingItem}>
          <Shield size={20} color={colors.encrypted} />
          <Text style={styles.settingText}>Encryption & Security</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingItem}>
          <Moon size={20} color={colors.textSecondary} />
          <Text style={styles.settingText}>Appearance</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <LogOut size={20} color={colors.danger} />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>

      {/* Footer */}
      <Text style={styles.footer}>
        Blackout v0.1.0 · Black Market Coalition
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
  },
  userCard: {
    alignItems: "center",
    paddingVertical: spacing.xl,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
    backgroundColor: colors.forest,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "800",
  },
  displayName: {
    color: colors.textPrimary,
    fontSize: typography.h2.fontSize,
    fontWeight: "700",
  },
  userId: {
    ...typography.mono,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  section: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    overflow: "hidden",
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingText: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  logoutText: {
    color: colors.danger,
    fontSize: typography.body.fontSize,
    fontWeight: "600",
  },
  footer: {
    color: colors.textMuted,
    fontSize: typography.bodySmall.fontSize,
    textAlign: "center",
    marginTop: "auto",
    paddingBottom: spacing.xl,
  },
});
