// Makes a local test key so you can sign certificates on localhost.
// Writes issuer-key.js (git-ignored). Certificates signed with it only verify on your own machine.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

if (existsSync('issuer-key.js')) {
  console.log('issuer-key.js already exists. Delete it first if you want a new key.');
  process.exit(0);
}
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
writeFileSync('issuer-key.js',
  '// Local test key. Never commit or upload this file.\n' +
  `window.ISSUER_PRIVATE_JWK = ${JSON.stringify(privateKey.export({ format: 'jwk' }))};\n` +
  `window.ISSUER_PUBLIC_JWK = ${JSON.stringify(publicKey.export({ format: 'jwk' }))};\n`);
console.log('Wrote issuer-key.js. Start a local server and open http://localhost:8890');
