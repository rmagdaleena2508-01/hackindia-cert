// Signing and checking certificate links.
// A link looks like: verify.html#<payload>.<signature>
// The payload is a short text record (base64url). The signature is ECDSA P-256 over the payload text.
// If anyone edits a name, rank or ID in the link, the signature no longer matches.
(function () {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64url(bytes) {
    let s = '';
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  }

  const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
  const SIG = { name: 'ECDSA', hash: 'SHA-256' };
  let privKey, pubKey;

  async function getPriv() {
    if (!privKey) privKey = await crypto.subtle.importKey('jwk', window.ISSUER_PRIVATE_JWK, ALG, false, ['sign']);
    return privKey;
  }
  async function getPub() {
    if (!pubKey) pubKey = await crypto.subtle.importKey('jwk', window.ISSUER_PUBLIC_JWK, ALG, false, ['verify']);
    return pubKey;
  }

  // cert -> short "|"-separated payload. Short links make a QR code with bigger squares, which scans more easily.
  const KEYS = ['id', 'name', 'tier', 'rank', 'project', 'event', 'date', 'venue', 'team'];
  const clean = (v) => String(v || '').replace(/\|/g, '/').trim();
  function pack(c) { return '1|' + KEYS.map((k) => clean(c[k])).join('|'); }
  function unpack(str) {
    const parts = str.split('|'); if (parts[0] !== '1' || parts.length !== KEYS.length + 1) throw new Error('bad payload');
    const c = {}; KEYS.forEach((k, i) => (c[k] = parts[i + 1])); return c;
  }

  // Local dev: issuer-key.js is loaded and we sign in the browser.
  // Live site: the key stays on the server; /api/sign needs the issuer passcode.
  const PASS_KEY = 'hi-issuer-pass';
  const getPass = () => { try { return sessionStorage.getItem(PASS_KEY) || ''; } catch (e) { return ''; } };
  const setPass = (v) => { try { sessionStorage.setItem(PASS_KEY, v); } catch (e) {} };
  const localSigning = () => !!window.ISSUER_PRIVATE_JWK;

  async function signLocal(cert) {
    const body = b64url(enc.encode(pack(cert)));
    const sig = await crypto.subtle.sign(SIG, await getPriv(), enc.encode(body));
    return body + '.' + b64url(new Uint8Array(sig));
  }

  async function signMany(certs) {
    if (localSigning()) return Promise.all(certs.map(signLocal));
    const passcode = getPass();
    if (!passcode) { const e = new Error('Enter the issuer passcode to sign certificates.'); e.code = 'NEED_PASS'; throw e; }
    const r = await fetch('api/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode, certs }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || 'Signing failed.'); e.code = r.status === 401 ? 'NEED_PASS' : 'FAIL'; throw e; }
    return data.tokens;
  }
  const signCert = async (cert) => (await signMany([cert]))[0];

  // Returns { ok, cert, reason }
  async function verifyToken(token) {
    try {
      const [body, sig] = String(token).trim().replace(/^#/, '').split('.');
      if (!body || !sig) return { ok: false, reason: 'This link is incomplete.' };
      const cert = unpack(dec.decode(unb64url(body)));
      const ok = await crypto.subtle.verify(SIG, await getPub(), unb64url(sig), enc.encode(body));
      return ok ? { ok, cert } : { ok, cert, reason: 'The details in this link were changed after it was issued.' };
    } catch (e) {
      return { ok: false, reason: 'This link could not be read.' };
    }
  }

  // HI26-7KQ2-M9XD style ID. No 0/O/1/I so people can read it out loud.
  function newId(year) {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const r = crypto.getRandomValues(new Uint8Array(8));
    const s = Array.from(r, (b) => A[b % A.length]).join('');
    return `HI${String(year || new Date().getFullYear()).slice(-2)}-${s.slice(0, 4)}-${s.slice(4)}`;
  }

  window.CertSign = { signCert, signMany, verifyToken, newId, getPass, setPass, localSigning };
})();
