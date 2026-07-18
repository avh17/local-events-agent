export interface BudgetVerdict {
  include: boolean;
  note?: string;
}

/**
 * Soft budget filter (v1 policy): filter on the minimum known price, keep
 * unknown-price and slightly-over events with a transparent label, and only
 * drop events clearly out of range (> 25% over the cap).
 */
export function assessBudget(
  priceMin: number | null | undefined,
  budgetCap: number | null | undefined,
): BudgetVerdict {
  if (priceMin === null || priceMin === undefined) {
    return {
      include: true,
      note: "The event feed did not include a price. Check the live listing against your budget.",
    };
  }
  if (budgetCap === null || budgetCap === undefined) {
    return { include: true };
  }
  if (priceMin <= budgetCap) {
    return { include: true };
  }
  if (priceMin <= budgetCap * 1.25) {
    return { include: true, note: `a bit over your $${budgetCap} cap (from $${priceMin})` };
  }
  return { include: false };
}
