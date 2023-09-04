<script lang="ts">
  export let dur: number;
  export let diffMs: number;
  export let diffPercent: number;

  export function round(number: number, precision: number): number {
    const factor = Math.pow(10, precision);
    return Math.round((number + Number.EPSILON) * factor) / factor;
  }
</script>

<div>{dur.toLocaleString()}ms</div>
{#if diffMs > 0}
  <div class="slower">
    +{diffMs.toLocaleString()}ms (+{round(diffPercent, 2)}%)
  </div>
{:else if diffMs < 0}
  <div class="faster">
    {diffMs.toLocaleString()}ms ({round(diffPercent, 2)}%)
  </div>
{/if}

<style>
  .faster {
    color: green;
  }
  .slower {
    color: red;
  }
</style>
