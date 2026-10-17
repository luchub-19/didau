import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from '../storage/tokenStorage';
import type { ApiErrorEnvelope } from '../../types';
import { API_BASE } from '../../config';
import { coldStartManager } from './coldStart';

// Render free ngủ sau thời gian không dùng: request đầu có thể timeout hoặc nhận 502/503.
const COLD_START_MAX_MS = 120000;
const COLD_START_RETRY_MS = 5000;
const SLEEPING_STATUSES = [502, 503];

let firstRequestStartTime: number | null = null;

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

const calledUrl = (config: InternalAxiosRequestConfig | undefined): string => {
  if (!config) return '(unknown url)';
  return `${(config.method ?? 'get').toUpperCase()} ${apiClient.getUri(config)}`;
};

const isHtml = (contentType: unknown): boolean =>
  typeof contentType === 'string' && contentType.includes('text/html');

// Máy chủ "đang ngủ": timeout hoặc 502/503. Mọi trường hợp khác (CORS, 404, HTML, 4xx) là lỗi thật.
const isSleeping = (error: AxiosError): boolean => {
  if (error.response) return SLEEPING_STATUSES.includes(error.response.status);
  return error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
};

const hasErrorEnvelope = (data: unknown): data is ApiErrorEnvelope =>
  typeof data === 'object' && data !== null && 'error' in data;

// Không chạm được backend (hoặc nhận nhầm trang HTML): ghi log rõ URL + lý do, hiện màn lỗi nếu chưa từng thành công.
const reportUnreachable = (config: InternalAxiosRequestConfig | undefined, reason: string) => {
  console.error(`[api] ${calledUrl(config)} → ${reason}`);
  const message = `Không kết nối được máy chủ (${reason}).`;
  if (!coldStartManager.isCompleted()) {
    coldStartManager.setStatus('error', message);
  }
  return { code: 'NETWORK_ERROR', message };
};

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getToken();
    if (token && config.headers) {
      config.headers['X-Member-Token'] = token;
    }
    if (firstRequestStartTime === null) {
      firstRequestStartTime = Date.now();
    }
    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => {
    // Vercel rewrite trả index.html cho mọi đường dẫn lạ: URL sai, không phải backend.
    if (isHtml(response.headers?.['content-type'])) {
      return Promise.reject(
        reportUnreachable(response.config, `nhận về HTML thay vì JSON (HTTP ${response.status})`),
      );
    }
    coldStartManager.markCompleted();
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config;

    if (isSleeping(error)) {
      const elapsed = Date.now() - (firstRequestStartTime ?? Date.now());
      if (!coldStartManager.isCompleted() && elapsed < COLD_START_MAX_MS && config) {
        coldStartManager.setStatus('waking');
        await new Promise((resolve) => setTimeout(resolve, COLD_START_RETRY_MS));
        return apiClient(config);
      }
      return Promise.reject(
        reportUnreachable(config, `máy chủ không phản hồi (${error.response?.status ?? error.code})`),
      );
    }

    if (!error.response) {
      // Không có response và không phải timeout: CORS, DNS, offline.
      return Promise.reject(
        reportUnreachable(config, `${error.code ?? 'NETWORK_ERROR'}: ${error.message} (kiểm tra CORS/ALLOWED_ORIGINS)`),
      );
    }

    const { status, data, headers } = error.response;
    if (isHtml(headers?.['content-type']) || !hasErrorEnvelope(data)) {
      // 404 từ proxy/Vercel hoặc route không tồn tại: không phải lỗi nghiệp vụ của API.
      return Promise.reject(
        reportUnreachable(config, `HTTP ${status} không phải phản hồi của API (sai VITE_API_URL hoặc đường dẫn?)`),
      );
    }

    // Lỗi nghiệp vụ (401, 404 phòng, 422...) từ API: server đã thức, trả lỗi cho nơi gọi xử lý.
    console.error(`[api] ${calledUrl(config)} → HTTP ${status} ${data.error.code}: ${data.error.message}`);
    coldStartManager.markCompleted();
    return Promise.reject(data.error);
  },
);

export default apiClient;
