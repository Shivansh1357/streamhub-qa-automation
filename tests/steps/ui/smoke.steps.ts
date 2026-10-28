import { Given, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { CustomWorld } from '../../support/world';

Given('I open the EMI calculator', async function (this: CustomWorld) {
  await this.getPage().goto('/');
});

Then('the page title should contain {string}', async function (this: CustomWorld, text: string) {
  await expect(this.getPage()).toHaveTitle(new RegExp(text));
});
