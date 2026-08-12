/**
 * Two Jest projects, one runner.
 *
 * `cli`  — every pre-existing suite, unchanged: ts-jest in CommonJS mode.
 * `tui`  — ink-testing-library render tests (`*.test.tsx`). ink 7 is ESM-only
 *          and pulls in yoga-layout, whose entry uses a top-level `await`;
 *          that cannot be downlevelled to CommonJS at all (require() is
 *          synchronous), so these suites must load the real published ESM
 *          through Jest's native ESM loader. No transformIgnorePatterns
 *          carve-out is needed precisely because nothing is being transformed.
 *
 * The `--experimental-vm-modules` flag that makes the `tui` project work is
 * supplied by scripts/run-jest.mjs and is inert for the `cli` project.
 */
const tsJestEsm = {
  extensionsToTreatAsEsm: ['.ts', '.tsx', '.mts'],
  transform: {
    '^.+\\.m?tsx?$': [
      'ts-jest',
      { useESM: true, tsconfig: '<rootDir>/tsconfig.esm.json' },
    ],
  },
};

/** TS sources import with ".js" specifiers throughout; resolve them to .ts/.tsx. */
const jsSpecifierMapper = { '^(\\.{1,2}/.*)\\.js$': '$1' };

/**
 * npm hoists `ink-testing-library` to the workspace root but keeps `ink` nested
 * under `cli/node_modules`, so the library's own `import {render} from 'ink'`
 * cannot be resolved from where it sits. Pin `ink` to the copy this package
 * actually depends on, independent of whatever layout npm picks this install.
 */
const inkMapper = {
  '^ink$': require.resolve('ink', { paths: [__dirname] }),
};

const moduleFileExtensions = ['ts', 'tsx', 'js', 'jsx', 'json', 'node'];

module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.d.ts',
    '!src/cli.ts', // Entry point, tested via integration
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  projects: [
    {
      displayName: 'cli',
      preset: 'ts-jest',
      testEnvironment: 'node',
      rootDir: __dirname,
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/**/*.test.ts'],
      moduleNameMapper: jsSpecifierMapper,
      moduleFileExtensions,
      verbose: true,
    },
    {
      displayName: 'tui',
      testEnvironment: 'node',
      rootDir: __dirname,
      roots: ['<rootDir>/src/tui'],
      testMatch: ['**/__tests__/**/*.test.tsx'],
      moduleNameMapper: { ...jsSpecifierMapper, ...inkMapper },
      moduleFileExtensions,
      verbose: true,
      ...tsJestEsm,
    },
  ],
};
