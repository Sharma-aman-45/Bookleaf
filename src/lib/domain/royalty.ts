export const PAYOUT_THRESHOLD = 1000;
export const PAYOUT_WINDOW_DAYS = 45;

function quarterEndFor(date: Date): Date {
  const q = Math.floor(date.getUTCMonth() / 3);
  return new Date(Date.UTC(date.getUTCFullYear(), q * 3 + 3, 0));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function payoutSchedule(today: Date = new Date()) {
  const currentQuarterEnd = quarterEndFor(today);
  const previousQuarterEnd = new Date(
    Date.UTC(currentQuarterEnd.getUTCFullYear(), currentQuarterEnd.getUTCMonth() - 2, 0)
  );
  const previousPayoutDeadline = addDays(previousQuarterEnd, PAYOUT_WINDOW_DAYS);

  if (today <= previousPayoutDeadline) {
    return {
      quarterEnd: previousQuarterEnd,
      payoutBy: previousPayoutDeadline,
      followingQuarterEnd: currentQuarterEnd
    };
  }
  return {
    quarterEnd: currentQuarterEnd,
    payoutBy: addDays(currentQuarterEnd, PAYOUT_WINDOW_DAYS),
    followingQuarterEnd: quarterEndFor(addDays(currentQuarterEnd, 1))
  };
}

export function payoutEligibility(pending: number) {
  if (pending <= 0) return "nothing_pending" as const;
  if (pending < PAYOUT_THRESHOLD) return "below_threshold" as const;
  return "eligible" as const;
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
