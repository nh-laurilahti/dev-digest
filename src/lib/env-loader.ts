import { config } from 'dotenv';
import { join } from 'path';

/**
 * Force load .env file and override environment variables
 * This ensures .env values take precedence over existing env vars
 */
export function loadEnvFile(): void {
  const envPath = join(process.cwd(), '.env');
  
  const result = config({ 
    path: envPath, 
    debug: true,
    override: true // This forces overwriting of existing environment variables
  });
  
  if (result.error) {
    console.warn('⚠️  .env file not found, using system environment variables');
  } else {
    console.log('✅ .env file loaded and environment variables overridden');
  }
}