import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Get backend port from environment variable or default to 8080
    const backendPort = env.PORT || env.BACKEND_PORT || '8080';
    const backendUrl = `http://localhost:${backendPort}`;
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: {
          port: 3000,
          host: 'localhost',
        },
        proxy: {
          '/api': {
            target: backendUrl,
            changeOrigin: true,
            secure: false,
          },
          '/data': {
            target: backendUrl,
            changeOrigin: true,
            secure: false,
            // Don't rewrite the path - keep /data as is
          },
        },
      },
      plugins: [
        react(),
        // Plugin to copy data folder to dist during build
        {
          name: 'copy-data-folder',
          writeBundle() {
            const dataDir = path.resolve(__dirname, 'data');
            const distDataDir = path.resolve(__dirname, 'dist/data');
            try {
              if (existsSync(dataDir) && statSync(dataDir).isDirectory()) {
                mkdirSync(distDataDir, { recursive: true });
                const files = readdirSync(dataDir);
                let copiedCount = 0;
                files.forEach(file => {
                  const srcPath = path.join(dataDir, file);
                  const destPath = path.join(distDataDir, file);
                  if (statSync(srcPath).isFile()) {
                    copyFileSync(srcPath, destPath);
                    copiedCount++;
                  }
                });
                console.log(`✓ Copied ${copiedCount} CSV files from data folder to dist/data`);
              } else {
                console.warn('Data folder not found, skipping copy');
              }
            } catch (err) {
              console.warn('Could not copy data folder:', err);
            }
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
