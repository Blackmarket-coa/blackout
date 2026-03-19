export type AppScreen = "auth" | "rooms" | "timeline" | "settings";

export interface Session {
  accessToken: string;
  userId: string;
}

export interface RoomSummary {
  id: string;
  name: string;
}

export interface TimelineEvent {
  id: string;
  sender: string;
  body: string;
  timestamp: string;
}

export interface UserSettings {
  theme: "dark" | "light";
  notifications: boolean;
}
