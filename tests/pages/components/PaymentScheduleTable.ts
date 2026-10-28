import { Locator, Page } from '@playwright/test';
import { expect } from '../../support/expect';
import { parsePercent, parseRupees } from '../../utils/money';

export interface YearlyPaymentRow {
  year: number;
  principal: number;
  interest: number;
  totalPayment: number;
  balance: number;
  loanPaidToDatePercent: number;
}

/**
 * The payment schedule below the charts: one expandable row per calendar year (class `yearlypaymentdetails`),
 * each followed by hidden monthly rows. The yearly figures are the oracle for the bar-chart tooltips.
 */
export class PaymentScheduleTable {
  private readonly root: Locator;

  constructor(private readonly page: Page) {
    this.root = page.locator('#emipaymenttable');
  }

  async yearRow(year: number): Promise<YearlyPaymentRow> {
    const row = this.root
      .locator('tr.yearlypaymentdetails')
      .filter({ has: this.page.locator('td', { hasText: new RegExp(`^\\s*${year}\\s*$`) }) });
    await expect(row, `schedule row for ${year}`).toHaveCount(1);
    const cells = (await row.locator('td').allInnerTexts()).map((c) => c.trim());
    if (cells.length < 6) throw new Error(`Unexpected schedule row for ${year}: ${JSON.stringify(cells)}`);
    return {
      year: Number(cells[0]),
      principal: parseRupees(cells[1]),
      interest: parseRupees(cells[2]),
      totalPayment: parseRupees(cells[3]),
      balance: parseRupees(cells[4]),
      loanPaidToDatePercent: parsePercent(cells[5]),
    };
  }
}
