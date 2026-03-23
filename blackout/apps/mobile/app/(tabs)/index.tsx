import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Shield } from "lucide-react-native";
import { useRooms, type RoomSummary } from "@blackout/core";
import { useBlackoutAuth } from "../../lib/auth-context";
import { colors, spacing, radii, typography } from "@blackout/config";

function RoomItem({ room }: { room: RoomSummary }) {
  const router = useRouter();

  const initial = room.name.charAt(0).toUpperCase();
  const timeStr = room.lastMessageTs
    ? new Date(room.lastMessageTs).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <TouchableOpacity
      style={styles.roomItem}
      onPress={() => router.push(`/room/${encodeURIComponent(room.roomId)}`)}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>

      {/* Content */}
      <View style={styles.roomContent}>
        <View style={styles.roomHeader}>
          <View style={styles.roomNameRow}>
            {room.isEncrypted && (
              <Shield size={13} color={colors.encrypted} strokeWidth={2.5} />
            )}
            <Text style={styles.roomName} numberOfLines={1}>
              {room.name}
            </Text>
          </View>
          <Text style={styles.time}>{timeStr}</Text>
        </View>
        <View style={styles.roomFooter}>
          <Text style={styles.lastMessage} numberOfLines={1}>
            {room.lastMessage || "No messages yet"}
          </Text>
          {room.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {room.unreadCount > 99 ? "99+" : room.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MessagesTab() {
  const { client } = useBlackoutAuth();
  const { rooms, isLoading } = useRooms(client);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Syncing...</Text>
      </View>
    );
  }

  if (rooms.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>No conversations yet</Text>
        <Text style={styles.emptySubtitle}>
          Join rooms through DeepDive or get invited
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.roomId}
        renderItem={({ item }) => <RoomItem room={item} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
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
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: typography.h2.fontSize,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: typography.body.fontSize,
    textAlign: "center",
  },
  list: {
    paddingTop: spacing.xs,
  },
  roomItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: {
    color: colors.leaf,
    fontSize: 18,
    fontWeight: "700",
  },
  roomContent: {
    flex: 1,
    gap: spacing.xxs,
  },
  roomHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1,
    marginRight: spacing.sm,
  },
  roomName: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: "600",
    flex: 1,
  },
  time: {
    color: colors.textMuted,
    fontSize: typography.bodySmall.fontSize,
  },
  roomFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lastMessage: {
    color: colors.textSecondary,
    fontSize: typography.bodySmall.fontSize,
    flex: 1,
    marginRight: spacing.sm,
  },
  badge: {
    backgroundColor: colors.unreadBadge,
    borderRadius: radii.full,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: "700",
  },
});
