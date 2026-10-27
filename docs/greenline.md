# greenline — ol-free-cell

This repo uses **greenline**: a local, serialized, gated CI/CD tool. There is one
canonical checkout of `ol-free-cell`; it is always on `main`, always clean,
and always identical to what prod (`ol-free-cell`) runs. Every change reaches
`main` through a single quality gate that runs the full test suite and a
real production deploy, one submission at a time.

## The workflow

```
greenline worktree feature-x        # new worktree at /Volumes/Gumby/worktrees/greenline/ol-free-cell/feature-x
cd /Volumes/Gumby/worktrees/greenline/ol-free-cell/feature-x         # branch gl/feature-x off last-green
# ...edit, test, commit...
greenline submit                     # gate: squash-merge -> check -> ff main -> deploy -> publish
greenline done                       # remove the worktree + branch once merged
```

Diagnostics (no lock needed):

```
greenline status     # lock holder, SHA drift (main/origin/last-green/deployed), recent journal
greenline doctor     # invariant checks; `greenline doctor --fix` reconciles under the lock
```

If commits reached `main` **outside the gate** (a legacy-workflow session,
a hotfix), greenline refuses to run until they are gated — it never discards them.
Gate them in place with:

```
greenline adopt      # check + deploy the current main tip; never resets main
```

## What the gate does (`greenline submit`)

Under an exclusive lock (other submits queue behind it):

1. **Preflight reconcile** — recover any crashed prior gate from the journal;
   confirm the canonical checkout is clean and on `main`; reconcile
   `main`/last-green/origin; reset the gate worktree to the main tip.
2. **Squash-merge** your branch in the gate worktree. Conflict or empty diff → fail fast.
3. **Check** — run `./run check` with cwd = the gate worktree, under a hard **5-minute
   cap**. Nonzero *or* over the cap → main untouched, your branch preserved, log tail
   printed. A timed-out check is killed (whole process group) and counts as a gate
   FAIL; the fix is a faster suite, never a longer limit — see docs/DOCTRINE.md,
   "The five-minute check".
4. **Advance** — fast-forward the canonical `main` to the candidate.
5. **Deploy** — run `./run deploy` with cwd = the canonical checkout. Nonzero → **automatic rollback**: main resets to the previous commit and `./run deploy` re-runs to restore prod.
6. **Publish** — push `main` to origin (via a one-shot allow-push flag the pre-push hook honours) and advance `last-green`.

## Release time budget: measured profile

Target: queue-to-publish under **180s** (hard check cap 600s — never raise it).
Measured from `.git/greenline/journal.jsonl`:

- **Warm releases run 60–150s.** Typical split: check 5–100s, deploy (App Store
  preflight workflow on GitHub) 33–60s, publish ~2s, queue ~0s.
- **Cold-cache releases can approach the ceiling.** The worst recorded release
  (553s) was a candidate that itself changed Capacitor/SPM dependency metadata:
  SPM re-resolution plus a full Release rebuild plus a cold simulator boot made
  `ios-test` alone take 404s. That cost is legitimate — the gate compiles only
  the candidate's own diff, and the diff *was* the dependency graph. The very
  next release on the now-warm gate worktree measured 64s.
- **Levers already in place** (do not regress): persistent gate worktree with
  warm `node_modules`, `local/check-derived-data`, and SPM checkouts; npm-ci
  skipped when the lockfile is unchanged; `scripts/check-impact.mjs` selects
  suites from the diff; the gate simulator boots in the background during the
  cheap steps; bdd-web overlaps the Capacitor/native checks.
- **If a release ever trends toward 600s**, first grep the gate log for
  `[check-timing]` lines and split the dominant stage — the evidence, not a
  guess, decides the fix.

## The contract (you must implement in `./run`)

- **`./run check`** — cwd = the worktree being gated. Build + lint + FULL tests against a
  **test** datastore. Exit code is the verdict. Must run concurrently from multiple
  worktrees, and must complete in **under 5 minutes** (hard cap, no override).
- **`./run deploy`** — cwd = the canonical checkout. Rebuild/restart prod (e.g.
  `auto -q restart ol-free-cell`), **health-check**, exit nonzero on unhealthy, and be
  **idempotent** (rollback re-runs it).
- **`./run health`** *(optional)* — probe only. If absent, greenline re-runs `./run deploy` as the health probe.

## Test/code co-design (from docs/DOCTRINE.md — read it)

Tests run in parallel with each other, with other agents' runs, and with live prod.
Therefore: namespace every entity a test creates (uuid suffixes); never assert global
state (counts, "table empty", singletons); never truncate/reset shared stores; tolerate
pre-existing and concurrently-changing data; bind servers to OS-assigned ports (port 0);
prefer per-test datastores (tmp sqlite, worktree-relative `local/`); keep schema
migrations backward-compatible one version (deploy rollback runs the previous code against
the new schema); serialize tests that share a scarce resource (a local LLM server, one GPU).

**Real but fast:** never mock another service — but make real tests quick with a
content-addressed record/replay cache: route all access to the external service through
one choke point; key = hash(endpoint + model + full request); store `{model, request,
response}` JSON per key in a gitignored `local/<service>-cache/` (idempotently created,
atomic writes, corrupt entry = self-healing miss). Miss → real call; hit → the real
recorded response in milliseconds. First run is genuinely end-to-end; every rerun is
instant, and the persistent gate worktree keeps the gate's cache warm. To re-record,
delete the cache dir. Don't cache calls whose variability is what's under test.

## State (in the shared git dir)

`.git/greenline/`: `lock`, `journal.jsonl`, `status.json`, `deployed` (SHA prod runs),
`logs/`, `allow-push` (transient, gate publish), `allow-main` (transient, PID-bound,
gate main-ref mutations). Ref `refs/greenline/last-green` = last fully-gated,
deployed-healthy commit.

**Main is hard-locked.** `greenline setup` installs three hooks:
- `reference-transaction` — refuses any local update of `refs/heads/main`
  unless `allow-main` exists and names a still-alive PID. Cannot be bypassed with
  `--no-verify`. This is what actually prevents working on main.
- `pre-commit` — early reject when HEAD is on `main` (friendly message;
  bypassable — the reference-transaction hook is the real lock).
- `pre-push` — refuses direct pushes to `main` unless the gate sets
  `allow-push`.
