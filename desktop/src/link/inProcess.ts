/**
 * The real board host (host/host.ts), run in this process instead of as an
 * Electron utility process: Electron's `process.parentPort` is played by an
 * emitter. For `npm run link:dev` and the tests, which have no Electron, so
 * a phone's reads and writes go through the same code as the app's.
 */
import { EventEmitter } from 'events';
import type { BoardSnapshot, HostMessage, HostRequest } from '../shared/api';

export interface InProcessHost {
  call<T>(method: HostRequest['method'], ...args: unknown[]): Promise<T>;
  onBoard(listener: (snapshot: BoardSnapshot) => void): void;
}

/** `load` brings the host in (a `require` of it), once the port it talks through is in place. */
export function inProcessHost(load: () => unknown): InProcessHost {
  const pending = new Map<number, (result: unknown) => void>();
  const listeners: ((snapshot: BoardSnapshot) => void)[] = [];
  const port = Object.assign(new EventEmitter(), {
    postMessage(message: HostMessage) {
      if (message.kind === 'reply') {
        pending.get(message.id)?.(message.result);
        pending.delete(message.id);
      } else {
        for (const listener of listeners) listener(message.snapshot);
      }
    },
  });
  (process as unknown as { parentPort: unknown }).parentPort = port;
  load();
  let next = 1;
  return {
    call<T>(method: HostRequest['method'], ...args: unknown[]): Promise<T> {
      const id = next++;
      return new Promise((resolve) => {
        pending.set(id, resolve as (result: unknown) => void);
        port.emit('message', { data: { id, method, args } satisfies HostRequest });
      });
    },
    onBoard: (listener) => void listeners.push(listener),
  };
}
