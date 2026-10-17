import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from '../storage/tokenStorage';
import type { ApiErrorEnvelope } from '../../types';
import { API_BASE } from '../../config';
import { coldStartManager } from './coldStart';

let firstRequestTimer: ReturnType<typeof setTimeout> | null = null;
const firstRequestStartTime = Date.now();

const getBaseUrl = (): string => {
  if (typeof window === 'undefined' && !API_BASE) {
    return 'http://localhost:5173/api/v1';
  }
  return `${API_BASE}/api/v1`;
};

export const apiClient: AxiosInstance = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getToken();
    if (token && config.headers) {
      config.headers['X-Member-Token'] = token;
    }

    // Nếu đây là request đầu tiên, bắt đầu timer 3s để kích hoạt màn hình đánh thức máy chủ
    if (!coldStartManager.isCompleted() && !firstRequestTimer) {
      firstRequestTimer = setTimeout(() => {
        coldStartManager.setWakingUp(true);
      }, 3000);
    }

    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => {
    if (firstRequestTimer) {
      clearTimeout(firstRequestTimer);
      firstRequestTimer = null;
    }
    coldStartManager.markCompleted();
    return response;
  },
  async (error) => {
    const config = error.config;
    // Xử lý retry cold start nếu server chưa sẵn sàng (trong vòng tối đa 2 phút)
    const elapsed = Date.now() - firstRequestStartTime;
    if (!coldStartManager.isCompleted() && elapsed < 120000 && config) {
      coldStartManager.setWakingUp(true);
      if (firstRequestTimer) {
        clearTimeout(firstRequestTimer);
        firstRequestTimer = null;
      }
      // Chờ 5 giây rồi thử lại request
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return apiClient(config);
    }

    if (firstRequestTimer) {
      clearTimeout(firstRequestTimer);
      firstRequestTimer = null;
    }
    coldStartManager.setWakingUp(false);

    if (error.response?.data) {
      const errorData = error.response.data as ApiErrorEnvelope;
      if (errorData.error) {
        return Promise.reject(errorData.error);
      }
    }
    return Promise.reject({
      code: 'NETWORK_ERROR',
      message: error.message || 'Lỗi kết nối mạng, vui lòng thử lại.',
    });
  },
);

export default apiClient;
