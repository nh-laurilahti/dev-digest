import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { 
  validateSchema,
  settingsSchemas,
} from '../lib/validation';
import {
  PERMISSIONS,
} from '../lib/rbac';
import { logger } from '../lib/logger';
import { db } from '../db';
import { NotFoundError, ForbiddenError } from '../lib/errors';

const router = Router();

// Rate limiting for settings operations (more restrictive for admin operations)
const settingsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 settings updates per 15 minutes
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Settings update rate limit exceeded.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Default system settings
const DEFAULT_SETTINGS = {
  notifications: {
    email_enabled: true,
    slack_enabled: false,
    webhook_enabled: false,
    digest_frequency: 'weekly',
    emailNotifications: {
      enabled: false,
      address: '',
      frequency: 'daily',
      format: 'html'
    },
    slackNotifications: {
      enabled: false,
      channel: '',
      username: ''
    },
    teamsNotifications: {
      enabled: false,
      webhookUrl: '',
      titleTemplate: '',
      themeColor: '0078d4'
    },
    webhookNotifications: {
      enabled: false,
      url: '',
      secret: '',
      method: 'POST',
      headers: ''
    }
  },
  system: {
    maintenance_mode: false,
    rate_limit_per_minute: 60,
    max_repositories_per_user: 50,
    job_retention_days: 30,
  },
  github: {
    api_timeout: 30000,
    rate_limit_buffer: 10,
    webhook_secret: null,
  },
  ai: {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    max_tokens: 2000,
  },
};

// Public settings that don't require admin access
const PUBLIC_SETTINGS_KEYS = [
  'system.maintenance_mode',
  'notifications.digest_frequency',
  'ai.provider',
  'ai.model',
];

// Authentication removed - all routes are now public

/**
 * Helper function to get setting by key
 */
async function getSetting(key: string): Promise<any> {
  const setting = await db.setting.findUnique({
    where: { key },
  });
  
  if (!setting) {
    // Return default value if available
    const keys = key.split('.');
    let defaultValue = DEFAULT_SETTINGS as any;
    for (const k of keys) {
      defaultValue = defaultValue?.[k];
    }
    return defaultValue;
  }
  
  return JSON.parse(setting.valueJson);
}

/**
 * Helper function to set setting by key
 */
async function setSetting(key: string, value: any): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: {
      valueJson: JSON.stringify(value),
      updatedAt: new Date(),
    },
    create: {
      key,
      valueJson: JSON.stringify(value),
    },
  });
}

/**
 * Helper function to get all settings organized by section
 */
async function getAllSettings(): Promise<any> {
  const settings = await db.setting.findMany();
  
  const organized: any = {};
  
  // Start with defaults
  Object.entries(DEFAULT_SETTINGS).forEach(([section, sectionSettings]) => {
    organized[section] = { ...sectionSettings };
  });
  
  // Override with database values
  settings.forEach(setting => {
    const keys = setting.key.split('.');
    let current = organized;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key]) current[key] = {};
      current = current[key];
    }
    
    const lastKey = keys[keys.length - 1];
    current[lastKey] = JSON.parse(setting.valueJson);
  });
  
  return organized;
}

/**
 * GET /api/v1/settings
 * Get application settings (admin only)
 */
