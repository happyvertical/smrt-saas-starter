export function updateImageDigest(text, { role, name, digest }) {
  const lines = text.split("\n");
  const updated = [];
  let found = false;

  for (let index = 0; index < lines.length; ) {
    const line = lines[index];
    const currentName = line.startsWith("  - name: ") ? line.slice("  - name: ".length) : "";

    if (currentName === name || currentName.endsWith(`-${role}`)) {
      if (found) throw new Error(`Overlay has multiple ${role} image entries`);
      found = true;
      const block = [`  - name: ${name}`];
      index += 1;

      while (index < lines.length && !lines[index].startsWith("  - name: ")) {
        if (lines[index] !== "" && !lines[index].startsWith("    ")) break;
        block.push(lines[index]);
        index += 1;
      }

      const digestIndex = block.findIndex((entry) => entry.trim().startsWith("digest:"));
      if (digestIndex >= 0) {
        block[digestIndex] = `    digest: ${digest}`;
      } else {
        const tagIndex = block.findIndex((entry) => entry.trim().startsWith("newTag:"));
        block.splice(tagIndex >= 0 ? tagIndex + 1 : 1, 0, `    digest: ${digest}`);
      }

      updated.push(...block);
      continue;
    }

    updated.push(line);
    index += 1;
  }

  if (!found) throw new Error(`Overlay is missing ${role} image entry`);
  return updated.join("\n");
}
