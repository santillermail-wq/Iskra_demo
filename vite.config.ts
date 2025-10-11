import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  // 'define' block for process.env is removed.
  // Vite automatically handles environment variables prefixed with VITE_
  // and exposes them on `import.meta.env`.
  resolve: {
    alias: {
      '@': path.resolve('.'),
    }
  }
});