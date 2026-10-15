export const waSqliteVfsNames = [
  'IDBBatchAtomicVFS',
  'OPFSAdaptiveVFS',
  'AccessHandlePoolVFS',
  'OPFSCoopSyncVFS',
  'OPFSWriteAheadVFS',
] as const;

export type WaSqliteVfs = (typeof waSqliteVfsNames)[number];
