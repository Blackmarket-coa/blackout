import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { Send, Shield } from "lucide-react-native";
import { useTimeline, useSendMessage, type TimelineMessage } from "@blackout/core";
import { useBlackoutAuth } from "../../lib/auth-context";
import { colors, spacing, radii, typography } from "@blackout/config";

function MessageBubble({ message }: { message: TimelineMessage }) {
  const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View
      style={[
        styles.bubble,
        message.isOwn ? styles.bubbleOwn : styles.bubbleOther,
      ]}
    >
      {!message.isOwn && (
        <Text style={styles.senderName}>{message.senderName}</Text>
      )}
      <Text style={styles.messageText}>{message.content}</Text>
      <Text style={styles.messageTime}>{timeStr}</Text>
    </View>
  );
}

export default function RoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { client } = useBlackoutAuth();
  const { messages, isLoading, loadMore, canPaginate } = useTimeline(
    client,
    roomId || null
  );
  const { sendText } = useSendMessage(client, roomId || null);

  const [text, setText] = useState("");
  const listRef = useRef<FlatList>(null);

  // Get room name for header
  const room = client?.getRoom(roomId || "");
  const roomName = room?.name || "Chat";
  const isEncrypted = room?.hasEncryptionStateEvent() || false;

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = async () => {
    if (!text.trim()) return;
    const msg = text;
    setText("");
    await sendText(msg);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerTitle}>
              {isEncrypted && (
                <Shield size={14} color={colors.encrypted} strokeWidth={2.5} />
              )}
              <Text style={styles.headerText} numberOfLines={1}>
                {roomName}
              </Text>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Timeline */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.eventId}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.timeline}
          onStartReached={() => canPaginate && loadMore()}
          onStartReachedThreshold={0.5}
          ListHeaderComponent={
            isLoading ? (
              <Text style={styles.loadingText}>Loading messages...</Text>
            ) : null
          }
        />

        {/* Composer */}
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4096}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Send size={20} color={text.trim() ? colors.black : colors.textMuted} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  headerText: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "600",
  },
  timeline: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: typography.bodySmall.fontSize,
    textAlign: "center",
    padding: spacing.md,
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    marginVertical: spacing.xxs,
  },
  bubbleOwn: {
    alignSelf: "flex-end",
    backgroundColor: colors.messageSelf,
    borderBottomRightRadius: radii.xs,
  },
  bubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: colors.messageOther,
    borderBottomLeftRadius: radii.xs,
  },
  senderName: {
    color: colors.leaf,
    fontSize: typography.bodySmall.fontSize,
    fontWeight: "600",
    marginBottom: spacing.xxs,
  },
  messageText: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
  },
  messageTime: {
    color: colors.textMuted,
    fontSize: 10,
    alignSelf: "flex-end",
    marginTop: spacing.xxs,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  composerInput: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.body.fontSize,
    color: colors.textPrimary,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.leaf,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: colors.surfaceRaised,
  },
});
