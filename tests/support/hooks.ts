import {
  After,
  AfterAll,
  Before,
  BeforeAll,
  ITestCaseHookParameter,
  Status,
  setDefaultTimeout,
} from '@cucumber/cucumber';
import { Browser, chromium, firefox, request, webkit } from '@playwright/test';
import fs from 'node:fs';
import { env } from '../../config/env';
import { ensureApiServer, stopApiServer } from './api-server';
import { artifactPath, slugify } from './artifacts';
import { closeDbPool, getDbPool } from './db';
import { CustomWorld } from './world';

setDefaultTimeout(env.ui.stepTimeoutMs);

let browser: Browser | undefined;

async function launchBrowser(): Promise<Browser> {
  const launcher = { chromium, firefox, webkit }[env.ui.browser];
  if (!launcher) throw new Error(`Unsupported BROWSER="${env.ui.browser}" (use chromium | firefox | webkit)`);
  return launcher.launch({ headless: env.ui.headless, slowMo: env.ui.slowMo });
}

BeforeAll(async () => {
  fs.mkdirSync(env.reportsDir, { recursive: true });
});

Before(async function (this: CustomWorld, { pickle }: ITestCaseHookParameter) {
  this.scenarioName = pickle.name;
});

Before({ tags: '@ui' }, async function (this: CustomWorld) {
  browser ??= await launchBrowser();
  this.browser = browser;
  this.context = await browser.newContext({
    baseURL: env.ui.baseUrl,
    viewport: { width: 1366, height: 900 },
    locale: 'en-IN',
    ...(env.ui.video ? { recordVideo: { dir: artifactPath(this.profile, 'videos', '') } } : {}),
  });
  if (env.ui.trace !== 'off') {
    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  }
  this.page = await this.context.newPage();
  this.page.setDefaultTimeout(env.ui.actionTimeoutMs);
  this.page.setDefaultNavigationTimeout(env.ui.stepTimeoutMs);
});

Before({ tags: '@api' }, async function (this: CustomWorld) {
  await ensureApiServer();
  this.api = await request.newContext({
    baseURL: env.api.baseUrl,
    extraHTTPHeaders: { accept: 'application/json' },
  });
});

Before({ tags: '@sql' }, async function (this: CustomWorld) {
  this.db = getDbPool();
});

After({ tags: '@ui' }, async function (this: CustomWorld, { result, pickle }: ITestCaseHookParameter) {
  const failed = result?.status === Status.FAILED;
  const slug = slugify(pickle.name);
  if (this.page && failed) {
    try {
      // Viewport screenshot (full-page captures of this ad-heavy site run to ~9000px and bloat the committed reports);
      // the DOM snapshot and trace cover the rest of the page.
      const png = await this.page.screenshot();
      fs.writeFileSync(artifactPath(this.profile, 'screenshots', `${slug}.png`), png);
      this.attach(png, 'image/png');
      // DOM + accessibility snapshots: the raw material the self-healing tool works from.
      fs.writeFileSync(
        artifactPath(this.profile, 'dom-snapshots', `${slug}.html`),
        await this.page.content(),
      );
      fs.writeFileSync(
        artifactPath(this.profile, 'dom-snapshots', `${slug}.aria.yml`),
        await this.page.locator('body').ariaSnapshot(),
      );
      this.attach(`Page URL at failure: ${this.page.url()}`, 'text/plain');
    } catch (error) {
      this.attach(`Could not capture failure artifacts: ${(error as Error).message}`, 'text/plain');
    }
  }
  if (this.context) {
    if (env.ui.trace === 'on' || (env.ui.trace === 'on-failure' && failed)) {
      await this.context.tracing.stop({ path: artifactPath(this.profile, 'traces', `${slug}.zip`) });
    } else if (env.ui.trace !== 'off') {
      await this.context.tracing.stop();
    }
    await this.context.close();
  }
  this.page = undefined;
  this.context = undefined;
});

After({ tags: '@api' }, async function (this: CustomWorld) {
  await this.api?.dispose();
  this.api = undefined;
});

AfterAll(async () => {
  await browser?.close();
  browser = undefined;
  await stopApiServer();
  await closeDbPool();
});
