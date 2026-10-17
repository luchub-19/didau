type ColdStartListener = (isWakingUp: boolean) => void;
const listeners = new Set<ColdStartListener>();

let isServerWakingUp = false;
let firstRequestCompleted = false;

export const coldStartManager = {
  subscribe(listener: ColdStartListener): () => void {
    listeners.add(listener);
    listener(isServerWakingUp);
    return () => {
      listeners.delete(listener);
    };
  },
  setWakingUp(val: boolean) {
    if (isServerWakingUp !== val) {
      isServerWakingUp = val;
      listeners.forEach((cb) => cb(val));
    }
  },
  markCompleted() {
    firstRequestCompleted = true;
    this.setWakingUp(false);
  },
  isCompleted(): boolean {
    return firstRequestCompleted;
  },
};
