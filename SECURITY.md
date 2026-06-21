# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability** to open a private advisory.

Include as much of the following as you can:

- the affected component (`apps/web`, `apps/worker`, a package, a manifest, etc.)
  and version/commit,
- a description of the issue and its impact,
- steps to reproduce or a proof of concept,
- any suggested remediation.

Please **do not include secrets, tokens, or live credentials** in your report —
redact them.

We aim to acknowledge reports within a few business days and will keep you
updated as we investigate and prepare a fix.

## Scope

This repository is a **reference starter**. If the vulnerability is in an
upstream `@happyvertical/*` package (SMRT or SDK) rather than in starter code,
we will coordinate the report with the owning repository
(`happyvertical/smrt` or `happyvertical/sdk`).

## Supported versions

This is a starter/template under active development; only the latest `dev` (and
the current `main`) are supported. There are no long-term maintenance branches.
