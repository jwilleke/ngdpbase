# Session Commit

Commit current work, update the project log, and update any related GitHub issues.

## Steps

Do all of the following:

### Step 1: Gather context

Run these in parallel:

- `git status` to see all changed files
- `git diff --stat` to see the scope of changes
- `git log --oneline -5` to match commit message style
- Check if there are any open GitHub issues related to this work: `gh issue list --state open --limit 20`

### Step 2: Create the commit

- Stage all relevant changed files (not `.claude/settings.local.json` or other local-only files)
- Write a conventional commit message: `type(scope): description`
- Commit the changes

### Step 3: Update project log

Append a new session log entry to `docs/project_log.md` using this format:

```
### yyyy-MM-dd-##

- Agent: [Claude/Gemini/Other]
- Subject: [Brief description of the session's work]
- Current Issue: [GitHub issue number if applicable, or "none"]
- Tests Failed Test Passed (If any)
- Work Done:
  - [task 1]
  - [task 2]
- Commits: [commit hash(es) from this session]
- Files Modified:
  - [list each modified file]
```

Rules for the log entry:

- Use today's date for `yyyy-MM-dd`
- Use `##` as an incrementing number if there are multiple entries for the same date (start at `01`)
- For Agent, use the name of the AI agent (e.g., "Claude")
- For Current Issue, reference any GitHub issue numbers as `#123` format
- For Commits, use the short hash(es) from git log
- For Files Modified, list every file that was changed in this session

### Step 4: Update GitHub issues

Perform /semver pathc or minor (If approppriate)

For each related open GitHub issue:

- Add a comment summarizing what was done and referencing the commit hash(es)
- If the work fully resolves the issue, note that in the comment but do NOT close the issue (let the user decide)
- Use `gh issue comment <number> --body "<comment>"` to post

### Step 5: Final commit and push

- Stage the updated `docs/project_log.md`
- Commit with message: `docs: update project log for session yyyy-MM-dd-##`
- Ask the user if they want to push to remote

If no GitHub issues are related to the current work, skip Step 4 and note "none" for Current Issue in the log.
