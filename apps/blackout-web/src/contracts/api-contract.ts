import type { ChannelSummary, ChatMessage, ServerDetails, ServerSummary, Session } from "../types";

export interface ApiErrorEnvelope {
  code: string;
  message: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface AuthRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: Session["user"];
}

export type ServerListResponse = ServerSummary[];
export type CreateServerRequest = { name: string };
export type CreateServerResponse = ServerSummary;

export type ServerDetailsResponse = ServerDetails;
export type CreateChannelRequest = { name: string };
export type CreateChannelResponse = ChannelSummary;

export type MessageListResponse = { data: ChatMessage[] };
export type SendMessageRequest = { body: string };
export type SendMessageResponse = ChatMessage;

export interface PushTokenRegisterRequest {
  token: string;
  platform: "ios" | "android" | "web";
}

export interface PushTokenUnregisterRequest {
  token: string;
}

export interface PushTokenMutationResponse {
  ok: boolean;
}

export interface RealtimeMessageCreatedEvent {
  type: "message.created";
  eventId?: string;
  channelId: string;
  message: ChatMessage;
}

export interface RealtimeUnknownEvent {
  type: string;
  eventId?: string;
  channelId?: string;
  message?: ChatMessage;
}

export type RealtimeGatewayEvent = RealtimeMessageCreatedEvent | RealtimeUnknownEvent;
