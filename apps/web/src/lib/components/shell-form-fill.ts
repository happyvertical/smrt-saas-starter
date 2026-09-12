type ShellField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Resolve every requested field before the caller writes values or emits events. */
export function planShellFormFill(
  fields: readonly ShellField[],
  values: Record<string, unknown>,
): { field: ShellField; value: string }[] | undefined {
  const updates: { field: ShellField; value: string }[] = [];
  for (const [name, value] of Object.entries(values)) {
    const matches = fields.filter(
      (field) => field.name === name && field.type !== "hidden" && !field.disabled,
    );
    if (matches.length !== 1 || typeof value !== "string") return undefined;
    updates.push({ field: matches[0], value });
  }
  return updates;
}
