<script lang="ts">
  import { runIdb } from './idb/run-idb';
  import { runSqlite } from './sqlite/run-sqlite';
  import { runTurso } from './turso/run-turso';
  import { runWaSqlite } from './wa-sqlite/run-wa-sqlite';
  import { waSqliteVfsNames } from './wa-sqlite/backends';

  import RunTime from './RunTime.svelte';

  import {
    inProgress,
    standardDeviation,
    resultsToMarkdown,
    fastestAverages,
    type Measurement,
    type Timing,
    type Result,
    type Cell,
  } from './common/benchmark-results';

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
  let resultDataset: keyof typeof dataSets = dataset;
  let copyStatus = '';
  let copying = false;
  $: hasResults = Object.values(results).some((cells) =>
    cells.some((cell) => cell !== null && cell !== inProgress)
  );

  $: fastest = fastestAverages(results, resultRuns);

  async function copyResults() {
    copying = true;
    copyStatus = '';
    try {
      await navigator.clipboard.writeText(
        resultsToMarkdown({
          results,
          runs: resultRuns,
          dataset: resultDataset,
        })
      );
      copyStatus = 'Copied!';
    } catch (error) {
      copyStatus = `Could not copy results: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      copying = false;
    }
  }

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
    resultDataset = dataset;
    copyStatus = '';
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
          measurements.reduce((sum, result) => sum + result.queryDur, 0) / runs,
      };
      const summary = compare(average, baseline?.[runs]);
      summary.insert.stdDev = standardDeviation(
        measurements.map((measurement) => measurement.insertDur)
      );
      summary.query.stdDev = standardDeviation(
        measurements.map((measurement) => measurement.queryDur)
      );
      results[name]![runs] = summary;
      if (name === 'Raw IndexedDB') baseline = [...measurements, average];
    }
  }
</script>

<main>
  <header class="page-header">
    <div>
      <p class="eyebrow">Browser database benchmarks</p>
      <h1>SQLite performance test</h1>
      <p class="intro">
        Compare insertion and query times across IndexedDB, SQLite, wa-sqlite,
        and Turso.
      </p>
    </div>
    <a class="storage-link" href="storage-size.html"
      >Storage size test <span aria-hidden="true">↗</span></a
    >
  </header>

  <section class="controls" aria-label="Benchmark settings">
    <div class="field">
      <label for="dataset">Dataset</label>
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
    <div class="field">
      <label for="runs">Runs per configuration</label>
      <select
        id="runs"
        disabled={running}
        value={runs}
        on:change={onChangeRuns}
      >
        {#each Array.from({ length: 10 }, (_, i) => i + 1) as index}
          <option value={index}>{index}</option>
        {/each}
      </select>
    </div>
    <button
      class="primary"
      disabled={running}
      on:click={() => {
        if (running) return;
        running = true;
        runTests().finally(() => {
          running = false;
        });
      }}>{running ? 'Running…' : 'Run test'}</button
    >
    <p class="dataset-note">
      Queries match headwords starting with <strong lang="ja">企業</strong>.
      Choose 30k words to retrieve matches; the 10k dataset has none.
    </p>
  </section>

  <section class="results" aria-labelledby="results-heading">
    <div class="result-controls">
      <div>
        <h2 id="results-heading">Results</h2>
        <p class="result-meta">
          {resultDataset} · {resultRuns}
          {resultRuns === 1 ? 'run' : 'runs'} per configuration
        </p>
      </div>
      <div class="copy-controls">
        <button
          disabled={running || copying || !hasResults}
          on:click={copyResults}>Copy results as Markdown</button
        >
        <span class="copy-status" role="status">{copyStatus}</span>
      </div>
    </div>
    <!-- Keyboard focus lets users scroll the table without a pointer. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="table-scroll"
      role="region"
      aria-label="Benchmark results"
      tabindex="0"
    >
      <table class="results-table">
        <thead>
          <tr>
            <th scope="col">Configuration</th>
            {#each Array.from({ length: resultRuns }, (_, i) => i + 1) as index}
              <th scope="col">Run #{index}</th>
            {/each}
            <th scope="col" class="average">Average</th>
          </tr>
        </thead>
        <tbody>
          {#each Object.entries(results) as [name, cells]}
            <tr>
              <th scope="row">
                {#if name.startsWith('wa-sqlite (')}
                  wa-sqlite
                  <span class="backend-variant">{name.slice(11, -1)}</span>
                {:else}
                  {name}
                {/if}
              </th>
              {#each cells as cell, index}
                <td class:average={index === resultRuns}>
                  {#if cell === inProgress}
                    <span class="pending" role="status">Running…</span>
                  {:else if cell && 'error' in cell}
                    <span class="error">{cell.error}</span>
                  {:else if cell}
                    <div
                      class="result-section"
                      class:fastest={!running &&
                        index === resultRuns &&
                        cell.insert.dur === fastest.insert}
                    >
                      <span class="label"
                        >Insert
                        {#if !running && index === resultRuns && cell.insert.dur === fastest.insert}
                          <span class="winner-label">Fastest</span>
                        {/if}
                      </span>
                      <RunTime {...cell.insert} />
                    </div>
                    <div
                      class="result-section"
                      class:fastest={!running &&
                        index === resultRuns &&
                        cell.query.dur === fastest.query}
                    >
                      <span class="label"
                        >Query
                        {#if !running && index === resultRuns && cell.query.dur === fastest.query}
                          <span class="winner-label">Fastest</span>
                        {/if}
                      </span>
                      <RunTime {...cell.query} />
                    </div>
                  {:else}
                    <span class="empty" aria-label="No result">—</span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="result-notes">
      <p>
        {#if resultRuns > 1}Averages show mean ± sample standard deviation as a
          percentage of the mean.{:else}Standard deviation requires at least two
          runs.{/if}
      </p>
      <p>
        Comparisons are against raw IndexedDB. The fastest averages are
        highlighted.
      </p>
    </div>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f5f7fa;
    color: #243247;
    font-family:
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    font-size: 14px;
    line-height: 1.5;
  }
  :global(*) {
    box-sizing: border-box;
  }
  main {
    max-width: 1600px;
    margin: 0 auto;
    padding: 3rem 2rem;
  }
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 2rem;
    margin-bottom: 2rem;
  }
  .eyebrow {
    color: #536e96;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin: 0 0 0.5rem;
  }
  h1 {
    font-size: clamp(1.6rem, 4vw, 2.2rem);
    line-height: 1.2;
    letter-spacing: -0.035em;
    margin: 0;
    color: #172a46;
  }
  .intro {
    margin: 0.75rem 0 0;
    color: #65748a;
  }
  .storage-link {
    color: #365f94;
    text-decoration: none;
    white-space: nowrap;
  }
  .storage-link:hover {
    text-decoration: underline;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
    align-items: end;
    padding: 1.5rem;
    background: white;
    border: 1px solid #dfe5ed;
    border-radius: 12px;
    margin-bottom: 2rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  label {
    font-size: 0.8rem;
    font-weight: 600;
  }
  select,
  button {
    font: inherit;
    min-height: 40px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 0.5rem 0.85rem;
    background: white;
    color: #243247;
  }
  select {
    min-width: 150px;
  }
  button {
    cursor: pointer;
    font-weight: 600;
  }
  button:hover:enabled {
    background: #f0f4f9;
    border-color: #93a7c1;
  }
  button.primary {
    background: #285b99;
    border-color: #285b99;
    color: white;
    padding-inline: 1.5rem;
  }
  button.primary:hover:enabled {
    background: #204c83;
  }
  button:disabled,
  select:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button:focus-visible,
  select:focus-visible,
  a:focus-visible,
  .table-scroll:focus-visible {
    outline: 3px solid #8fb4e7;
    outline-offset: 3px;
  }
  .dataset-note {
    margin: 0 0 0 0.75rem;
    flex: 1;
    min-width: 230px;
    max-width: 450px;
    font-size: 0.8rem;
    color: #65748a;
  }
  .results {
    background: white;
    border: 1px solid #dfe5ed;
    border-radius: 12px;
    overflow: hidden;
  }
  .result-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 1.5rem;
  }
  h2 {
    margin: 0;
    font-size: 1.15rem;
    color: #172a46;
  }
  .result-meta {
    margin: 0.25rem 0 0;
    color: #65748a;
    font-size: 0.8rem;
  }
  .copy-controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .copy-status {
    color: #65748a;
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  .table-scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    text-align: left;
    padding: 1rem 1.25rem;
    border-top: 1px solid #e5eaf0;
    vertical-align: top;
  }
  thead th {
    background: #f6f8fb;
    color: #65748a;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }
  tbody th {
    font-size: 0.82rem;
    font-weight: 600;
    vertical-align: middle;
  }
  tr > th:first-child {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 220px;
    max-width: 250px;
    background: white;
    border-right: 1px solid #e5eaf0;
    overflow-wrap: anywhere;
  }
  thead tr > th:first-child {
    background: #f6f8fb;
  }
  td {
    min-width: 175px;
  }
  .average {
    background: #f0f5fc;
  }
  thead .average {
    color: #285b99;
  }
  .backend-variant {
    display: block;
    margin-top: 0.2rem;
    color: #65748a;
    font-size: 0.72rem;
    font-weight: 400;
  }
  .result-section {
    padding: 0.35rem 0.5rem;
    margin-inline: -0.5rem;
    border-left: 3px solid transparent;
    border-radius: 4px;
  }
  .result-section.fastest {
    background: #e2f2e9;
    border-left-color: #318467;
  }
  .winner-label {
    margin-left: 0.5rem;
    color: #21644b;
    font-weight: 600;
    text-transform: none;
    letter-spacing: normal;
  }
  .result-section + .result-section {
    margin-top: 0.85rem;
  }
  .label {
    display: block;
    color: #65748a;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 0.15rem;
  }
  .empty {
    color: #c1cad6;
  }
  .pending {
    color: #285b99;
    font-size: 0.8rem;
  }
  .error {
    display: block;
    max-width: 230px;
    color: #8b543b;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
  .result-notes {
    border-top: 1px solid #e5eaf0;
    padding: 1rem 1.5rem;
    font-size: 0.75rem;
    color: #65748a;
  }
  .result-notes p {
    margin: 0;
  }
  .result-notes p + p {
    margin-top: 0.25rem;
  }
  @media (max-width: 640px) {
    main {
      padding: 1.5rem 1rem;
    }
    .page-header {
      align-items: start;
      flex-direction: column;
      gap: 1rem;
    }
    .controls,
    .result-controls {
      padding: 1rem;
    }
    .controls {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .controls .primary,
    .dataset-note {
      grid-column: 1 / -1;
    }
    .field {
      min-width: 0;
    }
    select {
      min-width: 0;
      width: 100%;
    }
    .dataset-note {
      margin: 0;
      min-width: 100%;
    }
    tr > th:first-child {
      min-width: 160px;
      max-width: 160px;
    }
    th,
    td {
      padding: 0.85rem;
    }
  }
</style>
