# Working conventions for this repo

These conventions apply to every coding agent working in this repo. Claude Code reads
[CLAUDE.md](CLAUDE.md), which carries the same rules; keep the two in sync when you change
either.

## Use a git worktree per session, not the shared checkout

Multiple agent sessions — or a session running alongside Arjan's own terminal — can end up
working in `/home/arjanassink/Projects/DuoLexie` at the same time. That already caused a
real problem once: two sessions committing directly to `main` in the same shared checkout
led to a genuine divergence (local had commits origin didn't, origin had one local didn't)
that had to be manually reconciled with a merge before either session's work could ship
safely.

**Start every session in its own git worktree, not directly in the shared directory:**

```
git worktree add ../DuoLexie-<short-task-name> main
cd ../DuoLexie-<short-task-name>
```

Do the work there, commit and push from there, then remove it when done:

```
cd /home/arjanassink/Projects/DuoLexie
git worktree remove ../DuoLexie-<short-task-name>
```

Working in your own worktree is what keeps concurrent sessions from colliding: each has its
own working tree and its own checked-out branch, so neither can leave the other's files in a
half-edited state or race it to a commit on `main`.

If you're already mid-session directly in the shared directory when you notice this, it's not
worth disrupting in-progress work to relocate — just `git fetch` and check `git status -sb`
before committing, and **merge** (never rebase) if the branch has diverged, since a rebase
would rewrite commits a concurrent session may already be building on.
