import { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
  Easing,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { Send, Shield, X } from "lucide-react-native";
import { EventTypes, useTimeline, useSendMessage, type TimelineMessage } from "@blackout/core";
import { useBlackoutAuth } from "../../lib/auth-context";
import { colors, spacing, radii, typography } from "@blackout/config";

type VineAction = {
  label: string;
  primary?: boolean;
};

type SelectionTarget =
  | { kind: "message"; eventId: string }
  | { kind: "avatar"; eventId: string };

const MAX_VISIBLE_ACTIONS = 5;
const VINE_ANIMATION_MS = 250;

type DomainId = "governance" | "trade" | "logistics" | "discover";
type RadialAction = {
  label: "Vote" | "People" | "Create" | "Map" | "Events" | "Settings" | "Message" | "Search";
  angle: number;
};

const DOMAIN_ACTIONS: Record<DomainId, string[]> = {
  governance: ["Active votes", "Results", "Proposals", "Delegates"],
  trade: ["Marketplace", "Payments", "My orders"],
  logistics: ["Tracking", "Fleet", "Routing"],
  discover: ["DeepDive", "Communities", "Featured"],
};

const RADIAL_ACTIONS: RadialAction[] = [
  { label: "Vote", angle: 0 },
  { label: "People", angle: 45 },
  { label: "Create", angle: 90 },
  { label: "Map", angle: 135 },
  { label: "Events", angle: 180 },
  { label: "Settings", angle: 225 },
  { label: "Message", angle: 270 },
  { label: "Search", angle: 315 },
];

function detectMessageKind(message: TimelineMessage): "proposal" | "file" | "plain" {
  const content = message.content.toLowerCase();
  const proposalPattern = /(governance|proposal|vote yes|vote)/i;
  const filePattern =
    /\.(pdf|docx?|xlsx?|csv|png|jpe?g|gif|zip|md|txt)\b/i.test(content) ||
    /\b(attachment|uploaded|file)\b/i.test(content);

  if (proposalPattern.test(content)) return "proposal";
  if (filePattern) return "file";
  return "plain";
}

function getMessageActions(message: TimelineMessage): VineAction[] {
  const kind = detectMessageKind(message);
  if (kind === "proposal") {
    return [
      { label: "Vote yes", primary: true },
      { label: "Thread" },
      { label: "Share" },
      { label: "React" },
    ];
  }
  if (kind === "file") {
    return [{ label: "Download" }, { label: "Preview" }, { label: "Share" }, { label: "Pin" }];
  }
  return [{ label: "React" }, { label: "Thread" }, { label: "Forward" }, { label: "Pin" }, { label: "Flag" }];
}

function getAvatarActions(): VineAction[] {
  return [{ label: "DM" }, { label: "View profile" }, { label: "Trade" }, { label: "Follow" }];
}

function MessageBubble({
  message,
  selection,
  onSelect,
  onOpenOverflow,
}: {
  message: TimelineMessage;
  selection: SelectionTarget | null;
  onSelect: (next: SelectionTarget) => void;
  onOpenOverflow: (actions: VineAction[]) => void;
}) {
  const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const initial = message.senderName?.charAt(0)?.toUpperCase() || "?";
  const messageActions = useMemo(() => getMessageActions(message), [message]);
  const avatarActions = useMemo(() => getAvatarActions(), []);
  const messageSelected =
    selection?.kind === "message" && selection.eventId === message.eventId;
  const avatarSelected =
    selection?.kind === "avatar" && selection.eventId === message.eventId;
  const visibleMessageActions = messageActions.slice(0, MAX_VISIBLE_ACTIONS);
  const overflowMessageActions = messageActions.slice(MAX_VISIBLE_ACTIONS);
  const visibleAvatarActions = avatarActions.slice(0, MAX_VISIBLE_ACTIONS);
  const overflowAvatarActions = avatarActions.slice(MAX_VISIBLE_ACTIONS);
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (messageSelected || avatarSelected) {
      animation.setValue(0);
      Animated.timing(animation, {
        toValue: 1,
        duration: VINE_ANIMATION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [animation, messageSelected, avatarSelected]);

  return (
    <View>
      <View style={[styles.messageRow, message.isOwn && styles.messageRowOwn]}>
        {!message.isOwn && (
          <Pressable
            style={styles.avatar}
            onPress={() => onSelect({ kind: "avatar", eventId: message.eventId })}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => onSelect({ kind: "message", eventId: message.eventId })}
          style={[
            styles.bubble,
            message.isOwn ? styles.bubbleOwn : styles.bubbleOther,
            messageSelected && styles.bubbleSelected,
          ]}
        >
          {!message.isOwn && (
            <Text style={styles.senderName}>{message.senderName}</Text>
          )}
          <Text style={styles.messageText}>{message.content}</Text>
          <Text style={styles.messageTime}>{timeStr}</Text>
        </Pressable>
      </View>

      {avatarSelected && (
        <Animated.View
          style={[
            styles.vineActions,
            styles.vineActionsAvatar,
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
          {visibleAvatarActions.map((action) => (
            <Pressable
              key={`${message.eventId}-avatar-${action.label}`}
              style={({ hovered }) => [
                styles.vineAction,
                hovered && styles.vineActionHovered,
              ]}
            >
              <Text style={styles.vineActionLabel}>{action.label}</Text>
            </Pressable>
          ))}
          {overflowAvatarActions.length > 0 && (
            <Pressable
              style={({ hovered }) => [
                styles.vineAction,
                hovered && styles.vineActionHovered,
              ]}
              onPress={() => onOpenOverflow(avatarActions)}
            >
              <Text style={styles.vineActionLabel}>More</Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      {messageSelected && (
        <Animated.View
          style={[
            styles.vineActions,
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
          {visibleMessageActions.map((action) => (
            <Pressable
              key={`${message.eventId}-${action.label}`}
              style={({ hovered }) => [
                styles.vineAction,
                action.primary && styles.vineActionPrimary,
                hovered && styles.vineActionHovered,
              ]}
            >
              <Text style={[styles.vineActionLabel, action.primary && styles.vineActionLabelPrimary]}>
                {action.label}
              </Text>
            </Pressable>
          ))}
          {overflowMessageActions.length > 0 && (
            <Pressable
              style={({ hovered }) => [
                styles.vineAction,
                hovered && styles.vineActionHovered,
              ]}
              onPress={() => onOpenOverflow(messageActions)}
            >
              <Text style={styles.vineActionLabel}>More</Text>
            </Pressable>
          )}
        </Animated.View>
      )}
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
  const [selectedTarget, setSelectedTarget] = useState<SelectionTarget | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [overflowActions, setOverflowActions] = useState<VineAction[]>([]);
  const [activeDomain, setActiveDomain] = useState<DomainId | null>(null);
  const [lastActiveDomain, setLastActiveDomain] = useState<DomainId | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const [pendingVoteCount, setPendingVoteCount] = useState(0);
  const [radialOpen, setRadialOpen] = useState(false);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const canopyAnimation = useRef(new Animated.Value(0)).current;
  const radialScales = useRef(RADIAL_ACTIONS.map(() => new Animated.Value(0))).current;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (selectTimeoutRef.current) clearTimeout(selectTimeoutRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  const handleSelect = (next: SelectionTarget) => {
    if (
      selectedTarget &&
      (selectedTarget.eventId !== next.eventId || selectedTarget.kind !== next.kind)
    ) {
      setSelectedTarget(null);
      if (selectTimeoutRef.current) clearTimeout(selectTimeoutRef.current);
      selectTimeoutRef.current = setTimeout(() => {
        setSelectedTarget(next);
      }, VINE_ANIMATION_MS);
      return;
    }
    setSelectedTarget((current) =>
      current &&
      current.eventId === next.eventId &&
      current.kind === next.kind
        ? null
        : next
    );
  };

  const openOverflow = (actions: VineAction[]) => {
    setOverflowActions(actions);
    setOverflowOpen(true);
  };

  const toggleDomain = (domain: DomainId) => {
    setActiveDomain((current) => (current === domain ? null : domain));
  };

  const collapseContextualUi = () => {
    setSelectedTarget(null);
    setActiveDomain(null);
    setLastActiveDomain(null);
  };

  const openRadial = () => {
    collapseContextualUi();
    radialScales.forEach((value) => value.setValue(0));
    setRadialOpen(true);
    RADIAL_ACTIONS.forEach((_, index) => {
      Animated.spring(radialScales[index], {
        toValue: 1,
        delay: index * 40,
        damping: 12,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
    });
  };

  const closeRadial = () => {
    setRadialOpen(false);
  };

  useEffect(() => {
    if (!activeDomain) {
      canopyAnimation.setValue(0);
      return;
    }
    canopyAnimation.setValue(0);
    Animated.timing(canopyAnimation, {
      toValue: 1,
      duration: VINE_ANIMATION_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [activeDomain, canopyAnimation]);

  useEffect(() => {
    if (!room) {
      setPendingVoteCount(0);
      return;
    }

    const getPendingVotes = () => {
      const proposalEvents = room.currentState.getStateEvents(EventTypes.PROPOSAL as any);
      const list = Array.isArray(proposalEvents) ? proposalEvents : proposalEvents ? [proposalEvents] : [];
      const activeCount = list.filter((event) => event.getContent()?.status === "active").length;
      setPendingVoteCount(activeCount);
    };

    getPendingVotes();
    const onTimeline = () => getPendingVotes();
    client?.on("Room.timeline" as any, onTimeline);
    return () => {
      client?.off("Room.timeline" as any, onTimeline);
    };
  }, [client, room]);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const onKeyDown = (event: KeyboardEvent) => {
      const targetTag = (event.target as HTMLElement | null)?.tagName;
      const isInput = targetTag === "INPUT" || targetTag === "TEXTAREA";
      if (event.key === "/" && !isInput) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (event.key === "Escape" && radialOpen) {
        event.preventDefault();
        closeRadial();
        return;
      }
      if (isInput) return;

      if (event.key === "g" || event.key === "G") {
        event.preventDefault();
        setActiveDomain((current) => (current === "governance" ? null : "governance"));
      } else if (event.key === "t" || event.key === "T") {
        event.preventDefault();
        setActiveDomain((current) => (current === "trade" ? null : "trade"));
      } else if (event.key === "Escape") {
        event.preventDefault();
        setActiveDomain(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [radialOpen]);

  const handleComposerFocus = () => {
    setComposerFocused(true);
    if (activeDomain) {
      setLastActiveDomain(activeDomain);
      setActiveDomain(null);
    }
  };

  const handleComposerBlur = () => {
    setComposerFocused(false);
    if (lastActiveDomain) {
      setActiveDomain(lastActiveDomain);
      setLastActiveDomain(null);
    }
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressStartRef.current = null;
  };

  const handleChatTouchStart = (event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    longPressStartRef.current = { x: pageX, y: pageY };
    longPressTimerRef.current = setTimeout(() => {
      openRadial();
      cancelLongPress();
    }, 500);
  };

  const handleChatTouchMove = (event: any) => {
    if (!longPressStartRef.current || !longPressTimerRef.current) return;
    const { pageX, pageY } = event.nativeEvent;
    const dx = pageX - longPressStartRef.current.x;
    const dy = pageY - longPressStartRef.current.y;
    if (Math.hypot(dx, dy) > 10) {
      cancelLongPress();
    }
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
        <Pressable
          style={styles.timelinePressArea}
          onPress={() => setSelectedTarget(null)}
          onTouchStart={handleChatTouchStart}
          onTouchMove={handleChatTouchMove}
          onTouchEnd={cancelLongPress}
          onTouchCancel={cancelLongPress}
        >
        {/* Timeline */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.eventId}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              selection={selectedTarget}
              onSelect={handleSelect}
              onOpenOverflow={openOverflow}
            />
          )}
          contentContainerStyle={styles.timeline}
          onStartReached={() => canPaginate && loadMore()}
          onStartReachedThreshold={0.5}
          onScrollBeginDrag={cancelLongPress}
          ListHeaderComponent={
            isLoading ? (
              <Text style={styles.loadingText}>Loading messages...</Text>
            ) : null
          }
        />
        </Pressable>

        <View style={styles.canopyBar}>
          <Pressable
            onPress={() => toggleDomain("governance")}
            style={({ hovered }) => [
              styles.canopyPill,
              activeDomain === "governance" && styles.canopyPillActive,
              hovered && styles.canopyPillHovered,
            ]}
          >
            <Text style={[styles.canopyPillLabel, activeDomain === "governance" && styles.canopyPillLabelActive]}>
              Governance
            </Text>
            {pendingVoteCount > 0 && (
              <View style={styles.canopyBadge}>
                <Text style={styles.canopyBadgeText}>{pendingVoteCount > 99 ? "99+" : pendingVoteCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={() => toggleDomain("trade")}
            style={({ hovered }) => [
              styles.canopyPill,
              activeDomain === "trade" && styles.canopyPillActive,
              hovered && styles.canopyPillHovered,
            ]}
          >
            <Text style={[styles.canopyPillLabel, activeDomain === "trade" && styles.canopyPillLabelActive]}>Trade</Text>
          </Pressable>
          <Pressable
            onPress={() => toggleDomain("logistics")}
            style={({ hovered }) => [
              styles.canopyPill,
              activeDomain === "logistics" && styles.canopyPillActive,
              hovered && styles.canopyPillHovered,
            ]}
          >
            <Text style={[styles.canopyPillLabel, activeDomain === "logistics" && styles.canopyPillLabelActive]}>
              Logistics
            </Text>
          </Pressable>
          <Pressable
            onPress={() => toggleDomain("discover")}
            style={({ hovered }) => [
              styles.canopyPill,
              activeDomain === "discover" && styles.canopyPillActive,
              hovered && styles.canopyPillHovered,
            ]}
          >
            <Text style={[styles.canopyPillLabel, activeDomain === "discover" && styles.canopyPillLabelActive]}>
              Discover
            </Text>
          </Pressable>
        </View>

        {activeDomain && !composerFocused && (
          <Animated.View
            style={[
              styles.canopyExpand,
              {
                opacity: canopyAnimation,
                transform: [
                  {
                    translateY: canopyAnimation.interpolate({
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
                  {activeDomain === "governance" && label === "Active votes" && pendingVoteCount > 0
                    ? ` (${pendingVoteCount})`
                    : ""}
                </Text>
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* Composer */}
        <View style={styles.composer}>
          <TextInput
            ref={inputRef}
            style={styles.composerInput}
            value={text}
            onChangeText={setText}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4096}
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            onFocus={handleComposerFocus}
            onBlur={handleComposerBlur}
          />
          <Pressable
            style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Send size={20} color={text.trim() ? colors.black : colors.textMuted} />
          </Pressable>
          <Pressable style={styles.bloomButton} onPress={openRadial}>
            <Text style={styles.bloomGlyph}>✦</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={radialOpen}
        transparent
        animationType="fade"
        onRequestClose={closeRadial}
      >
        <Pressable style={styles.radialOverlay} onPress={closeRadial}>
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
                  style={[
                    styles.radialNodeWrap,
                    {
                      transform: [
                        { translateX: x },
                        { translateY: y },
                        { scale: radialScales[index] },
                      ],
                    },
                  ]}
                >
                  <Pressable style={({ hovered }) => [styles.radialNode, hovered && styles.radialNodeHovered]} onPress={closeRadial}>
                    <Text style={styles.radialNodeLabel}>{action.label}</Text>
                  </Pressable>
                </Animated.View>
              );
            })}
            <Pressable style={styles.radialCenterBtn} onPress={closeRadial}>
              <X size={20} color="#1ABC9C" />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={overflowOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setOverflowOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setOverflowOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>Quick actions</Text>
            <View style={styles.sheetActions}>
              {overflowActions.map((action) => (
                <Pressable
                  key={`sheet-${action.label}`}
                  style={({ hovered }) => [
                    styles.vineAction,
                    action.primary && styles.vineActionPrimary,
                    hovered && styles.vineActionHovered,
                  ]}
                >
                  <Text style={[styles.vineActionLabel, action.primary && styles.vineActionLabelPrimary]}>
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  timelinePressArea: {
    flex: 1,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  messageRowOwn: {
    justifyContent: "flex-end",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: "rgba(26,188,156,0.10)",
    borderWidth: 0.5,
    borderColor: "rgba(26,188,156,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  avatarText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "600",
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
  bubbleSelected: {
    backgroundColor: "rgba(22,129,61,0.2)",
    borderLeftWidth: 2,
    borderLeftColor: "#1ABC9C",
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
  bloomButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    borderWidth: 0.5,
    borderColor: "rgba(26,188,156,0.2)",
    backgroundColor: "rgba(22,129,61,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  bloomGlyph: {
    color: "#1ABC9C",
    fontSize: 16,
    fontWeight: "700",
    marginTop: -1,
  },
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
    borderRadius: radii.full,
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
    borderRadius: radii.full,
    borderWidth: 0.5,
    borderColor: "rgba(26,188,156,0.25)",
    backgroundColor: "rgba(22,129,61,0.15)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
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
    borderRadius: radii.full,
    backgroundColor: "rgba(22,129,61,0.4)",
    borderWidth: 1.5,
    borderColor: "#1ABC9C",
    justifyContent: "center",
    alignItems: "center",
  },
  vineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
    marginLeft: 48,
  },
  vineActionsAvatar: {
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
});
