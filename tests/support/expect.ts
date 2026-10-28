import { expect as playwrightExpect } from '@playwright/test';
import { env } from '../../config/env';

/**
 * Web-first assertions (toBeVisible, toHaveText, expect.poll, ...) retry for the configured UI action timeout
 * instead of Playwright's standalone 5-second default - emicalculator.net is ad-heavy and can take a while to settle.
 */
export const expect = playwrightExpect.configure({ timeout: env.ui.actionTimeoutMs });
