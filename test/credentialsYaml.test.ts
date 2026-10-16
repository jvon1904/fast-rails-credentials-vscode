import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { problemWith } from '../src/credentialsYaml.ts';
import { loadable, unloadable } from './yamlCases.ts';

describe('problemWith', () => {
  it('accepts YAML Rails loads', () => {
    for (const text of loadable) assert.equal(problemWith(text), undefined, JSON.stringify(text));
  });

  it('finds a problem with YAML Rails cannot load', () => {
    for (const text of unloadable) assert.ok(problemWith(text), JSON.stringify(text));
  });

  it('says where a syntax error is', () => {
    assert.match(problemWith('a: b: c\n') ?? '', /at line 1, column \d+$/);
  });

  it('names a key YAML reads as something other than a string, and its line', () => {
    assert.equal(problemWith('aws:\n  123: abc\n'), "line 2: Rails can't use 123 as a key. Quote it to make it a string");
  });

  it('refuses a top level that is not a set of keys', () => {
    assert.equal(problemWith('just a string\n'), 'the top level is not a set of keys');
  });
});
