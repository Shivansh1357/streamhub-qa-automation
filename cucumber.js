/**
 * Cucumber profiles. Select with `npx cucumber-js --profile <name>`.
 * Every profile writes an HTML, JSON and JUnit report under reports/<profile>/.
 */
const isCI = !!process.env.CI;

function profile(name, { paths, tags, extra = {} }) {
  return {
    requireModule: ['ts-node/register/transpile-only'],
    require: ['tests/support/**/*.ts', 'tests/steps/**/*.ts'],
    paths,
    tags,
    format: [
      isCI ? 'progress' : 'progress-bar',
      'summary',
      `html:reports/${name}/cucumber-report.html`,
      `json:reports/${name}/cucumber-report.json`,
      `junit:reports/${name}/junit.xml`,
    ],
    formatOptions: { snippetInterface: 'async-await', printAttachments: false },
    parallel: 1,
    retry: 0,
    strict: true,
    worldParameters: { profile: name },
    ...extra,
  };
}

module.exports = {
  default: profile('default', {
    paths: ['tests/features/**/*.feature'],
    tags: 'not @self-healing',
  }),
  api: profile('api', { paths: ['tests/features/api/**/*.feature'] }),
  ui: profile('ui', { paths: ['tests/features/ui/**/*.feature'] }),
  sql: profile('sql', { paths: ['tests/features/sql/**/*.feature'] }),
  // Deliberately broken locators for the AI self-healing exercise. Expected to FAIL.
  selfHealing: profile('self-healing', {
    paths: ['tests/features/self-healing/**/*.feature'],
    tags: '@self-healing',
  }),
  ci: profile('ci', {
    paths: ['tests/features/**/*.feature'],
    tags: 'not @self-healing',
    extra: { retry: 1, retryTagFilter: '@ui' },
  }),
};
