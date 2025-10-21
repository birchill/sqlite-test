import {
  type WordDownloadRecord,
  getDownloadIterator,
} from '../common/download';
import { SQLiteAPI } from './sqlite-api.js';

export const WA_SQLITE_STORAGE_DB_NAME = 'storage-size';

export async function populateWordsWithSeparateIndex({
  sqlite3,
  db,
  batchSize,
  source,
}: {
  sqlite3: SQLiteAPI;
  db: number;
  batchSize: number;
  source: string | URL;
}): Promise<void> {
  let records: Array<WordDownloadRecord> = [];
  const url = source instanceof URL ? source : new URL(source);

  for await (const record of getDownloadIterator({ source: url })) {
    records.push(record);
    if (records.length >= batchSize) {
      await writeRecords(sqlite3, db, records);
      records = [];
    }
  }

  if (records.length) {
    await writeRecords(sqlite3, db, records);
  }
}

export async function createWordsWithSeparateIndex({
  sqlite3,
  db,
}: {
  sqlite3: SQLiteAPI;
  db: number;
}): Promise<void> {
  await sqlite3.exec(
    db,
    'create table words(id INT PRIMARY KEY NOT NULL, json JSON NOT NULL); ' +
      'create table readings(id INT NOT NULL, r TEXT NOT NULL, PRIMARY KEY(id, r), FOREIGN KEY(id) REFERENCES words(id)) WITHOUT ROWID; ' +
      'create index readings_r on readings(r)'
  );
}

export async function dropWordsWithSeparateIndex({
  sqlite3,
  db,
}: {
  sqlite3: SQLiteAPI;
  db: number;
}): Promise<void> {
  await sqlite3.exec(
    db,
    'drop trigger if exists words_add; drop table if exists readings; drop table if exists words;'
  );
}

export async function vacuum(sqlite3: SQLiteAPI, db: number): Promise<void> {
  await sqlite3.exec(db, 'vacuum');
}

export async function writeRecords(
  sqlite3: SQLiteAPI,
  db: number,
  records: Array<WordDownloadRecord>
): Promise<void> {
  const insertStmts = sqlite3.statements(
    db,
    'insert into words(id, json) values(?, ?)',
    { unscoped: true }
  );
  const insertStmt = (await insertStmts.next()).value;

  const insertReadingsStmts = sqlite3.statements(
    db,
    'insert into readings(id, r) values(?, ?)',
    { unscoped: true }
  );
  let insertReadingsStmt = (await insertReadingsStmts.next()).value;

  await sqlite3.exec(db, 'begin transaction');
  try {
    for (const record of records) {
      sqlite3.reset(insertStmt);
      sqlite3.bind_int(insertStmt, 1, record.id);
      sqlite3.bind_text(insertStmt, 2, JSON.stringify(record));
      await sqlite3.step(insertStmt);

      const readings = [...new Set([...(record.k || []), ...record.r])];
      for (const reading of readings) {
        sqlite3.reset(insertReadingsStmt);
        sqlite3.bind_int(insertReadingsStmt, 1, record.id);
        sqlite3.bind_text(insertReadingsStmt, 2, reading);
        await sqlite3.step(insertReadingsStmt);
      }
    }

    await sqlite3.exec(db, 'commit');
  } catch (e) {
    await sqlite3.exec(db, 'rollback');
    throw e;
  } finally {
    sqlite3.finalize(insertStmt);
    sqlite3.finalize(insertReadingsStmt);
  }
}
