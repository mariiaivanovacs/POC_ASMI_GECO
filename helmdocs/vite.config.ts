import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// BASE_PATH=/document-assembly/ (or /genai-learning/) builds the app for a sub-path behind nginx — see deploy/
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});
