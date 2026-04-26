const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-([1-5])[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SUPPORTED_PM_REQUIRE_MODULES = ['crypto', 'querystring', 'url', 'uuid'] as const;

type SupportedPmRequireModule = (typeof SUPPORTED_PM_REQUIRE_MODULES)[number];

type PmRequireInspection = {
  callCount: number;
  literalMatches: string[];
  supportedLiteralModules: string[];
  unsupportedLiteralModules: string[];
  dynamicCallCount: number;
};

function uniqueStrings(input: string[]) {
  return Array.from(new Set(input));
}

function generateUuidV4() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function utf8Bytes(input: string) {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(input));
  return Array.from(unescape(encodeURIComponent(input))).map(char => char.charCodeAt(0));
}

function hexBytes(bytes: number[]) {
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function base64Bytes(bytes: number[]) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] || 0;
    const second = bytes[index + 1] || 0;
    const third = bytes[index + 2] || 0;
    output += alphabet[first >> 2];
    output += alphabet[((first & 3) << 4) | (second >> 4)];
    output += index + 1 < bytes.length ? alphabet[((second & 15) << 2) | (third >> 6)] : '=';
    output += index + 2 < bytes.length ? alphabet[third & 63] : '=';
  }
  return output;
}

function rotateLeft(value: number, shift: number) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];

const MD5_K = Array.from({ length: 64 }, (_value, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0);

function md5Bytes(input: number[]) {
  const bytes = [...input];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 0; shift <= 56; shift += 8) {
    bytes.push((bitLength / 2 ** shift) & 0xff);
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words: number[] = [];
    for (let index = 0; index < 16; index += 1) {
      const position = offset + index * 4;
      words[index] = (bytes[position] | (bytes[position + 1] << 8) | (bytes[position + 2] << 16) | (bytes[position + 3] << 24)) >>> 0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let index = 0; index < 64; index += 1) {
      let f = 0;
      let g = 0;
      if (index < 16) {
        f = (b & c) | (~b & d);
        g = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        g = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        g = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * index) % 16;
      }
      const rotated = (a + f + MD5_K[index] + words[g]) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotateLeft(rotated, MD5_S[index])) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0].flatMap(word => [word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff]);
}

