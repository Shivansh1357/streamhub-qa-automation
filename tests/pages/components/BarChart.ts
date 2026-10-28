import { Locator, Page } from '@playwright/test';
import { expect } from '../../support/expect';
import { parseRupees } from '../../utils/money';

export type BarSeries = 'Principal' | 'Interest';

export interface BarTooltip {
  year: number;
  series: BarSeries;
  amount: number;
  totalPayment: number;
  raw: string;
}

/**
 * The "EMI Payment / year" stacked column chart (Highcharts 8): one Principal and one Interest column per calendar
 * year plus a Balance line. Highcharts renders plain SVG without ARIA roles, so this is the one place that relies on
 * Highcharts class names. Bars are scoped to the series group because the legend symbols are also
 * `rect.highcharts-point` and would otherwise be counted as bars.
 */
export class BarChart {
  private readonly root: Locator;
  private readonly bars: Locator;

  constructor(page: Page) {
    this.root = page.locator('#emibarchart');
    this.bars = this.root.locator(
      'g.highcharts-series-group g.highcharts-column-series rect.highcharts-point',
    );
  }

  async expectVisible(): Promise<void> {
    await expect(this.root, 'bar chart container').toBeVisible();
    await expect(this.root.locator('svg'), 'bar chart svg').toBeVisible();
    await expect(this.bars.first(), 'at least one bar rendered').toBeVisible();
  }

  async barCount(): Promise<number> {
    return this.bars.count();
  }

  /** Calendar years on the x-axis, in display order. */
  async yearLabels(): Promise<number[]> {
    const labels = await this.root.locator('.highcharts-xaxis-labels text').allTextContents();
    return labels.map((l) => Number.parseInt(l.trim(), 10)).filter((n) => !Number.isNaN(n));
  }

  async legendLabels(): Promise<string[]> {
    return (await this.root.locator('.highcharts-legend-item').allTextContents()).map((t) => t.trim());
  }

  /** Hovers the n-th bar and parses its tooltip ("Year : 2027 Interest : ₹ 1,04,470 Total Payment : ₹ 2,66,933"). */
  async hoverBar(index: number): Promise<BarTooltip> {
    const bar = this.bars.nth(index);
    await bar.scrollIntoViewIfNeeded();
    await bar.hover({ force: true }); // the chart's tracker overlay intercepts pointer events
    const tooltip = this.root.locator('.highcharts-tooltip');
    await expect(tooltip, 'bar tooltip').toContainText(/Year/);
    const raw = ((await tooltip.textContent()) ?? '').replace(/\s+/g, ' ').trim();
    const match = raw.match(
      /Year\s*:\s*(\d{4})\s*(Principal|Interest)\s*:\s*₹?\s*([\d,]+)\s*Total Payment\s*:\s*₹?\s*([\d,]+)/,
    );
    if (!match) throw new Error(`Unexpected tooltip format: "${raw}"`);
    return {
      year: Number(match[1]),
      series: match[2] as BarSeries,
      amount: parseRupees(match[3]),
      totalPayment: parseRupees(match[4]),
      raw,
    };
  }

  async screenshot(): Promise<Buffer> {
    return this.root.screenshot();
  }
}
