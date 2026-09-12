/**
 * SectionUtils — extract and splice markdown sections for section editing.
 *
 * A "section" is an ATX-style heading (# through ######) plus all content
 * up to (but not including) the next heading of the same or higher level.
 *
 * Frontmatter (YAML between leading --- delimiters) is preserved intact and
 * excluded from section numbering. Headings inside fenced code blocks are
 * ignored to avoid false positives.
 */

/**
 * Convert heading text to its anchor slug. This IS the heading-id format:
 * the page converter uses it via markdown-it-anchor (#1273, decision R2), so
 * section links (#500) and rendered ids cannot drift apart.
 *
 * Algorithm mirrors GitHub Flavored Markdown:
 *   1. Lowercase
 *   2. Remove any character that is not a letter, digit, space, or hyphen
 *   3. Replace whitespace runs with a single hyphen
 *   4. Trim leading/trailing hyphens
 *
 * Examples:
 *   "PLA (Polylactic Acid)"  → "pla-polylactic-acid"
 *   "3D Printing Filaments"  → "3d-printing-filaments"
 *   "Hello World"            → "hello-world"
 */
export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Return the number of leading YAML frontmatter lines (including both --- delimiters), or 0 */
function frontmatterEndLine(lines: string[]): number {
  if (lines.length === 0 || lines[0].trim() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---' || lines[i].trim() === '...') return i + 1;
  }
  return 0; // Unclosed frontmatter — treat as no frontmatter
}

/** Return ATX heading level (1–6) or 0 if the line is not a heading */
function headingLevel(line: string): number {
  const m = line.match(/^(#{1,6})(?:\s|$)/);
  return m ? m[1].length : 0;
}

interface HeadingInfo {
  lineIndex: number;
  level: number;
}

/** Find all headings in the content area, skipping those inside fenced code blocks */
function findHeadings(lines: string[], contentStart: number): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  let inCodeBlock = false;

  for (let i = contentStart; i < lines.length; i++) {
    if (/^(`{3,}|~{3,})/.test(lines[i])) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const level = headingLevel(lines[i]);
    if (level > 0) headings.push({ lineIndex: i, level });
  }

  return headings;
}

/** Return the number of sections (headings) in the document */
export function getSectionCount(markdown: string): number {
  const lines = markdown.split('\n');
  return findHeadings(lines, frontmatterEndLine(lines)).length;
}

/**
 * Extract the raw markdown for section N (0-indexed).
 * Returns null if sectionIndex is out of range.
 */
export function extractSection(markdown: string, sectionIndex: number): string | null {
  const lines = markdown.split('\n');
  const contentStart = frontmatterEndLine(lines);
  const headings = findHeadings(lines, contentStart);

  if (sectionIndex < 0 || sectionIndex >= headings.length) return null;

  const { lineIndex: startLine, level: sectionLevel } = headings[sectionIndex];

  // Section ends at the next heading of same or higher level (fewer #s)
  let endLine = lines.length;
  for (let i = sectionIndex + 1; i < headings.length; i++) {
    if (headings[i].level <= sectionLevel) {
      endLine = headings[i].lineIndex;
      break;
    }
  }

  return lines.slice(startLine, endLine).join('\n').trimEnd();
}

/**
 * Replace section N with newContent, returning the full updated markdown.
 * The frontmatter and all other sections are preserved unchanged.
 * Returns the original markdown if sectionIndex is out of range.
 */
export function spliceSection(
  markdown: string,
  sectionIndex: number,
  newContent: string
): string {
  const lines = markdown.split('\n');
  const contentStart = frontmatterEndLine(lines);
  const headings = findHeadings(lines, contentStart);

  if (sectionIndex < 0 || sectionIndex >= headings.length) return markdown;

  const { lineIndex: startLine, level: sectionLevel } = headings[sectionIndex];

  let endLine = lines.length;
  for (let i = sectionIndex + 1; i < headings.length; i++) {
    if (headings[i].level <= sectionLevel) {
      endLine = headings[i].lineIndex;
      break;
    }
  }

  const before = lines.slice(0, startLine);
  const after = lines.slice(endLine);
  const newLines = newContent.trimEnd().split('\n');

  // Ensure a blank line separates this section from the next
  const result: string[] = [...before, ...newLines];
  if (after.length > 0 && after[0].trim() !== '') result.push('');
  result.push(...after);

  return result.join('\n');
}
