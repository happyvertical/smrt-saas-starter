const digestPattern = /^sha256:[a-f0-9]{64}$/;

export function createRuntimeCandidate({
  sourceCommit,
  testedCommit,
  testedTree,
  web,
  worker,
  platforms = ["linux/amd64"],
}) {
  return {
    schemaVersion: 2,
    sourceCommit,
    testedCommit,
    testedTree,
    images: [
      { name: web.name, digest: web.digest, platforms, verification: "passed" },
      { name: worker.name, digest: worker.digest, platforms, verification: "passed" },
    ],
  };
}

export function validateRuntimeCandidate(
  candidate,
  { expectedSourceCommit, expectedTestedTree } = {},
) {
  if (candidate?.schemaVersion !== 2) throw new Error("Unsupported runtime-candidate schema");
  if (!/^[a-f0-9]{40}$/.test(candidate.sourceCommit ?? "")) {
    throw new Error("Candidate sourceCommit must be a full Git commit SHA");
  }
  if (!/^[a-f0-9]{40}$/.test(candidate.testedCommit ?? "")) {
    throw new Error("Candidate testedCommit must be a full Git commit SHA");
  }
  if (!/^[a-f0-9]{40}$/.test(candidate.testedTree ?? "")) {
    throw new Error("Candidate testedTree must be a full Git tree SHA");
  }
  if (expectedSourceCommit && candidate.sourceCommit !== expectedSourceCommit) {
    throw new Error(
      `Candidate source commit ${candidate.sourceCommit} does not match ${expectedSourceCommit}`,
    );
  }
  if (expectedTestedTree && candidate.testedTree !== expectedTestedTree) {
    throw new Error(
      `Candidate tested tree ${candidate.testedTree} does not match ${expectedTestedTree}`,
    );
  }
  if (!Array.isArray(candidate.images) || candidate.images.length !== 2) {
    throw new Error("Candidate must contain exactly the web and worker images");
  }

  const names = new Set();
  for (const image of candidate.images) {
    if (!/^ghcr\.io\/[a-z0-9._/-]+-(web|worker)$/.test(image.name ?? "")) {
      throw new Error("Candidate image must be a canonical GHCR web or worker image");
    }
    if (names.has(image.name)) throw new Error(`Duplicate candidate image: ${image.name}`);
    names.add(image.name);
    if (!digestPattern.test(image.digest ?? ""))
      throw new Error(`${image.name} has an invalid digest`);
    if (!Array.isArray(image.platforms) || image.platforms.length === 0) {
      throw new Error(`${image.name} has no platform provenance`);
    }
    if (image.verification !== "passed") throw new Error(`${image.name} was not verified`);
  }
  if (![...names].some((name) => name.endsWith("-web"))) throw new Error("Web image is missing");
  if (![...names].some((name) => name.endsWith("-worker")))
    throw new Error("Worker image is missing");
  return candidate;
}
