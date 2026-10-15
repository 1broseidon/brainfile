/**
 * A run between being registered and its first prompt (task-39). Its agent
 * is being fetched, started and given a session, and there is no session to
 * cancel yet, so stop has nothing to reach but this: the startup's signal
 * aborts, the agent is killed or never spawned, and a session that opens
 * anyway is closed unprompted. A stopped run is never handed its task.
 */
export class Startups {
  private live = new Map<string, AbortController>();

  /**
   * Opens a run's session, unless the run is stopped first: `open` gets a
   * signal that aborts on stop, and what it opens after the stop is closed.
   * Null when the run was stopped; open's own failures are thrown as before.
   */
  async open<S>(runId: string, open: (signal: AbortSignal) => Promise<S>, close: (session: S) => void): Promise<S | null> {
    const controller = new AbortController();
    this.live.set(runId, controller);
    try {
      const session = await open(controller.signal);
      if (!controller.signal.aborted) return session;
      close(session);
      return null;
    } catch (err) {
      if (controller.signal.aborted) return null;
      throw err;
    } finally {
      this.live.delete(runId);
    }
  }

  /** Stops a run that is still starting; false when it is not starting. */
  stop(runId: string): boolean {
    const controller = this.live.get(runId);
    controller?.abort();
    return !!controller;
  }

  /** Whether a run's startup has yet to finish, stopped or not. */
  starting(runId: string): boolean {
    return this.live.has(runId);
  }
}

/** `promise`, or a rejection as soon as `signal` aborts: a startup step stop does not wait for. */
export function unlessAborted<T>(signal: AbortSignal | undefined, promise: Promise<T>): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', abort);
        reject(err);
      }
    );
  });
}
