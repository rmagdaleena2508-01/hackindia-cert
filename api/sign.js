// Server-side signing. The private key lives only in the ISSUER_PRIVATE_JWK environment variable.
// POST { passcode, certs: [cert, ...] }  ->  { tokens: ["<payload>.<signature>", ...] }
const crypto = require('crypto');

const KEYS = ['id', 'name', 'tier', 'rank', 'project', 'event', 'date', 'venue', 'team'];
const MAX = { id: 20, name: 40, tier: 12, rank: 10, project: 60, event: 34, date: 10, venue: 30, team: 30 };
const TIERS = new Set(['winner', 'runner1', 'runner2', 'finalist', 'special', 'participant']);

// Must match pack() in sign.js exactly, or signatures will not check out.
const clean = (v) => String(v || '').replace(/\|/g, '/').trim();
const pack = (c) => '1|' + KEYS.map((k) => clean(c[k]).slice(0, MAX[k])).join('|');
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function sameText(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const { ISSUER_PRIVATE_JWK, ISSUER_PASSCODE } = process.env;
  if (!ISSUER_PRIVATE_JWK || !ISSUER_PASSCODE) return res.status(500).json({ error: 'Signing is not set up on the server.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (!sameText(body.passcode || '', ISSUER_PASSCODE)) return res.status(401).json({ error: 'Wrong issuer passcode.' });

  const certs = Array.isArray(body.certs) ? body.certs : [];
  if (!certs.length || certs.length > 500) return res.status(400).json({ error: 'Send 1 to 500 certificates.' });

  const key = crypto.createPrivateKey({ key: JSON.parse(ISSUER_PRIVATE_JWK), format: 'jwk' });
  const tokens = certs.map((c) => {
    if (!c || !c.id || !c.name || !TIERS.has(c.tier)) return null;
    const payload = b64url(Buffer.from(pack(c), 'utf8'));
    const sig = crypto.sign('sha256', Buffer.from(payload), { key, dsaEncoding: 'ieee-p1363' });
    return payload + '.' + b64url(sig);
  });
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ tokens });
};
