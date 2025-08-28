import { DigestTemplate, DigestContent, TemplateVariables, TemplateFunction } from '../types/digest';
import { logger } from '../lib/logger';

/**
 * Template System Service
 * 
 * Provides customizable digest templates with:
 * - Variable substitution
 * - Multiple output formats
 * - Responsive design
 * - Personalization options
 */
export class TemplateService {
  private templates: Map<string, DigestTemplate> = new Map();
  private templateFunctions: Map<string, TemplateFunction> = new Map();

  constructor() {
    this.initializeDefaultTemplates();
    this.registerHelperFunctions();
  }

  /**
   * Get template by name
   */
  public getTemplate(name: string): DigestTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * List all available templates
   */
  public listTemplates(): DigestTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Register a new template
   */
  public registerTemplate(template: DigestTemplate): void {
    this.templates.set(template.name, template);
    logger.info(`Template "${template.name}" registered`);
  }

  /**
   * Render digest content using specified template
   */
  public async renderDigest(
    content: DigestContent,
    templateName: string = 'default',
    customVariables: TemplateVariables = {}
  ): Promise<{ markdown?: string; html?: string }> {
    try {
      const template = this.templates.get(templateName);
      if (!template) {
        throw new Error(`Template "${templateName}" not found`);
      }

      logger.info(`Rendering digest with template: ${templateName}`);

      const variables = this.buildTemplateVariables(content, customVariables);
      const result: { markdown?: string; html?: string } = {};

      // Render sections based on template configuration
      const renderedSections = await this.renderTemplateSections(template, variables);

      if (template.format === 'markdown' || template.format === 'html') {
        const fullContent = this.assembleTemplate(template, renderedSections, variables);
        
        if (template.format === 'markdown') {
          result.markdown = fullContent;
        } else {
          result.html = fullContent;
        }
      }

      return result;
    } catch (error) {
      logger.error(`Error rendering template "${templateName}":`, error);
      throw error;
    }
  }

  /**
   * Create custom template from configuration
   */
  public createCustomTemplate(
    name: string,
    configuration: {
      format: 'markdown' | 'html';
      sections: Record<string, { enabled: boolean; template: string; order: number }>;
      styling?: DigestTemplate['styling'];
    }
  ): DigestTemplate {
    const template: DigestTemplate = {
      name,
      description: `Custom template: ${name}`,
      format: configuration.format,
      sections: {},
      styling: configuration.styling
    };

    // Convert configuration sections to template sections
    Object.entries(configuration.sections).forEach(([key, config]) => {
      template.sections[key] = {
        enabled: config.enabled,
        order: config.order,
        template: config.template,
        variables: this.extractVariablesFromTemplate(config.template)
      };
    });

    this.registerTemplate(template);
    return template;
  }

