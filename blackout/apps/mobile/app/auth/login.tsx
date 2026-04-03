import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { colors, spacing, radii, typography } from "@blackout/config";
import { useBlackoutAuth } from "../../lib/auth-context";

export default function LoginScreen() {
  const { login, error, isLoading } = useBlackoutAuth();

  const [homeserver, setHomeserver] = useState("https://matrix.blackout.coop");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = () => {
    if (!username.trim() || !password.trim()) return;
    login(homeserver, username.trim(), password);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        {/* Brand */}
        <View style={styles.brand}>
          <Text style={styles.logo}>BLACKOUT</Text>
          <Text style={styles.tagline}>Encrypted. Cooperative. Sovereign.</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>HOMESERVER</Text>
          <TextInput
            style={styles.input}
            value={homeserver}
            onChangeText={setHomeserver}
            placeholder="https://matrix.example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.label}>USERNAME</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="@user:blackout.coop"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.black} />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Part of the Black Market Coalition
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  brand: {
    alignItems: "center",
    marginBottom: spacing.xxxl,
  },
  logo: {
    fontSize: 40,
    fontWeight: "800",
    color: colors.leaf,
    letterSpacing: 6,
  },
  tagline: {
    fontSize: typography.bodySmall.fontSize,
    color: colors.textMuted,
    marginTop: spacing.sm,
    letterSpacing: 1,
  },
  form: {
    gap: spacing.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: spacing.md,
    marginBottom: spacing.xxs,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.body.fontSize,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: {
    color: colors.danger,
    fontSize: typography.bodySmall.fontSize,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.leaf,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.black,
    fontSize: typography.body.fontSize,
    fontWeight: "700",
  },
  footer: {
    color: colors.textMuted,
    fontSize: typography.bodySmall.fontSize,
    textAlign: "center",
    marginTop: spacing.xxxl,
  },
});
