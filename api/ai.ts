import { handleAI } from '../server/handlers';
export default async function handler(req: { body: unknown; headers: Record<string, string> }, res: { status: (n: number) => { setHeader: (k: string, v: string) => void; send: (b: string) => void } }) {
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  const r = await handleAI(body, req.headers['x-forwarded-for'] ?? 'edge');
  const out = res.status(r.status);
  out.setHeader('Content-Type', r.type);
  out.send(r.body);
}
