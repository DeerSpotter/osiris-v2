/**
 * SAM.gov Search no-key proxy.
 *
 * Deploy this from the osiris-v2 repo to create/update:
 * https://samgovsearch.spotterdeer.workers.dev
 *
 * No SAM_API_KEY is used. This only relays the same public SAM.gov
 * website/internal endpoints used by the desktop SAM.gov search app.
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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function errorResponse(message, status = 400, extra = {}) {
  return jsonResponse({ ok: false, error: message, ...extra }, status);
}

function cleanSegment(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 160) return '';
  if (!/^[A-Za-z0-9_.:-]+$/.test(text)) return '';
  return text;
}

function buildSearchUrl(sourceUrl) {
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

async function relay(request, targetUrl, cacheSeconds = 30) {
  const upstream = await fetch(targetUrl.toString(), {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: samHeaders(),
    redirect: 'follow',
  });

  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
  headers.set('Cache-Control', upstream.ok ? `public, max-age=${cacheSeconds}` : 'no-store');
  headers.delete('Content-Security-Policy');
  headers.delete('X-Frame-Options');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  if (request.method !== 'GET' && request.method !== 'HEAD') return errorResponse('Only GET, HEAD, and OPTIONS are allowed.', 405);

  if (path === '/' || path === '/health') {
    return jsonResponse({
      ok: true,
      name: 'samgovsearch no-api proxy',
      sourceRepo: 'DeerSpotter/osiris-v2',
      usesApiKey: false,
      endpoints: ['/search', '/details/{noticeId}', '/resources/{noticeId}', '/download/{resourceId}'],
    });
  }

  if (path === '/search') return relay(request, buildSearchUrl(url), 20);

  const detailsMatch = path.match(/^\/details\/([^/]+)$/);
  if (detailsMatch) {
    const noticeId = cleanSegment(decodeURIComponent(detailsMatch[1]));
    if (!noticeId) return errorResponse('Invalid notice ID.', 400);
    return relay(request, `${INTERNAL_DETAILS_URL}/${encodeURIComponent(noticeId)}`, 60);
  }

  const resourcesMatch = path.match(/^\/resources\/([^/]+)$/);
  if (resourcesMatch) {
    const noticeId = cleanSegment(decodeURIComponent(resourcesMatch[1]));
    if (!noticeId) return errorResponse('Invalid notice ID.', 400);
    return relay(request, `${INTERNAL_RESOURCES_URL}/${encodeURIComponent(noticeId)}/resources`, 60);
  }

  const downloadMatch = path.match(/^\/download\/([^/]+)$/);
  if (downloadMatch) {
    const resourceId = cleanSegment(decodeURIComponent(downloadMatch[1]));
    if (!resourceId) return errorResponse('Invalid resource ID.', 400);
    return relay(request, `${INTERNAL_DOWNLOAD_URL}/${encodeURIComponent(resourceId)}/download`, 10);
  }

  return errorResponse('Route not found.', 404, { path });
}

export default {
  async fetch(request) {
    try {
      return await handleRequest(request);
    } catch (error) {
      return errorResponse(error && error.message ? error.message : String(error), 502);
    }
  },
};
