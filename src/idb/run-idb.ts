import { kanaToHiragana } from '@birchill/normal-jp';
import {
  DBSchema,
  type IDBPDatabase,
  deleteDB,
  openDB,
} from 'idb/with-async-ittr';

import { KanjiMeta, ReadingMeta } from '../common/types';
import { Overwrite } from '../utils/type-helpers';
import {
  getDownloadIterator,
  type WordDownloadRecord,
} from '../common/download';

const DATABASE_NAME = 'sqlite-test-idb';
const TABLE_NAME = 'words';

type WordStoreRecord = Overwrite<
  WordDownloadRecord,
  {
    // When transporting via JSON we replace nulls with 0s but we store them as
    // nulls.
    rm?: Array<null | ReadingMeta>;
    km?: Array<null | KanjiMeta>;

    // r and k strings with all kana converted to hiragana
    h: Array<string>;
    // Individual from k split out into separate strings
    kc: Array<string>;
    // Gloss tokens (English and localized)
    gt_en: Array<string>;
    gt_l: Array<string>;
  }
>;

interface DatabaseSchema extends DBSchema {
  words: {
    key: number;
    value: WordStoreRecord;
    indexes: {
      k: Array<string>;
      r: Array<string>;
      h: Array<string>;
      kc: Array<string>;
      gt_en: Array<string>;
      gt_l: Array<string>;
    };
  };
}

export async function runIdb({
  batchSize,
  source,
}: {
  batchSize: number;
  source: URL;
}): Promise<number> {
  // Drop any existing database
  await deleteDB(DATABASE_NAME).catch(() => {});

  // Create the database
  let db = await openDB<DatabaseSchema>(DATABASE_NAME, 1, {
    upgrade(db: IDBPDatabase<DatabaseSchema>) {
      const wordsTable = db.createObjectStore<'words'>('words', {
        keyPath: 'id',
      });
      wordsTable.createIndex('k', 'k', { multiEntry: true });
      wordsTable.createIndex('r', 'r', { multiEntry: true });

      wordsTable.createIndex('h', 'h', { multiEntry: true });

      wordsTable.createIndex('kc', 'kc', { multiEntry: true });
      wordsTable.createIndex('gt_en', 'gt_en', { multiEntry: true });
      wordsTable.createIndex('gt_l', 'gt_l', { multiEntry: true });
    },
    blocked() {
      console.log('Opening blocked');
    },
    blocking() {
      console.log('Blocking');
      try {
        db?.close();
      } catch {
        // Ignore
      }
      (db as any) = undefined;
    },
  });

  const start = performance.now();
  let records: Array<WordDownloadRecord> = [];

  // Get records and put them in the database
  console.log(`Fetching ${source}`);
  for await (const record of getDownloadIterator({ source })) {
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

  db.close();
  const dur = performance.now() - start;

  // Drop the database
  await deleteDB(DATABASE_NAME).catch(() => {});

  return dur;
}

async function writeRecords(
  db: IDBPDatabase<DatabaseSchema>,
  records: Array<WordDownloadRecord>
): Promise<void> {
  const tx = db.transaction(TABLE_NAME, 'readwrite');
  const table = tx.store;

  try {
    // The important thing here is NOT to wait on the result of each
    // put/delete. This speeds up the operation by an order of magnitude or
    // two and is Dexie's secret sauce.
    //
    // See: https://jsfiddle.net/birtles/vx4urLkw/17/
    for (const record of records) {
      void table.put(toWordStoreRecord(record));
    }

    await tx.done;
  } catch (e) {
    console.error(`Error updating series ${TABLE_NAME}`, e);

    // Ignore the abort from the transaction
    tx.done.catch(() => {});
    try {
      tx.abort();
    } catch (_) {
      // As above, ignore exceptions from aborting the transaction.
    }

    throw e;
  }
}

function toWordStoreRecord(record: WordDownloadRecord): WordStoreRecord {
  const result = {
    ...record,
    rm: record.rm
      ? record.rm.map((elem) => (elem === 0 ? null : elem))
      : undefined,
    km: record.km
      ? record.km.map((elem) => (elem === 0 ? null : elem))
      : undefined,
    h: keysToHiragana([...(record.k || []), ...record.r]),
    kc: [],
    gt_en: [],
    gt_l: [],
  };

  // I'm not sure if IndexedDB preserves properties with undefined values
  // (I think it does, although JSON does not) but just to be sure we don't
  // end up storing unnecessary values, drop any undefined properties we may
  // have just added.
  if (!result.rm) {
    delete result.rm;
  }
  if (!result.km) {
    delete result.km;
  }

  return result;
}

function keysToHiragana(values: Array<string>): Array<string> {
  // We only add hiragana keys for words that actually have some hiragana in
  // them. Any purely kanji keys should match on the 'k' index and won't benefit
  // from converting the input and source to hiragana so we can match them.
  return Array.from(
    new Set(values.map((value) => kanaToHiragana(value)).filter(hasHiragana))
  );
}

function hasHiragana(str: string): boolean {
  return [...str]
    .map((c) => c.codePointAt(0)!)
    .some((c) => c >= 0x3041 && c <= 0x309f);
}
