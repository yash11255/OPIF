// POST /api/track — records one visit/action. Never receives calculator answers.
import { pipeline, configured } from './_redis.js';

const EVENTS = new Set(['page_view', 'start', 'calculate', 'card_open', 'download_png', 'download_pdf', 'download_csv', 'print', 'share_native', 'share_whatsapp', 'copy_caption']);
const MAX_LOG = 100000; // keep the most recent 100k entries

export function device(ua = '') {
  const os = /Windows/i.test(ua) ? 'Windows' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /CrOS/i.test(ua) ? 'ChromeOS' : /Linux/i.test(ua) ? 'Linux' : 'Other';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
  const type = /bot|crawl|spider|slurp|preview/i.test(ua) ? 'bot' : /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
  return { os, browser, type };
}

const clip = (v, n = 300) => (typeof v === 'string' ? v.slice(0, n) : '');

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const h = req.headers;
  const ua = clip(h['user-agent'], 400);
  const d = device(ua);
  const entry = {
    time: new Date().toISOString(),
    event: EVENTS.has(body.event) ? body.event : 'page_view',
    visitor: clip(body.visitor, 40),
    session: clip(body.session, 40),
    ip: (h['x-forwarded-for'] || '').split(',')[0].trim() || h['x-real-ip'] || '',
    country: h['x-vercel-ip-country'] || '',
    region: h['x-vercel-ip-country-region'] || '',
    city: h['x-vercel-ip-city'] ? decodeURIComponent(h['x-vercel-ip-city']) : '',
    deviceType: d.type, os: d.os, browser: d.browser,
    screen: clip(body.screen, 20),
    language: clip(body.language, 20),
    referrer: clip(body.referrer),
    path: clip(body.path, 200),
    detail: clip(body.detail, 60), // e.g. card template/format — never form values
    userAgent: ua,
  };

  console.log(JSON.stringify({ type: 'visit', ...entry })); // also shown in Vercel → Logs

  if (configured() && d.type !== 'bot') {
    const day = entry.time.slice(0, 10);
    const cmds = [
      ['LPUSH', 'opif:log', JSON.stringify(entry)],
      ['LTRIM', 'opif:log', 0, MAX_LOG - 1],
      ['HINCRBY', 'opif:events', entry.event, 1],
      ['HINCRBY', `opif:day:${day}`, entry.event, 1],
      ['SADD', 'opif:days', day],
    ];
    if (entry.visitor) cmds.push(['PFADD', 'opif:visitors', entry.visitor], ['PFADD', `opif:visitors:${day}`, entry.visitor]);
    try { await pipeline(cmds); } catch (e) { console.error('track store failed', e.message); }
  }
  res.status(204).end();
}