  /**
   * Initialize default templates
   */
  private initializeDefaultTemplates(): void {
    // Default Markdown template
    this.registerTemplate({
      name: 'default',
      description: 'Standard digest template with all sections',
      format: 'markdown',
      sections: {
        header: {
          enabled: true,
          order: 1,
          template: `# {{emoji_chart}} Development Digest

**Repository:** {{repository}}  
**Period:** {{period_start}} - {{period_end}}  
**Generated:** {{generated_at}}  

---`,
          variables: ['emoji_chart', 'repository', 'period_start', 'period_end', 'generated_at']
        },
        executive: {
          enabled: true,
          order: 2,
          template: `## {{emoji_summary}} Executive Summary

{{executive_summary}}

### Key Highlights
{{#each highlights}}
- {{this}}
{{/each}}

### Key Metrics
| Metric | Value |
|--------|-------|
| Total Pull Requests | {{total_prs}} |
| Merged Pull Requests | {{merged_prs}} |
| Active Contributors | {{active_contributors}} |
| Average Time to Merge | {{avg_merge_time}}h |`,
          variables: ['emoji_summary', 'executive_summary', 'highlights', 'total_prs', 'merged_prs', 'active_contributors', 'avg_merge_time']
        },
        pullRequests: {
          enabled: true,
          order: 3,
          template: `## {{emoji_prs}} Pull Requests

{{pr_summary}}

### Featured Pull Requests
{{pr_table}}

### Breakdown by Type
{{pr_type_breakdown}}`,
          variables: ['emoji_prs', 'pr_summary', 'pr_table', 'pr_type_breakdown']
        },
        contributors: {
          enabled: true,
          order: 4,
          template: `## {{emoji_team}} Contributors

{{contributor_summary}}

### Top Contributors
{{contributor_table}}`,
          variables: ['emoji_team', 'contributor_summary', 'contributor_table']
        },
        codeHealth: {
          enabled: true,
          order: 5,
          template: `## {{emoji_health}} Code Health

{{code_health_summary}}

### Health Metrics
{{health_metrics_table}}

{{#if concerns}}
### ⚠️ Areas of Concern
{{#each concerns}}
- {{this}}
{{/each}}
{{/if}}

{{#if improvements}}
### ✅ Positive Developments
{{#each improvements}}
- {{this}}
{{/each}}
{{/if}}`,
          variables: ['emoji_health', 'code_health_summary', 'health_metrics_table', 'concerns', 'improvements']
        },
        statistics: {
          enabled: true,
          order: 6,
          template: `## {{emoji_stats}} Statistics

{{stats_charts}}

### File Changes
{{file_stats}}`,
          variables: ['emoji_stats', 'stats_charts', 'file_stats']
        },
        trends: {
          enabled: true,
          order: 7,
          template: `## {{emoji_trends}} Trends & Analysis

{{trends_summary}}

### Velocity Metrics
{{velocity_chart}}

### Insights & Predictions
{{#each predictions}}
- {{this}}
{{/each}}`,
          variables: ['emoji_trends', 'trends_summary', 'velocity_chart', 'predictions']
        },
        aiInsights: {
          enabled: false,
          order: 8,
          template: `## {{emoji_ai}} AI-Powered Insights

{{ai_summary}}

### Code Quality Assessment
{{ai_code_quality}}

### Recommendations
{{#each ai_recommendations}}
- {{this}}
{{/each}}`,
          variables: ['emoji_ai', 'ai_summary', 'ai_code_quality', 'ai_recommendations']
        },
        footer: {
          enabled: true,
          order: 9,
          template: `---

*Generated by Daily Dev Digest v{{version}} on {{generated_at}}*`,
          variables: ['version', 'generated_at']
        }
      }
    });

    // Concise template
    this.registerTemplate({
      name: 'concise',
      description: 'Compact digest focusing on key metrics and highlights',
      format: 'markdown',
      sections: {
        header: {
          enabled: true,
          order: 1,
          template: `# {{emoji_chart}} Dev Digest: {{repository}}

**{{period_start}} - {{period_end}}** | {{total_prs}} PRs | {{merged_prs}} merged | {{active_contributors}} contributors

---`,
          variables: ['emoji_chart', 'repository', 'period_start', 'period_end', 'total_prs', 'merged_prs', 'active_contributors']
        },
        summary: {
          enabled: true,
          order: 2,
          template: `{{executive_summary}}

**Highlights:**
{{#each highlights}}
- {{this}}
{{/each}}`,
          variables: ['executive_summary', 'highlights']
        },
        topPRs: {
          enabled: true,
          order: 3,
          template: `**Notable PRs:**
{{top_prs_list}}`,
          variables: ['top_prs_list']
        }
      }
    });

    // Email-friendly template
    this.registerTemplate({
      name: 'email',
      description: 'Email-optimized digest with clean formatting',
      format: 'html',
      sections: {
        header: {
          enabled: true,
          order: 1,
          template: `<div class="header">
  <h1>📊 Development Digest</h1>
  <div class="meta">
    <strong>{{repository}}</strong><br>
    {{period_start}} - {{period_end}}<br>
    {{total_prs}} PRs • {{merged_prs}} merged • {{active_contributors}} contributors
  </div>
</div>`,
          variables: ['repository', 'period_start', 'period_end', 'total_prs', 'merged_prs', 'active_contributors']
        },
        executive: {
          enabled: true,
          order: 2,
          template: `<div class="section">
  <h2>Executive Summary</h2>
  <p>{{executive_summary}}</p>
  <ul class="highlights">
    {{#each highlights}}
    <li>{{this}}</li>
    {{/each}}
  </ul>
</div>`,
          variables: ['executive_summary', 'highlights']
        },
        metrics: {
          enabled: true,
          order: 3,
          template: `<div class="section">
  <h2>Key Metrics</h2>
  <div class="metrics-grid">
    {{metrics_cards}}
  </div>
</div>`,
          variables: ['metrics_cards']
        }
      },
      styling: {
        theme: 'light',
        colors: {
          primary: '#2c3e50',
          secondary: '#3498db',
          accent: '#e74c3c'
        },
        typography: {
          headingFont: 'Arial, sans-serif',
          bodyFont: 'Arial, sans-serif',
          codeFont: 'Courier, monospace'
        }
      }
    });

    // Slack-friendly template
    this.registerTemplate({
      name: 'slack',
      description: 'Slack-optimized digest with emoji and mentions',
      format: 'markdown',
      sections: {
        header: {
          enabled: true,
          order: 1,
          template: `*📊 Development Digest - {{repository}}*
*{{period_start}} - {{period_end}}*

{{metrics_summary}}`,
          variables: ['repository', 'period_start', 'period_end', 'metrics_summary']
        },
        highlights: {
          enabled: true,
          order: 2,
          template: `*🎯 Key Highlights:*
{{#each highlights}}
• {{this}}
{{/each}}`,
          variables: ['highlights']
        },
        topContributors: {
          enabled: true,
          order: 3,
          template: `*👥 Top Contributors:*
{{slack_contributor_mentions}}`,
          variables: ['slack_contributor_mentions']
        }
      }
    });
  }

