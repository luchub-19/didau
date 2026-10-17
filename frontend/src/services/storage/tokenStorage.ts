const TOKEN_KEY = 'didau_member_token';
const ROOM_CODE_KEY = 'didau_room_code';

const memoryStore = new Map<string, string>();

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (key: string): string | null => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      memoryStore.set(key, value);
    },
    removeItem: (key: string): void => {
      memoryStore.delete(key);
    },
  };
}

export const tokenStorage = {
  getToken(): string | null {
    try {
      return getStorage().getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setToken(token: string): void {
    try {
      getStorage().setItem(TOKEN_KEY, token);
    } catch {
      // Ignored
    }
  },

  clearToken(): void {
    try {
      getStorage().removeItem(TOKEN_KEY);
    } catch {
      // Ignored
    }
  },

  hasToken(): boolean {
    return !!this.getToken();
  },

  getRoomCode(): string | null {
    try {
      return getStorage().getItem(ROOM_CODE_KEY);
    } catch {
      return null;
    }
  },

  setRoomCode(code: string): void {
    try {
      getStorage().setItem(ROOM_CODE_KEY, code);
    } catch {
      // Ignored
    }
  },

  clearAll(): void {
    try {
      getStorage().removeItem(TOKEN_KEY);
      getStorage().removeItem(ROOM_CODE_KEY);
    } catch {
      // Ignored
    }
  },
};
