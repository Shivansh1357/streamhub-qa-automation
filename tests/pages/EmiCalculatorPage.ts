import { Locator, Page } from '@playwright/test';
import { expect } from '../support/expect';
import { formatIndianRupees, parseRupees } from '../utils/money';
import { BarChart } from './components/BarChart';
import { LoanSlider, SliderRange } from './components/LoanSlider';
import { MonthPicker } from './components/MonthPicker';
import { PaymentScheduleTable } from './components/PaymentScheduleTable';
import { PieChart } from './components/PieChart';

/** Products the framework can drive (the site also has Car Loan, which no scenario needs yet). */
export type LoanProduct = 'Home Loan' | 'Personal Loan';

export interface LoanSummary {
  emi: number;
  totalInterest: number;
  totalPayment: number;
}

export interface SliderRanges {
  amount: SliderRange;
  interest: SliderRange;
  tenureYears: SliderRange;
}

/**
 * The emicalculator.net home page. One form serves all three loan products; selecting a tab relabels the amount
 * field and re-ranges the sliders, which is why the product-specific subclasses only carry a label and ranges.
 */
export class EmiCalculatorPage {
  readonly pieChart: PieChart;
  readonly barChart: BarChart;
  readonly startMonth: MonthPicker;
  readonly paymentSchedule: PaymentScheduleTable;
  readonly amountSlider: LoanSlider;
  readonly interestSlider: LoanSlider;
  readonly tenureSlider: LoanSlider;

  protected readonly form: Locator;
  protected readonly productTabs: Locator;
  protected readonly amountInput: Locator;
  protected readonly interestInput: Locator;
  protected readonly tenureInput: Locator;
  private readonly emiAmount: Locator;
  private readonly totalInterest: Locator;
  private readonly totalPayment: Locator;

  constructor(
    protected readonly page: Page,
    amountLabel: string,
    sliders: SliderRanges,
  ) {
    // The tab strip has no ARIA tablist role, so the class is the stable hook; the links inside are found by name.
    this.productTabs = page.locator('ul.loanproduct-nav');
    // Ad units on the page carry aria-labels such as "Interest Rate Tracker", so every control is looked up by its
    // exact label inside the calculator form rather than page-wide.
    this.form = page.locator('form#emicalculatorform');
    this.amountInput = this.form.getByLabel(amountLabel, { exact: true });
    this.interestInput = this.form.getByLabel('Interest Rate', { exact: true });
    this.tenureInput = this.form.getByLabel('Loan Tenure', { exact: true });
    // The result tiles are headed "Loan EMI" / "Total Interest Payable" / "Total Payment"; the figure is the <p> below.
    this.emiAmount = page.locator('#emiamount p');
    this.totalInterest = page.locator('#emitotalinterest p');
    this.totalPayment = page.locator('#emitotalamount p');

    this.pieChart = new PieChart(page);
    this.barChart = new BarChart(page);
    this.startMonth = new MonthPicker(page);
    this.paymentSchedule = new PaymentScheduleTable(page);
    this.amountSlider = new LoanSlider(
      page,
      amountLabel,
      'loanamountslider',
      this.amountInput,
      sliders.amount,
      parseRupees,
    );
    this.interestSlider = new LoanSlider(
      page,
      'Interest Rate',
      'loaninterestslider',
      this.interestInput,
      sliders.interest,
      Number,
    );
    this.tenureSlider = new LoanSlider(
      page,
      'Loan Tenure',
      'loantermslider',
      this.tenureInput,
      sliders.tenureYears,
      Number,
    );
  }

  async open(): Promise<void> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    // The <ul> collapses to zero height because its items float, so visibility is asserted on a tab link instead.
    await expect(
      this.productTabs.getByRole('link', { name: 'Home Loan', exact: true }),
      'loan product tabs',
    ).toBeVisible();
    await expect(this.emiAmount, 'default EMI rendered').toHaveText(/\d/);
  }

  async selectLoanProduct(product: LoanProduct): Promise<void> {
    await this.productTabs.getByRole('link', { name: product, exact: true }).click();
    await this.expectActiveLoanProduct(product);
  }

  async expectActiveLoanProduct(product: LoanProduct): Promise<void> {
    await expect(this.productTabs.locator('li.active'), 'active loan product tab').toHaveText(product);
    // The form records the product in a hidden field; the label of the amount field follows it.
    await expect(this.page.locator('#loanproduct')).toHaveValue(product.toLowerCase().replace(' ', '-'));
    await expect(this.form.getByLabel(`${product} Amount`, { exact: true })).toBeVisible();
  }

  /** Types a value and tabs away - the calculator recalculates on blur. */
  async enterLoanAmount(amount: number): Promise<void> {
    await this.fillAndCommit(this.amountInput, formatIndianRupees(amount));
    await expect(this.amountInput).toHaveValue(formatIndianRupees(amount));
  }

  async enterInterestRate(annualPercent: number): Promise<void> {
    await this.fillAndCommit(this.interestInput, String(annualPercent));
  }

  async enterTenureYears(years: number): Promise<void> {
    await this.form.getByRole('radio', { name: 'Yr' }).check({ force: true }); // the radio sits under a styled label
    await this.fillAndCommit(this.tenureInput, String(years));
  }

  async readSummary(): Promise<LoanSummary> {
    return {
      emi: parseRupees(await this.emiAmount.innerText()),
      totalInterest: parseRupees(await this.totalInterest.innerText()),
      totalPayment: parseRupees(await this.totalPayment.innerText()),
    };
  }

  /** Waits for the asynchronous recalculation to land within `tolerance` rupees of the expected EMI. */
  async expectEmi(expected: number, tolerance = 1): Promise<void> {
    // Polling the distance (not just one bound) means a stale value on either side keeps retrying.
    await expect
      .poll(async () => Math.abs(parseRupees(await this.emiAmount.innerText()) - expected), {
        message: `displayed EMI should be ${expected} ± ${tolerance}`,
      })
      .toBeLessThanOrEqual(tolerance);
  }

  private async fillAndCommit(input: Locator, value: string): Promise<void> {
    await input.click();
    await input.fill(value);
    await input.press('Tab');
  }
}
