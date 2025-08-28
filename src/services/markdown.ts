import { DigestContent, DigestOptions, PRAnalysis, DigestStatistics } from '../types/digest';
import { logger } from '../lib/logger';

/**
 * Markdown Processing Service
 * 
 * Converts digest content to formatted Markdown and HTML.
 * Supports customizable templates, styling, and output formats.
 */
export class MarkdownService {
  private readonly emojiMap: Record<string, string> = {
    feature: '✨',
    bugfix: '🐛',
    hotfix: '🚨',
    refactor: '♻️',
    docs: '📚',
    test: '🧪',
    chore: '🔧',
    breaking: '💥',
    security: '🔒',
    performance: '⚡',
    other: '📦',
    high: '🔴',
    medium: '🟡',
    low: '🟢',
    merged: '✅',
    closed: '❌',
    draft: '📝'
  };

  /**
   * Convert digest content to Markdown format
   */
  public async generateMarkdown(content: DigestContent): Promise<string> {
    try {
      logger.info('Converting digest content to Markdown');
      
      const sections: string[] = [];

      // Header
      sections.push(this.generateHeader(content));
      
      // Executive Summary
      sections.push(this.generateExecutiveSummaryMarkdown(content.executive));
      
      // Key Metrics
      sections.push(this.generateKeyMetricsMarkdown(content.executive.keyMetrics));
      
      // Pull Requests Section
      sections.push(this.generatePullRequestsMarkdown(content.sections.pullRequests, content.metadata.options));
      
      // Contributors Section
      sections.push(this.generateContributorsMarkdown(content.sections.contributors));
      
      // Code Health Section
      sections.push(this.generateCodeHealthMarkdown(content.sections.codeHealth));
      
      // Statistics Section
      sections.push(this.generateStatisticsMarkdown(content.sections.statistics));
      
      // Trends Section
      sections.push(this.generateTrendsMarkdown(content.sections.trends));
      
      // AI Insights (if available)
      if (content.aiInsights) {
        sections.push(this.generateAIInsightsMarkdown(content.aiInsights));
      }
      
      // Footer
      sections.push(this.generateFooter(content));

      return sections.join('\n\n');
    } catch (error) {
      logger.error('Error generating Markdown:', error);
      throw error;
    }
  }

  /**
   * Convert Markdown to HTML
   */
  public async markdownToHtml(markdown: string, options?: { theme?: string; includeStyles?: boolean }): Promise<string> {
    try {
      logger.info('Converting Markdown to HTML');
      
      // Basic Markdown to HTML conversion
      let html = this.convertBasicMarkdown(markdown);
      
      // Add styling if requested
      if (options?.includeStyles) {
        html = this.wrapWithStyles(html, options.theme || 'default');
      }

      return html;
    } catch (error) {
      logger.error('Error converting Markdown to HTML:', error);
      throw error;
    }
  }

  /**
   * Generate digest header
   */
  private generateHeader(content: DigestContent): string {
    const { metadata } = content;
    const period = `${metadata.period.from.toLocaleDateString()} - ${metadata.period.to.toLocaleDateString()}`;
    
    const useEmojis = metadata.options.outputPreferences?.includeEmojis !== false;
    
    return `# ${useEmojis ? '📊 ' : ''}Development Digest

**Repository:** ${metadata.repository}  
**Period:** ${period}  
**Generated:** ${metadata.generatedAt.toLocaleString()}  

---`;
  }

  /**
   * Generate executive summary section
   */
  private generateExecutiveSummaryMarkdown(executive: DigestContent['executive']): string {
    const summary = executive.summary;
    const highlights = executive.highlights.map(h => `- ${h}`).join('\n');
    
    return `## 📋 Executive Summary

${summary}

### Key Highlights
${highlights}`;
  }

  /**
   * Generate key metrics section
   */
  private generateKeyMetricsMarkdown(metrics: DigestContent['executive']['keyMetrics']): string {
    return `## 📈 Key Metrics

| Metric | Value |
|--------|-------|
| Total Pull Requests | ${metrics.totalPRs} |
| Merged Pull Requests | ${metrics.mergedPRs} |
| Active Contributors | ${metrics.activeContributors} |
| Average Time to Merge | ${metrics.averageTimeToMerge}h |`;
  }

