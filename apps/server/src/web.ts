import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, extname, isAbsolute } from 'node:path';
import { request as httpRequest } from 'node:http';
import type { Server } from 'node:https';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RouteGenericInterface,
} from 'fastify';

export type WebOptions =
  | { readonly kind: 'built'; readonly directory: string }
  | { readonly kind: 'dev'; readonly upstreamPort: number };

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const requestHeaders = new Set([
  'accept',
  'accept-encoding',
  'if-none-match',
  'if-modified-since',
]);
const responseHeaders = new Set([
  'content-type',
  'content-encoding',
  'content-length',
  'etag',
  'last-modified',
  'cache-control',
]);
const notFound = (reply: FastifyReply<RouteGenericInterface, Server>) =>
  reply.code(404).send({ error: 'NOT_FOUND' });

export function publicWebPath(url: string): string | null {
  try {
    if (url.includes('\\')) return null;
    const pathname = decodeURIComponent(
      new URL(url, 'https://127.0.0.1').pathname,
    ).replace(/\/{2,}/g, '/');
    const lower = pathname.toLowerCase();
    if (
      /^\/(?:api|health)(?:\/|$)/.test(lower) ||
      [...pathname].some(
        (character) => character.charCodeAt(0) < 32 || character === '\\',
      )
    )
      return null;
    if (pathname.split('/').some((segment) => segment.startsWith('.')))
      return null;
    if (/\.(?:pem|key|pfx|p12|crt|cer)$/i.test(pathname)) return null;
    return pathname;
  } catch {
    return null;
  }
}

function proxy(
  request: FastifyRequest<RouteGenericInterface, Server>,
  reply: FastifyReply<RouteGenericInterface, Server>,
  port: number,
): Promise<void> {
  return new Promise((done) => {
    const headers = Object.fromEntries(
      Object.entries(request.headers).filter(([name]) =>
        requestHeaders.has(name),
      ),
    );
    const upstream = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        method: request.method,
        path: request.raw.url ?? '/',
        headers,
      },
      (response) => {
        const status = response.statusCode ?? 502;
        if (status >= 300 && status < 400 && status !== 304) {
          response.resume();
          reply.code(502).send({ error: 'DEV_UPSTREAM_REDIRECT' });
          done();
          return;
        }
        reply.hijack();
        reply.raw.statusCode = status;
        for (const [name, value] of Object.entries(reply.getHeaders()))
          if (value !== undefined) reply.raw.setHeader(name, value);
        for (const [name, value] of Object.entries(response.headers)) {
          if (responseHeaders.has(name) && value !== undefined)
            reply.raw.setHeader(name, value);
        }
        response.on('error', () => {
          reply.raw.destroy();
          done();
        });
        response.on('end', done);
        response.pipe(reply.raw);
      },
    );
    upstream.setTimeout(5000, () => upstream.destroy(new Error('timeout')));
    upstream.on('error', () => {
      if (!reply.sent)
        reply.code(502).send({ error: 'DEV_UPSTREAM_UNAVAILABLE' });
      else reply.raw.destroy();
      done();
    });
    request.raw.once('aborted', () => upstream.destroy());
    reply.raw.once('close', () => upstream.destroy());
    upstream.end();
  });
}

export async function registerWeb(
  server: FastifyInstance<Server>,
  options: WebOptions,
): Promise<void> {
  if (options.kind === 'built') {
    try {
      const index = await stat(resolve(options.directory, 'index.html'));
      if (!index.isFile()) throw new Error('index');
    } catch {
      throw new Error('WEB_BUILD_MISSING');
    }
  }
  server.setNotFoundHandler(async (request, reply) => {
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return notFound(reply);
    const pathname = publicWebPath(request.raw.url ?? '/');
    if (!pathname) return notFound(reply);
    if (options.kind === 'dev')
      return proxy(request, reply, options.upstreamPort);
    try {
      const root = await realpath(options.directory);
      let file = resolve(root, '.' + pathname);
      try {
        if (!(await stat(file)).isFile()) file = resolve(root, 'index.html');
      } catch {
        if (extname(pathname)) return notFound(reply);
        file = resolve(root, 'index.html');
      }
      file = await realpath(file);
      const traversal = relative(root, file);
      if (traversal.startsWith('..') || isAbsolute(traversal))
        return notFound(reply);
      const contentType = mime[extname(file)];
      if (!contentType) return notFound(reply);
      const content = await readFile(file);
      return reply
        .header('Cache-Control', 'no-cache')
        .type(contentType)
        .send(content);
    } catch {
      return notFound(reply);
    }
  });
}
