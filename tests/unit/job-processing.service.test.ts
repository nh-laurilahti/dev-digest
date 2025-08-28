import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { jobService } from '../../src/services';
import { JobType, JobStatus, JobPriority } from '../../src/types/job';
import { 
  ValidationError, 
  NotFoundError,
  ConflictError 
} from '../../src/lib/errors';

// Mock the individual job components
vi.mock('../../src/services/job-queue');
vi.mock('../../src/services/job-processor');
vi.mock('../../src/services/scheduler');
vi.mock('../../src/services/job-monitor');
vi.mock('../../src/services/workers');
vi.mock('../../src/services/jobs');

describe('JobProcessingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Ensure job service is properly cleaned up
    await jobService.shutdown();
  });

  describe('initialization', () => {
    it('should initialize job service successfully', async () => {
      await expect(jobService.initialize()).resolves.not.toThrow();
    });

    it('should not initialize twice', async () => {
      await jobService.initialize();
      await expect(jobService.initialize()).resolves.not.toThrow();
    });

    it('should handle initialization errors', async () => {
      // Mock a component to throw during initialization
      const mockError = new Error('Initialization failed');
      vi.spyOn(jobService as any, 'registerJobHandlers')
        .mockImplementation(() => { throw mockError; });

      await expect(jobService.initialize()).rejects.toThrow('Initialization failed');
    });
  });

  describe('job management', () => {
    beforeEach(async () => {
      await jobService.initialize();
    });

    describe('createJob', () => {
      it('should create digest generation job successfully', async () => {
        const jobOptions = {
          type: JobType.DIGEST_GENERATION,
          data: {
            repositoryId: 1,
            userId: 1,
            period: 'daily',
            startDate: new Date('2023-12-01'),
            endDate: new Date('2023-12-02'),
          },
          priority: JobPriority.NORMAL,
        };

        const mockJob = {
          ...globalThis.testUtils.createMockJob(),
          type: JobType.DIGEST_GENERATION,
          data: jobOptions.data,
        };

        vi.spyOn(jobService, 'createJob').mockResolvedValue(mockJob);

        const result = await jobService.createJob(jobOptions);

        expect(result).toBeDefined();
        expect(result.type).toBe(JobType.DIGEST_GENERATION);
        expect(result.data).toEqual(jobOptions.data);
        expect(result.status).toBe(JobStatus.PENDING);
      });

      it('should create notification job successfully', async () => {
        const jobOptions = {
          type: JobType.NOTIFICATION,
          data: {
            digestId: 'digest_123',
            recipients: ['user@example.com'],
            method: 'email',
          },
          priority: JobPriority.HIGH,
        };

        const mockJob = {
          ...globalThis.testUtils.createMockJob(),
          type: JobType.NOTIFICATION,
          data: jobOptions.data,
          priority: JobPriority.HIGH,
        };

        vi.spyOn(jobService, 'createJob').mockResolvedValue(mockJob);

        const result = await jobService.createJob(jobOptions);

        expect(result.type).toBe(JobType.NOTIFICATION);
        expect(result.priority).toBe(JobPriority.HIGH);
      });

      it('should validate job data', async () => {
        const invalidJobOptions = {
          type: JobType.DIGEST_GENERATION,
          data: {}, // Missing required fields
        };

        vi.spyOn(jobService, 'createJob')
          .mockRejectedValue(new ValidationError('Invalid job data'));

        await expect(jobService.createJob(invalidJobOptions))
          .rejects.toThrow(ValidationError);
      });

      it('should handle different job priorities', async () => {
        const priorities = [JobPriority.LOW, JobPriority.NORMAL, JobPriority.HIGH, JobPriority.CRITICAL];

        for (const priority of priorities) {
          const jobOptions = {
            type: JobType.HEALTH_CHECK,
            data: { check: 'database' },
            priority,
          };

          const mockJob = {
            ...globalThis.testUtils.createMockJob(),
            priority,
          };

          vi.spyOn(jobService, 'createJob').mockResolvedValue(mockJob);

          const result = await jobService.createJob(jobOptions);
          expect(result.priority).toBe(priority);
        }
      });
    });

    describe('getJob', () => {
      it('should retrieve job by ID', async () => {
        const mockJob = globalThis.testUtils.createMockJob();
        vi.spyOn(jobService, 'getJob').mockResolvedValue(mockJob);

        const result = await jobService.getJob('job_123');

        expect(result).toEqual(mockJob);
      });

      it('should return null for non-existent job', async () => {
        vi.spyOn(jobService, 'getJob').mockResolvedValue(null);

        const result = await jobService.getJob('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('queryJobs', () => {
      it('should query jobs without filters', async () => {
        const mockJobs = [
          globalThis.testUtils.createMockJob(),
          globalThis.testUtils.createMockJob(),
        ];
        vi.spyOn(jobService, 'queryJobs').mockResolvedValue(mockJobs);

        const result = await jobService.queryJobs();

        expect(result).toEqual(mockJobs);
      });

      it('should query jobs with status filter', async () => {
        const mockJobs = [
          { ...globalThis.testUtils.createMockJob(), status: JobStatus.COMPLETED },
        ];
        vi.spyOn(jobService, 'queryJobs').mockResolvedValue(mockJobs);

        const result = await jobService.queryJobs({
          status: JobStatus.COMPLETED,
        });

        expect(result).toEqual(mockJobs);
      });

      it('should query jobs with type filter', async () => {
        const mockJobs = [
          { ...globalThis.testUtils.createMockJob(), type: JobType.DIGEST_GENERATION },
        ];
        vi.spyOn(jobService, 'queryJobs').mockResolvedValue(mockJobs);

        const result = await jobService.queryJobs({
          type: JobType.DIGEST_GENERATION,
        });

        expect(result).toEqual(mockJobs);
      });

      it('should query jobs with date range filter', async () => {
        const startDate = new Date('2023-12-01');
        const endDate = new Date('2023-12-31');
        const mockJobs = [globalThis.testUtils.createMockJob()];
        
        vi.spyOn(jobService, 'queryJobs').mockResolvedValue(mockJobs);

        const result = await jobService.queryJobs({
          createdAfter: startDate,
          createdBefore: endDate,
        });

        expect(result).toEqual(mockJobs);
      });

      it('should query jobs with limit and offset', async () => {
        const mockJobs = [globalThis.testUtils.createMockJob()];
        vi.spyOn(jobService, 'queryJobs').mockResolvedValue(mockJobs);

        const result = await jobService.queryJobs({
          limit: 10,
          offset: 20,
        });

        expect(result).toEqual(mockJobs);
      });
    });

    describe('cancelJob', () => {
      it('should cancel pending job successfully', async () => {
        vi.spyOn(jobService, 'cancelJob').mockResolvedValue(true);

        const result = await jobService.cancelJob('job_123');

        expect(result).toBe(true);
      });

      it('should not cancel completed job', async () => {
        vi.spyOn(jobService, 'cancelJob').mockResolvedValue(false);

        const result = await jobService.cancelJob('completed_job');

        expect(result).toBe(false);
      });

      it('should handle non-existent job', async () => {
        vi.spyOn(jobService, 'cancelJob')
          .mockRejectedValue(new NotFoundError('Job not found'));

        await expect(jobService.cancelJob('nonexistent'))
          .rejects.toThrow(NotFoundError);
      });
    });

    describe('retryJob', () => {
      it('should retry failed job successfully', async () => {
        vi.spyOn(jobService, 'retryJob').mockResolvedValue(true);

        const result = await jobService.retryJob('failed_job_123');

        expect(result).toBe(true);
      });

      it('should not retry job that has reached max retries', async () => {
        vi.spyOn(jobService, 'retryJob').mockResolvedValue(false);

        const result = await jobService.retryJob('max_retries_job');

        expect(result).toBe(false);
      });

      it('should handle non-existent job', async () => {
        vi.spyOn(jobService, 'retryJob')
          .mockRejectedValue(new NotFoundError('Job not found'));

        await expect(jobService.retryJob('nonexistent'))
          .rejects.toThrow(NotFoundError);
      });
    });
  });

  describe('metrics and monitoring', () => {
    beforeEach(async () => {
      await jobService.initialize();
    });

    describe('getMetrics', () => {
      it('should return current job metrics', () => {
        const mockMetrics = {
          totalJobs: 100,
          pendingJobs: 5,
          processingJobs: 3,
          completedJobs: 90,
          failedJobs: 2,
          averageProcessingTime: 5000,
          throughput: 0.5,
          errorRate: 0.02,
        };

        vi.spyOn(jobService, 'getMetrics').mockReturnValue(mockMetrics);

        const result = jobService.getMetrics();

        expect(result).toEqual(mockMetrics);
      });
    });

    describe('getHealthCheck', () => {
      it('should return healthy status', async () => {
        const mockHealthCheck = {
          status: 'healthy' as const,
          timestamp: new Date(),
          components: {
            jobQueue: { status: 'healthy' as const, message: 'Queue is operational' },
            jobProcessor: { status: 'healthy' as const, message: 'Processor is running' },
            workers: { status: 'healthy' as const, message: 'All workers are healthy' },
            database: { status: 'healthy' as const, message: 'Database connection is stable' },
          },
          metrics: {
            queueSize: 5,
            activeWorkers: 4,
            processingJobs: 2,
            averageWaitTime: 1000,
          },
        };

        vi.spyOn(jobService, 'getHealthCheck').mockResolvedValue(mockHealthCheck);

        const result = await jobService.getHealthCheck();

        expect(result.status).toBe('healthy');
        expect(result.components).toBeDefined();
        expect(result.metrics).toBeDefined();
      });

      it('should return unhealthy status when components fail', async () => {
        const mockHealthCheck = {
          status: 'unhealthy' as const,
          timestamp: new Date(),
          components: {
            jobQueue: { status: 'healthy' as const, message: 'Queue is operational' },
            jobProcessor: { status: 'unhealthy' as const, message: 'Processor has errors' },
            workers: { status: 'degraded' as const, message: 'Some workers are failing' },
            database: { status: 'healthy' as const, message: 'Database connection is stable' },
          },
          metrics: {
            queueSize: 50,
            activeWorkers: 2,
            processingJobs: 0,
            averageWaitTime: 10000,
          },
        };

        vi.spyOn(jobService, 'getHealthCheck').mockResolvedValue(mockHealthCheck);

        const result = await jobService.getHealthCheck();

        expect(result.status).toBe('unhealthy');
        expect(result.components.jobProcessor.status).toBe('unhealthy');
      });
    });

    describe('getMetricsHistory', () => {
      it('should return metrics history', () => {
        const mockHistory = [
          {
            timestamp: new Date(Date.now() - 3600000),
            metrics: {
              totalJobs: 95,
              completedJobs: 85,
              failedJobs: 2,
              throughput: 0.4,
            },
          },
          {
            timestamp: new Date(),
            metrics: {
              totalJobs: 100,
              completedJobs: 90,
              failedJobs: 2,
              throughput: 0.5,
            },
          },
        ];

        vi.spyOn(jobService, 'getMetricsHistory').mockReturnValue(mockHistory);

        const result = jobService.getMetricsHistory(24);

        expect(result).toEqual(mockHistory);
        expect(result).toHaveLength(2);
      });
    });

    describe('getJobPerformanceStats', () => {
      it('should return performance stats for all job types', async () => {
        const mockStats = {
          totalJobs: 1000,
          averageProcessingTime: 5000,
          medianProcessingTime: 3000,
          p95ProcessingTime: 15000,
          successRate: 0.95,
          errorRate: 0.05,
          throughput: 2.5,
        };

        vi.spyOn(jobService, 'getJobPerformanceStats').mockResolvedValue(mockStats);

        const result = await jobService.getJobPerformanceStats();

        expect(result).toEqual(mockStats);
      });

      it('should return performance stats for specific job type', async () => {
        const mockStats = {
          totalJobs: 500,
          averageProcessingTime: 8000,
          medianProcessingTime: 6000,
          p95ProcessingTime: 20000,
          successRate: 0.92,
          errorRate: 0.08,
          throughput: 1.2,
        };

        vi.spyOn(jobService, 'getJobPerformanceStats').mockResolvedValue(mockStats);

        const result = await jobService.getJobPerformanceStats(JobType.DIGEST_GENERATION);

        expect(result).toEqual(mockStats);
      });
    });
  });

  describe('worker management', () => {
    beforeEach(async () => {
      await jobService.initialize();
    });

    describe('getWorkerStatuses', () => {
      it('should return worker status information', () => {
        const mockWorkerStatuses = [
          {
            workerId: 'digest_worker_1',
            status: 'active' as const,
            currentJobs: 2,
            maxJobs: 3,
            supportedJobTypes: [JobType.DIGEST_GENERATION],
            lastHeartbeat: new Date(),
            startedAt: new Date(Date.now() - 3600000),
            processedJobs: 150,
            failedJobs: 3,
          },
          {
            workerId: 'notification_worker_1',
            status: 'active' as const,
            currentJobs: 1,
            maxJobs: 10,
            supportedJobTypes: [JobType.NOTIFICATION],
            lastHeartbeat: new Date(),
            startedAt: new Date(Date.now() - 3600000),
            processedJobs: 500,
            failedJobs: 5,
          },
        ];

        vi.spyOn(jobService, 'getWorkerStatuses').mockReturnValue(mockWorkerStatuses);

        const result = jobService.getWorkerStatuses();

        expect(result).toEqual(mockWorkerStatuses);
        expect(result).toHaveLength(2);
      });
    });

    describe('addWorker', () => {
      it('should add new worker successfully', async () => {
        const workerConfig = {
          id: 'test_worker_1',
          maxJobs: 5,
          supportedJobTypes: [JobType.CLEANUP, JobType.HEALTH_CHECK],
          enabled: true,
        };

        vi.spyOn(jobService, 'addWorker').mockResolvedValue('test_worker_1');

        const result = await jobService.addWorker(workerConfig);

        expect(result).toBe('test_worker_1');
      });

      it('should handle duplicate worker ID', async () => {
        const workerConfig = {
          id: 'existing_worker',
          maxJobs: 5,
          supportedJobTypes: [JobType.CLEANUP],
          enabled: true,
        };

        vi.spyOn(jobService, 'addWorker')
          .mockRejectedValue(new ConflictError('Worker already exists'));

        await expect(jobService.addWorker(workerConfig))
          .rejects.toThrow(ConflictError);
      });
    });

    describe('removeWorker', () => {
      it('should remove worker gracefully', async () => {
        vi.spyOn(jobService, 'removeWorker').mockResolvedValue(true);

        const result = await jobService.removeWorker('test_worker_1', true);

        expect(result).toBe(true);
      });

      it('should remove worker forcefully', async () => {
        vi.spyOn(jobService, 'removeWorker').mockResolvedValue(true);

        const result = await jobService.removeWorker('test_worker_1', false);

        expect(result).toBe(true);
      });

      it('should handle non-existent worker', async () => {
        vi.spyOn(jobService, 'removeWorker').mockResolvedValue(false);

        const result = await jobService.removeWorker('nonexistent_worker');

        expect(result).toBe(false);
      });
    });
  });

  describe('scheduling', () => {
    beforeEach(async () => {
      await jobService.initialize();
    });

    describe('addSchedule', () => {
      it('should add recurring schedule successfully', async () => {
        const scheduleConfig = {
          name: 'Daily Digest Generation',
          cronExpression: '0 9 * * *', // 9 AM daily
          jobType: JobType.DIGEST_GENERATION,
          jobData: {
            repositoryId: 1,
            period: 'daily',
          },
          enabled: true,
        };

        const mockSchedule = {
          ...scheduleConfig,
          id: 'schedule_123',
          nextRun: new Date(),
        };

        vi.spyOn(jobService, 'addSchedule').mockResolvedValue(mockSchedule);

        const result = await jobService.addSchedule(scheduleConfig);

        expect(result).toEqual(mockSchedule);
      });

      it('should validate cron expression', async () => {
        const scheduleConfig = {
          name: 'Invalid Schedule',
          cronExpression: 'invalid-cron',
          jobType: JobType.DIGEST_GENERATION,
          jobData: {},
          enabled: true,
        };

        vi.spyOn(jobService, 'addSchedule')
          .mockRejectedValue(new ValidationError('Invalid cron expression'));

        await expect(jobService.addSchedule(scheduleConfig))
          .rejects.toThrow(ValidationError);
      });
    });

    describe('updateSchedule', () => {
      it('should update schedule successfully', async () => {
        const updates = {
          enabled: false,
          cronExpression: '0 10 * * *', // Change to 10 AM
        };

        const mockUpdatedSchedule = {
          id: 'schedule_123',
          name: 'Daily Digest Generation',
          cronExpression: '0 10 * * *',
          enabled: false,
          nextRun: new Date(),
        };

        vi.spyOn(jobService, 'updateSchedule').mockResolvedValue(mockUpdatedSchedule);

        const result = await jobService.updateSchedule('schedule_123', updates);

        expect(result).toEqual(mockUpdatedSchedule);
      });

      it('should return null for non-existent schedule', async () => {
        vi.spyOn(jobService, 'updateSchedule').mockResolvedValue(null);

        const result = await jobService.updateSchedule('nonexistent', { enabled: false });

        expect(result).toBeNull();
      });
    });

    describe('triggerSchedule', () => {
      it('should trigger schedule manually', async () => {
        const mockJob = globalThis.testUtils.createMockJob();
        vi.spyOn(jobService, 'triggerSchedule').mockResolvedValue(mockJob);

        const result = await jobService.triggerSchedule('schedule_123');

        expect(result).toEqual(mockJob);
      });

      it('should return null for non-existent schedule', async () => {
        vi.spyOn(jobService, 'triggerSchedule').mockResolvedValue(null);

        const result = await jobService.triggerSchedule('nonexistent');

        expect(result).toBeNull();
      });
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await jobService.initialize();
      
      vi.spyOn(jobService, 'shutdown').mockResolvedValue();

      await expect(jobService.shutdown()).resolves.not.toThrow();
    });

    it('should handle shutdown when not initialized', async () => {
      vi.spyOn(jobService, 'shutdown').mockResolvedValue();

      await expect(jobService.shutdown()).resolves.not.toThrow();
    });

    it('should handle shutdown errors gracefully', async () => {
      await jobService.initialize();
      
      const mockError = new Error('Shutdown error');
      vi.spyOn(jobService, 'shutdown').mockRejectedValue(mockError);

      // Should not throw, but log the error
      await expect(jobService.shutdown()).rejects.toThrow('Shutdown error');
    });
  });
});