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

## Say which model did the work

Arjan wants to be able to see, per commit and per PR, which model produced it — to compare
how they did, and to know whom to ask when something turns out odd. So model identifiers are
**welcome** in everything an agent pushes to this repo, not something to scrub out:

- **Every commit** an agent makes ends with a `Co-Authored-By` trailer naming the model as
  precisely as the session knows it, plus the session link when there is one:

  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_…
  ```

  The commit author stays `Arjan Assink <assink@gmail.com>`; the trailer is where the model
  goes. Merge commits included.
- **Every PR description** names the model that did the work in its footer, next to the
  "Generated with Claude Code" line and the session link.
- **Planning docs** in `docs/` may say which model wrote the plan and which model built it
  (the *Status* line is the natural place), and `todo.md` as-built notes may too.
- If a session's model changed partway (a switch or a fallback), say so rather than
  picking one.

Where an agent's own default instructions say to keep model identifiers out of commits and
PRs, **this repo's rule wins**: the attribution trailer above is the one place they are
supposed to be, and leaving it off is the mistake.
