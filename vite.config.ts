// @ts-nocheck
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'child_process'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'run-fetch-metadata-plugin',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/api/save-snapshot') && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, 'src', 'data', 'market_snapshot.json');
                
                // Write body directly to src/data/market_snapshot.json
                fs.writeFileSync(filePath, body, 'utf8');
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, size: body.length }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
          } else if (req.url?.startsWith('/api/save-favorites') && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, 'src', 'data', 'favorites.json');
                
                // Write body directly to src/data/favorites.json
                fs.writeFileSync(filePath, body, 'utf8');
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, size: body.length }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
          } else if (req.url?.startsWith('/api/run-fetch-metadata')) {
            exec('python3 scratch/fetch_metadata.py', (error, stdout, stderr) => {
              if (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message, stderr }));
                return;
              }
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, stdout }));
            });
          } else {
            next();
          }
        });
      }
    }
  ],
  server: {
    proxy: {
      '/sina-openapi': {
        target: 'http://money.finance.sina.com.cn',
        changeOrigin: true,
        secure: false,
        headers: {
          Referer: 'http://finance.sina.com.cn/',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        rewrite: (path) => path.replace(/^\/sina-openapi/, '')
      },
      '/tencent-kline': {
        target: 'https://web.ifzq.gtimg.cn',
        changeOrigin: true,
        secure: false,
        headers: {
          Referer: 'https://quote.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        rewrite: (path) => path.replace(/^\/tencent-kline/, '')
      },
      '/eastmoney-kline': {
        target: 'https://push2his.eastmoney.com',
        changeOrigin: true,
        secure: false,
        headers: {
          Referer: 'https://quote.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        rewrite: (path) => path.replace(/^\/eastmoney-kline/, '')
      },
      '/eastmoney-suggest': {
        target: 'https://searchapi.eastmoney.com',
        changeOrigin: true,
        secure: false,
        headers: {
          Referer: 'https://quote.eastmoney.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        rewrite: (path) => path.replace(/^\/eastmoney-suggest/, '')
      }
    }
  }
})

