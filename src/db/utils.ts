import { prisma, type Prisma } from './client';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

// Password utilities
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

// API Key utilities
export const generateApiKey = (): string => {
  // Generate a random 32-byte key and encode it as base64
  const keyBuffer = randomBytes(32);
  return `ddd_ak_${keyBuffer.toString('base64url')}`;
};

export const hashApiKey = async (apiKey: string): Promise<string> => {
  return await bcrypt.hash(apiKey, 10);
};

export const verifyApiKey = async (apiKey: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(apiKey, hash);
};

// Session utilities
export const generateSessionToken = (): string => {
  return randomBytes(32).toString('base64url');
};

// JSON utilities for safe JSON handling
export const safeJsonParse = <T>(jsonString: string, fallback: T): T => {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
};

export const safeJsonStringify = (obj: any): string => {
  try {
    return JSON.stringify(obj);
  } catch {
    return '{}';
  }
};

// User utilities
export const findUserByEmail = async (email: string) => {
  return await prisma.user.findUnique({
    where: { email },
    include: {
      roles: {
        include: {
          role: true
        }
      },
      preferences: true
    }
  });
};

export const findUserByUsername = async (username: string) => {
  return await prisma.user.findUnique({
    where: { username },
    include: {
      roles: {
        include: {
          role: true
        }
      },
      preferences: true
    }
  });
};

export const findUserById = async (id: number) => {
  return await prisma.user.findUnique({
    where: { id },
    include: {
      roles: {
        include: {
          role: true
        }
      },
      preferences: true
    }
  });
};

export const getUserPermissions = async (userId: number): Promise<string[]> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: {
        include: {
          role: true
        }
      }
    }
  });

  if (!user) return [];

  const allPermissions = user.roles.flatMap(userRole => 
    safeJsonParse<string[]>(userRole.role.permissions, [])
  );

  // Remove duplicates
  return [...new Set(allPermissions)];
};

export const userHasPermission = async (userId: number, permission: string): Promise<boolean> => {
  const permissions = await getUserPermissions(userId);
  return permissions.includes(permission) || permissions.includes('*'); // '*' for admin
};

// Repository utilities
export const findRepoByPath = async (path: string) => {
  return await prisma.repo.findUnique({
    where: { path }
  });
};

export const getActiveRepos = async () => {
  return await prisma.repo.findMany({
    where: { active: true },
    orderBy: { name: 'asc' }
  });
};

// Settings utilities
export const getSetting = async <T>(key: string, defaultValue: T): Promise<T> => {
  const setting = await prisma.setting.findUnique({
    where: { key }
  });
  
  if (!setting) return defaultValue;
  
  return safeJsonParse<T>(setting.valueJson, defaultValue);
};

export const setSetting = async <T>(key: string, value: T): Promise<void> => {
  await prisma.setting.upsert({
    where: { key },
    update: { 
      valueJson: safeJsonStringify(value)
    },
    create: { 
      key, 
      valueJson: safeJsonStringify(value)
    }
  });
};

export const getMultipleSettings = async <T extends Record<string, any>>(
  keys: string[],
  defaults: T
): Promise<T> => {
  const settings = await prisma.setting.findMany({
    where: {
      key: { in: keys }
    }
  });

  const result = { ...defaults };
  
  settings.forEach(setting => {
    if (setting.key in defaults) {
      result[setting.key as keyof T] = safeJsonParse(
        setting.valueJson,
        defaults[setting.key as keyof T]
      );
    }
  });

  return result;
};

// Job utilities
export const createJob = async (
  type: string,
  createdById: number,
  params: Record<string, any>,
  digestId?: number
) => {
  return await prisma.job.create({
    data: {
      type,
      status: 'PENDING',
      progress: 0,
      paramsJson: safeJsonStringify(params),
      createdById,
      digestId
    }
  });
};

