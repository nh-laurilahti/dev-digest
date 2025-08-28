export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  merged: boolean;
  draft: boolean;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  base: {
    ref: string;
    sha: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  user: {
    login: string;
    id: number;
    avatar_url: string;
  };
  assignees: Array<{
    login: string;
    id: number;
  }>;
  labels: Array<{
    name: string;
    color: string;
    description: string | null;
  }>;
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  comments: number;
  review_comments: number;
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  stats: {
    additions: number;
    deletions: number;
    total: number;
  };
  files: Array<{
    filename: string;
    status: 'added' | 'modified' | 'removed' | 'renamed';
    additions: number;
    deletions: number;
    changes: number;
  }>;
}

export interface PRAnalysis {
  id: number;
  number: number;
  title: string;
  type: PRType;
  impact: PRImpact;
  complexity: PRComplexity;
  author: string;
  createdAt: Date;
  mergedAt: Date | null;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  commits: number;
  comments: number;
  reviewComments: number;
  labels: string[];
  description: string;
  keyChanges: string[];
  riskLevel: 'low' | 'medium' | 'high';
  reviewers: string[];
  timeToMerge?: number; // in hours
}

export type PRType = 
  | 'feature'
  | 'bugfix' 
  | 'hotfix'
  | 'refactor'
  | 'docs'
  | 'test'
  | 'chore'
  | 'breaking'
  | 'security'
  | 'performance'
  | 'other';

export type PRImpact = 'minor' | 'moderate' | 'major' | 'critical';
export type PRComplexity = 'simple' | 'moderate' | 'complex' | 'very-complex';

export interface DigestStatistics {
  period: {
    from: Date;
    to: Date;
    days: number;
  };
  repository: {
    name: string;
    path: string;
    defaultBranch: string;
  };
  pullRequests: {
    total: number;
    merged: number;
    closed: number;
    draft: number;
    byType: Record<PRType, number>;
    byImpact: Record<PRImpact, number>;
    byComplexity: Record<PRComplexity, number>;
    byAuthor: Record<string, number>;
    averageTimeToMerge: number; // in hours
    averageCommentsPerPR: number;
    averageLinesPerPR: number;
  };
  commits: {
    total: number;
    byAuthor: Record<string, number>;
    totalAdditions: number;
    totalDeletions: number;
  };
  contributors: {
    total: number;
    new: number;
    active: string[];
    topContributors: Array<{
      name: string;
      prs: number;
      commits: number;
      linesChanged: number;
    }>;
  };
  files: {
    totalChanged: number;
    mostChanged: Array<{
      path: string;
      changes: number;
      prs: number;
    }>;
    languageBreakdown: Record<string, number>;
  };
  trends: {
    prVelocity: number; // PRs per day
    commitVelocity: number; // Commits per day
    codeChurnRate: number; // Lines changed per day
    reviewCoverage: number; // Percentage of PRs with reviews
  };
  highlights: {
    largestPR: {
      number: number;
      title: string;
      linesChanged: number;
    };
    mostDiscussedPR: {
      number: number;
      title: string;
      comments: number;
    };
    quickestMerge: {
      number: number;
      title: string;
      timeToMerge: number;
    };
    longestOpenPR: {
      number: number;
      title: string;
      daysOpen: number;
    };
  };
}

export interface DigestOptions {
  repository: string;
  dateFrom: Date;
  dateTo: Date;
  includeAISummary?: boolean;
  includeCodeAnalysis?: boolean;
  detailLevel?: 'concise' | 'detailed' | 'comprehensive';
  format?: 'markdown' | 'html' | 'json';
  template?: string;
  customFilters?: {
    authors?: string[];
    labels?: string[];
    prTypes?: PRType[];
    minImpact?: PRImpact;
  };
  aiProvider?: 'openai' | 'anthropic';
  outputPreferences?: {
    includeEmojis?: boolean;
    includeCharts?: boolean;
    includeCodeSnippets?: boolean;
    includeTrends?: boolean;
  };
}

