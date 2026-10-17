import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Phần tử gốc 'root' không tồn tại trong tài liệu HTML.");
}

async function prepareApp(): Promise<void> {
  // Tắt MSW mặc định khi chạy tích hợp backend thực tế. Chỉ bật khi có cờ VITE_ENABLE_MOCK=true
  const isMockEnabled = import.meta.env.VITE_ENABLE_MOCK === 'true';

  if (isMockEnabled) {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
    });
    console.log('[MSW] Mocking enabled.');
  }
}

prepareApp()
  .then(() => {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch((err) => {
    console.error('Lỗi khi khởi tạo ứng dụng:', err);
  });
