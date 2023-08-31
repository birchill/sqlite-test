import { Overwrite } from '../utils/type-helpers';

export type WordRecord = {
  id: number;

  // Kanji readings for the entry
  k?: Array<string>;
  km?: Array<null | KanjiMeta>;

  // Kana readings for the entry
  r: Array<string>;
  rm?: Array<null | ReadingMeta>;

  // Sense information
  s: Array<WordSense>;
};

export type KanjiMeta = {
  // Information about a kanji headword
  //
  // Typically this should be of type KanjiInfo but we allow it to be any string
  // in case new types are introduced in future and the client has yet to be
  // updated.
  i?: Array<string>;

  // Priority information
  p?: Array<string>;

  // WaniKani level
  wk?: number;
};

export type ReadingMeta = {
  // Information about the reading
  //
  // Typically this should be of type ReadingInfo but we allow it to be any
  // string in case new types are introduced in future and the client has yet to
  // be updated.
  i?: Array<string>;

  // Priority information
  p?: Array<string>;

  // Bitfield representing which kanji entries (based on their order in the k
  // array) the reading applies to. 0 means it applies to none of them. If the
  // field is absent, it means the reading applies to all of the kanji entries.
  app?: number;

  // Pitch accent information.
  a?: number | Array<Accent>;
};

export type Accent = {
  // Syllable number of the accent (after which the drop occurs).
  // 0 = 平板
  i: number;

  // This should typically be a PartOfSpeech value.
  pos?: Array<string>;
};

export type WordSense = {
  g: Array<string>;
  // A bitfield representing the type of the glosses in `g`. Two bits are used
  // to represent the type of each item in `g`, where each two-bit value is one
  // of the GlossType values below.
  //
  // Undefined if the value is 0 (i.e. no glosses have a type, the most common
  // case).
  gt?: number;
  // undefined = 'en'
  lang?: string;

  // Bit field representing the kanji / kana entries this sense applies to.
  // If the sense applies to all entries the field will be undefined.
  kapp?: number;
  rapp?: number;

  // Extra information about the sense.

  // Typically a PartOfSpeech value
  pos?: Array<string>;
  // Typically a FieldType value
  field?: Array<string>;
  // Typically a MiscType value
  misc?: Array<string>;
  // Typically a Dialect value
  dial?: Array<string>;
  inf?: string;
  xref?: Array<CrossReference>;
  ant?: Array<CrossReference>;

  // Language source information.
  lsrc?: Array<LangSource>;
};

export const GlossTypes = ['none', 'expl', 'lit', 'fig', 'tm'] as const;
export type GlossType = (typeof GlossTypes)[number];
export const GLOSS_TYPE_MAX = GlossTypes.length;
export const BITS_PER_GLOSS_TYPE = Math.floor(Math.log2(GLOSS_TYPE_MAX)) + 1;

export type CrossReference =
  | {
      k: string;
      sense?: number;
    }
  | {
      r: string;
      sense?: number;
    }
  | {
      k: string;
      r: string;
      sense?: number;
    };

export type LangSource = {
  // undefined = 'en'
  lang?: string;

  // The term in the source language
  //
  // This may be empty in some cases.
  src?: string;

  // Partial source (i.e. this only represents part of the string)
  // absent = false
  part?: true;

  // The Japanese word is made from words from another language but doesn't
  // actually represent the meaning of those words literally.
  wasei?: true;
};
