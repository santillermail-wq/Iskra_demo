import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Загружает переменные окружения из .env файлов.
  // Третий параметр '' заставляет загружать все переменные, а не только с префиксом VITE_.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    // Этот блок `define` делает API_KEY доступным на стороне клиента
    // как `process.env.API_KEY`. Это правильный способ для Vite
    // передавать переменные окружения в код без использования префикса `VITE_`.
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve('.'),
      }
    }
  };
});
