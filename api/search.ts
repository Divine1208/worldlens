import { handleSearch } from '../server/handlers';
export default async function handler(req: { query: Record<string, string> }, res: { status: (n: number) => { setHeader: (k: string, v: string) => void; send: (b: string) => void } }) {
  const r = await handleSearch(req.query.q ?? null, req.query.news !== '0');
  const out = res.status(r.status);
  out.setHeader('Content-Type', r.type);
  out.send(r.body);
}
