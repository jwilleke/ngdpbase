# Docs

Review the current work and determine whether end-user documentation and / or developer documentation is needed.

## Reference

Read `docs/proper-documentation-pages.md` for the documentation standards and conventions used on this site. Follow those guidelines for any pages you create or edit.

If developer documentation, add to docs/Developer-Documentation.md

## Steps

### Step 1: Assess documentation need

Review what was built or changed in this session and ask:

- Is this a new plugin, feature, or configuration property that a user would need to look up?
- Does an existing documentation page need to be updated to reflect changes?
- Is there a `required-pages/` entry (or a live wiki page) that should document this?

If the answer to any of the above is **yes**, proceed to Step 2. If not, state that no end-user documentation is needed and stop.

### Step 2: Identify the page

Determine whether this needs:

- A **new** documentation page (new plugin, new feature, new concept)
- An **update** to an **existing** page (changed behaviour, new parameters, renamed things)

For a new page, generate a UUID v4 for the frontmatter.

### Step 3: Draft the documentation

Follow the structure and style in `docs/proper-documentation-pages.md`:

- Opening one-sentence paragraph
- `## Description` (or topical `##` sections)
- `## Syntax` (for plugins — show the markup pattern)
- `## Parameters` (for plugins — four-column table: Parameter / Type / Default / Description)
- `## Examples` (live rendered examples using `[[{...}]` escape pattern where possible)
- `## Notes` (edge cases, caveats)
- Do **not** add a `## More Information` footer — the Referring Pages tab handles this automatically

Key rules from the standard:

- Do **not** use the word "Wiki" — use "this site" or the site name via `[{ConfigAccessor type='siteName'}]`
- Use ngdpbase table syntax (not markdown tables) for pages in `required-pages/`
- Use `[{ConfigAccessor key='prefix.*'}]` for config property tables
- Use built-in plugins instead of static lists
- Update `lastModified` in frontmatter

### Step 4: Write the file

- New plugin docs go in `required-pages/` (ngdpbase table syntax)
- Developer/internal docs go in `docs/` (markdown tables are fine)
- Use the correct frontmatter: `title`, `uuid`, `system-category`, `user-keywords`, `slug`, `lastModified`, `author`

### Step 5: Confirm with user

Show the user what was created or updated and confirm it looks correct before committing.
