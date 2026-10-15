export const inProgress = Symbol('in progress');

export type Measurement = { insertDur: number; queryDur: number };
export type Timing = {
  dur: number;
  diffMs: number;
  diffPercent: number;
  stdDev?: number;
};
export type Result = { insert: Timing; query: Timing };
export type Cell = Result | { error: string } | typeof inProgress | null;

/** Sample standard deviation; one observation cannot estimate variability. */
export function standardDeviation(values: number[]): number | undefined {
  if (values.length < 2) return undefined;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

export function formatMilliseconds(value: number): string {
  return `${Number(value.toFixed(2))}ms`;
}

/** Relative sample standard deviation (coefficient of variation). */
export function formatStandardDeviation(
  mean: number,
  stdDev: number | undefined
): string | undefined {
  if (stdDev === undefined) return undefined;
  if (mean === 0) return 'n/a';
  return `${Number(((stdDev / Math.abs(mean)) * 100).toFixed(2))}%`;
}

export function fastestAverages(results: Record<string, Cell[]>, runs: number) {
  let insert: number | undefined;
  let query: number | undefined;
  for (const cells of Object.values(results)) {
    const average = cells[runs];
    if (!average || average === inProgress || 'error' in average) continue;
    insert = Math.min(insert ?? Infinity, average.insert.dur);
    query = Math.min(query ?? Infinity, average.query.dur);
  }
  return { insert, query };
}

export function formatTiming(timing: Timing, fastest = false): string {
  let text = formatMilliseconds(timing.dur);
  const variability = formatStandardDeviation(timing.dur, timing.stdDev);
  if (variability !== undefined) text += ` ±${variability}`;
  if (fastest) text += ' (fastest)';
  if (timing.diffMs !== 0) {
    const sign = timing.diffMs > 0 ? '+' : '';
    text += ` (${sign}${formatMilliseconds(timing.diffMs)}, ${sign}${Number(timing.diffPercent.toFixed(2))}%)`;
  }
  return text;
}

function escapeCell(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

export function resultsToMarkdown({
  results,
  runs,
  dataset,
}: {
  results: Record<string, Cell[]>;
  runs: number;
  dataset: string;
}): string {
  const headers = [
    'Configuration',
    ...Array.from({ length: runs }, (_, i) => `Run #${i + 1}`),
    'Average',
  ];
  const lines = [
    `Dataset: ${escapeCell(dataset)}; runs: ${runs}.`,
    runs > 1
      ? 'Averages show mean ± relative sample standard deviation (% of mean).'
      : 'Standard deviation requires at least two runs.',
    '',
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  const fastest = fastestAverages(results, runs);
  for (const [name, cells] of Object.entries(results)) {
    const values = Array.from({ length: runs + 1 }, (_, index) => {
      const cell = cells[index];
      if (!cell) return '--';
      if (cell === inProgress) return 'In progress';
      if ('error' in cell) return escapeCell(cell.error);
      return `Insert: ${escapeCell(formatTiming(cell.insert, index === runs && cell.insert.dur === fastest.insert))}<br>Query: ${escapeCell(formatTiming(cell.query, index === runs && cell.query.dur === fastest.query))}`;
    });
    lines.push(`| ${[escapeCell(name), ...values].join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
}
