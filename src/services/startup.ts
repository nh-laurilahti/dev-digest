/**
 * Job Service Startup Integration
 */

import { jobService } from './index';
import { logger } from '../lib/logger';

let isInitialized = false;

/**
 * Initialize the job service
 */
export async function initializeJobService(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    await jobService.initialize();
    isInitialized = true;
    logger.info('Job service startup completed');
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error)
    }, 'Failed to initialize job service');
    throw error;
  }
}

/**
 * Shutdown the job service gracefully
 */
export async function shutdownJobService(): Promise<void> {
  if (!isInitialized) {
    return;
  }

  try {
    await jobService.shutdown();
    isInitialized = false;
    logger.info('Job service shutdown completed');
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : String(error)
    }, 'Error during job service shutdown');
  }
}

/**
 * Setup graceful shutdown handlers
 */
export function setupGracefulShutdown(): void {
  const signals = ['SIGTERM', 'SIGINT'];

  signals.forEach(signal => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, initiating graceful shutdown...`);
      
      try {
        await shutdownJobService();
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error({
          error: error instanceof Error ? error.message : String(error)
        }, 'Error during graceful shutdown');
        process.exit(1);
      }
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error({
      reason,
      promise
    }, 'Unhandled rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.error({
      error: error.message,
      stack: error.stack
    }, 'Uncaught exception');
    
    // Attempt graceful shutdown
    shutdownJobService().finally(() => {
      process.exit(1);
    });
  });
}