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

export function formatTiming(timing: Timing): string {
  let text = formatMilliseconds(timing.dur);
  if (timing.stdDev !== undefined) {
    text += ` ± ${formatMilliseconds(timing.stdDev)}`;
  }
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
      ? 'Averages show mean ± sample standard deviation.'
      : 'Standard deviation requires at least two runs.',
    '',
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
  ];
  for (const [name, cells] of Object.entries(results)) {
    const values = Array.from({ length: runs + 1 }, (_, index) => {
      const cell = cells[index];
      if (!cell) return '--';
      if (cell === inProgress) return 'In progress';
      if ('error' in cell) return escapeCell(cell.error);
      return `Insert: ${escapeCell(formatTiming(cell.insert))}<br>Query: ${escapeCell(formatTiming(cell.query))}`;
    });
    lines.push(`| ${[escapeCell(name), ...values].join(' | ')} |`);
  }
  return `${lines.join('\n')}\n`;
}
