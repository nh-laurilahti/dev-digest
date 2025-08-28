import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { performance } from 'perf_hooks';

// Performance test setup
beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.JWT_SECRET = 'test-secret-key-for-performance-tests';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/digest_performance_test';
  
  console.log('Performance test environment initialized');
});

afterAll(async () => {
  console.log('Performance test cleanup completed');
});

beforeEach(() => {
  // Reset performance measurements
  performance.clearMarks();
  performance.clearMeasures();
});

afterEach(() => {
  // Clean up performance data
  performance.clearMarks();
  performance.clearMeasures();
});

// Performance testing utilities
declare global {
  var perfUtils: {
    startTimer: (name: string) => void;
    endTimer: (name: string) => number;
    measureMemoryUsage: () => NodeJS.MemoryUsage;
    createLoadTestData: (count: number) => any[];
    benchmarkFunction: (fn: Function, iterations: number) => Promise<{
      averageTime: number;
      minTime: number;
      maxTime: number;
      totalTime: number;
      iterations: number;
    }>;
    stressTest: (fn: Function, concurrent: number, duration: number) => Promise<{
      totalRequests: number;
      successfulRequests: number;
      failedRequests: number;
      averageResponseTime: number;
      requestsPerSecond: number;
    }>;
  };
}

globalThis.perfUtils = {
  startTimer: (name: string) => {
    performance.mark(`${name}-start`);
  },

  endTimer: (name: string) => {
    performance.mark(`${name}-end`);
    performance.measure(name, `${name}-start`, `${name}-end`);
    const measure = performance.getEntriesByName(name, 'measure')[0];
    return measure.duration;
  },

  measureMemoryUsage: () => {
    return process.memoryUsage();
  },

  createLoadTestData: (count: number) => {
    const data: any[] = [];
    for (let i = 0; i < count; i++) {
      data.push({
        id: i,
        name: `test-item-${i}`,
        description: `Test item ${i} for load testing`,
        timestamp: new Date(),
        data: {
          field1: `value-${i}`,
          field2: Math.random() * 1000,
          field3: i % 2 === 0,
          field4: Array.from({ length: 10 }, (_, j) => `item-${i}-${j}`),
        },
      });
    }
    return data;
  },

  benchmarkFunction: async (fn: Function, iterations: number) => {
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      times.push(end - start);
    }

    const totalTime = times.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / iterations;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    return {
      averageTime,
      minTime,
      maxTime,
      totalTime,
      iterations,
    };
  },

  stressTest: async (fn: Function, concurrent: number, duration: number) => {
    const startTime = Date.now();
    const endTime = startTime + duration;
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    const responseTimes: number[] = [];

    const runConcurrentTest = async () => {
      while (Date.now() < endTime) {
        const promises: Promise<void>[] = [];
        
        for (let i = 0; i < concurrent; i++) {
          promises.push(
            (async () => {
              const requestStart = performance.now();
              try {
                await fn();
                successfulRequests++;
              } catch {
                failedRequests++;
              }
              const requestEnd = performance.now();
              responseTimes.push(requestEnd - requestStart);
              totalRequests++;
            })()
          );
        }

        await Promise.all(promises);
        
        // Small delay to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };

    await runConcurrentTest();

    const actualDuration = Date.now() - startTime;
    const averageResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
    const requestsPerSecond = (totalRequests / actualDuration) * 1000;

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      requestsPerSecond,
    };
  },
};