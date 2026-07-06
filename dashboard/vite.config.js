// Vite config — scaffold only, no app logic yet.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Dashboard API calls proxy to backend during dev.
      // Implementation pending — see backend/src/dashboard_api.
      '/api': 'http://localhost:4000',
    },
  },
});
