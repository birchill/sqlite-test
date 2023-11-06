import { Surreal } from 'surrealdb.wasm';

import {
  type WordDownloadRecord,
  getDownloadIterator,
} from '../common/download';
import { isObject } from '../utils/is-object';

declare var self: WorkerGlobalScope;

(async () => {
  const db = new Surreal();

  await db.connect('indxdb://surreal-test', {
    namespace: 'test',
    database: 'test',
  });

  addEventListener('message', (e) => {
    if (!isObject(e) || e.data.type !== 'start') {
      return;
    }

    const source = e.data.source as string;
    const batchSize = e.data.batchSize as number;

    runTest(db, source, batchSize)
      .then((results) => {
        postMessage({ type: 'result', ...results });
      })
      .catch((e) => {
        postMessage({ type: 'error', error: e });
      });
  });

  postMessage('ready');
})();

async function runTest(
  db: Surreal,
  source: string,
  batchSize: number
): Promise<{ insertDur: number; queryDur: number }> {
  // Drop any existing records
  await db.delete('word');

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
  // XXX
  /*
    db.selectArrays(
      "select * from words, json_each(words.k) where json_each.value glob '企業%'"
    );
    db.selectArrays(
      "select * from words, json_each(words.r) where json_each.value glob '企業%'"
    );
    */
  const queryDur = performance.now() - queryStart;

  // Tidy up
  await db.delete('word');

  return { insertDur, queryDur };
}

async function writeRecords(
  db: Surreal,
  records: Array<WordDownloadRecord>
): Promise<void> {
  // Looks like the WASM version doesn't include the insert() API get
  for (const record of records) {
    await db.create('word', {
      id: record.id,
      k: record.k,
      km: record.km,
      r: record.r,
      rm: record.rm,
      s: record.s,
    });
  }
}
