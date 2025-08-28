import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { prisma } from './client';

// Database migration utilities
export class DatabaseMigrator {
  private readonly schemaPath: string;
  private readonly migrationsPath: string;
  
  constructor() {
    this.schemaPath = join(__dirname, 'schema.prisma');
    this.migrationsPath = join(__dirname, '..', '..', 'prisma', 'migrations');
  }

  /**
   * Initialize the database with the current schema
   * This is used for development and initial setup
   */
  async initializeDatabase(): Promise<void> {
    try {
      console.log('🗄️  Initializing database...');
      
      // Push schema changes to database
      execSync('npx prisma db push --schema=./src/db/schema.prisma', {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Generate Prisma client
   */
  async generateClient(): Promise<void> {
    try {
      console.log('🔄 Generating Prisma client...');
      
      execSync('npx prisma generate --schema=./src/db/schema.prisma', {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      console.log('✅ Prisma client generated successfully');
    } catch (error) {
      console.error('❌ Failed to generate Prisma client:', error);
      throw error;
    }
  }

  /**
   * Create a new migration
   */
  async createMigration(name: string): Promise<void> {
    try {
      console.log(`📝 Creating migration: ${name}`);
      
      // Ensure migrations directory exists
      if (!existsSync(this.migrationsPath)) {
        mkdirSync(this.migrationsPath, { recursive: true });
      }
      
      execSync(`npx prisma migrate dev --name ${name} --schema=./src/db/schema.prisma`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      console.log('✅ Migration created successfully');
    } catch (error) {
      console.error('❌ Failed to create migration:', error);
      throw error;
    }
  }

  /**
   * Apply pending migrations
   */
  async applyMigrations(): Promise<void> {
    try {
      console.log('🔄 Applying migrations...');
      
      execSync('npx prisma migrate deploy --schema=./src/db/schema.prisma', {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      console.log('✅ Migrations applied successfully');
    } catch (error) {
      console.error('❌ Failed to apply migrations:', error);
      throw error;
    }
  }

  /**
   * Reset the database (dev only)
   */
  async resetDatabase(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database reset is not allowed in production');
    }
    
    try {
      console.log('🔄 Resetting database...');
      
      execSync('npx prisma migrate reset --force --schema=./src/db/schema.prisma', {
        stdio: 'inherit',
        cwd: process.cwd()
      });
      
      console.log('✅ Database reset successfully');
    } catch (error) {
      console.error('❌ Failed to reset database:', error);
      throw error;
    }
  }

  /**
   * Validate database connection and schema
   */
  async validateDatabase(): Promise<boolean> {
    try {
      console.log('🔍 Validating database...');
      
      // Test connection
      await prisma.$queryRaw`SELECT 1`;
      
      // Validate schema
      execSync('npx prisma validate --schema=./src/db/schema.prisma', {
        stdio: 'pipe',
        cwd: process.cwd()
      });
      
      console.log('✅ Database validation successful');
      return true;
    } catch (error) {
      console.error('❌ Database validation failed:', error);
      return false;
    }
  }

  /**
   * Get migration status
   */
  async getMigrationStatus(): Promise<void> {
    try {
      console.log('📊 Migration Status:');
      
      execSync('npx prisma migrate status --schema=./src/db/schema.prisma', {
        stdio: 'inherit',
        cwd: process.cwd()
      });
    } catch (error) {
      console.error('❌ Failed to get migration status:', error);
      throw error;
    }
  }

  /**
   * Create database backup (SQLite only)
   */
  async createBackup(backupPath?: string): Promise<string> {
    if (!process.env.DATABASE_URL?.includes('sqlite') && !process.env.DATABASE_URL?.includes('file:')) {
      throw new Error('Backup is currently only supported for SQLite databases');
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultBackupPath = `./backups/backup-${timestamp}.db`;
      const finalBackupPath = backupPath || defaultBackupPath;

      // Ensure backup directory exists
      const backupDir = join(process.cwd(), 'backups');
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }

      console.log(`💾 Creating database backup: ${finalBackupPath}`);

      // For SQLite, we can simply copy the database file
      const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './devdigest.db';
      execSync(`cp "${dbPath}" "${finalBackupPath}"`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });

      console.log('✅ Backup created successfully');
      return finalBackupPath;
    } catch (error) {
      console.error('❌ Failed to create backup:', error);
      throw error;
    }
  }

  /**
   * Restore database from backup (SQLite only)
   */
  async restoreFromBackup(backupPath: string): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database restore is not allowed in production');
    }

    if (!process.env.DATABASE_URL?.includes('sqlite') && !process.env.DATABASE_URL?.includes('file:')) {
      throw new Error('Restore is currently only supported for SQLite databases');
    }

    try {
      console.log(`🔄 Restoring database from: ${backupPath}`);

      if (!existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`);
      }

      // Disconnect Prisma client
      await prisma.$disconnect();

      // Copy backup over current database
      const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './devdigest.db';
      execSync(`cp "${backupPath}" "${dbPath}"`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });

      console.log('✅ Database restored successfully');
    } catch (error) {
      console.error('❌ Failed to restore database:', error);
      throw error;
    }
  }
}

// CLI interface
export async function runMigrationCommand(command: string, ...args: string[]): Promise<void> {
  const migrator = new DatabaseMigrator();

  switch (command) {
    case 'init':
      await migrator.initializeDatabase();
      break;
      
    case 'generate':
      await migrator.generateClient();
      break;
      
    case 'create':
      if (!args[0]) {
        throw new Error('Migration name is required');
      }
      await migrator.createMigration(args[0]);
      break;
      
    case 'apply':
    case 'deploy':
      await migrator.applyMigrations();
      break;
      
    case 'reset':
      await migrator.resetDatabase();
      break;
      
    case 'validate':
      await migrator.validateDatabase();
      break;
      
    case 'status':
      await migrator.getMigrationStatus();
      break;
      
    case 'backup':
      await migrator.createBackup(args[0]);
      break;
      
    case 'restore':
      if (!args[0]) {
        throw new Error('Backup path is required');
      }
      await migrator.restoreFromBackup(args[0]);
      break;
      
    case 'setup':
      // Complete setup: init + generate + seed
      await migrator.initializeDatabase();
      await migrator.generateClient();
      const { seed } = await import('./seed');
      await seed();
      break;
      
    default:
      console.error(`Unknown command: ${command}`);
      console.log('Available commands:');
      console.log('  init      - Initialize database with current schema');
      console.log('  generate  - Generate Prisma client');
      console.log('  create    - Create a new migration');
      console.log('  apply     - Apply pending migrations');
      console.log('  reset     - Reset database (dev only)');
      console.log('  validate  - Validate database connection and schema');
      console.log('  status    - Show migration status');
      console.log('  backup    - Create database backup (SQLite only)');
      console.log('  restore   - Restore from backup (SQLite only)');
      console.log('  setup     - Complete setup (init + generate + seed)');
      process.exit(1);
  }
}

// Run CLI if called directly
if (require.main === module) {
  const [,, command, ...args] = process.argv;
  
  if (!command) {
    console.error('Command is required');
    process.exit(1);
  }
  
  runMigrationCommand(command, ...args)
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export default DatabaseMigrator;