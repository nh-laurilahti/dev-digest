/**
 * Cleanup Job Handler - Database maintenance and old data removal
 */

import {
  BaseJob,
  JobResult,
  JobHandler,
  JobType,
  CleanupJobParams
} from '../../types/job';
import { logger } from '../../lib/logger';
import { db } from '../../db';

export class CleanupJobHandler implements JobHandler {
  type = JobType.CLEANUP;

  async handle(job: BaseJob): Promise<JobResult> {
    try {
      const params = job.params as CleanupJobParams;

      if (!this.validate(params)) {
        return {
          success: false,
          error: 'Invalid cleanup job parameters'
        };
      }

      logger.info({
        jobId: job.id,
        targetTable: params.targetTable,
        olderThan: params.olderThan,
        dryRun: params.dryRun || false,
        batchSize: params.batchSize || 100
      }, 'Starting cleanup job');

      const result = await this.performCleanup(job.id, params);

      logger.info({
        jobId: job.id,
        ...result
      }, 'Cleanup job completed');

      return {
        success: true,
        data: result,
        metadata: {
          targetTable: params.targetTable,
          dryRun: params.dryRun || false
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
        jobId: job.id,
        error: errorMessage
      }, 'Cleanup job failed');

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  validate(params: any): boolean {
    if (!params || typeof params !== 'object') {
      return false;
    }

    // Required fields
    if (!params.targetTable || !params.olderThan) {
      return false;
    }

    // Validate target table
    const validTables = [
      'jobs',
      'digests', 
      'notifications',
      'sessions',
      'webhook_deliveries',
      'api_keys'
    ];
    
    if (!validTables.includes(params.targetTable)) {
      return false;
    }

    // Validate date
    const olderThan = new Date(params.olderThan);
    if (isNaN(olderThan.getTime())) {
      return false;
    }

    // Validate batch size if provided
    if (params.batchSize && (typeof params.batchSize !== 'number' || params.batchSize < 1 || params.batchSize > 10000)) {
      return false;
    }

    return true;
  }

  estimateTime(params: CleanupJobParams): number {
    let baseTime = 30; // 30 seconds base

    const batchSize = params.batchSize || 100;
    
    // Estimate based on table type and expected data volume
    switch (params.targetTable) {
      case 'jobs':
        baseTime += 60; // Jobs table might be large
        break;
      case 'notifications':
        baseTime += 45; // Notifications can be numerous
        break;
      case 'sessions':
        baseTime += 20; // Sessions are typically smaller
        break;
      case 'webhook_deliveries':
        baseTime += 30;
        break;
      default:
        baseTime += 30;
    }

    // Reduce estimate for dry runs
    if (params.dryRun) {
      baseTime = Math.ceil(baseTime / 3);
    }

    return Math.min(baseTime, 600); // Max 10 minutes
  }

  private async performCleanup(jobId: string, params: CleanupJobParams): Promise<{
    recordsFound: number;
    recordsDeleted: number;
    batchesProcessed: number;
    errors: string[];
  }> {
    const batchSize = params.batchSize || 100;
    const isDryRun = params.dryRun || false;
    
    let totalFound = 0;
    let totalDeleted = 0;
    let batchesProcessed = 0;
    const errors: string[] = [];

    await this.updateProgress(jobId, 10, 'Counting records to cleanup');

    try {
      // Count total records to be deleted
      totalFound = await this.countRecordsToDelete(params.targetTable, params.olderThan);
      
      logger.info({
        jobId,
        targetTable: params.targetTable,
        recordsFound: totalFound,
        isDryRun
      }, `Found ${totalFound} records to ${isDryRun ? 'analyze' : 'delete'}`);

      if (totalFound === 0) {
        await this.updateProgress(jobId, 100, 'No records found for cleanup');
        return {
          recordsFound: 0,
          recordsDeleted: 0,
          batchesProcessed: 0,
          errors: []
        };
      }

      if (isDryRun) {
        await this.updateProgress(jobId, 100, `Dry run complete: ${totalFound} records would be deleted`);
        return {
          recordsFound: totalFound,
          recordsDeleted: 0,
          batchesProcessed: 0,
          errors: []
        };
      }

      // Process in batches
      const totalBatches = Math.ceil(totalFound / batchSize);
      
      while (totalDeleted < totalFound) {
        try {
          const progress = 20 + Math.floor((batchesProcessed / totalBatches) * 70);
          await this.updateProgress(jobId, progress, `Processing batch ${batchesProcessed + 1}/${totalBatches}`);

          const deletedInBatch = await this.deleteRecordsBatch(
            params.targetTable,
            params.olderThan,
            batchSize
          );

          totalDeleted += deletedInBatch;
          batchesProcessed++;

          logger.debug({
            jobId,
            batch: batchesProcessed,
            deletedInBatch,
            totalDeleted
          }, 'Batch processed');

          // Small delay between batches to avoid overwhelming the database
          if (batchesProcessed < totalBatches) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // Safety check to prevent infinite loops
          if (deletedInBatch === 0) {
            break;
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Batch ${batchesProcessed + 1}: ${errorMessage}`);
          
          logger.error({
            jobId,
            batch: batchesProcessed + 1,
            error: errorMessage
          }, 'Error in cleanup batch');

          // Continue with next batch unless it's a critical error
          if (!errorMessage.includes('SQLITE_BUSY') && !errorMessage.includes('timeout')) {
            break;
          }
          
          batchesProcessed++;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
        }
      }

      await this.updateProgress(jobId, 100, `Cleanup complete: ${totalDeleted} records deleted`);

      return {
        recordsFound: totalFound,
        recordsDeleted: totalDeleted,
        batchesProcessed,
        errors
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);
      throw error;
    }
  }

  private async countRecordsToDelete(targetTable: string, olderThan: Date): Promise<number> {
    try {
      switch (targetTable) {
        case 'jobs':
          return await db.job.count({
            where: {
              AND: [
                { createdAt: { lt: olderThan } },
                { status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] } }
              ]
            }
          });

        case 'digests':
          return await db.digest.count({
            where: {
              createdAt: { lt: olderThan }
            }
          });

        case 'notifications':
          return await db.notification.count({
            where: {
              AND: [
                { createdAt: { lt: olderThan } },
                { status: { in: ['sent', 'failed'] } }
              ]
            }
          });

        case 'sessions':
          return await db.session.count({
            where: {
              OR: [
                { expiresAt: { lt: new Date() } }, // Expired sessions
                { createdAt: { lt: olderThan } }    // Old sessions
              ]
            }
          });

        case 'webhook_deliveries':
          return await db.webhookDelivery.count({
            where: {
              createdAt: { lt: olderThan }
            }
          });

        case 'api_keys':
          return await db.apiKey.count({
            where: {
              OR: [
                { expiresAt: { lt: new Date() } },  // Expired keys
                { 
                  AND: [
                    { createdAt: { lt: olderThan } },
                    { isActive: false }              // Old inactive keys
                  ]
                }
              ]
            }
          });

        default:
          throw new Error(`Unsupported cleanup table: ${targetTable}`);
      }
    } catch (error) {
      logger.error({
        targetTable,
        olderThan,
        error: error instanceof Error ? error.message : String(error)
      }, 'Error counting records to delete');
      throw error;
    }
  }

  private async deleteRecordsBatch(
    targetTable: string,
    olderThan: Date,
    batchSize: number
  ): Promise<number> {
    try {
      let result: { count: number };

      switch (targetTable) {
        case 'jobs':
          result = await db.job.deleteMany({
            where: {
              AND: [
                { createdAt: { lt: olderThan } },
                { status: { in: ['COMPLETED', 'FAILED', 'CANCELLED'] } }
              ]
            }
          });
          break;

        case 'digests':
          // Be more careful with digests - only delete very old ones
          const veryOldDate = new Date(olderThan.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days older
          result = await db.digest.deleteMany({
            where: {
              createdAt: { lt: veryOldDate }
            }
          });
          break;

        case 'notifications':
          result = await db.notification.deleteMany({
            where: {
              AND: [
                { createdAt: { lt: olderThan } },
                { status: { in: ['sent', 'failed'] } }
              ]
            }
          });
          break;

        case 'sessions':
          result = await db.session.deleteMany({
            where: {
              OR: [
                { expiresAt: { lt: new Date() } },
                { createdAt: { lt: olderThan } }
              ]
            }
          });
          break;

        case 'webhook_deliveries':
          result = await db.webhookDelivery.deleteMany({
            where: {
              createdAt: { lt: olderThan }
            }
          });
          break;

        case 'api_keys':
          result = await db.apiKey.deleteMany({
            where: {
              OR: [
                { expiresAt: { lt: new Date() } },
                { 
                  AND: [
                    { createdAt: { lt: olderThan } },
                    { isActive: false }
                  ]
                }
              ]
            }
          });
          break;

        default:
          throw new Error(`Unsupported cleanup table: ${targetTable}`);
      }

      return result.count;

    } catch (error) {
      logger.error({
        targetTable,
        olderThan,
        batchSize,
        error: error instanceof Error ? error.message : String(error)
      }, 'Error deleting records batch');
      throw error;
    }
  }

  private async updateProgress(jobId: string, progress: number, message?: string): Promise<void> {
    logger.debug({ jobId, progress, message }, 'Cleanup job progress updated');
  }
}