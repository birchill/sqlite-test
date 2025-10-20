/// <reference lib="webworker" />
import { connect, type Database } from '@tursodatabase/database-wasm';
import {
  type WordDownloadRecord,
  getDownloadIterator,
} from '../common/download';
import { isObject } from '../utils/is-object';

declare const self: WorkerGlobalScope;

(async () => {
  // Signal ready to the main thread
  postMessage('ready');

  addEventListener('message', (e) => {
    if (!isObject(e) || e.data?.type !== 'start') {
      return;
    }

    const source = e.data.source as string;
    const batchSize = e.data.batchSize as number;

    runTest(source, batchSize)
      .then((results) => {
        postMessage({ type: 'result', ...results });
      })
      .catch((err: any) => {
        // Post error info back to main thread
        postMessage({
          type: 'error',
          message: err?.message ?? String(err),
          stack: err?.stack,
        });
      });
  });
})();

async function runTest(
  source: string,
  batchSize: number
): Promise<{ insertDur: number; queryDur: number }> {
  let db: Database | null = null;
  try {
    db = await connect('turso.db');

    // Drop any existing tables
    await db.exec('drop table if exists readings');
    await db.exec('drop table if exists words');

    // Create the tables
    await db.exec(
      'create table words(id INT PRIMARY KEY NOT NULL, json JSON NOT NULL); ' +
        'create table readings(id INT NOT NULL, r TEXT NOT NULL, PRIMARY KEY(id, r), FOREIGN KEY(id) REFERENCES words(id));' +
        'create index readings_r on readings(r)'
    );

    const start = performance.now();
    let records: Array<WordDownloadRecord> = [];

    // Get records and put them in the database
    for await (const record of getDownloadIterator({
      source: new URL(source),
    })) {
      records.push(record);
      if (records.length >= batchSize) {
        await writeRecords(db, records);
        records = [];
      }
    }

    // Remaining records
    if (records.length) {
      await writeRecords(db, records);
      records = [];
    }

    const insertDur = performance.now() - start;

    // Measure query performance
    const queryStart = performance.now();
    await db.exec(
      "select words.json from readings join words on readings.id = words.id where readings.r glob '企業%'"
    );
    const queryDur = performance.now() - queryStart;

    // Tidy up
    await db.exec('drop table readings');
    await db.exec('drop table words');

    return { insertDur, queryDur };
  } finally {
    try {
      await db?.close();
    } catch {
      // ignore close errors in worker cleanup
    }
  }
}

async function writeRecords(
  db: Database,
  records: Array<WordDownloadRecord>
): Promise<void> {
  // Prepare insert statements
  const insertStmt = db.prepare('insert into words(id, json) values(?, ?)');
  const insertReadingsStmt = db.prepare(
    'insert into readings(id, r) values(?, ?)'
  );

  await db.exec('begin transaction');
  try {
    for (const record of records) {
      // Insert word JSON
      await insertStmt.run(record.id, JSON.stringify(record));

      // Compute readings (k + r) unique
      const readings = [...new Set([...(record.k || []), ...record.r])];
      for (const reading of readings) {
        await insertReadingsStmt.run(record.id, reading);
      }
    }

    await db.exec('commit');
  } catch (e) {
    // Rollback on any error
    try {
      await db.exec('rollback');
    } catch {
      // ignore rollback errors
    }
    throw e;
  } finally {
    try {
      insertReadingsStmt.close();
    } catch {
      /* ignore */
    }
    try {
      insertStmt.close();
    } catch {
      /* ignore */
    }
  }
}