  /**
   * Generate pull requests section
   */
  private generatePullRequestsMarkdown(
    pullRequests: DigestContent['sections']['pullRequests'],
    options: DigestOptions
  ): string {
    const useEmojis = options.outputPreferences?.includeEmojis !== false;
    
    let section = `## ${useEmojis ? '🔄 ' : ''}Pull Requests

${pullRequests.summary}

### Featured Pull Requests

`;

    // Featured PRs table
    if (pullRequests.featured.length > 0) {
      section += `| PR | Title | Type | Impact | Author | Lines Changed |\n`;
      section += `|----|-------|------|---------|--------|---------------|\n`;
      
      pullRequests.featured.forEach(pr => {
        const emoji = useEmojis ? this.emojiMap[pr.type] || '' : '';
        const linesChanged = pr.linesAdded + pr.linesDeleted;
        section += `| #${pr.number} | ${pr.title} | ${emoji} ${pr.type} | ${pr.impact} | ${pr.author} | ${linesChanged} |\n`;
      });
    }

    // PR breakdown by type
    section += `\n### Breakdown by Type\n\n`;
    Object.entries(pullRequests.byType).forEach(([type, prs]) => {
      if (prs.length > 0) {
        const emoji = useEmojis ? this.emojiMap[type] || '' : '';
        section += `**${emoji} ${type.charAt(0).toUpperCase() + type.slice(1)}** (${prs.length})\n`;
        
        if (options.detailLevel === 'detailed' || options.detailLevel === 'comprehensive') {
          prs.slice(0, 5).forEach(pr => {
            section += `- #${pr.number}: ${pr.title} (${pr.author})\n`;
          });
        }
        section += '\n';
      }
    });

    return section;
  }

  /**
   * Generate contributors section
   */
  private generateContributorsMarkdown(contributors: DigestContent['sections']['contributors']): string {
    let section = `## 👥 Contributors

${contributors.summary}

### Top Contributors

| Contributor | PRs | Commits | Lines Changed | Highlights |
|-------------|-----|---------|---------------|------------|
`;

    contributors.topContributors.forEach(contributor => {
      const highlights = contributor.highlights.join(', ');
      section += `| ${contributor.name} | ${contributor.metrics.prs} | ${contributor.metrics.commits} | ${contributor.metrics.linesChanged} | ${highlights} |\n`;
    });

    if (contributors.newContributors.length > 0) {
      section += `\n### New Contributors 🎉\n`;
      contributors.newContributors.forEach(name => {
        section += `- ${name}\n`;
      });
    }

    return section;
  }

  /**
   * Generate code health section
   */
  private generateCodeHealthMarkdown(codeHealth: DigestContent['sections']['codeHealth']): string {
    let section = `## 🏥 Code Health

${codeHealth.summary}

### Health Metrics

| Metric | Value |
|--------|-------|
| Code Churn Rate | ${codeHealth.metrics.codeChurn} lines/day |
| Review Coverage | ${codeHealth.metrics.reviewCoverage}% |
| Average Complexity | ${codeHealth.metrics.averageComplexity}/4 |
`;

    if (codeHealth.metrics.testCoverage !== undefined) {
      section += `| Test Coverage | ${codeHealth.metrics.testCoverage}% |\n`;
    }

    if (codeHealth.concerns.length > 0) {
      section += `\n### ⚠️ Areas of Concern\n\n`;
      codeHealth.concerns.forEach(concern => {
        section += `- ${concern}\n`;
      });
    }

    if (codeHealth.improvements.length > 0) {
      section += `\n### ✅ Positive Developments\n\n`;
      codeHealth.improvements.forEach(improvement => {
        section += `- ${improvement}\n`;
      });
    }

    return section;
  }

  /**
   * Generate statistics section
   */
  private generateStatisticsMarkdown(statistics: DigestStatistics): string {
    let section = `## 📊 Detailed Statistics

### Pull Request Distribution

`;

    // PR type distribution chart
    const prTypes = Object.entries(statistics.pullRequests.byType)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a);

    if (prTypes.length > 0) {
      section += this.generateTextBarChart(prTypes, 'PR Types');
    }

