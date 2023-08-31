import * as s from 'superstruct';

import { isObject } from '../utils/is-object';
import { Overwrite } from '../utils/type-helpers';

import { ljsonStreamIterator } from './ljson-stream';
import {
  Accent,
  CrossReference,
  KanjiMeta,
  LangSource,
  ReadingMeta,
  WordRecord,
  WordSense,
} from './types';

const safeInteger = (): s.Struct<number, null> =>
  s.refine(s.integer(), 'safeInteger', (value) => Number.isSafeInteger(value));

const HeaderLineSchema = s.type({
  type: s.literal('header'),
  version: s.type({
    major: s.min(safeInteger(), 1),
    minor: s.min(safeInteger(), 0),
    patch: s.min(safeInteger(), 0),
    databaseVersion: s.optional(s.string()),
    dateOfCreation: s.nonempty(s.string()),
  }),
  records: s.min(safeInteger(), 0),
  part: s.optional(s.min(safeInteger(), 0)),
  format: s.enums(['patch', 'full']),
});

export type WordDownloadRecord = Overwrite<
  WordRecord,
  {
    km?: Array<0 | KanjiMeta>;
    rm?: Array<0 | ReadingMeta>;
    s: Array<WordSense>;
  }
>;

const WordIdSchema = s.min(safeInteger(), 1);

const KanjiMetaSchema: s.Describe<KanjiMeta> = s.type({
  i: s.optional(s.array(s.string())),
  p: s.optional(s.array(s.string())),
});

const AccentSchema: s.Describe<Accent> = s.type({
  i: s.min(safeInteger(), 0),
  pos: s.optional(s.array(s.string())),
});

const ReadingMetaSchema: s.Describe<ReadingMeta> = s.type({
  i: s.optional(s.array(s.string())),
  p: s.optional(s.array(s.string())),
  app: s.optional(s.min(safeInteger(), 0)),
  a: s.optional(s.union([s.min(safeInteger(), 0), s.array(AccentSchema)])),
});

// The following typing is because Describe struggles with union types
const CrossReferenceSchema: s.Struct<s.Describe<CrossReference>['TYPE'], null> =
  s.union([
    s.type({
      k: s.nonempty(s.string()),
      sense: s.optional(s.min(safeInteger(), 0)),
    }),
    s.type({
      r: s.nonempty(s.string()),
      sense: s.optional(s.min(safeInteger(), 0)),
    }),
    s.type({
      k: s.nonempty(s.string()),
      r: s.string(),
      sense: s.optional(s.min(safeInteger(), 0)),
    }),
  ]);

const LangSourceSchema: s.Describe<LangSource> = s.type({
  lang: s.optional(s.nonempty(s.string())),
  src: s.optional(s.string()),
  // The following should be:
  //
  //   part: s.optional(s.literal(true)),
  //   wasei: s.optional(s.literal(true)),
  //
  // But Describe doesn't seem to handle optional boolean literals so we try
  // this way for now.
  part: s.union([s.literal(true), s.literal(undefined)]),
  wasei: s.union([s.literal(true), s.literal(undefined)]),
});

const WordSenseSchema: s.Describe<WordSense> = s.type({
  g: s.nonempty(s.array(s.nonempty(s.string()))),
  gt: s.optional(s.min(safeInteger(), 1)),
  lang: s.optional(s.nonempty(s.string())),
  kapp: s.optional(s.min(safeInteger(), 0)),
  rapp: s.optional(s.min(safeInteger(), 0)),
  pos: s.optional(s.array(s.string())),
  field: s.optional(s.array(s.string())),
  misc: s.optional(s.array(s.string())),
  dial: s.optional(s.array(s.string())),
  inf: s.optional(s.nonempty(s.string())),
  xref: s.optional(s.nonempty(s.array(CrossReferenceSchema))),
  ant: s.optional(s.nonempty(s.array(CrossReferenceSchema))),
  lsrc: s.optional(s.nonempty(s.array(LangSourceSchema))),
});

const WordDownloadRecordSchema: s.Describe<WordDownloadRecord> = s.type({
  id: WordIdSchema,
  k: s.optional(s.nonempty(s.array(s.string()))),
  km: s.optional(s.nonempty(s.array(s.union([s.literal(0), KanjiMetaSchema])))),
  r: s.array(s.nonempty(s.nonempty(s.string()))),
  rm: s.optional(
    s.nonempty(s.array(s.union([s.literal(0), ReadingMetaSchema])))
  ),
  s: s.array(WordSenseSchema),
});

export async function* getDownloadIterator({
  source,
}: {
  source: URL;
}): AsyncIterableIterator<WordDownloadRecord> {
  const response = await fetch(source);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${source}, status: ${response.status}`);
  }

  if (response.body === null) {
    throw new Error(`Failed to fetch ${source}, body is null`);
  }

  let headerRead = false;

  for await (const line of ljsonStreamIterator({
    stream: response.body,
    timeout: 5_000,
    url: source,
  })) {
    if (s.is(line, HeaderLineSchema)) {
      if (headerRead) {
        throw new Error(
          `Got duplicate database header: ${JSON.stringify(line)}`
        );
      }

      headerRead = true;
    } else if (isObject(line)) {
      if (!headerRead) {
        throw new Error(
          `Expected database version but got ${JSON.stringify(line)}`
        );
      }

      s.assert(line, WordDownloadRecordSchema);

      yield line;
    } else {
      throw new Error(`Got unexpected record: ${JSON.stringify(line)}`);
    }
  }
}
