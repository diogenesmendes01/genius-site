/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  // Match both e2e specs (*.e2e-spec.ts) and plain unit specs (*.spec.ts)
  // so we can drop pure-logic tests next to the e2e suite without
  // introducing a second Jest config.
  testRegex: '\\.(e2e-)?spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/test/setup-env.js'],
  testTimeout: 20000,
  // run tests serially so the in-memory tracking store and admin DB don't
  // collide between specs.
  maxWorkers: 1,
};
