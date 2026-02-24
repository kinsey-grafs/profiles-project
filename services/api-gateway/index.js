/**
 * API Gateway - forwards requests to the backend service.
 * Instrumentation must be initialized before any other imports.
 */
const path = require('path');
const { initTracing, initPyroscope, getLogger } = require(path.join(__dirname, '../../instrumentation'));

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'api-gateway';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

(async () => {
  await initTracing(SERVICE_NAME);
  await initPyroscope(SERVICE_NAME, {}, { sourceMapperRootDirs: [path.join(__dirname, '../..')] });

  const log = getLogger(SERVICE_NAME);

  const express = require('express');
  const fetch = require('node-fetch');

  const app = express();
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME });
  });

  app.get('/api/items', async (req, res) => {
    try {
      log.info('Fetching items from backend', { path: '/api/items' });
      const backendUrl = new URL('/api/items', BACKEND_URL);
      const response = await fetch(backendUrl.toString());
      const data = await response.json();
      log.info('Items fetched successfully', { count: data?.length ?? 0 });
      res.json(data);
    } catch (err) {
      log.error('Backend request failed', { path: '/api/items', error: err.message });
      res.status(502).json({ error: err.message });
    }
  });

  app.post('/api/items', async (req, res) => {
    try {
      const name = req.body?.name;
      log.info('Creating item', { name });
      const backendUrl = new URL('/api/items', BACKEND_URL);
      const response = await fetch(backendUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (err) {
      log.error('Backend request failed', { path: '/api/items', method: 'POST', error: err.message });
      res.status(502).json({ error: err.message });
    }
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    log.info('Listening', { port, backend: BACKEND_URL });
  });
})();
