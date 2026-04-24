import type { MobileSession } from '../auth/types';
import type { MobileSessionManager } from '../auth/session-manager';
import type { NativeModuleRegistry } from './modules';

export async function bootstrapNativeModules(
  modules: NativeModuleRegistry,
  sessionManager: MobileSessionManager,
  session: MobileSession
): Promise<void> {
  const permission = await modules.push.requestPermission();

  if (permission === 'granted') {
    const token = await modules.push.getToken();
    if (token) {
      await sessionManager.registerDeviceWithRetry(session, {
        pushToken: token,
        platform: detectPlatform(),
        deviceId: `${detectPlatform()}-${session.user.id}`,
      });
    }
  }

  modules.deepLinks.subscribe((url) => {
    globalThis.dispatchEvent(new CustomEvent('blackout:mobile:deeplink', { detail: { url } }));
  });

  await modules.backgroundRefresh.configure({
    wifiOnly: true,
    requiresCharging: false,
    minimumIntervalMinutes: 15,
  });

  await modules.backgroundRefresh.registerTask('blackout.mobile.sync', async () => {
    const current = sessionManager.load();
    if (!current) return;

    sessionManager.scheduleRefresh(current);
  });
}

function detectPlatform(): 'ios' | 'android' {
  const platform = globalThis.navigator?.userAgent ?? '';
  return /iPhone|iPad|iOS/i.test(platform) ? 'ios' : 'android';
}
