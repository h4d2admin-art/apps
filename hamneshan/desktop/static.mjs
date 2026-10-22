import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export const APP_SCHEME = 'hamneshan';
export const APP_URL = `${APP_SCHEME}://app/`;
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const MIME = new Map([
  ['html', 'text/html; charset=utf-8'], ['js', 'text/javascript; charset=utf-8'],
  ['mjs', 'text/javascript; charset=utf-8'], ['css', 'text/css; charset=utf-8'],
  ['json', 'application/json; charset=utf-8'], ['txt', 'text/plain; charset=utf-8'],
  ['svg', 'image/svg+xml'], ['png', 'image/png'], ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'], ['webp', 'image/webp'], ['gif', 'image/gif'],
  ['ico', 'image/x-icon'], ['woff', 'font/woff'], ['woff2', 'font/woff2'],
]);

export function isApplicationURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === `${APP_SCHEME}:` && url.hostname === 'app'
      && !url.port && !url.username && !url.password;
  } catch { return false; }
}

function response(body, status, contentType = 'text/plain; charset=utf-8', headOnly = false) {
  return new Response(headOnly ? null : body, {
    status,
    headers: {
      'Content-Type': contentType,
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function contained(root, target) {
  const rel = relative(root, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\'));
}

/** Serves only regular files beneath dist, including protection against symlink escapes. */
export async function createStaticResponse(request, root) {
  const headOnly = request.method === 'HEAD';
  if (request.method !== 'GET' && !headOnly) return response('Method not allowed', 405);
  if (!isApplicationURL(request.url)) return response('Forbidden', 403, undefined, headOnly);
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname); }
  catch { return response('Invalid URL', 400, undefined, headOnly); }
  // Backslashes and colons are path separators/alternate streams on Windows.
  if (/[\\\u0000-\u001f:]/.test(pathname)) return response('Forbidden', 403, undefined, headOnly);
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some(segment => segment === '.' || segment === '..' || segment.startsWith('.'))) {
    return response('Forbidden', 403, undefined, headOnly);
  }
  if (!segments.length) segments.push('index.html');
  const candidate = resolve(root, ...segments);
  if (!contained(resolve(root), candidate)) return response('Forbidden', 403, undefined, headOnly);
  try {
    const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
    if (!contained(realRoot, realCandidate)) return response('Forbidden', 403, undefined, headOnly);
    if (!(await stat(realCandidate)).isFile()) return response('Not found', 404, undefined, headOnly);
    const extension = realCandidate.split('.').pop().toLowerCase();
    return response(headOnly ? null : await readFile(realCandidate), 200, MIME.get(extension) || 'application/octet-stream', headOnly);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return response('Not found', 404, undefined, headOnly);
    return response('File unavailable', 500, undefined, headOnly);
  }
}
