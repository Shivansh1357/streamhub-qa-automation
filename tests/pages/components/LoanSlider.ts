import { Locator, Page } from '@playwright/test';
import { expect } from '../../support/expect';

export interface SliderRange {
  min: number;
  max: number;
  step: number;
}

/**
 * A jQuery UI slider on emicalculator.net. The widget exposes no ARIA role or value, so this component drives it
 * the way a person does - click the track near the target, then nudge the handle with the arrow keys - and reads
 * the result back from the text input the slider is bound to. Nothing is set programmatically.
 */
export class LoanSlider {
  private readonly track: Locator;
  private readonly handle: Locator;

  constructor(
    page: Page,
    private readonly name: string,
    sliderId: string,
    private readonly boundInput: Locator,
    private readonly range: SliderRange,
    private readonly parseInput: (text: string) => number,
  ) {
    // The slider container only has a generated id and jQuery UI classes; there is nothing more semantic to hold on to.
    this.track = page.locator(`#${sliderId}`);
    this.handle = this.track.locator('.ui-slider-handle');
  }

  async setValue(target: number): Promise<void> {
    const { min, max, step } = this.range;
    if (target < min || target > max) {
      throw new RangeError(`${this.name}: ${target} is outside the slider range ${min}..${max}`);
    }
    const steps = (target - min) / step;
    if (Math.abs(steps - Math.round(steps)) > 1e-9) {
      throw new RangeError(`${this.name}: ${target} is not reachable in steps of ${step}`);
    }

    await expect(this.track, `${this.name} slider should be visible`).toBeVisible();
    await this.track.scrollIntoViewIfNeeded();
    const fraction = (target - min) / (max - min);
    const box = await this.track.boundingBox();
    if (!box) throw new Error(`${this.name}: slider track has no bounding box`);

    // 1. Coarse move: click the track at the proportional position (jQuery UI snaps to the nearest step).
    //    Clicking through the locator keeps Playwright's actionability checks, so an ad overlay fails loudly.
    await this.track.click({
      position: { x: Math.min(Math.max(fraction * box.width, 1), box.width - 1), y: box.height / 2 },
    });

    // 2. Fine move: one arrow key = one step. Bounded loop so a misbehaving widget fails instead of hanging.
    await this.handle.focus();
    for (let attempt = 0; attempt < 20; attempt++) {
      const current = await this.currentValue();
      const delta = Math.round((target - current) / step);
      if (delta === 0) break;
      const key = delta > 0 ? 'ArrowRight' : 'ArrowLeft';
      for (let i = 0; i < Math.min(Math.abs(delta), 10); i++) {
        await this.handle.press(key);
      }
    }

    await expect
      .poll(() => this.currentValue(), {
        message: `${this.name} input should show ${target} after moving the slider`,
      })
      .toBe(target);
    // The handle position proves the slider itself moved, not just the input it is bound to.
    const handleLeft = await this.handlePositionPercent();
    expect(
      Math.abs(handleLeft - fraction * 100),
      `${this.name} handle at ${handleLeft}% for ${target}`,
    ).toBeLessThan(1.5);
  }

  async currentValue(): Promise<number> {
    return this.parseInput(await this.boundInput.inputValue());
  }

  /** The widget positions its handle with an inline `left: NN%` style. */
  async handlePositionPercent(): Promise<number> {
    const left = await this.handle.evaluate((el) => (el as HTMLElement).style.left);
    return Number.parseFloat(left);
  }
}
