import { Given, When } from '@cucumber/cucumber';
import { CustomWorld } from '../../support/world';
import { rememberResult } from './query-result';
import { loadSchemaAndSeed, runQueryFile } from './sql-files';

Given('the analytics schema and seed data are loaded', async function (this: CustomWorld) {
  await loadSchemaAndSeed(this.getDb());
});

When('I run the {string} query', async function (this: CustomWorld, name: string) {
  rememberResult(this, await runQueryFile(this.getDb(), name));
});
