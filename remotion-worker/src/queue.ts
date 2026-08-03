/**
 * Render queue driver (tasks.md 7.2, design D4 演进：M4 前的队列化).
 *
 * Two isomorphic paths behind one interface:
 *  - memory (default): enqueue → execute immediately (status quo, no deps);
 *  - bullmq (QUEUE_ENABLED=true): POST /render enqueues into redis; a BullMQ
 *    Worker in this process consumes with QUEUE_CONCURRENCY (default 2).
 *    The BullMQ Job itself carries state (waiting/active/completed/failed +
 *    progress via updateProgress); execute() mirrors it into the in-memory
 *    job table and WS events (server.ts).
 */
import {Queue, Worker} from 'bullmq';
import type {ParseWarning, VideoIR} from './parser/types.js';

export interface RenderTask {
  jobId: string;
  ir?: VideoIR;
  warnings: ParseWarning[];
  frames?: {start: number; end: number};
}

export type ProgressReporter = (progress: number) => void | Promise<void>;
export type TaskExecutor = (task: RenderTask, report: ProgressReporter) => Promise<void>;

export interface QueueDriver {
  mode: 'memory' | 'bullmq';
  enqueue(task: RenderTask): Promise<void>;
  close(): Promise<void>;
}

export interface QueueDriverOptions {
  enabled: boolean;
  redisUrl: string;
  concurrency: number;
  execute: TaskExecutor;
  /** Fallback when redis is enabled but unreachable (enqueue fails). */
  onQueueError?: (task: RenderTask, err: unknown) => void;
}

export function createQueueDriver(opts: QueueDriverOptions): QueueDriver {
  const {enabled, redisUrl, concurrency, execute, onQueueError} = opts;

  if (!enabled) {
    return {
      mode: 'memory',
      async enqueue(task) {
        // Fire-and-forget immediate execution (status quo).
        void execute(task, () => {});
      },
      async close() {},
    };
  }

  const connection = {url: redisUrl};
  const queue = new Queue<RenderTask>('render', {connection});
  const worker = new Worker<RenderTask>(
    'render',
    async (bullJob) => {
      await execute(bullJob.data, (progress) => bullJob.updateProgress(progress));
    },
    {connection, concurrency},
  );
  worker.on('error', (err) => {
    console.error('[remotion-worker] bullmq worker error:', err.message);
  });

  return {
    mode: 'bullmq',
    async enqueue(task) {
      try {
        await queue.add('render', task, {jobId: task.jobId});
      } catch (err) {
        onQueueError?.(task, err);
      }
    },
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
