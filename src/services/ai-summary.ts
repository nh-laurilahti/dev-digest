import { PRAnalysis, DigestStatistics, AIConfig, DigestOptions, SummaryStyle, PromptTemplate } from '../types/digest';
import { logger } from '../lib/logger';
import { config } from '../lib/config';

/**
 * AI Integration Service
 * 
 * Provides AI-powered enhancements for digest generation including:
 * - Intelligent PR summaries
 * - Narrative summary generation with customizable styles
 * - Code change analysis
 * - Risk assessment
 * - Automated insights and recommendations
 */
export class AISummaryService {
  private aiConfig: AIConfig;
  private promptTemplates: Map<SummaryStyle, PromptTemplate>;

  constructor(customConfig?: Partial<AIConfig>) {
    this.aiConfig = {
      provider: 'openai',
      model: 'gpt-5-mini',
      maxTokens: 2000,
      temperature: 1,
      systemPrompts: {
        prSummary: `You are a senior software engineer reviewing pull requests. Analyze the provided PR data and create a concise, professional summary focusing on impact, quality, and potential risks. Be specific about technical changes and their implications.`,
        codeAnalysis: `You are a code quality expert. Analyze the repository activity and provide insights about code health, development patterns, and areas for improvement. Focus on actionable recommendations.`,
        riskAssessment: `You are a technical lead assessing development risks. Evaluate the changes and identify potential issues, their severity, and mitigation strategies. Consider both technical and process risks.`
      },
      ...customConfig
    };
    this.promptTemplates = this.initializePromptTemplates();
  }

  /**
   * Generate AI-powered insights for the entire digest
   */
  public async generateDigestInsights(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[],
    options: DigestOptions
  ): Promise<any> {
    if (!this.isAIEnabled()) {
      logger.info('AI integration disabled, using rule-based insights');
      return this.generateRuleBasedInsights(statistics, prAnalyses);
    }

    try {
      logger.info('Generating AI-powered digest insights');

      const insights = await Promise.all([
        this.generateCodeQualityAssessment(statistics, prAnalyses),
        this.generateTeamProductivityInsights(statistics, prAnalyses),
        this.generateRiskAssessment(statistics, prAnalyses),
        this.generateRecommendations(statistics, prAnalyses)
      ]);

      return {
        summary: await this.generateOverallSummary(statistics, prAnalyses),
        codeQualityAssessment: insights[0],
        teamProductivityInsights: insights[1],
        riskAssessment: insights[2],
        recommendations: insights[3],
        provider: this.aiConfig.provider,
        model: this.aiConfig.model,
        generatedAt: new Date()
      };
    } catch (error) {
      logger.error('AI insights generation failed, falling back to rule-based:', error);
      return this.generateRuleBasedInsights(statistics, prAnalyses);
    }
  }

  /**
   * Generate AI-powered PR summaries
   */
  public async generatePRSummaries(
    prs: PRAnalysis[],
    limit: number = 10
  ): Promise<Array<PRAnalysis & { aiSummary?: string }>> {
    if (!this.isAIEnabled()) {
      return prs.map(pr => ({ ...pr, aiSummary: this.generateRuleBasedPRSummary(pr) }));
    }

    try {
      logger.info(`Generating AI summaries for ${Math.min(prs.length, limit)} PRs`);

      const prioritizedPRs = this.prioritizePRsForAIAnalysis(prs).slice(0, limit);
      const summaries = await Promise.all(
        prioritizedPRs.map(pr => this.generateSinglePRSummary(pr))
      );

      return prs.map(pr => {
        const aiSummary = summaries.find(s => s.id === pr.id)?.summary;
        return { ...pr, aiSummary };
      });
    } catch (error) {
      logger.error('PR AI summaries failed, using rule-based:', error);
      return prs.map(pr => ({ ...pr, aiSummary: this.generateRuleBasedPRSummary(pr) }));
    }
  }

  /**
   * Check if AI is enabled and configured
   */
  private isAIEnabled(): boolean {
    const hasApiKey = config.OPENAI_API_KEY || config.ANTHROPIC_API_KEY;
    return !!hasApiKey;
  }

  /**
   * Generate overall AI summary
   */
  private async generateOverallSummary(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[]
  ): Promise<string> {
    const prompt = this.buildSummaryPrompt(statistics, prAnalyses);
    return await this.callAI(prompt, this.aiConfig.systemPrompts.prSummary);
  }

  /**
   * Generate code quality assessment
   */
  private async generateCodeQualityAssessment(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[]
  ): Promise<string> {
    const prompt = this.buildCodeQualityPrompt(statistics, prAnalyses);
    return await this.callAI(prompt, this.aiConfig.systemPrompts.codeAnalysis);
  }

  /**
   * Generate team productivity insights
   */
  private async generateTeamProductivityInsights(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[]
  ): Promise<string> {
    const prompt = this.buildProductivityPrompt(statistics, prAnalyses);
    return await this.callAI(prompt, this.aiConfig.systemPrompts.codeAnalysis);
  }

  /**
   * Generate risk assessment
   */
  private async generateRiskAssessment(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[]
  ): Promise<{ level: 'low' | 'medium' | 'high'; factors: string[]; mitigations: string[] }> {
    const prompt = this.buildRiskAssessmentPrompt(statistics, prAnalyses);
    const response = await this.callAI(prompt, this.aiConfig.systemPrompts.riskAssessment);
    
    return this.parseRiskAssessmentResponse(response);
  }

  /**
   * Generate recommendations
   */
  private async generateRecommendations(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[]
  ): Promise<string[]> {
    const prompt = this.buildRecommendationsPrompt(statistics, prAnalyses);
    const response = await this.callAI(prompt, this.aiConfig.systemPrompts.codeAnalysis);
    
    return this.parseRecommendationsList(response);
  }

