export async function* ljsonStreamIterator({
  stream,
  timeout,
  url,
}: {
  stream: ReadableStream<Uint8Array>;
  timeout: number;
  url: URL;
}): AsyncIterableIterator<object> {
  const reader = stream.getReader();
  const lineEnd = /\n|\r|\r\n/m;
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const parseLine = (line: string): any => {
    try {
      return JSON.parse(line);
    } catch {
      try {
        reader.releaseLock();
      } catch {
        // Ignore
      }
      throw new Error(`Could not parse JSON in database file: ${line}`);
    }
  };

  while (true) {
    let readResult: ReadableStreamReadResult<Uint8Array>;
    try {
      readResult = await waitWithTimeout({
        promise: reader.read(),
        timeout,
        url,
      });
    } catch (e) {
      try {
        reader.releaseLock();
      } catch {
        // Ignore
      }

      throw e;
    }

    const { done, value } = readResult;

    if (done) {
      buffer += decoder.decode();
      if (buffer) {
        yield parseLine(buffer);
        buffer = '';
      }

      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(lineEnd);

    // We don't know if the last line is actually the last line of the
    // input or not until we get done: true so we just assume it is
    // a partial line for now.
    buffer = lines.length ? lines.splice(lines.length - 1, 1)[0]! : '';

    for (const line of lines) {
      if (!line) {
        continue;
      }

      yield parseLine(line);
    }
  }
}

function waitWithTimeout<T>({
  promise,
  timeout,
  url,
}: {
  promise: Promise<T>;
  timeout: number;
  url?: URL;
}): Promise<T> {
  let timeoutId: number;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = self.setTimeout(() => {
      clearTimeout(timeoutId);
      reject(new Error(`Timeout waiting for ${url?.toString()}`));
    }, timeout);
  });

  return Promise.race([promise, timeoutPromise]).then((val: T) => {
    clearTimeout(timeoutId);
    return val;
  });
}