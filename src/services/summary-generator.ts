import { PRAnalysis, DigestStatistics, DigestContent, DigestOptions, PRType, PRImpact } from '../types/digest';
import { logger } from '../lib/logger';

/**
 * Summary Generation Service
 * 
 * Creates comprehensive, readable summaries from PR analysis and statistics.
 * Supports multiple detail levels and customizable content based on user preferences.
 */
export class SummaryGeneratorService {
  /**
   * Generate a complete digest content structure
   */
  public async generateDigestContent(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[],
    options: DigestOptions,
    aiInsights?: any
  ): Promise<DigestContent> {
    try {
      logger.info(`Generating digest content for ${prAnalyses.length} PRs`);

      const content: DigestContent = {
        metadata: {
          generatedAt: new Date(),
          version: '1.0.0',
          repository: options.repository,
          period: {
            from: options.dateFrom,
            to: options.dateTo
          },
          options
        },
        executive: this.generateExecutiveSummary(statistics, prAnalyses, options),
        sections: {
          statistics,
          pullRequests: this.generatePullRequestsSection(prAnalyses, options),
          contributors: this.generateContributorsSection(statistics, prAnalyses, options),
          codeHealth: this.generateCodeHealthSection(statistics, prAnalyses, options),
          trends: this.generateTrendsSection(statistics, options)
        },
        aiInsights,
        appendix: this.generateAppendix(statistics, prAnalyses, options)
      };

      return content;
    } catch (error) {
      logger.error('Error generating digest content:', error);
      throw error;
    }
  }

  /**
   * Generate executive summary
   */
  private generateExecutiveSummary(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[],
    options: DigestOptions
  ): DigestContent['executive'] {
    const keyMetrics = {
      totalPRs: statistics.pullRequests.total,
      mergedPRs: statistics.pullRequests.merged,
      activeContributors: statistics.contributors.total,
      averageTimeToMerge: statistics.pullRequests.averageTimeToMerge
    };

    // Generate dynamic summary based on the data
    const summary = this.generateDynamicSummary(statistics, prAnalyses);
    const highlights = this.generateKeyHighlights(statistics, prAnalyses);

    return {
      summary,
      keyMetrics,
      highlights
    };
  }

