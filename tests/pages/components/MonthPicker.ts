import { Locator, Page } from '@playwright/test';
import { expect } from '../../support/expect';

export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
export type MonthAbbreviation = (typeof MONTHS)[number];

/**
 * The "Schedule showing EMI payments starting from" control: a bootstrap-datepicker in month view
 * (a year header with prev/next arrows and twelve month cells).
 */
export class MonthPicker {
  readonly input: Locator;
  private readonly dropdown: Locator;
  private readonly monthsView: Locator;

  constructor(page: Page) {
    this.input = page.getByLabel('Schedule showing EMI payments starting from');
    // The dropdown is appended to <body>, so it cannot be scoped under the form.
    this.dropdown = page.locator('.datepicker.datepicker-dropdown');
    this.monthsView = this.dropdown.locator('.datepicker-months');
  }

  async value(): Promise<string> {
    return this.input.inputValue();
  }

  async select(month: MonthAbbreviation, year: number): Promise<void> {
    await this.input.click();
    await expect(this.monthsView, 'month picker should open in month view').toBeVisible();
    const yearHeader = this.monthsView.locator('.datepicker-switch');
    // Bounded year navigation: the widget only ever needs a handful of clicks.
    for (let i = 0; i < 24; i++) {
      const shown = Number.parseInt(await yearHeader.innerText(), 10);
      if (shown === year) break;
      await this.monthsView.locator(shown < year ? '.next' : '.prev').click();
    }
    await expect(yearHeader).toHaveText(String(year));
    await this.monthsView.getByText(month, { exact: true }).click();
    await expect(this.input, 'start month should update').toHaveValue(`${month} ${year}`);
  }
}
