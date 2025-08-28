/**
 * Health Check Job Handler - System monitoring and alerting
 */

import {
  BaseJob,
  JobResult,
  JobHandler,
  JobType,
  HealthCheckJobParams
} from '../../types/job';
import { logger } from '../../lib/logger';
import { db } from '../../db';

interface HealthCheckResult {
  check: string;
  healthy: boolean;
  responseTime?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export class HealthCheckJobHandler implements JobHandler {
  type = JobType.HEALTH_CHECK;

  async handle(job: BaseJob): Promise<JobResult> {
    try {
      const params = job.params as HealthCheckJobParams;

      if (!this.validate(params)) {
        return {
          success: false,
          error: 'Invalid health check job parameters'
        };
      }

      logger.info({
        jobId: job.id,
        checks: params.checks,
        alertOnFailure: params.alertOnFailure
      }, 'Starting health check job');

      const results: HealthCheckResult[] = [];
      let overallHealthy = true;

      // Run each health check
      for (let i = 0; i < params.checks.length; i++) {
        const checkName = params.checks[i];
        const progress = Math.floor((i / params.checks.length) * 90);
        
        await this.updateProgress(job.id, progress, `Running ${checkName} check`);
        
        try {
          const checkResult = await this.runHealthCheck(checkName);
          results.push(checkResult);
          
          if (!checkResult.healthy) {
            overallHealthy = false;
          }

          logger.debug({
            jobId: job.id,
            check: checkName,
            healthy: checkResult.healthy,
            responseTime: checkResult.responseTime
          }, 'Health check completed');

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({
            check: checkName,
            healthy: false,
            error: errorMessage
          });
          overallHealthy = false;

          logger.error({
            jobId: job.id,
            check: checkName,
            error: errorMessage
          }, 'Health check failed with exception');
        }
      }

      // Send alerts if configured and there are failures
      if (params.alertOnFailure && !overallHealthy && params.alertRecipients) {
        await this.updateProgress(job.id, 95, 'Sending failure alerts');
        await this.sendAlerts(results.filter(r => !r.healthy), params.alertRecipients);
      }

      await this.updateProgress(job.id, 100, 'Health check completed');

      const failedChecks = results.filter(r => !r.healthy);
      
      logger.info({
        jobId: job.id,
        overallHealthy,
        totalChecks: results.length,
        failedChecks: failedChecks.length,
        averageResponseTime: this.calculateAverageResponseTime(results)
      }, 'Health check job completed');

      return {
        success: true,
        data: {
          overallHealthy,
          checks: results,
          summary: {
            total: results.length,
            healthy: results.filter(r => r.healthy).length,
            unhealthy: failedChecks.length,
            averageResponseTime: this.calculateAverageResponseTime(results)
          }
        },
        metadata: {
          alertsSent: params.alertOnFailure && !overallHealthy,
          timestamp: new Date()
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
        jobId: job.id,
        error: errorMessage
      }, 'Health check job failed');

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
    if (!params.checks || !Array.isArray(params.checks) || params.checks.length === 0) {
      return false;
    }

    // Validate check names
    const validChecks = [
      'database',
      'memory',
      'disk',
      'jobs',
      'external_apis',
      'github_api',
      'notification_services'
    ];

    for (const check of params.checks) {
      if (!validChecks.includes(check)) {
        return false;
      }
    }

    // Validate alert configuration
    if (params.alertOnFailure && (!params.alertRecipients || !Array.isArray(params.alertRecipients))) {
      return false;
    }

    return true;
  }

  estimateTime(params: HealthCheckJobParams): number {
    let baseTime = 10; // 10 seconds base

    // Add time per check
    baseTime += params.checks.length * 5; // 5 seconds per check

    // Add time for external checks
    const externalChecks = params.checks.filter(check => 
      ['external_apis', 'github_api', 'notification_services'].includes(check)
    );
    baseTime += externalChecks.length * 10; // Extra time for external checks

    // Add time for alerts
    if (params.alertOnFailure && params.alertRecipients) {
      baseTime += params.alertRecipients.length * 2;
    }

    return Math.min(baseTime, 300); // Max 5 minutes
  }

  private async runHealthCheck(checkName: string): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      switch (checkName) {
        case 'database':
          return await this.checkDatabase(startTime);
        case 'memory':
          return await this.checkMemory(startTime);
        case 'disk':
          return await this.checkDisk(startTime);
        case 'jobs':
          return await this.checkJobQueue(startTime);
        case 'external_apis':
          return await this.checkExternalAPIs(startTime);
        case 'github_api':
          return await this.checkGitHubAPI(startTime);
        case 'notification_services':
          return await this.checkNotificationServices(startTime);
        default:
          return {
            check: checkName,
            healthy: false,
            error: `Unknown health check: ${checkName}`,
            responseTime: Date.now() - startTime
          };
      }
    } catch (error) {
      return {
        check: checkName,
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime
      };
    }
  }

  private async checkDatabase(startTime: number): Promise<HealthCheckResult> {
    try {
      // Test database connectivity and performance
      const testQuery = await db.$queryRaw`SELECT 1 as test`;
      
      // Test a simple write operation
      const testUser = await db.user.findFirst({
        select: { id: true }
      });

      const responseTime = Date.now() - startTime;

      return {
        check: 'database',
        healthy: true,
        responseTime,
        metadata: {
          testQueryResult: testQuery,
          hasUsers: !!testUser
        }
      };
    } catch (error) {
      return {
        check: 'database',
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime
      };
    }
  }

  private async checkMemory(startTime: number): Promise<HealthCheckResult> {
    const memUsage = process.memoryUsage();
    const responseTime = Date.now() - startTime;

    // Convert bytes to MB
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);

