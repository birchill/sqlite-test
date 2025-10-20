import {
  type WordDownloadRecord,
  getDownloadIterator,
} from '../common/download';

export const SQLITE_STORAGE_DB_PATH = '/storage-size.sqlite';

export async function populateWordsWithSeparateIndex({
  db,
  batchSize,
  source,
  useTriggers = false,
}: {
  db: DB;
  batchSize: number;
  source: string | URL;
  useTriggers?: boolean;
}): Promise<void> {
  let records: Array<WordDownloadRecord> = [];
  const url = source instanceof URL ? source : new URL(source);

  for await (const record of getDownloadIterator({ source: url })) {
    records.push(record);

    if (records.length >= batchSize) {
      writeRecordsWithSeparateIndex({ db, records, useTriggers });
      records = [];
    }
  }

  if (records.length) {
    writeRecordsWithSeparateIndex({ db, records, useTriggers });
  }
}

export function createWordsWithSeparateIndex({
  db,
  useTriggers = false,
}: {
  db: DB;
  useTriggers?: boolean;
}): void {
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
}

export function dropWordsWithSeparateIndex(db: DB): void {
  db.exec(['drop trigger if exists words_add;']);
  db.exec(['drop table if exists readings;', 'drop table if exists words;']);
}

export function writeRecordsWithSeparateIndex({
  db,
  records,
  useTriggers,
}: {
  db: DB;
  records: Array<WordDownloadRecord>;
  useTriggers?: boolean;
}): void {
  db.transaction(() => {
    const insertStmt = db.prepare('insert into words(id, json) values(?, ?)');

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
