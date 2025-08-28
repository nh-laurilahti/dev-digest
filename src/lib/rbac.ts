import { Request, Response, NextFunction } from 'express';

export const PERMISSIONS = {
  SYSTEM_ADMIN: 'system:admin',
} as const;

export const DEFAULT_ROLES = {
  ADMIN: { name: 'admin', description: 'Administrator', permissions: [PERMISSIONS.SYSTEM_ADMIN] },
} as const;

declare global {
  namespace Express {
    interface Request {
      user?: any;
      permissions?: string[];
    }
  }
}

export async function getUserPermissions(_userId: number): Promise<string[]> {
  return [];
}

export function hasPermission(_userPermissions: string[], _requiredPermission: string | string[]): boolean {
  return true;
}

export function hasAnyPermission(_userPermissions: string[], _requiredPermissions: string[]): boolean {
  return true;
}

export const loadPermissions = async (_req: Request, _res: Response, next: NextFunction): Promise<void> => {
  next();
};

export const requireAuth = (_req: Request, _res: Response, next: NextFunction): void => {
  next();
};

export const requirePermission = (_permission: string | string[]) => {
  return (_req: Request, _res: Response, next: NextFunction): void => next();
};

export const requireAnyPermission = (_permissions: string[]) => {
  return (_req: Request, _res: Response, next: NextFunction): void => next();
};

export const requireAdmin = (_req: Request, _res: Response, next: NextFunction): void => {
  next();
};

export const requireOwnership = (_getResourceUserId: (req: Request) => Promise<number | null> | number | null) => {
  return async (_req: Request, _res: Response, next: NextFunction): Promise<void> => next();
};

export async function initializeDefaultRoles(): Promise<void> {}
export async function assignRole(_userId: number, _roleName: string): Promise<boolean> { return true; }
export async function removeRole(_userId: number, _roleName: string): Promise<boolean> { return true; }