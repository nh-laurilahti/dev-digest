import * as crypto from 'crypto';
import { promisify } from 'util';
import { Response } from 'express';

// Date/Time Utilities
export const dateUtils = {
  // Format date to ISO string
  toISO: (date: Date | string | number): string => {
    return new Date(date).toISOString();
  },

  // Format date for display
  formatDate: (date: Date | string | number, options?: Intl.DateTimeFormatOptions): string => {
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    return new Date(date).toLocaleDateString('en-US', { ...defaultOptions, ...options });
  },

  // Format datetime for display
  formatDateTime: (date: Date | string | number, options?: Intl.DateTimeFormatOptions): string => {
    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    return new Date(date).toLocaleString('en-US', { ...defaultOptions, ...options });
  },

  // Get relative time (e.g., "2 hours ago")
  getRelativeTime: (date: Date | string | number): string => {
    const now = new Date();
    const target = new Date(date);
    const diff = now.getTime() - target.getTime();
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
    if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
    if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    if (seconds > 30) return `${seconds} second${seconds > 1 ? 's' : ''} ago`;
    return 'just now';
  },

  // Add time to date
  addTime: (date: Date | string | number, amount: number, unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'): Date => {
    const result = new Date(date);
    
    switch (unit) {
      case 'seconds':
        result.setSeconds(result.getSeconds() + amount);
        break;
      case 'minutes':
        result.setMinutes(result.getMinutes() + amount);
        break;
      case 'hours':
        result.setHours(result.getHours() + amount);
        break;
      case 'days':
        result.setDate(result.getDate() + amount);
        break;
      case 'weeks':
        result.setDate(result.getDate() + (amount * 7));
        break;
      case 'months':
        result.setMonth(result.getMonth() + amount);
        break;
      case 'years':
        result.setFullYear(result.getFullYear() + amount);
        break;
    }
    
    return result;
  },

  // Check if date is within range
  isWithinRange: (date: Date | string | number, start: Date | string | number, end: Date | string | number): boolean => {
    const target = new Date(date).getTime();
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    return target >= startTime && target <= endTime;
  },

  // Get start/end of day, week, month, year
  getStartOf: (date: Date | string | number, unit: 'day' | 'week' | 'month' | 'year'): Date => {
    const result = new Date(date);
    
    switch (unit) {
      case 'day':
        result.setHours(0, 0, 0, 0);
        break;
      case 'week':
        result.setHours(0, 0, 0, 0);
        result.setDate(result.getDate() - result.getDay());
        break;
      case 'month':
        result.setHours(0, 0, 0, 0);
        result.setDate(1);
        break;
      case 'year':
        result.setHours(0, 0, 0, 0);
        result.setMonth(0, 1);
        break;
    }
    
    return result;
  },

  // Parse duration string (e.g., "1h 30m", "2d", "1w")
  parseDuration: (duration: string): number => {
    const regex = /(\d+)\s*([smhdwy])/g;
    let totalMs = 0;
    let match;

    while ((match = regex.exec(duration)) !== null) {
      const value = parseInt(match[1]);
      const unit = match[2];
      
      switch (unit) {
        case 's': totalMs += value * 1000; break;
        case 'm': totalMs += value * 60 * 1000; break;
        case 'h': totalMs += value * 60 * 60 * 1000; break;
        case 'd': totalMs += value * 24 * 60 * 60 * 1000; break;
        case 'w': totalMs += value * 7 * 24 * 60 * 60 * 1000; break;
        case 'y': totalMs += value * 365 * 24 * 60 * 60 * 1000; break;
      }
    }
    
    return totalMs;
  },
};

