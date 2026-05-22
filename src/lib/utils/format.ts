/**
 * All money is stored in the database as INTEGER CENTS (LKR × 100) to avoid
 * floating point errors. These helpers convert to/from display values.
 */

export function formatLKR(cents: number): string {
  const rupees = cents / 100;
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rupees);
}

export function rupeesToCents(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Dates are stored in UTC and displayed in Asia/Colombo.
 */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
