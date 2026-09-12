import { describe, expect, it } from "vitest";
import { planShellFormFill } from "./shell-form-fill";

function field(name: string, options: Partial<HTMLInputElement> = {}) {
  return { name, type: "text", disabled: false, value: "original", ...options } as HTMLInputElement;
}

describe("shell form fill validation", () => {
  it("rejects a later invalid field without changing an earlier valid field", () => {
    const email = field("email");
    expect(
      planShellFormFill([email], { email: "updated@example.test", absent: "bad" }),
    ).toBeUndefined();
    expect(email.value).toBe("original");
    expect(planShellFormFill([email], { email: 42 })).toBeUndefined();
  });

  it("rejects hidden, disabled and ambiguous fields before any write", () => {
    for (const fields of [
      [field("target", { type: "hidden" })],
      [field("target", { disabled: true })],
      [field("target"), field("target")],
    ]) {
      expect(planShellFormFill(fields, { target: "replacement" })).toBeUndefined();
      expect(fields.every((candidate) => candidate.value === "original")).toBe(true);
    }
  });

  it("returns a complete ordered plan without writing values during validation", () => {
    const email = field("email");
    const role = field("role");
    const plan = planShellFormFill([email, role], {
      email: "updated@example.test",
      role: "viewer",
    });
    expect(plan).toEqual([
      { field: email, value: "updated@example.test" },
      { field: role, value: "viewer" },
    ]);
    expect([email.value, role.value]).toEqual(["original", "original"]);
    for (const update of plan ?? []) update.field.value = update.value;
    expect([email.value, role.value]).toEqual(["updated@example.test", "viewer"]);
  });
});
