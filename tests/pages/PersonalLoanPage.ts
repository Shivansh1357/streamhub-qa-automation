import { Page } from '@playwright/test';
import { EmiCalculatorPage } from './EmiCalculatorPage';

/** Personal Loan tab: amounts up to 30 lakh in 10,000 steps, 5-25 %, up to 5 years in quarter-year steps. */
export class PersonalLoanPage extends EmiCalculatorPage {
  constructor(page: Page) {
    super(page, 'Personal Loan', 'Personal Loan Amount', {
      amount: { min: 0, max: 3_000_000, step: 10_000 },
      interest: { min: 5, max: 25, step: 0.25 },
      tenureYears: { min: 0, max: 5, step: 0.25 },
    });
  }
}
