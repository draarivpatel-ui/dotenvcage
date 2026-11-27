export type DotenvSeverity = 'error' | 'warning';

export interface DotenvCageLimits {
  maxBytes?: number;
  maxLines?: number;
  maxEntries?: number;
  maxKeyLength?: number;
  maxValueLength?: number;
  maxExpandedLength?: number;
  maxExpansionDepth?: number;
  maxExpansionSteps?: number;
  maxFindings?: number;
}

export interface DotenvCageOptions {
  limits?: DotenvCageLimits;
  allowBom?: boolean;
  allowMultiline?: boolean;
  allowRuntimeKeys?: boolean | string[];
  expand?: boolean;
  expansionEnv?: Record<string, string | number | boolean | null | undefined>;
}

export interface DotenvFinding {
  readonly code: string;
  readonly severity: DotenvSeverity;
  readonly message: string;
  readonly line: number | null;
  readonly key: string | null;
}

export interface DotenvEntry {
  readonly key: string;
  readonly value: string;
  readonly rawValue: string;
  readonly line: number;
  readonly endLine: number;
  readonly quote: 'single' | 'double' | 'none';
  readonly exported: boolean;
}

export interface ParseDotenvResult {
  readonly values: Record<string, string>;
  readonly entries: readonly DotenvEntry[];
  readonly references: ReadonlyMap<string, readonly string[]>;
}

export interface AuditDotenvResult {
  readonly ok: boolean;
  readonly findings: readonly DotenvFinding[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly keys: readonly string[];
  readonly entryCount: number;
  readonly references: ReadonlyMap<string, readonly string[]>;
}

export interface AuditOptions extends DotenvCageOptions {
  context?: 'runtime' | 'example' | 'committed';
  detectSecrets?: boolean;
}

export interface SchemaRule {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'enum' | 'url' | 'json' | 'secret';
  required?: boolean;
  allowEmpty?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string | RegExp;
  values?: string[];
  protocols?: string[];
}

export interface DotenvSchema {
  keys?: Record<string, SchemaRule>;
  required?: string[];
  allowUnknown?: boolean;
}

export interface ValidateSchemaResult {
  readonly ok: true;
  readonly validatedKeys: number;
}

export interface SafeLoadOptions extends DotenvCageOptions {
  path?: string;
  inputType?: 'content' | 'path';
  target?: Record<string, string | undefined>;
  override?: boolean;
  onExisting?: 'skip' | 'error';
  schema?: DotenvSchema;
}

export interface SafeLoadResult {
  readonly ok: true;
  readonly count: number;
  readonly loaded: readonly string[];
  readonly skipped: readonly string[];
  readonly overridden: readonly string[];
}

export interface RedactOptions {
  placeholder?: string;
}

export interface DiffChange {
  readonly key: string;
  readonly left: string;
  readonly right: string;
}

export interface DiffDotenvResult {
  readonly same: boolean;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly DiffChange[];
  readonly unchanged: readonly string[];
  readonly redacted: boolean;
}

export const VERSION: '1.0.0';
export const ERROR_CODES: Readonly<Record<string, string>>;
export const DEFAULT_LIMITS: Readonly<Required<DotenvCageLimits>>;
export const DANGEROUS_RUNTIME_KEYS: readonly string[];
export const PROTOTYPE_KEYS: readonly string[];

export class DotenvCageError extends Error {
  constructor(code: string, message: string, details?: Record<string, unknown>);
  readonly code: string;
  readonly reason: string;
  readonly findings?: readonly DotenvFinding[];
  readonly line?: number | null;
  readonly key?: string | null;
}

export function parseDotenv(input: string | Uint8Array, options?: DotenvCageOptions): ParseDotenvResult;
export function scanDotenv(input: string | Uint8Array, options?: DotenvCageOptions): ParseDotenvResult & { readonly findings: readonly DotenvFinding[] };
export function auditDotenv(input: string | Uint8Array, options?: AuditOptions): AuditDotenvResult;
export function safeLoad(input?: string | Uint8Array, options?: SafeLoadOptions): SafeLoadResult;
export function redactDotenv(input: string | Uint8Array, options?: RedactOptions): string;
export function redactDotenv(input: Record<string, string>, options?: RedactOptions): Record<string, string>;
export function diffDotenv(left: string | Uint8Array | Record<string, string> | ParseDotenvResult, right: string | Uint8Array | Record<string, string> | ParseDotenvResult, options?: DotenvCageOptions & { redact?: boolean }): DiffDotenvResult;
export function validateSchema(values: Record<string, string>, schema: DotenvSchema): ValidateSchemaResult;
export function detectSecretKinds(value: string): string[];
export function isDangerousRuntimeKey(key: string): boolean;
export function isPrototypeKey(key: string): boolean;
export function cageError(code: string, message: string, details?: Record<string, unknown>): DotenvCageError;
export function redactInput(value: unknown): string;
