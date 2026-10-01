<!-- >>> greenline >>> -->
## Greenline gate — how merges work here

This repo is gated by **greenline**. Read `docs/greenline.md` and `docs/DOCTRINE.md`
before writing code or tests.

**Invariants (never violate):**
- `main` == what prod runs == green, always.
- The canonical checkout is pristine — never edit it by hand.
- All work happens in worktrees branched from last-green.
- Every merge goes through the serialized gate: full `check` + real `deploy`.

**Your workflow:**
1. `greenline worktree <name>` — get a worktree at `/Volumes/Gumby/worktrees/greenline/ol-free-cell/<name>` on branch `gl/<name>`.
2. Do your work there. Co-design tests + code per docs/DOCTRINE.md (parallel-safe, namespaced, no global-state assertions, OS-assigned ports; never mock other services — make real calls fast with a content-addressed record/replay cache).
3. Commit in your worktree. Then `greenline submit` (from that worktree).
4. The gate squash-merges, runs `./run check`, fast-forwards `main`, runs `./run deploy`, and publishes. It rolls back prod automatically if deploy fails.
5. On success: `greenline done` to remove your worktree + branch.

**Never** commit or push on `main` — hooks hard-lock it (reference-transaction
cannot be bypassed with `--no-verify`; pre-commit/pre-push refuse too). Never edit the
canonical checkout. If the gate reports a conflict, rebase your worktree on
`main` and resubmit. If commits somehow reached `main` outside the
gate (legacy workflow, hotfix), run `greenline adopt` to gate them in place —
greenline never discards commits on `main`.

Diagnose with `greenline status` and `greenline doctor` (`--fix` to reconcile).
<!-- <<< greenline <<< -->

## OL Core

Shared chrome, history, and cards are vendored in `web/core` by `node ~/src/ol-core/scripts/sync-core.mjs web`. Do not edit `web/core` by hand. `./run check` runs `verify-core` and `tests/unit` before the web BDD suite, which also runs `web/core/contract/contract.feature`.

Legacy daily data lives in Capacitor Preferences keys `olfreecell.completed.<date>`, `olfreecell.stats`, `olfreecell.progress.<date>`, and `olfreecell.settings`. `web/js/migrate.js` gathers those into canonical `ol-free-cell.history.v1`. Do not delete the legacy keys. Progress stays on the old progress key so an in-progress deal survives the upgrade.

`themes.css` has a broken selector, `html[data-theme="emerald"], html[data-ol-theme="emerald"] body::before`, which sets `opacity: 0` on the document. `web/css/board.css` restores `opacity: 1`. Keep that override until core is fixed, or the table screenshots and the live app go blank.
