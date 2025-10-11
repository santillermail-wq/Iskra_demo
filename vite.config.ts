import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
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
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
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
  }
});