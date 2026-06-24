import flightWorker from './index';

/**
 * Combined OSIRIS Worker entry point.
 *
 * Existing OSIRIS flight routes continue to fall through to ./index.
 * SAM.gov Search uses /samgov/* routes on the already working OSIRIS Worker:
 * https://osiris-v2.spotterdeer.workers.dev/samgov
 */

const SAM_ORIGIN = 'https://sam.gov';
const INTERNAL_SEARCH_URL = 'https://sam.gov/api/prod/sgs/v1/search/';
const INTERNAL_DETAILS_URL = 'https://sam.gov/api/prod/opps/v2/opportunities';
const INTERNAL_RESOURCES_URL = 'https://sam.gov/api/prod/opps/v3/opportunities';
const INTERNAL_DOWNLOAD_URL = 'https://sam.gov/api/prod/opps/v3/opportunities/resources/files';

const SEARCH_ALLOWED_PARAMS = new Set([
  'index',
  'page',
  'mode',
  'sort',
  'size',
  'q',
  'postedFrom',
  'postedTo',
  'is_active',
  'status',
  'opp_type',
  'naics',
  'naicsCode',
  'classificationCode',
  'organization_id',
]);

function samCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept',
    'Access-Control-Max-Age': '86400',
  };
}

function samJson(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      ...samCorsHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function samError(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return samJson({ ok: false, error: message, ...extra }, status);
}

function cleanSamSegment(value: string) {
  const text = String(value || '').trim();
  if (!text || text.length > 160) return '';
  if (!/^[A-Za-z0-9_.:-]+$/.test(text)) return '';
  return text;
}

function buildSamSearchUrl(sourceUrl: URL) {
  const target = new URL(INTERNAL_SEARCH_URL);
  for (const [key, value] of sourceUrl.searchParams.entries()) {
    if (SEARCH_ALLOWED_PARAMS.has(key)) target.searchParams.append(key, value);
  }

  if (!target.searchParams.has('index')) target.searchParams.set('index', 'opp');
  if (!target.searchParams.has('mode')) target.searchParams.set('mode', 'search');
  if (!target.searchParams.has('sort')) target.searchParams.set('sort', '-modifiedDate');

  const size = Number(target.searchParams.get('size') || '100');
  if (!Number.isFinite(size) || size < 1 || size > 100) target.searchParams.set('size', '100');

  const page = Number(target.searchParams.get('page') || '0');
  if (!Number.isFinite(page) || page < 0 || page > 1000) target.searchParams.set('page', '0');

  return target;
}

function samHeaders() {
  return {
    'Accept': 'application/hal+json, application/json, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': SAM_ORIGIN,
    'Referer': 'https://sam.gov/search/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  };
}

async function samRelay(request: Request, targetUrl: URL | string, cacheSeconds = 30) {
  const upstream = await fetch(targetUrl.toString(), {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: samHeaders(),
    redirect: 'follow',
  });

  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(samCorsHeaders())) headers.set(key, value);
  headers.set('Cache-Control', upstream.ok ? `public, max-age=${cacheSeconds}` : 'no-store');
  headers.delete('Content-Security-Policy');
  headers.delete('X-Frame-Options');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function handleSamgov(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/samgov/, '').replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: samCorsHeaders() });
  if (request.method !== 'GET' && request.method !== 'HEAD') return samError('Only GET, HEAD, and OPTIONS are allowed.', 405);

  if (path === '/' || path === '/health') {
    return samJson({
      ok: true,
      name: 'samgovsearch no-api proxy',
      sourceRepo: 'DeerSpotter/osiris-v2',
      routePrefix: '/samgov',
      usesApiKey: false,
      endpoints: ['/samgov/search', '/samgov/details/{noticeId}', '/samgov/resources/{noticeId}', '/samgov/download/{resourceId}'],
    });
  }

  if (path === '/search') return samRelay(request, buildSamSearchUrl(url), 20);

  const detailsMatch = path.match(/^\/details\/([^/]+)$/);
  if (detailsMatch) {
    const noticeId = cleanSamSegment(decodeURIComponent(detailsMatch[1]));
    if (!noticeId) return samError('Invalid notice ID.', 400);
    return samRelay(request, `${INTERNAL_DETAILS_URL}/${encodeURIComponent(noticeId)}`, 60);
  }

  const resourcesMatch = path.match(/^\/resources\/([^/]+)$/);
  if (resourcesMatch) {
    const noticeId = cleanSamSegment(decodeURIComponent(resourcesMatch[1]));
    if (!noticeId) return samError('Invalid notice ID.', 400);
    return samRelay(request, `${INTERNAL_RESOURCES_URL}/${encodeURIComponent(noticeId)}/resources`, 60);
  }

  const downloadMatch = path.match(/^\/download\/([^/]+)$/);
  if (downloadMatch) {
    const resourceId = cleanSamSegment(decodeURIComponent(downloadMatch[1]));
    if (!resourceId) return samError('Invalid resource ID.', 400);
    return samRelay(request, `${INTERNAL_DOWNLOAD_URL}/${encodeURIComponent(resourceId)}/download`, 10);
  }

  return samError('SAM.gov route not found.', 404, { path });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/samgov' || url.pathname.startsWith('/samgov/')) {
      try {
        return await handleSamgov(request);
      } catch (error) {
        return samError(error instanceof Error ? error.message : String(error), 502);
      }
    }

    return flightWorker.fetch(request);
  },
};
