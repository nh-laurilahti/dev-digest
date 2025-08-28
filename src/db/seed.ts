import { PrismaClient } from './generated';
import { hashPassword, safeJsonStringify } from './utils';

const prisma = new PrismaClient();

// Import permissions from auth system
import { ROLES } from '../lib/auth';

// Default roles and permissions using the standardized permission system
const DEFAULT_ROLES = [
  {
    name: ROLES.ADMIN.name,
    description: ROLES.ADMIN.description,
    permissions: ROLES.ADMIN.permissions
  },
  {
    name: ROLES.MAINTAINER.name,
    description: ROLES.MAINTAINER.description,
    permissions: ROLES.MAINTAINER.permissions
  },
  {
    name: ROLES.USER.name,
    description: ROLES.USER.description,
    permissions: ROLES.USER.permissions
  },
  {
    name: ROLES.VIEWER.name,
    description: ROLES.VIEWER.description,
    permissions: ROLES.VIEWER.permissions
  }
];

// Default application settings
const DEFAULT_SETTINGS = {
  // Application branding
  app_name: 'Daily Dev Digest',
  app_description: 'Automated GitHub repository digest generation system',
  
  // Digest settings
  default_digest_days: 7,
  max_digest_days: 90,
  min_digest_days: 1,
  default_detail_level: 'concise',
  digest_retention_days: 365,
  
  // AI settings
  enable_ai_summaries: false, // Disabled by default
  ai_provider: 'openai',
  ai_model: 'gpt-3.5-turbo',
  ai_max_tokens: 1000,
  
  // Notification settings
  enable_slack_notifications: true,
  enable_email_notifications: true,
  enable_web_notifications: true,
  notification_retry_attempts: 3,
  
  // Job settings
  job_timeout_minutes: 30,
  max_concurrent_jobs: 5,
  job_retry_attempts: 3,
  
  // Rate limiting
  rate_limit_per_hour: 100,
  rate_limit_per_hour_authenticated: 1000,
  digest_rate_limit_per_hour: 10,
  
  // Security settings
  session_timeout_hours: 24,
  api_key_default_expiry_days: 365,
  require_email_verification: false,
  
  // GitHub integration
  github_api_timeout_seconds: 30,
  github_rate_limit_buffer: 100,
  
  // Webhook settings
  webhook_timeout_seconds: 10,
  webhook_retry_attempts: 3,
  
  // Maintenance settings
  cleanup_interval_hours: 24,
  cleanup_expired_sessions_days: 7,
  cleanup_old_jobs_days: 30,
  cleanup_old_notifications_days: 90
};

// Sample repositories for demonstration
const SAMPLE_REPOS = [
  {
    path: 'microsoft/typescript',
    name: 'TypeScript',
    description: 'TypeScript is a superset of JavaScript that compiles to clean JavaScript output.',
    defaultBranch: 'main'
  },
  {
    path: 'facebook/react',
    name: 'React',
    description: 'The library for web and native user interfaces.',
    defaultBranch: 'main'
  },
  {
    path: 'nodejs/node',
    name: 'Node.js',
    description: 'Node.js JavaScript runtime.',
    defaultBranch: 'main'
  },
  {
    path: 'vercel/next.js',
    name: 'Next.js',
    description: 'The React Framework for the Web.',
    defaultBranch: 'canary'
  },
  {
    path: 'prisma/prisma',
    name: 'Prisma',
    description: 'Next-generation Node.js and TypeScript ORM.',
    defaultBranch: 'main'
  },
  {
    path: 'mattermost/mattermost',
    name: 'Mattermost',
    description: 'Open source platform for secure collaboration across the entire software development lifecycle.',
    defaultBranch: 'master'
  },
  {
    path: 'kubernetes/kubernetes',
    name: 'Kubernetes',
    description: 'Production-grade container orchestration.',
    defaultBranch: 'master'
  },
  {
    path: 'rust-lang/rust',
    name: 'Rust',
    description: 'Empowering everyone to build reliable and efficient software.',
    defaultBranch: 'master'
  },
  {
    path: 'denoland/deno',
    name: 'Deno',
    description: 'A modern runtime for JavaScript and TypeScript.',
    defaultBranch: 'main'
  },
  {
    path: 'vitejs/vite',
    name: 'Vite',
    description: 'Next generation frontend tooling.',
    defaultBranch: 'main'
  }
];

