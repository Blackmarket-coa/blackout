export interface Session {
  jwt: string;
  user: {
    id: string;
    username: string;
  };
}

export interface ServerSummary {
  id: string;
  name: string;
  role: string;
}

export interface ChannelSummary {
  id: string;
  name: string;
}

export interface ServerDetails {
  id: string;
  name: string;
  channels: ChannelSummary[];
}

export interface ChatMessage {
  id: string;
  sender: string;
  body: string;
  timestamp: string;
}
