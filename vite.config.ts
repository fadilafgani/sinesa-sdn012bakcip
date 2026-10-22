import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-core';
            }
            if (id.includes('framer-motion')) {
              return 'framer-motion';
            }
            if (id.includes('lucide-react')) {
              return 'lucide';
            }
            if (id.includes('canvas-confetti')) {
              return 'confetti';
            }
            if (id.includes('recharts') || id.includes('d3')) {
              return 'recharts';
            }
            if (id.includes('jspdf')) {
              return 'jspdf';
            }
            return 'vendor';
          }
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1',
        changeOrigin: true,
        headers: {
          Host: 'evaluasi-bakcip.test',
        },
        configure: (proxy) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('[VITE PROXY ERROR]', err);
          });
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            console.log('[VITE PROXY REQ]', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('[VITE PROXY RES]', proxyRes.statusCode, req.url);
          });
        }
      },
      '/uploads': {
        target: 'http://127.0.0.1',
        changeOrigin: true,
        headers: {
          Host: 'evaluasi-bakcip.test',
        },
      }
    }
  }
})
