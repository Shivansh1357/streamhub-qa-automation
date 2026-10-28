import type { Locator, Page } from '@playwright/test';

export type LoanProduct = 'Home Loan' | 'Personal Loan' | 'Car Loan';

/**
 * Page object for the EMI calculator used ONLY by the self-healing exercise.
 *
 * Most locators follow the project policy (role > label > text > test id > stable id > css).
 * Exactly four are deliberately brittle and must stay broken: they are the "incorrect locators"
 * the assessment asks for and the raw material `npm run heal` works from. The healthy page object
 * for the real UI suite lives under tests/pages/ui/.
 */
export class BrittleEmiCalculatorPage {
  constructor(private readonly page: Page) {}

  /** The base URL comes from the browser context (env.ui.baseUrl), so nothing is hardcoded here. */
  async open(): Promise<void> {
    await this.page.goto('/');
  }

  get homeLoanTab(): Locator {
    return this.page.getByRole('link', { name: 'Home Loan', exact: true });
  }

  // BRITTLE ON PURPOSE (self-healing exercise #1): a positional CSS chain that encodes the exact
  // nesting of the dashboard. The tab strip is the dashboard's first child, not the second, and any
  // wrapper added or removed by a redesign shifts every nth-child index. Resolves to 0 elements.
  get personalLoanTab(): Locator {
    return this.page.locator('#emicalculatordashboard > div:nth-child(2) > div > ul > li:nth-child(2) > a');
  }

  get carLoanTab(): Locator {
    return this.page.getByRole('link', { name: 'Car Loan', exact: true });
  }

  // BRITTLE ON PURPOSE (self-healing exercise #2): an index-based XPath that depends on the order of
  // the form groups. The third group is Loan Tenure (a text box plus two radio buttons), so this
  // "interest rate" locator points at the wrong group and is ambiguous (strict mode violation).
  get interestRateField(): Locator {
    return this.page.locator('xpath=(//div[contains(@class,"form-group")])[3]//input');
  }

  // BRITTLE ON PURPOSE (self-healing exercise #3): a typo in the id (#loanamountt instead of
  // #loanamount). Ids are a reasonable second choice, but a raw CSS id gets no help from the
  // accessibility tree when it is wrong. Resolves to 0 elements.
  get loanAmountField(): Locator {
    return this.page.locator('#loanamountt');
  }

  get loanTenureField(): Locator {
    return this.page.getByLabel('Loan Tenure', { exact: true });
  }

  // BRITTLE ON PURPOSE (self-healing exercise #4): a text locator with stale copy. The result heading
  // reads "Loan EMI"; a previous version of the page said "Loan EMI Amount". Exact text locators go
  // stale on every copy change.
  get emiResultHeading(): Locator {
    return this.page.getByText('Loan EMI Amount', { exact: true });
  }

  /** The formatted EMI figure shown under the result heading, e.g. "₹44,986". */
  get emiAmount(): Locator {
    return this.page.locator('#emiamount').getByRole('paragraph');
  }

  /** The loan amount text box as the user sees it: its label changes with the selected product. */
  loanAmountFieldLabelled(label: string): Locator {
    return this.page.getByRole('textbox', { name: label, exact: true });
  }

  async selectLoanProduct(product: LoanProduct): Promise<void> {
    const tab: Record<LoanProduct, Locator> = {
      'Home Loan': this.homeLoanTab,
      'Personal Loan': this.personalLoanTab,
      'Car Loan': this.carLoanTab,
    };
    await tab[product].click();
  }

  async setLoanAmount(amount: string): Promise<void> {
    await this.loanAmountField.fill(amount);
  }

  async setInterestRate(rate: string): Promise<void> {
    await this.interestRateField.fill(rate);
  }

  async setLoanTenure(years: string): Promise<void> {
    await this.loanTenureField.fill(years);
  }
}