router.get('/',
  validateSchema(settingsSchemas.query, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { section = 'all' } = req.query as any;
      
      logger.debug({
        userId: 1, // Default user ID since authentication is removed
        section,
      }, 'Getting application settings');

      const allSettings = await getAllSettings();
      
      let responseData;
      if (section === 'all') {
        responseData = allSettings;
      } else {
        responseData = allSettings[section] || {};
      }

      res.json({
        success: true,
        data: {
          settings: responseData,
          section,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/settings
 * Update application settings (admin only)
 */
router.patch('/',
  settingsRateLimit,
  validateSchema(settingsSchemas.update),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updateData = req.body;
      const userId = 1; // Default user ID since authentication is removed

      logger.info({
        userId,
        sections: Object.keys(updateData),
      }, 'Updating application settings');

      const updatedSettings: any = {};

      // Process each section update
      for (const [section, sectionUpdates] of Object.entries(updateData)) {
        if (typeof sectionUpdates === 'object' && sectionUpdates !== null) {
          updatedSettings[section] = {};
          
          // Update individual settings within the section
          for (const [key, value] of Object.entries(sectionUpdates as any)) {
            const settingKey = `${section}.${key}`;
            await setSetting(settingKey, value);
            updatedSettings[section][key] = value;
            
            logger.debug({
              userId,
              settingKey,
              value: typeof value === 'string' ? value : '[object]',
            }, 'Setting updated');
          }
        }
      }

      // Get current state of all settings for response
      const allSettings = await getAllSettings();

      res.json({
        success: true,
        data: {
          settings: allSettings,
          updated: updatedSettings,
          updatedAt: new Date().toISOString(),
        },
        message: 'Settings updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/settings/public
 * Get public settings (no admin required)
 */
router.get('/public',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      logger.debug({
        userId: 1, // Default user ID since authentication is removed
      }, 'Getting public settings');

      const publicSettings: any = {};

      // Get only public settings
      for (const key of PUBLIC_SETTINGS_KEYS) {
        const value = await getSetting(key);
        
        // Organize by section
        const [section, settingKey] = key.split('.');
        if (!publicSettings[section]) {
          publicSettings[section] = {};
        }
        publicSettings[section][settingKey] = value;
      }

      res.json({
        success: true,
        data: {
          settings: publicSettings,
          isPublic: true,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/settings/:section/:key
 * Get a specific setting value
 */
router.get('/:section/:key',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { section, key } = req.params;
      const settingKey = `${section}.${key}`;
      const userId = 1; // Default user ID since authentication is removed

      // All settings are now accessible since authentication is removed
      const isPublic = true;

      logger.debug({
        userId,
        settingKey,
        isPublic,
      }, 'Getting specific setting');

      const value = await getSetting(settingKey);

      res.json({
        success: true,
        data: {
          section,
          key,
          value,
          isPublic,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /api/v1/settings/:section/:key
 * Set a specific setting value
 */
router.put('/:section/:key',
  settingsRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { section, key } = req.params;
      const { value } = req.body;
      const settingKey = `${section}.${key}`;
      const userId = 1; // Default user ID since authentication is removed

      logger.info({
        userId,
        settingKey,
        value: typeof value === 'string' ? value : '[object]',
      }, 'Setting specific setting value');

      await setSetting(settingKey, value);

      res.json({
        success: true,
        data: {
          section,
          key,
          value,
          updatedAt: new Date().toISOString(),
        },
        message: 'Setting updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/v1/settings/:section/:key
 * Reset a setting to its default value
 */
router.delete('/:section/:key',
  settingsRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { section, key } = req.params;
      const settingKey = `${section}.${key}`;
      const userId = 1; // Default user ID since authentication is removed

      logger.info({
        userId,
        settingKey,
      }, 'Resetting setting to default');

      // Delete from database (will fall back to default)
      await db.setting.deleteMany({
        where: { key: settingKey },
      });

      // Get default value
      const defaultValue = await getSetting(settingKey);

      res.json({
        success: true,
        data: {
          section,
          key,
          value: defaultValue,
          isDefault: true,
          resetAt: new Date().toISOString(),
        },
        message: 'Setting reset to default value',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/settings/reset
 * Reset all settings to defaults
 */
router.post('/reset',
  settingsRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = 1; // Default user ID since authentication is removed

      logger.warn({
        userId,
      }, 'Resetting all settings to defaults');

      // Delete all settings from database
      const deleted = await db.setting.deleteMany({});

      res.json({
        success: true,
        data: {
          deletedCount: deleted.count,
          settings: DEFAULT_SETTINGS,
          resetAt: new Date().toISOString(),
        },
        message: 'All settings reset to default values',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/settings/export
 * Export all settings as JSON
 */
router.get('/export',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = 1; // Default user ID since authentication is removed

      logger.info({
        userId,
      }, 'Exporting all settings');

      const allSettings = await getAllSettings();

      const exportData = {
        settings: allSettings,
        exportedAt: new Date().toISOString(),
        exportedBy: {
          id: 1,
          username: 'default',
        },
        version: '1.0',
      };

      res.set({
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="settings-export.json"',
      });

      res.json(exportData);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/settings/import
 * Import settings from JSON
 */
router.post('/import',
  settingsRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { settings, overwrite = false } = req.body;
      const userId = 1; // Default user ID since authentication is removed

      if (!settings || typeof settings !== 'object') {
        throw new ValidationError('Invalid settings data');
      }

      logger.warn({
        userId,
        overwrite,
        sections: Object.keys(settings),
      }, 'Importing settings');

      let imported = 0;
      let skipped = 0;

      // Process each section
      for (const [section, sectionSettings] of Object.entries(settings)) {
        if (typeof sectionSettings === 'object' && sectionSettings !== null) {
          for (const [key, value] of Object.entries(sectionSettings as any)) {
            const settingKey = `${section}.${key}`;
            
            // Check if setting exists if not overwriting
            if (!overwrite) {
              const existing = await db.setting.findUnique({
                where: { key: settingKey },
              });
              
              if (existing) {
                skipped++;
                continue;
              }
            }

            await setSetting(settingKey, value);
            imported++;
          }
        }
      }

      res.json({
        success: true,
        data: {
          imported,
          skipped,
          overwrite,
          importedAt: new Date().toISOString(),
        },
        message: `Settings import completed. ${imported} imported, ${skipped} skipped.`,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/settings/history
 * Get settings change history (if implemented)
 */
router.get('/history',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // This would require a settings history table to be implemented
      // For now, return empty history
      res.json({
        success: true,
        data: {
          history: [],
          total: 0,
        },
        message: 'Settings history not yet implemented',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;