/**
 * Unit tests for SlideshowPlugin (#453)
 *
 * @jest-environment node
 */

import SlideshowPluginModule from '../SlideshowPlugin';
import { asExecuted } from '../../test-support/plugins';

const SlideshowPlugin = asExecuted(SlideshowPluginModule);
const ctx = { pageName: 'TestPage', linkGraph: {} };

describe('SlideshowPlugin — metadata', () => {
  test('has expected name and execute function', () => {
    expect(SlideshowPlugin.name).toBe('SlideshowPlugin');
    expect(typeof SlideshowPlugin.execute).toBe('function');
  });
});

describe('SlideshowPlugin — missing images', () => {
  test('returns error when images param is omitted', () => {
    const out = SlideshowPlugin.execute(ctx, {});
    expect(out).toContain('no images provided');
  });

  test('returns error when images param is empty string', () => {
    const out = SlideshowPlugin.execute(ctx, { images: '' });
    expect(out).toContain('no images provided');
  });
});

describe('SlideshowPlugin — basic output', () => {
  test('renders a Bootstrap carousel wrapper', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg' });
    expect(out).toContain('carousel');
    expect(out).toContain('carousel-inner');
    expect(out).toContain('carousel-item');
  });

  test('first slide has active class', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg' });
    expect(out).toContain('carousel-item active');
  });

  test('renders img tags with src', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg' });
    expect(out).toContain('src="a.jpg"');
    expect(out).toContain('src="b.jpg"');
  });

  test('single image works without error', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'solo.jpg' });
    expect(out).toContain('carousel-item active');
    expect(out).toContain('src="solo.jpg"');
  });
});

describe('SlideshowPlugin — indicators', () => {
  test('renders indicator dots by default', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg' });
    expect(out).toContain('carousel-indicators');
  });

  test('hides indicators when indicators=false', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg', indicators: 'false' });
    expect(out).not.toContain('carousel-indicators');
  });
});

describe('SlideshowPlugin — controls', () => {
  test('renders prev/next buttons by default', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg' });
    expect(out).toContain('carousel-control-prev');
    expect(out).toContain('carousel-control-next');
  });

  test('hides controls when controls=false', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg', controls: 'false' });
    expect(out).not.toContain('carousel-control-prev');
    expect(out).not.toContain('carousel-control-next');
  });
});

describe('SlideshowPlugin — interval / autoplay', () => {
  test('default interval sets data-bs-ride=carousel', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg' });
    expect(out).toContain('data-bs-ride="carousel"');
  });

  test('default interval embeds data-bs-interval on slides', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg' });
    expect(out).toContain('data-bs-interval="5000"');
  });

  test('custom interval is used', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg', interval: '3000' });
    expect(out).toContain('data-bs-interval="3000"');
  });

  test('interval=0 sets data-bs-ride=false', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg', interval: '0' });
    expect(out).toContain('data-bs-ride="false"');
  });

  test('interval=0 omits data-bs-interval from slides', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg', interval: '0' });
    expect(out).not.toContain('data-bs-interval');
  });
});

describe('SlideshowPlugin — captions', () => {
  test('renders caption block when captions provided', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg', captions: 'First,Second' });
    expect(out).toContain('carousel-caption');
    expect(out).toContain('First');
    expect(out).toContain('Second');
  });

  test('no caption block when captions omitted', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg' });
    expect(out).not.toContain('carousel-caption');
  });
});

describe('SlideshowPlugin — alt text', () => {
  test('uses explicit alts param for alt attribute', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg', alts: 'My Alt' });
    expect(out).toContain('alt="My Alt"');
  });

  test('falls back to captions for alt when alts not provided', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg', captions: 'My Caption' });
    expect(out).toContain('alt="My Caption"');
  });

  test('falls back to filename for alt when neither alts nor captions provided', () => {
    const out = SlideshowPlugin.execute(ctx, { images: '/path/to/photo.jpg' });
    expect(out).toContain('alt="photo.jpg"');
  });
});

describe('SlideshowPlugin — height', () => {
  test('default height is 400px', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg' });
    expect(out).toContain('height:400px');
  });

  test('custom height is applied', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg', height: '300px' });
    expect(out).toContain('height:300px');
  });
});

describe('SlideshowPlugin — max parameter', () => {
  test('max limits the number of slides', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg,c.jpg,d.jpg', max: '2' });
    expect(out).toContain('src="a.jpg"');
    expect(out).toContain('src="b.jpg"');
    expect(out).not.toContain('src="c.jpg"');
    expect(out).not.toContain('src="d.jpg"');
  });

  test('max=0 shows all slides', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg,c.jpg', max: '0' });
    expect(out).toContain('src="a.jpg"');
    expect(out).toContain('src="b.jpg"');
    expect(out).toContain('src="c.jpg"');
  });
});

describe('SlideshowPlugin — cssclass', () => {
  test('appends extra CSS class to wrapper', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg', cssclass: 'my-gallery' });
    expect(out).toContain('my-gallery');
  });
});

describe('SlideshowPlugin — XSS safety', () => {
  test('escapes HTML in image src', () => {
    const out = SlideshowPlugin.execute(ctx, { images: '"><script>alert(1)</script>' });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  test('escapes HTML in caption', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg', captions: '<b>evil</b>' });
    expect(out).not.toContain('<b>evil</b>');
    expect(out).toContain('&lt;b&gt;evil&lt;/b&gt;');
  });

  test('escapes HTML in alt text', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg', alts: '" onload="evil()' });
    expect(out).not.toContain('" onload="evil()');
  });

  test('escapes HTML in cssclass', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg', cssclass: '"onmouseover=alert(1)' });
    expect(out).not.toContain('"onmouseover=alert(1)');
  });

  test('escapes HTML in height', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg', height: '400px;background:url(evil)' });
    // Should not contain unescaped semicolon injection — value is escaped
    expect(out).not.toContain('background:url(evil)');
  });
});

describe('SlideshowPlugin — unique IDs', () => {
  test('each call produces a unique carousel ID', () => {
    const out1 = SlideshowPlugin.execute(ctx, { images: 'a.jpg' }) as string;
    const out2 = SlideshowPlugin.execute(ctx, { images: 'b.jpg' }) as string;
    const id1 = (out1.match(/id="(ngdp-ss-\d+)"/) || [])[1];
    const id2 = (out2.match(/id="(ngdp-ss-\d+)"/) || [])[1];
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  test('indicator data-bs-target matches carousel id', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg' }) as string;
    const id = (out.match(/id="(ngdp-ss-\d+)"/) || [])[1];
    expect(out).toContain(`data-bs-target="#${id}"`);
  });

  test('control buttons reference the carousel id', () => {
    const out = SlideshowPlugin.execute(ctx, { images: 'a.jpg,b.jpg' }) as string;
    const id = (out.match(/id="(ngdp-ss-\d+)"/) || [])[1];
    const controlCount = (out.match(new RegExp(`data-bs-target="#${id}"`, 'g')) || []).length;
    // indicators + 2 controls
    expect(controlCount).toBeGreaterThanOrEqual(2);
  });
});
