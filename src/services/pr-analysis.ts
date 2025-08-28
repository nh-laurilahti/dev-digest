import { GitHubPullRequest, PRAnalysis, PRType, PRImpact, PRComplexity, PRAnalysisConfig } from '../types/digest';
import { logger } from '../lib/logger';

/**
 * PR Analysis Engine
 * 
 * Analyzes GitHub pull requests to extract meaningful insights including:
 * - PR categorization by type (feature, bugfix, etc.)
 * - Impact assessment (minor, moderate, major, critical)
 * - Complexity analysis based on code changes
 * - Risk assessment for changes
 * - Key insights and patterns
 */
export class PRAnalysisService {
  private config: PRAnalysisConfig;

  constructor(config?: Partial<PRAnalysisConfig>) {
    this.config = {
      patterns: {
        featureKeywords: ['feat', 'feature', 'add', 'implement', 'new'],
        bugfixKeywords: ['fix', 'bug', 'issue', 'resolve', 'patch', 'correct'],
        breakingKeywords: ['breaking', 'break', 'remove', 'delete', 'deprecate'],
        testKeywords: ['test', 'spec', 'coverage', 'unit', 'integration', 'e2e'],
        docsKeywords: ['doc', 'docs', 'readme', 'documentation', 'comment'],
        ...config?.patterns
      },
      thresholds: {
        majorImpact: {
          linesChanged: 500,
          filesChanged: 20,
          commentsThreshold: 10
        },
        complexPR: {
          linesChanged: 1000,
          filesChanged: 50,
          commits: 10
        },
        ...config?.thresholds
      }
    };
  }

  /**
   * Analyze a single pull request
   */
  public async analyzePR(pr: GitHubPullRequest): Promise<PRAnalysis> {
    try {
      const type = this.categorizePRType(pr);
      const impact = this.assessImpact(pr);
      const complexity = this.assessComplexity(pr);
      const riskLevel = this.assessRisk(pr, impact, complexity);
      const keyChanges = this.extractKeyChanges(pr);
      const timeToMerge = this.calculateTimeToMerge(pr);

      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        type,
        impact,
        complexity,
        author: pr.user.login,
        createdAt: new Date(pr.created_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        linesAdded: pr.additions,
        linesDeleted: pr.deletions,
        filesChanged: pr.changed_files,
        commits: pr.commits,
        comments: pr.comments,
        reviewComments: pr.review_comments,
        labels: pr.labels.map(l => l.name),
        description: this.sanitizeDescription(pr.body || ''),
        keyChanges,
        riskLevel,
        reviewers: [], // Would be populated from review data
        timeToMerge
      };
    } catch (error) {
      logger.error(`Error analyzing PR #${pr.number}:`, error);
      throw error;
    }
  }

