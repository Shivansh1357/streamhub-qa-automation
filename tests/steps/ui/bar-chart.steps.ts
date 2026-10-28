import { Then, When } from '@cucumber/cucumber';
import { expect } from '../../support/expect';
import { BarTooltip } from '../../pages/components/BarChart';
import { CustomWorld } from '../../support/world';
import { calculatorPage } from './calculator.steps';

const START_YEAR_KEY = 'ui.scheduleStartYear';
const TOOLTIP_KEY = 'ui.barTooltip';

When('I set the loan amount to {int} using the slider', async function (this: CustomWorld, amount: number) {
  await calculatorPage(this).amountSlider.setValue(amount);
  this.attach(`Loan amount set to ${amount} via slider`, 'text/plain');
});

When(
  'I set the interest rate to {float}% using the slider',
  async function (this: CustomWorld, rate: number) {
    await calculatorPage(this).interestSlider.setValue(rate);
    this.attach(`Interest rate set to ${rate}% via slider`, 'text/plain');
  },
);

When(
  'I set the loan tenure to {int} years using the slider',
  async function (this: CustomWorld, years: number) {
    await calculatorPage(this).tenureSlider.setValue(years);
    this.attach(`Tenure set to ${years} years via slider`, 'text/plain');
  },
);

When('I change the schedule start month to January of next year', async function (this: CustomWorld) {
  const year = new Date().getFullYear() + 1;
  const picker = calculatorPage(this).startMonth;
  const before = await picker.value();
  await picker.select('Jan', year);
  this.remember(START_YEAR_KEY, year);
  this.attach(`Schedule start changed from "${before}" to "${await picker.value()}"`, 'text/plain');
});

Then('the bar chart should be visible', async function (this: CustomWorld) {
  const chart = calculatorPage(this).barChart;
  await chart.expectVisible();
  this.attach(await chart.screenshot(), 'image/png');
});

Then(
  'the bar chart should show {int} years of payments with {int} bars per year',
  async function (this: CustomWorld, years: number, barsPerYear: number) {
    const chart = calculatorPage(this).barChart;
    const startYear = this.recall<number>(START_YEAR_KEY);
    const expectedYears = Array.from({ length: years }, (_, i) => startYear + i);
    await expect.poll(() => chart.yearLabels(), { message: 'x-axis years' }).toEqual(expectedYears);
    const count = await chart.barCount();
    const legend = await chart.legendLabels();
    this.attach(
      `Bars counted: ${count} across years ${expectedYears.join(', ')}; series legend: ${legend.join(', ')}`,
      'text/plain',
    );
    expect(count, 'total number of bars').toBe(years * barsPerYear);
  },
);

Then(
  'the tooltip of a bar should show its year and amounts greater than zero',
  async function (this: CustomWorld) {
    const chart = calculatorPage(this).barChart;
    const years = await chart.yearLabels();
    // Any single bar will do; the third one keeps the tooltip clear of the chart edges.
    const tooltip = await chart.hoverBar(2);
    this.remember(TOOLTIP_KEY, tooltip);
    this.attach(`Tooltip: ${tooltip.raw}`, 'text/plain');
    expect(years, 'tooltip year is on the axis').toContain(tooltip.year);
    expect(tooltip.amount, `${tooltip.series} amount`).toBeGreaterThan(0);
    expect(tooltip.totalPayment, 'total payment').toBeGreaterThan(0);
    expect(tooltip.totalPayment, 'total payment includes the hovered series').toBeGreaterThanOrEqual(
      tooltip.amount,
    );
  },
);

Then(
  'the tooltip amounts should match the payment schedule table for that year',
  async function (this: CustomWorld) {
    const tooltip = this.recall<BarTooltip>(TOOLTIP_KEY);
    const row = await calculatorPage(this).paymentSchedule.yearRow(tooltip.year);
    this.attach(`Schedule row ${tooltip.year}: ${JSON.stringify(row)}`, 'application/json');
    const tableAmount = tooltip.series === 'Principal' ? row.principal : row.interest;
    expect(tooltip.amount, `${tooltip.series} for ${tooltip.year}`).toBe(tableAmount);
    expect(tooltip.totalPayment, `total payment for ${tooltip.year}`).toBe(row.totalPayment);
  },
);
