# ADR-0012: Evidence and reporting policy

- Status: Accepted, 2026-10-28

## 1 — Problem

The brief requires test execution results in the repository, "not just the test code". What do we commit, what do we keep out,
and how do we keep the repository reviewable rather than bloated?

## 3 — Options

### A. Commit nothing; rely on CI artifacts

- First-order: a clean repository.
- Second-order: artifacts expire and need Actions access; a reviewer reading the repository on the day sees no results, which
  fails the brief literally.

### B. Commit everything the runs produce (reports, traces, screenshots, DOM snapshots, videos)

- First-order: maximal evidence.
- Second-order: the first self-healing report alone was 15 MB because of full-page screenshots of a 9,000-pixel page; traces and
  DOM snapshots multiply that per failure; cloning becomes slow and the signal drowns.

### C. Commit the HTML/JSON/JUnit reports per profile, the SQL outputs and rendered screenshots, and the healing reports and
patches; ignore traces, raw screenshots, DOM snapshots and videos; embed viewport (not full-page) screenshots on failure; let
CI upload the raw artifacts

- First-order: an `.gitignore` with intent and a hook change (viewport screenshots) that cut the self-healing report from 15 MB
  to under 3 MB.
- Second-order: about 15 MB of tracked evidence that a reviewer can open from the file tree; every report is reproducible from a
  single command, so drift between code and evidence is visible in `git status`.

## 1 — Decision

**Option C**, plus a GitHub Pages site that serves the committed HTML reports (GitHub does not render HTML in the file tree).
Consequences accepted: reports change on every run and produce diffs; we regenerate them only at milestones. Revisit if the
suite grows; then reports move to artifacts plus a published dashboard and the repository keeps only summaries.
