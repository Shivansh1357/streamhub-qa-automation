import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { BrittleEmiCalculatorPage, LoanProduct } from '../../pages/self-healing/BrittleEmiCalculatorPage';
import { CustomWorld } from '../../support/world';

const PAGE_OBJECT_KEY = 'self-healing:calculator-page';

/** One page object per scenario, created lazily so every step shares the same instance. */
function calculator(world: CustomWorld): BrittleEmiCalculatorPage {
  return (
    world.recallOptional<BrittleEmiCalculatorPage>(PAGE_OBJECT_KEY) ??
    world.remember(PAGE_OBJECT_KEY, new BrittleEmiCalculatorPage(world.getPage()))
  );
}

Given('the EMI calculator has loaded with its default Home Loan figures', async function (this: CustomWorld) {
  const page = calculator(this);
  await page.open();
  await expect(page.loanTenureField).toBeVisible();
  await expect(page.loanAmountFieldLabelled('Home Loan Amount')).toBeVisible();
});

When('I choose the {string} loan product tab', async function (this: CustomWorld, product: LoanProduct) {
  await calculator(this).selectLoanProduct(product);
});

Then('the loan amount field should be labelled {string}', async function (this: CustomWorld, label: string) {
  await expect(calculator(this).loanAmountFieldLabelled(label)).toBeVisible();
});

When('I type {string} into the interest rate field', async function (this: CustomWorld, rate: string) {
  await calculator(this).setInterestRate(rate);
});

Then('the interest rate field should contain {string}', async function (this: CustomWorld, rate: string) {
  await expect(calculator(this).interestRateField).toHaveValue(rate);
});

When('I type {string} into the loan amount field', async function (this: CustomWorld, amount: string) {
  await calculator(this).setLoanAmount(amount);
});

Then('the loan amount field should contain {string}', async function (this: CustomWorld, amount: string) {
  await expect(calculator(this).loanAmountField).toHaveValue(amount);
});

When('I type {string} into the loan tenure field', async function (this: CustomWorld, years: string) {
  await calculator(this).setLoanTenure(years);
});

Then('the Loan EMI result heading should be visible', async function (this: CustomWorld) {
  await expect(calculator(this).emiResultHeading).toBeVisible();
});

Then('the Loan EMI amount should be shown in rupees', async function (this: CustomWorld) {
  await expect(calculator(this).emiAmount).toHaveText(/^₹[\d,]+$/);
});
