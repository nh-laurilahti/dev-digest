/**
 * Digest Generation Job Handler
 */

import {
  BaseJob,
  JobResult,
  JobHandler,
  JobType,
  DigestGenerationJobParams,
  NotificationJobParams,
  JobPriority
} from '../../types/job';
import { logger } from '../../lib/logger';
import { db } from '../../db';
import { GitHubClient } from '../../clients/github';
import { GitHubDataProcessor } from '../github-data-processor';
import { config } from '../../lib/config';
import { jobService } from '../index';
import { AISummaryService } from '../ai-summary.ts';
import { PRAnalysis, DigestStatistics } from '../../types/digest';

export class DigestJobHandler implements JobHandler {
  type = JobType.DIGEST_GENERATION;

  async handle(job: BaseJob): Promise<JobResult> {
    try {
      const params = job.params as DigestGenerationJobParams;
      
      // Validate parameters
      if (!this.validate(params)) {
        return {
          success: false,
          error: 'Invalid job parameters'
        };
      }

      logger.info({
        jobId: job.id,
        repoId: params.repoId,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo
      }, 'Starting digest generation');

      // Step 1: Fetch repository information (DB)
      await this.updateProgress(job.id, 10, 'Fetching repository information');
      const repo = await this.getRepository(params.repoId);
      if (!repo) {
        return {
          success: false,
          error: `Repository not found: ${params.repoId}`
        };
      }

      // Resolve owner/repo from stored path
      const [owner, repoName] = String(repo.path || '').split('/');
      if (!owner || !repoName) {
        return { success: false, error: `Invalid repository path: ${repo.path}` };
      }

      // Step 2: Fetch real GitHub data (enhanced)
      await this.updateProgress(job.id, 35, 'Fetching data from GitHub');
      const ghClient = new GitHubClient();
      const processor = new GitHubDataProcessor(ghClient);
      const digestData = await processor.generateDigest(owner, repoName, {
        period: {
          start: new Date(params.dateFrom).toISOString(),
          end: new Date(params.dateTo).toISOString()
        },
        includeDetailed: true,
        maxPullRequests: 50,
        maxCommits: 100,
        includeInsights: false
      });

      // Step 3: Prepare PR buckets (completed/ongoing)
      await this.updateProgress(job.id, 55, 'Preparing PR data');
      const mergedPRs: any[] = Array.isArray(digestData?.pullRequests?.merged) ? digestData.pullRequests.merged : [];
      const openedPRs: any[] = Array.isArray(digestData?.pullRequests?.opened) ? digestData.pullRequests.opened : [];
      const inProgressPRs: any[] = Array.isArray(digestData?.pullRequests?.inProgress) ? digestData.pullRequests.inProgress : [];

             const isOngoing = (pr: any) => {
         const labels: string[] = (pr.labels || []).map((label: any) => (typeof label === 'string' ? label : label?.name) as string).filter(Boolean).map((name: string) => name.toLowerCase());
         return Boolean(pr.draft) || labels.includes('wip') || labels.includes('work in progress');
       };

      const ongoingPRs: any[] = [...openedPRs, ...inProgressPRs].filter((pr, idx, arr) => {
        const key = pr.number || pr.id || pr.node_id;
        return isOngoing(pr) && key && arr.findIndex(p => (p.number || p.id || p.node_id) === key) === idx;
      });

      // Limit PRs summarized to avoid excessive tokens
      const sortByChangeSize = (a: any, b: any) => ((b.additions || 0) + (b.deletions || 0)) - ((a.additions || 0) + (a.deletions || 0));
      const topMerged = [...mergedPRs].sort(sortByChangeSize).slice(0, 10);
      const topOngoing = [...ongoingPRs].sort(sortByChangeSize).slice(0, 5);

      // Step 4: Per-PR AI summaries
      await this.updateProgress(job.id, 75, 'Generating AI summaries for PRs');
      const summarizePR = async (pr: any): Promise<{ title: string; summary: string; author: string; url: string; labels: string[]; significance: number; changeType: string; isOngoing: boolean; } > => {
        const filesChanged = (pr.files_changed || pr.files || []).map((f: any) => ({
          filename: f.filename,
          additions: f.additions,
          deletions: f.deletions,
          changes: f.changes
        }));
        const commitMessages: string[] = Array.isArray(pr.commit_messages) ? pr.commit_messages.slice(0, 5) : [];
        const additions = pr.additions || 0;
        const deletions = pr.deletions || 0;
        const linesChanged = additions + deletions;
        const filesCount = filesChanged.length || pr.changed_files || 0;
        const title = pr.title || '';
        const body = pr.body || '';
        const author = pr.user?.login || pr.author || 'unknown';
        const url = pr.html_url || pr.url || '';
        const labels = (pr.labels || []).map((label: any) => typeof label === 'string' ? label : label?.name).filter(Boolean) as string[];
        const ongoing = isOngoing(pr);

        const context = `Title: ${title}\nDescription: ${body.substring(0, 500)}\nFiles Changed: ${filesCount}\nLines Added: ${additions}\nLines Deleted: ${deletions}\nCommit Messages: ${commitMessages.join('; ')}`;
        const systemPrompt = 'You are a senior engineer. Summarize this pull request in 2-3 concise sentences focusing on impact, risk, and areas affected.';

        let summary = '';
        try {
          summary = await this.callOpenAIChat(systemPrompt, `Summarize this PR for a general engineering audience:\n\n${context}`, 180, 0.7);
        } catch {
          // Fallback summary
          summary = `${title} (±${linesChanged} lines, ${filesCount} files).`;
        }

        // Simple significance heuristic
        const significance = Math.min(1, linesChanged / 1000 + (filesCount / 50));
        const changeType = labels.find((val: string) => ['feature','bugfix','refactor','docs','test','chore','security','performance'].includes(String(val).toLowerCase())) || 'change';

        return { title, summary, author, url, labels, significance, changeType, isOngoing: ongoing };
      };

      const completedEntries = await Promise.all(topMerged.map(summarizePR));
      const ongoingEntries = await Promise.all(topOngoing.map(summarizePR));

      // Step 5: Executive summary via AI
      await this.updateProgress(job.id, 85, 'Generating executive summary');
      const completedLines = completedEntries.map(e => `- ${e.title}: ${e.summary}`).join('\n');
      const ongoingLines = ongoingEntries.map(e => `- ${e.title}: ${e.summary}`).join('\n');
      const execContext = `Repository: ${digestData?.repository?.full_name || repo.path}\nPeriod: ${digestData?.period?.start} to ${digestData?.period?.end}\n\nCompleted Changes:\n${completedLines}\n\nOngoing Work:\n${ongoingLines}\n\nStatistics:\n- ${completedEntries.length} completed changes\n- ${ongoingEntries.length} ongoing changes`;
      const executiveMarkdown = await this.callOpenAIChat(
        'You are an engineering leader writing weekly digests.',
        `Create a clear 200-300 word executive summary from this data:\n\n${execContext}`,
        400,
        0.6
      ).catch(() => `Development Summary for ${repo.path}: ${completedEntries.length} completed, ${ongoingEntries.length} ongoing.`);

      // Step 5.5: Generate narrative summary using AI service (if style specified)
      let narrativeSummary: string | undefined;
      if (params.summaryStyle && params.summaryStyle !== 'detailed') {
        await this.updateProgress(job.id, 88, 'Generating narrative summary');
        try {
          // Create AI service instance
          const aiService = new AISummaryService();
          
          // Transform data to match expected interfaces
          const statistics: DigestStatistics = {
            period: {
              from: new Date(params.dateFrom),
              to: new Date(params.dateTo),
              days: digestData?.period?.days || Math.ceil((new Date(params.dateTo).getTime() - new Date(params.dateFrom).getTime()) / (1000 * 60 * 60 * 24))
            },
            repository: {
              name: digestData?.repository?.full_name || repo.path || 'unknown',
              path: repo.path || 'unknown',
              defaultBranch: repo.defaultBranch || 'main'
            },
            pullRequests: {
              total: (digestData?.summary?.totalPullRequests) || 0,
              merged: mergedPRs.length,
              closed: 0,
              draft: 0,
              byType: {
                feature: completedEntries.filter(e => e.changeType === 'feature').length,
                bugfix: completedEntries.filter(e => e.changeType === 'bugfix').length,
                hotfix: 0,
                refactor: completedEntries.filter(e => e.changeType === 'refactor').length,
                docs: completedEntries.filter(e => e.changeType === 'docs').length,
                test: completedEntries.filter(e => e.changeType === 'test').length,
                chore: completedEntries.filter(e => e.changeType === 'chore').length,
                breaking: 0,
                security: completedEntries.filter(e => e.changeType === 'security').length,
                performance: completedEntries.filter(e => e.changeType === 'performance').length,
                other: completedEntries.filter(e => !['feature', 'bugfix', 'refactor', 'docs', 'test', 'chore', 'security', 'performance'].includes(e.changeType)).length
              },
              byImpact: {
                minor: completedEntries.filter(e => e.significance < 0.3).length,
                moderate: completedEntries.filter(e => e.significance >= 0.3 && e.significance < 0.6).length,
                major: completedEntries.filter(e => e.significance >= 0.6 && e.significance < 0.9).length,
                critical: completedEntries.filter(e => e.significance >= 0.9).length
              },
              byComplexity: {
                simple: completedEntries.filter(e => e.significance < 0.3).length,
                moderate: completedEntries.filter(e => e.significance >= 0.3 && e.significance < 0.6).length,
                complex: completedEntries.filter(e => e.significance >= 0.6 && e.significance < 0.9).length,
                'very-complex': completedEntries.filter(e => e.significance >= 0.9).length
              },
              byAuthor: completedEntries.reduce((acc: Record<string, number>, entry) => {
                acc[entry.author] = (acc[entry.author] || 0) + 1;
                return acc;
              }, {}),
              averageTimeToMerge: 24, // Default estimate
              averageCommentsPerPR: 5, // Default estimate
              averageLinesPerPR: completedEntries.reduce((sum, e) => sum + (e.significance * 500), 0) / completedEntries.length || 0
            },
            commits: {
              total: digestData?.summary?.totalCommits || 0,
              byAuthor: digestData?.commits?.byAuthor || {},
              totalAdditions: digestData?.summary?.totalAdditions || 0,
              totalDeletions: digestData?.summary?.totalDeletions || 0
            },
            contributors: {
              total: Object.keys(digestData?.commits?.byAuthor || {}).length,
              new: 0,
              active: Object.keys(digestData?.commits?.byAuthor || {}),
              topContributors: Object.entries(digestData?.commits?.byAuthor || {})
                .sort(([,a], [,b]) => (b as number) - (a as number))
                .slice(0, 5)
                .map(([name, commits]) => ({
                  name,
                  prs: completedEntries.filter(e => e.author === name).length,
                  commits: commits as number,
                  linesChanged: (commits as number) * 50 // Estimate
                }))
            },
            files: {
              totalChanged: completedEntries.reduce((sum, e) => sum + (e.significance * 10), 0),
              mostChanged: [],
              languageBreakdown: {}
            },
            trends: {
              prVelocity: completedEntries.length / (digestData?.period?.days || 7),
              commitVelocity: (digestData?.summary?.totalCommits || 0) / (digestData?.period?.days || 7),
              codeChurnRate: ((digestData?.summary?.totalAdditions || 0) + (digestData?.summary?.totalDeletions || 0)) / (digestData?.period?.days || 7),
              reviewCoverage: 80 // Default estimate
            },
            highlights: {
              largestPR: { number: 0, title: '', linesChanged: 0 },
              mostDiscussedPR: { number: 0, title: '', comments: 0 },
              quickestMerge: { number: 0, title: '', timeToMerge: 0 },
              longestOpenPR: { number: 0, title: '', daysOpen: 0 }
            }
          };

          const prAnalyses: PRAnalysis[] = completedEntries.map(entry => ({
            id: 0, // Not available in current structure
            number: 0, // Not available
            title: entry.title,
            type: entry.changeType as any,
            impact: entry.significance >= 0.9 ? 'critical' : entry.significance >= 0.6 ? 'major' : entry.significance >= 0.3 ? 'moderate' : 'minor',
            complexity: entry.significance >= 0.9 ? 'very-complex' : entry.significance >= 0.6 ? 'complex' : entry.significance >= 0.3 ? 'moderate' : 'simple',
            author: entry.author,
            createdAt: new Date(),
            mergedAt: entry.isOngoing ? null : new Date(),
            linesAdded: Math.round(entry.significance * 300),
            linesDeleted: Math.round(entry.significance * 100),
            filesChanged: Math.round(entry.significance * 10),
            commits: Math.round(entry.significance * 5),
            comments: 0,
            reviewComments: 0,
            labels: entry.labels,
            description: entry.summary,
            keyChanges: [],
            riskLevel: entry.significance >= 0.8 ? 'high' : entry.significance >= 0.5 ? 'medium' : 'low',
            reviewers: [],
            timeToMerge: entry.isOngoing ? undefined : 24
          }));

          // Generate narrative summary
          narrativeSummary = await aiService.generateNarrativeSummary(
            statistics,
            prAnalyses,
            params.summaryStyle,
            params.customPrompt
          );
        } catch (error) {
          logger.warn({ error, summaryStyle: params.summaryStyle }, 'Narrative summary generation failed, using fallback');
          narrativeSummary = `Generated with ${params.summaryStyle} style: ${executiveMarkdown}`;
        }
      }

      // Step 6: Render HTML digest
      await this.updateProgress(job.id, 92, 'Rendering HTML digest');
      const html = this.renderHtmlDigest({
        repository: digestData?.repository?.full_name || repo.path,
        date: new Date(params.dateTo).toDateString(),
        summary: executiveMarkdown,
        completed: completedEntries,
        ongoing: ongoingEntries
      });

      // Build stats and persisted digest
      const stats = {
        repoId: repo.id,
        pullRequests: {
          total: (digestData?.summary?.totalPullRequests) || 0,
          merged: mergedPRs.length,
          authors: Object.keys(digestData?.commits?.byAuthor || {}).length
        },
        issues: { total: digestData?.summary?.totalIssues || 0, closed: 0, authors: 0 },
        commits: {
          total: digestData?.summary?.totalCommits || 0,
          authors: Object.keys(digestData?.commits?.byAuthor || {}).length,
          totalAdditions: digestData?.summary?.totalAdditions || 0,
          totalDeletions: digestData?.summary?.totalDeletions || 0
        },
        period: {
          from: new Date(digestData.period.start),
          to: new Date(digestData.period.end),
          days: digestData.period.days
        }
      };

      const digest = {
        summary: { markdown: executiveMarkdown, html },
        narrativeSummary,
        summaryStyle: params.summaryStyle,
        customPrompt: params.customPrompt,
        stats,
        rawData: {
          repository: digestData?.repository,
          completed: completedEntries,
          ongoing: ongoingEntries
        }
      };

      // Store
      await this.updateProgress(job.id, 96, 'Storing digest');
      const createdDigest = await this.storeDigest(digest, job.createdById, job.digestId);
      // Link the job to the created digest for UI/status (only if we created a new digest)
      if (!job.digestId) {
        try {
          await db.job.update({ where: { id: job.id }, data: { digestId: createdDigest.id } });
        } catch (e) {
          logger.warn({ jobId: job.id, digestId: createdDigest.id, err: e }, 'Failed to set digestId on job');
        }
      }

      // Check if email notifications are enabled in settings and send to eligible users
      await this.updateProgress(job.id, 98, 'Checking notification settings');
      try {
        const emailNotificationsEnabled = await this.isEmailNotificationsEnabled();
        
        if (emailNotificationsEnabled) {
          await this.updateProgress(job.id, 99, 'Sending email notifications to subscribers');
          await this.sendDigestEmailNotifications(createdDigest);
        }
      } catch (error) {
        logger.warn({ error, digestId: createdDigest.id }, 'Email notification setup failed, continuing with digest');
      }

      // Optional user-specific notifications (if explicitly requested)
      if (params.notifyUsers && params.notifyUsers.length > 0) {
        try {
          await this.scheduleNotifications(createdDigest.id, params.notifyUsers);
        } catch (error) {
          logger.warn({ error, digestId: createdDigest.id, userCount: params.notifyUsers.length }, 'User-specific notification scheduling failed, continuing with digest');
        }
      }

      await this.updateProgress(job.id, 100, 'Digest generation completed');

      logger.info({
        jobId: job.id,
        digestId: createdDigest.id,
        prCount: completedEntries.length,
        issuesCount: stats.issues.total,
        commitsCount: stats.commits.total
      }, 'Digest generation completed successfully');

      return {
        success: true,
        data: {
          digestId: createdDigest.id,
          summary: digest.summary,
          stats: digest.stats
        },
        metadata: {
          prCount: completedEntries.length,
          issuesCount: stats.issues.total,
          commitsCount: stats.commits.total
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({
        jobId: job.id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      }, 'Digest generation failed');

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

    const required = ['repoId', 'dateFrom', 'dateTo'];
    for (const field of required) {
      if (!(field in params)) {
        return false;
      }
    }

    // Validate dates
    const dateFrom = new Date(params.dateFrom);
    const dateTo = new Date(params.dateTo);
    
    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) {
      return false;
    }

    if (dateFrom >= dateTo) {
      return false;
    }

    // Validate repository ID
    if (typeof params.repoId !== 'number' || params.repoId <= 0) {
      return false;
    }

    return true;
  }

  estimateTime(params: DigestGenerationJobParams): number {
    // Base time estimate in seconds
    let baseTime = 60; // 1 minute base

    // Add time based on date range (more days = more time)
    const daysDiff = Math.ceil((params.dateTo.getTime() - params.dateFrom.getTime()) / (1000 * 60 * 60 * 24));
    baseTime += Math.min(daysDiff * 5, 300); // Max 5 minutes for date range

    // Add time for different data types
    if (params.includePRs) baseTime += 30;
    if (params.includeIssues) baseTime += 20;
    if (params.includeCommits) baseTime += 40;

    // Add time for detailed summary
    if (params.summaryType === 'detailed') {
      baseTime += 60;
    }

    return baseTime;
  }

  private async updateProgress(jobId: string, progress: number, message?: string): Promise<void> {
    // This would be implemented to update job progress
    // For now, just log the progress
    logger.info({ jobId, progress, message }, 'Job progress updated');
  }

  private async getRepository(repoId: number) {
    try {
      return await db.repo.findUnique({
        where: { id: repoId }
      });
    } catch (error) {
      logger.error({ repoId, error }, 'Failed to fetch repository');
      throw error;
    }
  }

  private async generateAISummaryMarkdown(digestData: any): Promise<string> {
    const systemPrompt = 'You are a senior software engineer creating a weekly repository digest. Write a clear, structured markdown summary with key metrics, notable PRs, contributors, and recommendations. Be concise and objective.';
    const topMerged = digestData.pullRequests.merged.slice(0, 5).map((pr: any) => `#${pr.number} ${pr.title} by @${pr.user?.login || 'unknown'} (+${pr.additions || 0}/-${pr.deletions || 0}, files: ${pr.changed_files || pr.files_changed?.length || 0})`);
    const prompt = `Repository: ${digestData.repository.full_name || digestData.repository.name}
Period: ${digestData.period.start} to ${digestData.period.end} (${digestData.period.days} days)

Summary metrics:
- PRs: ${digestData.summary.totalPullRequests}
- Commits: ${digestData.summary.totalCommits}
- Contributors: ${digestData.summary.totalContributors}
- Lines changed: +${digestData.summary.totalAdditions} / -${digestData.summary.totalDeletions}

Top merged PRs:
${topMerged.map((l: string) => `- ${l}`).join('\n')}

Please produce a markdown digest with sections: Overview, Highlights, PRs, Contributors, Recommendations.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 1200,
        temperature: 0.7,
        stream: false,
        response_format: { type: 'text' }
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, body: errorBody }, 'OpenAI API error');
      throw new Error(`OpenAI API error (${response.status}): ${response.statusText}`);
    }

    const data: any = await response.json();
    return data.choices?.[0]?.message?.content || 'No summary generated';
  }

  private markdownToHtml(markdown: string): string {
    // Simplified markdown to HTML conversion
    // In a real implementation, you'd use a proper markdown parser like marked
    return markdown
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*$)/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
      .replace(/\n/g, '<br>')
      .replace(/<br><br>/g, '</p><p>')
      .replace(/^(.*)$/, '<p>$1</p>');
  }

  private async callOpenAIChat(systemPrompt: string, userPrompt: string, maxTokens: number, temperature: number): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: maxTokens,
        temperature,
        stream: false,
        response_format: { type: 'text' }
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI error ${response.status}: ${errText}`);
    }
    const data: any = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  private renderHtmlDigest(input: {
    repository: string;
    date: string;
    summary: string;
    completed: Array<{ title: string; summary: string; author: string; url: string; labels: string[]; significance: number; changeType: string; isOngoing: boolean; }>;
    ongoing: Array<{ title: string; summary: string; author: string; url: string; labels: string[]; significance: number; changeType: string; isOngoing: boolean; }>;
  }): string {
    const escape = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const badge = (sig: number) => sig > 0.7 ? 'high' : sig > 0.4 ? 'medium' : 'low';
    const renderEntry = (e: any, ongoing: boolean) => `
      <div class="change-entry ${ongoing ? 'ongoing' : ''} ${badge(e.significance) === 'high' ? 'high-impact' : ''}">
        <div class="entry-header">
          <div class="entry-title"><a href="${escape(e.url)}" target="_blank">${escape(e.title)}</a></div>
          <span class="significance-badge ${badge(e.significance)}">${ongoing ? 'In Progress' : (badge(e.significance) === 'high' ? 'High Impact' : badge(e.significance) === 'medium' ? 'Medium Impact' : 'Low Impact')}</span>
        </div>
        <div class="entry-meta"><span class="author">👤 ${escape(e.author)}</span><span class="change-type">📁 ${escape(e.changeType)}</span></div>
        <div class="summary-text">${escape(e.summary)}</div>
        ${Array.isArray(e.labels) && e.labels.length ? `<div class="labels">${e.labels.map((l: string) => `<span class="label">${escape(l)}</span>`).join('')}</div>` : ''}
      </div>`;
    const contributors = new Set<string>();
    input.completed.forEach(e => contributors.add(e.author));
    input.ongoing.forEach(e => contributors.add(e.author));
    const stats = {
      total_changes: input.completed.length + input.ongoing.length,
      high_impact: input.completed.filter(e => e.significance > 0.7).length,
      ongoing: input.ongoing.length,
      contributors: contributors.size
    };
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Daily Dev Digest - ${escape(input.date)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height:1.6; color:#333; background:#f5f7fb; padding:20px; }
  .container { max-width: 900px; margin:0 auto; background:white; border-radius:12px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); overflow:hidden; }
  header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color:white; padding:30px; }
  header h1 { font-size:2rem; margin:0 0 10px 0; }
  .date { opacity:.95; }
  .summary { background:#f8f9fa; padding:20px 30px; border-bottom:1px solid #e0e0e0; white-space:pre-wrap; }
  .content { padding:30px; }
  .stats { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap:20px; margin:20px 0; }
  .stat-card { background:white; padding:15px; border-radius:8px; text-align:center; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
  .stat-value { font-size:1.6rem; font-weight:bold; color:#667eea; }
  .stat-label { color:#666; font-size:.9rem; }
  h2 { color:#667eea; margin:30px 0 10px 0; font-size:1.4rem; border-bottom:2px solid #667eea; padding-bottom:8px; }
  .change-entry { background:#f8f9fa; border-left:4px solid #667eea; padding:20px; margin:15px 0; border-radius:8px; }
  .change-entry.ongoing { border-left-color:#ffa500; background:#fff9e6; }
  .change-entry.high-impact { border-left-color:#ff4757; background:#ffe6e9; }
  .entry-header { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
  .entry-title a { color:#333; text-decoration:none; border-bottom:2px solid transparent; }
  .entry-title a:hover { border-bottom-color:#667eea; }
  .significance-badge { background:#667eea; color:white; padding:4px 10px; border-radius:20px; font-size:.85rem; }
  .significance-badge.high { background:#ff4757; }
  .significance-badge.medium { background:#ffa500; }
  .significance-badge.low { background:#28a745; }
  .entry-meta { display:flex; gap:15px; color:#666; font-size:.9rem; margin:8px 0; }
  .labels { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
  .label { background:#e3e8ef; color:#667eea; padding:4px 10px; border-radius:15px; font-size:.85rem; }
  footer { background:#f8f9fa; padding:20px; text-align:center; color:#666; font-size:.9rem; border-top:1px solid #e0e0e0; }
</style></head>
<body>
  <div class="container">
    <header>
      <h1>📊 Daily Dev Digest</h1>
      <div class="date">${escape(input.date)} | ${escape(input.repository)}</div>
    </header>
    <div class="summary">${escape(input.summary)}</div>
    <div class="content">
      <div class="stats">
        <div class="stat-card"><div class="stat-value">${stats.total_changes}</div><div class="stat-label">Total Changes</div></div>
        <div class="stat-card"><div class="stat-value">${stats.high_impact}</div><div class="stat-label">High Impact</div></div>
        <div class="stat-card"><div class="stat-value">${stats.ongoing}</div><div class="stat-label">Ongoing</div></div>
        <div class="stat-card"><div class="stat-value">${stats.contributors}</div><div class="stat-label">Contributors</div></div>
      </div>
      ${input.completed.length ? `<section><h2>✅ Completed Changes</h2>${input.completed.map(e => renderEntry(e,false)).join('')}</section>` : ''}
      ${input.ongoing.length ? `<section><h2>🚧 Ongoing Changes</h2>${input.ongoing.map(e => renderEntry(e,true)).join('')}</section>` : ''}
      ${!input.completed.length && !input.ongoing.length ? `<div class="no-changes">No significant changes detected.</div>` : ''}
    </div>
    <footer>Generated on ${escape(new Date().toUTCString())}</footer>
  </div>
</body></html>`;
  }

  private async storeDigest(digest: any, createdById: number, existingDigestId?: number) {
    try {
      const data = {
        repoId: digest.stats.repoId || 1,
        dateFrom: digest.stats.period.from,
        dateTo: digest.stats.period.to,
        summaryMd: digest.summary.markdown,
        summaryHtml: digest.summary.html,
        summaryMarkdown: digest.summary.markdown, // Brief markdown summary
        narrativeSummary: digest.narrativeSummary, // AI-generated narrative
        summaryStyle: digest.summaryStyle, // Style used for generation
        customPrompt: digest.customPrompt, // Custom prompt if provided
        statsJson: JSON.stringify(digest.stats),
        prDataJson: JSON.stringify(digest.rawData),
        createdById
      };

      if (existingDigestId) {
        // Update existing digest
        return await db.digest.update({
          where: { id: existingDigestId },
          data
        });
      } else {
        // Create new digest
        return await db.digest.create({
          data
        });
      }
    } catch (error) {
      logger.error({ error, existingDigestId }, 'Failed to store digest');
      throw error;
    }
  }

  private async scheduleNotifications(digestId: number, userIds: number[]): Promise<void> {
    try {
      logger.info({ 
        digestId, 
        userIds 
      }, 'Creating notification jobs for digest');

      // Get digest information for notification template data
      const digest = await db.digest.findUnique({
        where: { id: digestId },
        include: {
          repo: true
        }
      });

      if (!digest) {
        logger.error({ digestId }, 'Digest not found, cannot send notifications');
        return;
      }

      // Parse stats for template data
      const stats = digest.statsJson ? JSON.parse(digest.statsJson) : {};
      const dateRange = `${digest.dateFrom.toLocaleDateString()} - ${digest.dateTo.toLocaleDateString()}`;
      const digestUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/digest/${digestId}`;
      const repoUrl = `https://github.com/${digest.repo.path}`;

      // Prepare template data for the notification (matching Slack template structure)
      const templateData = {
        repoName: digest.repo.name || digest.repo.path,
        summaryTitle: `Weekly Digest - ${digest.repo.name}`,
        summary: digest.summaryMd ? digest.summaryMd.substring(0, 300) + '...' : 'Digest generated successfully',
        dateRange,
        digestUrl,
        repoUrl,
        digestId,
        stats: {
          prCount: stats.pullRequests?.total || 0,
          commitCount: stats.commits?.total || 0,
          contributorCount: Object.keys(stats.commits?.byAuthor || {}).length || 0,
          changesCount: stats.pullRequests?.total || 0
        },
        _system: {
          timestamp: new Date(),
          jobType: 'digest_generation',
          digestId
        }
      };

      // Convert userIds to string array for notification job
      const recipients = userIds.map(id => id.toString());

      // Create notification jobs for different channels
      const notificationJobs = [];

      // Create Slack notification job
      if (process.env.SLACK_BOT_TOKEN) {
        const slackJob = await jobService.createJob({
          type: JobType.NOTIFICATION,
          priority: JobPriority.NORMAL,
          params: {
            type: 'slack',
            recipients,
            message: `📊 New digest available for ${digest.repo.name}`,
            template: 'digest_notification',
            data: templateData,
            digestId
          } as NotificationJobParams,
          maxRetries: 3,
          createdById: 1, // Default user since authentication is removed
          digestId,
          tags: ['digest', 'notification', 'slack'],
          metadata: {
            channel: 'slack',
            digestId,
            repoId: digest.repoId
          }
        });
        notificationJobs.push(slackJob);
        logger.info({ jobId: slackJob.id, digestId }, 'Created Slack notification job');
      }

      // Create email notification job as fallback
      const emailJob = await jobService.createJob({
        type: JobType.NOTIFICATION,
        priority: JobPriority.NORMAL,
        params: {
          type: 'email',
          recipients,
          subject: `📊 New Digest: ${digest.repo.name} - ${dateRange}`,
          message: `A new digest has been generated for ${digest.repo.name}.\n\nView the full digest: ${digestUrl}`,
          template: 'digest_notification_email',
          data: templateData,
          digestId
        } as NotificationJobParams,
        maxRetries: 3,
        createdById: 1, // Default user since authentication is removed
        digestId,
        tags: ['digest', 'notification', 'email'],
        metadata: {
          channel: 'email',
          digestId,
          repoId: digest.repoId
        }
      });
      notificationJobs.push(emailJob);
      logger.info({ jobId: emailJob.id, digestId }, 'Created email notification job');

      logger.info({
        digestId,
        notificationJobCount: notificationJobs.length,
        jobIds: notificationJobs.map(job => job.id)
      }, 'Successfully created notification jobs for digest');

    } catch (error) {
      logger.error({
        digestId,
        userIds,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to schedule notification jobs for digest');
    }
  }

  /**
   * Check if email notifications are enabled in global settings
   */
  private async isEmailNotificationsEnabled(): Promise<boolean> {
    try {
      const setting = await db.setting.findUnique({
        where: { key: 'enable_email_notifications' }
      });
      
      if (!setting) {
        logger.warn('Email notifications setting not found, defaulting to false');
        return false;
      }
      
      const enabled = JSON.parse(setting.valueJson);
      return Boolean(enabled);
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to check email notifications setting');
      return false;
    }
  }

  /**
   * Send email notifications for digest completion to all eligible users
   */
  private async sendDigestEmailNotifications(digest: any): Promise<void> {
    try {
      logger.info({ digestId: digest.id }, 'Starting digest email notifications');

      // Use raw SQL query to avoid Prisma schema mismatch issues
      const usersWithEmailNotifications = await db.$queryRaw<any[]>`
        SELECT u.id, u.username, u.email, up.channels, up.is_enabled
        FROM users u 
        LEFT JOIN user_preferences up ON u.id = up.user_id
        WHERE u.is_active = 1 
          AND up.is_enabled = 1
          AND up.channels LIKE '%email%'
      `;

      if (usersWithEmailNotifications.length === 0) {
        logger.info('No users found with email notifications enabled');
        return;
      }

      logger.info({ 
        userCount: usersWithEmailNotifications.length 
      }, 'Found users with email notifications enabled');

      // Prepare digest notification data
      const repo = await db.repo.findUnique({ where: { id: digest.repoId } });
      if (!repo) {
        logger.error({ digestId: digest.id, repoId: digest.repoId }, 'Repository not found for digest');
        return;
      }

      const stats = digest.statsJson ? JSON.parse(digest.statsJson) : {};
      const dateRange = `${digest.dateFrom.toLocaleDateString()} - ${digest.dateTo.toLocaleDateString()}`;
      const digestUrl = `${config.baseUrl || process.env.BASE_URL || 'http://localhost:3000'}/digest/${digest.id}`;
      const repoUrl = `https://github.com/${repo.path}`;

      // Use the existing notification manager approach
      const userIds = usersWithEmailNotifications.map(user => user.id);
      await this.scheduleNotifications(digest.id, userIds);

      logger.info({
        digestId: digest.id,
        notificationsSent: userIds.length,
        repoName: repo.name
      }, 'Successfully scheduled digest email notifications');

    } catch (error) {
      logger.error({
        digestId: digest.id,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to send digest email notifications');
    }
  }
}