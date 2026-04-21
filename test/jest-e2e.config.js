/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  testRegex: '.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/test/setup-env.js'],
  testTimeout: 20000,
  // run tests serially so the in-memory tracking store and admin DB don't
  // collide between specs.
  maxWorkers: 1,
};