  /**
   * Register helper functions for template rendering
   */
  private registerHelperFunctions(): void {
    this.templateFunctions.set('formatDate', (variables: TemplateVariables) => {
      const date = variables.date as Date;
      return date ? date.toLocaleDateString() : '';
    });

    this.templateFunctions.set('formatNumber', (variables: TemplateVariables) => {
      const num = variables.num as number;
      return num ? num.toLocaleString() : '0';
    });

    this.templateFunctions.set('percentage', (variables: TemplateVariables) => {
      const value = variables.value as number;
      const total = variables.total as number;
      return total > 0 ? Math.round((value / total) * 100).toString() : '0';
    });

    this.templateFunctions.set('pluralize', (variables: TemplateVariables) => {
      const count = variables.count as number;
      const singular = variables.singular as string;
      const plural = variables.plural as string;
      return count === 1 ? singular : (plural || singular + 's');
    });
  }

  /**
   * Build template variables from digest content
   */
  private buildTemplateVariables(content: DigestContent, customVariables: TemplateVariables): TemplateVariables {
    const { metadata, executive, sections } = content;

    const variables: TemplateVariables = {
      // Basic info
      repository: metadata.repository,
      period_start: metadata.period.from.toLocaleDateString(),
      period_end: metadata.period.to.toLocaleDateString(),
      generated_at: metadata.generatedAt.toLocaleString(),
      version: metadata.version,

      // Emojis
      emoji_chart: '📊',
      emoji_summary: '📋',
      emoji_prs: '🔄',
      emoji_team: '👥',
      emoji_health: '🏥',
      emoji_stats: '📈',
      emoji_trends: '📈',
      emoji_ai: '🤖',

      // Executive summary
      executive_summary: executive.summary,
      highlights: executive.highlights,
      total_prs: executive.keyMetrics.totalPRs,
      merged_prs: executive.keyMetrics.mergedPRs,
      active_contributors: executive.keyMetrics.activeContributors,
      avg_merge_time: executive.keyMetrics.averageTimeToMerge,

      // Pull requests
      pr_summary: sections.pullRequests.summary,
      pr_table: this.buildPRTable(sections.pullRequests.featured),
      pr_type_breakdown: this.buildPRTypeBreakdown(sections.pullRequests.byType),
      top_prs_list: this.buildTopPRsList(sections.pullRequests.featured),

      // Contributors
      contributor_summary: sections.contributors.summary,
      contributor_table: this.buildContributorTable(sections.contributors.topContributors),
      slack_contributor_mentions: this.buildSlackMentions(sections.contributors.topContributors),

      // Code health
      code_health_summary: sections.codeHealth.summary,
      health_metrics_table: this.buildHealthMetricsTable(sections.codeHealth.metrics),
      concerns: sections.codeHealth.concerns,
      improvements: sections.codeHealth.improvements,

      // Statistics
      stats_charts: this.buildStatsCharts(sections.statistics),
      file_stats: this.buildFileStats(sections.statistics.files),

      // Trends
      trends_summary: sections.trends.summary,
      velocity_chart: this.buildVelocityChart(sections.statistics.trends),
      predictions: sections.trends.predictions,

      // AI insights (if available)
      ai_summary: content.aiInsights?.summary || '',
      ai_code_quality: content.aiInsights?.codeQualityAssessment || '',
      ai_recommendations: content.aiInsights?.recommendations || [],

      // Template helpers
      metrics_summary: this.buildMetricsSummary(executive.keyMetrics),
      metrics_cards: this.buildMetricsCards(executive.keyMetrics),

      // Custom variables
      ...customVariables
    };

    return variables;
  }