function sha1Bytes(input: number[]) {
  const bytes = [...input];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) {
    bytes.push((bitLength / 2 ** shift) & 0xff);
  }

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words: number[] = [];
    for (let index = 0; index < 80; index += 1) {
      if (index < 16) {
        const position = offset + index * 4;
        words[index] = ((bytes[position] << 24) | (bytes[position + 1] << 16) | (bytes[position + 2] << 8) | bytes[position + 3]) >>> 0;
      } else {
        const value = words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16];
        words[index] = rotateLeft(value, 1);
      }
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      const [f, k] =
        index < 20
          ? [((b & c) | (~b & d)) >>> 0, 0x5a827999]
          : index < 40
            ? [(b ^ c ^ d) >>> 0, 0x6ed9eba1]
            : index < 60
              ? [((b & c) | (b & d) | (c & d)) >>> 0, 0x8f1bbcdc]
              : [(b ^ c ^ d) >>> 0, 0xca62c1d6];
      const temp = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].flatMap(word => [(word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff]);
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256Bytes(input: number[]) {
  const bytes = [...input];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let shift = 56; shift >= 0; shift -= 8) {
    bytes.push((bitLength / 2 ** shift) & 0xff);
  }

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const words: number[] = [];
    for (let index = 0; index < 64; index += 1) {
      if (index < 16) {
        const position = offset + index * 4;
        words[index] = ((bytes[position] << 24) | (bytes[position + 1] << 16) | (bytes[position + 2] << 8) | bytes[position + 3]) >>> 0;
      } else {
        const s0 = (rotateLeft(words[index - 15], 25) ^ rotateLeft(words[index - 15], 14) ^ (words[index - 15] >>> 3)) >>> 0;
        const s1 = (rotateLeft(words[index - 2], 15) ^ rotateLeft(words[index - 2], 13) ^ (words[index - 2] >>> 10)) >>> 0;
        words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
      }
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const s1 = (rotateLeft(e, 26) ^ rotateLeft(e, 21) ^ rotateLeft(e, 7)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + SHA256_K[index] + words[index]) >>> 0;
      const s0 = (rotateLeft(a, 30) ^ rotateLeft(a, 19) ^ rotateLeft(a, 10)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].flatMap(word => [(word >>> 24) & 0xff, (word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff]);
}

function hmacBytes(key: number[], value: number[], hash: (bytes: number[]) => number[]) {
  const blockSize = 64;
  let keyBytes = [...key];
  if (keyBytes.length > blockSize) keyBytes = hash(keyBytes);
  while (keyBytes.length < blockSize) keyBytes.push(0);
  const outer = keyBytes.map(byte => byte ^ 0x5c);
  const inner = keyBytes.map(byte => byte ^ 0x36);
  return hash([...outer, ...hash([...inner, ...value])]);
}

function resolveDigestEncoding(bytes: number[], encoding?: string) {
  if (!encoding || encoding === 'buffer') return Uint8Array.from(bytes);
  if (encoding === 'hex') return hexBytes(bytes);
  if (encoding === 'base64') return base64Bytes(bytes);
  throw new Error(`pm.require("crypto") only supports digest encodings "hex", "base64", and "buffer", got "${encoding}".`);
}

function normalizeHashAlgorithm(algorithm: string) {
  return algorithm.trim().toLowerCase().replace(/_/g, '-');
}

function resolveHashAlgorithm(algorithm: string) {
  const normalized = normalizeHashAlgorithm(algorithm);
  if (normalized === 'md5') return md5Bytes;
  if (normalized === 'sha1' || normalized === 'sha-1') return sha1Bytes;
  if (normalized === 'sha256' || normalized === 'sha-256') return sha256Bytes;
  throw new Error(`pm.require("crypto") only supports md5, sha1, and sha256 hashes, got "${algorithm}".`);
}

function createHashShim(algorithm: string) {
  const hash = resolveHashAlgorithm(algorithm);
  const chunks: string[] = [];
  return {
    update(value: string) {
      chunks.push(String(value));
      return this;
    },
    digest(encoding?: string) {
      return resolveDigestEncoding(hash(utf8Bytes(chunks.join(''))), encoding);
    }
  };
}

function createHmacShim(algorithm: string, key: string) {
  const hash = resolveHashAlgorithm(algorithm);
  const keyBytes = utf8Bytes(String(key));
  const chunks: string[] = [];
  return {
    update(value: string) {
      chunks.push(String(value));
      return this;
    },
    digest(encoding?: string) {
      return resolveDigestEncoding(hmacBytes(keyBytes, utf8Bytes(chunks.join('')), hash), encoding);
    }
  };
}

function parseQueryString(input: string) {
  const params = new URLSearchParams(input);
  const output: Record<string, string | string[]> = {};
  for (const [name, value] of params.entries()) {
    const current = output[name];
    if (Array.isArray(current)) {
      current.push(value);
      continue;
    }
    output[name] = current === undefined ? value : [current, value];
  }
  return output;
}

function stringifyQueryString(input: Record<string, unknown>) {
  const params = new URLSearchParams();
  for (const [name, rawValue] of Object.entries(input)) {
    if (rawValue === undefined) continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      params.append(name, String(value ?? ''));
    }
  }
  return params.toString();
}

function escapeQueryString(input: string) {
  return encodeURIComponent(input);
}

function unescapeQueryString(input: string) {
  return decodeURIComponent(input);
}

export function supportedPmRequireModulesLabel() {
  return SUPPORTED_PM_REQUIRE_MODULES.join(', ');
}

export function normalizePmRequireModuleName(name: string) {
  return name.trim().toLowerCase();
}

export function isSupportedPmRequireModuleName(name: string): name is SupportedPmRequireModule {
  return SUPPORTED_PM_REQUIRE_MODULES.includes(normalizePmRequireModuleName(name) as SupportedPmRequireModule);
}

export function resolvePmRequireBuiltin(name: string) {
  const normalized = normalizePmRequireModuleName(name);
  if (normalized === 'crypto') {
    return Object.freeze({
      createHash: createHashShim,
      createHmac: createHmacShim
    });
  }
  if (normalized === 'querystring') {
    return Object.freeze({
      parse: parseQueryString,
      stringify: stringifyQueryString,
      escape: escapeQueryString,
      unescape: unescapeQueryString
    });
  }
  if (normalized === 'url') {
    return Object.freeze({
      URL,
      URLSearchParams
    });
  }
  if (normalized === 'uuid') {
    return Object.freeze({
      v4: () => generateUuidV4(),
      validate: (value: unknown) => UUID_PATTERN.test(String(value || '')),
      version: (value: unknown) => {
        const match = String(value || '').match(UUID_PATTERN);
        return match ? Number(match[1]) : 0;
      }
    });
  }
  return undefined;
}

export function inspectPmRequireUsage(script: string): PmRequireInspection {
  const literalMatches = [...script.matchAll(/pm\.require\(\s*(['"`])([^'"`]+)\1\s*\)/g)].map(match =>
    normalizePmRequireModuleName(match[2])
  );
  const callCount = script.match(/pm\.require\(/g)?.length || 0;
  return {
    callCount,
    literalMatches,
    supportedLiteralModules: uniqueStrings(literalMatches.filter(name => isSupportedPmRequireModuleName(name))),
    unsupportedLiteralModules: uniqueStrings(literalMatches.filter(name => !isSupportedPmRequireModuleName(name))),
    dynamicCallCount: Math.max(0, callCount - literalMatches.length)
  };
}

export function buildPmRequireWarningMessage(script: string) {
  const usage = inspectPmRequireUsage(script);
  if (usage.callCount === 0) return null;
  if (usage.unsupportedLiteralModules.length === 0 && usage.dynamicCallCount === 0) return null;

  const fragments = [
    usage.dynamicCallCount > 0
      ? `pm.require currently supports literal built-in module names only (${supportedPmRequireModulesLabel()}).`
      : `pm.require currently supports built-in modules only (${supportedPmRequireModulesLabel()}).`
  ];
  if (usage.unsupportedLiteralModules.length > 0) {
    fragments.push(`Unsupported module(s): ${usage.unsupportedLiteralModules.join(', ')}.`);
  }
  if (usage.dynamicCallCount > 0) {
    fragments.push('Dynamic module names will not resolve.');
  }
  return fragments.join(' ');
}
