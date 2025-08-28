#!/usr/bin/env bun

import { createApp } from './app';
import { config, isDevelopment } from './lib/config';
import { logger } from './lib/logger';
import { setupProcessErrorHandlers } from './lib/errors';
import { initializeJobService, shutdownJobService } from './services/startup';

// Setup global error handlers
setupProcessErrorHandlers();

async function bootstrap(): Promise<void> {
  try {
    // Initialize job service
    await initializeJobService();
    
    // Create Express application
    const app = createApp();

    // Start server
    const server = app.listen(config.PORT, config.HOST, () => {
      logger.info({
        port: config.PORT,
        host: config.HOST,
        environment: config.NODE_ENV,
        processId: process.pid,
      }, 'Daily Dev Digest server started');

      if (isDevelopment()) {
        logger.info(`📧 Daily Dev Digest API running at http://${config.HOST}:${config.PORT}`);
        logger.info(`📚 API Documentation: http://${config.HOST}:${config.PORT}/docs`);
        logger.info(`🔍 Health Check: http://${config.HOST}:${config.PORT}/health`);
      }
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof config.PORT === 'string'
        ? `Pipe ${config.PORT}`
        : `Port ${config.PORT}`;

      // Handle specific listen errors with friendly messages
      switch (error.code) {
        case 'EACCES':
          logger.fatal(`${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.fatal(`${bind} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });

    // Graceful shutdown handling
    let shutdownInProgress = false;
    const gracefulShutdown = (signal: string): void => {
      if (shutdownInProgress) {
        logger.warn({ signal }, 'Shutdown already in progress, ignoring signal');
        return;
      }
      
      shutdownInProgress = true;
      logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');
      
      // Check if server is still listening before attempting to close
      if (server.listening) {
        server.close(async (error?: Error) => {
          logger.info('HTTP server closed');
          
          if (error) {
            logger.error({ err: error }, 'Error during server shutdown');
            process.exit(1);
          }
          
          // Close database connections, cleanup resources, etc.
          // Shutdown job service
          try {
            await shutdownJobService();
          } catch (shutdownError) {
            logger.error({ err: shutdownError }, 'Error shutting down job service');
          }
          
          logger.info('Graceful shutdown completed');
          process.exit(0);
        });
      } else {
        logger.info('Server not listening, proceeding with service shutdown');
        
        // Shutdown job service directly
        (async () => {
          try {
            await shutdownJobService();
          } catch (shutdownError) {
            logger.error({ err: shutdownError }, 'Error shutting down job service');
          }
          
          logger.info('Graceful shutdown completed');
          process.exit(0);
        })();
      }

      // Force close server after 30 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle process warnings
    process.on('warning', (warning: Error) => {
      logger.warn({ warning }, 'Process warning');
    });

  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the application
bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Bootstrap failed');
  process.exit(1);
});