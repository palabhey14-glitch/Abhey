// Minimal reader for .zip and .xlsx files (no dependencies). Reads the
// central directory, then inflates the entries you ask for.
'use strict';
const fs = require('node:fs');
const zlib = require('node:zlib');

function openZip(file) {
  const buf = Buffer.isBuffer(file) ? file : fs.readFileSync(file);
  // End of central directory record: search backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Bad zip directory');
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, compressed, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: () => [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const lnameLen = buf.readUInt16LE(e.local + 26);
      const lextraLen = buf.readUInt16LE(e.local + 28);
      const start = e.local + 30 + lnameLen + lextraLen;
      const data = buf.subarray(start, start + e.compressed);
      if (e.method === 0) return Buffer.from(data);
      if (e.method === 8) return zlib.inflateRawSync(data);
      throw new Error(`Unsupported zip compression ${e.method} in ${name}`);
    },
  };
}

module.exports = { openZip };
