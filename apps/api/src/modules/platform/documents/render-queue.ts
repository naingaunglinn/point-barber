// The in-process queue of the DocumentRenderer (ADR-013 decision 7 · add-walkin-visit-checkout design
// D10): one render at a time; an interactive render (a receipt a person asked for) goes ahead of the
// queued background renders (the jobs); each render has a timeout.

export type RenderPriority = 'interactive' | 'background';

export class RenderTimeout extends Error {
  constructor(readonly timeoutMs: number) {
    super(`render took longer than ${timeoutMs} ms`);
    this.name = 'RenderTimeout';
  }
}

interface Task {
  readonly work: () => Promise<unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly timeoutMs: number;
  readonly onTimeout: () => Promise<void>;
}

export class RenderQueue {
  private readonly interactive: Task[] = [];
  private readonly background: Task[] = [];
  private running = false;

  /** Runs `work` when it is its turn; `onTimeout` cleans up after a render that took too long. */
  run<T>(
    work: () => Promise<T>,
    options: {
      readonly priority: RenderPriority;
      readonly timeoutMs: number;
      readonly onTimeout?: () => Promise<void>;
    },
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: Task = {
        work,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutMs: options.timeoutMs,
        onTimeout: options.onTimeout ?? (() => Promise.resolve()),
      };
      (options.priority === 'interactive' ? this.interactive : this.background).push(task);
      void this.next();
    });
  }

  /** Renders waiting, the running one excluded. */
  get waiting(): number {
    return this.interactive.length + this.background.length;
  }

  private async next(): Promise<void> {
    if (this.running) return;
    const task = this.interactive.shift() ?? this.background.shift();
    if (task === undefined) return;
    this.running = true;
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new RenderTimeout(task.timeoutMs));
        }, task.timeoutMs);
      });
      task.resolve(await Promise.race([task.work(), timeout]));
    } catch (error) {
      if (error instanceof RenderTimeout) await task.onTimeout().catch(() => undefined);
      task.reject(error);
    } finally {
      clearTimeout(timer);
      this.running = false;
      void this.next();
    }
  }
}
