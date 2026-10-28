/**
 * Pure EMI (Equated Monthly Instalment) maths. This is the independent oracle the UI tests compare
 * the application against, so it deliberately shares no code with anything that reads the page.
 *
 * Formula (as published on emicalculator.net):  EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 *   P = principal, r = annual rate / 12 / 100, n = tenure in months.
 *
 * Example: P = 25,00,000, 10 % p.a., 10 years -> EMI = 33,037.6 (the site shows 33,038).
 */
export interface LoanTerms {
  principal: number;
  annualRatePercent: number;
  tenureMonths: number;
}

export interface EmiBreakdown {
  /** Unrounded monthly instalment. */
  emi: number;
  /** emi * months, computed from the unrounded EMI (which is what the site does). */
  totalPayment: number;
  totalInterest: number;
  principalSharePercent: number;
  interestSharePercent: number;
}

export function monthsFromYears(years: number): number {
  return Math.round(years * 12);
}

export function calculateEmi({ principal, annualRatePercent, tenureMonths }: LoanTerms): number {
  if (principal <= 0 || tenureMonths <= 0 || annualRatePercent < 0) {
    throw new RangeError(
      `Invalid loan terms: ${JSON.stringify({ principal, annualRatePercent, tenureMonths })}`,
    );
  }
  const monthlyRate = annualRatePercent / 12 / 100;
  if (monthlyRate === 0) return principal / tenureMonths;
  const growth = Math.pow(1 + monthlyRate, tenureMonths);
  return (principal * monthlyRate * growth) / (growth - 1);
}

export function calculateBreakdown(terms: LoanTerms): EmiBreakdown {
  const emi = calculateEmi(terms);
  const totalPayment = emi * terms.tenureMonths;
  const totalInterest = totalPayment - terms.principal;
  return {
    emi,
    totalPayment,
    totalInterest,
    principalSharePercent: (terms.principal / totalPayment) * 100,
    interestSharePercent: (totalInterest / totalPayment) * 100,
  };
}
