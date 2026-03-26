// ═══════════════════════════════════════════════════════
// POLYFILLS — must be imported before everything else
// React Native is missing Web APIs that matrix-js-sdk needs.
// ═══════════════════════════════════════════════════════

import "react-native-url-polyfill/auto";
import "text-encoding-polyfill";
import "react-native-get-random-values";
import { Buffer } from "@craftzdog/react-native-buffer";

// @ts-ignore
global.Buffer = Buffer;