  /**
   * Generate dynamic summary text
   */
  private generateDynamicSummary(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string {
    const { pullRequests, contributors, period } = statistics;
    const mergeRate = pullRequests.total > 0 ? Math.round((pullRequests.merged / pullRequests.total) * 100) : 0;
    
    let summary = `During the ${period.days}-day period from ${period.from.toLocaleDateString()} to ${period.to.toLocaleDateString()}, `;
    summary += `the ${statistics.repository.name} repository saw significant development activity. `;
    
    summary += `${pullRequests.total} pull requests were opened, with ${pullRequests.merged} (${mergeRate}%) successfully merged. `;
    summary += `${contributors.total} contributors participated, demonstrating ${this.getActivityLevel(pullRequests.total, period.days)} development pace. `;
    
    if (pullRequests.averageTimeToMerge > 0) {
      summary += `The average time to merge was ${pullRequests.averageTimeToMerge} hours, indicating `;
      summary += pullRequests.averageTimeToMerge < 24 ? 'rapid review cycles' : 
                 pullRequests.averageTimeToMerge < 72 ? 'efficient review processes' : 'thorough review practices';
      summary += '. ';
    }

    // Add type-specific insights
    const topTypes = Object.entries(pullRequests.byType)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    if (topTypes.length > 0) {
      summary += `Development focused primarily on ${topTypes.map(([type, count]) => 
        `${type} (${count})`).join(', ')}.`;
    }

    return summary;
  }

  /**
   * Determine activity level based on PR volume
   */
  private getActivityLevel(prCount: number, days: number): string {
    const prPerDay = prCount / days;
    if (prPerDay > 5) return 'high-velocity';
    if (prPerDay > 2) return 'active';
    if (prPerDay > 0.5) return 'moderate';
    return 'steady';
  }

  /**
   * Generate key highlights
   */
  private generateKeyHighlights(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string[] {
    const highlights: string[] = [];
    const { pullRequests, contributors, highlights: statsHighlights } = statistics;

    // PR volume highlights
    if (pullRequests.total > 50) {
      highlights.push(`High development activity with ${pullRequests.total} pull requests`);
    } else if (pullRequests.total > 20) {
      highlights.push(`Solid development pace with ${pullRequests.total} pull requests`);
    }

    // Contributor highlights
    if (contributors.total > 10) {
      highlights.push(`Strong team collaboration with ${contributors.total} active contributors`);
    } else if (contributors.total > 5) {
      highlights.push(`Good team participation with ${contributors.total} contributors`);
    }

    // Impact highlights
    const highImpactPRs = pullRequests.byImpact.major + pullRequests.byImpact.critical;
    if (highImpactPRs > 0) {
      highlights.push(`${highImpactPRs} high-impact changes integrated`);
    }

    // Breaking changes
    if (pullRequests.byType.breaking > 0) {
      highlights.push(`${pullRequests.byType.breaking} breaking changes requiring attention`);
    }

    // Security updates
    if (pullRequests.byType.security > 0) {
      highlights.push(`${pullRequests.byType.security} security improvements implemented`);
    }

    // Performance improvements
    if (pullRequests.byType.performance > 0) {
      highlights.push(`${pullRequests.byType.performance} performance optimizations deployed`);
    }

    // Notable PRs
    if (statsHighlights.largestPR.linesChanged > 1000) {
      highlights.push(`Significant refactor: PR #${statsHighlights.largestPR.number} with ${statsHighlights.largestPR.linesChanged} lines changed`);
    }

    return highlights.slice(0, 5); // Limit to top 5 highlights
  }

  /**
   * Generate pull requests section
   */
  private generatePullRequestsSection(
    prAnalyses: PRAnalysis[],
    options: DigestOptions
  ): DigestContent['sections']['pullRequests'] {
    // Group PRs by type
    const byType: Record<PRType, PRAnalysis[]> = {
      feature: [], bugfix: [], hotfix: [], refactor: [], docs: [],
      test: [], chore: [], breaking: [], security: [], performance: [], other: []
    };

    prAnalyses.forEach(pr => {
      byType[pr.type].push(pr);
    });

    // Select featured PRs (most significant ones)
    const featured = this.selectFeaturedPRs(prAnalyses);

    const summary = this.generatePRsSummary(prAnalyses);

    return {
      summary,
      featured,
      byType
    };
  }

  /**
   * Select the most notable/featured PRs
   */
  private selectFeaturedPRs(prAnalyses: PRAnalysis[]): PRAnalysis[] {
    const featured: PRAnalysis[] = [];
    
    // Add largest PRs
    const bySize = prAnalyses
      .filter(pr => pr.linesAdded + pr.linesDeleted > 100)
      .sort((a, b) => (b.linesAdded + b.linesDeleted) - (a.linesAdded + a.linesDeleted))
      .slice(0, 3);
    featured.push(...bySize);

    // Add most discussed PRs
    const byDiscussion = prAnalyses
      .filter(pr => pr.comments + pr.reviewComments > 5)
      .sort((a, b) => (b.comments + b.reviewComments) - (a.comments + a.reviewComments))
      .slice(0, 2);
    featured.push(...byDiscussion);

    // Add breaking changes
    const breaking = prAnalyses
      .filter(pr => pr.type === 'breaking' || pr.impact === 'critical')
      .slice(0, 2);
    featured.push(...breaking);

    // Add security fixes
    const security = prAnalyses
      .filter(pr => pr.type === 'security')
      .slice(0, 2);
    featured.push(...security);

    // Remove duplicates and limit
    const uniqueFeatured = Array.from(
      new Map(featured.map(pr => [pr.id, pr])).values()
    ).slice(0, 8);

    return uniqueFeatured;
  }

  /**
   * Generate PR summary text
   */
  private generatePRsSummary(prAnalyses: PRAnalysis[]): string {
    if (prAnalyses.length === 0) return 'No pull requests found for this period.';

    const merged = prAnalyses.filter(pr => pr.mergedAt);
    const byType = prAnalyses.reduce((acc, pr) => {
      acc[pr.type] = (acc[pr.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    let summary = `${prAnalyses.length} pull requests were submitted during this period, `;
    summary += `with ${merged.length} successfully merged. `;

    const topTypes = Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    if (topTypes.length > 0) {
      summary += `Development activity was primarily focused on `;
      summary += topTypes.map(([type, count]) => `${type} work (${count} PRs)`).join(', ');
      summary += '. ';
    }

    const avgSize = Math.round(prAnalyses.reduce((sum, pr) => 
      sum + pr.linesAdded + pr.linesDeleted, 0) / prAnalyses.length);
    summary += `Average change size was ${avgSize} lines, suggesting `;
    summary += avgSize > 500 ? 'substantial modifications' :
               avgSize > 100 ? 'moderate-sized changes' : 'focused, incremental improvements';
    summary += '.';

    return summary;
  }

  /**
   * Generate contributors section
   */
  private generateContributorsSection(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[],
    options: DigestOptions
  ): DigestContent['sections']['contributors'] {
    const { contributors } = statistics;
    
    const topContributors = contributors.topContributors.map(contributor => ({
      name: contributor.name,
      metrics: {
        prs: contributor.prs,
        commits: contributor.commits,
        linesChanged: contributor.linesChanged
      },
      highlights: this.generateContributorHighlights(contributor, prAnalyses)
    }));

    const summary = this.generateContributorsSummary(contributors);

    return {
      summary,
      topContributors,
      newContributors: [] // Would need historical data
    };
  }

  /**
   * Generate contributor highlights
   */
  private generateContributorHighlights(
    contributor: { name: string; prs: number; commits: number; linesChanged: number },
    prAnalyses: PRAnalysis[]
  ): string[] {
    const highlights: string[] = [];
    const contributorPRs = prAnalyses.filter(pr => pr.author === contributor.name);

    if (contributor.prs > 10) {
      highlights.push(`Highly active with ${contributor.prs} pull requests`);
    }

    if (contributor.linesChanged > 5000) {
      highlights.push(`Significant code contributor with ${contributor.linesChanged} lines changed`);
    }

    const hasBreakingChanges = contributorPRs.some(pr => pr.type === 'breaking');
    if (hasBreakingChanges) {
      highlights.push('Involved in breaking changes');
    }

    const hasSecurityFixes = contributorPRs.some(pr => pr.type === 'security');
    if (hasSecurityFixes) {
      highlights.push('Contributed to security improvements');
    }

    const avgPRSize = contributorPRs.length > 0 
      ? Math.round(contributorPRs.reduce((sum, pr) => sum + pr.linesAdded + pr.linesDeleted, 0) / contributorPRs.length)
      : 0;
    
    if (avgPRSize > 1000) {
      highlights.push('Specializes in large-scale changes');
    } else if (avgPRSize < 50) {
      highlights.push('Focuses on incremental improvements');
    }

    return highlights.slice(0, 3);
  }

  /**
   * Generate contributors summary
   */
  private generateContributorsSummary(contributors: DigestStatistics['contributors']): string {
    let summary = `${contributors.total} developers contributed to the repository during this period. `;
    
    if (contributors.topContributors.length > 0) {
      const topContributor = contributors.topContributors[0];
      summary += `${topContributor.name} was the most active contributor with ${topContributor.prs} pull requests `;
      summary += `and ${topContributor.linesChanged} lines of code changed. `;
    }

    const distributionLevel = this.analyzeContributionDistribution(contributors.topContributors);
    summary += `The contribution distribution appears ${distributionLevel}, `;
    
    if (distributionLevel === 'balanced') {
      summary += 'indicating good team collaboration and shared ownership.';
    } else if (distributionLevel === 'concentrated') {
      summary += 'with a few key contributors driving most changes.';
    } else {
      summary += 'showing varied levels of individual contribution.';
    }

    return summary;
  }

  /**
   * Analyze contribution distribution
   */
  private analyzeContributionDistribution(
    topContributors: Array<{ name: string; prs: number; commits: number; linesChanged: number }>
  ): 'balanced' | 'concentrated' | 'mixed' {
    if (topContributors.length < 3) return 'mixed';

    const total = topContributors.reduce((sum, c) => sum + c.prs, 0);
    const topThreeShare = topContributors.slice(0, 3).reduce((sum, c) => sum + c.prs, 0) / total;

    if (topThreeShare > 0.8) return 'concentrated';
    if (topThreeShare < 0.5) return 'balanced';
    return 'mixed';
  }

  /**
   * Generate code health section
   */
  private generateCodeHealthSection(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[],
    options: DigestOptions
  ): DigestContent['sections']['codeHealth'] {
    const metrics = {
      codeChurn: statistics.trends.codeChurnRate,
      reviewCoverage: statistics.trends.reviewCoverage,
      averageComplexity: this.calculateAverageComplexity(prAnalyses)
    };

    const concerns = this.identifyCodeHealthConcerns(statistics, prAnalyses);
    const improvements = this.identifyImprovements(statistics, prAnalyses);
    const summary = this.generateCodeHealthSummary(metrics, concerns, improvements);

    return {
      summary,
      metrics,
      concerns,
      improvements
    };
  }

  /**
   * Calculate average complexity score
   */
  private calculateAverageComplexity(prAnalyses: PRAnalysis[]): number {
    const complexityScore = (pr: PRAnalysis): number => {
      switch (pr.complexity) {
        case 'simple': return 1;
        case 'moderate': return 2;
        case 'complex': return 3;
        case 'very-complex': return 4;
        default: return 1;
      }
    };

    if (prAnalyses.length === 0) return 1;
    
    const totalScore = prAnalyses.reduce((sum, pr) => sum + complexityScore(pr), 0);
    return Math.round((totalScore / prAnalyses.length) * 10) / 10;
  }

  /**
   * Identify code health concerns
   */
  private identifyCodeHealthConcerns(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string[] {
    const concerns: string[] = [];

    // Review coverage concerns
    if (statistics.trends.reviewCoverage < 70) {
      concerns.push(`Low review coverage at ${statistics.trends.reviewCoverage}% - consider requiring reviews`);
    }

    // Large PR concerns
    const largePRs = prAnalyses.filter(pr => pr.linesAdded + pr.linesDeleted > 1000);
    if (largePRs.length > prAnalyses.length * 0.2) {
      concerns.push(`${largePRs.length} very large PRs detected - consider breaking into smaller changes`);
    }

    // High-risk PR concerns
    const highRiskPRs = prAnalyses.filter(pr => pr.riskLevel === 'high');
    if (highRiskPRs.length > 0) {
      concerns.push(`${highRiskPRs.length} high-risk PRs require extra attention`);
    }

    // Time to merge concerns
    if (statistics.pullRequests.averageTimeToMerge > 168) { // More than a week
      concerns.push(`Long average time to merge (${statistics.pullRequests.averageTimeToMerge} hours) may indicate bottlenecks`);
    }

    return concerns;
  }

  /**
   * Identify improvements
   */
  private identifyImprovements(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string[] {
    const improvements: string[] = [];

    // Good review coverage
    if (statistics.trends.reviewCoverage >= 90) {
      improvements.push(`Excellent review coverage at ${statistics.trends.reviewCoverage}%`);
    }

    // Good merge time
    if (statistics.pullRequests.averageTimeToMerge > 0 && statistics.pullRequests.averageTimeToMerge < 48) {
      improvements.push(`Fast review cycle with ${statistics.pullRequests.averageTimeToMerge}h average merge time`);
    }

    // Security focus
    if (statistics.pullRequests.byType.security > 0) {
      improvements.push(`${statistics.pullRequests.byType.security} security improvements implemented`);
    }

    // Test coverage
    if (statistics.pullRequests.byType.test > prAnalyses.length * 0.15) {
      improvements.push(`Strong testing focus with ${statistics.pullRequests.byType.test} test-related PRs`);
    }

    // Documentation
    if (statistics.pullRequests.byType.docs > 0) {
      improvements.push(`${statistics.pullRequests.byType.docs} documentation improvements made`);
    }

    return improvements;
  }

  /**
   * Generate code health summary
   */
  private generateCodeHealthSummary(
    metrics: { codeChurn: number; reviewCoverage: number; averageComplexity: number },
    concerns: string[],
    improvements: string[]
  ): string {
    let summary = 'Code health analysis reveals ';
    
    if (concerns.length === 0) {
      summary += 'good overall repository health. ';
    } else if (concerns.length <= 2) {
      summary += 'generally healthy practices with some areas for improvement. ';
    } else {
      summary += 'several areas requiring attention to maintain code quality. ';
    }

    summary += `Review coverage stands at ${metrics.reviewCoverage}%, `;
    summary += metrics.reviewCoverage >= 80 ? 'indicating strong peer review practices. ' :
               metrics.reviewCoverage >= 60 ? 'showing moderate review engagement. ' :
               'suggesting need for improved review processes. ';

    summary += `The average complexity score is ${metrics.averageComplexity}/4, `;
    summary += metrics.averageComplexity <= 2 ? 'reflecting manageable change complexity.' :
               'indicating some complex changes that may need extra attention.';

    return summary;
  }

  /**
   * Generate trends section
   */
  private generateTrendsSection(
    statistics: DigestStatistics,
    options: DigestOptions
  ): DigestContent['sections']['trends'] {
    const summary = this.generateTrendsSummary(statistics);
    
    // For comparison, we'd need historical data
    const comparisons = {
      previousPeriod: {
        prCount: 0, // Would compare with previous period
        commitCount: 0,
        contributorCount: 0,
        changePercent: 0
      }
    };

    const predictions = this.generatePredictions(statistics);

    return {
      summary,
      comparisons,
      predictions
    };
  }

  /**
   * Generate trends summary
   */
  private generateTrendsSummary(statistics: DigestStatistics): string {
    const { trends } = statistics;
    
    let summary = `Development velocity shows ${trends.prVelocity} PRs per day `;
    summary += `and ${trends.commitVelocity} commits per day. `;
    
    summary += `Code churn rate of ${trends.codeChurnRate} lines per day indicates `;
    summary += trends.codeChurnRate > 1000 ? 'high development activity' :
               trends.codeChurnRate > 300 ? 'active development' :
               'steady, measured progress';
    summary += '. ';

    summary += `With ${trends.reviewCoverage}% review coverage, the team demonstrates `;
    summary += trends.reviewCoverage >= 80 ? 'strong code review practices.' :
               trends.reviewCoverage >= 60 ? 'good review engagement.' :
               'opportunity to improve peer review processes.';

    return summary;
  }

  /**
   * Generate predictions based on current trends
   */
  private generatePredictions(statistics: DigestStatistics): string[] {
    const predictions: string[] = [];
    const { trends, pullRequests } = statistics;

    // Velocity predictions
    if (trends.prVelocity > 3) {
      predictions.push('High velocity suggests continued rapid feature development');
    } else if (trends.prVelocity < 1) {
      predictions.push('Lower velocity may indicate focus on planning or complex features');
    }

    // Review coverage trends
    if (trends.reviewCoverage < 70) {
      predictions.push('Consider implementing review requirements to improve code quality');
    }

    // Type distribution insights
    const featureRatio = pullRequests.byType.feature / pullRequests.total;
    if (featureRatio > 0.5) {
      predictions.push('Heavy feature development suggests product expansion phase');
    }

    const bugfixRatio = pullRequests.byType.bugfix / pullRequests.total;
    if (bugfixRatio > 0.3) {
      predictions.push('High bugfix activity may indicate need for quality improvements');
    }

    return predictions.slice(0, 4);
  }

  /**
   * Generate appendix section
   */
  private generateAppendix(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[],
    options: DigestOptions
  ): DigestContent['appendix'] {
    return {
      methodology: this.generateMethodology(),
      dataSource: `GitHub API data for ${options.repository}`,
      limitations: this.generateLimitations(),
      rawData: options.detailLevel === 'comprehensive' ? {
        pullRequests: prAnalyses,
        statistics
      } : undefined
    };
  }

  /**
   * Generate methodology description
   */
  private generateMethodology(): string {
    return `This digest was generated by analyzing GitHub pull request data and applying automated categorization, 
impact assessment, and complexity analysis. PR types are determined through keyword analysis of titles, labels, 
and descriptions. Impact levels are calculated based on code changes, file modifications, and review activity. 
Statistics are aggregated across the specified time period with trends calculated using daily averages.`;
  }

  /**
   * Generate known limitations
   */
  private generateLimitations(): string[] {
    return [
      'PR categorization is based on title/label patterns and may not capture all nuances',
      'Complexity assessment uses quantitative metrics that may not reflect actual code complexity',
      'Review quality assessment is based on comment count, not review depth',
      'File-level analysis requires additional API calls and may be limited by rate limits',
      'Historical trend analysis requires data from previous periods'
    ];
  }
}