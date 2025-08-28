import { Request, Response, NextFunction } from 'express';

// Simplified permission map (kept for compatibility with existing imports)
export const PERMISSIONS = {
  SYSTEM_ADMIN: 'system:admin',
} as const;

export type Permission = string;

// Extend Express Request with a very loose user type for compatibility
declare global {
  namespace Express {
    interface Request {
      user?: any;
      apiKey?: any;
      authMethod?: 'jwt' | 'api_key';
    }
  }
}

// Authentication middlewares (no-op in no-user mode)
export const authenticate = async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
  next();
};

export const optionalAuthenticate = async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
  next();
};

// Authorization helpers (no-op / always allow)
export const authorize = (..._requiredPermissions: Permission[]) => {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  };
};

export const authorizeRole = (..._requiredRoles: string[]) => {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  };
};

export const authorizeOwner = (_userIdField: string = 'userId') => {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  };
};

export const adminOnly = authorize(PERMISSIONS.SYSTEM_ADMIN);

export const hasPermission = (_user: any, _permission: Permission): boolean => true;
export const hasRole = (_user: any, _roleName: string): boolean => true;
export const getUserPermissions = (_user: any): string[] => [];

// Misc middlewares (pass-through)
export const authRateLimit = (_maxAttempts: number = 5, _windowMs: number = 15 * 60 * 1000) => {
  return (_req: Request, _res: Response, next: NextFunction): void => next();
};

export const csrfProtection = (_req: Request, _res: Response, next: NextFunction): void => {
  next();
};

export const securityHeaders = (_req: Request, res: Response, next: NextFunction): void => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
};

export const validateSession = async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
  next();
};

export const ROLES = {
  ADMIN: { name: 'admin', description: 'Administrator', permissions: [PERMISSIONS.SYSTEM_ADMIN] },
  MAINTAINER: { name: 'maintainer', description: 'Maintainer', permissions: [PERMISSIONS.SYSTEM_ADMIN] },
  USER: { name: 'user', description: 'User', permissions: [] },
  VIEWER: { name: 'viewer', description: 'Viewer', permissions: [] },
} as const;