import type { ApiClient, GatewayEvent } from "../api/client";
import type { Session } from "../types";

interface MatrixGatewayOptions {
  onEvent: (event: GatewayEvent) => void;
  onReconnect?: () => void;
}

export class MatrixGatewayClient {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private manuallyClosed = false;

  connect(api: ApiClient, session: Session, options: MatrixGatewayOptions): void {
    this.disconnect();
    this.manuallyClosed = false;

    const attach = () => {
      const socket = api.connectGateway(session, options.onEvent);
      this.socket = socket;

      if (!socket) return;

      socket.addEventListener("open", () => {
        const wasReconnecting = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;
        if (wasReconnecting) {
          options.onReconnect?.();
        }
      });

      socket.addEventListener("close", () => {
        if (this.manuallyClosed) return;
        this.scheduleReconnect(attach);
      });

      socket.addEventListener("error", () => {
        if (this.manuallyClosed) return;
        socket.close();
      });
    };

    attach();
  }

  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer) {
      globalThis.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.reconnectAttempts = 0;
  }

  private scheduleReconnect(attach: () => void): void {
    if (this.reconnectTimer) {
      globalThis.clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts += 1;
    const delayMs = Math.min(1000 * 2 ** (this.reconnectAttempts - 1), 30_000);
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.reconnectTimer = null;
      attach();
    }, delayMs);
  }
}
