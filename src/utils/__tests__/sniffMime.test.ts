import { sniffMime, resolveUploadMime } from '../sniffMime';
import { untrustedFileHeaders } from '../securityHeaders';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const html = (s: string): Buffer => Buffer.from(s, 'utf8');

describe('#1624 sniffMime', () => {
  test('recognises raster, PDF and markup from the bytes', () => {
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(html('%PDF-1.7\n'))).toBe('application/pdf');
    expect(sniffMime(html('﻿  <?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>'))).toBe('image/svg+xml');
    expect(sniffMime(html('<!DOCTYPE html><p>hi'))).toBe('text/html');
    expect(sniffMime(html('<script>alert(1)</script>'))).toBe('text/html');
    expect(sniffMime(html('<?xml version="1.0"?><note/>'))).toBe('text/xml');
    expect(sniffMime(html('plain text'))).toBeNull();
  });
});

describe('#1624 resolveUploadMime: the bytes decide', () => {
  test('HTML declared as an image is stored as HTML', () => {
    expect(resolveUploadMime(html('<html><script>alert(1)</script>'), 'image/png')).toBe('text/html');
  });
  test('a claim of a recognisable type the bytes do not bear out becomes octet-stream', () => {
    expect(resolveUploadMime(html('not a pdf'), 'application/pdf')).toBe('application/octet-stream');
  });
  test('an unrecognisable file keeps its declared type', () => {
    expect(resolveUploadMime(html('hello'), 'text/plain')).toBe('text/plain');
    expect(resolveUploadMime(html('hello'), undefined)).toBe('application/octet-stream');
  });
});

describe('#1624 untrustedFileHeaders', () => {
  test('sandboxes everything served from uploads except PDF', () => {
    expect(untrustedFileHeaders('image/svg+xml')).toEqual({ 'Content-Security-Policy': 'sandbox' });
    expect(untrustedFileHeaders('text/html')).toEqual({ 'Content-Security-Policy': 'sandbox' });
    expect(untrustedFileHeaders('image/png')).toEqual({ 'Content-Security-Policy': 'sandbox' });
    expect(untrustedFileHeaders('application/pdf')).toEqual({});
  });
});