// Seed function
async function seed() {
  console.log('🌱 Starting database seed...');
  
  try {
    // Clear existing data in development
    if (process.env.NODE_ENV === 'development') {
      console.log('🧹 Cleaning existing data for development...');
      
      // Delete in correct order due to foreign key constraints
      await prisma.webhookDelivery.deleteMany();
      await prisma.webhookConfig.deleteMany();
      await prisma.session.deleteMany();
      await prisma.notification.deleteMany();
      await prisma.job.deleteMany();
      await prisma.digest.deleteMany();
      await prisma.userPreference.deleteMany();
      await prisma.apiKey.deleteMany();
      await prisma.userRole.deleteMany();
      await prisma.role.deleteMany();
      await prisma.repo.deleteMany();
      await prisma.setting.deleteMany();
      await prisma.user.deleteMany();
    }
    
    // Create roles
    console.log('👥 Creating default roles...');
    for (const roleData of DEFAULT_ROLES) {
      await prisma.role.upsert({
        where: { name: roleData.name },
        update: {
          description: roleData.description,
          permissions: safeJsonStringify(roleData.permissions)
        },
        create: {
          name: roleData.name,
          description: roleData.description,
          permissions: safeJsonStringify(roleData.permissions)
        }
      });
    }
    
    // Create default admin user
    console.log('👤 Creating default admin user...');
    const adminPasswordHash = await hashPassword('admin123'); // Change this in production!
    
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@devdigest.local' },
      update: {},
      create: {
        username: 'admin',
        email: 'admin@devdigest.local',
        passwordHash: adminPasswordHash,
        fullName: 'System Administrator',
        isActive: true
      }
    });
    
    // Assign admin role to admin user
    const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
    if (adminRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: adminUser.id,
            roleId: adminRole.id
          }
        },
        update: {},
        create: {
          userId: adminUser.id,
          roleId: adminRole.id
        }
      });
    }
    
    // Create admin user preferences
    await prisma.userPreference.upsert({
      where: { userId: adminUser.id },
      update: {},
      create: {
        userId: adminUser.id,
        frequency: 'weekly',
        channels: safeJsonStringify(['web', 'email']),
        detailLevel: 'detailed',
        subscribedRepoIds: safeJsonStringify([]),
        isEnabled: true
      }
    });
    
    // Create demo user
    console.log('👤 Creating demo user...');
    const demoPasswordHash = await hashPassword('demo1234');
    
    const demoUser = await prisma.user.upsert({
      where: { email: 'demo@example.com' },
      update: {},
      create: {
        username: 'demo',
        email: 'demo@example.com',
        passwordHash: demoPasswordHash,
        fullName: 'Demo User',
        isActive: true
      }
    });
    
    // Assign maintainer role to demo user
    const maintainerRole = await prisma.role.findUnique({ where: { name: 'maintainer' } });
    if (maintainerRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: demoUser.id,
            roleId: maintainerRole.id
          }
        },
        update: {},
        create: {
          userId: demoUser.id,
          roleId: maintainerRole.id
        }
      });
    }
    
    // Create demo user preferences
    await prisma.userPreference.upsert({
      where: { userId: demoUser.id },
      update: {},
      create: {
        userId: demoUser.id,
        frequency: 'weekly',
        channels: safeJsonStringify(['web']),
        detailLevel: 'concise',
        subscribedRepoIds: safeJsonStringify([]),
        isEnabled: true
      }
    });
    
    // Create sample repositories
    console.log('📁 Creating sample repositories...');
    const createdRepos = [] as Array<{ id: number; path: string; name: string }>;
    for (const repoData of SAMPLE_REPOS) {
      const repo = await prisma.repo.upsert({
        where: { path: repoData.path },
        update: {
          name: repoData.name,
          description: repoData.description,
          defaultBranch: repoData.defaultBranch
        },
        create: {
          path: repoData.path,
          name: repoData.name,
          description: repoData.description,
          active: true,
          defaultBranch: repoData.defaultBranch
        }
      });
      createdRepos.push(repo as any);
    }
    
    // Ensure at least one repo exists
    const firstRepo = createdRepos[0]!;
    
    // Update user preferences to subscribe to first two repos
    const subscribedRepoIds = createdRepos.slice(0, 2).map(repo => repo.id);
    
    await prisma.userPreference.update({
      where: { userId: adminUser.id },
      data: {
        subscribedRepoIds: safeJsonStringify(subscribedRepoIds)
      }
    });
    
    await prisma.userPreference.update({
      where: { userId: demoUser.id },
      data: {
        subscribedRepoIds: safeJsonStringify(subscribedRepoIds)
      }
    });
    
    // Create application settings
    console.log('⚙️ Creating application settings...');
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await prisma.setting.upsert({
        where: { key },
        update: { valueJson: safeJsonStringify(value) },
        create: {
          key,
          valueJson: safeJsonStringify(value)
        }
      });
    }
    
    // Create sample digest data (for demonstration)
    console.log('📊 Creating sample digest data...');
    const sampleDigest = await prisma.digest.create({
      data: {
        repoId: firstRepo.id, // TypeScript repo
        dateFrom: new Date('2024-01-01'),
        dateTo: new Date('2024-01-08'),
        summaryMd: `# Weekly Digest - ${firstRepo.name}

## 📈 Summary Statistics
- **Pull Requests**: 15 merged, 3 pending
- **Contributors**: 8 unique contributors
- **Lines Added**: 1,247
- **Lines Removed**: 623
- **Files Changed**: 42

## 🚀 New Features
- Added new type inference improvements
- Enhanced error messages for better developer experience
- Introduced new compiler optimizations

## 🐛 Bug Fixes
- Fixed issue with type checking in generic functions
- Resolved memory leak in compiler
- Corrected edge case in type resolution

## 👥 Top Contributors
- @contributor1 (5 PRs)
- @contributor2 (3 PRs)
- @contributor3 (2 PRs)

*Generated on ${new Date().toLocaleDateString()}*`,
        summaryHtml: `<h1>Weekly Digest - ${firstRepo.name}</h1>
<h2>📈 Summary Statistics</h2>
<ul>
  <li><strong>Pull Requests</strong>: 15 merged, 3 pending</li>
  <li><strong>Contributors</strong>: 8 unique contributors</li>
  <li><strong>Lines Added</strong>: 1,247</li>
  <li><strong>Lines Removed</strong>: 623</li>
  <li><strong>Files Changed</strong>: 42</li>
</ul>
<h2>🚀 New Features</h2>
<ul>
  <li>Added new type inference improvements</li>
  <li>Enhanced error messages for better developer experience</li>
  <li>Introduced new compiler optimizations</li>
</ul>
<h2>🐛 Bug Fixes</h2>
<ul>
  <li>Fixed issue with type checking in generic functions</li>
  <li>Resolved memory leak in compiler</li>
  <li>Corrected edge case in type resolution</li>
</ul>
<h2>👥 Top Contributors</h2>
<ul>
  <li>@contributor1 (5 PRs)</li>
  <li>@contributor2 (3 PRs)</li>
  <li>@contributor3 (2 PRs)</li>
</ul>
<p><em>Generated on ${new Date().toLocaleDateString()}</em></p>`,
        statsJson: safeJsonStringify({
          total_prs: 18,
          merged_prs: 15,
          pending_prs: 3,
          contributors: 8,
          lines_added: 1247,
          lines_removed: 623,
          files_changed: 42,
          commits: 23,
          issues_referenced: 7,
          reviews_completed: 12
        }),
        createdById: adminUser.id
      }
    });
    
    // Create a completed job for the sample digest
    await prisma.job.create({
      data: {
        type: 'digest',
        status: 'COMPLETED',
        progress: 100,
        paramsJson: safeJsonStringify({
          repo_path: firstRepo.path,
          days: 7,
          include_ai_summary: false
        }),
        startedAt: new Date(Date.now() - 60000), // 1 minute ago
        finishedAt: new Date(Date.now() - 30000), // 30 seconds ago
        createdById: adminUser.id,
        digestId: sampleDigest.id
      }
    });
    
    // Create sample notification
    await prisma.notification.create({
      data: {
        type: 'digest_completed',
        channel: 'web',
        recipientId: adminUser.id,
        digestId: sampleDigest.id,
        message: `Digest completed for ${firstRepo.name} (Jan 1-8, 2024)`,
        status: 'sent',
        sentAt: new Date()
      }
    });
    
    console.log('✅ Database seed completed successfully!');
    console.log('\n📊 Seed Summary:');
    console.log(`• Created ${DEFAULT_ROLES.length} roles`);
    console.log(`• Created 2 users (admin, demo)`);
    console.log(`• Created ${SAMPLE_REPOS.length} sample repositories`);
    console.log(`• Created ${Object.keys(DEFAULT_SETTINGS).length} application settings`);
    console.log(`• Created 1 sample digest`);
    console.log('\n🔐 Default Login Credentials:');
    console.log('Admin: admin@devdigest.local / admin123');
    console.log('Demo:  demo@example.com / demo1234');
    console.log('\n⚠️  Remember to change default passwords in production!');
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Run seed if called directly
if (require.main === module) {
  seed()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seed };
export default seed;