export interface DigestContent {
  metadata: {
    generatedAt: Date;
    version: string;
    repository: string;
    period: {
      from: Date;
      to: Date;
    };
    options: DigestOptions;
  };
  executive: {
    summary: string;
    keyMetrics: {
      totalPRs: number;
      mergedPRs: number;
      activeContributors: number;
      averageTimeToMerge: number;
    };
    highlights: string[];
  };
  sections: {
    statistics: DigestStatistics;
    pullRequests: {
      summary: string;
      featured: PRAnalysis[];
      byType: Record<PRType, PRAnalysis[]>;
    };
    contributors: {
      summary: string;
      topContributors: Array<{
        name: string;
        metrics: {
          prs: number;
          commits: number;
          linesChanged: number;
        };
        highlights: string[];
      }>;
      newContributors: string[];
    };
    codeHealth: {
      summary: string;
      metrics: {
        testCoverage?: number;
        codeChurn: number;
        reviewCoverage: number;
        averageComplexity: number;
      };
      concerns: string[];
      improvements: string[];
    };
    trends: {
      summary: string;
      comparisons: {
        previousPeriod: {
          prCount: number;
          commitCount: number;
          contributorCount: number;
          changePercent: number;
        };
      };
      predictions: string[];
    };
  };
  aiInsights?: {
    summary: string;
    codeQualityAssessment: string;
    teamProductivityInsights: string;
    recommendations: string[];
    riskAssessment: {
      level: 'low' | 'medium' | 'high';
      factors: string[];
      mitigations: string[];
    };
  };
  appendix: {
    methodology: string;
    dataSource: string;
    limitations: string[];
    rawData?: {
      pullRequests: PRAnalysis[];
      statistics: DigestStatistics;
    };
  };
}

export interface DigestTemplate {
  name: string;
  description: string;
  format: 'markdown' | 'html';
  sections: {
    [key: string]: {
      enabled: boolean;
      order: number;
      template: string;
      variables: string[];
    };
  };
  styling?: {
    theme: 'default' | 'dark' | 'light' | 'corporate';
    colors: {
      primary: string;
      secondary: string;
      accent: string;
    };
    typography: {
      headingFont: string;
      bodyFont: string;
      codeFont: string;
    };
  };
}

export interface GenerationResult {
  success: boolean;
  digest?: DigestContent;
  markdown?: string;
  html?: string;
  error?: {
    message: string;
    code: string;
    details?: any;
  };
  metadata: {
    processingTime: number;
    dataPoints: number;
    cacheHits: number;
    apiCalls: number;
  };
}

// Utility types for template rendering
export type TemplateVariables = Record<string, any>;
export type TemplateFunction = (variables: TemplateVariables) => string;

// Configuration types for services
export interface PRAnalysisConfig {
  patterns: {
    featureKeywords: string[];
    bugfixKeywords: string[];
    breakingKeywords: string[];
    testKeywords: string[];
    docsKeywords: string[];
  };
  thresholds: {
    majorImpact: {
      linesChanged: number;
      filesChanged: number;
      commentsThreshold: number;
    };
    complexPR: {
      linesChanged: number;
      filesChanged: number;
      commits: number;
    };
  };
}

export interface AIConfig {
  provider: 'openai' | 'anthropic';
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompts: {
    prSummary: string;
    codeAnalysis: string;
    riskAssessment: string;
  };
}

export type SummaryStyle = 'concise' | 'frontend' | 'engaging-story' | 'executive' | 'technical' | 'custom';

export interface PromptTemplate {
  name: string;
  style: SummaryStyle;
  description: string;
  systemPrompt: string;
  userPromptTemplate: string;
  tags: string[];
  examples?: {
    input: string;
    output: string;
  }[];
}

export interface NarrativeSummaryRequest {
  statistics: DigestStatistics;
  prAnalyses: PRAnalysis[];
  style: SummaryStyle;
  customPrompt?: string;
  options?: {
    maxLength?: number;
    includeMetrics?: boolean;
    includeLinks?: boolean;
  };
}