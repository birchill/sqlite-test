/// <reference path="./sqlite3.d.ts"/>
import {
  type WordDownloadRecord,
  getDownloadIterator,
} from '../common/download';
import { isObject } from '../utils/is-object';
import {
  createWordsWithSeparateIndex,
  dropWordsWithSeparateIndex,
  populateWordsWithSeparateIndex,
} from './words';

import './sqlite3.js';

declare var self: WorkerGlobalScope;

(async () => {
  const sqlite3 = await sqlite3InitModule({
    print: (...args) => console.log(...args),
    printErr: (...args) => console.error(...args),
  });

  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ clearOnInit: true });

  addEventListener('message', (e) => {
    if (!isObject(e) || e.data.type !== 'start') {
      return;
    }

    const source = e.data.source as string;
    const batchSize = e.data.batchSize as number;
    const separateIndex = !!e.data.separateIndex;
    const useTriggers = !!e.data.useTriggers;

    const testFn = separateIndex
      ? useTriggers
        ? (poolUtil: OpfsSAHPoolUtil, source: string, batchSize: number) =>
            runTestWithSeparateIndex(poolUtil, source, batchSize, true)
        : runTestWithSeparateIndex
      : runTest;

    testFn(poolUtil, source, batchSize).then((results) => {
      postMessage({ type: 'result', ...results });
    });
  });

  postMessage('ready');
})();

async function runTest(
  poolUtil: OpfsSAHPoolUtil,
  source: string,
  batchSize: number
): Promise<{ insertDur: number; queryDur: number }> {
  const db = new poolUtil.OpfsSAHPoolDb('/sqlite-test');
  try {
    db.exec('PRAGMA locking_mode=exclusive');

    // Drop any existing table
    db.exec(['drop table if exists words']);

    // Create the table
    db.exec(['create table words(id INT PRIMARY KEY, k, km, r, rm, s)']);

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
    db.selectArrays(
      "select * from words, json_each(words.k) where json_each.value glob '企業%'"
    );
    db.selectArrays(
      "select * from words, json_each(words.r) where json_each.value glob '企業%'"
    );
    const queryDur = performance.now() - queryStart;

    // Tidy up
    db.exec(['drop table words']);

    return { insertDur, queryDur };
  } finally {
    db.close();
    await poolUtil.wipeFiles();
  }
}

async function writeRecords(
  db: DB,
  records: Array<WordDownloadRecord>
): Promise<void> {
  db.transaction(() => {
    const insertStmt = db.prepare(
      'insert into words(id, k, km, r, rm, s) values(?, ?, ?, ?, ?, ?)'
    );

    for (const record of records) {
      insertStmt
        .bind([
          record.id,
          record.k ? JSON.stringify(record.k) : null,
          record.km
            ? JSON.stringify(
                record.km.map((elem) => (elem === 0 ? null : elem))
              )
            : null,
          JSON.stringify(record.r),
          record.rm
            ? JSON.stringify(
                record.rm.map((elem) => (elem === 0 ? null : elem))
              )
            : null,
          JSON.stringify(record.s),
        ])
        .stepReset()
        .clearBindings();
    }

    insertStmt.finalize();
  });
}

async function runTestWithSeparateIndex(
  poolUtil: OpfsSAHPoolUtil,
  source: string,
  batchSize: number,
  useTriggers?: boolean
): Promise<{ insertDur: number; queryDur: number; db: DB }> {
  const db = new poolUtil.OpfsSAHPoolDb('/sqlite-test');
  try {
    db.exec('PRAGMA locking_mode = exclusive');

    dropWordsWithSeparateIndex(db);
    createWordsWithSeparateIndex({ db, useTriggers });

    const start = performance.now();
    await populateWordsWithSeparateIndex({
      db,
      batchSize,
      source,
      useTriggers,
    });

    const insertDur = performance.now() - start;

    // Measure query performance
    const queryStart = performance.now();
    db.selectArrays(
      "select words.json from readings join words on readings.id = words.id where readings.r glob '企業%'"
    );
    const queryDur = performance.now() - queryStart;

    // Tidy up
    dropWordsWithSeparateIndex(db);

    return { insertDur, queryDur, db };
  } finally {
    db.close();
    await poolUtil.wipeFiles();
  }
}
