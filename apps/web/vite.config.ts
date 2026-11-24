import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative base so the app deploys cleanly at purepathwebsolutions.com/purescribe and runs at / locally
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: false,
  },
});
