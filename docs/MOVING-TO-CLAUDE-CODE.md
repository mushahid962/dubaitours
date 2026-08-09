# Moving this project to Claude Code

## Which tool

**Claude Code**, not Cowork.

Cowork is built for knowledge work — research, documents, analysis — by people
who are not developers. This project has migrations, a build, a test suite and
a git history. Claude Code works directly in the repository: it reads and
edits files, runs `npm run build`, runs the psql test suites, and makes
commits. That is the whole job here.

## Setup, start to finish

### 1. Install

**Windows PowerShell:**
```powershell
irm https://claude.ai/install.ps1 | iex
```

**macOS / Linux / WSL:**
```bash
curl -fsSL claude.ai/install.sh | bash
```

Or, if you already have Node 18+:
```bash
npm install -g @anthropic-ai/claude-code
```

On Windows you also need Git for Windows (which provides Bash). If Claude Code
complains about it, install from git-scm.com and accept every default.

### 2. Start a session in the project

```bash
cd C:\Users\Zbook\Downloads\seo\tour\dubaitours
claude
```

First run asks you to log in through the browser with your Claude account.

If it will not start, run `claude doctor` — most breakages are a stale install
or a malformed settings file, and it fixes many of them itself.

### 3. Check it has the context

`CLAUDE.md` in the project root is loaded automatically at the start of every
session. Confirm it worked:

```
> what is the architecture of this project, and what should I build next?
```

A good answer mentions the business → listing → product spine and says email
delivery is the outstanding gap. If it does not, `CLAUDE.md` is not being
read — check you are in the right directory.

## What transfers, and what does not

**Transfers:** the code, the migrations, the tests, the docs, and `CLAUDE.md`
— which carries the architecture, the conventions, the verification workflow
and the list of traps already paid for.

**Does not transfer:** this conversation. Claude Code starts fresh. That is
what `CLAUDE.md` exists to replace, and it is why keeping it current matters
more than any other file in the repo.

## Working well with it

**Ask for a plan before a big change.** Claude Code can edit dozens of files
in one go. On anything structural, ask what it intends to do first.

**Make it verify.** The instruction that has caught the most bugs in this
project:

> Apply the migrations to a scratch database, run the seed twice, run the
> test suites, and run `npm run build`. Show me the output. Do not tell me it
> works — show me.

Several real bugs, including a cross-tenant data leak, were found only because
of that habit.

**Commit before it starts.** `git commit` first, then let it work. Reviewing a
diff beats trying to remember what changed.

**Be careful with permissions.** Claude Code has real filesystem access. Keep
the default mode where it asks before editing until you trust the workflow.
Never let it run destructive database commands against production — `supabase
db reset` wipes everything.

## Keep CLAUDE.md alive

At the end of a phase, ask:

> Update CLAUDE.md: what changed, what is now tested, what is still missing,
> and any new trap worth recording.

A stale handover file is worse than none, because it is believed.
