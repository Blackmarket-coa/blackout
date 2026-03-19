import type { ApiClient, GatewayEvent } from "../api/client";
import type { Session } from "../types";

export class MatrixGatewayClient {
  private socket: WebSocket | null = null;

  connect(api: ApiClient, session: Session, onEvent: (event: GatewayEvent) => void): void {
    this.disconnect();
    this.socket = api.connectGateway(session, onEvent);
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
