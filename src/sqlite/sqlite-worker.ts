/// <reference path="./sqlite3.d.ts"/>
import {
  type WordDownloadRecord,
  getDownloadIterator,
} from '../common/download';
import { isObject } from '../utils/is-object';

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

    // Drop any existing table
    db.exec(['drop table if exists readings;', 'drop table if exists words']);

    // Create the table
    db.exec([
      'create table words(id INT PRIMARY KEY NOT NULL, json JSON NOT NULL);',
      'create table readings(id INT NOT NULL, r TEXT NOT NULL, PRIMARY KEY(id, r), FOREIGN KEY(id) REFERENCES words(id)) WITHOUT ROWID;',
      'create index readings_r on readings(r)',
    ]);

    if (useTriggers) {
      db.exec([
        'CREATE TRIGGER words_add AFTER INSERT ON words BEGIN ',
        "INSERT INTO readings(id, r) select new.id, j.value from json_each(new.json, '$.r') as j;",
        "INSERT INTO readings(id, r) select new.id, j.value from json_each(new.json, '$.k') as j;",
        'END',
      ]);
    }

    const start = performance.now();
    let records: Array<WordDownloadRecord> = [];

    // Get records and put them in the database
    for await (const record of getDownloadIterator({
      source: new URL(source),
    })) {
      records.push(record);
      if (records.length >= batchSize) {
        await writeRecordsWithSeparateIndex({
          db,
          records,
          useTriggers,
        });
        records = [];
      }
    }

    // Remaining records
    if (records.length) {
      await writeRecordsWithSeparateIndex({
        db,
        useTriggers,
        records,
      });
      records = [];
    }

    const insertDur = performance.now() - start;

    // Measure query performance
    const queryStart = performance.now();
    db.selectArrays(
      "select words.json from readings join words on readings.id = words.id where readings.r glob '企業%'"
    );
    const queryDur = performance.now() - queryStart;

    // Tidy up
    db.exec(['drop table readings;', 'drop table words']);

    return { insertDur, queryDur, db };
  } finally {
    db.close();
    await poolUtil.wipeFiles();
  }
}

async function writeRecordsWithSeparateIndex({
  db,
  records,
  useTriggers,
}: {
  db: DB;
  records: Array<WordDownloadRecord>;
  useTriggers?: boolean;
}): Promise<void> {
  db.transaction(() => {
    const insertStmt = db.prepare('insert into words(id, json) values(?, ?)');

    // If we're not using triggers we need to manually put the readings in the
    // readings table.
    const insertReadingsStmt = useTriggers
      ? null
      : db.prepare('insert into readings(r, id) values(?, ?)');

    for (const record of records) {
      insertStmt
        .bind([record.id, JSON.stringify(record)])
        .stepReset()
        .clearBindings();

      if (insertReadingsStmt) {
        const readings = [...new Set([...(record.k || []), ...record.r])];
        for (const reading of readings) {
          insertReadingsStmt
            .bind([reading, record.id])
            .stepReset()
            .clearBindings();
        }
      }
    }

    insertReadingsStmt?.finalize();
    insertStmt.finalize();
  });
}