  /**
   * Render template sections
   */
  private async renderTemplateSections(
    template: DigestTemplate,
    variables: TemplateVariables
  ): Promise<Record<string, string>> {
    const renderedSections: Record<string, string> = {};

    // Sort sections by order
    const sortedSections = Object.entries(template.sections)
      .filter(([, section]) => section.enabled)
      .sort(([, a], [, b]) => a.order - b.order);

    for (const [key, section] of sortedSections) {
      try {
        const rendered = this.renderTemplateString(section.template, variables);
        renderedSections[key] = rendered;
      } catch (error) {
        logger.warn(`Error rendering section "${key}":`, error);
        renderedSections[key] = `<!-- Error rendering section: ${key} -->`;
      }
    }

    return renderedSections;
  }

  /**
   * Assemble final template
   */
  private assembleTemplate(
    template: DigestTemplate,
    renderedSections: Record<string, string>,
    variables: TemplateVariables
  ): string {
    const sections = Object.values(renderedSections).join('\n\n');
    
    if (template.format === 'html' && template.styling) {
      return this.wrapWithHTMLStyling(sections, template.styling);
    }
    
    return sections;
  }

  /**
   * Render template string with variable substitution
   */
  private renderTemplateString(template: string, variables: TemplateVariables): string {
    let result = template;

    // Handle {{#each}} blocks
    result = result.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayName, content) => {
      const array = variables[arrayName];
      if (!Array.isArray(array)) return '';
      
      return array.map(item => {
        if (typeof item === 'string') {
          return content.replace(/\{\{this\}\}/g, item);
        } else if (typeof item === 'object') {
          let itemContent = content;
          Object.entries(item).forEach(([key, value]) => {
            itemContent = itemContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
          });
          return itemContent;
        }
        return content;
      }).join('');
    });

    // Handle {{#if}} blocks
    result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
      const value = variables[condition];
      if (value && (Array.isArray(value) ? value.length > 0 : true)) {
        return content;
      }
      return '';
    });

    // Handle simple variable substitution
    result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = variables[varName];
      if (value === undefined || value === null) return '';
      return String(value);
    });

    return result;
  }

  /**
   * Extract variables from template string
   */
  private extractVariablesFromTemplate(template: string): string[] {
    const variables = new Set<string>();
    const variableRegex = /\{\{(\w+)\}\}/g;
    let match;

    while ((match = variableRegex.exec(template)) !== null) {
      variables.add(match[1]);
    }

    // Extract from {{#each}} and {{#if}} blocks
    const blockRegex = /\{\{#(?:each|if) (\w+)\}\}/g;
    while ((match = blockRegex.exec(template)) !== null) {
      variables.add(match[1]);
    }

    return Array.from(variables);
  }

  /**
   * Build PR table
   */
  private buildPRTable(featured: any[]): string {
    if (featured.length === 0) return 'No featured PRs';

    let table = '| PR | Title | Type | Impact | Author | Lines |\n';
    table += '|----|-------|------|---------|--------|-------|\n';

    featured.slice(0, 8).forEach(pr => {
      const lines = pr.linesAdded + pr.linesDeleted;
      table += `| #${pr.number} | ${pr.title} | ${pr.type} | ${pr.impact} | ${pr.author} | ${lines} |\n`;
    });

    return table;
  }

  /**
   * Build PR type breakdown
   */
  private buildPRTypeBreakdown(byType: Record<string, any[]>): string {
    const breakdown: string[] = [];

    Object.entries(byType).forEach(([type, prs]) => {
      if (prs.length > 0) {
        breakdown.push(`**${type.charAt(0).toUpperCase() + type.slice(1)}** (${prs.length})`);
      }
    });

    return breakdown.join('\n');
  }

  /**
   * Build top PRs list
   */
  private buildTopPRsList(featured: any[]): string {
    return featured.slice(0, 5).map(pr => 
      `#${pr.number}: ${pr.title} (${pr.author})`
    ).join('\n');
  }

  /**
   * Build contributor table
   */
  private buildContributorTable(contributors: any[]): string {
    if (contributors.length === 0) return 'No contributor data available';

    let table = '| Contributor | PRs | Commits | Lines Changed |\n';
    table += '|-------------|-----|---------|---------------|\n';

    contributors.slice(0, 10).forEach(c => {
      table += `| ${c.name} | ${c.metrics.prs} | ${c.metrics.commits} | ${c.metrics.linesChanged} |\n`;
    });

    return table;
  }

  /**
   * Build Slack mentions
   */
  private buildSlackMentions(contributors: any[]): string {
    return contributors.slice(0, 5).map(c => 
      `${c.name}: ${c.metrics.prs} PRs`
    ).join('\n');
  }

  /**
   * Build health metrics table
   */
  private buildHealthMetricsTable(metrics: any): string {
    return `| Metric | Value |
|--------|-------|
| Code Churn Rate | ${metrics.codeChurn} lines/day |
| Review Coverage | ${metrics.reviewCoverage}% |
| Average Complexity | ${metrics.averageComplexity}/4 |`;
  }

  /**
   * Build stats charts (text-based)
   */
  private buildStatsCharts(statistics: any): string {
    // This would generate text-based charts
    return 'Statistics charts placeholder';
  }

  /**
   * Build file stats
   */
  private buildFileStats(files: any): string {
    let stats = `- **Total Files Changed:** ${files.totalChanged}\n`;
    stats += '- **Language Breakdown:**\n';
    
    Object.entries(files.languageBreakdown).forEach(([lang, lines]) => {
      stats += `  - ${lang}: ${lines} lines\n`;
    });

    return stats;
  }

  /**
   * Build velocity chart
   */
  private buildVelocityChart(trends: any): string {
    return `\`\`\`
PR Velocity:      ${trends.prVelocity} PRs/day
Commit Velocity:  ${trends.commitVelocity} commits/day
Code Churn:       ${trends.codeChurnRate} lines/day
Review Coverage:  ${trends.reviewCoverage}%
\`\`\``;
  }

  /**
   * Build metrics summary for Slack
   */
  private buildMetricsSummary(metrics: any): string {
    return `${metrics.totalPRs} PRs • ${metrics.mergedPRs} merged • ${metrics.activeContributors} contributors • ${metrics.averageTimeToMerge}h avg merge`;
  }

  /**
   * Build metrics cards for HTML
   */
  private buildMetricsCards(metrics: any): string {
    return `
      <div class="metric-card">
        <h3>${metrics.totalPRs}</h3>
        <p>Total PRs</p>
      </div>
      <div class="metric-card">
        <h3>${metrics.mergedPRs}</h3>
        <p>Merged PRs</p>
      </div>
      <div class="metric-card">
        <h3>${metrics.activeContributors}</h3>
        <p>Contributors</p>
      </div>
      <div class="metric-card">
        <h3>${metrics.averageTimeToMerge}h</h3>
        <p>Avg Merge Time</p>
      </div>
    `;
  }

  /**
   * Wrap content with HTML styling
   */
  private wrapWithHTMLStyling(content: string, styling: DigestTemplate['styling']): string {
    const styles = this.generateCSS(styling!);
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Development Digest</title>
    <style>${styles}</style>
</head>
<body>
    <div class="digest-container">
        ${content}
    </div>
</body>
</html>`;
  }

  /**
   * Generate CSS from styling configuration
   */
  private generateCSS(styling: NonNullable<DigestTemplate['styling']>): string {
    return `
      .digest-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        font-family: ${styling.typography?.bodyFont || 'Arial, sans-serif'};
        color: ${styling.colors.primary};
      }
      
      .header {
        text-align: center;
        margin-bottom: 30px;
        padding: 20px;
        background-color: #f8f9fa;
        border-radius: 8px;
      }
      
      .section {
        margin: 30px 0;
        padding: 20px;
        border-left: 4px solid ${styling.colors.secondary};
      }
      
      .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin: 20px 0;
      }
      
      .metric-card {
        text-align: center;
        padding: 20px;
        background-color: #f8f9fa;
        border-radius: 8px;
        border: 2px solid ${styling.colors.accent};
      }
      
      .metric-card h3 {
        margin: 0;
        font-size: 2em;
        color: ${styling.colors.secondary};
      }
      
      .highlights {
        list-style: none;
        padding: 0;
      }
      
      .highlights li {
        padding: 8px 0;
        border-bottom: 1px solid #eee;
      }
      
      h1, h2, h3 {
        font-family: ${styling.typography?.headingFont || 'Arial, sans-serif'};
        color: ${styling.colors.primary};
      }
    `;
  }
}