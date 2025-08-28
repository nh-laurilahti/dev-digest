"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("vitest/config");
const path_1 = require("path");
exports.default = (0, config_1.defineConfig)({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./tests/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                'tests/',
                '**/*.d.ts',
                '**/*.config.*',
                'src/db/generated/',
            ],
        },
        pool: 'threads',
        poolOptions: {
            threads: {
                singleThread: true,
            },
        },
    },
    resolve: {
        alias: {
            '@': (0, path_1.resolve)(__dirname, './src'),
        },
    },
});
//# sourceMappingURL=vitest.config.js.map