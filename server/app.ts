import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, type AppState } from '../shared/types';
import { applyAction, DomainError, validateState } from './domain';

export function createApp(dbPath = process.env.DATABASE_PATH || resolve('data/study-hall.sqlite')) {
  if (dbPath !== ':memory:') mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO app_state (id, body) VALUES (1, ?)').run(JSON.stringify(initialState()));
  const read = (): AppState => validateState(JSON.parse((db.prepare('SELECT body FROM app_state WHERE id = 1').get() as { body: string }).body));
  try { read(); } catch (error) { db.close(); throw error; } // Never replace a corrupt existing database.
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10mb', strict: true }));
  app.get('/api/health', (_req, res) => { try { db.prepare('SELECT 1').get(); res.json({ ok: true }); } catch { res.status(503).json({ error: 'پایگاه داده در دسترس نیست.' }); } });
  app.get('/api/state', (_req, res, next) => { try { res.setHeader('Cache-Control', 'no-store'); res.json(read()); } catch (error) { next(error); } });
  app.get('/api/backup', (_req, res, next) => {
    try { res.setHeader('Cache-Control', 'no-store'); res.attachment(`study-hall-backup-${new Date().toISOString().slice(0, 10)}.json`).type('json').send(JSON.stringify(read(), null, 2)); } catch (error) { next(error); }
  });
  app.post('/api/actions', (req, res, next) => {
    try {
      db.exec('BEGIN IMMEDIATE');
      let updated: AppState;
      try {
        updated = applyAction(read(), req.body);
        db.prepare('UPDATE app_state SET body = ? WHERE id = 1').run(JSON.stringify(updated));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      res.setHeader('Cache-Control', 'no-store');
      res.json(updated);
    } catch (error) { next(error); }
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'مسیر درخواست پیدا نشد.' }); });
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  if (existsSync(resolve(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => { res.sendFile(resolve(dist, 'index.html')); });
  }
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof DomainError) { res.status(400).json({ error: error.message }); return; }
    const status = typeof error === 'object' && error !== null && 'status' in error ? (error as { status: unknown }).status : undefined;
    if (status === 413) { res.status(413).json({ error: 'حجم اطلاعات از حد مجاز بیشتر است.' }); return; }
    if (error instanceof SyntaxError && status === 400) { res.status(400).json({ error: 'فرمت JSON درخواست معتبر نیست.' }); return; }
    console.error('Study hall API request failed:', error instanceof Error ? error.name : 'Unknown error');
    res.status(500).json({ error: 'ذخیره یا خواندن اطلاعات انجام نشد. دوباره تلاش کنید.' });
  });
  app.locals.closeDatabase = () => db.close();
  return app;
}
