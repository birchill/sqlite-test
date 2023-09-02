/// <reference path="./sqlite3.d.ts"/>
import { kanaToHiragana } from '@birchill/normal-jp';
import { WordDownloadRecord, getDownloadIterator } from '../common/download';
import { isObject } from '../utils/is-object';

import './sqlite3.js';

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

    runTest(poolUtil, source, batchSize).then((dur) => {
      postMessage({ type: 'result', dur });
    });
  });

  postMessage('ready');
})();

async function runTest(
  poolUtil: OpfsSAHPoolUtil,
  source: string,
  batchSize: number
): Promise<number> {
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
    console.log(`Fetching ${source}`);

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

    const dur = performance.now() - start;

    // Check that things are actually stored as expected
    const startSelect = performance.now();
    const matches = db.selectArrays(
      "select * from words, json_each(words.k) where json_each.value like '企業%'"
    );
    console.log(`Select took ${performance.now() - startSelect}ms`);
    console.log(matches);

    // Tidy up
    db.exec(['drop table words']);

    return dur;
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
