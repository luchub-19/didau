export type ColdStartStatus = 'idle' | 'waking' | 'error';

export interface ColdStartState {
  status: ColdStartStatus;
  /** Luôn rỗng: màn hình tự dịch theo `status`. Giữ trường cho tương thích với App.tsx. */
  message: string;
  /** Mã kỹ thuật của lỗi (ví dụ HTML_RESPONSE), chỉ để log/gỡ lỗi. */
  reason?: string;
}

type ColdStartListener = (state: ColdStartState) => void;
const listeners = new Set<ColdStartListener>();

let state: ColdStartState = { status: 'idle', message: '', reason: '' };
let firstRequestCompleted = false;

export const coldStartManager = {
  subscribe(listener: ColdStartListener): () => void {
    listeners.add(listener);
    listener(state);
    return () => {
      listeners.delete(listener);
    };
  },
  setStatus(status: ColdStartStatus, reason = '') {
    if (state.status === status && state.reason === reason) return;
    state = { status, message: '', reason };
    listeners.forEach((cb) => cb(state));
  },
  markCompleted() {
    firstRequestCompleted = true;
    this.setStatus('idle');
  },
  isCompleted(): boolean {
    return firstRequestCompleted;
  },
};