export const updateJobStatus = async (
  jobId: string,
  status: string,
  progress?: number,
  error?: string
) => {
  const updateData: Prisma.JobUpdateInput = {
    status,
    ...(progress !== undefined && { progress }),
    ...(error && { error }),
    ...(status === 'RUNNING' && !progress && { startedAt: new Date() }),
    ...((['COMPLETED', 'FAILED'].includes(status)) && { finishedAt: new Date() })
  };

  return await prisma.job.update({
    where: { id: jobId },
    data: updateData
  });
};

export const getJobsByStatus = async (status: string | string[]) => {
  const statusFilter = Array.isArray(status) ? { in: status } : status;
  
  return await prisma.job.findMany({
    where: { status: statusFilter },
    include: {
      createdBy: {
        select: { id: true, username: true, fullName: true }
      },
      digest: {
        select: { id: true, repoId: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
};

// Digest utilities
export const findDigestById = async (id: number) => {
  return await prisma.digest.findUnique({
    where: { id },
    include: {
      repo: true,
      createdBy: {
        select: { id: true, username: true, fullName: true }
      }
    }
  });
};

export const getDigestStats = async (digestId: number) => {
  const digest = await findDigestById(digestId);
  if (!digest) return null;
  
  return safeJsonParse(digest.statsJson, {});
};

export const getDigestsByRepo = async (repoId: number, limit = 20, offset = 0) => {
  return await prisma.digest.findMany({
    where: { repoId },
    include: {
      repo: true,
      createdBy: {
        select: { id: true, username: true, fullName: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset
  });
};

// Notification utilities
export const createNotification = async (
  type: string,
  channel: string,
  recipientId: number,
  message: string,
  digestId?: number,
  subject?: string,
  metadata?: Record<string, any>
) => {
  return await prisma.notification.create({
    data: {
      type,
      channel,
      recipientId,
      message,
      digestId,
      subject,
      metadata: metadata ? safeJsonStringify(metadata) : null
    }
  });
};

export const markNotificationSent = async (id: number, error?: string) => {
  return await prisma.notification.update({
    where: { id },
    data: {
      status: error ? 'failed' : 'sent',
      sentAt: new Date(),
      error
    }
  });
};

export const getPendingNotifications = async (channel?: string) => {
  return await prisma.notification.findMany({
    where: {
      status: 'pending',
      ...(channel && { channel })
    },
    include: {
      recipient: {
        select: { id: true, username: true, email: true, fullName: true }
      },
      digest: {
        select: { id: true, summaryMd: true, summaryHtml: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  });
};

// Database maintenance utilities
export const cleanupExpiredSessions = async (): Promise<number> => {
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date()
      }
    }
  });
  
  return result.count;
};

export const cleanupOldJobs = async (daysToKeep = 30): Promise<number> => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await prisma.job.deleteMany({
    where: {
      status: { in: ['COMPLETED', 'FAILED'] },
      finishedAt: {
        lt: cutoffDate
      }
    }
  });

  return result.count;
};

export const cleanupOldNotifications = async (daysToKeep = 90): Promise<number> => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const result = await prisma.notification.deleteMany({
    where: {
      status: { in: ['sent', 'failed'] },
      sentAt: {
        lt: cutoffDate
      }
    }
  });

  return result.count;
};

// Database statistics
export const getDatabaseStats = async () => {
  const [
    totalUsers,
    activeUsers,
    totalRepos,
    activeRepos,
    totalDigests,
    runningJobs,
    pendingNotifications
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.repo.count(),
    prisma.repo.count({ where: { active: true } }),
    prisma.digest.count(),
    prisma.job.count({ where: { status: 'RUNNING' } }),
    prisma.notification.count({ where: { status: 'pending' } })
  ]);

  return {
    users: { total: totalUsers, active: activeUsers },
    repos: { total: totalRepos, active: activeRepos },
    digests: { total: totalDigests },
    jobs: { running: runningJobs },
    notifications: { pending: pendingNotifications }
  };
};