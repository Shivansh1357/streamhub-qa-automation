/**
 * Renders every query in sql/queries/ together with its captured output from
 * sql/outputs/ into a terminal-styled page and screenshots it to
 * sql/screenshots/<query>.png.
 *
 * Run from the repo root (after `npm run sql:run`):
 *   npx ts-node --transpile-only sql/scripts/render-screenshots.ts
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';

const SQL_DIR = path.join(env.rootDir, 'sql');
const QUERIES_DIR = path.join(SQL_DIR, 'queries');
const OUTPUTS_DIR = path.join(SQL_DIR, 'outputs');
const SCREENSHOTS_DIR = path.join(SQL_DIR, 'screenshots');

interface CapturedOutput {
  database: string;
  executedAt: string;
  body: string;
}

/** run.sh writes `-- key: value` header lines before the psql output. */
const HEADER_LINE = /^-- (\w+):\s*(.*)$/;

function parseCapturedOutput(text: string): CapturedOutput {
  const lines = text.split('\n');
  const meta: Record<string, string> = {};
  let bodyStart = 0;
  for (; bodyStart < lines.length; bodyStart++) {
    const match = HEADER_LINE.exec(lines[bodyStart]);
    if (!match) break;
    meta[match[1]] = match[2];
  }
  return {
    database: meta.database ?? 'unknown database',
    executedAt: meta.executed ?? 'unknown time',
    body: lines.slice(bodyStart).join('\n').trim(),
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SQL_KEYWORDS =
  /\b(SELECT|FROM|WHERE|JOIN|LEFT|ON|AND|OR|IN|AS|WITH|ORDER BY|GROUP BY|HAVING|OVER|PARTITION BY|ROW_NUMBER|COUNT|SUM|MIN|MAX|ABS|ROUND|EXTRACT|EPOCH|INTERVAL|COALESCE|NUMERIC|TRUE|FALSE)\b/g;

/** Minimal highlighting: keywords and `--` comments. Enough to make the screenshot scannable. */
function highlightSql(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const commentAt = line.indexOf('--');
      const code = commentAt === -1 ? line : line.slice(0, commentAt);
      const comment = commentAt === -1 ? '' : line.slice(commentAt);
      const highlightedCode = escapeHtml(code).replace(SQL_KEYWORDS, '<span class="kw">$1</span>');
      return comment ? `${highlightedCode}<span class="cm">${escapeHtml(comment)}</span>` : highlightedCode;
    })
    .join('\n');
}

function renderPage(name: string, sql: string, output: CapturedOutput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(name)}</title>
<style>
  :root {
    --bg: #0b0f14; --panel: #11161d; --border: #1f2733; --text: #d7dee8; --dim: #7d8794;
    --accent: #7cc4ff; --kw: #c792ea; --cm: #5f6b7a; --green: #9ece6a; --yellow: #e0af68; --red: #f7768e;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
         font: 14px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; }
  .window { margin: 32px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--panel); }
  .titlebar { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #161c25; border-bottom: 1px solid var(--border); }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .title { margin-left: 10px; color: var(--dim); }
  .meta { padding: 12px 20px; border-bottom: 1px solid var(--border); color: var(--dim); display: grid; grid-template-columns: 110px 1fr; row-gap: 4px; }
  .meta b { color: var(--text); font-weight: 600; }
  h2 { margin: 0; padding: 10px 20px; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); background: #0e131a; border-bottom: 1px solid var(--border); }
  pre { margin: 0; padding: 18px 20px; white-space: pre; overflow: visible; }
  .kw { color: var(--kw); font-weight: 600; }
  .cm { color: var(--cm); font-style: italic; }
  .prompt { color: var(--green); }
  .out { color: var(--text); }
</style>
</head>
<body>
  <div class="window">
    <div class="titlebar">
      <span class="dot" style="background: var(--red)"></span>
      <span class="dot" style="background: var(--yellow)"></span>
      <span class="dot" style="background: var(--green)"></span>
      <span class="title">psql &mdash; ${escapeHtml(name)}.sql</span>
    </div>
    <div class="meta">
      <span>query</span><b>sql/queries/${escapeHtml(name)}.sql</b>
      <span>database</span><b>${escapeHtml(output.database)}</b>
      <span>executed</span><b>${escapeHtml(output.executedAt)}</b>
    </div>
    <h2>Query</h2>
    <pre>${highlightSql(sql.trim())}</pre>
    <h2>Output</h2>
    <pre><span class="prompt">streamhub_qa=&gt; \\i sql/queries/${escapeHtml(name)}.sql</span>
<span class="out">${escapeHtml(output.body)}</span></pre>
  </div>
</body>
</html>`;
}

async function readCapturedOutput(name: string): Promise<CapturedOutput> {
  const file = path.join(OUTPUTS_DIR, `${name}.txt`);
  try {
    return parseCapturedOutput(await fs.readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(`Missing ${path.relative(env.rootDir, file)} - run "npm run sql:run" first`, {
      cause: error,
    });
  }
}

async function main(): Promise<void> {
  const queryFiles = (await fs.readdir(QUERIES_DIR)).filter((file) => file.endsWith('.sql')).sort();
  if (queryFiles.length === 0) throw new Error(`No .sql files found in ${QUERIES_DIR}`);
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    // 2x device scale keeps the text crisp when GitHub scales the image down in the README.
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    for (const file of queryFiles) {
      const name = path.basename(file, '.sql');
      const [sql, output] = await Promise.all([
        fs.readFile(path.join(QUERIES_DIR, file), 'utf8'),
        readCapturedOutput(name),
      ]);
      await page.setContent(renderPage(name, sql, output));
      const target = path.join(SCREENSHOTS_DIR, `${name}.png`);
      await page.screenshot({ path: target, fullPage: true });
      console.log(`rendered ${path.relative(env.rootDir, target)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
