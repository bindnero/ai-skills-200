# Security Policy

## Reporting a vulnerability

If you find a security vulnerability in this repository's **tooling** (`scripts/`) — for example a path-traversal or symlink issue in the installer — please report it privately rather than opening a public issue.

Use GitHub's private reporting: **Security → Report a vulnerability** on this repository. If that is not enabled, open a public issue titled `security` with no technical detail and a maintainer will open a private channel with you.

Please do not publish an unpatched vulnerability. Give us a reasonable window to ship a fix before disclosure.

## Scope

**In scope — the installer and validator:**

- `scripts/install.mjs` — writing outside the intended target directory, following a symlink into a sensitive location, deleting something it should not, or executing untrusted content.
- `scripts/validate.mjs`, `scripts/catalog.mjs`, `scripts/docs.mjs` — path traversal via a skill folder name, or unsafe parsing.

**Out of scope — skill content:**

The `SKILL.md` files are **instructions for AI agents, not executable code**. A skill whose content tells an agent to do something unsafe is a documentation/quality bug, not a vulnerability in this project. Report those as a normal issue — but see the note below.

**Out of scope — what the skills describe:**

Many skills teach defensive security topics (XSS prevention, CSRF, SQL injection defense, threat modeling). Their presence is intentional and educational. The attack techniques they describe are not vulnerabilities here.

## A note on prompt injection

This repository's whole purpose is to ship markdown that AI agents read and follow. That makes it a plausible vector for prompt injection. If you find content in any `SKILL.md` (or in a file it references) that tries to hijack an agent — covert instructions to exfiltrate secrets, ignore prior instructions, or contact an external endpoint — treat that as a security issue and report it privately as above.

This is the single most important class of vulnerability for this project. Please report it privately.

## Supported versions

This project has no released versions. The `main` branch is the supported target.

## Hardening notes for users

- The installer copies `SKILL.md` files into your tool directories. It never executes them.
- `--link` symlinks skill folders for live editing; use `--force` without it to convert back to copies.
- Installed skill directories are gitignored — don't commit them.