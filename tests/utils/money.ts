/**
 * Helpers for the Indian-formatted amounts the EMI calculator renders, e.g. "₹ 4,35,095" or "1,07,96,711".
 */

/** "₹ 4,35,095" -> 435095. Throws when the text carries no digits, so a blank cell fails loudly. */
export function parseRupees(text: string): number {
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) throw new Error(`No numeric amount found in "${text}"`);
  return Number(digits);
}

/** "46.3%" -> 46.3 (first percentage in the text). */
export function parsePercent(text: string): number {
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (!match) throw new Error(`No percentage found in "${text}"`);
  return Number(match[1]);
}

/** 2500000 -> "25,00,000" (lakh/crore grouping: last three digits, then pairs). */
export function formatIndianRupees(amount: number): string {
  const whole = Math.round(Math.abs(amount)).toString();
  if (whole.length <= 3) return whole;
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}${rest},${last3}`;
}
