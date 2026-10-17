import type { WebSocketEnvelope } from '../../types';
import type {
  WsClientOptions,
  WsConnectionStatus,
  WsEventHandler,
} from './wsTypes';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private options: Required<WsClientOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private statusListeners = new Set<(status: WsConnectionStatus) => void>();
  private eventListeners = new Map<string, Set<WsEventHandler<unknown>>>();
  private isIntentionallyClosed = false;

  constructor(url: string, options: WsClientOptions = {}) {
    this.url = url;
    this.options = {
      url,
      reconnectInterval: options.reconnectInterval ?? 1000,
      maxReconnectInterval: options.maxReconnectInterval ?? 5000,
      reconnectDecay: options.reconnectDecay ?? 1.5,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 35, // 35 lần thử kết nối lại (~160s > 2 phút)
      pingInterval: options.pingInterval ?? 30000, // 30s heartbeat
    };
  }

  public get status(): WsConnectionStatus {
    if (!this.ws) return 'CLOSED';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'OPEN';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
      default:
        return 'CLOSED';
    }
  }

  public connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isIntentionallyClosed = false;
    this.notifyStatus('CONNECTING');

    try {
      this.ws = new WebSocket(this.url);
      this.setupSocketHandlers();
    } catch (err) {
      console.error('[WebSocket] Lỗi khởi tạo socket:', err);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isIntentionallyClosed = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyStatus('CLOSED');
  }

  public send<T = unknown>(type: string, payload: T): boolean {
    const envelope: WebSocketEnvelope<T> = {
      type,
      payload,
      ts: Date.now(),
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
      return true;
    }

    console.warn('[WebSocket] Không thể gửi message khi socket chưa OPEN:', envelope);
    return false;
  }

  public on<T = unknown>(eventType: string, handler: WsEventHandler<T>): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    const handlers = this.eventListeners.get(eventType)!;
    handlers.add(handler as WsEventHandler<unknown>);

    return () => {
      handlers.delete(handler as WsEventHandler<unknown>);
      if (handlers.size === 0) {
        this.eventListeners.delete(eventType);
      }
    };
  }

  public onStatusChange(callback: (status: WsConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  public updateUrl(newUrl: string): void {
    if (this.url === newUrl) return;
    this.url = newUrl;
    if (this.ws) {
      this.disconnect();
      this.connect();
    }
  }

  // Internal helpers
  private setupSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.notifyStatus('OPEN');
      this.startHeartbeat();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const envelope = JSON.parse(event.data as string) as WebSocketEnvelope;
        if (envelope && envelope.type) {
          if (envelope.type === 'PING') {
            this.send('PONG', {});
          }
          this.dispatchEvent(envelope.type, envelope.payload, envelope);
          this.dispatchEvent('*', envelope.payload, envelope);
        }
      } catch (err) {
        console.error('[WebSocket] Lỗi giải mã message:', err, event.data);
      }
    };

    this.ws.onerror = (err) => {
      console.warn('[WebSocket] Lỗi kết nối:', err);
    };

    this.ws.onclose = () => {
      this.notifyStatus('CLOSED');
      this.stopHeartbeat();
      if (!this.isIntentionallyClosed) {
        this.scheduleReconnect();
      }
    };
  }

  private dispatchEvent(type: string, payload: unknown, envelope: WebSocketEnvelope): void {
    const handlers = this.eventListeners.get(type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(payload, envelope);
        } catch (err) {
          console.error(`[WebSocket] Lỗi trong handler của sự kiện ${type}:`, err);
        }
      });
    }
  }

  private notifyStatus(status: WsConnectionStatus): void {
    this.statusListeners.forEach((cb) => cb(status));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      this.send('PING', {});
    }, this.options.pingInterval);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isIntentionallyClosed) return;
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.error('[WebSocket] Đã đạt giới hạn số lần kết nối lại.');
      return;
    }

    const delay = Math.min(
      this.options.reconnectInterval * Math.pow(this.options.reconnectDecay, this.reconnectAttempts),
      this.options.maxReconnectInterval,
    );

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
