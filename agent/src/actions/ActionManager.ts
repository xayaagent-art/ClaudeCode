import type { Logger } from '../logger';

/**
 * Tracks what the bot is currently doing and guarantees that starting a new
 * action cleanly tears down the previous one.
 *
 * Every long-running behaviour registers a `cleanup` callback. `!stop` — and
 * any newly started action — invokes it. This single choke point is what will
 * later let the Phase 2 planner interrupt a running goal safely.
 */
export class ActionManager {
  private current = 'idle';
  private cleanup: (() => void) | null = null;
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log.child('actions');
  }

  /** Human-readable name of the running action, or `idle`. */
  get currentAction(): string {
    return this.current;
  }

  get isIdle(): boolean {
    return this.current === 'idle';
  }

  /**
   * Begin a new action, tearing down whatever was running before.
   *
   * @param name    label shown by `!status`
   * @param cleanup invoked when this action is stopped or replaced
   */
  start(name: string, cleanup?: () => void): void {
    if (this.cleanup) {
      this.log.debug(`replacing "${this.current}" with "${name}"`);
      this.runCleanup();
    }
    this.current = name;
    this.cleanup = cleanup ?? null;
    this.log.info(`started: ${name}`);
  }

  /**
   * Stop the running action and return to idle.
   *
   * @returns the name of the action that was stopped, or null if already idle.
   */
  stop(): string | null {
    if (this.current === 'idle') return null;
    const stopped = this.current;
    this.runCleanup();
    this.current = 'idle';
    this.log.info(`stopped: ${stopped}`);
    return stopped;
  }

  /**
   * Mark the current action finished without running cleanup teardown twice —
   * used by one-shot actions that completed on their own (e.g. arriving).
   */
  complete(name: string): void {
    if (this.current !== name) return; // superseded by something else; leave it alone
    this.cleanup = null;
    this.current = 'idle';
    this.log.info(`completed: ${name}`);
  }

  private runCleanup(): void {
    const fn = this.cleanup;
    this.cleanup = null;
    if (!fn) return;
    try {
      fn();
    } catch (err) {
      // A failing teardown must never prevent the next action from starting.
      this.log.warn(`cleanup for "${this.current}" threw:`, err);
    }
  }
}
