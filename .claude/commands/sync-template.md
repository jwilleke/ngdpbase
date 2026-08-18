# Sync Template

Sync the current repo with the latest changes from the mjs-project-template.

This command should be run from inside the target repo (not the template itself).

## Arguments

$ARGUMENTS - Optional: specific files to sync (e.g., "eslint.config.mjs .prettierrc.json"). If empty, sync all template changes.

## Steps

### Step 1: Verify context

- Confirm the current working directory is a git repo
- Confirm this is NOT the template repo itself (check if `integrate_template.sh` exists at root — if so, abort with a message)
- Run `git status` to ensure working tree is clean. If not, warn the user and stop.

### Step 2: Add template remote

```bash
git remote add template https://github.com/jwilleke/mjs-project-template.git 2>/dev/null || true
git fetch template
```

### Step 3: Show what changed

- Run `git log --oneline template/master` to show available template commits
- Run `git diff HEAD...template/master --stat` to show what files differ between the current repo and the template
- If $ARGUMENTS was provided, filter the diff to only those files
- Present a summary to the user of what would change

### Step 4: Ask the user how to apply

Present these options:

- __Cherry-pick__ — pick specific commits from the template (show the commit list and ask which ones)
- __Merge__ — merge all template changes into a new branch (`chore/template-sync`)
- __File copy__ — copy specific files from the template branch without merge history (using `git checkout template/master -- <file>`)
- __Cancel__ — do nothing

### Step 5: Apply changes

Based on the user's choice:

__Cherry-pick:__

- Create branch: `git checkout -b chore/template-sync`
- Cherry-pick the selected commits: `git cherry-pick <hash> --no-commit`
- Show the result with `git status` and `git diff --stat`
- Let the user review before committing

__Merge:__

- Create branch: `git checkout -b chore/template-sync`
- Run: `git merge template/master --allow-unrelated-histories --no-commit`
- If there are conflicts, list them and help resolve (prefer the target repo's version for project-specific files like AGENTS.md, README.md; prefer template for config files like eslint.config.mjs, tsconfig.json)
- Show the result with `git status` and `git diff --stat`
- Let the user review before committing

__File copy:__

- Create branch: `git checkout -b chore/template-sync`
- For each requested file: `git checkout template/master -- <file>`
- Show the result with `git status` and `git diff --stat`
- Let the user review before committing

### Step 6: Finalize

- After user approves, commit with message: `chore: sync with project template`
- Ask if the user wants to push and create a PR
- If yes: `git push -u origin chore/template-sync` and create PR with `gh pr create`
