import { Given, Then } from '@cucumber/cucumber';
import { expect } from '../../support/expect';
import { EmiCalculatorPage, LoanProduct } from '../../pages/EmiCalculatorPage';
import { HomeLoanPage } from '../../pages/HomeLoanPage';
import { PersonalLoanPage } from '../../pages/PersonalLoanPage';
import { CustomWorld } from '../../support/world';

const PAGE_KEY = 'ui.calculatorPage';

/** The page object for the currently selected loan product, shared by every UI step file. */
export function calculatorPage(world: CustomWorld): EmiCalculatorPage {
  return world.recall<EmiCalculatorPage>(PAGE_KEY);
}

function pageObjectFor(world: CustomWorld, product: LoanProduct): EmiCalculatorPage {
  switch (product) {
    case 'Home Loan':
      return new HomeLoanPage(world.getPage());
    case 'Personal Loan':
      return new PersonalLoanPage(world.getPage());
    default:
      throw new Error(`No page object for the "${product}" product`);
  }
}

Given('I open the EMI calculator', async function (this: CustomWorld) {
  const page = new HomeLoanPage(this.getPage()); // the site opens on the Home Loan product
  await page.open();
  this.remember(PAGE_KEY, page);
});

Given('I navigate to the {string} tab', async function (this: CustomWorld, product: LoanProduct) {
  const page = pageObjectFor(this, product);
  await page.selectLoanProduct(product);
  this.remember(PAGE_KEY, page);
});

Then('the {string} tab should be active', async function (this: CustomWorld, product: LoanProduct) {
  await calculatorPage(this).expectActiveLoanProduct(product);
});

Then(
  'the loan summary should show an EMI, total interest and total payment greater than zero',
  async function (this: CustomWorld) {
    const summary = await calculatorPage(this).readSummary();
    this.attach(JSON.stringify(summary), 'application/json');
    expect(summary.emi, 'EMI').toBeGreaterThan(0);
    expect(summary.totalInterest, 'total interest').toBeGreaterThan(0);
    expect(summary.totalPayment, 'total payment').toBeGreaterThan(summary.totalInterest);
  },
);
