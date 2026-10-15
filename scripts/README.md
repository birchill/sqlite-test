# Benchmark maintenance

Use Node.js 22+ and pnpm 12 (`package.json` pins pnpm 12.11.2).
Run `pnpm install`, then `pnpm start` and open the displayed localhost URL.
`NODE_ENV=production pnpm build` writes the site to `public/`. Deployment must
preserve the COOP/COEP headers in `netlify.toml`, including on worker scripts;
Turso uses shared WASM memory and a nested worker.

The SQLite OPFS SAH benchmark uses `@birchill/nice-sqlite-wasm` from npm. The
remaining SQLite schema stores the complete record as JSON and populates a
separate readings table in application code, exactly as the wa-sqlite cases do.
Both use a `WITHOUT ROWID` readings table. Turso uses the same logical schema
with an ordinary rowid table because its experimental `WITHOUT ROWID` support does not cover this schema
with a secondary index and foreign key. See the upstream
[compatibility table](https://github.com/tursodatabase/turso/blob/main/COMPAT.md).

All SQL queries use `GLOB '企業*'` and retrieve the matching JSON rows. The
10k dataset has no matches; the 30k dataset has 12 matching readings. Insertion
timings include fetching, parsing, validating, and writing the dataset. Engine
initialization and schema setup happen before timing. Queries run on the same
connection immediately after insertion, so they measure a warm database.

The benchmark retains each backend's default journal and synchronous settings,
with exclusive locking on SQLite and wa-sqlite. IDBBatchAtomicVFS and raw
IndexedDB retain their existing relaxed durability configuration. These results
compare those configurations, rather than identical durability guarantees.

## Updating wa-sqlite

The upstream snapshot, license, and revision are in `src/wa-sqlite/vendor/`.
To reproduce the pinned snapshot:

```sh
pnpm update:wa-sqlite
```

To update to another upstream commit:

```sh
pnpm update:wa-sqlite <full-40-character-commit-SHA>
```

The script downloads matching sources, prebuilt JS/WASM, and type definitions
from `rhashimoto/wa-sqlite`. It preserves the upstream directory structure and
runtime files without patching import paths. The script generates local type
adapters because upstream declarations refer to npm module names. WASM URLs
are resolved by rspack and passed explicitly to each module's loader. When
updating, also update the default revision in the script and check for new VFS
imports that need adding to its download list.

IDBBatchAtomicVFS and OPFSAdaptiveVFS use the Asyncify build. AccessHandlePoolVFS,
OPFSCoopSyncVFS, and OPFSWriteAheadVFS use the synchronous build. Each benchmark
VFS gets a separate worker and database path. OPFSWriteAheadVFS runs an explicit
checkpoint during cleanup, outside the measured durations, to finish background
work before closing its access handles. The storage-size page uses its own
SQLite pool and wa-sqlite IndexedDB database.

OPFSWriteAheadVFS requires `readwrite-unsafe` access handles. A worker probes
support by opening two handles to a temporary file, then closes both and deletes
the file. Unsupported browsers show a skip reason and continue with Turso.
Other backend failures also appear in their result row so the remaining tests
can finish. In particular, Firefox can run the other four wa-sqlite VFSs but
currently skips OPFSWriteAheadVFS.
