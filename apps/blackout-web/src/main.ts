import { BlackoutWebApp } from "./app";
import { blackoutWebConfig } from "./index";
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

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root");
}

// Init mobile bridge in parallel with app mount
void initMobileBridge();
void new BlackoutWebApp(appRoot, blackoutWebConfig).mount();
