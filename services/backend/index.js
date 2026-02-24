/**
 * Backend service - in-memory data store.
 * Instrumentation must be initialized before any other imports.
 */
const path = require('path');
const { initTracing, initPyroscope, getLogger } = require(path.join(__dirname, '../../instrumentation'));

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'backend';

(async () => {
  await initTracing(SERVICE_NAME);
  await initPyroscope(SERVICE_NAME, {}, { sourceMapperRootDirs: [path.join(__dirname, '../..')] });

  const log = getLogger(SERVICE_NAME);

  const express = require('express');

  const app = express();
  app.use(express.json());

  const items = [];

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME });
  });

  app.get('/api/items', (req, res) => {
    log.info('Returning items', { count: items.length });
    res.json(items);
  });

  app.post('/api/items', (req, res) => {
    const name = req.body?.name;
    if (!name || typeof name !== 'string') {
      log.warn('Invalid item creation request', { reason: 'name is required' });
      return res.status(400).json({ error: 'name is required' });
    }
    const item = { id: items.length + 1, name };
    items.push(item);
    log.info('Item created', { id: item.id, name: item.name });
    res.status(201).json(item);
  });

  const port = process.env.PORT || 3001;
  app.listen(port, () => {
    log.info('Listening', { port });
  });
})();
