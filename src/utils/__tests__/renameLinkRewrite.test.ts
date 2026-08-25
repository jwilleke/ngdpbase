/**
 * Tests for the rename link rewriter (#1094).
 *
 * The rules under test are the ones that decide whether a rewrite is a fix or
 * a corruption: which of the three link forms is being looked at, whether the
 * target doubles as the display text, and what must never be touched.
 */

import { describe, it, expect } from 'vitest';
import { rewriteLinkTargets } from '../renameLinkRewrite.js';

describe('rewriteLinkTargets', () => {
  describe('the three link forms', () => {
    it('rewrites [Old Title]', () => {
      const result = rewriteLinkTargets('See [Old Title] for more.', 'Old Title', 'New Title');
      expect(result.content).toBe('See [New Title] for more.');
      expect(result.rewritten).toBe(1);
    });

    it('rewrites the target of [Display|Old Title], leaving the display text alone', () => {
      const result = rewriteLinkTargets('See [the old page|Old Title].', 'Old Title', 'New Title');
      expect(result.content).toBe('See [the old page|New Title].');
      expect(result.rewritten).toBe(1);
    });

    it('rewrites [Display|Old Title|attributes] and preserves the attributes', () => {
      const result = rewriteLinkTargets(
        'See [the old page|Old Title|class=lead target=_blank].',
        'Old Title',
        'New Title'
      );
      expect(result.content).toBe('See [the old page|New Title|class=lead target=_blank].');
      expect(result.rewritten).toBe(1);
    });

    it('rewrites every occurrence and counts them', () => {
      const result = rewriteLinkTargets(
        '[Old Title] and [see it|Old Title] and [Old Title|x=1] again',
        'Old Title',
        'New Title'
      );
      // The third is `[text|target]` where the *text* is "Old Title" and the
      // target is "x=1" — so only two of the three point at the renamed page.
      expect(result.rewritten).toBe(2);
      expect(result.content).toBe('[New Title] and [see it|New Title] and [Old Title|x=1] again');
    });
  });

  describe('fragments', () => {
    it('preserves a plain #fragment', () => {
      const result = rewriteLinkTargets('[Old Title#setup]', 'Old Title', 'New Title');
      expect(result.content).toBe('[New Title#setup]');
    });

    it('preserves a #section= fragment verbatim, spaces and all', () => {
      const result = rewriteLinkTargets(
        '[read this|Old Title#section=Getting Started]',
        'Old Title',
        'New Title'
      );
      expect(result.content).toBe('[read this|New Title#section=Getting Started]');
    });

    it('matches on the part before the fragment, not the whole target', () => {
      const result = rewriteLinkTargets('[Old Title#a] [Old Title]', 'Old Title', 'New Title');
      expect(result.rewritten).toBe(2);
    });
  });

  describe('case sensitivity differs by form', () => {
    it('rewrites a case-variant target when the reader cannot see it', () => {
      const result = rewriteLinkTargets('[the page|old title]', 'Old Title', 'New Title');
      expect(result.content).toBe('[the page|New Title]');
      expect(result.rewritten).toBe(1);
    });

    it('does NOT rewrite [old title] — the target is the prose', () => {
      const result = rewriteLinkTargets('[old title]', 'Old Title', 'New Title');
      expect(result.content).toBe('[old title]');
      expect(result.rewritten).toBe(0);
      expect(result.unchangedTargets).toContain('old title');
    });
  });

  describe('targets that are not local pages', () => {
    it.each([
      ['external http', '[docs|https://example.com/Old Title]'],
      ['mailto', '[mail us|mailto:Old Title]'],
      ['bare fragment', '[jump|#Old Title]'],
      ['absolute path', '[file|/Old Title]'],
      ['InterWiki', '[there|Wikipedia:Old Title]']
    ])('leaves a %s target alone', (_label, content) => {
      const result = rewriteLinkTargets(content, 'Old Title', 'New Title');
      expect(result.content).toBe(content);
      expect(result.rewritten).toBe(0);
    });

    it('leaves a markdown link alone', () => {
      const content = 'See [Old Title](Old Title) here.';
      const result = rewriteLinkTargets(content, 'Old Title', 'New Title');
      expect(result.content).toBe(content);
      expect(result.rewritten).toBe(0);
    });

    it('does not mangle a task list checkbox', () => {
      const content = '- [ ] todo\n- [x] done';
      const result = rewriteLinkTargets(content, 'Old Title', 'New Title');
      expect(result.content).toBe(content);
      expect(result.unchangedTargets).not.toContain(' ');
    });
  });

  describe('what it reports rather than repairs', () => {
    it('leaves a fuzzy plural variant and reports it', () => {
      const result = rewriteLinkTargets('[Old Titles]', 'Old Title', 'New Title');
      expect(result.content).toBe('[Old Titles]');
      expect(result.rewritten).toBe(0);
      expect(result.unchangedTargets).toEqual(['Old Titles']);
    });

    it('de-duplicates the unchanged targets it reports', () => {
      const result = rewriteLinkTargets('[Other] [Other] [Another]', 'Old Title', 'New Title');
      expect(result.unchangedTargets).toEqual(['Other', 'Another']);
    });
  });

  describe('no-ops', () => {
    it.each([
      ['blank old title', '', 'New Title'],
      ['blank new title', 'Old Title', ''],
      ['identical titles', 'Old Title', 'Old Title']
    ])('returns the content untouched for a %s', (_label, from, to) => {
      const content = '[Old Title]';
      const result = rewriteLinkTargets(content, from, to);
      expect(result.content).toBe(content);
      expect(result.rewritten).toBe(0);
    });

    it('handles empty content', () => {
      const result = rewriteLinkTargets('', 'Old Title', 'New Title');
      expect(result.rewritten).toBe(0);
    });

    it('trims surrounding whitespace on the titles', () => {
      const result = rewriteLinkTargets('[Old Title]', '  Old Title  ', '  New Title  ');
      expect(result.content).toBe('[New Title]');
    });
  });
});
