import { initSQLite, type OpfsSAHPoolUtil } from './init';
import {
  createWordsWithSeparateIndex,
  dropWordsWithSeparateIndex,
  populateWordsWithSeparateIndex,
} from './words';

(async () => {
  const sqlite3 = await initSQLite();
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({
    name: 'benchmark-sahpool',
    clearOnInit: true,
  });

  addEventListener('message', (event) => {
    if (event.data?.type !== 'start') return;
    runTestWithSeparateIndex(poolUtil, event.data.source, event.data.batchSize)
      .then((results) => postMessage({ type: 'result', ...results }))
      .catch((error) => postMessage({ type: 'error', message: String(error) }));
  });
  postMessage('ready');
})().catch((error) => {
  // Surface asynchronous initialization failures through the Worker error event.
  setTimeout(() => {
    throw error;
  });
});

async function runTestWithSeparateIndex(
  poolUtil: OpfsSAHPoolUtil,
  source: string,
  batchSize: number
): Promise<{ insertDur: number; queryDur: number }> {
  const db = new poolUtil.OpfsSAHPoolDb('/sqlite-test');
  try {
    db.exec('PRAGMA locking_mode = exclusive');

    dropWordsWithSeparateIndex(db);
    createWordsWithSeparateIndex({ db });

    const start = performance.now();
    await populateWordsWithSeparateIndex({
      db,
      batchSize,
      source,
    });

    const insertDur = performance.now() - start;

    // Measure query performance
    const queryStart = performance.now();
    db.selectArrays(
      "select words.json from readings join words on readings.id = words.id where readings.r glob '企業*'"
    );
    const queryDur = performance.now() - queryStart;

    // Tidy up
    dropWordsWithSeparateIndex(db);

    return { insertDur, queryDur };
  } finally {
    db.close();
    await poolUtil.wipeFiles();
  }
}