  /**
   * Analyze multiple pull requests in batch
   */
  public async analyzePRsBatch(prs: GitHubPullRequest[]): Promise<PRAnalysis[]> {
    const results: PRAnalysis[] = [];
    const batchSize = 10;

    for (let i = 0; i < prs.length; i += batchSize) {
      const batch = prs.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(pr => this.analyzePR(pr).catch(error => {
          logger.error(`Failed to analyze PR #${pr.number}:`, error);
          return null;
        }))
      );

      results.push(...batchResults.filter(Boolean) as PRAnalysis[]);
      
      // Add small delay to prevent overwhelming the system
      if (i + batchSize < prs.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Categorize PR type based on title, labels, and changes
   */
  private categorizePRType(pr: GitHubPullRequest): PRType {
    const title = pr.title.toLowerCase();
    const labels = pr.labels.map(l => l.name.toLowerCase());
    const allText = [title, ...labels, (pr.body || '').toLowerCase()].join(' ');

    // Check labels first for explicit categorization
    if (labels.some(l => l.includes('breaking') || l.includes('major'))) {
      return 'breaking';
    }
    if (labels.some(l => l.includes('security'))) {
      return 'security';
    }
    if (labels.some(l => l.includes('hotfix'))) {
      return 'hotfix';
    }
    if (labels.some(l => l.includes('performance'))) {
      return 'performance';
    }

    // Check title and content patterns
    if (this.containsKeywords(allText, this.config.patterns.featureKeywords)) {
      return 'feature';
    }
    if (this.containsKeywords(allText, this.config.patterns.bugfixKeywords)) {
      return 'bugfix';
    }
    if (this.containsKeywords(allText, this.config.patterns.breakingKeywords)) {
      return 'breaking';
    }
    if (this.containsKeywords(allText, this.config.patterns.testKeywords)) {
      return 'test';
    }
    if (this.containsKeywords(allText, this.config.patterns.docsKeywords)) {
      return 'docs';
    }

    // Check for refactor patterns
    if (title.includes('refactor') || title.includes('cleanup') || title.includes('restructure')) {
      return 'refactor';
    }

    // Check for chore patterns
    if (title.includes('chore') || title.includes('update') || title.includes('bump')) {
      return 'chore';
    }

    return 'other';
  }

  /**
   * Assess the impact of a PR
   */
  private assessImpact(pr: GitHubPullRequest): PRImpact {
    const totalLines = pr.additions + pr.deletions;
    const { majorImpact } = this.config.thresholds;

    // Critical impact indicators
    if (
      pr.labels.some(l => l.name.toLowerCase().includes('breaking')) ||
      pr.labels.some(l => l.name.toLowerCase().includes('critical')) ||
      totalLines > majorImpact.linesChanged * 2 ||
      pr.changed_files > majorImpact.filesChanged * 1.5
    ) {
      return 'critical';
    }

    // Major impact indicators
    if (
      totalLines > majorImpact.linesChanged ||
      pr.changed_files > majorImpact.filesChanged ||
      pr.comments + pr.review_comments > majorImpact.commentsThreshold
    ) {
      return 'major';
    }

    // Moderate impact indicators
    if (
      totalLines > majorImpact.linesChanged * 0.3 ||
      pr.changed_files > majorImpact.filesChanged * 0.3 ||
      pr.commits > 5
    ) {
      return 'moderate';
    }

    return 'minor';
  }

  /**
   * Assess PR complexity
   */
  private assessComplexity(pr: GitHubPullRequest): PRComplexity {
    const totalLines = pr.additions + pr.deletions;
    const { complexPR } = this.config.thresholds;

    // Very complex indicators
    if (
      totalLines > complexPR.linesChanged ||
      pr.changed_files > complexPR.filesChanged ||
      pr.commits > complexPR.commits
    ) {
      return 'very-complex';
    }

    // Complex indicators
    if (
      totalLines > complexPR.linesChanged * 0.5 ||
      pr.changed_files > complexPR.filesChanged * 0.4 ||
      pr.commits > complexPR.commits * 0.7
    ) {
      return 'complex';
    }

    // Moderate complexity
    if (
      totalLines > 100 ||
      pr.changed_files > 5 ||
      pr.commits > 3
    ) {
      return 'moderate';
    }

    return 'simple';
  }

  /**
   * Assess risk level of a PR
   */
  private assessRisk(pr: GitHubPullRequest, impact: PRImpact, complexity: PRComplexity): 'low' | 'medium' | 'high' {
    const riskFactors = [];

    // High-risk indicators
    if (impact === 'critical' || complexity === 'very-complex') {
      riskFactors.push('high-impact-or-complexity');
    }
    
    if (pr.labels.some(l => l.name.toLowerCase().includes('breaking'))) {
      riskFactors.push('breaking-change');
    }

    if (pr.review_comments === 0 && (impact === 'major' || complexity === 'complex')) {
      riskFactors.push('insufficient-review');
    }

    if (pr.commits > 20) {
      riskFactors.push('too-many-commits');
    }

    // Determine overall risk
    if (riskFactors.length >= 2) {
      return 'high';
    } else if (riskFactors.length === 1 || impact === 'major' || complexity === 'complex') {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Extract key changes and insights from PR
   */
  private extractKeyChanges(pr: GitHubPullRequest): string[] {
    const changes: string[] = [];

    if (pr.additions > 0) {
      changes.push(`Added ${pr.additions} lines of code`);
    }
    if (pr.deletions > 0) {
      changes.push(`Removed ${pr.deletions} lines of code`);
    }
    if (pr.changed_files > 10) {
      changes.push(`Modified ${pr.changed_files} files`);
    }
    if (pr.commits > 5) {
      changes.push(`${pr.commits} commits`);
    }

    // Extract from labels
    const significantLabels = pr.labels
      .filter(l => !['enhancement', 'bug', 'documentation'].includes(l.name.toLowerCase()))
      .map(l => l.name);
    
    if (significantLabels.length > 0) {
      changes.push(`Tagged: ${significantLabels.join(', ')}`);
    }

    return changes;
  }

  /**
   * Calculate time to merge in hours
   */
  private calculateTimeToMerge(pr: GitHubPullRequest): number | undefined {
    if (!pr.merged_at) return undefined;

    const created = new Date(pr.created_at);
    const merged = new Date(pr.merged_at);
    
    return Math.round((merged.getTime() - created.getTime()) / (1000 * 60 * 60));
  }

  /**
   * Sanitize and truncate PR description
   */
  private sanitizeDescription(body: string): string {
    // Remove markdown and HTML tags, limit length
    const cleaned = body
      .replace(/[#*`]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    return cleaned.length > 200 ? cleaned.substring(0, 200) + '...' : cleaned;
  }

  /**
   * Check if text contains any of the given keywords
   */
  private containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(keyword => 
      text.includes(keyword.toLowerCase()) ||
      text.includes(`[${keyword}]`) ||
      text.includes(`${keyword}:`) ||
      text.includes(`${keyword}(`)
    );
  }

  /**
   * Get analysis patterns for debugging/configuration
   */
  public getConfig(): PRAnalysisConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<PRAnalysisConfig>): void {
    this.config = {
      patterns: { ...this.config.patterns, ...updates.patterns },
      thresholds: { ...this.config.thresholds, ...updates.thresholds }
    };
  }

  /**
   * Generate analysis summary for multiple PRs
   */
  public generateAnalysisSummary(analyses: PRAnalysis[]): {
    total: number;
    byType: Record<PRType, number>;
    byImpact: Record<PRImpact, number>;
    byComplexity: Record<PRComplexity, number>;
    averageTimeToMerge: number;
    riskDistribution: Record<string, number>;
  } {
    const summary = {
      total: analyses.length,
      byType: {} as Record<PRType, number>,
      byImpact: {} as Record<PRImpact, number>,
      byComplexity: {} as Record<PRComplexity, number>,
      averageTimeToMerge: 0,
      riskDistribution: { low: 0, medium: 0, high: 0 }
    };

    // Initialize counters
    const prTypes: PRType[] = ['feature', 'bugfix', 'hotfix', 'refactor', 'docs', 'test', 'chore', 'breaking', 'security', 'performance', 'other'];
    const impacts: PRImpact[] = ['minor', 'moderate', 'major', 'critical'];
    const complexities: PRComplexity[] = ['simple', 'moderate', 'complex', 'very-complex'];

    prTypes.forEach(type => summary.byType[type] = 0);
    impacts.forEach(impact => summary.byImpact[impact] = 0);
    complexities.forEach(complexity => summary.byComplexity[complexity] = 0);

    // Count occurrences
    let totalTimeToMerge = 0;
    let mergedPRsWithTime = 0;

    analyses.forEach(pr => {
      summary.byType[pr.type]++;
      summary.byImpact[pr.impact]++;
      summary.byComplexity[pr.complexity]++;
      summary.riskDistribution[pr.riskLevel]++;

      if (pr.timeToMerge !== undefined) {
        totalTimeToMerge += pr.timeToMerge;
        mergedPRsWithTime++;
      }
    });

    summary.averageTimeToMerge = mergedPRsWithTime > 0 
      ? Math.round(totalTimeToMerge / mergedPRsWithTime) 
      : 0;

    return summary;
  }
}