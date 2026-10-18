import { createApp } from './app';

const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
const host = process.env.HOST || '127.0.0.1';
const app = createApp();
const server = app.listen(port, host, () => console.log(`Study hall API running at http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(() => { app.locals.closeDatabase(); process.exit(0); }); });
