import { useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Users, X, ArrowRight, RefreshCw, Shield } from "lucide-react-native";
import { useDeepDive } from "@blackout/core";
import { useBlackoutAuth } from "../../lib/auth-context";
import { colors, spacing, radii, typography } from "@blackout/config";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - spacing.xl * 2;

export default function DeepDiveTab() {
  const { client } = useBlackoutAuth();
  const { currentRoom, hasMore, isLoading, discover, join, dismiss, totalAvailable } =
    useDeepDive(client);

  useEffect(() => {
    discover();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.leaf} />
        <Text style={styles.loadingText}>Discovering rooms...</Text>
      </View>
    );
  }

  if (!currentRoom) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No more rooms to discover</Text>
        <Text style={styles.emptySubtitle}>
          Check back later or search for specific topics
        </Text>
        <TouchableOpacity style={styles.refreshButton} onPress={() => discover()}>
          <RefreshCw size={18} color={colors.leaf} />
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Card */}
      <View style={styles.card}>
        {/* Room avatar / initial */}
        <View style={styles.cardAvatar}>
          <Text style={styles.cardAvatarText}>
            {currentRoom.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        {/* Room info */}
        <Text style={styles.cardName}>{currentRoom.name}</Text>

        {currentRoom.topic && (
          <Text style={styles.cardTopic} numberOfLines={4}>
            {currentRoom.topic}
          </Text>
        )}

        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Users size={14} color={colors.textSecondary} />
            <Text style={styles.metaText}>
              {currentRoom.memberCount} shadows
            </Text>
          </View>
          {currentRoom.worldReadable && (
            <View style={styles.metaItem}>
              <Shield size={14} color={colors.encrypted} />
              <Text style={[styles.metaText, { color: colors.encrypted }]}>
                Public
              </Text>
            </View>
          )}
        </View>

        {/* Counter */}
        <Text style={styles.counter}>
          {totalAvailable - (hasMore ? 0 : 0)} rooms available
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.dismissButton]}
          onPress={() => dismiss(currentRoom.roomId)}
          activeOpacity={0.7}
        >
          <X size={28} color={colors.danger} strokeWidth={2.5} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.joinButton]}
          onPress={() => join(currentRoom.roomId)}
          activeOpacity={0.7}
        >
          <ArrowRight size={28} color={colors.black} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Swipe left to skip · Swipe right to join
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  center: {
    flex: 1,
    backgroundColor: colors.black,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: typography.body.fontSize,
    marginTop: spacing.md,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.h2.fontSize,
    fontWeight: "600",
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: typography.body.fontSize,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.leaf,
  },
  refreshText: {
    color: colors.leaf,
    fontSize: typography.body.fontSize,
    fontWeight: "600",
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardAvatar: {
    width: 80,
    height: 80,
    borderRadius: radii.xl,
    backgroundColor: colors.forest,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  cardAvatarText: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: "800",
  },
  cardName: {
    color: colors.textPrimary,
    fontSize: typography.h1.fontSize,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  cardTopic: {
    color: colors.textSecondary,
    fontSize: typography.body.fontSize,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  cardMeta: {
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: typography.bodySmall.fontSize,
  },
  counter: {
    color: colors.textMuted,
    fontSize: typography.bodySmall.fontSize,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.xxl,
    marginTop: spacing.xl,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    justifyContent: "center",
    alignItems: "center",
  },
  dismissButton: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 2,
    borderColor: colors.danger,
  },
  joinButton: {
    backgroundColor: colors.leaf,
  },
  hint: {
    color: colors.textMuted,
    fontSize: typography.bodySmall.fontSize,
    marginTop: spacing.lg,
  },
});
