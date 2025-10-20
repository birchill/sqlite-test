import { isObject } from '../utils/is-object';

import * as SQLite from './sqlite-api.js';
import SQLiteAsyncESMFactory from './wa-sqlite-async.js';
import type { SQLiteAPI } from './sqlite-api.js';
import {
  createWordsWithSeparateIndex,
  dropWordsWithSeparateIndex,
  populateWordsWithSeparateIndex,
} from './words';

(async () => {
  const module = await SQLiteAsyncESMFactory();
  const sqlite3 = SQLite.Factory(module);

  const namespace = await import('./IDBBatchAtomicVFS.js');
  const vfs = await namespace.IDBBatchAtomicVFS.create('wa-sqlite', module, {
    durability: 'relaxed',
  });
  sqlite3.vfs_register(vfs, true);

  addEventListener('message', (e) => {
    if (!isObject(e) || e.data.type !== 'start') {
      return;
    }

    const source = e.data.source as string;
    const batchSize = e.data.batchSize as number;

    runTest(sqlite3, source, batchSize).then((results) => {
      postMessage({ type: 'result', ...results });
    });
  });

  postMessage('ready');
})();

async function runTest(
  sqlite3: SQLiteAPI,
  source: string,
  batchSize: number
): Promise<{ insertDur: number; queryDur: number }> {
  const db = await sqlite3.open_v2('sqlite-test');
  try {
    await sqlite3.exec(db, 'PRAGMA locking_mode=exclusive');

    // Drop any existing tables
    await dropWordsWithSeparateIndex({ sqlite3, db });
    await createWordsWithSeparateIndex({ sqlite3, db });

    const start = performance.now();
    await populateWordsWithSeparateIndex({
      sqlite3,
      db,
      batchSize,
      source,
    });

    const insertDur = performance.now() - start;

    // Measure query performance
    const queryStart = performance.now();
    await sqlite3.exec(
      db,
      "select words.json from readings join words on readings.id = words.id where readings.r glob '企業%'"
    );
    const queryDur = performance.now() - queryStart;

    // Tidy up
    await dropWordsWithSeparateIndex({ sqlite3, db });

    return { insertDur, queryDur };
  } finally {
    await sqlite3.close(db);
  }
}
