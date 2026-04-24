export interface PushNotificationModule {
  requestPermission(): Promise<'granted' | 'denied'>;
  getToken(): Promise<string | null>;
  openInbox(): Promise<void>;
}

export interface DeepLinkModule {
  subscribe(handler: (url: string) => void): () => void;
}

export interface MediaUploadModule {
  pickMedia(): Promise<{ uri: string; mimeType: string; sizeBytes: number } | null>;
  upload(media: { uri: string; mimeType: string; sizeBytes: number }, uploadUrl: string): Promise<{ mediaId: string }>;
}

export interface BackgroundRefreshModule {
  configure(constraints: {
    wifiOnly: boolean;
    requiresCharging: boolean;
    minimumIntervalMinutes: number;
  }): Promise<void>;
  registerTask(taskName: string, handler: () => Promise<void>): Promise<void>;
}

export interface NativeModuleRegistry {
  push: PushNotificationModule;
  deepLinks: DeepLinkModule;
  media: MediaUploadModule;
  backgroundRefresh: BackgroundRefreshModule;
}
