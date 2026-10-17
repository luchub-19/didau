export type ColdStartStatus = 'idle' | 'waking' | 'error';

export interface ColdStartState {
  status: ColdStartStatus;
  message: string;
}

type ColdStartListener = (state: ColdStartState) => void;
const listeners = new Set<ColdStartListener>();

let state: ColdStartState = { status: 'idle', message: '' };
let firstRequestCompleted = false;

export const coldStartManager = {
  subscribe(listener: ColdStartListener): () => void {
    listeners.add(listener);
    listener(state);
    return () => {
      listeners.delete(listener);
    };
  },
  setStatus(status: ColdStartStatus, message = '') {
    if (state.status === status && state.message === message) return;
    state = { status, message };
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
