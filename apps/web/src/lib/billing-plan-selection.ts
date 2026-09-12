export interface CheckoutPlan {
  id?: string;
  planKey: string;
}

/**
 * The shared picker renders the selected plan as a pressable card. The starter
 * keeps checkout as an explicit host action, so selecting the current plan
 * must remain a no-op.
 */
export function submitPlanSelection(
  plan: CheckoutPlan,
  currentPlanKey: string,
  submit: (planId: string) => void,
): void {
  if (!plan.id || plan.planKey === currentPlanKey) return;
  submit(plan.id);
}
