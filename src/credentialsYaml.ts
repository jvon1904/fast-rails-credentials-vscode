import { isMap, isScalar, isSeq, LineCounter, parseDocument, type Tags } from 'yaml';

/** Says why Rails could not load `text` as credentials, or returns undefined when it could. */
export function problemWith(text: string): string | undefined {
  const lines = new LineCounter();
  const document = parseDocument(text, {
    version: '1.1',
    customTags: withoutMerge,
    uniqueKeys: false,
    lineCounter: lines,
  });
  const [error] = document.errors;
  if (error) return error.message.split('\n')[0].replace(/:$/, '');
  if (blank(document.toJS())) return undefined;
  if (!isMap(document.contents)) return 'the top level is not a set of keys';
  return keyProblem(document.contents, text, lines);
}

/**
 * Drops YAML 1.1's merge tag, leaving `<<` a plain key. Rails loads every `<<` that the yaml package
 * rejects, such as `<<: 1`, and any key that `<<` merges in is checked where its anchor is defined.
 */
function withoutMerge(tags: Tags): Tags {
  return tags.filter((tag) => (typeof tag === 'string' ? tag !== 'merge' : tag.tag !== 'tag:yaml.org,2002:merge'));
}

/** Whether Ruby's `presence` would discard the parsed value, leaving Rails an empty set of credentials. */
function blank(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && Object.keys(value).length === 0;
}

/** Finds a key, at any depth, that Rails cannot turn into a symbol: one YAML reads as a number, boolean or date. */
function keyProblem(node: unknown, text: string, lines: LineCounter): string | undefined {
  if (isSeq(node)) {
    for (const item of node.items) {
      const problem = keyProblem(item, text, lines);
      if (problem) return problem;
    }
  }
  if (isMap(node)) {
    for (const { key, value } of node.items) {
      if (!isScalar(key) || typeof key.value !== 'string') return badKey(key, text, lines);
      const problem = keyProblem(value, text, lines);
      if (problem) return problem;
    }
  }
  return undefined;
}

/** Describes a key Rails cannot use, with its line and source text where YAML recorded them. */
function badKey(key: unknown, text: string, lines: LineCounter): string {
  if (!isScalar(key) || !key.range) return "Rails can't use a key that isn't a name";
  const [start, end] = key.range;
  const { line } = lines.linePos(start);
  return `line ${line}: Rails can't use ${text.slice(start, end)} as a key. Quote it to make it a string`;
}
