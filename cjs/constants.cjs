const VERSION = '1.0.0';

const DEFAULT_LIMITS = Object.freeze({
  maxBytes: 65536,
  maxLines: 1024,
  maxEntries: 256,
  maxKeyLength: 128,
  maxValueLength: 8192,
  maxExpandedLength: 16384,
  maxExpansionDepth: 16,
  maxExpansionSteps: 1024,
  maxFindings: 256,
});

const DANGEROUS_RUNTIME_KEYS = Object.freeze([
  'PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
  'LD_DEBUG',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_FALLBACK_LIBRARY_PATH',
  'DYLD_PRINT_LIBRARIES',
  'NODE_OPTIONS',
  'PYTHONPATH',
  'PYTHONHOME',
  'PYTHONSTARTUP',
  'PYTHONINSPECT',
  'BASH_ENV',
  'ENV',
  'PROMPT_COMMAND',
  'IFS',
  'CDPATH',
  'GLOBIGNORE',
  'SHELLOPTS',
  'BASHOPTS',
  'PERL5LIB',
  'RUBYLIB',
  'GEM_PATH',
  'CLASSPATH',
  'GIT_SSH_COMMAND',
  'GIT_SSH',
  'GIT_ASKPASS',
  'SSH_ASKPASS',
  'GIT_EXEC_PATH',
  'GIT_PAGER',
  'PAGER',
  'EDITOR',
  'VISUAL',
  'OPENSSL_CONF',
  'PERL5OPT',
  'RUBYOPT',
]);

const PROTOTYPE_KEYS = Object.freeze([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'toLocaleString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  '__class__',
  '__dict__',
  '__bases__',
  '__definegetter__',
  '__definesetter__',
  '__lookupgetter__',
  '__lookupsetter__',
]);

const BIDI_CODEPOINTS = Object.freeze([
  0x061c,
  0x200e,
  0x200f,
  0x202a,
  0x202b,
  0x202c,
  0x202d,
  0x202e,
  0x2066,
  0x2067,
  0x2068,
  0x2069,
]);

const ZERO_WIDTH_CODEPOINTS = Object.freeze([
  0x200b,
  0x200c,
  0x200d,
  0x2060,
  0xfeff,
]);

exports.VERSION = VERSION;
exports.DEFAULT_LIMITS = DEFAULT_LIMITS;
exports.DANGEROUS_RUNTIME_KEYS = DANGEROUS_RUNTIME_KEYS;
exports.PROTOTYPE_KEYS = PROTOTYPE_KEYS;
exports.BIDI_CODEPOINTS = BIDI_CODEPOINTS;
exports.ZERO_WIDTH_CODEPOINTS = ZERO_WIDTH_CODEPOINTS;
