// Fetches a URL a person pasted, without letting it reach private networks.
//   * http/https only, no user:password@, ports 80/443 only
//   * every address the name resolves to must be public (no loopback,
//     private, link-local, carrier-grade NAT, unique-local, multicast,
//     cloud metadata, documentation or NAT64-wrapped private ranges)
//   * the connection uses the address that was checked (no DNS rebinding)
//   * redirects are followed by hand, at most 3, each checked again
//   * 8 second limit and 2 MB cap on the response
'use strict';
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const blocked = new net.BlockList();
for (const [a, p] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(a, p, 'ipv4');
for (const [a, p] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['100::', 64],
  ['2001::', 23], ['2002::', 16],
]) blocked.addSubnet(a, p, 'ipv6');

// IPv4 addresses hidden inside IPv6 (::ffff:10.0.0.1, 64:ff9b::a00:1).
function embeddedV4(ip) {
  const lower = ip.toLowerCase();
  const dotted = lower.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const hex = lower.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const a = parseInt(hex[1], 16);
    const b = parseInt(hex[2], 16);
    return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
  }
  return null;
}

function isBlockedAddress(ip) {
  const family = net.isIP(ip);
  if (!family) return true;
  if (family === 4) return blocked.check(ip, 'ipv4');
  const v4 = embeddedV4(ip);
  if (v4) return blocked.check(v4, 'ipv4');
  if (/^::ffff:/i.test(ip) || /^64:ff9b::/i.test(ip)) return true;
  return blocked.check(ip, 'ipv6');
}

class UnsafeUrl extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function checkUrl(raw, allowPorts) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch (_) {
    throw new UnsafeUrl('That is not a web address.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UnsafeUrl('Only http and https links can be imported.');
  if (u.username || u.password) throw new UnsafeUrl('Links with a username or password are not allowed.');
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (!(allowPorts || [80, 443]).includes(port)) throw new UnsafeUrl('That link uses an unusual port.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw new UnsafeUrl('That address is not on the public internet.');
  return { u, host, port };
}

function resolvePublic(host, lookup, isBlocked) {
  return new Promise((resolve, reject) => {
    if (net.isIP(host)) {
      if (isBlocked(host)) return reject(new UnsafeUrl('That address is not on the public internet.'));
      return resolve({ address: host, family: net.isIP(host) });
    }
    lookup(host, { all: true }, (err, addrs) => {
      if (err || !addrs || !addrs.length) return reject(new UnsafeUrl('That website could not be found.'));
      if (addrs.some((a) => isBlocked(a.address))) return reject(new UnsafeUrl('That address is not on the public internet.'));
      resolve(addrs[0]);
    });
  });
}

function requestOnce(u, target, { timeoutMs, maxBytes, signal }) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      u,
      {
        method: 'GET',
        headers: { 'User-Agent': 'RewiredCoachingRecipeImport/1.0 (+https://cerulean-jalebi-4e172d.netlify.app)', Accept: 'text/html,application/xhtml+xml,application/ld+json;q=0.9' },
        // Connect to the address we already checked, whatever DNS says now.
        lookup: (_h, o, cb) => (o && o.all ? cb(null, [{ address: target.address, family: target.family }]) : cb(null, target.address, target.family)),
        timeout: timeoutMs,
        signal,
      },
      (res) => {
        const status = res.statusCode;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location });
        }
        const type = String(res.headers['content-type'] || '');
        if (status !== 200) {
          res.resume();
          return reject(Object.assign(new Error(`The website answered ${status}.`), { status: 502 }));
        }
        if (!/text\/html|application\/xhtml|application\/ld\+json|application\/json/i.test(type)) {
          res.resume();
          return reject(Object.assign(new Error('That link is not a web page.'), { status: 415 }));
        }
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy();
            reject(Object.assign(new Error('That page is too large to import.'), { status: 413 }));
          } else chunks.push(c);
        });
        res.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8'), type }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('The website took too long to answer.'), { status: 504 })));
    req.on('error', reject);
    req.end();
  });
}

async function safeFetch(raw, opts = {}) {
  const lookup = opts.lookup || dns.lookup;
  const isBlocked = opts.isBlocked || isBlockedAddress;
  const maxRedirects = opts.maxRedirects === undefined ? 3 : opts.maxRedirects;
  const deadline = Date.now() + (opts.timeoutMs || 8000);
  let current = raw;
  for (let hop = 0; ; hop++) {
    const { u, host } = checkUrl(current, opts.allowPorts);
    const target = await resolvePublic(host, lookup, isBlocked);
    const left = deadline - Date.now();
    if (left <= 0) throw Object.assign(new Error('The website took too long to answer.'), { status: 504 });
    const res = await requestOnce(u, target, { timeoutMs: left, maxBytes: opts.maxBytes || 2 * 1024 * 1024 });
    if (res.location) {
      if (hop >= maxRedirects) throw new UnsafeUrl('That link redirects too many times.');
      current = new URL(res.location, u).toString();
      continue;
    }
    return { url: u.toString(), body: res.body, type: res.type };
  }
}

module.exports = { safeFetch, isBlockedAddress, checkUrl, UnsafeUrl };
