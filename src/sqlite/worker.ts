/// <reference path="./sqlite3.d.ts"/>
import { kanaToHiragana } from '@birchill/normal-jp';
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
    const saveFile = !!e.data.saveFile;

    const testFn = separateIndex
      ? useTriggers
        ? (poolUtil: OpfsSAHPoolUtil, source: string, batchSize: number) =>
            runTestWithSeparateIndex(
              poolUtil,
              source,
              batchSize,
              true,
              saveFile
            )
        : (poolUtil: OpfsSAHPoolUtil, source: string, batchSize: number) =>
            runTestWithSeparateIndex(
              poolUtil,
              source,
              batchSize,
              false,
              saveFile
            )
      : runTest;

    testFn(poolUtil, source, batchSize).then((results) => {
      let buffer: Uint8Array | null = null;
      if (saveFile) {
        buffer = sqlite3.capi.sqlite3_js_db_export(
          (results as Awaited<ReturnType<typeof runTestWithSeparateIndex>>).db
            .pointer
        );
      }

      if (buffer) {
        postMessage({ type: 'result', ...results, file: buffer }, [
          buffer.buffer,
        ]);
      } else {
        postMessage({ type: 'result', ...results });
      }
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
    db.exec(['create table words(id INT PRIMARY KEY, k, km, r, rm, h, s)']);

    const start = performance.now();
    let records: Array<WordDownloadRecord> = [];

    // Get records and put them in the database
    const insertStmt = db.prepare(
      'insert into words(id, k, km, r, rm, h, s) values(?, ?, ?, ?, ?, ?, ?)'
    );

    for await (const record of getDownloadIterator({
      source: new URL(source),
    })) {
      records.push(record);
      if (records.length >= batchSize) {
        await writeRecords(db, insertStmt, records);
        records = [];
      }
    }

    // Remaining records
    if (records.length) {
      await writeRecords(db, insertStmt, records);
      records = [];
    }

    insertStmt.finalize();

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
  insertStmt: PreparedStatement,
  records: Array<WordDownloadRecord>
): Promise<void> {
  db.transaction(() => {
    // TODO: Try batching inputs like so: 'insert into t(a) values(10),(20),(30)'
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
          JSON.stringify(keysToHiragana([...(record.k || []), ...record.r])),
          JSON.stringify(record.s),
        ])
        .stepReset()
        .clearBindings();
    }
  });
}

async function runTestWithSeparateIndex(
  poolUtil: OpfsSAHPoolUtil,
  source: string,
  batchSize: number,
  useTriggers?: boolean,
  saveFile?: boolean
): Promise<{ insertDur: number; queryDur: number; db: DB }> {
  const db = new poolUtil.OpfsSAHPoolDb('/sqlite-test');
  try {
    db.exec('PRAGMA locking_mode = exclusive');
    db.exec('PRAGMA foreign_keys = ON');

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
    const insertStmt = db.prepare('insert into words(id, json) values(?, ?)');
    const insertReadingsStmt = useTriggers
      ? null
      : db.prepare('insert into readings(r, id) values(?, ?)');

    for await (const record of getDownloadIterator({
      source: new URL(source),
    })) {
      records.push(record);
      if (records.length >= batchSize) {
        await writeRecordsWithSeparateIndex({
          db,
          insertStmt,
          insertReadingsStmt,
          records,
        });
        records = [];
      }
    }

    // Remaining records
    if (records.length) {
      await writeRecordsWithSeparateIndex({
        db,
        insertStmt,
        insertReadingsStmt,
        records,
      });
      records = [];
    }

    insertStmt.finalize();

    const insertDur = performance.now() - start;

    // Measure query performance
    const queryStart = performance.now();
    db.selectArrays(
      "select words.json from readings join words on readings.id = words.id where readings.r glob '企業%'"
    );
    const queryDur = performance.now() - queryStart;

    if (!saveFile) {
      // Tidy up
      db.exec(['drop table readings;', 'drop table words']);
    }

    return { insertDur, queryDur, db };
  } finally {
    if (!saveFile) {
      db.close();
    }
    await poolUtil.wipeFiles();
  }
}

async function writeRecordsWithSeparateIndex({
  db,
  insertStmt,
  insertReadingsStmt,
  records,
}: {
  db: DB;
  insertStmt: PreparedStatement;
  insertReadingsStmt: PreparedStatement | null;
  records: Array<WordDownloadRecord>;
}): Promise<void> {
  db.transaction(() => {
    // TODO: Try batching inputs like so: 'insert into t(a) values(10),(20),(30)'
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
  });
}

// TODO: Factor this common code out somewhere
function keysToHiragana(values: Array<string>): Array<string> {
  return Array.from(
    new Set(values.map((value) => kanaToHiragana(value)).filter(hasHiragana))
  );
}

// TODO: Factor this common code out somewhere
function hasHiragana(str: string): boolean {
  return [...str]
    .map((c) => c.codePointAt(0)!)
    .some((c) => c >= 0x3041 && c <= 0x309f);
}