// String Utilities
export const stringUtils = {
  // Capitalize first letter
  capitalize: (str: string): string => {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  // Convert to title case
  toTitleCase: (str: string): string => {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  },

  // Convert to camelCase
  toCamelCase: (str: string): string => {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
        index === 0 ? word.toLowerCase() : word.toUpperCase()
      )
      .replace(/\s+/g, '');
  },

  // Convert to snake_case
  toSnakeCase: (str: string): string => {
    return str
      .replace(/\W+/g, ' ')
      .split(/ |\B(?=[A-Z])/)
      .map(word => word.toLowerCase())
      .join('_');
  },

  // Convert to kebab-case
  toKebabCase: (str: string): string => {
    return str
      .replace(/\W+/g, ' ')
      .split(/ |\B(?=[A-Z])/)
      .map(word => word.toLowerCase())
      .join('-');
  },

  // Generate slug from string
  slugify: (str: string): string => {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },

  // Truncate string with ellipsis
  truncate: (str: string, length: number, suffix: string = '...'): string => {
    if (str.length <= length) return str;
    return str.substring(0, length - suffix.length) + suffix;
  },

  // Extract initials from name
  getInitials: (name: string): string => {
    return name
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .join('')
      .substring(0, 3);
  },

  // Generate random string
  random: (length: number = 10, charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string => {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
  },

  // Count words in string
  wordCount: (str: string): number => {
    return str.trim().split(/\s+/).filter(word => word.length > 0).length;
  },

  // Escape HTML characters
  escapeHtml: (str: string): string => {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return str.replace(/[&<>"']/g, (match) => htmlEscapes[match]);
  },

  // Remove HTML tags
  stripHtml: (str: string): string => {
    return str.replace(/<[^>]*>/g, '');
  },
};

// Cryptographic Utilities
export const cryptoUtils = {
  // Generate secure random bytes
  randomBytes: (size: number = 32): string => {
    return crypto.randomBytes(size).toString('hex');
  },

  // Generate UUID v4
  uuid: (): string => {
    return crypto.randomUUID();
  },

  // Hash password with salt
  hashPassword: async (password: string, saltRounds: number = 12): Promise<string> => {
    const bcrypt = await import('bcrypt');
    return bcrypt.hash(password, saltRounds);
  },

  // Verify password
  verifyPassword: async (password: string, hash: string): Promise<boolean> => {
    const bcrypt = await import('bcrypt');
    return bcrypt.compare(password, hash);
  },

  // Generate HMAC
  hmac: (data: string, secret: string, algorithm: string = 'sha256'): string => {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  },

  // Generate hash
  hash: (data: string, algorithm: string = 'sha256'): string => {
    return crypto.createHash(algorithm).update(data).digest('hex');
  },

  // Encrypt data (AES-256-GCM)
  encrypt: (text: string, key: string): { encrypted: string; iv: string; tag: string } => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key.slice(0, 32)), iv);
    cipher.setAAD(Buffer.from('additional-auth-data'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    };
  },

  // Decrypt data (AES-256-GCM)
  decrypt: (encryptedData: { encrypted: string; iv: string; tag: string }, key: string): string => {
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key.slice(0, 32)), Buffer.from(encryptedData.iv, 'hex'));
    decipher.setAAD(Buffer.from('additional-auth-data'));
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  },
};

// Object Utilities
export const objectUtils = {
  // Deep clone object
  deepClone: <T>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
  },

  // Deep merge objects
  deepMerge: (target: any, ...sources: any[]): any => {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
      for (const key in source) {
        if (isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          objectUtils.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      }
    }

    return objectUtils.deepMerge(target, ...sources);
  },

  // Pick specific keys from object
  pick: <T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> => {
    const result = {} as any;
    keys.forEach(key => {
      if (key in obj) {
        result[key] = obj[key];
      }
    });
    return result as Pick<T, K>;
  },

  // Omit specific keys from object
  omit: <T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> => {
    const result = { ...obj } as any;
    keys.forEach(key => {
      delete result[key];
    });
    return result;
  },

  // Remove undefined/null values
  compact: (obj: Record<string, any>): Record<string, any> => {
    const result: Record<string, any> = {};
    Object.keys(obj).forEach(key => {
      if (obj[key] !== undefined && obj[key] !== null) {
        result[key] = obj[key];
      }
    });
    return result;
  },

  // Flatten nested object
  flatten: (obj: Record<string, any>, prefix: string = ''): Record<string, any> => {
    const result: Record<string, any> = {};
    
    Object.keys(obj).forEach(key => {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (isObject(obj[key]) && !Array.isArray(obj[key])) {
        Object.assign(result, objectUtils.flatten(obj[key], newKey));
      } else {
        result[newKey] = obj[key];
      }
    });
    
    return result;
  },
};