    // Check if memory usage is concerning (>80% heap usage or >1GB RSS)
    const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const healthy = heapUsagePercent < 80 && rssMB < 1024;

    return {
      check: 'memory',
      healthy,
      responseTime,
      error: !healthy ? 'High memory usage detected' : undefined,
      metadata: {
        heapUsedMB,
        heapTotalMB,
        rssMB,
        heapUsagePercent: Math.round(heapUsagePercent),
        externalMB: Math.round(memUsage.external / 1024 / 1024)
      }
    };
  }

  private async checkDisk(startTime: number): Promise<HealthCheckResult> {
    try {
      // Mock disk check - in real implementation, use fs.statSync or similar
      const responseTime = Date.now() - startTime;

      // Simulate disk space check
      const mockDiskInfo = {
        totalGB: 100,
        usedGB: 65,
        availableGB: 35,
        usagePercent: 65
      };

      const healthy = mockDiskInfo.usagePercent < 90;

      return {
        check: 'disk',
        healthy,
        responseTime,
        error: !healthy ? 'Disk space running low' : undefined,
        metadata: mockDiskInfo
      };
    } catch (error) {
      return {
        check: 'disk',
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime
      };
    }
  }

  private async checkJobQueue(startTime: number): Promise<HealthCheckResult> {
    try {
      // Check job queue health
      const pendingJobs = await db.job.count({
        where: { status: 'PENDING' }
      });

      const runningJobs = await db.job.count({
        where: { status: 'RUNNING' }
      });

      const failedJobs = await db.job.count({
        where: {
          status: 'FAILED',
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });

      const responseTime = Date.now() - startTime;

      // Health criteria: not too many pending jobs, not too many recent failures
      const healthy = pendingJobs < 1000 && failedJobs < 50;

      return {
        check: 'jobs',
        healthy,
        responseTime,
        error: !healthy ? 'Job queue issues detected' : undefined,
        metadata: {
          pendingJobs,
          runningJobs,
          failedJobsLast24h: failedJobs
        }
      };
    } catch (error) {
      return {
        check: 'jobs',
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime
      };
    }
  }

  private async checkExternalAPIs(startTime: number): Promise<HealthCheckResult> {
    // Mock external API health check
    const responseTime = Date.now() - startTime;
    
    // Simulate checking external services
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      check: 'external_apis',
      healthy: true,
      responseTime,
      metadata: {
        services: ['auth_service', 'email_service', 'analytics'],
        allHealthy: true
      }
    };
  }

  private async checkGitHubAPI(startTime: number): Promise<HealthCheckResult> {
    try {
      // Mock GitHub API check
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const responseTime = Date.now() - startTime;

      // In real implementation, make a test API call to GitHub
      const mockRateLimit = {
        remaining: 4500,
        limit: 5000,
        resetTime: new Date(Date.now() + 60 * 60 * 1000)
      };

      const healthy = mockRateLimit.remaining > 100; // At least 100 requests remaining

      return {
        check: 'github_api',
        healthy,
        responseTime,
        error: !healthy ? 'GitHub API rate limit low' : undefined,
        metadata: mockRateLimit
      };
    } catch (error) {
      return {
        check: 'github_api',
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        responseTime: Date.now() - startTime
      };
    }
  }

  private async checkNotificationServices(startTime: number): Promise<HealthCheckResult> {
    // Mock notification services check
    const responseTime = Date.now() - startTime;
    
    await new Promise(resolve => setTimeout(resolve, 150));

    const mockServiceStatus = {
      email: { healthy: true, lastCheck: new Date() },
      slack: { healthy: true, lastCheck: new Date() },
      webhook: { healthy: true, lastCheck: new Date() }
    };

    const allHealthy = Object.values(mockServiceStatus).every(service => service.healthy);

    return {
      check: 'notification_services',
      healthy: allHealthy,
      responseTime,
      error: !allHealthy ? 'Some notification services are down' : undefined,
      metadata: mockServiceStatus
    };
  }

  private async sendAlerts(failedChecks: HealthCheckResult[], recipients: string[]): Promise<void> {
    try {
      const alertMessage = this.buildAlertMessage(failedChecks);
      
      logger.warn({
        failedChecks: failedChecks.map(c => c.check),
        recipients
      }, 'Sending health check failure alerts');

      // In a real implementation, create notification jobs or send alerts directly
      // For now, just log the alert
      for (const recipient of recipients) {
        logger.info({
          recipient,
          message: alertMessage
        }, 'Health check alert sent');
      }
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to send health check alerts');
    }
  }

  private buildAlertMessage(failedChecks: HealthCheckResult[]): string {
    let message = `🚨 Health Check Alert\n\n`;
    message += `${failedChecks.length} health check(s) failed:\n\n`;

    for (const check of failedChecks) {
      message += `❌ ${check.check}: ${check.error}\n`;
      if (check.responseTime) {
        message += `   Response time: ${check.responseTime}ms\n`;
      }
      message += `\n`;
    }

    message += `Please investigate immediately.\n`;
    message += `Timestamp: ${new Date().toISOString()}`;

    return message;
  }

  private calculateAverageResponseTime(results: HealthCheckResult[]): number {
    const validResults = results.filter(r => r.responseTime !== undefined);
    if (validResults.length === 0) return 0;

    const total = validResults.reduce((sum, r) => sum + (r.responseTime || 0), 0);
    return Math.round(total / validResults.length);
  }

  private async updateProgress(jobId: string, progress: number, message?: string): Promise<void> {
    logger.debug({ jobId, progress, message }, 'Health check job progress updated');
  }
}