import { Page } from '@playwright/test';
import { EmiCalculatorPage } from './EmiCalculatorPage';

/** Home Loan tab: amounts up to 2 crore in 1-lakh steps, 5-20 %, up to 30 years. */
export class HomeLoanPage extends EmiCalculatorPage {
  constructor(page: Page) {
    super(page, 'Home Loan', 'Home Loan Amount', {
      amount: { min: 0, max: 20_000_000, step: 100_000 },
      interest: { min: 5, max: 20, step: 0.25 },
      tenureYears: { min: 0, max: 30, step: 0.5 },
    });
  }
}
