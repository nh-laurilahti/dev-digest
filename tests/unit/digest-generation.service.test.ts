import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { digestService } from '../../src/services/digests';
import { summaryGenerator } from '../../src/services/summary-generator';
import { prAnalysisService } from '../../src/services/pr-analysis';
import { statisticsService } from '../../src/services/statistics';
import { db } from '../../src/db';
import {
  ValidationError,
  NotFoundError,
  ExternalServiceError,
} from '../../src/lib/errors';

// Mock dependencies
vi.mock('../../src/services/summary-generator');
vi.mock('../../src/services/pr-analysis');
vi.mock('../../src/services/statistics');

describe('DigestGenerationService', () => {
  const mockRepository = globalThis.testUtils.createMockRepository();
  const mockUser = globalThis.testUtils.createMockUser();
  const mockPullRequests = [
    {
      ...globalThis.testUtils.createMockPullRequest(),
      number: 1,
      title: 'Add authentication feature',
      author: 'developer1',
      createdAt: new Date('2023-12-01T10:00:00Z'),
      additions: 150,
      deletions: 50,
    },
    {
      ...globalThis.testUtils.createMockPullRequest(),
      number: 2,
      title: 'Fix critical bug in payment processing',
      author: 'developer2',
      createdAt: new Date('2023-12-01T14:00:00Z'),
      additions: 25,
      deletions: 75,
    },
    {
      ...globalThis.testUtils.createMockPullRequest(),
      number: 3,
      title: 'Update documentation',
      author: 'developer1',
      createdAt: new Date('2023-12-02T09:00:00Z'),
      additions: 100,
      deletions: 10,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(db.repository.findUnique).mockResolvedValue(mockRepository);
    vi.mocked(db.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(db.pullRequest.findMany).mockResolvedValue(mockPullRequests);
    vi.mocked(db.digest.create).mockResolvedValue({
      ...globalThis.testUtils.createMockDigest(),
      id: 'digest_123',
    });

    // Setup service mocks
    vi.mocked(prAnalysisService.analyzePullRequests).mockResolvedValue({
      categorizedPRs: {
        features: [mockPullRequests[0]],
        bugfixes: [mockPullRequests[1]],
        documentation: [mockPullRequests[2]],
        performance: [],
        refactoring: [],
        tests: [],
        chores: [],
      },
      insights: {
        totalPRs: 3,
        averageSize: 'medium',
        complexityScore: 0.6,
        riskLevel: 'low',
        recommendations: ['Consider adding more tests'],
      },
      patterns: {
        commonTopics: ['authentication', 'bug-fix', 'documentation'],
        frequentAuthors: ['developer1', 'developer2'],
        peakActivity: { day: 'Monday', hour: 10 },
      },
    });

    vi.mocked(summaryGenerator.generateSummary).mockResolvedValue({
      summary: 'Daily development summary with 3 pull requests covering authentication features, bug fixes, and documentation updates.',
      highlights: [
        'Added authentication feature',
        'Fixed critical payment processing bug',
        'Updated project documentation',
      ],
      keyChanges: [
        'New authentication system implemented',
        'Payment processing reliability improved',
        'Documentation coverage increased',
      ],
    });

    vi.mocked(statisticsService.calculateDigestStats).mockResolvedValue({
      totalPRs: 3,
      authors: 2,
      linesChanged: 275,
      additions: 275,
      deletions: 135,
      filesChanged: 15,
      categories: {
        features: 1,
        bugfixes: 1,
        documentation: 1,
        performance: 0,
        refactoring: 0,
        tests: 0,
        chores: 0,
      },
      timeline: {
        '2023-12-01': 2,
        '2023-12-02': 1,
      },
      topContributors: [
        { author: 'developer1', count: 2, linesChanged: 250 },
        { author: 'developer2', count: 1, linesChanged: 100 },
      ],
    });
  });

  describe('generateDigest', () => {
    it('should generate digest successfully', async () => {
      const digestOptions = {
        repositoryId: mockRepository.id,
        userId: mockUser.id,
        period: 'daily' as const,
        startDate: new Date('2023-12-01T00:00:00Z'),
        endDate: new Date('2023-12-02T23:59:59Z'),
      };

      const result = await digestService.generateDigest(digestOptions);

      expect(result).toBeDefined();
      expect(result.id).toBe('digest_123');
      expect(result.repositoryId).toBe(mockRepository.id);
      expect(result.userId).toBe(mockUser.id);
      expect(result.period).toBe('daily');
      expect(result.status).toBe('completed');

      // Verify service calls
      expect(prAnalysisService.analyzePullRequests).toHaveBeenCalledWith(mockPullRequests);
      expect(summaryGenerator.generateSummary).toHaveBeenCalled();
      expect(statisticsService.calculateDigestStats).toHaveBeenCalledWith(mockPullRequests);
      expect(db.digest.create).toHaveBeenCalled();
    });

    it('should validate repository exists', async () => {
      vi.mocked(db.repository.findUnique).mockResolvedValue(null);

      const digestOptions = {
        repositoryId: 999,
        userId: mockUser.id,
        period: 'daily' as const,
        startDate: new Date('2023-12-01T00:00:00Z'),
        endDate: new Date('2023-12-02T23:59:59Z'),
      };

      await expect(digestService.generateDigest(digestOptions))
        .rejects.toThrow(NotFoundError);
    });

    it('should validate user exists', async () => {
      vi.mocked(db.user.findUnique).mockResolvedValue(null);

      const digestOptions = {
        repositoryId: mockRepository.id,
        userId: 999,
        period: 'daily' as const,
        startDate: new Date('2023-12-01T00:00:00Z'),
        endDate: new Date('2023-12-02T23:59:59Z'),
      };

      await expect(digestService.generateDigest(digestOptions))
        .rejects.toThrow(NotFoundError);
    });

    it('should validate date range', async () => {
      const digestOptions = {
        repositoryId: mockRepository.id,
        userId: mockUser.id,
        period: 'daily' as const,
        startDate: new Date('2023-12-02T00:00:00Z'),
        endDate: new Date('2023-12-01T23:59:59Z'), // End before start
      };

      await expect(digestService.generateDigest(digestOptions))
        .rejects.toThrow(ValidationError);
    });

    it('should handle empty pull request data', async () => {
      vi.mocked(db.pullRequest.findMany).mockResolvedValue([]);
      
      vi.mocked(summaryGenerator.generateSummary).mockResolvedValue({
        summary: 'No activity during this period.',
        highlights: [],
        keyChanges: [],
      });

      vi.mocked(statisticsService.calculateDigestStats).mockResolvedValue({
        totalPRs: 0,
        authors: 0,
        linesChanged: 0,
        additions: 0,
        deletions: 0,
        filesChanged: 0,
        categories: {
          features: 0,
          bugfixes: 0,
          documentation: 0,
          performance: 0,
          refactoring: 0,
          tests: 0,
          chores: 0,
        },
        timeline: {},
        topContributors: [],
      });

      const digestOptions = {
        repositoryId: mockRepository.id,
        userId: mockUser.id,
        period: 'daily' as const,
        startDate: new Date('2023-12-01T00:00:00Z'),
        endDate: new Date('2023-12-02T23:59:59Z'),
      };

      const result = await digestService.generateDigest(digestOptions);

      expect(result).toBeDefined();
      expect(result.summary).toBe('No activity during this period.');
    });

    it('should handle different time periods', async () => {
      const testPeriods = ['daily', 'weekly', 'monthly'] as const;

      for (const period of testPeriods) {
        const digestOptions = {
          repositoryId: mockRepository.id,
          userId: mockUser.id,
          period,
          startDate: new Date('2023-12-01T00:00:00Z'),
          endDate: new Date('2023-12-07T23:59:59Z'),
        };

        const result = await digestService.generateDigest(digestOptions);
        expect(result.period).toBe(period);
      }
    });

    it('should handle service failures gracefully', async () => {
      vi.mocked(prAnalysisService.analyzePullRequests)
        .mockRejectedValue(new Error('Analysis service failed'));

      const digestOptions = {
        repositoryId: mockRepository.id,
        userId: mockUser.id,
        period: 'daily' as const,
        startDate: new Date('2023-12-01T00:00:00Z'),
        endDate: new Date('2023-12-02T23:59:59Z'),
      };

      await expect(digestService.generateDigest(digestOptions))
        .rejects.toThrow('Failed to analyze pull requests');
    });
  });

  describe('getDigest', () => {
    it('should retrieve digest successfully', async () => {
      const mockDigest = globalThis.testUtils.createMockDigest();
      vi.mocked(db.digest.findUnique).mockResolvedValue(mockDigest);

      const result = await digestService.getDigest('digest_123');

      expect(result).toEqual(mockDigest);
      expect(db.digest.findUnique).toHaveBeenCalledWith({
        where: { id: 'digest_123' },
        include: {
          repository: true,
          user: true,
        },
      });
    });

    it('should return null for non-existent digest', async () => {
      vi.mocked(db.digest.findUnique).mockResolvedValue(null);

      const result = await digestService.getDigest('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getDigestsByRepository', () => {
    it('should retrieve repository digests successfully', async () => {
      const mockDigests = [
        globalThis.testUtils.createMockDigest(),
        globalThis.testUtils.createMockDigest(),
      ];
      vi.mocked(db.digest.findMany).mockResolvedValue(mockDigests);

      const result = await digestService.getDigestsByRepository(mockRepository.id);

      expect(result).toEqual(mockDigests);
      expect(db.digest.findMany).toHaveBeenCalledWith({
        where: { repositoryId: mockRepository.id },
        orderBy: { createdAt: 'desc' },
        include: {
          repository: true,
          user: true,
        },
      });
    });

    it('should filter by period', async () => {
      await digestService.getDigestsByRepository(mockRepository.id, {
        period: 'weekly',
      });

      expect(db.digest.findMany).toHaveBeenCalledWith({
        where: {
          repositoryId: mockRepository.id,
          period: 'weekly',
        },
        orderBy: { createdAt: 'desc' },
        include: {
          repository: true,
          user: true,
        },
      });
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2023-12-01');
      const endDate = new Date('2023-12-31');

      await digestService.getDigestsByRepository(mockRepository.id, {
        startDate,
        endDate,
      });

      expect(db.digest.findMany).toHaveBeenCalledWith({
        where: {
          repositoryId: mockRepository.id,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          repository: true,
          user: true,
        },
      });
    });

    it('should limit results', async () => {
      await digestService.getDigestsByRepository(mockRepository.id, {
        limit: 10,
      });

      expect(db.digest.findMany).toHaveBeenCalledWith({
        where: { repositoryId: mockRepository.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          repository: true,
          user: true,
        },
      });
    });
  });

  describe('getDigestsByUser', () => {
    it('should retrieve user digests successfully', async () => {
      const mockDigests = [globalThis.testUtils.createMockDigest()];
      vi.mocked(db.digest.findMany).mockResolvedValue(mockDigests);

      const result = await digestService.getDigestsByUser(mockUser.id);

      expect(result).toEqual(mockDigests);
      expect(db.digest.findMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
        orderBy: { createdAt: 'desc' },
        include: {
          repository: true,
          user: true,
        },
      });
    });
  });

  describe('updateDigest', () => {
    it('should update digest successfully', async () => {
      const mockDigest = globalThis.testUtils.createMockDigest();
      const updateData = {
        title: 'Updated Digest Title',
        summary: 'Updated summary',
      };

      vi.mocked(db.digest.findUnique).mockResolvedValue(mockDigest);
      vi.mocked(db.digest.update).mockResolvedValue({
        ...mockDigest,
        ...updateData,
      });

      const result = await digestService.updateDigest('digest_123', updateData);

      expect(result).toBeDefined();
      expect(result.title).toBe(updateData.title);
      expect(result.summary).toBe(updateData.summary);
      
      expect(db.digest.update).toHaveBeenCalledWith({
        where: { id: 'digest_123' },
        data: updateData,
        include: {
          repository: true,
          user: true,
        },
      });
    });

    it('should throw error for non-existent digest', async () => {
      vi.mocked(db.digest.findUnique).mockResolvedValue(null);

      await expect(digestService.updateDigest('nonexistent', { title: 'New Title' }))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteDigest', () => {
    it('should delete digest successfully', async () => {
      const mockDigest = globalThis.testUtils.createMockDigest();
      vi.mocked(db.digest.findUnique).mockResolvedValue(mockDigest);
      vi.mocked(db.digest.delete).mockResolvedValue(mockDigest);

      await digestService.deleteDigest('digest_123');

      expect(db.digest.delete).toHaveBeenCalledWith({
        where: { id: 'digest_123' },
      });
    });

    it('should throw error for non-existent digest', async () => {
      vi.mocked(db.digest.findUnique).mockResolvedValue(null);

      await expect(digestService.deleteDigest('nonexistent'))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('regenerateDigest', () => {
    it('should regenerate digest successfully', async () => {
      const mockDigest = globalThis.testUtils.createMockDigest();
      vi.mocked(db.digest.findUnique).mockResolvedValue(mockDigest);
      
      const updatedDigest = {
        ...mockDigest,
        content: 'Regenerated content',
        summary: 'Regenerated summary',
        updatedAt: new Date(),
      };
      vi.mocked(db.digest.update).mockResolvedValue(updatedDigest);

      const result = await digestService.regenerateDigest('digest_123');

      expect(result).toBeDefined();
      expect(result.content).toBe('Regenerated content');
      expect(prAnalysisService.analyzePullRequests).toHaveBeenCalled();
      expect(summaryGenerator.generateSummary).toHaveBeenCalled();
      expect(statisticsService.calculateDigestStats).toHaveBeenCalled();
    });

    it('should throw error for non-existent digest', async () => {
      vi.mocked(db.digest.findUnique).mockResolvedValue(null);

      await expect(digestService.regenerateDigest('nonexistent'))
        .rejects.toThrow(NotFoundError);
    });
  });

  describe('getDigestStats', () => {
    it('should calculate digest statistics successfully', async () => {
      vi.mocked(db.digest.count)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(95)  // completed
        .mockResolvedValueOnce(3)   // failed
        .mockResolvedValueOnce(2);  // pending

      const result = await digestService.getDigestStats();

      expect(result).toEqual({
        total: 100,
        completed: 95,
        failed: 3,
        pending: 2,
        successRate: 95,
      });
    });

    it('should filter stats by user', async () => {
      vi.mocked(db.digest.count).mockResolvedValue(50);

      await digestService.getDigestStats(mockUser.id);

      expect(db.digest.count).toHaveBeenCalledWith({
        where: { userId: mockUser.id },
      });
    });

    it('should filter stats by repository', async () => {
      vi.mocked(db.digest.count).mockResolvedValue(25);

      await digestService.getDigestStats(undefined, mockRepository.id);

      expect(db.digest.count).toHaveBeenCalledWith({
        where: { repositoryId: mockRepository.id },
      });
    });
  });
});