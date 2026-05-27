const ORIGIN = 'https://main--j2retail--cpilsworth.aem.live';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const isTrade = url.hostname === 'trade.diffatech.co.uk';
    const isRetail = url.hostname === 'retail.diffatech.co.uk';

    if (!isTrade && !isRetail) {
      return new Response('Not Found', { status: 404 });
    }

    if (isRetail && /^\/trade(\/|$)/i.test(url.pathname)) {
      return new Response('Not Found', { status: 404 });
    }

    const upstreamUrl = ORIGIN + url.pathname + url.search;
    const upstreamRequest = new Request(upstreamUrl, request);
    upstreamRequest.headers.set('host', new URL(ORIGIN).host);

    return fetch(upstreamRequest, { redirect: 'manual' });
  },
};
