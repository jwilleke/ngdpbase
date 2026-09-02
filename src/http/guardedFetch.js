/**
 * The outbound client (#1133).
 *
 * Node's built-in `fetch` is not used here, and that is the point rather than
 * an inconvenience. It is undici, which ignores `http.Agent` and so ignores
 * the guarded lookup in ./guardedLookup.ts that is the actual control — a
 * guard installed on an Agent and then bypassed by `fetch()` looks correct in
 * review and does nothing. `fetch` also follows redirects internally, which is
 * exactly the step that has to be inspected rather than delegated.
 *
 * So requests go through node:http / node:https with the guarded agents, and
 * redirects are followed by hand. Every hop is a fresh guarded request: the
 * validated first URL is public and the server answers
 * `302 http://169.254.169.254/…`, which no amount of checking the original URL
 * would catch.
 *
 * Forbidding `fetch` outside this module is also what makes the boundary
 * enforceable rather than merely present — "calling fetch is fine provided a
 * dispatcher was installed first" is not something a CI check can see. That
 * check is #1139.
 *
 * Adapted from `src/http/guarded-fetch.ts` in jwilleke/yourphr, sole-authored
 * by the copyright holder and contributed here under this repository's
 * Apache-2.0 licence.
 */
import { Agent as HttpAgent, request as httpRequest } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { validateUrl } from './ssrf.js';
import { guardedLookup } from './guardedLookup.js';
const DEFAULTS = { maxRedirects: 5, maxBytes: 8 * 1024 * 1024, timeoutMs: 30_000 };
/** Statuses that carry a `Location` worth following. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** The real transport: node:http / node:https, whose agents carry the guarded lookup. */
const nodeTransport = (url, init) => new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, { method: init.method, headers: init.headers, agent: init.agent, timeout: init.timeoutMs }, (res) => {
        resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: res
        });
    });
    req.on('timeout', () => req.destroy(new Error(`timed out after ${init.timeoutMs}ms`)));
    req.on('error', reject);
    req.end();
});
/** Read chunks up to `maxBytes`, refusing — and stopping — rather than buffering past it. */
async function readCapped(body, maxBytes) {
    const parts = [];
    let total = 0;
    for await (const chunk of body) {
        total += chunk.length;
        if (total > maxBytes) {
            throw new Error(`response body too large: exceeded maxBytes ${maxBytes}`);
        }
        parts.push(chunk);
    }
    return Buffer.concat(parts);
}
/** The first header value, since node presents repeated headers as an array. */
function headerValue(value) {
    return Array.isArray(value) ? value[0] : value;
}
/**
 * Fetch `target`, refusing at every hop to connect anywhere the policy does
 * not permit.
 *
 * Each hop is validated as a URL first (a courtesy, and it catches a scheme
 * change) and then at connect time by the guarded lookup, which is the control.
 */
export async function guardedFetch(target, options) {
    const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
    const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
    const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    const transport = options.transport ?? nodeTransport;
    // keepAlive: false is load-bearing. A pooled connection skips resolution on
    // reuse, so the guard would run for the first request to a host and never
    // again — every later request riding a connection validated once, long ago.
    const agentOptions = { lookup: guardedLookup(options.policy, options.resolver), keepAlive: false };
    const agents = { http: new HttpAgent(agentOptions), https: new HttpsAgent(agentOptions) };
    const chain = [];
    let current = target;
    for (let hop = 0; hop <= maxRedirects; hop++) {
        const checked = validateUrl(current, options.policy);
        if (!checked.ok) {
            throw new Error(checked.reason);
        }
        const url = checked.url;
        chain.push(url.toString());
        const res = await transport(url, {
            method: options.method ?? 'GET',
            headers: options.headers ?? {},
            agent: url.protocol === 'https:' ? agents.https : agents.http,
            timeoutMs
        });
        const location = headerValue(res.headers['location']);
        if (!REDIRECT_STATUSES.has(res.status) || !location) {
            return {
                status: res.status,
                headers: res.headers,
                body: await readCapped(res.body, maxBytes),
                finalUrl: url.toString(),
                chain
            };
        }
        // Relative Locations are legal and common; resolve against the hop that
        // issued them, then validate the result like any other target.
        current = new URL(location, url).toString();
    }
    throw new Error(`too many redirects: stopped after ${maxRedirects} (${chain.join(' -> ')})`);
}
//# sourceMappingURL=guardedFetch.js.map