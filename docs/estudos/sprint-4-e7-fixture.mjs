// Fixture local: dados fictícios e nenhuma integração com reservas ou pagamentos.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
const before = process.env.CRCN_BEFORE_BUILD;
const after = process.env.CRCN_AFTER_BUILD;
if (!before || !after) throw new Error('Set CRCN_BEFORE_BUILD and CRCN_AFTER_BUILD.');
const template = JSON.parse(fs.readFileSync('resources/data/stays-apartments.json', 'utf8'))[0];
const properties = Array.from({ length: 30 }, (_, index) => ({
  ...template,
  id: `test-${index}`,
  staysListingId: `unit-${index}`,
  title: `Apartamento teste ${index + 1}`,
  staysSynced: true,
  images: ['https://fixture.test/apartment.svg'],
}));
const servers = [];
for (const [port, input] of [
  [3191, before],
  [3192, after],
]) {
  const directory = path.resolve(input);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (url.pathname === '/__fixture-image.svg') {
        response.writeHead(200, {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        response.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"/>');
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        let raw = '';
        for await (const chunk of request) raw += chunk;
        const params = raw ? JSON.parse(raw) : {};
        let result = { success: true, data: [] };
        if (url.pathname === '/api/accommodations')
          result = { ...result, source: 'stays-live', data: properties };
        if (/^\/api\/accommodations\/[^/]+$/.test(url.pathname))
          result = {
            data:
              properties.find((p) =>
                [p.id, p.staysListingId].includes(
                  decodeURIComponent(url.pathname.split('/').at(-1)),
                ),
              ) || null,
          };
        if (url.pathname === '/api/search') {
          const limit = params.limit ?? 20;
          const skip = params.skip ?? 0;
          const nights = Math.round((Date.parse(params.to) - Date.parse(params.from)) / 86_400_000);
          const data = properties.slice(skip, skip + limit).map((property) => ({
            ...property,
            ...(params.from && params.to
              ? {
                  calculatedPrice: {
                    nights,
                    dailyRate: 250,
                    basePrice: 250 * nights,
                    cleaningFee: 0,
                    serviceFee: 0,
                    totalAmount: 250 * nights,
                    currency: 'BRL',
                  },
                }
              : {}),
          }));
          result = {
            ...result,
            source: 'stays-live',
            from: params.from ?? null,
            to: params.to ?? null,
            guests: params.guests ?? 1,
            total: data.length,
            data,
            unquotedCount: 0,
            pagination: {
              receivedCount: data.length,
              nextSkip: skip + data.length,
              hasMore: skip + data.length < properties.length,
            },
            ...(params.from && params.to
              ? {
                  meta: {
                    fetchedAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 45_000).toISOString(),
                  },
                }
              : {}),
          };
        }
        setTimeout(() => {
          response.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          });
          response.end(JSON.stringify(result));
        }, 450);
        return;
      }
      let filename = path.resolve(directory, `.${decodeURIComponent(url.pathname)}`);
      if (!filename.startsWith(directory + path.sep) && filename !== directory) {
        response.writeHead(404);
        response.end();
        return;
      }
      if (fs.existsSync(filename) && fs.statSync(filename).isDirectory())
        filename = path.join(filename, 'index.html');
      if (!fs.existsSync(filename)) {
        if (path.extname(url.pathname)) {
          response.writeHead(404);
          response.end();
          return;
        }
        filename = path.join(directory, 'index.html');
      }
      const mime =
        {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
        }[path.extname(filename)] || 'application/octet-stream';
      const raw = fs.readFileSync(filename);
      const compress = /javascript|html|css/.test(mime);
      response.writeHead(200, {
        'Content-Type': mime,
        ...(mime === 'text/html'
          ? {
              'Content-Security-Policy':
                "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'",
            }
          : {}),
        ...(compress ? { 'Content-Encoding': 'gzip' } : {}),
        'Cache-Control': url.pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-store',
      });
      response.end(compress ? zlib.gzipSync(raw) : raw);
    } catch {
      response.writeHead(500);
      response.end('Fixture failure');
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  servers.push(server);
}
console.log(
  JSON.stringify({
    before: 'http://127.0.0.1:3191',
    after: 'http://127.0.0.1:3192',
    properties: 30,
    apiDelayMs: 450,
  }),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    for (const server of servers) server.close();
  });
