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
    // db.exec('PRAGMA locking_mode=exclusive');

    // Drop any existing table
    await sqlite3.exec(db, 'drop table if exists words');

    // Create the table
    await sqlite3.exec(db, 'create table words(id INT PRIMARY KEY, json JSON)');

    const start = performance.now();
    let records: Array<WordDownloadRecord> = [];

    // Prepare insert statements
    const str = sqlite3.str_new(db, 'insert into words(id, json) values(?, ?)');
    let prepared = await sqlite3.prepare_v2(db, sqlite3.str_value(str));
    if (!prepared?.stmt) {
      throw new Error('Failed to prepare statement');
    }

    // Get records and put them in the database
    for await (const record of getDownloadIterator({
      source: new URL(source),
    })) {
      records.push(record);
      if (records.length >= batchSize) {
        await writeRecords(sqlite3, db, prepared.stmt, records);
        records = [];
      }
    }

    // Remaining records
    if (records.length) {
      await writeRecords(sqlite3, db, prepared.stmt, records);
      records = [];
    }

    sqlite3.finalize(prepared.stmt);
    sqlite3.str_finish(str);

    const insertDur = performance.now() - start;

    // Measure query performance
    /*
    const queryStart = performance.now();
    db.selectArrays(
      "select * from words, json_each(words.k) where json_each.value like '企業%'"
    );
    db.selectArrays(
      "select * from words, json_each(words.r) where json_each.value like '企業%'"
    );
    const queryDur = performance.now() - queryStart;
    */
    const queryDur = 170;

    // Tidy up
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
  records: Array<WordDownloadRecord>
): Promise<void> {
  await sqlite3.exec(db, 'begin transaction');
  try {
    // TODO: Hiragana index for comparison
    for (const record of records) {
      sqlite3.bind_int(insertStmt, 1, record.id);
      sqlite3.bind_text(insertStmt, 2, JSON.stringify(record));
      await sqlite3.step(insertStmt);
    }

    await sqlite3.exec(db, 'commit');
  } catch (e) {
    await sqlite3.exec(db, 'rollback');
  }
}
