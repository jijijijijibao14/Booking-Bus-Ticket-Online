import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

// Do "type": "module" trong package.json,
// tạo lại __filename và __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',

    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '');

        return path.resolve(
          __dirname,
          'FE/assets',
          filename,
        );
      }

      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    react(),
    tailwindcss(),
  ],
  envDir: path.resolve(__dirname, './FE'),

  assetsInclude: [
    '**/*.svg',
    '**/*.csv',
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './FE/app'),
    },
  },

  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,

    allowedHosts: [
      'playoff-flashcard-variety.ngrok-free.dev',
    ],

    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});