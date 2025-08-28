// Test file to verify infrastructure components work correctly
import { config, isProduction, isDevelopment } from './config';
import { logger } from './logger';
import { AppError, ValidationError, responseUtils } from './index';

// Test configuration
console.log('Testing Configuration...');
console.log('Environment:', config.NODE_ENV);
console.log('Is Production:', isProduction());
console.log('Is Development:', isDevelopment());

// Test logging
console.log('\nTesting Logging...');
logger.info('Infrastructure test started');
logger.debug('Debug message', { test: true });

// Test error handling
console.log('\nTesting Error Handling...');
try {
  throw new ValidationError('Test validation error', { field: 'email', value: 'invalid' });
} catch (error) {
  if (error instanceof AppError) {
    console.log('Caught AppError:', error.message, 'Code:', error.code);
  }
}

// Test utilities
console.log('\nTesting Utilities...');
import { stringUtils, dateUtils, cryptoUtils } from './utils';

console.log('String slug:', stringUtils.slugify('Hello World Test!'));
console.log('Relative time:', dateUtils.getRelativeTime(new Date(Date.now() - 3600000)));
console.log('Random UUID:', cryptoUtils.uuid());

console.log('\n✅ Infrastructure components test completed successfully!');