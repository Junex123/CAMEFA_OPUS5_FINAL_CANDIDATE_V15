export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3000';

export async function POST(req: Request): Promise<Response> {
  const upstream = await fetch(`${GATEWAY}/v1/decisions/evaluate/stream`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.GATEWAY_SERVICE_TOKEN
        ? { authorization: `Bearer ${process.env.GATEWAY_SERVICE_TOKEN}` }
        : {}),
    },
    body: await req.text(),
    signal: req.signal,
    // @ts-expect-error undici-only option
    duplex: 'half',
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
