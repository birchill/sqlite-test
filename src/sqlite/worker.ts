/// <reference path="./sqlite3.d.ts"/>
importScripts('./sqlite3.js');

console.log('In worker');
(async () => {
  console.log('Initializing SQLite');
  const sqlite3 = await sqlite3InitModule({
    print: (...args) => console.log(...args),
    printErr: (...args) => console.error(...args),
  });
  console.log('Initialized!', sqlite3);

  console.log('Installing SyncAccessHandle Pool VFS');
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ clearOnInit: true });
  console.log('Installed!', poolUtil);
  const db = new poolUtil.OpfsSAHPoolDb('/sqlite-test');
  console.log('Got a DB!', db);
  try {
    db.exec([
      'create table t(a);',
      'insert into t(a) ',
      'values(10),(20),(30)',
    ]);
    db.exec(['delete table t(a)']);
  } finally {
    db.close();
  }
  /*
  const capi = sqlite3.capi;
  const oo = sqlite3.oo1;
  */
})();
