import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  test: { include: ['api/**/*.test.ts', 'shared/**/*.test.ts', 'scripts/**/*.test.ts'] },
} as never);
