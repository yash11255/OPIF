// GET /api/logs — admin only (Authorization: Bearer <ADMIN_PASSWORD>).
//   ?limit=500&offset=0       → JSON { stats, daily, entries }
//   ?format=csv&limit=100000  → CSV log file download
import { pipeline, configured } from './_redis.js';
import { timingSafeEqual } from 'node:crypto';

const COLS = ['time', 'event', 'ip', 'country', 'region', 'city', 'deviceType', 'os', 'browser', 'screen', 'language', 'referrer', 'path', 'detail', 'visitor', 'session', 'userAgent'];

function authorised(req) {
  const pass = process.env.ADMIN_PASSWORD || '';
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!pass || given.length !== pass.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(pass));
}

const csvCell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.ADMIN_PASSWORD) { res.status(500).json({ error: 'ADMIN_PASSWORD is not set in Vercel environment variables.' }); return; }
  if (!authorised(req)) { res.status(401).json({ error: 'Wrong password.' }); return; }
  if (!configured()) { res.status(500).json({ error: 'Storage not connected. Add Upstash Redis in Vercel → Storage, then redeploy.' }); return; }

  const q = req.query || {};
  const csv = q.format === 'csv';
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || (csv ? 100000 : 500), 1), 100000);
  const offset = Math.max(parseInt(q.offset, 10) || 0, 0);

  const [raw, total, events, uniques, days] = await pipeline([
    ['LRANGE', 'opif:log', offset, offset + limit - 1],
    ['LLEN', 'opif:log'],
    ['HGETALL', 'opif:events'],
    ['PFCOUNT', 'opif:visitors'],
    ['SMEMBERS', 'opif:days'],
  ]);
  const entries = raw.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);

  if (csv) {
    const body = '﻿' + [COLS.join(','), ...entries.map((e) => COLS.map((c) => csvCell(e[c])).join(','))].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="opif-visitor-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.status(200).send(body);
    return;
  }

  const recentDays = (days || []).sort().slice(-30);
  const dayData = recentDays.length ? await pipeline(recentDays.flatMap((d) => [['HGETALL', `opif:day:${d}`], ['PFCOUNT', `opif:visitors:${d}`]])) : [];
  const toObj = (arr) => { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = Number(arr[i + 1]); return o; };
  const daily = recentDays.map((d, i) => ({ day: d, uniqueVisitors: dayData[i * 2 + 1], ...toObj(dayData[i * 2]) }));

  res.status(200).json({ stats: { uniqueVisitors: uniques, logEntries: total, events: toObj(events) }, daily, entries, offset, limit });
}
