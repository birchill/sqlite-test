import { isObject } from './utils/is-object';

const DATASET_PATH = '/data/2.0.191-30k.jsonl';
const BATCH_SIZE = 2000;

interface BackendOptions {
  name: string;
  worker: StorageWorker;
  loadButtonId: string;
  clearButtonId: string;
  statusId: string;
  beforeId: string;
  afterId: string;
}

class BackendUI {
  private readonly worker: StorageWorker;
  private readonly loadButton: HTMLButtonElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly statusEl: HTMLElement;
  private readonly beforeEl: HTMLElement;
  private readonly afterEl: HTMLElement;
  private readonly datasetUrl: string;
  private readonly name: string;

  constructor(options: BackendOptions) {
    const loadButton = document.getElementById(options.loadButtonId);
    const clearButton = document.getElementById(options.clearButtonId);
    const statusEl = document.getElementById(options.statusId);
    const beforeEl = document.getElementById(options.beforeId);
    const afterEl = document.getElementById(options.afterId);

    if (
      !(loadButton instanceof HTMLButtonElement) ||
      !(clearButton instanceof HTMLButtonElement) ||
      !statusEl ||
      !beforeEl ||
      !afterEl
    ) {
      throw new Error('Failed to initialise controls');
    }

    this.worker = options.worker;
    this.loadButton = loadButton;
    this.clearButton = clearButton;
    this.statusEl = statusEl;
    this.beforeEl = beforeEl;
    this.afterEl = afterEl;
    this.datasetUrl = new URL(DATASET_PATH, window.location.origin).toString();
    this.name = options.name;

    this.loadButton.addEventListener('click', () => {
      void this.load();
    });

    this.clearButton.addEventListener('click', () => {
      void this.clear();
    });
  }

  private async load(): Promise<void> {
    this.setButtonsDisabled(true);
    try {
      this.setStatus('Clearing existing data...');
      await this.worker.clear();
      const beforeEstimate = await navigator.storage.estimate();
      this.beforeEl.textContent = formatEstimate(beforeEstimate);

      this.setStatus('Loading data...');
      await this.worker.load(this.datasetUrl, BATCH_SIZE);
      const afterEstimate = await navigator.storage.estimate();
      this.afterEl.textContent = formatEstimate(afterEstimate);
      this.setStatus('Load complete.');
    } catch (error) {
      this.handleError(error);
    } finally {
      this.setButtonsDisabled(false);
    }
  }

  private async clear(): Promise<void> {
    this.setButtonsDisabled(true);
    try {
      this.setStatus('Deleting data...');
      await this.worker.clear();
      const estimate = await navigator.storage.estimate();
      this.afterEl.textContent = formatEstimate(estimate);
      this.setStatus('Data deleted.');
    } catch (error) {
      this.handleError(error);
    } finally {
      this.setButtonsDisabled(false);
    }
  }

  private setStatus(status: string): void {
    this.statusEl.textContent = status;
  }

  private handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.setStatus(`${this.name}: ${message}`);
  }

  private setButtonsDisabled(disabled: boolean): void {
    this.loadButton.disabled = disabled;
    this.clearButton.disabled = disabled;
  }
}

class StorageWorker {
  private readonly worker: Worker;
  private readonly ready: Promise<void>;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((reason?: unknown) => void) | null = null;
  private readonly pending = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  private seq = 0;

  constructor(worker: Worker) {
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    this.worker.addEventListener('message', (event) => {
      const data = event.data;
      if (!isObject(data) || typeof data.type !== 'string') {
        return;
      }

      if (data.type === 'ready') {
        this.readyResolve?.();
        this.readyResolve = null;
        this.readyReject = null;
        return;
      }

      if (data.type === 'done') {
        const pending = this.pending.get(data.id);
        if (pending) {
          pending.resolve();
          this.pending.delete(data.id);
        }
        return;
      }

      if (data.type === 'error') {
        const pending = this.pending.get(data.id);
        const error = new Error(
          typeof data.message === 'string'
            ? data.message
            : 'Unknown worker error'
        );
        if (pending) {
          pending.reject(error);
          this.pending.delete(data.id);
        }
        return;
      }
    });

    const errorHandler = (event: ErrorEvent | MessageEvent) => {
      const error =
        event instanceof ErrorEvent
          ? (event.error ?? new Error(event.message))
          : new Error('Worker message error');
      this.readyReject?.(error);
      this.readyResolve = null;
      this.readyReject = null;
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    };

    this.worker.addEventListener('error', errorHandler);
    this.worker.addEventListener('messageerror', errorHandler);
  }

  async load(source: string, batchSize: number): Promise<void> {
    await this.ready;
    await this.send('load', { source, batchSize });
  }

  async clear(): Promise<void> {
    await this.ready;
    await this.send('clear', {});
  }

  private send(
    type: 'load' | 'clear',
    payload: Record<string, unknown>
  ): Promise<void> {
    const id = ++this.seq;
    const message = { id, type, ...payload };

    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(message);
    });
  }
}

class SqliteStorageWorker extends StorageWorker {
  constructor() {
    const worker = new Worker(
      new URL('./sqlite/sqlite-storage-worker.ts', import.meta.url),
      {
        name: 'sqlite-storage-worker',
        type: 'module',
      }
    );
    super(worker);
  }
}

class WaSqliteStorageWorker extends StorageWorker {
  constructor() {
    const worker = new Worker(
      new URL('./wa-sqlite/wa-sqlite-storage-worker.ts', import.meta.url),
      {
        name: 'wa-sqlite-storage-worker',
        type: 'module',
      }
    );
    super(worker);
  }
}

function formatEstimate(estimate: StorageEstimate): string {
  const parts: Array<string> = [];
  if (typeof estimate.usage === 'number') {
    parts.push(`Usage: ${formatBytes(estimate.usage)}`);
  }

  const details = estimate.usageDetails;
  if (details) {
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === 'number') {
        parts.push(`${formatDetailKey(key)}: ${formatBytes(value)}`);
      }
    }
  }

  if (typeof estimate.quota === 'number') {
    parts.push(`Quota: ${formatBytes(estimate.quota)}`);
  }

  return parts.join(' | ') || 'Unavailable';
}

function formatDetailKey(key: string): string {
  const mapping: Record<string, string> = {
    indexedDB: 'IndexedDB',
    opfs: 'OPFS',
    fileSystem: 'File system',
  };
  return mapping[key] ?? key;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) {
    return 'n/a';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

const sqliteWorker = new SqliteStorageWorker();
const waSqliteWorker = new WaSqliteStorageWorker();

new BackendUI({
  name: 'SQLite',
  worker: sqliteWorker,
  loadButtonId: 'sqlite-load',
  clearButtonId: 'sqlite-clear',
  statusId: 'sqlite-status',
  beforeId: 'sqlite-before',
  afterId: 'sqlite-after',
});

new BackendUI({
  name: 'wa-sqlite',
  worker: waSqliteWorker,
  loadButtonId: 'wa-sqlite-load',
  clearButtonId: 'wa-sqlite-clear',
  statusId: 'wa-sqlite-status',
  beforeId: 'wa-sqlite-before',
  afterId: 'wa-sqlite-after',
});
