// server.js - Simple SPA server for Render deployment
// Serves React app and handles SPA routing (fallback to index.html)

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import compression from 'compression';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(compression());
app.use((req, res, next) => {
  res.set('Cache-Control', 'public, max-age=0, must-revalidate');
  next();
});

// Serve static assets (JS, CSS, images, etc.) with long cache
app.use(
  express.static(path.join(__dirname, 'dist'), {
    setHeaders: (res, filePath) => {
      if (filePath.match(/\.(js|css)$/i)) {
        // Cache busted files (hashed names) can be cached long-term
        if (filePath.match(/\.[a-f0-9]{8}\.(js|css)$/i)) {
          res.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    },
  })
);

// SPA fallback: serve index.html for all non-file requests
app.get('*', (req, res) => {
  // Don't redirect API calls or actual file requests
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    res.status(404).send('Not found');
    return;
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SPA server running on http://0.0.0.0:${PORT}`);
});
