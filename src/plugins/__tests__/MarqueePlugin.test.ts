/**
 * Unit tests for MarqueePlugin (#454)
 *
 * @jest-environment node
 */

import MarqueePluginModule from '../MarqueePlugin' ;
import { asExecuted } from '../../test-support/plugins';
import type { SimplePlugin } from '../types';
const MarqueePlugin = asExecuted(MarqueePluginModule) as unknown as SimplePlugin;
const ctx = { pageName: 'TestPage', linkGraph: {} };

describe('MarqueePlugin — metadata', () => {
  test('has expected name and execute function', () => {
    expect(MarqueePlugin.name).toBe('MarqueePlugin');
    expect(typeof MarqueePlugin.execute).toBe('function');
  });
});

describe('MarqueePlugin — missing text', () => {
  test('returns an error message when text is omitted', async () => {
    const out = await MarqueePlugin.execute(ctx, {});
    expect(out).toContain('no text provided');
  });

  test('returns an error message when text is empty string', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: '' });
    expect(out).toContain('no text provided');
  });
});

describe('MarqueePlugin — basic output', () => {
  test('wraps text in a marquee container', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hello World' });
    expect(out).toContain('ngdp-marquee-wrap');
    expect(out).toContain('ngdp-marquee-inner');
    expect(out).toContain('Hello World');
  });

  test('includes a <style> block with @keyframes', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hello' });
    expect(out).toContain('<style>');
    expect(out).toContain('@keyframes');
  });

  test('duplicates text for seamless scroll loop (default behavior)', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Ticker' });
    const count = (out.match(/Ticker/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe('MarqueePlugin — XSS safety', () => {
  test('escapes HTML in text', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: '<script>alert(1)</script>' });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  test('escapes HTML in separator', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', separator: '<b>SEP</b>' });
    expect(out).not.toContain('<b>SEP</b>');
    expect(out).toContain('&lt;b&gt;SEP&lt;/b&gt;');
  });

  test('separator=blank renders an invisible spacer span', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', separator: 'blank' });
    expect(out).toContain('width:8em');
    expect(out).not.toContain('blank');
  });

  test('escapes HTML in cssclass', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', cssclass: '"onmouseover=alert(1)' });
    expect(out).not.toContain('"onmouseover=alert(1)');
  });
});

describe('MarqueePlugin — speed parameter', () => {
  test('slow speed produces 30s animation', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', speed: 'slow' });
    expect(out).toContain('30s');
  });

  test('fast speed produces 10s animation', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', speed: 'fast' });
    expect(out).toContain('10s');
  });

  test('medium (default) produces 20s animation', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi' });
    expect(out).toContain('20s');
  });

  test('numeric speed is used directly', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', speed: '7' });
    expect(out).toContain('7s');
  });

  test('invalid speed falls back to medium (20s)', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', speed: 'turbo' });
    expect(out).toContain('20s');
  });
});

describe('MarqueePlugin — direction parameter', () => {
  test('left direction (default) animates toward negative translateX', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', direction: 'left' });
    expect(out).toContain('translateX(-50%)');
  });

  test('right direction animates starting from negative translateX', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', direction: 'right' });
    // right: keyframe starts at -50%
    expect(out).toContain('translateX(-50%)');
  });

  test('unknown direction defaults to left', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', direction: 'up' });
    expect(out).toContain('translateX(-50%)');
  });
});

describe('MarqueePlugin — behavior parameter', () => {
  test('behavior=slide does not duplicate text in content', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Unique', behavior: 'slide' });
    // aria-label + 1 content occurrence = 2 total (no duplication in content)
    const count = (out.match(/Unique/g) || []).length;
    expect(count).toBe(2);
  });

  test('behavior=slide uses ease-out timing', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', behavior: 'slide' });
    expect(out).toContain('ease-out');
  });

  test('behavior=alternate does not duplicate text in content', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Bounce', behavior: 'alternate' });
    // aria-label + 1 content occurrence = 2 total (no duplication in content)
    const count = (out.match(/Bounce/g) || []).length;
    expect(count).toBe(2);
  });

  test('behavior=alternate uses ease-in-out timing', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', behavior: 'alternate' });
    expect(out).toContain('ease-in-out');
  });
});

describe('MarqueePlugin — styling parameters', () => {
  test('bgcolor is applied to wrapper style', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', bgcolor: '#ff0000' });
    expect(out).toContain('background:#ff0000');
  });

  test('color is applied to wrapper style', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', color: 'white' });
    expect(out).toContain('color:white');
  });

  test('cssclass is added to wrapper', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', cssclass: 'my-banner' });
    expect(out).toContain('my-banner');
  });

  test('fontsize is applied to wrapper style', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', fontsize: '1.5em' });
    expect(out).toContain('font-size:1.5em');
  });

  test('fontsize strips non-CSS-unit characters', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi', fontsize: '24px;color:red' });
    expect(out).toContain('font-size:24px');
    expect(out).not.toContain('color:red');
  });

  test('omitting fontsize does not add font-size style', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi' });
    expect(out).not.toContain('font-size');
  });
});

describe('MarqueePlugin — pause on hover', () => {
  test('inner span has mouse event handlers for pause/resume', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Hi' });
    expect(out).toContain('onmouseenter');
    expect(out).toContain('onmouseleave');
    expect(out).toContain('animationPlayState');
  });
});

describe('MarqueePlugin — accessibility', () => {
  test('wrapper has aria-label with original text', async () => {
    const out = await MarqueePlugin.execute(ctx, { text: 'Accessible text' });
    expect(out).toContain('aria-label="Accessible text"');
  });
});

describe('MarqueePlugin — multiple instances', () => {
  test('each call produces a unique keyframe name', async () => {
    const out1 = await MarqueePlugin.execute(ctx, { text: 'A' });
    const out2 = await MarqueePlugin.execute(ctx, { text: 'B' });
    const id1 = (out1.match(/@keyframes (ngdp-mq-\d+)/) || [])[1];
    const id2 = (out2.match(/@keyframes (ngdp-mq-\d+)/) || [])[1];
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });
});

describe('MarqueePlugin — fetch parameter', () => {
  test('fetch target not found returns error message', async () => {
    const ctxWithEngine = {
      ...ctx,
      engine: { getManager: () => undefined }
    };
    const out = await MarqueePlugin.execute(ctxWithEngine, { fetch: 'UnknownManager.toMarqueeText()' });
    expect(out).toContain('not found');
  });

  test('fetch calls manager method and uses returned text', async () => {
    const ctxWithEngine = {
      ...ctx,
      engine: {
        getManager: (name) => name === 'TestManager'
          ? { toMarqueeText: async () => 'Live data from manager' }
          : undefined
      }
    };
    const out = await MarqueePlugin.execute(ctxWithEngine, { fetch: 'TestManager.toMarqueeText()' });
    expect(out).toContain('Live data from manager');
  });

  test('fetch passes key=value args to manager method', async () => {
    let receivedOptions = null;
    const ctxWithEngine = {
      ...ctx,
      engine: {
        getManager: (name) => name === 'TestManager'
          ? { toMarqueeText: async (opts) => { receivedOptions = opts; return 'ok'; } }
          : undefined
      }
    };
    await MarqueePlugin.execute(ctxWithEngine, { fetch: 'TestManager.toMarqueeText(limit=3,sort=date-desc)' });
    expect(receivedOptions).toEqual({ limit: '3', sort: 'date-desc' });
  });
});
