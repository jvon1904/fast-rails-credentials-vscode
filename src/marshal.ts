// Ruby Marshal 4.8, for the one value a Rails encrypted file holds: a String.
//
//   04 08      format version 4.8
//   49         'I', present when instance variables follow the string (its encoding)
//   22         '"', a String
//   <long>     the byte length
//   <bytes>
//   <ivars>    after 'I' only: a count, then pairs such as :E => true for UTF-8
//
// A <long> is one byte when 0 (0x00) or 1..122 (n + 5). Otherwise its first byte
// is a count, 1..4, of little-endian bytes that follow.

const MAJOR = 4;
const MINOR = 8;
const IVAR = 0x49;
const STRING = 0x22;

/** Returns the bytes of the Ruby String that `data` holds. */
export function loadString(data: Buffer): Buffer {
  if (data[0] !== MAJOR || data[1] !== MINOR) throw new Error('not Ruby Marshal 4.8 data');
  const offset = data[2] === IVAR ? 3 : 2;
  if (data[offset] !== STRING) throw new Error('the Marshal data is not a String');
  const [length, start] = readLong(data, offset + 1);
  if (start + length > data.length) throw new Error('the Marshal String is truncated');
  return data.subarray(start, start + length);
}

/** Dumps `bytes` as a binary Ruby String, the form `credentials:edit` writes. */
export function dumpString(bytes: Buffer): Buffer {
  return Buffer.concat([Buffer.from([MAJOR, MINOR, STRING]), writeLong(bytes.length), bytes]);
}

/** Reads the length at `offset`, returning it and the offset just after it. */
function readLong(data: Buffer, offset: number): [number, number] {
  const head = data.readInt8(offset);
  if (head === 0) return [0, offset + 1];
  if (head > 4) return [head - 5, offset + 1];
  if (head < 0) throw new Error('the Marshal String has a negative length');
  return [data.readUIntLE(offset + 1, head), offset + 1 + head];
}

/** Encodes a length. */
function writeLong(length: number): Buffer {
  if (length === 0) return Buffer.from([0]);
  if (length < 123) return Buffer.from([length + 5]);
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) bytes.push(rest % 256);
  return Buffer.from([bytes.length, ...bytes]);
}
