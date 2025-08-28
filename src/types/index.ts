// Core digest types
export * from './digest';

// GitHub integration types
export * from './github';

// Additional utility types
export interface ErrorResponse {
  error: string;
  message: string;
  details?: any;
  timestamp: string;
}

export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp: string;
}

export interface PaginatedResponse<T = any> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface JobStatus {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: any;
}