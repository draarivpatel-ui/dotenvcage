const { closeSync, constants, fstatSync, lstatSync, openSync, readSync } = require('node:fs');
const { DEFAULT_LIMITS } = require('./constants.cjs');
const { ERROR_CODES, DotenvCageError, invalidArgument } = require('./errors.cjs');

function ioError(message) {
  return new DotenvCageError(ERROR_CODES.IO_ERROR, message);
}

function inputByteLimit(options) {
  const value = options.limits && options.limits.maxBytes !== undefined ? options.limits.maxBytes : DEFAULT_LIMITS.maxBytes;
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('limit maxBytes must be a positive safe integer');
  return value;
}

function inputTooLarge() {
  return new DotenvCageError(ERROR_CODES.INPUT_TOO_LARGE, 'dotenv file exceeds the bounded byte limit');
}

function readBounded(fd, maxBytes) {
  const chunks = [];
  let total = 0;
  const target = maxBytes === Number.MAX_SAFE_INTEGER ? maxBytes : maxBytes + 1;
  while (total < target) {
    const size = Math.min(65536, target - total);
    const buffer = Buffer.allocUnsafe(size);
    const count = readSync(fd, buffer, 0, size, null);
    if (count === 0) break;
    total += count;
    chunks.push(buffer.subarray(0, count));
  }
  if (total > maxBytes) throw inputTooLarge();
  return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, total);
}

function readDotenvFileSecure(filePath, options = {}) {
  if (typeof filePath !== 'string' || filePath.length === 0) throw invalidArgument('dotenv file path must be a non-empty string');
  const maxBytes = inputByteLimit(options);
  let initial;
  try {
    initial = lstatSync(filePath);
  } catch (error) {
    throw ioError('dotenv file could not be read');
  }
  if (initial.isSymbolicLink() || !initial.isFile()) throw ioError('dotenv path is not a regular file');

  const noFollow = constants.O_NOFOLLOW === undefined ? 0 : constants.O_NOFOLLOW;
  let fd;
  try {
    fd = openSync(filePath, constants.O_RDONLY | noFollow);
  } catch (error) {
    throw ioError('dotenv file could not be read');
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw ioError('dotenv path is not a regular file');
    if (initial.dev > 0 && initial.ino > 0 && (stat.dev !== initial.dev || stat.ino !== initial.ino)) throw ioError('dotenv file changed while it was being opened');
    if (stat.size > maxBytes) throw inputTooLarge();
    return readBounded(fd, maxBytes);
  } catch (error) {
    if (error instanceof DotenvCageError) throw error;
    throw ioError('dotenv file could not be read');
  } finally {
    try {
      closeSync(fd);
    } catch (error) {
    }
  }
}

exports.readDotenvFileSecure = readDotenvFileSecure;
