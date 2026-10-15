import { initSQLite, type OpfsSAHPoolUtil } from './init';
import { isObject } from '../utils/is-object';
import {
  SQLITE_STORAGE_DB_PATH,
  createWordsWithSeparateIndex,
  dropWordsWithSeparateIndex,
  populateWordsWithSeparateIndex,
} from './words';

type StorageMessage =
  | {
      id: number;
      type: 'load';
      batchSize: number;
      source: string;
    }
  | {
      id: number;
      type: 'clear';
    };

(async () => {
  const sqlite3 = await initSQLite();

  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({
    name: 'storage-size-sahpool',
    clearOnInit: false,
  });

  addEventListener('message', (event: MessageEvent) => {
    const data = event.data;
    if (!isObject(data)) {
      return;
    }

    const message = data as Partial<StorageMessage>;
    if (typeof message.type !== 'string' || typeof message.id !== 'number') {
      return;
    }

    void (async () => {
      try {
        if (message.type === 'load') {
          if (
            typeof message.source !== 'string' ||
            typeof message.batchSize !== 'number'
          ) {
            throw new Error('Invalid load request');
          }

          await loadDatabase(poolUtil, message.source, message.batchSize);
          postMessage({ type: 'done', id: message.id, action: 'load' });
        } else if (message.type === 'clear') {
          await clearDatabase(poolUtil);
          postMessage({ type: 'done', id: message.id, action: 'clear' });
        }
      } catch (error) {
        const messageText =
          error instanceof Error
            ? error.message
            : `Unknown error: ${String(error)}`;
        postMessage({ type: 'error', id: message.id, message: messageText });
      }
    })();
  });

  postMessage({ type: 'ready' });
})();

async function loadDatabase(
  poolUtil: OpfsSAHPoolUtil,
  source: string,
  batchSize: number
): Promise<void> {
  const db = new poolUtil.OpfsSAHPoolDb(SQLITE_STORAGE_DB_PATH);
  try {
    db.exec('PRAGMA locking_mode = exclusive');
    dropWordsWithSeparateIndex(db);
    db.exec(['vacuum']);
    createWordsWithSeparateIndex({ db });
    await populateWordsWithSeparateIndex({
      db,
      batchSize,
      source,
    });
  } finally {
    db.close();
  }
}

async function clearDatabase(poolUtil: OpfsSAHPoolUtil): Promise<void> {
  const db = new poolUtil.OpfsSAHPoolDb(SQLITE_STORAGE_DB_PATH);
  try {
    dropWordsWithSeparateIndex(db);
    db.exec(['vacuum']);
  } finally {
    db.close();
  }
}
