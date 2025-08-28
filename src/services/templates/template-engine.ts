/**
 * Template Engine
 * Provides template management, rendering, and variable substitution for notifications
 */

import { logger } from '../../lib/logger';
import { db } from '../../db';
import handlebars from 'handlebars';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface Template {
  id: string;
  name: string;
  type: 'email' | 'slack' | 'webhook';
  version: string;
  subject?: string; // For email templates
  content: string;
  variables: string[];
  metadata: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdById: number;
}

export interface TemplateRenderOptions {
  data: Record<string, any>;
  locale?: string;
  timezone?: string;
  format?: 'html' | 'text' | 'blocks';
  preview?: boolean;
}

export interface TemplateRenderResult {
  success: boolean;
  content?: string;
  subject?: string;
  blocks?: any[];
  error?: string;
  variables?: string[];
  metadata?: Record<string, any>;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  variables: string[];
  requiredVariables: string[];
}

export class TemplateEngine {
  private compiledTemplates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private templateCache: Map<string, Template> = new Map();
  private localeCache: Map<string, Record<string, string>> = new Map();

  constructor() {
    this.registerHelpers();
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    // Date formatting helper
    handlebars.registerHelper('formatDate', (date: Date | string, format?: string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      if (!d || isNaN(d.getTime())) return '';
      
      switch (format) {
        case 'short':
          return d.toLocaleDateString();
        case 'long':
          return d.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          });
        case 'time':
          return d.toLocaleTimeString();
        case 'datetime':
          return d.toLocaleString();
        case 'iso':
          return d.toISOString();
        case 'relative':
          return this.getRelativeTime(d);
        default:
          return d.toLocaleDateString();
      }
    });

    // Number formatting helper
    handlebars.registerHelper('formatNumber', (num: number, format?: string) => {
      if (typeof num !== 'number') return num;
      
      switch (format) {
        case 'currency':
          return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
        case 'percent':
          return new Intl.NumberFormat('en-US', { style: 'percent' }).format(num);
        case 'compact':
          return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(num);
        default:
          return new Intl.NumberFormat('en-US').format(num);
      }
    });

    // String manipulation helpers
    handlebars.registerHelper('capitalize', (str: string) => {
      return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : '';
    });

    handlebars.registerHelper('uppercase', (str: string) => {
      return str ? str.toUpperCase() : '';
    });

    handlebars.registerHelper('lowercase', (str: string) => {
      return str ? str.toLowerCase() : '';
    });

    handlebars.registerHelper('truncate', (str: string, length: number = 100) => {
      return str && str.length > length ? str.substring(0, length) + '...' : str;
    });

    // Array helpers
    handlebars.registerHelper('join', (array: any[], separator: string = ', ') => {
      return Array.isArray(array) ? array.join(separator) : '';
    });

    handlebars.registerHelper('length', (array: any[]) => {
      return Array.isArray(array) ? array.length : 0;
    });

    // Conditional helpers
    handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    handlebars.registerHelper('lt', (a: any, b: any) => a < b);
    handlebars.registerHelper('gte', (a: any, b: any) => a >= b);
    handlebars.registerHelper('lte', (a: any, b: any) => a <= b);

    // URL helpers
    handlebars.registerHelper('encodeUri', (str: string) => {
      return str ? encodeURIComponent(str) : '';
    });

    handlebars.registerHelper('baseUrl', () => {
      return process.env.BASE_URL || 'http://localhost:3000';
    });

    // Markdown helper (basic)
    handlebars.registerHelper('markdown', (str: string) => {
      if (!str) return '';
      return str
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    });

    // Slack block helpers
    handlebars.registerHelper('slackMention', (userId: string) => {
      return `<@${userId}>`;
    });

    handlebars.registerHelper('slackChannel', (channelId: string) => {
      return `<#${channelId}>`;
    });

    logger.info('Handlebars helpers registered');
  }

  /**
   * Get relative time string
   */
  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  /**
   * Load template by name and type
   */
  async loadTemplate(name: string, type: 'email' | 'slack' | 'webhook'): Promise<Template | null> {
    const cacheKey = `${type}_${name}`;
    
    // Check cache first
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    try {
      const template = await db.notificationTemplate.findFirst({
        where: { name, type, isActive: true }
      });

      if (template) {
        const templateObj: Template = {
          id: template.id,
          name: template.name,
          type: template.type as 'email' | 'slack' | 'webhook',
          version: template.version,
          subject: template.subject,
          content: template.content,
          variables: JSON.parse(template.variables || '[]'),
          metadata: JSON.parse(template.metadata || '{}'),
          isActive: template.isActive,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
          createdById: template.createdById
        };

        // Cache template
        this.templateCache.set(cacheKey, templateObj);
        return templateObj;
      }

      return null;
    } catch (error) {
      logger.error({
        name,
        type,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to load template');
      return null;
    }
  }

  /**
   * Render template with data
   */
  async renderTemplate(
    templateName: string,
    type: 'email' | 'slack' | 'webhook',
    options: TemplateRenderOptions
  ): Promise<TemplateRenderResult> {
    try {
      const template = await this.loadTemplate(templateName, type);
      if (!template) {
        return {
          success: false,
          error: `Template not found: ${templateName} (${type})`
        };
      }

      // Validate required variables
      const validation = this.validateTemplateData(template, options.data);
      if (!validation.valid) {
        return {
          success: false,
          error: `Template validation failed: ${validation.errors.join(', ')}`
        };
      }

      // Prepare template data with localization
      const templateData = await this.prepareTemplateData(options.data, options.locale);

      // Compile template if not cached
      const cacheKey = `${type}_${templateName}_${template.version}`;
      let compiledTemplate = this.compiledTemplates.get(cacheKey);
      
      if (!compiledTemplate) {
        compiledTemplate = handlebars.compile(template.content);
        this.compiledTemplates.set(cacheKey, compiledTemplate);
      }

      // Render template
      const renderedContent = compiledTemplate(templateData);

      // Handle different output formats
      let result: TemplateRenderResult = {
        success: true,
        content: renderedContent,
        variables: template.variables,
        metadata: template.metadata
      };

      // Process subject for email templates
      if (type === 'email' && template.subject) {
        const subjectTemplate = handlebars.compile(template.subject);
        result.subject = subjectTemplate(templateData);
      }

      // Process blocks for Slack templates
      if (type === 'slack') {
        try {
          result.blocks = JSON.parse(renderedContent);
        } catch (parseError) {
          logger.warn({
            templateName,
            error: parseError instanceof Error ? parseError.message : String(parseError)
          }, 'Failed to parse Slack blocks, using as text');
        }
      }

      // Convert to text format if requested
      if (options.format === 'text' && type === 'email') {
        result.content = this.htmlToText(renderedContent);
      }

      logger.debug({
        templateName,
        type,
        dataKeys: Object.keys(options.data),
        contentLength: result.content?.length || 0
      }, 'Template rendered successfully');

      return result;
    } catch (error) {
      logger.error({
        templateName,
        type,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to render template');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate template data against template requirements
   */
  validateTemplateData(template: Template, data: Record<string, any>): TemplateValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const variables = this.extractVariables(template.content);
    const requiredVariables = template.metadata.requiredVariables || [];

    // Check required variables
    for (const variable of requiredVariables) {
      if (!(variable in data) || data[variable] == null) {
        errors.push(`Missing required variable: ${variable}`);
      }
    }

    // Check for unused variables in template
    const providedVariables = Object.keys(data);
    for (const variable of variables) {
      if (!providedVariables.includes(variable)) {
        warnings.push(`Template variable not provided: ${variable}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      variables,
      requiredVariables
    };
  }

  /**
   * Extract variables from template content
   */
  private extractVariables(content: string): string[] {
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables: Set<string> = new Set();
    let match;

    while ((match = variableRegex.exec(content)) !== null) {
      const variable = match[1].trim().split(' ')[0]; // Handle helpers
      if (variable && !this.isHelper(variable)) {
        variables.add(variable);
      }
    }

    return Array.from(variables);
  }

  /**
   * Check if a variable is actually a Handlebars helper
   */
  private isHelper(variable: string): boolean {
    const helpers = [
      'formatDate', 'formatNumber', 'capitalize', 'uppercase', 'lowercase',
      'truncate', 'join', 'length', 'eq', 'ne', 'gt', 'lt', 'gte', 'lte',
      'encodeUri', 'baseUrl', 'markdown', 'slackMention', 'slackChannel',
      'if', 'unless', 'each', 'with'
    ];
    return helpers.includes(variable);
  }

  /**
   * Prepare template data with localization and additional context
   */
  private async prepareTemplateData(
    data: Record<string, any>,
    locale: string = 'en-US'
  ): Promise<Record<string, any>> {
    const templateData = { ...data };

    // Add system variables
    templateData._system = {
      timestamp: new Date(),
      locale,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      baseUrl: process.env.BASE_URL || 'http://localhost:3000'
    };

    // Load localized strings if needed
    if (locale !== 'en-US') {
      const localizedStrings = await this.loadLocaleStrings(locale);
      templateData._strings = localizedStrings;
    }

    return templateData;
  }

  /**
   * Load localized strings
   */
  private async loadLocaleStrings(locale: string): Promise<Record<string, string>> {
    if (this.localeCache.has(locale)) {
      return this.localeCache.get(locale)!;
    }

    try {
      const localePath = path.join(__dirname, 'locales', `${locale}.json`);
      const localeData = await fs.readFile(localePath, 'utf-8');
      const strings = JSON.parse(localeData);
      
      this.localeCache.set(locale, strings);
      return strings;
    } catch (error) {
      logger.warn({
        locale,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to load locale strings, using defaults');
      
      return {};
    }
  }

  /**
   * Convert HTML to plain text
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<h[1-6][^>]*>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  /**
   * Create a new template
   */
  async createTemplate(
    name: string,
    type: 'email' | 'slack' | 'webhook',
    content: string,
    options: {
      subject?: string;
      variables?: string[];
      metadata?: Record<string, any>;
      createdById: number;
    }
  ): Promise<Template> {
    try {
      // Extract variables from content
      const extractedVariables = this.extractVariables(content);
      const allVariables = [...new Set([...extractedVariables, ...(options.variables || [])])];

      // Validate template syntax
      try {
        handlebars.compile(content);
        if (options.subject) {
          handlebars.compile(options.subject);
        }
      } catch (syntaxError) {
        throw new Error(`Template syntax error: ${syntaxError instanceof Error ? syntaxError.message : String(syntaxError)}`);
      }

      const template = await db.notificationTemplate.create({
        data: {
          name,
          type,
          version: '1.0.0',
          subject: options.subject,
          content,
          variables: JSON.stringify(allVariables),
          metadata: JSON.stringify(options.metadata || {}),
          isActive: true,
          createdById: options.createdById
        }
      });

      // Clear cache to force reload
      const cacheKey = `${type}_${name}`;
      this.templateCache.delete(cacheKey);

      logger.info({
        templateId: template.id,
        name,
        type,
        variableCount: allVariables.length
      }, 'Template created successfully');

      return {
        id: template.id,
        name: template.name,
        type: template.type as 'email' | 'slack' | 'webhook',
        version: template.version,
        subject: template.subject,
        content: template.content,
        variables: allVariables,
        metadata: options.metadata || {},
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        createdById: template.createdById
      };
    } catch (error) {
      logger.error({
        name,
        type,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to create template');
      throw error;
    }
  }

  /**
   * Update an existing template
   */
  async updateTemplate(
    templateId: string,
    updates: {
      content?: string;
      subject?: string;
      metadata?: Record<string, any>;
      isActive?: boolean;
    }
  ): Promise<Template> {
    try {
      const existing = await db.notificationTemplate.findUnique({
        where: { id: templateId }
      });

      if (!existing) {
        throw new Error(`Template not found: ${templateId}`);
      }

      let allVariables = JSON.parse(existing.variables || '[]');
      
      // Re-extract variables if content changed
      if (updates.content) {
        const extractedVariables = this.extractVariables(updates.content);
        allVariables = [...new Set([...extractedVariables])];

        // Validate new content syntax
        try {
          handlebars.compile(updates.content);
        } catch (syntaxError) {
          throw new Error(`Template syntax error: ${syntaxError instanceof Error ? syntaxError.message : String(syntaxError)}`);
        }
      }

      // Validate subject syntax if changed
      if (updates.subject) {
        try {
          handlebars.compile(updates.subject);
        } catch (syntaxError) {
          throw new Error(`Subject syntax error: ${syntaxError instanceof Error ? syntaxError.message : String(syntaxError)}`);
        }
      }

      const template = await db.notificationTemplate.update({
        where: { id: templateId },
        data: {
          content: updates.content,
          subject: updates.subject,
          variables: JSON.stringify(allVariables),
          metadata: updates.metadata ? JSON.stringify(updates.metadata) : undefined,
          isActive: updates.isActive
        }
      });

      // Clear cache
      const cacheKey = `${template.type}_${template.name}`;
      this.templateCache.delete(cacheKey);
      this.compiledTemplates.delete(`${template.type}_${template.name}_${template.version}`);

      logger.info({
        templateId,
        name: template.name,
        type: template.type
      }, 'Template updated successfully');

      return {
        id: template.id,
        name: template.name,
        type: template.type as 'email' | 'slack' | 'webhook',
        version: template.version,
        subject: template.subject,
        content: template.content,
        variables: allVariables,
        metadata: updates.metadata || JSON.parse(template.metadata || '{}'),
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        createdById: template.createdById
      };
    } catch (error) {
      logger.error({
        templateId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to update template');
      throw error;
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    try {
      const template = await db.notificationTemplate.findUnique({
        where: { id: templateId }
      });

      if (!template) {
        throw new Error(`Template not found: ${templateId}`);
      }

      await db.notificationTemplate.delete({
        where: { id: templateId }
      });

      // Clear cache
      const cacheKey = `${template.type}_${template.name}`;
      this.templateCache.delete(cacheKey);
      this.compiledTemplates.delete(`${template.type}_${template.name}_${template.version}`);

      logger.info({
        templateId,
        name: template.name,
        type: template.type
      }, 'Template deleted successfully');
    } catch (error) {
      logger.error({
        templateId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to delete template');
      throw error;
    }
  }

  /**
   * List templates with filtering
   */
  async listTemplates(
    type?: 'email' | 'slack' | 'webhook',
    activeOnly: boolean = true
  ): Promise<Template[]> {
    try {
      const templates = await db.notificationTemplate.findMany({
        where: {
          type,
          isActive: activeOnly ? true : undefined
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      return templates.map(template => ({
        id: template.id,
        name: template.name,
        type: template.type as 'email' | 'slack' | 'webhook',
        version: template.version,
        subject: template.subject,
        content: template.content,
        variables: JSON.parse(template.variables || '[]'),
        metadata: JSON.parse(template.metadata || '{}'),
        isActive: template.isActive,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        createdById: template.createdById
      }));
    } catch (error) {
      logger.error({
        type,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to list templates');
      throw error;
    }
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.templateCache.clear();
    this.compiledTemplates.clear();
    this.localeCache.clear();
    logger.info('Template cache cleared');
  }
}