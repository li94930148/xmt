import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import fs from 'fs'
import path from 'path'

const hasCerts = fs.existsSync(path.resolve(__dirname, 'certs/server.key'))
  && fs.existsSync(path.resolve(__dirname, 'certs/server.cert'))

// 读取 package.json 中的版本号
const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5174,
    ...(hasCerts ? {
      https: {
        key: fs.readFileSync(path.resolve(__dirname, 'certs/server.key')),
        cert: fs.readFileSync(path.resolve(__dirname, 'certs/server.cert')),
      },
    } : {}),
    proxy: {
      '/api': {
        target: hasCerts ? 'https://localhost:3001' : 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
        },
      },
      '/socket.io': {
        target: hasCerts ? 'https://localhost:3001' : 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    }
  }
})
