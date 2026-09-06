# Working conventions for this repo

## Use a git worktree per session, not the shared checkout

Multiple Claude Code sessions — or a session running alongside Arjan's own terminal — can
end up working in this exact directory at the same time. That already caused a real
problem once: two sessions committing directly to `main` in the same shared checkout led
to a genuine divergence (local had commits origin didn't, origin had one local didn't) that
had to be manually reconciled with a merge before either session's work could ship safely.

**Start every session in its own git worktree, not directly in this shared directory:**

```
git worktree add ../DuoLexie-<short-task-name> main
cd ../DuoLexie-<short-task-name>
```

Do the work there, commit and push from there, then remove it when done:

```
cd /home/arjanassink/Projects/DuoLexie
git worktree remove ../DuoLexie-<short-task-name>
```

If you're already mid-session directly in this shared directory when you notice this, it's
not worth disrupting in-progress work to relocate — just `git fetch` and check
`git status -sb` before committing, and **merge** (never rebase) if the branch has
diverged, since a rebase would rewrite commits a concurrent session may already be
building on.
