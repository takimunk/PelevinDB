import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { evaluate, AnalysisError } from './server-analysis.mjs';
const app = express();
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.get('/api/status', (_req, res) => res.json({ configured: !!process.env.TYPESAFE_API_KEY }));
let active = 0;
app.post('/api/analyze', async (req, res) => {
  // This prototype binds to loopback by default; reject cross-site browser calls.
  const origin = req.headers.origin;
  if (origin && origin !== `${req.protocol}://${req.headers.host}`) return res.status(403).json({ error: 'Недопустимый источник запроса.' });
  if (!process.env.TYPESAFE_API_KEY) return res.status(503).json({ error: 'Добавьте TYPESAFE_API_KEY в .env и перезапустите сервер.' });
  if (typeof req.body?.text !== 'string' || !req.body.text.trim() || req.body.text.length > 1800) return res.status(400).json({ error: 'Ожидается текст длиной от 1 до 1 800 знаков.' });
  if (active >= 4) return res.status(429).json({ error: 'Все 4 оператора заняты. Дождитесь завершения и нажмите «Продолжить».' });
  active++;
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try { res.json(await evaluate(req.body.text, process.env.TYPESAFE_API_KEY, controller.signal)); }
  catch (error) { if (!res.destroyed) res.status(error instanceof AnalysisError ? error.status : 502).json({ error: error instanceof AnalysisError ? error.message : 'Jev не ответил. Уже готовые оценки сохранены; попробуйте продолжить.' }); }
  finally { active--; }
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Неизвестный API endpoint.' }));
app.use((error, _req, res, next) => {
  if (error) res.status(400).json({ error: 'Некорректный или слишком большой запрос.' }); else next();
});
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(port, host, () => console.log(`xbook running at http://${host}:${port}`));
