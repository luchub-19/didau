import type { WebSocketEnvelope } from '../../types/websocket';

export type WsConnectionStatus =
  | 'CONNECTING'
  | 'OPEN'
  | 'CLOSING'
  | 'CLOSED';

export type WsEventHandler<T = unknown> = (
  payload: T,
  envelope: WebSocketEnvelope<T>,
) => void;

export interface WsClientOptions {
  url?: string;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  reconnectDecay?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
}
