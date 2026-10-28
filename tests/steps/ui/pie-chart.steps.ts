import { Then, When } from '@cucumber/cucumber';
import { expect } from '../../support/expect';
import { PieSection } from '../../pages/components/PieChart';
import { CustomWorld } from '../../support/world';
import { calculateBreakdown, EmiBreakdown, monthsFromYears } from '../../utils/emi';
import { calculatorPage } from './calculator.steps';

/** The site rounds the EMI to the rupee and derives totals from the unrounded EMI, hence the small tolerances. */
const EMI_TOLERANCE_RUPEES = 1;
const TOTAL_TOLERANCE_RUPEES = 2;
/** Data labels carry one decimal place; the sum of two rounded shares can land 0.1 either side of 100. */
const SHARE_TOLERANCE_PERCENT = 0.15;

const EXPECTED_KEY = 'ui.expectedBreakdown';
const SECTIONS_KEY = 'ui.pieSections';

When(
  'I enter a loan amount of {int}, an interest rate of {float}% and a tenure of {int} years',
  async function (this: CustomWorld, amount: number, rate: number, years: number) {
    const page = calculatorPage(this);
    await page.enterLoanAmount(amount);
    await page.enterInterestRate(rate);
    await page.enterTenureYears(years);

    const expected = calculateBreakdown({
      principal: amount,
      annualRatePercent: rate,
      tenureMonths: monthsFromYears(years),
    });
    this.remember(EXPECTED_KEY, expected);
    this.attach(
      `Independent calculation for ${amount} @ ${rate}% over ${years} years: EMI ${expected.emi.toFixed(2)}, ` +
        `total interest ${expected.totalInterest.toFixed(2)}, total payment ${expected.totalPayment.toFixed(2)}`,
      'text/plain',
    );
  },
);

Then(
  'the displayed EMI should match the EMI calculated for the same inputs',
  async function (this: CustomWorld) {
    const expected = this.recall<EmiBreakdown>(EXPECTED_KEY);
    const page = calculatorPage(this);
    await page.expectEmi(Math.round(expected.emi), EMI_TOLERANCE_RUPEES);
    const shown = await page.readSummary();
    this.attach(`Displayed EMI ₹${shown.emi} vs calculated ₹${expected.emi.toFixed(2)}`, 'text/plain');
  },
);

Then(
  'the displayed total interest and total payment should match the calculated values',
  async function (this: CustomWorld) {
    const expected = this.recall<EmiBreakdown>(EXPECTED_KEY);
    const shown = await calculatorPage(this).readSummary();
    this.attach(
      `Displayed total interest ₹${shown.totalInterest} vs ${expected.totalInterest.toFixed(2)}; ` +
        `total payment ₹${shown.totalPayment} vs ${expected.totalPayment.toFixed(2)}`,
      'text/plain',
    );
    expect(Math.abs(shown.totalInterest - expected.totalInterest), 'total interest').toBeLessThanOrEqual(
      TOTAL_TOLERANCE_RUPEES,
    );
    expect(Math.abs(shown.totalPayment - expected.totalPayment), 'total payment').toBeLessThanOrEqual(
      TOTAL_TOLERANCE_RUPEES,
    );
  },
);

Then('the pie chart should be visible', async function (this: CustomWorld) {
  const chart = calculatorPage(this).pieChart;
  await chart.expectVisible();
  this.attach(await chart.screenshot(), 'image/png');
});

Then(
  'both sections of the pie chart should show values greater than zero',
  async function (this: CustomWorld) {
    const expected = this.recall<EmiBreakdown>(EXPECTED_KEY);
    const chart = calculatorPage(this).pieChart;
    // The chart redraws shortly after the summary text; wait for it to reflect the new inputs before reading.
    await chart.expectPrincipalShare(expected.principalSharePercent, SHARE_TOLERANCE_PERCENT);
    const sections = await chart.sections();
    this.remember(SECTIONS_KEY, sections);
    this.attach(JSON.stringify(sections, null, 2), 'application/json');
    expect(sections, 'pie sections').toHaveLength(2);
    for (const section of sections) {
      expect(section.percent, `${section.label} share`).toBeGreaterThan(0);
    }
  },
);

Then(
  'the pie chart sections should match the calculated principal and interest shares',
  async function (this: CustomWorld) {
    const expected = this.recall<EmiBreakdown>(EXPECTED_KEY);
    const sections = this.recall<PieSection[]>(SECTIONS_KEY);
    const principal = sections.find((s) => /principal/i.test(s.label));
    const interest = sections.find((s) => /interest/i.test(s.label));
    if (!principal || !interest)
      throw new Error(`Unexpected pie sections: ${sections.map((s) => s.label).join(', ')}`);
    expect(
      Math.abs(principal.percent - expected.principalSharePercent),
      'principal share',
    ).toBeLessThanOrEqual(SHARE_TOLERANCE_PERCENT);
    expect(Math.abs(interest.percent - expected.interestSharePercent), 'interest share').toBeLessThanOrEqual(
      SHARE_TOLERANCE_PERCENT,
    );
    expect(Math.abs(principal.percent + interest.percent - 100), 'shares sum to 100%').toBeLessThanOrEqual(
      0.2,
    );
  },
);
