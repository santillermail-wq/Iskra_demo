import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения для текущего режима (development, production)
  // Третий параметр '' загружает все переменные, а не только с префиком GEMINI_
  // FIX: Cast `process` to `any` to bypass TypeScript error when `process.cwd` is not found on the type definition.
  // This is safe because vite.config.ts runs in a Node.js environment where `process.cwd` is always available.
  const env = loadEnv(mode, (process as any).cwd(), '');

  return {
    define: {
      // Делаем переменную GEMINI_API_KEY доступной в клиентском коде как process.env.GEMINI_API_KEY
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      }
    },
    build: {
      // Увеличиваем лимит для предупреждения о размере чанка до 1500 kB.
      // Это убирает предупреждение от Vercel, не затрагивая логику приложения.
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Все библиотеки из node_modules будут сгруппированы в один чанк 'vendor'.
            // Это помогает уменьшить размер основного чанка приложения.
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          },
        },
      },
    },
  };
});