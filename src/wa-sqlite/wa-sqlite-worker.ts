import {
  type WordDownloadRecord,
  getDownloadIterator,
} from '../common/download';
import { isObject } from '../utils/is-object';

import SQLiteAsyncESMFactory from './wa-sqlite-async.js';
import * as SQLite from './sqlite-api.js';
import type { SQLiteAPI } from './sqlite-api.js';

(async () => {
  const module = await SQLiteAsyncESMFactory();
  const sqlite3 = SQLite.Factory(module);

  const namespace = await import('./IDBBatchAtomicVFS.js');
  const vfs = new namespace.IDBBatchAtomicVFS();
  await vfs.isReady;
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
    await sqlite3.exec(db, 'drop table if exists readings');
    await sqlite3.exec(db, 'drop table if exists words');

    // Create the tables
    await sqlite3.exec(
      db,
      'create table words(id INT PRIMARY KEY NOT NULL, json JSON NOT NULL)'
    );
    await sqlite3.exec(
      db,
      'create table readings(id INT NOT NULL, r TEXT NOT NULL, PRIMARY KEY(id, r), FOREIGN KEY(id) REFERENCES words(id)) WITHOUT ROWID'
    );
    await sqlite3.exec(db, 'create index readings_r on readings(r)');

    const start = performance.now();
    let records: Array<WordDownloadRecord> = [];

    // Prepare insert statements
    const str = sqlite3.str_new(db, 'insert into words(id, json) values(?, ?)');
    let prepared = await sqlite3.prepare_v2(db, sqlite3.str_value(str));
    if (!prepared?.stmt) {
      throw new Error('Failed to prepare insert statement');
    }

    const readingsStr = sqlite3.str_new(
      db,
      'insert into readings(id, r) values(?, ?)'
    );
    let preparedReadings = await sqlite3.prepare_v2(
      db,
      sqlite3.str_value(readingsStr)
    );
    if (!preparedReadings?.stmt) {
      throw new Error('Failed to prepare readings statement');
    }

    // Get records and put them in the database
    for await (const record of getDownloadIterator({
      source: new URL(source),
    })) {
      records.push(record);
      if (records.length >= batchSize) {
        await writeRecords(
          sqlite3,
          db,
          prepared.stmt,
          preparedReadings.stmt,
          records
        );
        records = [];
      }
    }

    // Remaining records
    if (records.length) {
      await writeRecords(
        sqlite3,
        db,
        prepared.stmt,
        preparedReadings.stmt,
        records
      );
      records = [];
    }

    sqlite3.finalize(preparedReadings.stmt);
    sqlite3.str_finish(readingsStr);

    sqlite3.finalize(prepared.stmt);
    sqlite3.str_finish(str);

    const insertDur = performance.now() - start;

    // Measure query performance
    const queryStart = performance.now();
    await sqlite3.exec(
      db,
      "select words.json from readings join words on readings.id = words.id where readings.r glob '企業%'"
    );
    const queryDur = performance.now() - queryStart;

    // Tidy up
    await sqlite3.exec(db, 'drop table readings');
    await sqlite3.exec(db, 'drop table words');

    return { insertDur, queryDur };
  } finally {
    await sqlite3.close(db);
  }
}

async function writeRecords(
  sqlite3: SQLiteAPI,
  db: number,
  insertStmt: number,
  insertReadingsStmt: number,
  records: Array<WordDownloadRecord>
): Promise<void> {
  await sqlite3.exec(db, 'begin transaction');
  try {
    for (const record of records) {
      sqlite3.bind_int(insertStmt, 1, record.id);
      sqlite3.bind_text(insertStmt, 2, JSON.stringify(record));
      await sqlite3.step(insertStmt);

      const readings = [...new Set([...(record.k || []), ...record.r])];
      for (const reading of readings) {
        sqlite3.bind_int(insertReadingsStmt, 1, record.id);
        sqlite3.bind_text(insertReadingsStmt, 2, reading);
        await sqlite3.step(insertReadingsStmt);
      }
    }

    await sqlite3.exec(db, 'commit');
  } catch (e) {
    await sqlite3.exec(db, 'rollback');
  }
}
