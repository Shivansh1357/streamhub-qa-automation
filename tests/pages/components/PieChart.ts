import { Locator, Page } from '@playwright/test';
import { expect } from '../../support/expect';
import { parsePercent } from '../../utils/money';

export interface PieSection {
  /** Series point name as shown in the legend and tooltip, e.g. "Principal Loan Amount". */
  label: string;
  /** Percentage printed on the slice's data label. */
  percent: number;
  /** Raw tooltip text captured while hovering the slice. */
  tooltip: string;
}

/**
 * The "Break-up of Total Payment" pie (Highcharts 8). Highcharts renders plain SVG without ARIA roles or labels,
 * which is why this component is the one place that relies on Highcharts' own class names.
 */
export class PieChart {
  private readonly root: Locator;
  private readonly slices: Locator;

  constructor(page: Page) {
    this.root = page.locator('#emipiechart');
    this.slices = this.root.locator('.highcharts-series path.highcharts-point');
  }

  async expectVisible(): Promise<void> {
    await expect(this.root, 'pie chart container').toBeVisible();
    await expect(this.root.locator('svg'), 'pie chart svg').toBeVisible();
    await expect(this.slices, 'pie chart should have two slices (principal, interest)').toHaveCount(2);
  }

  async legendLabels(): Promise<string[]> {
    return (await this.root.locator('.highcharts-legend-item').allTextContents()).map((t) => t.trim());
  }

  /** Percentages printed on the slices, in series order (principal first). */
  async dataLabelPercentages(): Promise<number[]> {
    const texts = await this.root.locator('.highcharts-data-label').allTextContents();
    return texts.map(parsePercent);
  }

  /** Waits until the principal slice shows the expected share - the chart redraws a moment after the EMI text. */
  async expectPrincipalShare(expectedPercent: number, tolerance: number): Promise<void> {
    await expect
      .poll(async () => Math.abs((await this.dataLabelPercentages())[0] - expectedPercent), {
        message: `principal slice should show ${expectedPercent.toFixed(1)}% ± ${tolerance}`,
      })
      .toBeLessThanOrEqual(tolerance);
  }

  /** Reads every section: its legend label, data-label percentage and tooltip (hovering one slice at a time). */
  async sections(): Promise<PieSection[]> {
    await this.expectVisible();
    const labels = await this.legendLabels();
    const sections: PieSection[] = [];
    for (let i = 0; i < labels.length; i++) {
      // Highcharts suffixes the data label with the point's colour index, which pairs it with the legend entry.
      const dataLabel = this.root.locator(`.highcharts-data-label.highcharts-data-label-color-${i}`);
      await expect(dataLabel, `data label for ${labels[i]}`).toBeVisible();
      const percent = parsePercent((await dataLabel.textContent()) ?? '');
      await this.slices.nth(i).hover({ force: true }); // the svg tracker overlay intercepts the pointer
      const tooltip = this.root.locator('.highcharts-tooltip');
      await expect(tooltip, `tooltip for ${labels[i]}`).toContainText(labels[i]);
      sections.push({
        label: labels[i],
        percent,
        tooltip: ((await tooltip.textContent()) ?? '').replace(/\s+/g, ' ').trim(),
      });
    }
    return sections;
  }

  async screenshot(): Promise<Buffer> {
    return this.root.screenshot();
  }
}
