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

## No voice recordings in the repo, ever

The audio the app plays is one person's voice. It lives in private Azure Blob Storage and
is served through the API (`docs/private-audio.md`), never in git: not under
`app/public/audio/`, not in a fixture, not in a "temporary" commit. `.gitignore` blocks
`*.mp3`/`*.wav`/`*.webm` (the silent e2e fixture and `docs/media/` are the only exceptions)
and CI fails on any audio file in the tree or in a branch's history.

The clips were removed from the working tree in `4d97bbf`, but **they are still in git
history, and a history rewrite is scheduled** (`docs/private-audio.md` §9): `git filter-repo`
will drop `app/public/audio/sounds` and the committed `app/dist` from every commit, and all
branches will be force-pushed. It waits until the Opnamestudio v3 PR has merged, because a
branch cut before the rewrite must never be merged after it — that would bring the blobs
straight back.

**If you are an agent reading this, check before you push:** run
`git log --all --oneline -- app/public/audio/sounds`. If it prints nothing, the rewrite has
happened, and a clone from before it is stale — re-clone, or `git fetch && git reset --hard
origin/<branch>`, and re-cut your branch from the new `main` rather than merging your old
one. The rewrite is the one time the "never rewrite history" rule above is deliberately
broken, and it is not a precedent.
