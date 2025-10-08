import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          // FIX: `process.cwd()` was causing a TypeScript error: "Property 'cwd' does not exist on type 'Process'".
          // Replaced `path.resolve(process.cwd(), '.')` with `path.resolve('.')`.
          // `path.resolve` defaults to the current working directory for relative paths,
          // achieving the same result of pointing the '@' alias to the project root.
          '@': path.resolve('.'),
        }
      }
    };
});