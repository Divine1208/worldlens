import { handleProxy } from '../server/handlers';
export default async function handler(req: { query: Record<string, string>; headers: Record<string, string> }, res: { status: (n: number) => { setHeader: (k: string, v: string) => void; send: (b: string) => void } & Record<string, unknown> }) {
  const r = await handleProxy(req.query.url ?? null, req.headers['x-forwarded-for'] ?? 'edge');
  const out = res.status(r.status);
  out.setHeader('Content-Type', r.type);
  out.setHeader('Cache-Control', 's-maxage=300');
  out.send(r.body);
}
