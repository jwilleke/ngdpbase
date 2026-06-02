/**
 * MarqueePlugin — CSS-based horizontally scrolling text banner for ngdpbase.
 *
 * Uses CSS animation (not the deprecated <marquee> element) for modern browser
 * compatibility.  Text is duplicated internally so the scroll loop is seamless.
 *
 * Syntax:
 *   [{MarqueePlugin text='Hello World!'}]
 *   [{MarqueePlugin text='Breaking news…' speed='fast' direction='left' bgcolor='#f8d7da' color='#721c24'}]
 *   [{MarqueePlugin text='Slide and stop' behavior='slide' loop='1'}]
 *
 * Parameters:
 *   text      — The message to scroll (required).
 *   speed     — 'slow' (30 s) | 'medium' (20 s, default) | 'fast' (10 s) | numeric seconds.
 *   direction — 'left' (default) | 'right'.
 *   behavior  — 'scroll' (default, infinite loop) | 'slide' (stops at edge) | 'alternate' (bounces).
 *   loop      — Number of passes, or 'infinite' (default).  Ignored when behavior='scroll'.
 *   bgcolor   — CSS background-color for the banner strip (optional).
 *   color     — CSS text color (optional).
 *   separator — String inserted between repetitions (default '   •   ').  Only used by scroll.
 *   fontsize  — CSS font-size for the banner text (e.g. '1.5em', '24px', '2rem'). Default: inherits.
 *   cssclass  — Extra CSS class added to the outer wrapper (optional).
 */

import type { SimplePlugin, PluginContext, PluginParams } from './types.js';
import { escapeHtml, resolveManagerFetch } from '../utils/pluginFormatters.js';

// ─── unique ID counter so multiple banners on one page don't share keyframes ──
let _idCounter = 0;

// ─── speed presets ─────────────────────────────────────────────────────────────
const SPEED_PRESETS: Record<string, number> = {
  slow:   30,
  medium: 20,
  fast:   10
};

function parseDuration(value: string | number | undefined): number {
  if (!value) return SPEED_PRESETS.medium;
  const s = String(value).trim().toLowerCase();
  if (s in SPEED_PRESETS) return SPEED_PRESETS[s];
  const n = parseFloat(s);
  return isNaN(n) || n <= 0 ? SPEED_PRESETS.medium : n;
}

function parseLoop(value: string | number | undefined): string {
  if (!value || String(value).toLowerCase() === 'infinite') return 'infinite';
  const n = parseInt(String(value), 10);
  return isNaN(n) || n < 1 ? 'infinite' : String(n);
}

// ─── plugin ────────────────────────────────────────────────────────────────────

