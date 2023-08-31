<script lang="ts">
import { runIdb } from './idb/run-idb';
import { runSqlite } from './sqlite/run-sqlite';

let running = false;

const inProgress = Symbol('in progress');
type Result = number | typeof inProgress;
type Configuration = 'IndexedDB' | 'SQLite OPFS SAH';

let results: Record<Configuration, [Result, Result, Result]> = {
  'IndexedDB': [0, 0, 0],
  'SQLite OPFS SAH': [0, 0, 0]
};

async function runTests() {
  results = {
    'IndexedDB': [0, 0, 0],
    'SQLite OPFS SAH': [0, 0, 0]
  };

  const sources = [
    '/data/2.0.191-1.jsonl',
    '/data/2.0.191-2.jsonl',
    '/data/2.0.191-3.jsonl',
    '/data/2.0.191-4.jsonl',
    '/data/2.0.191-5.jsonl',
    '/data/2.0.191-6.jsonl',
  ];

  for (let i = 0; i < 3; i++) {
    results['IndexedDB'][i] = inProgress;
    const result = await runIdb({
      batchSize: 2000,
      source: new URL(sources[i], document.location)
    });
    results['IndexedDB'][i] = result;
  }

  for (let i = 3; i < 6; i++) {
    results['SQLite OPFS SAH'][i] = inProgress;
    const result = await runSqlite({
      batchSize: 2000,
      source: new URL(sources[i], document.location)
    });
    results['SQLite OPFS SAH'][i] = result;
  }
}

</script>

<button disabled={running} on:click={() => {
  if (running) {
    return;
  }

  running = true;
  runTests().finally(() => { running = false });
}}>Run test</button>

<p>Results:</p>

<div class=results-table>
<div>Configuration</div>
<div>Run #1</div>
<div>Run #2</div>
<div>Run #3</div>
{#each Object.entries(results) as [name, [run1, run2, run3]]}
  <div>{name}</div>
  <div>{run1 === inProgress ? '⌛️' : run1 ? `${run1}ms` : '--'}</div>
  <div>{run2 === inProgress ? '⌛️' : run2 ? `${run1}ms` : '--'}</div>
  <div>{run3 === inProgress ? '⌛️' : run3 ? `${run1}ms` : '--'}</div>
{/each}
</div>

<style>
.results-table {
  display: inline-grid;
  grid-template-columns: auto repeat(3, 1fr);
  gap: 0.5rem 2rem;
}
</style>
