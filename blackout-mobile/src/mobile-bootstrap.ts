import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PushNotifications } from '@capacitor/push-notifications';

export async function initBlackoutMobileBridge() {
  App.addListener('appUrlOpen', ({ url }) => {
    if (url?.startsWith('matrix://')) {
      window.dispatchEvent(new CustomEvent('blackout:deep-link', { detail: { url } }));
    }
  });

  App.addListener('appStateChange', ({ isActive }) => {
    window.dispatchEvent(new CustomEvent('blackout:app-state', { detail: { isActive } }));
  });

  await PushNotifications.requestPermissions();
  await PushNotifications.register();

  PushNotifications.addListener('registration', ({ value }) => {
    window.dispatchEvent(new CustomEvent('blackout:push-token', { detail: { token: value } }));
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    window.dispatchEvent(new CustomEvent('blackout:push-action', { detail: notification }));
  });
}

export async function mobileTapFeedback() {
  await Haptics.impact({ style: ImpactStyle.Light });
}
