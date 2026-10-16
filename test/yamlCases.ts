/** YAML Rails loads as credentials. */
export const loadable = [
  '',
  '# only a comment\n',
  'aws:\n  access_key_id: abc\n  secret_access_key: def\n',
  ':symbol_key: 1\n',
  '"yes": 1\n',
  'a: 1\na: 2\n',
  'base: &base\n  host: x\nchild:\n  <<: *base\n  port: 1\n',
  'a: &a\n  host: x\nb: &b\n  port: 1\nc:\n  <<: [*a, *b]\n',
  'base: &base\n  host: x\n<<: *base\n',
  '<<: 1\n',
  'child:\n  <<: plain\n',
  'list:\n  - name: a\n  - name: b\n',
  '[]\n',
  'greeting: café\n',
];

/** YAML Rails cannot load as credentials. */
export const unloadable = [
  'a: b: c\n',
  'a:\n\t- tab\n',
  'just a string\n',
  '- a\n- b\n',
  'yes: 1\n',
  'aws:\n  123: abc\n',
  'base: &base\n  1: x\nchild:\n  <<: *base\n',
  'list:\n  - on: x\n',
  '2024-01-01: x\n',
  '~: x\n',
  '1.5: x\n',
];