const MarqueePlugin: SimplePlugin = {
  name:        'MarqueePlugin',
  description: 'CSS scrolling text banner (marquee replacement)',
  author:      'ngdpbase',
  version:     '1.0.0',

  async execute(context: PluginContext, params: PluginParams): Promise<string> {
    let text = String(params.text ?? '').trim();

    // If fetch param is set, call the specified manager method to get text.
    // Syntax: fetch='ManagerName.methodName(k=v,...)' — e.g. fetch='HansDataManager.toMarqueeText(limit=3)'
    // Shared convention helper (#685 slice 2); the manager owns its own arg parsing.
    if (params.fetch) {
      const result = await resolveManagerFetch(String(params.fetch), context);
      if (result.status === 'ok') {
        text = result.text;
      } else if (result.status === 'not-found') {
        return `<span class="text-muted"><em>[MarqueePlugin: fetch target '${escapeHtml(String(params.fetch))}' not found]</em></span>`;
      }
      // 'no-spec' (malformed / no engine) → fall through with the literal text param, as before.
    }

    if (!text) {
      return '<span class="text-muted"><em>[MarqueePlugin: no text provided]</em></span>';
    }

    const direction = String(params.direction ?? 'left').toLowerCase() === 'right' ? 'right' : 'left';
    const behavior  = (['slide', 'alternate'].includes(String(params.behavior ?? '').toLowerCase()))
      ? (String(params.behavior).toLowerCase() as 'slide' | 'alternate')
      : 'scroll';
    const duration  = parseDuration(params.speed as string | number | undefined);
    const loop      = behavior === 'scroll' ? 'infinite' : parseLoop(params.loop as string | number | undefined);
    const separator = params.separator !== undefined ? String(params.separator) : '     \u2022     ';
    const bgcolor   = params.bgcolor   ? String(params.bgcolor)   : '';
    const color     = params.color     ? String(params.color)     : '';
    const fontsize  = params.fontsize  ? String(params.fontsize).replace(/[^a-zA-Z0-9.%]/g, '') : '';
    const cssclass  = params.cssclass  ? String(params.cssclass)  : '';

    const id = `ngdp-mq-${++_idCounter}`;
    const safeText = escapeHtml(text);
    // 'blank' separator → invisible fixed-width gap (avoids whitespace-collapse in param parser)
    const isSepBlank = separator.trim().toLowerCase() === 'blank';
    const safeSep  = isSepBlank ? '' : escapeHtml(separator);

    // ── build inline styles ──────────────────────────────────────────────────
    const wrapStyle  = [
      'overflow:hidden',
      'white-space:nowrap',
      'line-height:1.4',
      'padding:0.2em 0',
      bgcolor   ? `background:${bgcolor}`   : '',
      color     ? `color:${color}`          : '',
      fontsize  ? `font-size:${fontsize}`   : ''
    ].filter(Boolean).join(';');

    // ── build keyframes + animation per behavior ─────────────────────────────
    let keyframes: string;
    let animationProps: string;

    if (behavior === 'slide') {
      // Slides in from one side and stops at the opposite edge
      const from = direction === 'left' ? 'translateX(100%)' : 'translateX(-100%)';
      const to   = direction === 'left' ? 'translateX(0%)'   : 'translateX(0%)';
      keyframes = `@keyframes ${id}{from{transform:${from}}to{transform:${to}}}`;
      animationProps = `${id} ${duration}s ease-out ${loop === 'infinite' ? 'infinite' : loop} forwards`;

    } else if (behavior === 'alternate') {
      // Bounces left and right (similar to marquee behavior=alternate)
      keyframes = `@keyframes ${id}{0%{transform:translateX(0%)}50%{transform:translateX(-80%)}100%{transform:translateX(0%)}}`;
      if (direction === 'right') {
        keyframes = `@keyframes ${id}{0%{transform:translateX(-80%)}50%{transform:translateX(0%)}100%{transform:translateX(-80%)}}`;
      }
      animationProps = `${id} ${duration}s ease-in-out ${loop} alternate`;

    } else {
      // scroll — seamless infinite loop via text duplication
      // Content is doubled: [text][sep][text][sep], animation moves -50%
      const from = direction === 'left'  ? 'translateX(0%)'   : 'translateX(-50%)';
      const to   = direction === 'left'  ? 'translateX(-50%)' : 'translateX(0%)';
      keyframes = `@keyframes ${id}{from{transform:${from}}to{transform:${to}}}`;
      animationProps = `${id} ${duration}s linear infinite`;
    }

    // ── build inner content ──────────────────────────────────────────────────
    // 'blank' → a fixed-width invisible spacer; otherwise wrap in white-space:pre
    // so any spaces in the separator string survive HTML rendering.
    const sepHtml = isSepBlank
      ? '<span style="display:inline-block;width:8em" aria-hidden="true"></span>'
      : `<span style="display:inline-block;white-space:pre">${safeSep}</span>`;
    let innerContent: string;
    if (behavior === 'scroll') {
      // Duplicate for seamless loop
      innerContent = `${safeText}${sepHtml}${safeText}${sepHtml}`;
    } else {
      innerContent = safeText;
    }

    const innerStyle = `display:inline-block;padding-left:${behavior === 'scroll' ? '2em' : '0'};animation:${animationProps};animation-play-state:running`;

    return [
      `<style>${keyframes}</style>`,
      `<div class="ngdp-marquee-wrap${cssclass ? ' ' + escapeHtml(cssclass) : ''}" style="${wrapStyle}" aria-label="${safeText}">`,
      `  <span class="ngdp-marquee-inner" style="${innerStyle}" onmouseenter="this.style.animationPlayState='paused'" onmouseleave="this.style.animationPlayState='running'">`,
      `    ${innerContent}`,
      '  </span>',
      '</div>'
    ].join('\n');
  }
};

export default MarqueePlugin;
