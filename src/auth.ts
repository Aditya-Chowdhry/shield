import { Octokit } from '@octokit/rest';

/**
 * GitHub App authentication.
 * Signs a JWT with the app's private key, then exchanges it for
 * an installation access token scoped to the specific installation.
 */
export async function getInstallationToken(
  appId: string,
  privateKey: string,
  installationId: number,
): Promise<string> {
  const jwt = await signJWT(appId, privateKey);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to get installation token: ${response.status} ${body}`,
    );
  }

  const data = (await response.json()) as { token: string };
  return data.token;
}

/**
 * Create an Octokit instance authenticated as a GitHub App installation.
 */
export async function createAppOctokit(
  appId: string,
  privateKey: string,
  installationId: number,
): Promise<Octokit> {
  const token = await getInstallationToken(appId, privateKey, installationId);
  return new Octokit({ auth: token });
}

/**
 * Sign a JWT for GitHub App authentication using Web Crypto API.
 * Works in Cloudflare Workers, Deno, Node 20+, and browsers.
 */
async function signJWT(appId: string, privateKeyPEM: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60, // issued 60s in the past for clock drift
    exp: now + 600, // expires in 10 minutes
    iss: appId,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(privateKeyPEM);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );

  const encodedSignature = base64url(signature);
  return `${signingInput}.${encodedSignature}`;
}

function base64url(input: string | ArrayBuffer): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), (c) =>
    c.charCodeAt(0),
  );

  // Try PKCS#8 first, fall back to PKCS#1
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      binaryDer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    // PKCS#1 format — wrap in PKCS#8
    const pkcs8 = wrapPkcs1InPkcs8(binaryDer);
    return await crypto.subtle.importKey(
      'pkcs8',
      pkcs8,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  }
}

/**
 * Wrap a PKCS#1 RSA private key in a PKCS#8 envelope.
 * GitHub App private keys are typically PKCS#1 format.
 */
function wrapPkcs1InPkcs8(pkcs1: Uint8Array): Uint8Array {
  // PKCS#8 header for RSA keys
  const header = new Uint8Array([
    0x30, 0x82, 0x00, 0x00, // SEQUENCE (length placeholder)
    0x02, 0x01, 0x00,       // INTEGER 0 (version)
    0x30, 0x0d,             // SEQUENCE
    0x06, 0x09,             // OID
    0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, // rsaEncryption
    0x05, 0x00,             // NULL
    0x04, 0x82, 0x00, 0x00, // OCTET STRING (length placeholder)
  ]);

  const totalLen = header.length + pkcs1.length - 4; // minus outer SEQUENCE tag+length
  const octetLen = pkcs1.length;

  const result = new Uint8Array(header.length + pkcs1.length);
  result.set(header);
  result.set(pkcs1, header.length);

  // Patch outer SEQUENCE length
  result[2] = (totalLen >> 8) & 0xff;
  result[3] = totalLen & 0xff;

  // Patch OCTET STRING length
  result[header.length - 2] = (octetLen >> 8) & 0xff;
  result[header.length - 1] = octetLen & 0xff;

  return result;
}
