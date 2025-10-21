import { isObject } from '../utils/is-object';
import * as SQLite from './sqlite-api.js';
import SQLiteAsyncESMFactory from './wa-sqlite-async.js';
import type { SQLiteAPI } from './sqlite-api.js';
import {
  WA_SQLITE_STORAGE_DB_NAME,
  createWordsWithSeparateIndex,
  dropWordsWithSeparateIndex,
  populateWordsWithSeparateIndex,
  vacuum,
} from './words';

type StorageMessage =
  | {
      id: number;
      type: 'load';
      batchSize: number;
      source: string;
    }
  | {
      id: number;
      type: 'clear';
    };

(async () => {
  const module = await SQLiteAsyncESMFactory();
  const sqlite3 = SQLite.Factory(module);

  const namespace = await import('./IDBBatchAtomicVFS.js');
  const vfs = await namespace.IDBBatchAtomicVFS.create('wa-sqlite', module, {
    durability: 'relaxed',
  });
  sqlite3.vfs_register(vfs, true);

  addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!isObject(data)) {
      return;
    }

    const message = data as Partial<StorageMessage>;
    if (typeof message.type !== 'string' || typeof message.id !== 'number') {
      return;
    }

    void (async () => {
      try {
        if (message.type === 'load') {
          if (
            typeof message.source !== 'string' ||
            typeof message.batchSize !== 'number'
          ) {
            throw new Error('Invalid load request');
          }

          await loadDatabase(sqlite3, message.source, message.batchSize);
          postMessage({ type: 'done', id: message.id, action: 'load' });
        } else if (message.type === 'clear') {
          await clearDatabase(sqlite3);
          postMessage({ type: 'done', id: message.id, action: 'clear' });
        }
      } catch (error) {
        console.error(error);
        const messageText =
          error instanceof Error
            ? error.message
            : `Unknown error: ${String(error)}`;
        postMessage({ type: 'error', id: message.id, message: messageText });
      }
    })();
  });

  postMessage({ type: 'ready' });
})();

async function loadDatabase(
  sqlite3: SQLiteAPI,
  source: string,
  batchSize: number
): Promise<void> {
  const db = await sqlite3.open_v2(WA_SQLITE_STORAGE_DB_NAME);
  try {
    await sqlite3.exec(db, 'PRAGMA locking_mode=exclusive');
    await dropWordsWithSeparateIndex({ sqlite3, db });
    await vacuum(sqlite3, db);
    await createWordsWithSeparateIndex({ sqlite3, db });
    await populateWordsWithSeparateIndex({
      sqlite3,
      db,
      batchSize,
      source,
    });
  } finally {
    await sqlite3.close(db);
  }
}

async function clearDatabase(sqlite3: SQLiteAPI): Promise<void> {
  const db = await sqlite3.open_v2(WA_SQLITE_STORAGE_DB_NAME);
  try {
    await sqlite3.exec(db, 'PRAGMA locking_mode=exclusive');
    await dropWordsWithSeparateIndex({ sqlite3, db });
    await vacuum(sqlite3, db);
  } finally {
    await sqlite3.close(db);
  }
}
