import { BotRunner } from './bot';
import { loadConfig } from './config';
import { createLogger } from './logger';

/**
 * Entry point for Phase 1: start a single bot ("Aiden") and keep it alive.
 *
 * Phase 2 turns this into a small supervisor that constructs one BotRunner per
 * configured agent — the runner already supports that today.
 */
function main(): void {
  const config = loadConfig();
  const log = createLogger('runner', config.logLevel);

  const runner = new BotRunner(config);

  // Ctrl-C should leave the server cleanly rather than looking like a crash.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`received ${signal}, disconnecting…`);
    runner.shutdown();
    // Give the quit packet a moment to flush before exiting.
    setTimeout(() => process.exit(0), 500);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // A stray rejection anywhere in the async command paths should be logged,
  // not silently kill the process.
  process.on('unhandledRejection', (reason) => {
    log.error('unhandled rejection:', reason);
  });

  runner.start();
}

main();
