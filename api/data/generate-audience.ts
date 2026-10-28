/**
 * Regenerates audience.json from channels.json + programmes.json with a fixed seed, so the file is
 * reproducible (`npx ts-node --transpile-only api/data/generate-audience.ts` yields an identical
 * file). The committed JSON remains the source of truth; this script documents how it was derived.
 *
 * The model is intentionally simple but directionally realistic: a channel's reach sets the
 * baseline, genre and rating scale it, weekends lift sport and kids while dampening news, and
 * completion rate tracks rating. News gets the most measurement days, kids and comedy the fewest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJsonFile } from '../src/data/dataset';
import { channelsFileSchema, programmesFileSchema } from '../src/data/schemas';
import type { AudienceRow, Genre } from '../src/types';

const SEED = 20260101;
const WINDOW_START = Date.UTC(2026, 0, 1);
const WINDOW_DAYS = 90; // 2026-01-01 .. 2026-03-31 inclusive

const CHANNEL_REACH: Record<string, number> = {
  ch_001: 850_000,
  ch_002: 620_000,
  ch_003: 240_000,
  ch_004: 410_000,
  ch_005: 1_300_000,
  ch_006: 1_900_000,
  ch_007: 180_000,
  ch_008: 150_000,
};

const GENRE_WEIGHT: Record<Genre, number> = {
  news: 0.55,
  drama: 0.7,
  sport: 0.8,
  documentary: 0.45,
  comedy: 0.5,
  kids: 0.6,
  reality: 0.65,
};

const WEEKEND_FACTOR: Record<Genre, number> = {
  news: 0.85,
  drama: 1.05,
  sport: 1.35,
  documentary: 1.1,
  comedy: 1.0,
  kids: 1.2,
  reality: 1.1,
};

const ROWS_PER_GENRE: Record<Genre, number> = {
  news: 8,
  sport: 7,
  drama: 6,
  reality: 6,
  documentary: 5,
  comedy: 4,
  kids: 4,
};

/** Rows that must exist so the date-range boundaries of the window are exercised by tests. */
const PINNED_DAY_INDEX: Record<string, number> = { prg_001: 0, prg_005: WINDOW_DAYS - 1 };

/** mulberry32: a tiny seeded PRNG, good enough for deterministic fixtures. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function dayToIso(dayIndex: number): string {
  return new Date(WINDOW_START + dayIndex * 86_400_000).toISOString().slice(0, 10);
}

function isWeekend(dayIndex: number): boolean {
  const weekday = new Date(WINDOW_START + dayIndex * 86_400_000).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function pickDays(count: number, rng: () => number, pinned: number | undefined): number[] {
  const pool = Array.from({ length: WINDOW_DAYS }, (_, index) => index).filter((day) => day !== pinned);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const days = pool.slice(0, pinned === undefined ? count : count - 1);
  if (pinned !== undefined) days.push(pinned);
  return days.sort((a, b) => a - b);
}

function generate(): AudienceRow[] {
  const dataDir = __dirname;
  const channels = readJsonFile(path.join(dataDir, 'channels.json'), channelsFileSchema);
  const programmes = readJsonFile(path.join(dataDir, 'programmes.json'), programmesFileSchema);
  const channelIds = new Set(channels.map((channel) => channel.id));
  const rng = createRng(SEED);
  const rows: AudienceRow[] = [];

  for (const programme of programmes) {
    if (!channelIds.has(programme.channelId)) throw new Error(`${programme.id} references unknown channel`);
    const reach = CHANNEL_REACH[programme.channelId];
    if (reach === undefined) throw new Error(`No reach configured for ${programme.channelId}`);
    const baseline = reach * GENRE_WEIGHT[programme.genre] * (0.6 + (programme.rating / 10) * 0.6);

    for (const day of pickDays(ROWS_PER_GENRE[programme.genre], rng, PINNED_DAY_INDEX[programme.id])) {
      const dayFactor = isWeekend(day) ? WEEKEND_FACTOR[programme.genre] : 1;
      const noise = 0.75 + rng() * 0.5;
      const completionRate = round(
        clamp(0.3 + programme.rating * 0.06 + (rng() - 0.5) * 0.12, 0.15, 0.97),
        3,
      );
      const watchTime = programme.durationMinutes * completionRate * (0.92 + rng() * 0.1);
      rows.push({
        programmeId: programme.id,
        date: dayToIso(day),
        viewers: Math.round(baseline * dayFactor * noise),
        avgWatchTimeMinutes: round(clamp(watchTime, 1, programme.durationMinutes), 1),
        completionRate,
      });
    }
  }
  return rows;
}

const output = path.join(__dirname, 'audience.json');
const rows = generate();
fs.writeFileSync(output, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Wrote ${rows.length} audience rows to ${output}`);
