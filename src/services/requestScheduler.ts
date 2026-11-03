export type RequestPriority = 'interactive' | 'visible' | 'prefetch';

export interface ScheduledRequestOptions {
  priority?: RequestPriority;
  signal?: AbortSignal;
}

const priorities: Record<RequestPriority, number> = { interactive: 0, visible: 1, prefetch: 2 };

interface Consumer {
  priority: number;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  cleanup: () => void;
}

interface Job {
  key: string;
  task: (signal: AbortSignal) => Promise<unknown>;
  consumers: Set<Consumer>;
  phase: 'queued' | 'running' | 'restarting' | 'cancelled';
  controller?: AbortController;
  order: number;
}

/** Shares pending work; settled responses belong in a separate, expiring cache. */
export class RequestScheduler {
  private jobs = new Map<string, Job>();
  private active = new Set<Job>();
  private order = 0;
  private backgroundPaused = false;
  private prefetchPaused = false;
  private draining = false;

  constructor(private readonly concurrency = 2) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new Error('Request concurrency must be a positive integer.');
    }
  }

  schedule<T>(
    key: string,
    task: (signal: AbortSignal) => Promise<T>,
    options: ScheduledRequestOptions = {},
  ): Promise<T> {
    if (options.signal?.aborted) return Promise.reject(options.signal.reason);
    let job = this.jobs.get(key);
    if (!job) {
      job = { key, task, consumers: new Set(), phase: 'queued', order: this.order++ };
      this.jobs.set(key, job);
    }
    const shared = job;
    return new Promise<T>((resolve, reject) => {
      const consumer: Consumer = {
        priority: priorities[options.priority ?? 'interactive'],
        resolve: (value) => resolve(value as T),
        reject,
        cleanup: () => options.signal?.removeEventListener('abort', cancel),
      };
      const cancel = () => {
        if (!shared.consumers.delete(consumer)) return;
        consumer.cleanup();
        reject(options.signal?.reason);
        if (shared.consumers.size === 0) {
          if (this.jobs.get(key) === shared) this.jobs.delete(key);
          shared.phase = 'cancelled';
          shared.controller?.abort();
        }
        this.drain();
      };
      shared.consumers.add(consumer);
      options.signal?.addEventListener('abort', cancel, { once: true });
      this.drain();
    });
  }

  setBackgroundPaused(paused: boolean): void {
    this.backgroundPaused = paused;
    this.drain();
  }

  setPrefetchPaused(paused: boolean): void {
    this.prefetchPaused = paused;
    this.drain();
  }

  private priority(job: Job): number {
    return Math.min(...[...job.consumers].map((consumer) => consumer.priority));
  }

  private allowed(job: Job): boolean {
    const priority = this.priority(job);
    return priority === 0 || (!this.backgroundPaused && (!this.prefetchPaused || priority < 2));
  }

  private restart(job: Job): void {
    job.phase = 'restarting';
    job.controller?.abort();
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      for (const job of this.active) {
        if (job.phase === 'running' && !this.allowed(job)) this.restart(job);
      }
      const queued = [...this.jobs.values()]
        .filter((job) => job.phase === 'queued' && this.allowed(job))
        .sort((a, b) => this.priority(a) - this.priority(b) || a.order - b.order);
      const interactiveWaiting = queued.filter((job) => this.priority(job) === 0).length;
      const releasing = [...this.active].filter((job) => job.phase !== 'running').length;
      let needed = interactiveWaiting - (this.concurrency - this.active.size) - releasing;
      for (const job of [...this.active].sort((a, b) => this.priority(b) - this.priority(a))) {
        if (needed <= 0) break;
        if (job.phase !== 'running' || this.priority(job) === 0) continue;
        this.restart(job);
        needed -= 1;
      }
      for (const job of queued) {
        if (this.active.size >= this.concurrency) break;
        if (job.phase !== 'queued' || job.consumers.size === 0) continue;
        this.start(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private start(job: Job): void {
    const controller = new AbortController();
    job.controller = controller;
    job.phase = 'running';
    this.active.add(job);
    void Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return job.task(controller.signal);
      })
      .then(
        (value) => this.finish(job, true, value),
        (error) => this.finish(job, false, error),
      );
  }

  private finish(job: Job, success: boolean, value: unknown): void {
    this.active.delete(job);
    if (job.phase === 'restarting' && job.consumers.size > 0) {
      job.phase = 'queued';
      job.controller = undefined;
    } else {
      if (this.jobs.get(job.key) === job) this.jobs.delete(job.key);
      for (const consumer of job.consumers) {
        consumer.cleanup();
        if (success) consumer.resolve(value);
        else consumer.reject(value);
      }
      job.consumers.clear();
    }
    this.drain();
  }
}
