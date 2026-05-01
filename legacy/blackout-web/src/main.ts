import { BlackoutWebApp } from "./app";
import { blackoutWebConfig } from "./index";
import { dispatchNativeBridgeEvent, listenForNativeBridgeEvents } from "./platform/native-bridge-contract";
import "./styles.css";

// ── Capacitor mobile bridge ──
// When running inside the native Capacitor shell, initialize
// push notifications, deep links, and haptic feedback.
async function initMobileBridge() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      // Dynamic import so web builds don't bundle native code
      const mobileBridgeModulePath = "../../../blackout-mobile/src/mobile-bootstrap";
      const { initBlackoutMobileBridge } = await import(
        /* @vite-ignore */ mobileBridgeModulePath
      );
      await initBlackoutMobileBridge();

      // Apply mobile-specific body class for CSS adjustments
      document.body.classList.add("blackout-mobile");
      document.body.classList.add(`blackout-platform-${Capacitor.getPlatform()}`);

      // Handle keyboard on mobile
      const { Keyboard } = await import("@capacitor/keyboard");
      Keyboard.addListener("keyboardWillShow", (info) => {
        document.body.style.setProperty("--keyboard-height", `${info.keyboardHeight}px`);
        document.body.classList.add("keyboard-visible");
      });
      Keyboard.addListener("keyboardWillHide", () => {
        document.body.style.setProperty("--keyboard-height", "0px");
        document.body.classList.remove("keyboard-visible");
      });

      // Status bar styling
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#0D0D0D" });

      console.log(`[Blackout] Mobile bridge initialized (${Capacitor.getPlatform()})`);
    }
  } catch {
    // Not running in Capacitor — normal web, do nothing
  }
}

async function initDesktopBridge() {
  try {
    const tauri = (globalThis as { __TAURI__?: unknown }).__TAURI__ as
      | {
          event?: { listen?: (eventName: string, handler: (event: { payload?: unknown }) => void) => Promise<() => void> };
          core?: { invoke?: (command: string, payload?: unknown) => Promise<unknown> };
        }
      | undefined;

    if (!tauri?.event?.listen || !tauri?.core?.invoke) return;

    await tauri.event.listen("deep-link://new-url", (event) => {
      const payload = event.payload;
      const urls = Array.isArray(payload)
        ? payload.filter((value): value is string => typeof value === "string")
        : [];
      for (const url of urls) {
        dispatchNativeBridgeEvent({
          type: "deep_link_opened",
          source: "desktop",
          url,
        });
      }
    });

    listenForNativeBridgeEvents((event) => {
      if (event.type !== "unread_count_changed") return;
      void tauri.core?.invoke?.("set_unread_count", { unread: event.unread });
    });
  } catch {
    // Not running in Tauri desktop shell.
  }
}

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root");
}

// Init mobile bridge in parallel with app mount
void initMobileBridge();
void initDesktopBridge();
void new BlackoutWebApp(appRoot, blackoutWebConfig).mount();
