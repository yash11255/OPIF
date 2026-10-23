// Redis access for the logging functions. Supports either:
//  - Vercel Redis / Redis Cloud: a redis:// connection string (STORAGE_URL, REDIS_URL or KV_URL)
//  - Upstash REST: KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN)
import { createClient } from 'redis';

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TCP_URL = [process.env.STORAGE_URL, process.env.REDIS_URL, process.env.KV_URL].find((u) => /^rediss?:\/\//.test(u || ''));

export const configured = () => Boolean(TCP_URL || (REST_URL && REST_TOKEN));

let clientPromise = null; // reused across warm invocations
function tcpClient() {
  if (!clientPromise) {
    const client = createClient({ url: TCP_URL, socket: { connectTimeout: 5000, reconnectStrategy: (n) => (n > 2 ? new Error('Redis unreachable') : 200) } });
    client.on('error', (e) => console.error('redis', e.message));
    clientPromise = client.connect().then(() => client).catch((e) => { clientPromise = null; throw e; });
  }
  return clientPromise;
}

/** Runs commands in order; returns raw Redis replies (same shapes for both backends). */
export async function pipeline(commands) {
  if (TCP_URL) {
    const client = await tcpClient();
    return Promise.all(commands.map((c) => client.sendCommand(c.map(String))));
  }
  const res = await fetch(`${REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return (await res.json()).map((r) => r.result);
}
