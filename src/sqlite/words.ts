import type { DB } from './init';
import {
  type WordDownloadRecord,
  getDownloadIterator,
} from '../common/download';

export const SQLITE_STORAGE_DB_PATH = '/storage-size.sqlite';

export async function populateWordsWithSeparateIndex({
  db,
  batchSize,
  source,
}: {
  db: DB;
  batchSize: number;
  source: string | URL;
}): Promise<void> {
  let records: Array<WordDownloadRecord> = [];
  const url = source instanceof URL ? source : new URL(source);

  for await (const record of getDownloadIterator({ source: url })) {
    records.push(record);

    if (records.length >= batchSize) {
      writeRecordsWithSeparateIndex({ db, records });
      records = [];
    }
  }

  if (records.length) {
    writeRecordsWithSeparateIndex({ db, records });
  }
}

export function createWordsWithSeparateIndex({ db }: { db: DB }): void {
  db.exec([
    'create table words(id INT PRIMARY KEY NOT NULL, json JSON NOT NULL);',
    'create table readings(id INT NOT NULL, r TEXT NOT NULL, PRIMARY KEY(id, r), FOREIGN KEY(id) REFERENCES words(id)) WITHOUT ROWID;',
    'create index readings_r on readings(r)',
  ]);
}

export function dropWordsWithSeparateIndex(db: DB): void {
  db.exec(['drop table if exists readings;', 'drop table if exists words;']);
}

export function writeRecordsWithSeparateIndex({
  db,
  records,
}: {
  db: DB;
  records: Array<WordDownloadRecord>;
}): void {
  db.transaction(() => {
    const insertStmt = db.prepare('insert into words(id, json) values(?, ?)');

    const insertReadingsStmt = db.prepare(
      'insert into readings(id, r) values(?, ?)'
    );

    for (const record of records) {
      insertStmt
        .bind([record.id, JSON.stringify(record)])
        .stepReset()
        .clearBindings();

      const readings = [...new Set([...(record.k || []), ...record.r])];
      for (const reading of readings) {
        insertReadingsStmt
          .bind([record.id, reading])
          .stepReset()
          .clearBindings();
      }
    }

    insertReadingsStmt.finalize();
    insertStmt.finalize();
  });
}
