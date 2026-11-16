import type { RunResponse } from './py-worker';

type Done = Extract<RunResponse, { type: 'done' }>;

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: Done) => void; onStatus?: (s: string) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./py-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<RunResponse>) => {
      const msg = ev.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if (msg.type === 'status') p.onStatus?.(msg.message);
      else {
        pending.delete(msg.id);
        p.resolve(msg);
      }
    };
  }
  return worker;
}

/** Run Python in the shared page worker. Cells run sequentially in the worker. */
export function runPython(code: string, opts: { check?: string; onStatus?: (s: string) => void } = {}): Promise<Done> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { resolve, onStatus: opts.onStatus });
    getWorker().postMessage({ id, code, check: opts.check });
  });
}
