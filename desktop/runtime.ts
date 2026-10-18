import { join } from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../server/app';

/** This module is also exercised under Electron's actual embedded Node runtime. */
export async function startRuntime(dataDirectory: string) {
  const databasePath = join(dataDirectory, 'study-hall.sqlite');
  const api = createApp(databasePath);
  let server: Server;
  try {
    server = await new Promise<Server>((resolve, reject) => {
      const listening = api.listen(0, '127.0.0.1', () => resolve(listening));
      listening.once('error', reject);
    });
  } catch (error) { api.locals.closeDatabase(); throw error; }
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local server did not acquire a port.');
  let closing: Promise<void> | undefined;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    databasePath,
    close() {
      return closing ??= new Promise<void>((resolve, reject) => {
        server.close(error => { api.locals.closeDatabase(); if (error) reject(error); else resolve(); });
      });
    },
  };
}
