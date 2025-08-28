import { PRAnalysis, DigestStatistics, GitHubPullRequest, PRType, PRImpact, PRComplexity } from '../types/digest';
import { logger } from '../lib/logger';

/**
 * Statistics Engine
 * 
 * Comprehensive repository statistics calculation including:
 * - Team performance metrics
 * - Trend analysis over time
 * - Comparison with previous periods
 * - Code health indicators
 * - Productivity insights
 */
export class StatisticsService {
  /**
   * Generate comprehensive digest statistics from PR analysis data
   */
  public async generateStatistics(
    repositoryInfo: { name: string; path: string; defaultBranch: string },
    prAnalyses: PRAnalysis[],
    dateFrom: Date,
    dateTo: Date,
    previousPeriodData?: PRAnalysis[]
  ): Promise<DigestStatistics> {
    try {
      logger.info(`Generating statistics for ${prAnalyses.length} PRs`);

      const stats: DigestStatistics = {
        period: {
          from: dateFrom,
          to: dateTo,
          days: Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24))
        },
        repository: repositoryInfo,
        pullRequests: this.calculatePRStatistics(prAnalyses),
        commits: this.calculateCommitStatistics(prAnalyses),
        contributors: this.calculateContributorStatistics(prAnalyses),
        files: this.calculateFileStatistics(prAnalyses),
        trends: this.calculateTrends(prAnalyses, dateFrom, dateTo, previousPeriodData),
        highlights: this.calculateHighlights(prAnalyses)
      };

