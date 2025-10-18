<script lang="ts">
  import { runIdb } from './idb/run-idb';
  import { runSqlite } from './sqlite/run-sqlite';
  import { runTurso } from './turso/run-turso';
  import { runWaSqlite } from './wa-sqlite/run-wa-sqlite';

  import RunTime from './RunTime.svelte';

  const inProgress = Symbol('in progress');
  const testConfigurations = {
    'Raw IndexedDB': (source: string) =>
      runIdb({
        batchSize: 2000,
        source: new URL(source, document.location.toString()),
      }),
    'SQLite OPFS SAH (json_each)': (source: string) =>
      runSqlite({
        batchSize: 2000,
        source: new URL(source, document.location.toString()),
      }),
    'SQLite OPFS SAH (index table)': (source: string) =>
      runSqlite({
        batchSize: 2000,
        separateIndex: true,
        source: new URL(source, document.location.toString()),
      }),
    'SQLite OPFS SAH (index + triggers)': (source: string) =>
      runSqlite({
        batchSize: 2000,
        separateIndex: true,
        source: new URL(source, document.location.toString()),
        useTriggers: true,
      }),
    'wa-sqlite (IDBBatchAtomicVFS)': (source: string) =>
      runWaSqlite({
        batchSize: 2000,
        source: new URL(source, document.location.toString()),
      }),
    turso: (source: string) =>
      runTurso({
        batchSize: 2000,
        source: new URL(source, document.location.toString()),
      }),
  };

  //
  // Dataset
  //

  const dataSets = {
    '10k words': '/data/2.0.191-10k.jsonl',
    '30k words': '/data/2.0.191-30k.jsonl',
  };
  let dataset: keyof typeof dataSets = '10k words';

  // Seems like Svelte still doesn't like TypeScript:
  //
  // https://www.reddit.com/r/sveltejs/comments/12pc8rk/typescript_in_inline_event_handlers_in_svelte/
  // https://www.reddit.com/r/sveltejs/comments/t474yo/better_way_to_specify_types_for_eventhandlers/
  const onChangeDataset = (
    event: Event & { currentTarget: EventTarget & HTMLSelectElement }
  ) => {
    dataset = (event.target as HTMLSelectElement)
      .value as keyof typeof dataSets;
  };

  //
  // Runs
  //

  let runs = 5;
  const onChangeRuns = (
    event: Event & { currentTarget: EventTarget & HTMLSelectElement }
  ) => {
    runs = parseInt((event.target as HTMLSelectElement).value, 10);
  };

  //
  // Running
  //

  let running = false;

  //
  // Results
  //

  let results = Object.fromEntries(
    Object.keys(testConfigurations).map((key) => [
      key,
      Array(runs + 1).fill(null),
    ])
  );
  let resultRuns = 5;

  async function runTests() {
    results = Object.fromEntries(
      Object.keys(testConfigurations).map((key) => [
        key,
        Array(runs + 1).fill(null),
      ])
    );
    resultRuns = runs;

    let baseline = null;
    for (const [name, test] of Object.entries(testConfigurations)) {
      if (!baseline) {
        baseline = name;
      }

      for (let i = 0; i < runs; i++) {
        results[name]![i] = inProgress;
        const result = await test(dataSets[dataset]!);

        const insert = { dur: result.insertDur, diffMs: 0, diffPercent: 0 };
        if (name !== baseline) {
          const baselineDur = results[baseline]![i].insert.dur;
          insert.diffMs = insert.dur - baselineDur;
          insert.diffPercent = (insert.diffMs / baselineDur) * 100;
        }

        const query = { dur: result.queryDur, diffMs: 0, diffPercent: 0 };
        if (name !== baseline) {
          const baselineDur = results[baseline]![i].query.dur;
          query.diffMs = query.dur - baselineDur;
          query.diffPercent = (query.diffMs / baselineDur) * 100;
        }

        results[name]![i] = { insert, query };
      }

      const averageInsertDur =
        results[name]!.slice(0, runs).reduce(
          (acc, { insert: { dur } }) => acc + dur,
          0
        ) / runs;
      const insert = { dur: averageInsertDur, diffMs: 0, diffPercent: 0 };

      if (name !== baseline) {
        const baselineDur = results[baseline]![runs].insert.dur;
        insert.diffMs = insert.dur - baselineDur;
        insert.diffPercent = (insert.diffMs / baselineDur) * 100;
      }

      const averageQueryDur =
        results[name]!.slice(0, runs).reduce(
          (acc, { query: { dur } }) => acc + dur,
          0
        ) / runs;
      const query = { dur: averageQueryDur, diffMs: 0, diffPercent: 0 };

      if (name !== baseline) {
        const baselineDur = results[baseline]![runs].query.dur;
        query.diffMs = query.dur - baselineDur;
        query.diffPercent = (query.diffMs / baselineDur) * 100;
      }

      results[name]![runs] = { insert, query };
    }
  }
</script>

<div class="controls">
  <div>
    <label for="dataset">Dataset:</label>
    <select id="dataset" value={dataset} on:change={onChangeDataset}>
      {#each Object.keys(dataSets) as key}
        <option value={key}>{key}</option>
      {/each}
    </select>
  </div>

  <div>
    <label for="runs">Runs:</label>
    <select id="runs" value={runs} on:change={onChangeRuns}>
      {#each Array.from({ length: 10 }, (_, i) => i + 1) as index}
        <option value={index}>{index}</option>
      {/each}
    </select>
  </div>

  <button
    disabled={running}
    on:click={() => {
      if (running) {
        return;
      }

      running = true;
      runTests().finally(() => {
        running = false;
      });
    }}>Run test</button
  >
</div>

<p>Results:</p>

<div
  class="results-table"
  style={`grid-template-columns: auto repeat(${resultRuns + 0}, 1fr) auto;`}
>
  <div class="heading">Configuration</div>
  {#each Array.from({ length: resultRuns }, (_, i) => i + 1) as index}
    <div class="heading">Run #{index}</div>
  {/each}
  <div class="heading">Average</div>
  {#each Object.entries(results) as [name, runs]}
    <div>{name}</div>
    {#each runs as run}
      <div>
        {#if run === inProgress}
          ⌛️
        {:else if run}
          <div class="result-section">
            <span class="label">Insert:</span>
            <RunTime {...run.insert} />
            <span class="label">Query:</span>
            <RunTime {...run.query} />
          </div>
        {:else}
          --
        {/if}
      </div>
    {/each}
  {/each}
</div>

<style>
  .controls {
    display: flex;
    gap: 2rem;
    align-items: center;
  }

  .results-table {
    display: inline-grid;
    gap: 2rem;
  }

  .results-table .heading {
    font-weight: bold;
  }
</style>