  /**
   * Generate single PR summary
   */
  private async generateSinglePRSummary(pr: PRAnalysis): Promise<{ id: number; summary: string }> {
    const prompt = this.buildSinglePRPrompt(pr);
    const summary = await this.callAI(prompt, this.aiConfig.systemPrompts.prSummary);
    
    return { id: pr.id, summary };
  }

  /**
   * Call AI service (OpenAI or Anthropic)
   */
  private async callAI(prompt: string, systemPrompt: string): Promise<string> {
    if (this.aiConfig.provider === 'openai' && config.OPENAI_API_KEY) {
      return await this.callOpenAI(prompt, systemPrompt);
    } else if (this.aiConfig.provider === 'anthropic' && config.ANTHROPIC_API_KEY) {
      return await this.callAnthropic(prompt, systemPrompt);
    }
    
    throw new Error('No AI provider configured');
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(prompt: string, systemPrompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'daily-dev-digest/1.0.0'
      },
      body: JSON.stringify({
        model: this.aiConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: this.aiConfig.maxTokens,
        temperature: this.aiConfig.temperature,
        stream: false,
        response_format: { type: 'text' }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, body: errorBody }, 'OpenAI API error');
      throw new Error(`OpenAI API error (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('OpenAI API returned no choices');
    }
    
    return data.choices[0]?.message?.content || 'No response generated';
  }

  /**
   * Call OpenAI API with streaming
   */
  private async callOpenAIStreaming(prompt: string, systemPrompt: string, onChunk?: (chunk: string) => void): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'daily-dev-digest/1.0.0'
      },
      body: JSON.stringify({
        model: this.aiConfig.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: this.aiConfig.maxTokens,
        temperature: this.aiConfig.temperature,
        stream: true,
        response_format: { type: 'text' }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, body: errorBody }, 'OpenAI API error');
      throw new Error(`OpenAI API error (${response.status}): ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available for streaming');
    }

    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                if (onChunk) {
                  onChunk(delta);
                }
              }
            } catch (e) {
              // Skip malformed JSON chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullContent || 'No response generated';
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(prompt: string, systemPrompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': config.ANTHROPIC_API_KEY!,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_completion_tokens: this.aiConfig.maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0]?.text || 'No response generated';
  }

  /**
   * Build summary prompt
   */
  private buildSummaryPrompt(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string {
    return `Analyze this repository activity and provide a comprehensive summary:

REPOSITORY: ${statistics.repository.name}
PERIOD: ${statistics.period.from.toLocaleDateString()} - ${statistics.period.to.toLocaleDateString()} (${statistics.period.days} days)

KEY METRICS:
- Total PRs: ${statistics.pullRequests.total}
- Merged PRs: ${statistics.pullRequests.merged}
- Contributors: ${statistics.contributors.total}
- Average merge time: ${statistics.pullRequests.averageTimeToMerge}h
- Review coverage: ${statistics.trends.reviewCoverage}%

PR BREAKDOWN:
${Object.entries(statistics.pullRequests.byType)
  .filter(([, count]) => count > 0)
  .map(([type, count]) => `- ${type}: ${count}`)
  .join('\n')}

IMPACT DISTRIBUTION:
${Object.entries(statistics.pullRequests.byImpact)
  .filter(([, count]) => count > 0)
  .map(([impact, count]) => `- ${impact}: ${count}`)
  .join('\n')}

TOP CONTRIBUTORS:
${statistics.contributors.topContributors.slice(0, 5)
  .map(c => `- ${c.name}: ${c.prs} PRs, ${c.linesChanged} lines changed`)
  .join('\n')}

Provide insights about development velocity, team collaboration, code quality trends, and notable patterns. Keep the response concise but informative.`;
  }

  /**
   * Build code quality assessment prompt
   */
  private buildCodeQualityPrompt(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string {
    const highRiskPRs = prAnalyses.filter(pr => pr.riskLevel === 'high').length;
    const complexPRs = prAnalyses.filter(pr => pr.complexity === 'complex' || pr.complexity === 'very-complex').length;
    const avgComplexity = prAnalyses.reduce((sum, pr) => {
      const score = { simple: 1, moderate: 2, complex: 3, 'very-complex': 4 }[pr.complexity];
      return sum + score;
    }, 0) / prAnalyses.length;

    return `Assess the code quality based on this repository activity:

QUALITY INDICATORS:
- Review coverage: ${statistics.trends.reviewCoverage}%
- High-risk PRs: ${highRiskPRs}/${prAnalyses.length} (${Math.round(highRiskPRs/prAnalyses.length*100)}%)
- Complex PRs: ${complexPRs}/${prAnalyses.length} (${Math.round(complexPRs/prAnalyses.length*100)}%)
- Average complexity: ${avgComplexity.toFixed(1)}/4
- Average PR size: ${statistics.pullRequests.averageLinesPerPR} lines
- Test-related PRs: ${statistics.pullRequests.byType.test}

CHANGE PATTERNS:
- Breaking changes: ${statistics.pullRequests.byType.breaking}
- Security fixes: ${statistics.pullRequests.byType.security}
- Refactoring: ${statistics.pullRequests.byType.refactor}
- Bug fixes: ${statistics.pullRequests.byType.bugfix}

Evaluate the overall code health, identify quality trends, and highlight areas of concern or improvement. Focus on actionable insights.`;
  }

  /**
   * Build productivity prompt
   */
  private buildProductivityPrompt(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string {
    return `Analyze team productivity and collaboration patterns:

VELOCITY METRICS:
- PR velocity: ${statistics.trends.prVelocity} PRs/day
- Commit velocity: ${statistics.trends.commitVelocity} commits/day
- Code churn: ${statistics.trends.codeChurnRate} lines/day
- Average time to merge: ${statistics.pullRequests.averageTimeToMerge}h

TEAM DYNAMICS:
- Active contributors: ${statistics.contributors.total}
- Top contributor share: ${Math.round((statistics.contributors.topContributors[0]?.prs || 0) / statistics.pullRequests.total * 100)}%
- Collaboration level: ${statistics.pullRequests.averageCommentsPerPR} comments/PR
- Review engagement: ${statistics.trends.reviewCoverage}%

WORK DISTRIBUTION:
${Object.entries(statistics.pullRequests.byAuthor)
  .sort(([,a], [,b]) => b - a)
  .slice(0, 5)
  .map(([author, count]) => `- ${author}: ${count} PRs`)
  .join('\n')}

Provide insights about team efficiency, collaboration quality, potential bottlenecks, and suggestions for improving productivity.`;
  }

  /**
   * Build risk assessment prompt
   */
  private buildRiskAssessmentPrompt(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string {
    return `Assess development risks based on this activity. Respond in JSON format with level, factors, and mitigations:

RISK INDICATORS:
- Breaking changes: ${statistics.pullRequests.byType.breaking}
- High-risk PRs: ${prAnalyses.filter(pr => pr.riskLevel === 'high').length}
- Large PRs (>1000 lines): ${prAnalyses.filter(pr => pr.linesAdded + pr.linesDeleted > 1000).length}
- Low review coverage: ${100 - statistics.trends.reviewCoverage}% unreviewed
- Long merge times: ${prAnalyses.filter(pr => (pr.timeToMerge || 0) > 168).length} PRs > 1 week
- Security-related: ${statistics.pullRequests.byType.security}

Format response as JSON:
{
  "level": "low|medium|high",
  "factors": ["factor1", "factor2"],
  "mitigations": ["mitigation1", "mitigation2"]
}`;
  }

  /**
   * Build recommendations prompt
   */
  private buildRecommendationsPrompt(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string {
    return `Based on this repository activity, provide 3-5 specific actionable recommendations:

CURRENT STATE:
- ${statistics.pullRequests.total} PRs, ${statistics.pullRequests.merged} merged
- ${statistics.trends.reviewCoverage}% review coverage
- ${statistics.pullRequests.averageTimeToMerge}h average merge time
- ${prAnalyses.filter(pr => pr.riskLevel === 'high').length} high-risk PRs
- ${prAnalyses.filter(pr => pr.linesAdded + pr.linesDeleted > 500).length} large PRs

Return as a simple list, one recommendation per line, starting with "- "`;
  }

  /**
   * Build single PR prompt
   */
  private buildSinglePRPrompt(pr: PRAnalysis): string {
    return `Analyze this pull request and provide a concise summary:

PR #${pr.number}: ${pr.title}
Author: ${pr.author}
Type: ${pr.type}
Impact: ${pr.impact}
Complexity: ${pr.complexity}
Risk Level: ${pr.riskLevel}
Changes: +${pr.linesAdded} -${pr.linesDeleted} lines, ${pr.filesChanged} files
Comments: ${pr.comments + pr.reviewComments}
Labels: ${pr.labels.join(', ')}
Description: ${pr.description}

Provide a 2-3 sentence technical summary focusing on the change's significance, potential impact, and any notable aspects.`;
  }

  /**
   * Parse risk assessment response
   */
  private parseRiskAssessmentResponse(response: string): { level: 'low' | 'medium' | 'high'; factors: string[]; mitigations: string[] } {
    try {
      const parsed = JSON.parse(response);
      return {
        level: parsed.level || 'medium',
        factors: Array.isArray(parsed.factors) ? parsed.factors : ['Unable to parse risk factors'],
        mitigations: Array.isArray(parsed.mitigations) ? parsed.mitigations : ['Unable to parse mitigations']
      };
    } catch (error) {
      logger.error('Failed to parse risk assessment response:', error);
      return {
        level: 'medium',
        factors: ['Risk assessment parsing failed'],
        mitigations: ['Manual review recommended']
      };
    }
  }

  /**
   * Parse recommendations list
   */
  private parseRecommendationsList(response: string): string[] {
    const lines = response.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.match(/^\d+\./))
      .map(line => line.replace(/^-\s*/, '').replace(/^\d+\.\s*/, ''));
    
    return lines.length > 0 ? lines : ['No specific recommendations generated'];
  }

  /**
   * Prioritize PRs for AI analysis
   */
  private prioritizePRsForAIAnalysis(prs: PRAnalysis[]): PRAnalysis[] {
    return prs.sort((a, b) => {
      // Priority score based on impact, complexity, and risk
      const scoreA = this.calculatePRPriorityScore(a);
      const scoreB = this.calculatePRPriorityScore(b);
      return scoreB - scoreA;
    });
  }

  /**
   * Calculate PR priority score for AI analysis
   */
  private calculatePRPriorityScore(pr: PRAnalysis): number {
    let score = 0;
    
    // Impact score
    const impactScores = { minor: 1, moderate: 2, major: 3, critical: 4 };
    score += impactScores[pr.impact] || 1;
    
    // Complexity score
    const complexityScores = { simple: 1, moderate: 2, complex: 3, 'very-complex': 4 };
    score += complexityScores[pr.complexity] || 1;
    
    // Risk score
    const riskScores = { low: 1, medium: 2, high: 3 };
    score += riskScores[pr.riskLevel] || 1;
    
    // Type priority
    const typePriority = { breaking: 3, security: 3, feature: 2, bugfix: 2, hotfix: 3 };
    score += typePriority[pr.type as keyof typeof typePriority] || 1;
    
    // Size factor
    const totalLines = pr.linesAdded + pr.linesDeleted;
    if (totalLines > 1000) score += 2;
    else if (totalLines > 500) score += 1;
    
    return score;
  }

  /**
   * Generate rule-based insights (fallback when AI is not available)
   */
  private generateRuleBasedInsights(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): any {
    const highRiskCount = prAnalyses.filter(pr => pr.riskLevel === 'high').length;
    const complexPRCount = prAnalyses.filter(pr => pr.complexity === 'complex' || pr.complexity === 'very-complex').length;
    
    return {
      summary: this.generateRuleBasedSummary(statistics),
      codeQualityAssessment: this.generateRuleBasedCodeQuality(statistics, prAnalyses),
      teamProductivityInsights: this.generateRuleBasedProductivity(statistics),
      riskAssessment: {
        level: highRiskCount > prAnalyses.length * 0.2 ? 'high' : 
               highRiskCount > prAnalyses.length * 0.1 ? 'medium' : 'low',
        factors: this.identifyRiskFactors(statistics, prAnalyses),
        mitigations: this.suggestRiskMitigations(statistics, prAnalyses)
      },
      recommendations: this.generateRuleBasedRecommendations(statistics, prAnalyses),
      provider: 'rule-based',
      model: 'internal-logic',
      generatedAt: new Date()
    };
  }

  /**
   * Generate rule-based summary
   */
  private generateRuleBasedSummary(statistics: DigestStatistics): string {
    const mergeRate = Math.round((statistics.pullRequests.merged / statistics.pullRequests.total) * 100);
    const topType = Object.entries(statistics.pullRequests.byType)
      .sort(([,a], [,b]) => b - a)[0];
    
    return `During the ${statistics.period.days}-day period, ${statistics.pullRequests.total} pull requests were submitted with a ${mergeRate}% merge rate. Development activity was primarily focused on ${topType[0]} work (${topType[1]} PRs). The team maintained ${statistics.trends.reviewCoverage}% review coverage with an average merge time of ${statistics.pullRequests.averageTimeToMerge} hours.`;
  }

  /**
   * Generate rule-based code quality assessment
   */
  private generateRuleBasedCodeQuality(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string {
    const highRiskPercent = Math.round((prAnalyses.filter(pr => pr.riskLevel === 'high').length / prAnalyses.length) * 100);
    const testPRPercent = Math.round((statistics.pullRequests.byType.test / statistics.pullRequests.total) * 100);
    
    let assessment = `Code quality analysis reveals ${statistics.trends.reviewCoverage}% review coverage, indicating `;
    assessment += statistics.trends.reviewCoverage >= 80 ? 'strong peer review practices. ' :
                  statistics.trends.reviewCoverage >= 60 ? 'moderate review engagement. ' :
                  'need for improved review processes. ';
    
    assessment += `${highRiskPercent}% of PRs were classified as high-risk, suggesting `;
    assessment += highRiskPercent > 20 ? 'careful monitoring is needed. ' : 'manageable risk levels. ';
    
    assessment += `Test-related changes comprised ${testPRPercent}% of activity, `;
    assessment += testPRPercent >= 15 ? 'showing good testing discipline.' : 'indicating opportunity for increased test coverage.';
    
    return assessment;
  }

  /**
   * Generate rule-based productivity insights
   */
  private generateRuleBasedProductivity(statistics: DigestStatistics): string {
    const velocity = statistics.trends.prVelocity;
    const topContributorShare = Math.round((statistics.contributors.topContributors[0]?.prs || 0) / statistics.pullRequests.total * 100);
    
    let insights = `Team productivity shows ${velocity.toFixed(1)} PRs per day velocity, indicating `;
    insights += velocity > 3 ? 'high development pace. ' :
                velocity > 1 ? 'active development. ' : 'steady progress. ';
    
    insights += `The top contributor accounts for ${topContributorShare}% of PRs, suggesting `;
    insights += topContributorShare > 50 ? 'concentrated development efforts. ' :
                topContributorShare > 30 ? 'moderate contribution distribution. ' :
                'well-distributed team collaboration.';
    
    return insights;
  }

  /**
   * Generate rule-based PR summary
   */
  private generateRuleBasedPRSummary(pr: PRAnalysis): string {
    const linesChanged = pr.linesAdded + pr.linesDeleted;
    
    let summary = `${pr.type} PR affecting ${pr.filesChanged} files with ${linesChanged} lines changed. `;
    summary += `Classified as ${pr.impact} impact and ${pr.complexity} complexity. `;
    
    if (pr.riskLevel === 'high') {
      summary += 'Requires careful review due to high risk level.';
    } else if (pr.comments + pr.reviewComments > 10) {
      summary += 'Generated significant discussion with active review participation.';
    } else {
      summary += 'Standard change following typical development patterns.';
    }
    
    return summary;
  }

  /**
   * Identify risk factors using rules
   */
  private identifyRiskFactors(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string[] {
    const factors: string[] = [];
    
    if (statistics.trends.reviewCoverage < 70) {
      factors.push('Low review coverage');
    }
    
    if (statistics.pullRequests.byType.breaking > 0) {
      factors.push(`${statistics.pullRequests.byType.breaking} breaking changes`);
    }
    
    const largePRs = prAnalyses.filter(pr => pr.linesAdded + pr.linesDeleted > 1000).length;
    if (largePRs > 0) {
      factors.push(`${largePRs} very large PRs`);
    }
    
    if (statistics.pullRequests.averageTimeToMerge > 168) {
      factors.push('Extended merge times');
    }
    
    return factors.length > 0 ? factors : ['No significant risk factors identified'];
  }

  /**
   * Suggest risk mitigations using rules
   */
  private suggestRiskMitigations(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string[] {
    const mitigations: string[] = [];
    
    if (statistics.trends.reviewCoverage < 70) {
      mitigations.push('Implement mandatory code reviews');
    }
    
    const largePRs = prAnalyses.filter(pr => pr.linesAdded + pr.linesDeleted > 1000).length;
    if (largePRs > 0) {
      mitigations.push('Break large PRs into smaller, focused changes');
    }
    
    if (statistics.pullRequests.averageTimeToMerge > 168) {
      mitigations.push('Establish review time SLAs and automated reminders');
    }
    
    if (statistics.pullRequests.byType.breaking > 0) {
      mitigations.push('Implement additional testing for breaking changes');
    }
    
    return mitigations.length > 0 ? mitigations : ['Continue current development practices'];
  }

  /**
   * Generate rule-based recommendations
   */
  private generateRuleBasedRecommendations(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string[] {
    const recommendations: string[] = [];
    
    if (statistics.trends.reviewCoverage < 80) {
      recommendations.push('Increase code review coverage to improve quality');
    }
    
    if (statistics.pullRequests.byType.test / statistics.pullRequests.total < 0.15) {
      recommendations.push('Increase focus on test-driven development');
    }
    
    const complexPRs = prAnalyses.filter(pr => pr.complexity === 'very-complex').length;
    if (complexPRs > prAnalyses.length * 0.1) {
      recommendations.push('Consider breaking complex PRs into smaller changes');
    }
    
    if (statistics.pullRequests.averageTimeToMerge > 72) {
      recommendations.push('Optimize review process to reduce merge times');
    }
    
    if (statistics.contributors.total < 3) {
      recommendations.push('Encourage broader team participation in code contributions');
    }
    
    return recommendations.length > 0 ? recommendations.slice(0, 5) : 
           ['Maintain current development practices'];
  }

  /**
   * Get AI configuration
   */
  public getConfig(): AIConfig {
    return { ...this.aiConfig };
  }

  /**
   * Update AI configuration
   */
  public updateConfig(updates: Partial<AIConfig>): void {
    this.aiConfig = { ...this.aiConfig, ...updates };
  }

  /**
   * Initialize prompt templates for different summary styles
   */
  private initializePromptTemplates(): Map<SummaryStyle, PromptTemplate> {
    const templates = new Map<SummaryStyle, PromptTemplate>();

    templates.set('concise', {
      name: 'Concise Technical',
      style: 'concise',
      description: 'Brief, structured technical summary with clear sections for sidebar navigation',
      systemPrompt: 'You are a senior software engineer writing a concise technical digest for developers. Write in a factual, professional tone like a technical report. Focus on actual repository activity and concrete changes. Always create clear subtitles using HTML <h2> headers with appropriate emojis for main sections.',
      userPromptTemplate: `Create a concise technical summary of this repository activity:

REPOSITORY: {{repositoryName}}
PERIOD: {{dateRange}} ({{dayCount}} days)

KEY METRICS:
- {{totalPRs}} PRs ({{mergedPRs}} merged, {{mergeRate}}% success rate)
- {{contributorCount}} contributors
- {{totalLinesChanged}} lines changed
- Average merge time: {{avgMergeTime}} hours

TOP CHANGES:
{{topChanges}}

WRITING REQUIREMENTS:
- Write exactly like a technical report about this repository
- Use HTML <h2> headers with emojis for main sections (e.g., <h2>📈 Development Activity</h2>, <h2>🔧 Key Changes</h2>, <h2>👥 Team Performance</h2>)
- Use appropriate technical report emojis: 📊 for metrics, 🚀 for deployments, 🐛 for bugs, ⚡ for performance, 🔒 for security, etc.
- Keep each section 1-2 sentences maximum in <p> tags
- Focus ONLY on what actually happened in the repository
- Mention specific PR numbers, contributor names, and technical details
- No creative storytelling - stick to facts about the codebase
- Total length: 3-4 short paragraphs maximum
- Structure: Development overview, notable changes, team metrics
- Use HTML formatting throughout (no markdown)`,
      tags: ['technical', 'brief', 'metrics', 'structured'],
    });

    templates.set('frontend', {
      name: 'Frontend Focused',
      style: 'frontend',
      description: 'Technical analysis focused on UI/UX and frontend changes with clear section headers',
      systemPrompt: 'You are a frontend technical lead writing a digest about UI/UX and frontend development activity. Write like a technical report specifically focused on user-facing changes and frontend architecture. Always use HTML <h2> headers with appropriate emojis for main sections to enable sidebar navigation. Focus on concrete frontend changes in the repository.',
      userPromptTemplate: `Analyze this repository activity from a frontend development perspective:

REPOSITORY: {{repositoryName}}
PERIOD: {{dateRange}} ({{dayCount}} days)

ACTIVITY SUMMARY:
- {{totalPRs}} PRs with {{frontendPRs}} likely frontend-related
- {{contributorCount}} contributors
- Total changes: {{totalLinesChanged}} lines

TOP FRONTEND CHANGES:
{{frontendChanges}}

WRITING REQUIREMENTS:
- Write like a technical report about frontend/UI changes
- Use HTML <h2> headers with emojis for sections (e.g., <h2>🎨 UI/UX Updates</h2>, <h2>🏗️ Frontend Architecture</h2>, <h2>✨ User Experience Improvements</h2>)
- Use frontend-focused emojis: 🎨 for design, 📱 for mobile, 💻 for desktop, 🚀 for performance, ♿ for accessibility, 🎭 for animations, etc.
- Focus specifically on user-facing changes, component updates, styling modifications in <p> tags
- Mention specific files, components, or UI elements that were changed
- Highlight performance improvements, accessibility updates, or design system changes
- Include actual impact on users and developers
- Keep technical and factual - no dramatic language
- Structure: Frontend changes overview, specific UI updates, architecture improvements
- Total length: 4-5 paragraphs maximum
- Use HTML formatting throughout (no markdown)`,
      tags: ['frontend', 'ui', 'ux', 'user-facing', 'technical'],
    });

    templates.set('engaging-story', {
      name: 'Technical Journal',
      style: 'engaging-story',
      description: 'Engaging but factual technical reporting about repository development activity',
      systemPrompt: 'You are a technical journalist writing an engaging but factual article about software development activity. Write like a technical report with engaging language covering this repository. Use engaging language but focus entirely on what actually happened in the codebase. Always use HTML <h2> headers with appropriate emojis for main sections. No overly dramatic storytelling - keep it professional and repository-focused.',
      userPromptTemplate: `Write an engaging technical article about this development period:

REPOSITORY: {{repositoryName}}
REPORTING PERIOD: {{dateRange}} ({{dayCount}} days)

DEVELOPMENT ACTIVITY:
- {{totalPRs}} pull requests submitted ({{mergedPRs}} merged successfully)
- {{contributorCount}} developers contributed
- {{totalLinesChanged}} lines of code changed
- Top contributors: {{topContributors}}

KEY DEVELOPMENT CHANGES:
{{topChanges}}

WRITING REQUIREMENTS:
- Write like an engaging technical report about software development
- Use HTML <h2> headers with emojis for sections (e.g., <h2>🚀 Development Highlights</h2>, <h2>💻 Code Changes</h2>, <h2>👥 Team Activity</h2>)
- Use engaging technical emojis: 🚀 for launches, 💻 for code, 🔬 for research, 🎯 for goals, 🏆 for achievements, ⚡ for improvements, etc.
- Engaging but professional tone - like TechCrunch or Ars Technica covering this repo
- Focus on the technical work that was accomplished
- Mention specific contributors, PR numbers, and code changes in <p> tags
- Describe the impact of changes on the codebase and users
- No dramatic storylines - focus on the actual development work
- Include what challenges were solved and features added
- Structure: Development overview, major changes, team contributions, impact
- Total length: 4-6 paragraphs maximum
- Use HTML formatting throughout (no markdown)`,
      tags: ['technical-journalism', 'engaging', 'factual', 'professional'],
    });

    templates.set('executive', {
      name: 'Executive Summary',
      style: 'executive',
      description: 'Business-focused summary with clear metrics and strategic insights for leadership',
      systemPrompt: 'You are writing an executive brief for business leaders and stakeholders. Focus entirely on business outcomes, team productivity, and strategic insights. Use business language, avoid technical jargon. Always use HTML <h2> headers with appropriate business emojis for clear section organization. Present concrete results and actionable insights.',
      userPromptTemplate: `Provide an executive summary of development activity:

BUSINESS CONTEXT:
Repository: {{repositoryName}}
Reporting Period: {{dateRange}} ({{dayCount}} days)

PRODUCTIVITY METRICS:
- Development Velocity: {{totalPRs}} changes delivered ({{mergeRate}}% success rate)
- Team Performance: {{contributorCount}} active contributors
- Code Quality: {{reviewCoverage}}% review coverage
- Delivery Speed: {{avgMergeTime}} hours average merge time

BUSINESS IMPACT:
- Features delivered: {{featureCount}}
- Issues resolved: {{bugfixCount}}
- Security/maintenance: {{maintenanceCount}}

WRITING REQUIREMENTS:
- Write like a business report for executives and stakeholders
- Use HTML <h2> headers with business emojis for sections (e.g., <h2>📈 Development Performance</h2>, <h2>🎯 Business Deliverables</h2>, <h2>👥 Team Productivity</h2>, <h2>💡 Strategic Recommendations</h2>)
- Use business-focused emojis: 📊 for metrics, 💰 for cost savings, ⚡ for efficiency, 🎯 for goals, 📈 for growth, 🏆 for achievements, etc.
- Focus on business value delivered and operational metrics in <p> tags
- Translate technical activity into business outcomes
- Mention cost savings, efficiency gains, customer impact where relevant
- Include quantifiable results and percentage improvements
- Address any risks or concerns from a business perspective
- Provide 2-3 strategic recommendations for leadership
- Use business terminology - "deliverables" not "PRs", "productivity" not "commits"
- Structure: Performance overview, business value delivered, team efficiency, strategic outlook
- Total length: 4-5 paragraphs maximum
- Use HTML formatting throughout (no markdown)`,
      tags: ['executive', 'business', 'leadership', 'strategic'],
    });

    templates.set('technical', {
      name: 'Technical Deep Dive',
      style: 'technical',
      description: 'Comprehensive technical analysis with architectural insights and code quality assessment',
      systemPrompt: 'You are a senior technical architect writing a detailed analysis for engineering teams. Focus on architectural patterns, code quality metrics, technical challenges, and engineering best practices. Use HTML <h2> headers with appropriate technical emojis for clear organization. Write like a technical lead analyzing the codebase and development patterns.',
      userPromptTemplate: `Provide a technical deep dive analysis:

TECHNICAL OVERVIEW:
Repository: {{repositoryName}}
Analysis Period: {{dateRange}} ({{dayCount}} days)

CODE ANALYSIS:
- {{totalPRs}} pull requests with {{totalLinesChanged}} lines changed
- Complexity distribution: {{complexityBreakdown}}
- Review coverage: {{reviewCoverage}}%
- Average merge time: {{avgMergeTime}} hours

DEVELOPMENT ACTIVITY:
{{topChanges}}

WRITING REQUIREMENTS:
- Write like a senior technical architect's analysis for engineering teams
- Use HTML <h2> headers with technical emojis for sections (e.g., <h2>🔍 Code Quality Analysis</h2>, <h2>🏗️ Architectural Changes</h2>, <h2>⚙️ Development Patterns</h2>, <h2>💡 Technical Recommendations</h2>)
- Use technical emojis: 🔍 for analysis, 🏗️ for architecture, ⚙️ for systems, 🧪 for testing, 📊 for metrics, 🔒 for security, ⚡ for performance, etc.
- Focus on technical debt, code patterns, and architectural implications in <p> tags
- Analyze development practices and code review effectiveness
- Discuss specific technical challenges and how they were addressed
- Mention testing patterns, refactoring efforts, and performance improvements
- Include concrete technical recommendations for the engineering team
- Discuss impact on system architecture and maintainability
- Analyze complexity trends and code health metrics
- Address any technical risks and suggest mitigation strategies
- Structure: Technical overview, architectural analysis, code quality assessment, development practices evaluation, technical recommendations
- Total length: 5-7 paragraphs with technical depth
- Use HTML formatting throughout (no markdown)`,
      tags: ['technical', 'architecture', 'engineering', 'analysis'],
    });

    return templates;
  }

  /**
   * Generate narrative summary using specified style
   */
  public async generateNarrativeSummary(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[],
    style: SummaryStyle = 'concise',
    customPrompt?: string
  ): Promise<string> {
    if (!this.isAIEnabled()) {
      logger.info('AI integration disabled, using rule-based narrative summary');
      return this.generateRuleBasedNarrativeSummary(statistics, prAnalyses, style);
    }

    try {
      logger.info({ style, hasCustomPrompt: !!customPrompt }, 'Generating AI narrative summary');

      const template = style === 'custom' && customPrompt 
        ? this.createCustomTemplate(customPrompt)
        : this.promptTemplates.get(style);

      if (!template) {
        throw new Error(`Unknown summary style: ${style}`);
      }

      const prompt = this.buildNarrativePrompt(statistics, prAnalyses, template);
      const summary = await this.callAI(prompt, template.systemPrompt);

      logger.info('Narrative summary generated successfully');
      return summary;

    } catch (error) {
      logger.error({ error, style }, 'Narrative summary generation failed, falling back to rule-based');
      return this.generateRuleBasedNarrativeSummary(statistics, prAnalyses, style);
    }
  }

  /**
   * Get available prompt templates
   */
  public getPromptTemplates(): PromptTemplate[] {
    return Array.from(this.promptTemplates.values());
  }

  /**
   * Get specific prompt template
   */
  public getPromptTemplate(style: SummaryStyle): PromptTemplate | undefined {
    return this.promptTemplates.get(style);
  }

  /**
   * Validate custom prompt
   */
  public validateCustomPrompt(prompt: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!prompt || prompt.trim().length < 50) {
      errors.push('Prompt must be at least 50 characters long');
    }

    if (prompt.length > 2000) {
      errors.push('Prompt must be less than 2000 characters');
    }

    // Check for basic template variables
    const requiredContext = ['repository', 'period', 'activity'];
    const hasContext = requiredContext.some(context => 
      prompt.toLowerCase().includes(context)
    );

    if (!hasContext) {
      errors.push('Prompt should reference repository activity or development period');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create custom template from user prompt
   */
  private createCustomTemplate(customPrompt: string): PromptTemplate {
    return {
      name: 'Custom',
      style: 'custom',
      description: 'User-defined custom prompt',
      systemPrompt: 'You are a technical writer creating a development digest based on the user\'s specific requirements. Follow their instructions while maintaining accuracy and readability.',
      userPromptTemplate: customPrompt,
      tags: ['custom', 'user-defined'],
    };
  }

  /**
   * Build narrative prompt from template and data
   */
  private buildNarrativePrompt(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[],
    template: PromptTemplate
  ): string {
    const variables = this.extractTemplateVariables(statistics, prAnalyses);
    
    let prompt = template.userPromptTemplate;
    
    // Replace template variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      prompt = prompt.replace(regex, value);
    }

    return prompt;
  }

  /**
   * Extract variables for template replacement
   */
  private extractTemplateVariables(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[]
  ): Record<string, string> {
    const mergeRate = Math.round((statistics.pullRequests.merged / statistics.pullRequests.total) * 100);
    const totalLinesChanged = statistics.commits.totalAdditions + statistics.commits.totalDeletions;

    // Categorize PRs by type for frontend focus
    const frontendKeywords = ['ui', 'ux', 'frontend', 'component', 'style', 'css', 'react', 'vue', 'angular'];
    const frontendPRs = prAnalyses.filter(pr => 
      frontendKeywords.some(keyword => 
        pr.title.toLowerCase().includes(keyword) || 
        pr.labels.some(label => label.toLowerCase().includes(keyword))
      )
    ).length;

    return {
      repositoryName: statistics.repository.name,
      dateRange: `${statistics.period.from.toLocaleDateString()} - ${statistics.period.to.toLocaleDateString()}`,
      dayCount: statistics.period.days.toString(),
      totalPRs: statistics.pullRequests.total.toString(),
      mergedPRs: statistics.pullRequests.merged.toString(),
      mergeRate: mergeRate.toString(),
      contributorCount: statistics.contributors.total.toString(),
      totalLinesChanged: totalLinesChanged.toLocaleString(),
      avgMergeTime: Math.round(statistics.pullRequests.averageTimeToMerge).toString(),
      reviewCoverage: Math.round(statistics.trends.reviewCoverage).toString(),
      frontendPRs: frontendPRs.toString(),
      featureCount: statistics.pullRequests.byType.feature.toString(),
      bugfixCount: statistics.pullRequests.byType.bugfix.toString(),
      maintenanceCount: (statistics.pullRequests.byType.chore + statistics.pullRequests.byType.refactor).toString(),
      techDebtWork: statistics.pullRequests.byType.refactor.toString(),
      riskLevel: this.assessOverallRisk(prAnalyses),
      topContributors: statistics.contributors.topContributors
        .slice(0, 3)
        .map(c => c.name)
        .join(', '),
      topChanges: this.summarizeTopChanges(prAnalyses.slice(0, 5)),
      frontendChanges: this.summarizeFrontendChanges(prAnalyses.filter(pr => 
        frontendKeywords.some(keyword => 
          pr.title.toLowerCase().includes(keyword) || 
          pr.labels.some(label => label.toLowerCase().includes(keyword))
        )
      ).slice(0, 3)),
      developmentJourney: this.createDevelopmentJourney(statistics, prAnalyses),
      complexityBreakdown: this.createComplexityBreakdown(statistics),
    };
  }

  /**
   * Generate rule-based narrative summary (fallback)
   */
  private generateRuleBasedNarrativeSummary(
    statistics: DigestStatistics,
    prAnalyses: PRAnalysis[],
    style: SummaryStyle
  ): string {
    const mergeRate = Math.round((statistics.pullRequests.merged / statistics.pullRequests.total) * 100);
    
    switch (style) {
      case 'engaging-story':
        return `Over ${statistics.period.days} days, the ${statistics.repository.name} repository witnessed ${statistics.pullRequests.total} pull requests from ${statistics.contributors.total} developers. With a ${mergeRate}% merge rate, the team successfully integrated ${statistics.pullRequests.merged} changes into the codebase. The development journey featured ${statistics.pullRequests.byType.feature} new features, ${statistics.pullRequests.byType.bugfix} bug fixes, and significant contributions from ${statistics.contributors.topContributors[0]?.name}, who led the effort with ${statistics.contributors.topContributors[0]?.prs} pull requests.`;
      
      case 'executive':
        return `Development team delivered ${statistics.pullRequests.merged} changes with ${mergeRate}% success rate over ${statistics.period.days} days. Team productivity remained strong with ${statistics.contributors.total} active contributors and ${Math.round(statistics.trends.reviewCoverage)}% code review coverage. Key deliverables included ${statistics.pullRequests.byType.feature} features and ${statistics.pullRequests.byType.bugfix} issue resolutions, maintaining development velocity at ${statistics.trends.prVelocity.toFixed(1)} PRs per day.`;
      
      case 'frontend':
        const frontendPRs = prAnalyses.filter(pr => 
          ['ui', 'ux', 'frontend', 'component'].some(keyword => 
            pr.title.toLowerCase().includes(keyword)
          )
        ).length;
        return `Frontend development activity included ${frontendPRs} UI/UX-focused changes out of ${statistics.pullRequests.total} total PRs. The team maintained strong collaboration with ${statistics.contributors.total} contributors and ${Math.round(statistics.trends.reviewCoverage)}% review coverage. Key areas of focus included user interface improvements, component updates, and frontend architecture enhancements.`;
      
      case 'technical':
        return `Technical analysis reveals ${statistics.pullRequests.total} pull requests with ${(statistics.commits.totalAdditions + statistics.commits.totalDeletions).toLocaleString()} lines changed across ${statistics.files.totalChanged} files. Code complexity distribution shows ${Math.round(prAnalyses.filter(pr => pr.complexity === 'complex' || pr.complexity === 'very-complex').length / prAnalyses.length * 100)}% complex changes. Review coverage at ${Math.round(statistics.trends.reviewCoverage)}% indicates solid engineering practices with average merge time of ${Math.round(statistics.pullRequests.averageTimeToMerge)} hours.`;
      
      default: // 'concise'
        return `Repository activity summary: ${statistics.pullRequests.total} PRs submitted (${mergeRate}% merged) by ${statistics.contributors.total} contributors over ${statistics.period.days} days. Primary focus on ${Object.entries(statistics.pullRequests.byType).sort(([,a], [,b]) => b - a)[0][0]} work with ${Math.round(statistics.trends.reviewCoverage)}% review coverage and ${Math.round(statistics.pullRequests.averageTimeToMerge)}h average merge time.`;
    }
  }

  /**
   * Helper methods for template variable extraction
   */
  private assessOverallRisk(prAnalyses: PRAnalysis[]): string {
    const highRisk = prAnalyses.filter(pr => pr.riskLevel === 'high').length;
    const riskPercentage = (highRisk / prAnalyses.length) * 100;
    
    if (riskPercentage > 20) return 'high';
    if (riskPercentage > 10) return 'medium';
    return 'low';
  }

  private summarizeTopChanges(prs: PRAnalysis[]): string {
    return prs.map(pr => 
      `- ${pr.title} (${pr.impact} impact, +${pr.linesAdded}/-${pr.linesDeleted} lines)`
    ).join('\n');
  }

  private summarizeFrontendChanges(prs: PRAnalysis[]): string {
    if (prs.length === 0) return 'No specific frontend changes identified';
    
    return prs.map(pr => 
      `- ${pr.title} by ${pr.author}`
    ).join('\n');
  }

  private createDevelopmentJourney(statistics: DigestStatistics, prAnalyses: PRAnalysis[]): string {
    const biggestPR = prAnalyses.reduce((max, pr) => 
      (pr.linesAdded + pr.linesDeleted) > (max.linesAdded + max.linesDeleted) ? pr : max
    );
    
    return `The development journey began with ${statistics.pullRequests.total} proposed changes. The team tackled challenges including the significant ${biggestPR.title} PR which touched ${biggestPR.linesAdded + biggestPR.linesDeleted} lines. Through collaborative review processes, ${statistics.pullRequests.merged} changes successfully made it to production.`;
  }

  private createComplexityBreakdown(statistics: DigestStatistics): string {
    const total = Object.values(statistics.pullRequests.byComplexity).reduce((a, b) => a + b, 0);
    return Object.entries(statistics.pullRequests.byComplexity)
      .map(([complexity, count]) => `${complexity}: ${count} (${Math.round(count/total*100)}%)`)
      .join(', ');
  }
}