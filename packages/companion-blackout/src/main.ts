import {
  InstanceBase,
  InstanceStatus,
  Regex,
  runEntrypoint,
  type SomeCompanionConfigField,
} from '@companion-module/base';
import OBSWebSocket from 'obs-websocket-js';

import { buildActions } from './actions.js';
import { buildFeedbacks } from './feedbacks.js';
import { buildVariables } from './variables.js';

/**
 * Bitfocus Companion module for the Blackmarket Coalition Blackout API.
 *
 * Blackout exposes an OBS-WebSocket v5 protocol-compatible shim at
 * `ws://<api>:<port>/obs-ws/<password-id>`. Because the shim speaks
 * the real OBS-WS protocol, this module just uses the standard
 * `obs-websocket-js` client — no custom auth code lives here.
 *
 * Generate the password (and the embedded `<password-id>`) in the
 * Blackout web UI under Settings → "OBS WebSocket passwords"; the
 * one-time-reveal flow there gives you a connection URL like
 *
 *   ws://api.blackmarket.example:3000/obs-ws/abcd1234
 *
 * along with the plaintext password. Paste both into this module's
 * config in Companion.
 */

interface BlackoutConfig {
  /** API host (no scheme; eg `api.blackmarket.example`). */
  host: string;
  port: number;
  /** OBS-WS password row id — comes from the URL slug. */
  passwordId: string;
  /** Plaintext password from the one-time reveal in the Blackout UI. */
  password: string;
  /** `ws` for clear-text dev, `wss` for prod TLS. */
  scheme: 'ws' | 'wss';
}

export class BlackoutInstance extends InstanceBase<BlackoutConfig> {
  obs: OBSWebSocket = new OBSWebSocket();
  config: BlackoutConfig = {
    host: 'localhost',
    port: 3000,
    passwordId: '',
    password: '',
    scheme: 'ws',
  };

  isStreaming = false;
  currentScene = '';
  lastTipAmount: number | undefined;
  lastFollowName: string | undefined;

  override async init(config: BlackoutConfig): Promise<void> {
    this.config = config;
    this.setActionDefinitions(buildActions(this));
    this.setFeedbackDefinitions(buildFeedbacks(this));
    this.setVariableDefinitions(buildVariables());
    this.updateStatus(InstanceStatus.Connecting);
    await this.connect();
  }

  override async destroy(): Promise<void> {
    await this.obs.disconnect();
  }

  override async configUpdated(config: BlackoutConfig): Promise<void> {
    this.config = config;
    await this.obs.disconnect();
    await this.connect();
  }

  getConfigFields(): SomeCompanionConfigField[] {
    return [
      {
        type: 'textinput',
        id: 'host',
        label: 'Blackout API host',
        width: 8,
        default: 'localhost',
        regex: Regex.HOSTNAME,
      },
      {
        type: 'number',
        id: 'port',
        label: 'Port',
        width: 4,
        default: 3000,
        min: 1,
        max: 65535,
      },
      {
        type: 'dropdown',
        id: 'scheme',
        label: 'Scheme',
        width: 4,
        default: 'ws',
        choices: [
          { id: 'ws', label: 'ws (clear text)' },
          { id: 'wss', label: 'wss (TLS)' },
        ],
      },
      {
        type: 'textinput',
        id: 'passwordId',
        label: 'OBS-WS password id (URL slug)',
        width: 8,
        default: '',
      },
      {
        type: 'textinput',
        id: 'password',
        label: 'OBS-WS password (plaintext)',
        width: 12,
        default: '',
      },
    ];
  }

  private async connect(): Promise<void> {
    const { host, port, passwordId, password, scheme } = this.config;
    if (!host || !passwordId || !password) {
      this.updateStatus(InstanceStatus.BadConfig, 'host / passwordId / password required');
      return;
    }
    const url = `${scheme}://${host}:${port}/obs-ws/${passwordId}`;
    try {
      await this.obs.connect(url, password);
      this.updateStatus(InstanceStatus.Ok);
      this.bindObsEvents();
      await this.refreshState();
    } catch (err) {
      this.updateStatus(InstanceStatus.ConnectionFailure, String(err));
    }
  }

  private bindObsEvents(): void {
    this.obs.on('StreamStateChanged', (data) => {
      this.isStreaming = data.outputActive;
      this.checkFeedbacks('streaming');
      this.setVariableValues({ is_streaming: this.isStreaming ? 'true' : 'false' });
    });
    this.obs.on('CurrentProgramSceneChanged', (data) => {
      this.currentScene = data.sceneName;
      this.setVariableValues({ current_scene: this.currentScene });
    });
    this.obs.on('ConnectionClosed', () => {
      this.updateStatus(InstanceStatus.Disconnected);
    });
    // Blackout-namespaced custom events: tip, follow, etc.
    this.obs.on('CustomEvent' as never, (data: Record<string, unknown>) => {
      // Companion's `obs-websocket-js` types don't surface OBS-WS's
      // BroadcastCustomEvent/Custom-shaped payloads; we coerce.
      const eventType = (data as { eventType?: string }).eventType;
      if (eventType === 'blackout.tip') {
        const amount = (data as { eventData?: { amount?: number } }).eventData?.amount;
        if (typeof amount === 'number') {
          this.lastTipAmount = amount;
          this.setVariableValues({ last_tip_amount: String(amount) });
        }
      } else if (eventType === 'blackout.follow') {
        const username = (data as { eventData?: { username?: string } }).eventData?.username;
        if (typeof username === 'string') {
          this.lastFollowName = username;
          this.setVariableValues({ last_follow_name: username });
        }
      }
    });
  }

  private async refreshState(): Promise<void> {
    try {
      const status = await this.obs.call('GetStreamStatus');
      this.isStreaming = status.outputActive;
      this.setVariableValues({ is_streaming: this.isStreaming ? 'true' : 'false' });
    } catch {
      // ignore — Blackout may not have a stream record yet.
    }
    try {
      const scene = await this.obs.call('GetCurrentProgramScene');
      this.currentScene = scene.currentProgramSceneName ?? '';
      this.setVariableValues({ current_scene: this.currentScene });
    } catch {
      // ignore
    }
  }
}

runEntrypoint(BlackoutInstance, []);
