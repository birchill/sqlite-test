<script lang="ts">
  import { runIdb } from './idb/run-idb';
  import { runSqlite } from './sqlite/run-sqlite';
  import { runTurso } from './turso/run-turso';
  import { runWaSqlite } from './wa-sqlite/run-wa-sqlite';
  import { waSqliteVfsNames } from './wa-sqlite/backends';

  import RunTime from './RunTime.svelte';

  const inProgress = Symbol('in progress');
  type Measurement = { insertDur: number; queryDur: number };
  type Timing = { dur: number; diffMs: number; diffPercent: number };
  type Result = { insert: Timing; query: Timing };
  type Cell = Result | { error: string } | typeof inProgress | null;
  const testConfigurations: Record<
    string,
    (source: string) => Promise<Measurement>
  > = {
    'Raw IndexedDB': (source: string) =>
      runIdb({
        batchSize: 2000,
        source: new URL(source, document.location.toString()),
      }),
    'SQLite OPFS SAH (index table)': (source: string) =>
      runSqlite({
        batchSize: 2000,
        source: new URL(source, document.location.toString()),
      }),
    ...Object.fromEntries(
      waSqliteVfsNames.map((vfs) => [
        `wa-sqlite (${vfs})`,
        (source: string) =>
          runWaSqlite({
            batchSize: 2000,
            source: new URL(source, document.location.toString()),
            vfs,
          }),
      ])
    ),
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

  function emptyResults(): Record<string, Cell[]> {
    return Object.fromEntries(
      Object.keys(testConfigurations).map((key) => [
        key,
        Array(runs + 1).fill(null),
      ])
    );
  }
  let results = emptyResults();
  let resultRuns = 5;

  function compare(result: Measurement, baseline?: Measurement): Result {
    function timing(dur: number, baselineDur = dur): Timing {
      const diffMs = dur - baselineDur;
      return {
        dur,
        diffMs,
        diffPercent: baselineDur ? (diffMs / baselineDur) * 100 : 0,
      };
    }
    return {
      insert: timing(result.insertDur, baseline?.insertDur),
      query: timing(result.queryDur, baseline?.queryDur),
    };
  }

  async function runTests() {
    results = emptyResults();
    resultRuns = runs;
    let baseline: Measurement[] | undefined;

    for (const [name, test] of Object.entries(testConfigurations)) {
      const measurements: Measurement[] = [];
      for (let i = 0; i < runs; i++) {
        results[name]![i] = inProgress;
        try {
          const result = await test(dataSets[dataset]!);
          measurements.push(result);
          results[name]![i] = compare(result, baseline?.[i]);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          results[name] = Array(runs + 1).fill({ error: message });
          break;
        }
      }
      if (measurements.length !== runs) continue;
      const average = {
        insertDur:
          measurements.reduce((sum, result) => sum + result.insertDur, 0) /
          runs,
        queryDur:
          measurements.reduce((sum, result) => sum + result.queryDur, 0) /
          runs,
      };
      results[name]![runs] = compare(average, baseline?.[runs]);
      if (name === 'Raw IndexedDB') baseline = [...measurements, average];
    }
  }
</script>

<div class="controls">
  <div>
    <label for="dataset">Dataset:</label>
    <select
      id="dataset"
      disabled={running}
      value={dataset}
      on:change={onChangeDataset}
    >
      {#each Object.keys(dataSets) as key}
        <option value={key}>{key}</option>
      {/each}
    </select>
  </div>

  <div>
    <label for="runs">Runs:</label>
    <select id="runs" disabled={running} value={runs} on:change={onChangeRuns}>
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

<p>
  Queries match headwords starting with 企業. The 10k dataset has no matches;
  choose 30k to measure retrieval of matching words.
</p>

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
        {:else if run && 'error' in run}
          <span class="error">{run.error}</span>
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
