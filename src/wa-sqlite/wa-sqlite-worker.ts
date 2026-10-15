import type { SQLiteAPI } from './vendor/src/sqlite-api.js';
import { initWaSqlite } from './init';
import { waSqliteVfsNames, type WaSqliteVfs } from './backends';
import {
  createWordsWithSeparateIndex,
  dropWordsWithSeparateIndex,
  populateWordsWithSeparateIndex,
} from './words';

let sqlite3: SQLiteAPI;
let databaseName: string;
let vfsName: WaSqliteVfs;
addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type === 'init') {
    if (!waSqliteVfsNames.includes(data.vfs)) {
      postMessage({ type: 'error', message: 'Unknown wa-sqlite VFS' });
      return;
    }
    const name = data.vfs as WaSqliteVfs;
    vfsName = name;
    databaseName = `/benchmark-${name}/sqlite-test`;
    initWaSqlite(name)
      .then((result) => {
        sqlite3 = result.sqlite3;
        postMessage('ready');
      })
      .catch((error) => {
        postMessage({
          type: 'error',
          message:
            error?.name === 'NotSupportedError'
              ? `Skipped: ${error.message}`
              : String(error),
        });
      });
  } else if (data?.type === 'start') {
    runTest(sqlite3, data.source, data.batchSize, databaseName, vfsName)
      .then((results) => postMessage({ type: 'result', ...results }))
      .catch((error) => postMessage({ type: 'error', message: String(error) }));
  }
});

async function runTest(
  sqlite3: SQLiteAPI,
  source: string,
  batchSize: number,
  databaseName: string,
  vfs: WaSqliteVfs
): Promise<{ insertDur: number; queryDur: number }> {
  const db = await sqlite3.open_v2(databaseName);
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
    const rows: unknown[][] = [];
    await sqlite3.exec(
      db,
      "select words.json from readings join words on readings.id = words.id where readings.r glob '企業*'",
      (row) => {
        rows.push(row);
      }
    );
    const queryDur = performance.now() - queryStart;

    // Tidy up
    await dropWordsWithSeparateIndex({ sqlite3, db });

    return { insertDur, queryDur };
  } finally {
    try {
      if (vfs === 'OPFSWriteAheadVFS') {
        // Wait for background checkpoints before jClose releases their handles.
        // This cleanup is outside both measured durations.
        await sqlite3.exec(db, 'PRAGMA wal_checkpoint(TRUNCATE)');
      }
    } finally {
      await sqlite3.close(db);
    }
  }
}
