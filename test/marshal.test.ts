import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dumpString, loadString } from '../src/marshal.ts';

const hex = (buffer: Buffer, length = buffer.length) => buffer.subarray(0, length).toString('hex');

describe('dumpString', () => {
  it('writes the bytes Ruby writes for a binary String', () => {
    assert.equal(hex(dumpString(Buffer.from(''))), '04082200');
    assert.equal(hex(dumpString(Buffer.from('a'))), '0408220661');
  });

  it('writes each width of length the way Ruby does', () => {
    assert.equal(hex(dumpString(Buffer.alloc(122)), 4), '0408227f');
    assert.equal(hex(dumpString(Buffer.alloc(123)), 5), '040822017b');
    assert.equal(hex(dumpString(Buffer.alloc(256)), 6), '040822020001');
    assert.equal(hex(dumpString(Buffer.alloc(70_000)), 7), '04082203701101');
  });
});

describe('loadString', () => {
  it('reads back what dumpString writes, at every width of length', () => {
    for (const length of [0, 1, 122, 123, 255, 256, 65_535, 65_536, 70_000]) {
      const bytes = Buffer.alloc(length, 'x');
      assert.deepEqual(loadString(dumpString(bytes)), bytes, `length ${length}`);
    }
  });

  it('reads a String tagged as UTF-8', () => {
    assert.equal(loadString(Buffer.from('040849220661063a064554', 'hex')).toString(), 'a');
  });

  it('refuses anything but a String', () => {
    assert.throws(() => loadString(Buffer.from('04086906', 'hex')), /not a String/);
  });

  it('refuses a String shorter than its length', () => {
    assert.throws(() => loadString(Buffer.from('04082207', 'hex')), /truncated/);
  });

  it('refuses another version of Marshal', () => {
    assert.throws(() => loadString(Buffer.from('04072200', 'hex')), /Marshal 4\.8/);
  });
});
