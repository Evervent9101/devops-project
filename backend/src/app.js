const express = require('express');
const cors = require('cors');
const client = require('prom-client');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ---- Prometheus metrics ----
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });

  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [register],
  });

  app.use((req, res, next) => {
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      const route = req.route ? req.baseUrl + req.route.path : req.path;
      end({ method: req.method, route, status: res.statusCode });
    });
    next();
  });

  // ---- In-memory data (swap for a DB later) ----
  const items = [
    { id: 1, name: 'Set up Jenkins', done: true },
    { id: 2, name: 'Deploy with PM2', done: false },
  ];
  let nextId = 3;

  // ---- Routes ----
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() });
  });

  app.get('/api/info', (req, res) => {
    res.json({
      app: 'devops-backend',
      version: process.env.APP_VERSION || 'dev',
      build: process.env.BUILD_NUMBER || 'local',
      node: process.version,
    });
  });

  app.get('/api/items', (req, res) => res.json(items));

  app.post('/api/items', (req, res) => {
    const name = (req.body && req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const item = { id: nextId++, name, done: false };
    items.push(item);
    res.status(201).json(item);
  });

  app.patch('/api/items/:id', (req, res) => {
    const item = items.find((i) => i.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: 'not found' });
    if (typeof req.body.done === 'boolean') item.done = req.body.done;
    res.json(item);
  });

  app.delete('/api/items/:id', (req, res) => {
    const idx = items.findIndex((i) => i.id === Number(req.params.id));
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    items.splice(idx, 1);
    res.status(204).end();
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  return app;
}

module.exports = { createApp };