// Array Utilities
export const arrayUtils = {
  // Remove duplicates
  unique: <T>(arr: T[]): T[] => {
    return Array.from(new Set(arr));
  },

  // Group array by key
  groupBy: <T>(arr: T[], key: keyof T): Record<string, T[]> => {
    return arr.reduce((groups, item) => {
      const groupKey = String(item[key]);
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(item);
      return groups;
    }, {} as Record<string, T[]>);
  },

  // Chunk array into smaller arrays
  chunk: <T>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  },

  // Shuffle array
  shuffle: <T>(arr: T[]): T[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  },

  // Get random item from array
  sample: <T>(arr: T[]): T => {
    return arr[Math.floor(Math.random() * arr.length)];
  },
};

// Response Utilities
export const responseUtils = {
  // Success response
  success: <T = any>(res: Response, data: T, message?: string, statusCode: number = 200) => {
    return res.status(statusCode).json({
      success: true,
      message: message || 'Request successful',
      data,
      timestamp: new Date().toISOString(),
    });
  },

  // Paginated response
  paginated: <T = any>(
    res: Response,
    data: T[],
    pagination: {
      page: number;
      limit: number;
      total: number;
    },
    message?: string
  ) => {
    const totalPages = Math.ceil(pagination.total / pagination.limit);
    
    return res.json({
      success: true,
      message: message || 'Request successful',
      data,
      pagination: {
        ...pagination,
        totalPages,
        hasNext: pagination.page < totalPages,
        hasPrev: pagination.page > 1,
      },
      timestamp: new Date().toISOString(),
    });
  },

  // Created response
  created: <T = any>(res: Response, data: T, message?: string) => {
    return responseUtils.success(res, data, message || 'Resource created successfully', 201);
  },

  // No content response
  noContent: (res: Response) => {
    return res.status(204).send();
  },
};

// Async Utilities
export const asyncUtils = {
  // Promisify callback-based functions
  promisify: promisify,

  // Sleep/delay function
  sleep: (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  // Retry function with exponential backoff
  retry: async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    maxDelay: number = 10000
  ): Promise<T> => {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }
        
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        await asyncUtils.sleep(delay);
      }
    }
    
    throw lastError!;
  },

  // Timeout wrapper
  timeout: <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
      ),
    ]);
  },

  // Batch process array
  batchProcess: async <T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number = 10,
    delayBetweenBatches: number = 0
  ): Promise<R[]> => {
    const results: R[] = [];
    const chunks = arrayUtils.chunk(items, batchSize);
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(chunk.map(processor));
      results.push(...chunkResults);
      
      if (delayBetweenBatches > 0) {
        await asyncUtils.sleep(delayBetweenBatches);
      }
    }
    
    return results;
  },
};

// Helper function to check if value is an object
function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// File size formatter
export const formatFileSize = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Environment helpers
export const env = {
  get: (key: string, defaultValue?: string): string => {
    return process.env[key] || defaultValue || '';
  },
  
  getNumber: (key: string, defaultValue?: number): number => {
    const value = process.env[key];
    if (!value) return defaultValue || 0;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? (defaultValue || 0) : parsed;
  },
  
  getBoolean: (key: string, defaultValue?: boolean): boolean => {
    const value = process.env[key];
    if (!value) return defaultValue || false;
    return value.toLowerCase() === 'true' || value === '1';
  },
};