import { mkdir, writeFile } from 'node:fs/promises';

// Keep the source, JS glue, WASM binaries, and types on the same revision.
const revision = process.argv[2] ?? '6238f532b399de77fd5f141f6e3776aeb24b2f04';
if (!/^[a-f0-9]{40}$/.test(revision)) {
  throw new Error(
    'Pass a full upstream commit SHA, not a moving branch or tag.'
  );
}
const files = [
  'LICENSE',
  'src/sqlite-api.js',
  'src/sqlite-constants.js',
  'src/VFS.js',
  'src/FacadeVFS.js',
  'src/WebLocksMixin.js',
  'src/types/index.d.ts',
  ...[
    'IDBBatchAtomicVFS',
    'OPFSAdaptiveVFS',
    'AccessHandlePoolVFS',
    'OPFSCoopSyncVFS',
    'OPFSWriteAheadVFS',
    'Lock',
    'LazyLock',
    'WriteAhead',
  ].map((name) => `src/examples/${name}.js`),
  'src/examples/README.md',
  ...['wa-sqlite', 'wa-sqlite-async'].flatMap((name) => [
    `dist/${name}.mjs`,
    `dist/${name}.wasm`,
  ]),
];

// Fetch everything before changing the local snapshot.
const downloads = await Promise.all(
  files.map(async (file) => {
    const response = await fetch(
      `https://raw.githubusercontent.com/rhashimoto/wa-sqlite/${revision}/${file}`
    );
    if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
    return [file, new Uint8Array(await response.arrayBuffer())];
  })
);
// Upstream's types describe npm module names. Expose the API types beside
// the vendored source instead, without changing any runtime imports.
const types = new TextDecoder().decode(
  downloads.find(([file]) => file === 'src/types/index.d.ts')[1]
);
const typesBoundary = types.indexOf(
  "declare module 'wa-sqlite/src/sqlite-constants.js'"
);
if (typesBoundary < 0) {
  throw new Error(
    'Upstream type layout changed; update the local type adapter.'
  );
}
const apiTypes = types.slice(0, typesBoundary);
const root = new URL('../src/wa-sqlite/vendor/', import.meta.url);
for (const [file, contents] of downloads) {
  const target = new URL(file, root);
  await mkdir(new URL('.', target), { recursive: true });
  await writeFile(target, contents);
}

await writeFile(
  new URL('src/sqlite-api.d.ts', root),
  `${apiTypes}\nexport { SQLiteAPI, SQLiteVFS };\nexport function Factory(module: any): SQLiteAPI;\n`
);
for (const name of ['wa-sqlite', 'wa-sqlite-async']) {
  await writeFile(
    new URL(`dist/${name}.d.mts`, root),
    'export default function init(options?: { locateFile?: (file: string) => string }): Promise<any>;\n'
  );
}
for (const name of [
  'IDBBatchAtomicVFS',
  'OPFSAdaptiveVFS',
  'AccessHandlePoolVFS',
  'OPFSCoopSyncVFS',
  'OPFSWriteAheadVFS',
]) {
  await writeFile(
    new URL(`src/examples/${name}.d.ts`, root),
    `import type { SQLiteVFS } from '../sqlite-api.js';
export declare class ${name} {
  static create(name: string, module: any, options?: object): Promise<SQLiteVFS>;
}
`
  );
}
await writeFile(new URL('REVISION', root), `${revision}\n`);
console.log(`Updated wa-sqlite to ${revision}`);