    // Impact distribution
    const impacts = Object.entries(statistics.pullRequests.byImpact)
      .filter(([, count]) => count > 0);

    if (impacts.length > 0) {
      section += '\n\n' + this.generateTextBarChart(impacts, 'Impact Levels');
    }

    // File changes
    section += `\n\n### File Changes

- **Total Files Changed:** ${statistics.files.totalChanged}
- **Language Breakdown:**
`;

    Object.entries(statistics.files.languageBreakdown).forEach(([lang, lines]) => {
      section += `  - ${lang}: ${lines} lines\n`;
    });

    return section;
  }

  /**
   * Generate trends section
   */
  private generateTrendsMarkdown(trends: DigestContent['sections']['trends']): string {
    let section = `## 📈 Trends & Analysis

${trends.summary}

### Velocity Metrics

\`\`\`
PR Velocity:      ${trends.comparisons.previousPeriod.prCount} PRs/period
Commit Velocity:  ${trends.comparisons.previousPeriod.commitCount} commits/period
Contributors:     ${trends.comparisons.previousPeriod.contributorCount} active
Change Rate:      ${trends.comparisons.previousPeriod.changePercent >= 0 ? '+' : ''}${trends.comparisons.previousPeriod.changePercent}%
\`\`\`

### Insights & Predictions

`;

    trends.predictions.forEach(prediction => {
      section += `- ${prediction}\n`;
    });

    return section;
  }

  /**
   * Generate AI insights section
   */
  private generateAIInsightsMarkdown(aiInsights: any): string {
    let section = `## 🤖 AI-Powered Insights

${aiInsights.summary}

### Code Quality Assessment
${aiInsights.codeQualityAssessment}

### Team Productivity Insights
${aiInsights.teamProductivityInsights}

### Recommendations
`;

    aiInsights.recommendations.forEach((rec: string) => {
      section += `- ${rec}\n`;
    });

    section += `\n### Risk Assessment
**Level:** ${aiInsights.riskAssessment.level.toUpperCase()}

**Risk Factors:**
`;
    aiInsights.riskAssessment.factors.forEach((factor: string) => {
      section += `- ${factor}\n`;
    });

    if (aiInsights.riskAssessment.mitigations.length > 0) {
      section += `\n**Recommended Mitigations:**\n`;
      aiInsights.riskAssessment.mitigations.forEach((mitigation: string) => {
        section += `- ${mitigation}\n`;
      });
    }

    return section;
  }

  /**
   * Generate text bar chart
   */
  private generateTextBarChart(data: Array<[string, number]>, title: string): string {
    const maxValue = Math.max(...data.map(([, value]) => value));
    const maxBarLength = 20;

    let chart = `**${title}**\n\n\`\`\`\n`;

    data.forEach(([label, value]) => {
      const barLength = Math.round((value / maxValue) * maxBarLength);
      const bar = '█'.repeat(barLength) + '░'.repeat(maxBarLength - barLength);
      chart += `${label.padEnd(15)} ${bar} ${value}\n`;
    });

    chart += '```';
    return chart;
  }

  /**
   * Generate footer
   */
  private generateFooter(content: DigestContent): string {
    return `---

*Generated by Daily Dev Digest v${content.metadata.version} on ${content.metadata.generatedAt.toLocaleString()}*

### Methodology
${content.appendix.methodology}

### Limitations
${content.appendix.limitations.map(l => `- ${l}`).join('\n')}`;
  }

  /**
   * Basic Markdown to HTML conversion
   */
  private convertBasicMarkdown(markdown: string): string {
    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Inline code
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');

    // Lists
    html = html.replace(/^\- (.*$)/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');

    // Tables
    html = this.convertTables(html);

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Line breaks
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    
    // Wrap in paragraphs
    html = '<p>' + html + '</p>';

    // Clean up empty paragraphs
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p>(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');

    return html;
  }

  /**
   * Convert Markdown tables to HTML
   */
  private convertTables(html: string): string {
    const tableRegex = /\|(.+)\|\n\|(.+)\|\n((?:\|.+\|\n?)*)/g;
    
    return html.replace(tableRegex, (match, headers, separator, rows) => {
      const headerCells = headers.split('|').map((cell: string) => 
        `<th>${cell.trim()}</th>`).join('');
      
      const rowCells = rows.trim().split('\n').map((row: string) =>
        '<tr>' + row.split('|').map((cell: string) => 
          `<td>${cell.trim()}</td>`).join('') + '</tr>'
      ).join('');
      
      return `<table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${rowCells}</tbody>
      </table>`;
    });
  }

  /**
   * Wrap HTML with styling
   */
  private wrapWithStyles(html: string, theme: string): string {
    const styles = this.getThemeStyles(theme);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Development Digest</title>
    <style>
        ${styles}
    </style>
</head>
<body>
    <div class="digest-container">
        ${html}
    </div>
</body>
</html>`;
  }

  /**
   * Get theme-specific CSS styles
   */
  private getThemeStyles(theme: string): string {
    const baseStyles = `
      .digest-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #333;
      }
      
      h1, h2, h3 {
        color: #2c3e50;
        border-bottom: 2px solid #eee;
        padding-bottom: 10px;
      }
      
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
      }
      
      th, td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #ddd;
      }
      
      th {
        background-color: #f5f5f5;
        font-weight: 600;
      }
      
      pre {
        background-color: #f8f9fa;
        padding: 15px;
        border-radius: 5px;
        overflow-x: auto;
      }
      
      code {
        background-color: #f1f3f4;
        padding: 2px 4px;
        border-radius: 3px;
        font-family: 'Monaco', 'Consolas', monospace;
      }
      
      ul, ol {
        margin: 10px 0;
        padding-left: 30px;
      }
    `;

    const darkThemeStyles = `
      .digest-container {
        background-color: #1a1a1a;
        color: #e0e0e0;
      }
      
      h1, h2, h3 {
        color: #58a6ff;
        border-bottom-color: #30363d;
      }
      
      th {
        background-color: #21262d;
      }
      
      th, td {
        border-bottom-color: #30363d;
      }
      
      pre {
        background-color: #0d1117;
        border: 1px solid #30363d;
      }
      
      code {
        background-color: #21262d;
        color: #e6edf3;
      }
    `;

    switch (theme) {
      case 'dark':
        return baseStyles + darkThemeStyles;
      case 'corporate':
        return baseStyles + `
          .digest-container {
            font-family: 'Times New Roman', serif;
          }
          h1, h2, h3 {
            color: #003d6b;
          }
        `;
      default:
        return baseStyles;
    }
  }

  /**
   * Generate summary for different channels (email, Slack, etc.)
   */
  public async generateChannelSummary(
    content: DigestContent,
    channel: 'email' | 'slack' | 'web'
  ): Promise<string> {
    const { executive, metadata } = content;
    
    switch (channel) {
      case 'slack':
        return this.generateSlackSummary(executive, metadata);
      case 'email':
        return await this.generateEmailSummary(content);
      default:
        return await this.generateMarkdown(content);
    }
  }

  /**
   * Generate Slack-formatted summary
   */
  private generateSlackSummary(
    executive: DigestContent['executive'],
    metadata: DigestContent['metadata']
  ): string {
    const period = `${metadata.period.from.toLocaleDateString()} - ${metadata.period.to.toLocaleDateString()}`;
    
    let summary = `*📊 Development Digest - ${metadata.repository}*\n`;
    summary += `*Period:* ${period}\n\n`;
    
    summary += `*Key Metrics:*\n`;
    summary += `• PRs: ${executive.keyMetrics.totalPRs} total, ${executive.keyMetrics.mergedPRs} merged\n`;
    summary += `• Contributors: ${executive.keyMetrics.activeContributors}\n`;
    summary += `• Avg merge time: ${executive.keyMetrics.averageTimeToMerge}h\n\n`;
    
    summary += `*Highlights:*\n`;
    executive.highlights.slice(0, 3).forEach(highlight => {
      summary += `• ${highlight}\n`;
    });
    
    return summary;
  }

  /**
   * Generate email-formatted summary
   */
  private async generateEmailSummary(content: DigestContent): Promise<string> {
    // For email, we'd typically generate a more comprehensive HTML version
    // This is a simplified version
    return await this.generateMarkdown(content);
  }
}