      return stats;
    } catch (error) {
      logger.error('Error generating statistics:', error);
      throw error;
    }
  }

  /**
   * Calculate pull request statistics
   */
  private calculatePRStatistics(analyses: PRAnalysis[]): DigestStatistics['pullRequests'] {
    const merged = analyses.filter(pr => pr.mergedAt !== null);
    const closed = analyses.filter(pr => pr.mergedAt === null);
    const draft = []; // Would need to be provided in PR data

    // Group by type
    const byType: Record<PRType, number> = {
      feature: 0, bugfix: 0, hotfix: 0, refactor: 0, docs: 0,
      test: 0, chore: 0, breaking: 0, security: 0, performance: 0, other: 0
    };

    // Group by impact
    const byImpact: Record<PRImpact, number> = {
      minor: 0, moderate: 0, major: 0, critical: 0
    };

    // Group by complexity
    const byComplexity: Record<PRComplexity, number> = {
      simple: 0, moderate: 0, complex: 0, 'very-complex': 0
    };

    // Group by author
    const byAuthor: Record<string, number> = {};

    // Calculate averages
    let totalTimeToMerge = 0;
    let mergedWithTime = 0;
    let totalComments = 0;
    let totalLines = 0;

    analyses.forEach(pr => {
      byType[pr.type]++;
      byImpact[pr.impact]++;
      byComplexity[pr.complexity]++;
      
      byAuthor[pr.author] = (byAuthor[pr.author] || 0) + 1;
      
      if (pr.timeToMerge !== undefined) {
        totalTimeToMerge += pr.timeToMerge;
        mergedWithTime++;
      }
      
      totalComments += pr.comments + pr.reviewComments;
      totalLines += pr.linesAdded + pr.linesDeleted;
    });

    return {
      total: analyses.length,
      merged: merged.length,
      closed: closed.length,
      draft: draft.length,
      byType,
      byImpact,
      byComplexity,
      byAuthor,
      averageTimeToMerge: mergedWithTime > 0 ? Math.round(totalTimeToMerge / mergedWithTime) : 0,
      averageCommentsPerPR: analyses.length > 0 ? Math.round(totalComments / analyses.length * 10) / 10 : 0,
      averageLinesPerPR: analyses.length > 0 ? Math.round(totalLines / analyses.length) : 0
    };
  }

  /**
   * Calculate commit statistics
   */
  private calculateCommitStatistics(analyses: PRAnalysis[]): DigestStatistics['commits'] {
    const byAuthor: Record<string, number> = {};
    let totalCommits = 0;
    let totalAdditions = 0;
    let totalDeletions = 0;

    analyses.forEach(pr => {
      totalCommits += pr.commits;
      totalAdditions += pr.linesAdded;
      totalDeletions += pr.linesDeleted;
      
      // Approximate commits per author based on PRs
      byAuthor[pr.author] = (byAuthor[pr.author] || 0) + pr.commits;
    });

    return {
      total: totalCommits,
      byAuthor,
      totalAdditions,
      totalDeletions
    };
  }

  /**
   * Calculate contributor statistics
   */
  private calculateContributorStatistics(analyses: PRAnalysis[]): DigestStatistics['contributors'] {
    const contributors = new Set(analyses.map(pr => pr.author));
    const contributorMetrics: Record<string, { prs: number; commits: number; linesChanged: number }> = {};

    analyses.forEach(pr => {
      if (!contributorMetrics[pr.author]) {
        contributorMetrics[pr.author] = { prs: 0, commits: 0, linesChanged: 0 };
      }
      
      contributorMetrics[pr.author].prs++;
      contributorMetrics[pr.author].commits += pr.commits;
      contributorMetrics[pr.author].linesChanged += pr.linesAdded + pr.linesDeleted;
    });

    const topContributors = Object.entries(contributorMetrics)
      .sort(([,a], [,b]) => b.linesChanged - a.linesChanged)
      .slice(0, 10)
      .map(([name, metrics]) => ({ name, ...metrics }));

    return {
      total: contributors.size,
      new: 0, // Would need historical data to determine
      active: Array.from(contributors),
      topContributors
    };
  }

  /**
   * Calculate file statistics
   */
  private calculateFileStatistics(analyses: PRAnalysis[]): DigestStatistics['files'] {
    const fileChanges: Record<string, { changes: number; prs: number }> = {};
    const languageStats: Record<string, number> = {};
    let totalChanged = 0;

    analyses.forEach(pr => {
      totalChanged += pr.filesChanged;
      
      // This would need actual file data from GitHub API
      // For now, we'll use placeholder logic based on common patterns
      const estimatedLanguages = this.estimateLanguageBreakdown(pr);
      Object.entries(estimatedLanguages).forEach(([lang, lines]) => {
        languageStats[lang] = (languageStats[lang] || 0) + lines;
      });
    });

    // Most changed files would need actual file path data
    const mostChanged = Object.entries(fileChanges)
      .sort(([,a], [,b]) => b.changes - a.changes)
      .slice(0, 10)
      .map(([path, data]) => ({ path, ...data }));

    return {
      totalChanged,
      mostChanged,
      languageBreakdown: languageStats
    };
  }

  /**
   * Calculate trends and velocity metrics
   */
  private calculateTrends(
    analyses: PRAnalysis[],
    dateFrom: Date,
    dateTo: Date,
    previousPeriodData?: PRAnalysis[]
  ): DigestStatistics['trends'] {
    const periodDays = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24));
    const mergedPRs = analyses.filter(pr => pr.mergedAt);
    const totalCommits = analyses.reduce((sum, pr) => sum + pr.commits, 0);
    const totalLinesChanged = analyses.reduce((sum, pr) => sum + pr.linesAdded + pr.linesDeleted, 0);
    const reviewedPRs = analyses.filter(pr => pr.reviewComments > 0);

    return {
      prVelocity: periodDays > 0 ? Math.round((analyses.length / periodDays) * 10) / 10 : 0,
      commitVelocity: periodDays > 0 ? Math.round((totalCommits / periodDays) * 10) / 10 : 0,
      codeChurnRate: periodDays > 0 ? Math.round((totalLinesChanged / periodDays) * 10) / 10 : 0,
      reviewCoverage: analyses.length > 0 ? Math.round((reviewedPRs.length / analyses.length) * 100) : 0
    };
  }

  /**
   * Calculate highlights and notable metrics
   */
  private calculateHighlights(analyses: PRAnalysis[]): DigestStatistics['highlights'] {
    const mergedPRs = analyses.filter(pr => pr.mergedAt);
    
    // Largest PR by lines changed
    const largestPR = analyses.reduce((largest, pr) => {
      const prLines = pr.linesAdded + pr.linesDeleted;
      const largestLines = largest.linesAdded + largest.linesDeleted;
      return prLines > largestLines ? pr : largest;
    }, analyses[0]);

    // Most discussed PR
    const mostDiscussedPR = analyses.reduce((mostDiscussed, pr) => {
      const prComments = pr.comments + pr.reviewComments;
      const mostDiscussedComments = mostDiscussed.comments + mostDiscussed.reviewComments;
      return prComments > mostDiscussedComments ? pr : mostDiscussed;
    }, analyses[0]);

    // Quickest merge (among merged PRs)
    const quickestMerge = mergedPRs
      .filter(pr => pr.timeToMerge !== undefined)
      .reduce((quickest, pr) => {
        return !quickest || (pr.timeToMerge! < quickest.timeToMerge!) ? pr : quickest;
      }, null as PRAnalysis | null);

    // Longest open PR
    const longestOpenPR = analyses
      .filter(pr => !pr.mergedAt)
      .reduce((longest, pr) => {
        const prAge = Math.ceil((Date.now() - pr.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        const longestAge = Math.ceil((Date.now() - longest.createdAt.getTime()) / (1000 * 60 * 60 * 24));
        return prAge > longestAge ? pr : longest;
      }, analyses.find(pr => !pr.mergedAt));

    return {
      largestPR: largestPR ? {
        number: largestPR.number,
        title: largestPR.title,
        linesChanged: largestPR.linesAdded + largestPR.linesDeleted
      } : { number: 0, title: 'N/A', linesChanged: 0 },
      
      mostDiscussedPR: mostDiscussedPR ? {
        number: mostDiscussedPR.number,
        title: mostDiscussedPR.title,
        comments: mostDiscussedPR.comments + mostDiscussedPR.reviewComments
      } : { number: 0, title: 'N/A', comments: 0 },
      
      quickestMerge: quickestMerge ? {
        number: quickestMerge.number,
        title: quickestMerge.title,
        timeToMerge: quickestMerge.timeToMerge!
      } : { number: 0, title: 'N/A', timeToMerge: 0 },
      
      longestOpenPR: longestOpenPR ? {
        number: longestOpenPR.number,
        title: longestOpenPR.title,
        daysOpen: Math.ceil((Date.now() - longestOpenPR.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      } : { number: 0, title: 'N/A', daysOpen: 0 }
    };
  }

  /**
   * Estimate language breakdown based on PR patterns
   * This is a simplified estimation - real implementation would analyze actual files
   */
  private estimateLanguageBreakdown(pr: PRAnalysis): Record<string, number> {
    const languages: Record<string, number> = {};
    const totalLines = pr.linesAdded + pr.linesDeleted;

    // Simple heuristics based on common patterns
    if (pr.title.toLowerCase().includes('test') || pr.labels.includes('test')) {
      languages['Test'] = Math.round(totalLines * 0.8);
      languages['JavaScript'] = Math.round(totalLines * 0.2);
    } else if (pr.title.toLowerCase().includes('doc') || pr.labels.includes('documentation')) {
      languages['Markdown'] = Math.round(totalLines * 0.9);
      languages['Other'] = Math.round(totalLines * 0.1);
    } else {
      // Default distribution for regular PRs
      languages['JavaScript'] = Math.round(totalLines * 0.6);
      languages['TypeScript'] = Math.round(totalLines * 0.3);
      languages['CSS'] = Math.round(totalLines * 0.1);
    }

    return languages;
  }

  /**
   * Compare statistics with previous period
   */
  public compareWithPreviousPeriod(
    currentStats: DigestStatistics,
    previousStats: DigestStatistics | null
  ): {
    prCountChange: number;
    commitCountChange: number;
    contributorCountChange: number;
    averageTimeToMergeChange: number;
    codeChurnChange: number;
    reviewCoverageChange: number;
  } {
    if (!previousStats) {
      return {
        prCountChange: 0,
        commitCountChange: 0,
        contributorCountChange: 0,
        averageTimeToMergeChange: 0,
        codeChurnChange: 0,
        reviewCoverageChange: 0
      };
    }

    const calculatePercentChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    return {
      prCountChange: calculatePercentChange(currentStats.pullRequests.total, previousStats.pullRequests.total),
      commitCountChange: calculatePercentChange(currentStats.commits.total, previousStats.commits.total),
      contributorCountChange: calculatePercentChange(currentStats.contributors.total, previousStats.contributors.total),
      averageTimeToMergeChange: calculatePercentChange(
        currentStats.pullRequests.averageTimeToMerge,
        previousStats.pullRequests.averageTimeToMerge
      ),
      codeChurnChange: calculatePercentChange(currentStats.trends.codeChurnRate, previousStats.trends.codeChurnRate),
      reviewCoverageChange: calculatePercentChange(currentStats.trends.reviewCoverage, previousStats.trends.reviewCoverage)
    };
  }

  /**
   * Generate text-based charts for statistics
   */
  public generateTextCharts(stats: DigestStatistics): {
    prTypeChart: string;
    impactChart: string;
    contributorChart: string;
    trendsChart: string;
  } {
    return {
      prTypeChart: this.generateBarChart(
        Object.entries(stats.pullRequests.byType)
          .filter(([, count]) => count > 0)
          .slice(0, 8),
        'PR Types'
      ),
      impactChart: this.generateBarChart(
        Object.entries(stats.pullRequests.byImpact)
          .filter(([, count]) => count > 0),
        'Impact Levels'
      ),
      contributorChart: this.generateBarChart(
        stats.contributors.topContributors
          .slice(0, 5)
          .map(c => [c.name, c.prs]),
        'Top Contributors'
      ),
      trendsChart: this.generateTrendChart(stats.trends)
    };
  }

  /**
   * Generate a simple text bar chart
   */
  private generateBarChart(data: Array<[string, number]>, title: string): string {
    if (data.length === 0) return `${title}: No data available`;

    const maxValue = Math.max(...data.map(([, value]) => value));
    const maxBarLength = 20;

    const bars = data.map(([label, value]) => {
      const barLength = Math.round((value / maxValue) * maxBarLength);
      const bar = '█'.repeat(barLength) + '░'.repeat(maxBarLength - barLength);
      return `${label.padEnd(15)} ${bar} ${value}`;
    });

    return `${title}:\n${bars.join('\n')}`;
  }

  /**
   * Generate a trend chart
   */
  private generateTrendChart(trends: DigestStatistics['trends']): string {
    return `Velocity Metrics:
PR Velocity:      ${trends.prVelocity.toFixed(1)} PRs/day
Commit Velocity:  ${trends.commitVelocity.toFixed(1)} commits/day
Code Churn:       ${trends.codeChurnRate.toFixed(0)} lines/day
Review Coverage:  ${trends.reviewCoverage}%`;
  }

  /**
   * Export statistics to various formats
   */
  public exportStatistics(
    stats: DigestStatistics,
    format: 'json' | 'csv' | 'summary'
  ): string {
    switch (format) {
      case 'json':
        return JSON.stringify(stats, null, 2);
      
      case 'csv':
        return this.generateCSVExport(stats);
      
      case 'summary':
        return this.generateSummaryExport(stats);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private generateCSVExport(stats: DigestStatistics): string {
    const rows = [
      'Metric,Value',
      `Total PRs,${stats.pullRequests.total}`,
      `Merged PRs,${stats.pullRequests.merged}`,
      `Contributors,${stats.contributors.total}`,
      `Total Commits,${stats.commits.total}`,
      `Average Time to Merge,${stats.pullRequests.averageTimeToMerge}`,
      `PR Velocity,${stats.trends.prVelocity}`,
      `Review Coverage,${stats.trends.reviewCoverage}%`
    ];

    return rows.join('\n');
  }

  private generateSummaryExport(stats: DigestStatistics): string {
    return `Repository Statistics Summary
Repository: ${stats.repository.name}
Period: ${stats.period.from.toISOString().split('T')[0]} to ${stats.period.to.toISOString().split('T')[0]}

Pull Requests: ${stats.pullRequests.total} total (${stats.pullRequests.merged} merged)
Contributors: ${stats.contributors.total} active
Commits: ${stats.commits.total} total
Code Changes: +${stats.commits.totalAdditions} -${stats.commits.totalDeletions}

Velocity: ${stats.trends.prVelocity} PRs/day, ${stats.trends.commitVelocity} commits/day
Review Coverage: ${stats.trends.reviewCoverage}%`;
  }
}