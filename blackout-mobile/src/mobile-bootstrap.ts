import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PushNotifications } from '@capacitor/push-notifications';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Initialize all Capacitor native bridges.
 * Called from main.ts when running inside the native shell.
 */
export async function initBlackoutMobileBridge() {
  // ── Deep linking (matrix:// URIs) ──
  App.addListener('appUrlOpen', ({ url }) => {
    if (url?.startsWith('matrix://') || url?.startsWith('blackout://')) {
      window.dispatchEvent(
        new CustomEvent('blackout:deep-link', { detail: { url } })
      );
    }
  });

  // ── App state (background/foreground) ──
  App.addListener('appStateChange', ({ isActive }) => {
    window.dispatchEvent(
      new CustomEvent('blackout:app-state', { detail: { isActive } })
    );

    // When returning to foreground, trigger a Matrix sync
    if (isActive) {
      window.dispatchEvent(new CustomEvent('blackout:resume-sync'));
    }
  });

  // ── Back button (Android) ──
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      // Minimize app instead of closing
      App.minimizeApp();
    }
  });

  // ── Push notifications ──
  try {
    const permResult = await PushNotifications.requestPermissions();

    if (permResult.receive === 'granted') {
      await PushNotifications.register();

      PushNotifications.addListener('registration', ({ value }) => {
        // Send token to the Matrix homeserver via Sygnal push gateway
        window.dispatchEvent(
          new CustomEvent('blackout:push-token', { detail: { token: value } })
        );
        console.log('[Blackout] Push token registered');
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.warn('[Blackout] Push registration failed:', error);
      });

      // Notification received while app is open
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        window.dispatchEvent(
          new CustomEvent('blackout:push-received', { detail: notification })
        );
      });

      // User tapped a notification
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        window.dispatchEvent(
          new CustomEvent('blackout:push-action', { detail: notification })
        );

        // Navigate to the room if the notification contains a room_id
        const data = notification.notification?.data;
        if (data?.room_id) {
          window.dispatchEvent(
            new CustomEvent('blackout:navigate-room', {
              detail: { roomId: data.room_id },
            })
          );
        }
      });
    }
  } catch (err) {
    console.warn('[Blackout] Push notifications not available:', err);
  }

  // ── Hide splash screen once app is ready ──
  await SplashScreen.hide();
}

/**
 * Trigger haptic feedback for UI interactions.
 */
export async function mobileTapFeedback(
  style: 'light' | 'medium' | 'heavy' = 'light'
) {
  const map = {
    light: ImpactStyle.Light,
    medium: ImpactStyle.Medium,
    heavy: ImpactStyle.Heavy,
  };

  try {
    await Haptics.impact({ style: map[style] });
  } catch {
    // Haptics not available (e.g., some Android devices)
  }
}

/**
 * Share content using the native share sheet.
 */
export async function mobileShare(title: string, text: string, url?: string) {
  try {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, text, url, dialogTitle: 'Share from Blackout' });
  } catch {
    // Fallback: copy to clipboard
    if (url) {
      await navigator.clipboard.writeText(url);
    }
  }
}
