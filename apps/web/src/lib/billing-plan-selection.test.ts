import { describe, expect, it, vi } from "vitest";
import { submitPlanSelection } from "$lib/billing-plan-selection";

describe("billing plan selection", () => {
  it("does not submit checkout for the current plan", () => {
    const submit = vi.fn();

    submitPlanSelection({ id: "plan-growth", planKey: "growth" }, "growth", submit);

    expect(submit).not.toHaveBeenCalled();
  });

  it("submits the selected alternative plan id", () => {
    const submit = vi.fn();

    submitPlanSelection({ id: "plan-scale", planKey: "scale" }, "growth", submit);

    expect(submit).toHaveBeenCalledWith("plan-scale");
  });
});
