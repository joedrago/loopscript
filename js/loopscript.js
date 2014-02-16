require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
   // Detect if browser supports Typed Arrays. Supported browsers are IE 10+,
   // Firefox 4+, Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+.
   if (typeof Uint8Array === 'undefined' || typeof ArrayBuffer === 'undefined')
      return false

  // Does the browser support adding properties to `Uint8Array` instances? If
  // not, then that's the same as no `Uint8Array` support. We need to be able to
  // add all the node Buffer API methods.
  // Relevant Firefox bug: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var arr = new Uint8Array(0)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // Assume object is an array
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof Uint8Array === 'function' &&
      subject instanceof Uint8Array) {
    // Speed optimization -- use set if we're copying from a Uint8Array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  switch (encoding) {
    case 'hex':
      return _hexWrite(this, string, offset, length)
    case 'utf8':
    case 'utf-8':
    case 'ucs2': // TODO: No support for ucs2 or utf16le encodings yet
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return _utf8Write(this, string, offset, length)
    case 'ascii':
      return _asciiWrite(this, string, offset, length)
    case 'binary':
      return _binaryWrite(this, string, offset, length)
    case 'base64':
      return _base64Write(this, string, offset, length)
    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  switch (encoding) {
    case 'hex':
      return _hexSlice(self, start, end)
    case 'utf8':
    case 'utf-8':
    case 'ucs2': // TODO: No support for ucs2 or utf16le encodings yet
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return _utf8Slice(self, start, end)
    case 'ascii':
      return _asciiSlice(self, start, end)
    case 'binary':
      return _binarySlice(self, start, end)
    case 'base64':
      return _base64Slice(self, start, end)
    default:
      throw new Error('Unknown encoding')
  }
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  // copy!
  for (var i = 0; i < end - start; i++)
    target[i + target_start] = this[i + start]
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

// http://nodejs.org/api/buffer.html#buffer_buf_slice_start_end
Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array === 'function') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment the Uint8Array *instance* (not the class!) with Buffer methods
 */
function augment (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value >= 0,
      'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint(value, max, min) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754(value, max, min) {
  assert(typeof value == 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":3,"ieee754":4}],3:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var ZERO   = '0'.charCodeAt(0)
	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS)
			return 62 // '+'
		if (code === SLASH)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	module.exports.toByteArray = b64ToByteArray
	module.exports.fromByteArray = uint8ToBase64
}())

},{}],4:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],"DalL2z":[function(require,module,exports){
module.exports = {
  first: "# ------------------------------------------------------------\n# Your first LoopScript. Someday there will be documentation!\n\ntone note1\n  duration 250\n  octave 4\n  note C\n\ntone bass1\n  duration 250\n  octave 1\n  note B\n\nloop loop1\n  pattern note1 x.......x.......\n  pattern bass1 ....x.......x...\n",
  notes: "# ------------------------------------------------------------\n# Note overrides!\n\n# Try setting the duration to 100\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  duration 250\n\n# If you use any letters other than \"x\" on a tone pattern, you override its\n# note with the note listed.\n\nloop loop1\n  pattern note1 b.a.g.a.b.b.b.\n",
  motto: "# ------------------------------------------------------------\n# An approximation of the beat from Drake's \"The Motto\"\n\nbpm 100\n\nsection Bass (in a section to share ADSR)\n  adsr 0.005 0.05 0.7 0.05\n  tone bass1\n    octave 1\n  tone bass2\n    octave 2\n\nsample clap\n  src samples/clap.wav\nsample snare\n  src samples/snare.wav\nsample hihat\n  src samples/hihat.wav\n\n# TODO: fix snare pattern to match song\nloop loop1\n  pattern hihat ..x.......x.......x.......x.....\n  pattern clap  ....x.......x.......x.......x...\n  pattern snare ......x...x...x.x...............\n  pattern bass1 Bbbbbb..........................\n  pattern bass2 ......HhhhhhDddddd....HhhhJj.Jj.\n\ntrack song\n  pattern loop1 xxxx\n",
  length: "# ------------------------------------------------------------\n# Showing off various note lengths using caps and lowercase\n# Also shows what ADSR can do!\n\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n\ntone note2\n  # Note: Only the first tone has ADSR\n\n# If you use any letters other than \"x\" on a tone pattern, you override its\n# note with the note listed. Also, if you use any capital letters in a pattern,\n# you override the length of that note with the number of matching lowercase\n# letters following it.\n\nloop loop1\n  pattern note1 GgggggggFfffff..AaaaBbb.Cc..D...\n\nloop loop2\n  pattern note2 GgggggggFfffff..AaaaBbb.Cc..D...\n\ntrack song\n  pattern loop1 x.\n  pattern loop2 .x\n"
};


},{}],"./examples":[function(require,module,exports){
module.exports=require('DalL2z');
},{}],"./freq":[function(require,module,exports){
module.exports=require('8uZMKg');
},{}],"8uZMKg":[function(require,module,exports){
var findFreq, freqTable, legalNoteRegex;

freqTable = [
  {
    "a": 27.5000,
    "l": 29.1353,
    "b": 30.8677
  }, {
    "c": 32.7032,
    "h": 34.6479,
    "d": 36.7081,
    "i": 38.8909,
    "e": 41.2035,
    "f": 43.6536,
    "j": 46.2493,
    "g": 48.9995,
    "k": 51.9130,
    "a": 55.0000,
    "l": 58.2705,
    "b": 61.7354
  }, {
    "c": 65.4064,
    "h": 69.2957,
    "d": 73.4162,
    "i": 77.7817,
    "e": 82.4069,
    "f": 87.3071,
    "j": 92.4986,
    "g": 97.9989,
    "k": 103.826,
    "a": 110.000,
    "l": 116.541,
    "b": 123.471
  }, {
    "c": 130.813,
    "h": 138.591,
    "d": 146.832,
    "i": 155.563,
    "e": 164.814,
    "f": 174.614,
    "j": 184.997,
    "g": 195.998,
    "k": 207.652,
    "a": 220.000,
    "l": 233.082,
    "b": 246.942
  }, {
    "c": 261.626,
    "h": 277.183,
    "d": 293.665,
    "i": 311.127,
    "e": 329.628,
    "f": 349.228,
    "j": 369.994,
    "g": 391.995,
    "k": 415.305,
    "a": 440.000,
    "l": 466.164,
    "b": 493.883
  }, {
    "c": 523.251,
    "h": 554.365,
    "d": 587.330,
    "i": 622.254,
    "e": 659.255,
    "f": 698.456,
    "j": 739.989,
    "g": 783.991,
    "k": 830.609,
    "a": 880.000,
    "l": 932.328,
    "b": 987.767
  }, {
    "c": 1046.50,
    "h": 1108.73,
    "d": 1174.66,
    "i": 1244.51,
    "e": 1318.51,
    "f": 1396.91,
    "j": 1479.98,
    "g": 1567.98,
    "k": 1661.22,
    "a": 1760.00,
    "l": 1864.66,
    "b": 1975.53
  }, {
    "c": 2093.00,
    "h": 2217.46,
    "d": 2349.32,
    "i": 2489.02,
    "e": 2637.02,
    "f": 2793.83,
    "j": 2959.96,
    "g": 3135.96,
    "k": 3322.44,
    "a": 3520.00,
    "l": 3729.31,
    "b": 3951.07
  }, {
    "c": 4186.01
  }
];

legalNoteRegex = /[a-l]/;

findFreq = function(octave, note) {
  var octaveTable;
  note = note.toLowerCase();
  if ((octave >= 0) && (octave < freqTable.length) && legalNoteRegex.test(note)) {
    octaveTable = freqTable[octave];
    if ((octaveTable != null) && (octaveTable[note] != null)) {
      return octaveTable[note];
    }
  }
  return 440.0;
};

module.exports = {
  freqTable: freqTable,
  findFreq: findFreq
};


},{}],"1yrpF2":[function(require,module,exports){
var IndentStack, Parser, Renderer, clone, countIndent, findFreq, fs, makeBlobUrl, renderLoopScript, writeWAV, _ref,
  __slice = [].slice;

_ref = require("./riffwave"), writeWAV = _ref.writeWAV, makeBlobUrl = _ref.makeBlobUrl;

findFreq = require('./freq').findFreq;

fs = require('fs');

clone = function(obj) {
  var flags, key, newInstance;
  if ((obj == null) || typeof obj !== 'object') {
    return obj;
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  if (obj instanceof RegExp) {
    flags = '';
    if (obj.global != null) {
      flags += 'g';
    }
    if (obj.ignoreCase != null) {
      flags += 'i';
    }
    if (obj.multiline != null) {
      flags += 'm';
    }
    if (obj.sticky != null) {
      flags += 'y';
    }
    return new RegExp(obj.source, flags);
  }
  newInstance = new obj.constructor();
  for (key in obj) {
    newInstance[key] = clone(obj[key]);
  }
  return newInstance;
};

IndentStack = (function() {
  function IndentStack() {
    this.stack = [0];
  }

  IndentStack.prototype.push = function(indent) {
    return this.stack.push(indent);
  };

  IndentStack.prototype.pop = function() {
    if (this.stack.length > 1) {
      this.stack.pop();
      return true;
    }
    return false;
  };

  IndentStack.prototype.top = function() {
    return this.stack[this.stack.length - 1];
  };

  return IndentStack;

})();

countIndent = function(text) {
  var i, indent, _i, _ref1;
  indent = 0;
  for (i = _i = 0, _ref1 = text.length; 0 <= _ref1 ? _i < _ref1 : _i > _ref1; i = 0 <= _ref1 ? ++_i : --_i) {
    if (text[i] === '\t') {
      indent += 8;
    } else {
      indent++;
    }
  }
  return indent;
};

Parser = (function() {
  function Parser(log) {
    this.log = log;
    this.commentRegex = /^([^#]*?)(\s*#.*)?$/;
    this.onlyWhitespaceRegex = /^\s*$/;
    this.indentRegex = /^(\s*)(\S.*)$/;
    this.leadingUnderscoreRegex = /^_/;
    this.hasCapitalLettersRegex = /[A-Z]/;
    this.isNoteRegex = /[A-La-l]/;
    this.namedStates = {
      "default": {
        wave: 'sine',
        bpm: 120,
        duration: 200,
        beats: 4,
        octave: 4,
        note: 'a',
        volume: 1.0,
        adsr: {
          a: 0,
          d: 0,
          s: 1,
          r: 1
        }
      }
    };
    this.objectKeys = {
      tone: {
        wave: 'string',
        freq: 'float',
        duration: 'float',
        adsr: 'adsr',
        octave: 'int',
        note: 'string',
        volume: 'float'
      },
      sample: {
        src: 'string',
        volume: 'float'
      },
      loop: {
        bpm: 'int',
        beats: 'int'
      },
      track: {}
    };
    this.indentStack = new IndentStack;
    this.stateStack = [];
    this.reset('default');
    this.objects = {};
    this.object = null;
    this.objectScopeReady = false;
  }

  Parser.prototype.isObjectType = function(type) {
    return this.objectKeys[type] != null;
  };

  Parser.prototype.error = function(text) {
    return this.log("PARSE ERROR, line " + this.lineNo + ": " + text);
  };

  Parser.prototype.reset = function(name) {
    if (name == null) {
      name = 'default';
    }
    if (!this.namedStates[name]) {
      this.error("invalid reset name: " + name);
      return false;
    }
    this.stateStack.push(clone(this.namedStates[name]));
    return true;
  };

  Parser.prototype.flatten = function() {
    var flattenedState, key, state, _i, _len, _ref1;
    flattenedState = {};
    _ref1 = this.stateStack;
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      state = _ref1[_i];
      for (key in state) {
        flattenedState[key] = state[key];
      }
    }
    return flattenedState;
  };

  Parser.prototype.trace = function(prefix) {
    if (prefix == null) {
      prefix = '';
    }
    return this.log(("trace: " + prefix + " ") + JSON.stringify(this.flatten()));
  };

  Parser.prototype.createObject = function() {
    var data, i, _i, _ref1;
    data = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    this.finishObject();
    this.object = {};
    for (i = _i = 0, _ref1 = data.length; _i < _ref1; i = _i += 2) {
      this.object[data[i]] = data[i + 1];
    }
    this.objectScopeReady = true;
    if (this.object._type === 'loop') {
      this.object._patterns = [];
    }
    if (this.object._type === 'track') {
      this.object._patterns = [];
    }
    if (this.object._name) {
      return this.lastObject = this.object._name;
    }
  };

  Parser.prototype.finishObject = function() {
    var expectedType, key, state, v;
    if (this.object) {
      state = this.flatten();
      for (key in this.objectKeys[this.object._type]) {
        expectedType = this.objectKeys[this.object._type][key];
        if (state[key] != null) {
          v = state[key];
          this.object[key] = (function() {
            switch (expectedType) {
              case 'int':
                return parseInt(v);
              case 'float':
                return parseFloat(v);
              default:
                return v;
            }
          })();
        }
      }
      this.objects[this.object._name] = this.object;
    }
    return this.object = null;
  };

  Parser.prototype.creatingObjectType = function(type) {
    if (!this.object) {
      return false;
    }
    if (!this.object._type === type) {
      return false;
    }
    return true;
  };

  Parser.prototype.pushScope = function() {
    if (!this.objectScopeReady) {
      this.error("unexpected indent");
      return false;
    }
    this.objectScopeReady = false;
    this.stateStack.push({
      _scope: true
    });
    return true;
  };

  Parser.prototype.popScope = function() {
    var top;
    this.finishObject();
    while (true) {
      if (this.stateStack.length === 0) {
        this.error("state stack is empty! something bad has happened");
      }
      top = this.stateStack[this.stateStack.length - 1];
      if (top._scope != null) {
        break;
      }
      this.stateStack.pop();
    }
    this.stateStack.pop();
    return true;
  };

  Parser.prototype.parsePattern = function(pattern) {
    var c, i, length, next, overrideLength, sound, sounds, symbol;
    overrideLength = this.hasCapitalLettersRegex.test(pattern);
    i = 0;
    sounds = [];
    while (i < pattern.length) {
      c = pattern[i];
      if (c !== '.') {
        symbol = c.toLowerCase();
        sound = {
          offset: i
        };
        if (this.isNoteRegex.test(c)) {
          sound.note = symbol;
        }
        if (overrideLength) {
          length = 1;
          while (true) {
            next = pattern[i + 1];
            if (next === symbol) {
              length++;
              i++;
              if (i === pattern.length) {
                break;
              }
            } else {
              break;
            }
          }
          sound.length = length;
        }
        sounds.push(sound);
      }
      i++;
    }
    return {
      length: pattern.length,
      sounds: sounds
    };
  };

  Parser.prototype.processTokens = function(tokens) {
    var cmd, pattern;
    cmd = tokens[0].toLowerCase();
    if (cmd === 'reset') {
      if (!this.reset(tokens[1])) {
        return false;
      }
    } else if (cmd === 'section') {
      this.objectScopeReady = true;
    } else if (this.isObjectType(cmd)) {
      this.createObject('_type', cmd, '_name', tokens[1]);
    } else if (cmd === 'pattern') {
      if (!(this.creatingObjectType('loop') || this.creatingObjectType('track'))) {
        this.error("unexpected pattern command");
        return false;
      }
      pattern = this.parsePattern(tokens[2]);
      pattern.src = tokens[1];
      this.object._patterns.push(pattern);
    } else if (cmd === 'adsr') {
      this.stateStack[this.stateStack.length - 1][cmd] = {
        a: parseFloat(tokens[1]),
        d: parseFloat(tokens[2]),
        s: parseFloat(tokens[3]),
        r: parseFloat(tokens[4])
      };
    } else {
      if (this.leadingUnderscoreRegex.test(cmd)) {
        this.error("cannot set internal names (underscore prefix)");
        return false;
      }
      this.stateStack[this.stateStack.length - 1][cmd] = tokens[1];
    }
    return true;
  };

  Parser.prototype.parse = function(text) {
    var indent, indentText, line, lines, topIndent, _, _i, _len, _ref1;
    lines = text.split('\n');
    this.lineNo = 0;
    for (_i = 0, _len = lines.length; _i < _len; _i++) {
      line = lines[_i];
      this.lineNo++;
      line = line.replace(/(\r\n|\n|\r)/gm, "");
      line = this.commentRegex.exec(line)[1];
      if (this.onlyWhitespaceRegex.test(line)) {
        continue;
      }
      _ref1 = this.indentRegex.exec(line), _ = _ref1[0], indentText = _ref1[1], line = _ref1[2];
      indent = countIndent(indentText);
      topIndent = this.indentStack.top();
      if (indent === topIndent) {

      } else if (indent > topIndent) {
        this.indentStack.push(indent);
        if (!this.pushScope()) {
          return false;
        }
      } else {
        while (true) {
          if (!this.indentStack.pop()) {
            this.log("Unexpected indent " + indent + " on line " + lineNo + ": " + line);
            return false;
          }
          if (!this.popScope()) {
            return false;
          }
          if (this.indentStack.top() === indent) {
            break;
          }
        }
      }
      if (!this.processTokens(line.split(/\s+/))) {
        return false;
      }
    }
    while (this.indentStack.pop()) {
      this.popScope();
    }
    this.finishObject();
    return true;
  };

  return Parser;

})();

Renderer = (function() {
  function Renderer(log, sampleRate, readLocalFiles, objects) {
    this.log = log;
    this.sampleRate = sampleRate;
    this.readLocalFiles = readLocalFiles;
    this.objects = objects;
    this.sampleCache = {};
  }

  Renderer.prototype.error = function(text) {
    return this.log("RENDER ERROR: " + text);
  };

  Renderer.prototype.generateEnvelope = function(adsr, length) {
    var AtoD, DtoS, StoR, attackLen, decayLen, envelope, i, peakSustainDelta, releaseLen, sustain, sustainLen, _i, _j, _k, _l;
    envelope = Array(length);
    AtoD = Math.floor(adsr.a * length);
    DtoS = Math.floor(adsr.d * length);
    StoR = Math.floor(adsr.r * length);
    attackLen = AtoD;
    decayLen = DtoS - AtoD;
    sustainLen = StoR - DtoS;
    releaseLen = length - StoR;
    sustain = adsr.s;
    peakSustainDelta = 1.0 - sustain;
    for (i = _i = 0; 0 <= attackLen ? _i < attackLen : _i > attackLen; i = 0 <= attackLen ? ++_i : --_i) {
      envelope[i] = i / attackLen;
    }
    for (i = _j = 0; 0 <= decayLen ? _j < decayLen : _j > decayLen; i = 0 <= decayLen ? ++_j : --_j) {
      envelope[AtoD + i] = 1.0 - (peakSustainDelta * (i / decayLen));
    }
    for (i = _k = 0; 0 <= sustainLen ? _k < sustainLen : _k > sustainLen; i = 0 <= sustainLen ? ++_k : --_k) {
      envelope[DtoS + i] = sustain;
    }
    for (i = _l = 0; 0 <= releaseLen ? _l < releaseLen : _l > releaseLen; i = 0 <= releaseLen ? ++_l : --_l) {
      envelope[StoR + i] = sustain - (sustain * (i / releaseLen));
    }
    return envelope;
  };

  Renderer.prototype.renderTone = function(toneObj, overrides) {
    var A, B, amplitude, envelope, freq, i, length, offset, period, samples, sine, _i;
    offset = 0;
    amplitude = 16000;
    if (overrides.length > 0) {
      length = overrides.length;
    } else {
      length = Math.floor(toneObj.duration * this.sampleRate / 1000);
    }
    samples = Array(length);
    A = 200;
    B = 0.5;
    if (overrides.note != null) {
      freq = findFreq(toneObj.octave, overrides.note);
    } else if (toneObj.freq != null) {
      freq = toneObj.freq;
    } else {
      freq = findFreq(toneObj.octave, toneObj.note);
    }
    envelope = this.generateEnvelope(toneObj.adsr, length);
    for (i = _i = 0; 0 <= length ? _i < length : _i > length; i = 0 <= length ? ++_i : --_i) {
      period = this.sampleRate / freq;
      sine = Math.sin(offset + i / period * 2 * Math.PI);
      samples[i] = sine * amplitude * envelope[i] * toneObj.volume;
    }
    return samples;
  };

  Renderer.prototype.renderSample = function(sampleObj) {
    var data, i, jDataView, samples, subchunk2Size, view, _i, _ref1;
    view = null;
    if (this.readLocalFiles) {
      if (typeof jDataView === "undefined" || jDataView === null) {
        jDataView = require('./jDataView');
      }
      data = fs.readFileSync(sampleObj.src);
      view = new jDataView(data, 0, data.length, true);
    } else {
      $.ajax({
        url: sampleObj.src,
        mimeType: 'text/plain; charset=x-user-defined',
        success: function(data) {
          return view = new jDataView(data, 0, data.length, true);
        },
        async: false
      });
    }
    if (!view) {
      return [];
    }
    view.seek(40);
    subchunk2Size = view.getInt32();
    samples = [];
    while (view.tell() + 1 < view.byteLength) {
      samples.push(view.getInt16());
    }
    for (i = _i = 0, _ref1 = samples.length; 0 <= _ref1 ? _i < _ref1 : _i > _ref1; i = 0 <= _ref1 ? ++_i : --_i) {
      samples[i] *= sampleObj.volume;
    }
    return samples;
  };

  Renderer.prototype.renderPatterns = function(patterns, totalLength, calcOffsetLength) {
    var copyLen, i, j, offset, offsetLength, overrides, pattern, samples, sectionCount, sound, srcSamples, _i, _j, _k, _l, _len, _len1, _ref1;
    samples = Array(totalLength);
    for (i = _i = 0; 0 <= totalLength ? _i < totalLength : _i > totalLength; i = 0 <= totalLength ? ++_i : --_i) {
      samples[i] = 0;
    }
    for (_j = 0, _len = patterns.length; _j < _len; _j++) {
      pattern = patterns[_j];
      _ref1 = pattern.sounds;
      for (_k = 0, _len1 = _ref1.length; _k < _len1; _k++) {
        sound = _ref1[_k];
        overrides = {};
        sectionCount = pattern.length / 16;
        offsetLength = Math.floor(totalLength / 16 / sectionCount);
        if (sound.length > 0) {
          overrides.length = sound.length * offsetLength;
        }
        if (sound.note != null) {
          overrides.note = sound.note;
        }
        srcSamples = this.render(pattern.src, overrides);
        if (!calcOffsetLength) {
          offsetLength = srcSamples.length;
        }
        offset = sound.offset * offsetLength;
        copyLen = srcSamples.length;
        if ((offset + copyLen) > totalLength) {
          copyLen = totalLength - offset;
        }
        for (j = _l = 0; 0 <= copyLen ? _l < copyLen : _l > copyLen; j = 0 <= copyLen ? ++_l : --_l) {
          samples[offset + j] += srcSamples[j];
        }
      }
    }
    return samples;
  };

  Renderer.prototype.renderLoop = function(loopObj) {
    var beatCount, loopLength, pattern, samplesPerBeat, _i, _len, _ref1;
    beatCount = 0;
    _ref1 = loopObj._patterns;
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      pattern = _ref1[_i];
      if (beatCount < pattern.length) {
        beatCount = pattern.length;
      }
    }
    samplesPerBeat = this.sampleRate / (loopObj.bpm / 60) / loopObj.beats;
    loopLength = samplesPerBeat * beatCount;
    return this.renderPatterns(loopObj._patterns, loopLength, true);
  };

  Renderer.prototype.renderTrack = function(trackObj) {
    var pattern, patternLength, srcSamples, trackLength, _i, _len, _ref1;
    trackLength = 0;
    _ref1 = trackObj._patterns;
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      pattern = _ref1[_i];
      srcSamples = this.render(pattern.src);
      patternLength = srcSamples.length * pattern.length;
      if (trackLength < patternLength) {
        trackLength = patternLength;
      }
    }
    return this.renderPatterns(trackObj._patterns, trackLength, false);
  };

  Renderer.prototype.calcCacheName = function(type, which, overrides) {
    var name;
    if (type !== 'tone') {
      return which;
    }
    name = which;
    if (overrides.note) {
      name += "/N" + overrides.note;
    }
    if (overrides.length) {
      name += "/L" + overrides.length;
    }
    return name;
  };

  Renderer.prototype.render = function(which, overrides) {
    var cacheName, object, samples;
    object = this.objects[which];
    if (!object) {
      this.error("no such object " + which);
      return null;
    }
    cacheName = this.calcCacheName(object._type, which, overrides);
    if (this.sampleCache[cacheName]) {
      return this.sampleCache[cacheName];
    }
    samples = (function() {
      switch (object._type) {
        case 'tone':
          return this.renderTone(object, overrides);
        case 'loop':
          return this.renderLoop(object);
        case 'track':
          return this.renderTrack(object);
        case 'sample':
          return this.renderSample(object);
        default:
          this.error("unknown type " + object._type);
          return null;
      }
    }).call(this);
    this.log("Rendered " + cacheName + ".");
    this.sampleCache[cacheName] = samples;
    return samples;
  };

  return Renderer;

})();

renderLoopScript = function(args) {
  var logCB, outputSamples, parser, renderer, sampleRate, which;
  logCB = args.log;
  logCB("Parsing...");
  parser = new Parser(logCB);
  parser.parse(args.script);
  which = args.which;
  if (which == null) {
    which = parser.lastObject;
  }
  if (which) {
    sampleRate = 44100;
    logCB("Rendering...");
    renderer = new Renderer(logCB, sampleRate, args.readLocalFiles, parser.objects);
    outputSamples = renderer.render(parser.lastObject, {});
    if (args.outputFilename) {
      return writeWAV(args.outputFilename, sampleRate, outputSamples);
    }
    return makeBlobUrl(sampleRate, outputSamples);
  }
  return null;
};

module.exports = {
  render: renderLoopScript
};


},{"./freq":"8uZMKg","./jDataView":1,"./riffwave":"y6ZgdS","fs":1}],"./loopscript":[function(require,module,exports){
module.exports=require('1yrpF2');
},{}],"y6ZgdS":[function(require,module,exports){
(function (Buffer){
var FastBase64, RIFFWAVE, b64toBlob, fs, makeBlobUrl, makeDataURI, writeWAV;

fs = require("fs");

FastBase64 = (function() {
  function FastBase64() {
    var i, _i;
    this.chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    this.encLookup = [];
    for (i = _i = 0; _i < 4096; i = ++_i) {
      this.encLookup[i] = this.chars[i >> 6] + this.chars[i & 0x3F];
    }
  }

  FastBase64.prototype.encode = function(src) {
    var dst, i, len, n, n1, n2, n3;
    len = src.length;
    dst = '';
    i = 0;
    while (len > 2) {
      n = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
      dst += this.encLookup[n >> 12] + this.encLookup[n & 0xFFF];
      len -= 3;
      i += 3;
    }
    if (len > 0) {
      n1 = (src[i] & 0xFC) >> 2;
      n2 = (src[i] & 0x03) << 4;
      if (len > 1) {
        n2 |= (src[++i] & 0xF0) >> 4;
      }
      dst += this.chars[n1];
      dst += this.chars[n2];
      if (len === 2) {
        n3 = (src[i++] & 0x0F) << 2;
        n3 |= (src[i] & 0xC0) >> 6;
        dst += this.chars[n3];
      }
      if (len === 1) {
        dst += '=';
      }
      dst += '=';
    }
    return dst;
  };

  return FastBase64;

})();

RIFFWAVE = (function() {
  function RIFFWAVE(sampleRate, data) {
    this.sampleRate = sampleRate;
    this.data = data;
    this.wav = [];
    this.header = {
      chunkId: [0x52, 0x49, 0x46, 0x46],
      chunkSize: 0,
      format: [0x57, 0x41, 0x56, 0x45],
      subChunk1Id: [0x66, 0x6d, 0x74, 0x20],
      subChunk1Size: 16,
      audioFormat: 1,
      numChannels: 1,
      sampleRate: this.sampleRate,
      byteRate: 0,
      blockAlign: 0,
      bitsPerSample: 16,
      subChunk2Id: [0x64, 0x61, 0x74, 0x61],
      subChunk2Size: 0
    };
    this.generate();
  }

  RIFFWAVE.prototype.u32ToArray = function(i) {
    return [i & 0xFF, (i >> 8) & 0xFF, (i >> 16) & 0xFF, (i >> 24) & 0xFF];
  };

  RIFFWAVE.prototype.u16ToArray = function(i) {
    return [i & 0xFF, (i >> 8) & 0xFF];
  };

  RIFFWAVE.prototype.split16bitArray = function(data) {
    var i, j, len, r, _i;
    r = [];
    j = 0;
    len = data.length;
    for (i = _i = 0; 0 <= len ? _i < len : _i > len; i = 0 <= len ? ++_i : --_i) {
      r[j++] = data[i] & 0xFF;
      r[j++] = (data[i] >> 8) & 0xFF;
    }
    return r;
  };

  RIFFWAVE.prototype.generate = function() {
    var fb;
    this.header.blockAlign = (this.header.numChannels * this.header.bitsPerSample) >> 3;
    this.header.byteRate = this.header.blockAlign * this.sampleRate;
    this.header.subChunk2Size = this.data.length * (this.header.bitsPerSample >> 3);
    this.header.chunkSize = 36 + this.header.subChunk2Size;
    if (this.header.bitsPerSample === 16) {
      this.data = this.split16bitArray(this.data);
    }
    this.wav = this.header.chunkId.concat(this.u32ToArray(this.header.chunkSize), this.header.format, this.header.subChunk1Id, this.u32ToArray(this.header.subChunk1Size), this.u16ToArray(this.header.audioFormat), this.u16ToArray(this.header.numChannels), this.u32ToArray(this.header.sampleRate), this.u32ToArray(this.header.byteRate), this.u16ToArray(this.header.blockAlign), this.u16ToArray(this.header.bitsPerSample), this.header.subChunk2Id, this.u32ToArray(this.header.subChunk2Size), this.data);
    fb = new FastBase64;
    this.base64Data = fb.encode(this.wav);
    return this.dataURI = 'data:audio/wav;base64,' + this.base64Data;
  };

  RIFFWAVE.prototype.raw = function() {
    return new Buffer(this.base64Data, "base64");
  };

  return RIFFWAVE;

})();

writeWAV = function(filename, sampleRate, samples) {
  var wave;
  wave = new RIFFWAVE(sampleRate, samples);
  fs.writeFileSync(filename, wave.raw());
  return true;
};

makeDataURI = function(sampleRate, samples) {
  var wave;
  wave = new RIFFWAVE(sampleRate, samples);
  return wave.dataURI;
};

b64toBlob = function(b64Data, contentType, sliceSize) {
  var blob, byteArray, byteArrays, byteCharacters, byteNumbers, i, offset, slice, _i, _j, _ref, _ref1;
  contentType = contentType || '';
  sliceSize = sliceSize || 512;
  byteCharacters = atob(b64Data);
  byteArrays = [];
  for (offset = _i = 0, _ref = byteCharacters.length; sliceSize > 0 ? _i < _ref : _i > _ref; offset = _i += sliceSize) {
    slice = byteCharacters.slice(offset, offset + sliceSize);
    byteNumbers = new Array(slice.length);
    for (i = _j = 0, _ref1 = slice.length; 0 <= _ref1 ? _j < _ref1 : _j > _ref1; i = 0 <= _ref1 ? ++_j : --_j) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  blob = new Blob(byteArrays, {
    type: contentType
  });
  return blob;
};

makeBlobUrl = function(sampleRate, samples) {
  var blob, wave;
  wave = new RIFFWAVE(sampleRate, samples);
  blob = b64toBlob(wave.base64Data, "audio/wav");
  return URL.createObjectURL(blob);
};

module.exports = {
  RIFFWAVE: RIFFWAVE,
  writeWAV: writeWAV,
  makeDataURI: makeDataURI,
  makeBlobUrl: makeBlobUrl
};


}).call(this,require("buffer").Buffer)
},{"buffer":2,"fs":1}],"./riffwave":[function(require,module,exports){
module.exports=require('y6ZgdS');
},{}]},{},[])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxsaWJcXF9lbXB0eS5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcbmF0aXZlLWJ1ZmZlci1icm93c2VyaWZ5XFxpbmRleC5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcbmF0aXZlLWJ1ZmZlci1icm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJhc2U2NC1qc1xcbGliXFxiNjQuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXG5hdGl2ZS1idWZmZXItYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxpZWVlNzU0XFxpbmRleC5qcyIsIi4uXFxzcmNcXGV4YW1wbGVzLmNvZmZlZSIsIi4uXFxzcmNcXGZyZXEuY29mZmVlIiwiLi5cXHNyY1xcbG9vcHNjcmlwdC5jb2ZmZWUiLCIuLlxcc3JjXFxyaWZmd2F2ZS5jb2ZmZWUiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoaUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQSxNQUFNLENBQUMsT0FBUCxHQUVFO0FBQUEsRUFBQSxLQUFBLEVBQU8sMlRBQVA7QUFBQSxFQW9CQSxLQUFBLEVBQU8sK1VBcEJQO0FBQUEsRUFxQ0EsS0FBQSxFQUFPLG10QkFyQ1A7QUFBQSxFQXNFQSxNQUFBLEVBQVEsOHJCQXRFUjtDQUZGLENBQUE7Ozs7Ozs7O0FDQUEsSUFBQSxtQ0FBQTs7QUFBQSxTQUFBLEdBQVk7RUFDVjtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtHQURVLEVBUVY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0FSVSxFQXVCVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXZCVSxFQXNDVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXRDVSxFQXFEVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXJEVSxFQW9FVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXBFVSxFQW1GVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FB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cUIsT0FBckIsQ0FBWCxDQUFBO0FBQUEsRUFDQSxJQUFBLEdBQU8sU0FBQSxDQUFVLElBQUksQ0FBQyxVQUFmLEVBQTJCLFdBQTNCLENBRFAsQ0FBQTtBQUVBLFNBQU8sR0FBRyxDQUFDLGVBQUosQ0FBb0IsSUFBcEIsQ0FBUCxDQUhZO0FBQUEsQ0FySWQsQ0FBQTs7QUFBQSxNQTBJTSxDQUFDLE9BQVAsR0FDRTtBQUFBLEVBQUEsUUFBQSxFQUFVLFFBQVY7QUFBQSxFQUNBLFFBQUEsRUFBVSxRQURWO0FBQUEsRUFFQSxXQUFBLEVBQWEsV0FGYjtBQUFBLEVBR0EsV0FBQSxFQUFhLFdBSGI7Q0EzSUYsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIixudWxsLCJ2YXIgYmFzZTY0ID0gcmVxdWlyZSgnYmFzZTY0LWpzJylcbnZhciBpZWVlNzU0ID0gcmVxdWlyZSgnaWVlZTc1NCcpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MlxuXG4vKipcbiAqIElmIGBCdWZmZXIuX3VzZVR5cGVkQXJyYXlzYDpcbiAqICAgPT09IHRydWUgICAgVXNlIFVpbnQ4QXJyYXkgaW1wbGVtZW50YXRpb24gKGZhc3Rlc3QpXG4gKiAgID09PSBmYWxzZSAgIFVzZSBPYmplY3QgaW1wbGVtZW50YXRpb24gKGNvbXBhdGlibGUgZG93biB0byBJRTYpXG4gKi9cbkJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgPSAoZnVuY3Rpb24gKCkge1xuICAgLy8gRGV0ZWN0IGlmIGJyb3dzZXIgc3VwcG9ydHMgVHlwZWQgQXJyYXlzLiBTdXBwb3J0ZWQgYnJvd3NlcnMgYXJlIElFIDEwKyxcbiAgIC8vIEZpcmVmb3ggNCssIENocm9tZSA3KywgU2FmYXJpIDUuMSssIE9wZXJhIDExLjYrLCBpT1MgNC4yKy5cbiAgIGlmICh0eXBlb2YgVWludDhBcnJheSA9PT0gJ3VuZGVmaW5lZCcgfHwgdHlwZW9mIEFycmF5QnVmZmVyID09PSAndW5kZWZpbmVkJylcbiAgICAgIHJldHVybiBmYWxzZVxuXG4gIC8vIERvZXMgdGhlIGJyb3dzZXIgc3VwcG9ydCBhZGRpbmcgcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzPyBJZlxuICAvLyBub3QsIHRoZW4gdGhhdCdzIHRoZSBzYW1lIGFzIG5vIGBVaW50OEFycmF5YCBzdXBwb3J0LiBXZSBuZWVkIHRvIGJlIGFibGUgdG9cbiAgLy8gYWRkIGFsbCB0aGUgbm9kZSBCdWZmZXIgQVBJIG1ldGhvZHMuXG4gIC8vIFJlbGV2YW50IEZpcmVmb3ggYnVnOiBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTU0MzhcbiAgdHJ5IHtcbiAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoMClcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpICYmXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgLy8gQ2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSkoKVxuXG4vKipcbiAqIENsYXNzOiBCdWZmZXJcbiAqID09PT09PT09PT09PT1cbiAqXG4gKiBUaGUgQnVmZmVyIGNvbnN0cnVjdG9yIHJldHVybnMgaW5zdGFuY2VzIG9mIGBVaW50OEFycmF5YCB0aGF0IGFyZSBhdWdtZW50ZWRcbiAqIHdpdGggZnVuY3Rpb24gcHJvcGVydGllcyBmb3IgYWxsIHRoZSBub2RlIGBCdWZmZXJgIEFQSSBmdW5jdGlvbnMuIFdlIHVzZVxuICogYFVpbnQ4QXJyYXlgIHNvIHRoYXQgc3F1YXJlIGJyYWNrZXQgbm90YXRpb24gd29ya3MgYXMgZXhwZWN0ZWQgLS0gaXQgcmV0dXJuc1xuICogYSBzaW5nbGUgb2N0ZXQuXG4gKlxuICogQnkgYXVnbWVudGluZyB0aGUgaW5zdGFuY2VzLCB3ZSBjYW4gYXZvaWQgbW9kaWZ5aW5nIHRoZSBgVWludDhBcnJheWBcbiAqIHByb3RvdHlwZS5cbiAqL1xuZnVuY3Rpb24gQnVmZmVyIChzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBCdWZmZXIpKVxuICAgIHJldHVybiBuZXcgQnVmZmVyKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pXG5cbiAgdmFyIHR5cGUgPSB0eXBlb2Ygc3ViamVjdFxuXG4gIC8vIFdvcmthcm91bmQ6IG5vZGUncyBiYXNlNjQgaW1wbGVtZW50YXRpb24gYWxsb3dzIGZvciBub24tcGFkZGVkIHN0cmluZ3NcbiAgLy8gd2hpbGUgYmFzZTY0LWpzIGRvZXMgbm90LlxuICBpZiAoZW5jb2RpbmcgPT09ICdiYXNlNjQnICYmIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgc3ViamVjdCA9IHN0cmluZ3RyaW0oc3ViamVjdClcbiAgICB3aGlsZSAoc3ViamVjdC5sZW5ndGggJSA0ICE9PSAwKSB7XG4gICAgICBzdWJqZWN0ID0gc3ViamVjdCArICc9J1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpbmQgdGhlIGxlbmd0aFxuICB2YXIgbGVuZ3RoXG4gIGlmICh0eXBlID09PSAnbnVtYmVyJylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdClcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpXG4gICAgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoc3ViamVjdCwgZW5jb2RpbmcpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0Lmxlbmd0aCkgLy8gQXNzdW1lIG9iamVjdCBpcyBhbiBhcnJheVxuICBlbHNlXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGaXJzdCBhcmd1bWVudCBuZWVkcyB0byBiZSBhIG51bWJlciwgYXJyYXkgb3Igc3RyaW5nLicpXG5cbiAgdmFyIGJ1ZlxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBhdWdtZW50KG5ldyBVaW50OEFycmF5KGxlbmd0aCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gRmFsbGJhY2s6IFJldHVybiBUSElTIGluc3RhbmNlIG9mIEJ1ZmZlciAoY3JlYXRlZCBieSBgbmV3YClcbiAgICBidWYgPSB0aGlzXG4gICAgYnVmLmxlbmd0aCA9IGxlbmd0aFxuICAgIGJ1Zi5faXNCdWZmZXIgPSB0cnVlXG4gIH1cblxuICB2YXIgaVxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiB0eXBlb2YgVWludDhBcnJheSA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgc3ViamVjdCBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpIHtcbiAgICAvLyBTcGVlZCBvcHRpbWl6YXRpb24gLS0gdXNlIHNldCBpZiB3ZSdyZSBjb3B5aW5nIGZyb20gYSBVaW50OEFycmF5XG4gICAgYnVmLl9zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgICAgZWxzZVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0W2ldXG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmICFub1plcm8pIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGJ1ZltpXSA9IDBcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmXG59XG5cbi8vIFNUQVRJQyBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gKGIpIHtcbiAgcmV0dXJuICEhKGIgIT09IG51bGwgJiYgYiAhPT0gdW5kZWZpbmVkICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGZ1bmN0aW9uIChzdHIsIGVuY29kaW5nKSB7XG4gIHZhciByZXRcbiAgc3RyID0gc3RyICsgJydcbiAgc3dpdGNoIChlbmNvZGluZyB8fCAndXRmOCcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAvIDJcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAncmF3JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IGJhc2U2NFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggKiAyXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBhc3NlcnQoaXNBcnJheShsaXN0KSwgJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3QsIFt0b3RhbExlbmd0aF0pXFxuJyArXG4gICAgICAnbGlzdCBzaG91bGQgYmUgYW4gQXJyYXkuJylcblxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcigwKVxuICB9IGVsc2UgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGxpc3RbMF1cbiAgfVxuXG4gIHZhciBpXG4gIGlmICh0eXBlb2YgdG90YWxMZW5ndGggIT09ICdudW1iZXInKSB7XG4gICAgdG90YWxMZW5ndGggPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRvdGFsTGVuZ3RoICs9IGxpc3RbaV0ubGVuZ3RoXG4gICAgfVxuICB9XG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIodG90YWxMZW5ndGgpXG4gIHZhciBwb3MgPSAwXG4gIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBsaXN0W2ldXG4gICAgaXRlbS5jb3B5KGJ1ZiwgcG9zKVxuICAgIHBvcyArPSBpdGVtLmxlbmd0aFxuICB9XG4gIHJldHVybiBidWZcbn1cblxuLy8gQlVGRkVSIElOU1RBTkNFIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIF9oZXhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IGJ1Zi5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuXG4gIC8vIG11c3QgYmUgYW4gZXZlbiBudW1iZXIgb2YgZGlnaXRzXG4gIHZhciBzdHJMZW4gPSBzdHJpbmcubGVuZ3RoXG4gIGFzc2VydChzdHJMZW4gJSAyID09PSAwLCAnSW52YWxpZCBoZXggc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGJ5dGUgPSBwYXJzZUludChzdHJpbmcuc3Vic3RyKGkgKiAyLCAyKSwgMTYpXG4gICAgYXNzZXJ0KCFpc05hTihieXRlKSwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG4gICAgYnVmW29mZnNldCArIGldID0gYnl0ZVxuICB9XG4gIEJ1ZmZlci5fY2hhcnNXcml0dGVuID0gaSAqIDJcbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gX3V0ZjhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGY4VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGFzY2lpVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBfYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihiYXNlNjRUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldHVybiBfaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAndWNzMic6IC8vIFRPRE86IE5vIHN1cHBvcnQgZm9yIHVjczIgb3IgdXRmMTZsZSBlbmNvZGluZ3MgeWV0XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiBfdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0dXJuIF9hc2NpaVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldHVybiBfYmluYXJ5V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0dXJuIF9iYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG4gIHN0YXJ0ID0gTnVtYmVyKHN0YXJ0KSB8fCAwXG4gIGVuZCA9IChlbmQgIT09IHVuZGVmaW5lZClcbiAgICA/IE51bWJlcihlbmQpXG4gICAgOiBlbmQgPSBzZWxmLmxlbmd0aFxuXG4gIC8vIEZhc3RwYXRoIGVtcHR5IHN0cmluZ3NcbiAgaWYgKGVuZCA9PT0gc3RhcnQpXG4gICAgcmV0dXJuICcnXG5cbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXR1cm4gX2hleFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ3VjczInOiAvLyBUT0RPOiBObyBzdXBwb3J0IGZvciB1Y3MyIG9yIHV0ZjE2bGUgZW5jb2RpbmdzIHlldFxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXR1cm4gX3V0ZjhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldHVybiBfYXNjaWlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXR1cm4gX2JpbmFyeVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldHVybiBfYmFzZTY0U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG4vLyBjb3B5KHRhcmdldEJ1ZmZlciwgdGFyZ2V0U3RhcnQ9MCwgc291cmNlU3RhcnQ9MCwgc291cmNlRW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiAodGFyZ2V0LCB0YXJnZXRfc3RhcnQsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNvdXJjZSA9IHRoaXNcblxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgJiYgZW5kICE9PSAwKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoIXRhcmdldF9zdGFydCkgdGFyZ2V0X3N0YXJ0ID0gMFxuXG4gIC8vIENvcHkgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHNvdXJjZS5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIC8vIEZhdGFsIGVycm9yIGNvbmRpdGlvbnNcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ3NvdXJjZUVuZCA8IHNvdXJjZVN0YXJ0JylcbiAgYXNzZXJ0KHRhcmdldF9zdGFydCA+PSAwICYmIHRhcmdldF9zdGFydCA8IHRhcmdldC5sZW5ndGgsXG4gICAgICAndGFyZ2V0U3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgc291cmNlLmxlbmd0aCwgJ3NvdXJjZVN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VFbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgLy8gQXJlIHdlIG9vYj9cbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKVxuICAgIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0IDwgZW5kIC0gc3RhcnQpXG4gICAgZW5kID0gdGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCArIHN0YXJ0XG5cbiAgLy8gY29weSFcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBlbmQgLSBzdGFydDsgaSsrKVxuICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBpZiAoc3RhcnQgPT09IDAgJiYgZW5kID09PSBidWYubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1ZilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmLnNsaWNlKHN0YXJ0LCBlbmQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIF91dGY4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmVzID0gJydcbiAgdmFyIHRtcCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIGlmIChidWZbaV0gPD0gMHg3Rikge1xuICAgICAgcmVzICs9IGRlY29kZVV0ZjhDaGFyKHRtcCkgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgICAgIHRtcCA9ICcnXG4gICAgfSBlbHNlIHtcbiAgICAgIHRtcCArPSAnJScgKyBidWZbaV0udG9TdHJpbmcoMTYpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlcyArIGRlY29kZVV0ZjhDaGFyKHRtcClcbn1cblxuZnVuY3Rpb24gX2FzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKVxuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgcmV0dXJuIHJldFxufVxuXG5mdW5jdGlvbiBfYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gX2FzY2lpU2xpY2UoYnVmLCBzdGFydCwgZW5kKVxufVxuXG5mdW5jdGlvbiBfaGV4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuXG4gIGlmICghc3RhcnQgfHwgc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgfHwgZW5kIDwgMCB8fCBlbmQgPiBsZW4pIGVuZCA9IGxlblxuXG4gIHZhciBvdXQgPSAnJ1xuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIG91dCArPSB0b0hleChidWZbaV0pXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG4vLyBodHRwOi8vbm9kZWpzLm9yZy9hcGkvYnVmZmVyLmh0bWwjYnVmZmVyX2J1Zl9zbGljZV9zdGFydF9lbmRcbkJ1ZmZlci5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgc3RhcnQgPSBjbGFtcChzdGFydCwgbGVuLCAwKVxuICBlbmQgPSBjbGFtcChlbmQsIGxlbiwgbGVuKVxuXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgcmV0dXJuIGF1Z21lbnQodGhpcy5zdWJhcnJheShzdGFydCwgZW5kKSlcbiAgfSBlbHNlIHtcbiAgICB2YXIgc2xpY2VMZW4gPSBlbmQgLSBzdGFydFxuICAgIHZhciBuZXdCdWYgPSBuZXcgQnVmZmVyKHNsaWNlTGVuLCB1bmRlZmluZWQsIHRydWUpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbGljZUxlbjsgaSsrKSB7XG4gICAgICBuZXdCdWZbaV0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gICAgcmV0dXJuIG5ld0J1ZlxuICB9XG59XG5cbi8vIGBnZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5nZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLnJlYWRVSW50OChvZmZzZXQpXG59XG5cbi8vIGBzZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uICh2LCBvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5zZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLndyaXRlVUludDgodiwgb2Zmc2V0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgfSBlbHNlIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAyXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gICAgdmFsIHw9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldCArIDNdIDw8IDI0ID4+PiAwKVxuICB9IGVsc2Uge1xuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDFdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDJdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgM11cbiAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldF0gPDwgMjQgPj4+IDApXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLFxuICAgICAgICAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgdmFyIG5lZyA9IHRoaXNbb2Zmc2V0XSAmIDB4ODBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MTYoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDMyKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDAwMDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmZmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEZsb2F0IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdEJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRG91YmxlIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZilcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpIHJldHVyblxuXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmZmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDQpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlID4+PiAobGl0dGxlRW5kaWFuID8gaSA6IDMgLSBpKSAqIDgpICYgMHhmZlxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmLCAtMHg4MClcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgdGhpcy53cml0ZVVJbnQ4KHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgdGhpcy53cml0ZVVJbnQ4KDB4ZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZiwgLTB4ODAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQxNihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MTYoYnVmLCAweGZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MzIoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgMHhmZmZmZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVGbG9hdCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAzLjQwMjgyMzQ2NjM4NTI4ODZlKzM4LCAtMy40MDI4MjM0NjYzODUyODg2ZSszOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsXG4gICAgICAgICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgsIC0xLjc5NzY5MzEzNDg2MjMxNTdFKzMwOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gZmlsbCh2YWx1ZSwgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiAodmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCF2YWx1ZSkgdmFsdWUgPSAwXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCkgZW5kID0gdGhpcy5sZW5ndGhcblxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHZhbHVlID0gdmFsdWUuY2hhckNvZGVBdCgwKVxuICB9XG5cbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgIWlzTmFOKHZhbHVlKSwgJ3ZhbHVlIGlzIG5vdCBhIG51bWJlcicpXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdlbmQgPCBzdGFydCcpXG5cbiAgLy8gRmlsbCAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHRoaXMubGVuZ3RoLCAnc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gdGhpcy5sZW5ndGgsICdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICB0aGlzW2ldID0gdmFsdWVcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBvdXQgPSBbXVxuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIG91dFtpXSA9IHRvSGV4KHRoaXNbaV0pXG4gICAgaWYgKGkgPT09IGV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMpIHtcbiAgICAgIG91dFtpICsgMV0gPSAnLi4uJ1xuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICc8QnVmZmVyICcgKyBvdXQuam9pbignICcpICsgJz4nXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgQXJyYXlCdWZmZXJgIHdpdGggdGhlICpjb3BpZWQqIG1lbW9yeSBvZiB0aGUgYnVmZmVyIGluc3RhbmNlLlxuICogQWRkZWQgaW4gTm9kZSAwLjEyLiBPbmx5IGF2YWlsYWJsZSBpbiBicm93c2VycyB0aGF0IHN1cHBvcnQgQXJyYXlCdWZmZXIuXG4gKi9cbkJ1ZmZlci5wcm90b3R5cGUudG9BcnJheUJ1ZmZlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiBVaW50OEFycmF5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAgIHJldHVybiAobmV3IEJ1ZmZlcih0aGlzKSkuYnVmZmVyXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBidWYgPSBuZXcgVWludDhBcnJheSh0aGlzLmxlbmd0aClcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBidWYubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDEpXG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignQnVmZmVyLnRvQXJyYXlCdWZmZXIgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGJyb3dzZXInKVxuICB9XG59XG5cbi8vIEhFTFBFUiBGVU5DVElPTlNcbi8vID09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxudmFyIEJQID0gQnVmZmVyLnByb3RvdHlwZVxuXG4vKipcbiAqIEF1Z21lbnQgdGhlIFVpbnQ4QXJyYXkgKmluc3RhbmNlKiAobm90IHRoZSBjbGFzcyEpIHdpdGggQnVmZmVyIG1ldGhvZHNcbiAqL1xuZnVuY3Rpb24gYXVnbWVudCAoYXJyKSB7XG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG4vLyBzbGljZShzdGFydCwgZW5kKVxuZnVuY3Rpb24gY2xhbXAgKGluZGV4LCBsZW4sIGRlZmF1bHRWYWx1ZSkge1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSAnbnVtYmVyJykgcmV0dXJuIGRlZmF1bHRWYWx1ZVxuICBpbmRleCA9IH5+aW5kZXg7ICAvLyBDb2VyY2UgdG8gaW50ZWdlci5cbiAgaWYgKGluZGV4ID49IGxlbikgcmV0dXJuIGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIGluZGV4ICs9IGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGNvZXJjZSAobGVuZ3RoKSB7XG4gIC8vIENvZXJjZSBsZW5ndGggdG8gYSBudW1iZXIgKHBvc3NpYmx5IE5hTiksIHJvdW5kIHVwXG4gIC8vIGluIGNhc2UgaXQncyBmcmFjdGlvbmFsIChlLmcuIDEyMy40NTYpIHRoZW4gZG8gYVxuICAvLyBkb3VibGUgbmVnYXRlIHRvIGNvZXJjZSBhIE5hTiB0byAwLiBFYXN5LCByaWdodD9cbiAgbGVuZ3RoID0gfn5NYXRoLmNlaWwoK2xlbmd0aClcbiAgcmV0dXJuIGxlbmd0aCA8IDAgPyAwIDogbGVuZ3RoXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXkgKHN1YmplY3QpIHtcbiAgcmV0dXJuIChBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChzdWJqZWN0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzdWJqZWN0KSA9PT0gJ1tvYmplY3QgQXJyYXldJ1xuICB9KShzdWJqZWN0KVxufVxuXG5mdW5jdGlvbiBpc0FycmF5aXNoIChzdWJqZWN0KSB7XG4gIHJldHVybiBpc0FycmF5KHN1YmplY3QpIHx8IEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSB8fFxuICAgICAgc3ViamVjdCAmJiB0eXBlb2Ygc3ViamVjdCA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHR5cGVvZiBzdWJqZWN0Lmxlbmd0aCA9PT0gJ251bWJlcidcbn1cblxuZnVuY3Rpb24gdG9IZXggKG4pIHtcbiAgaWYgKG4gPCAxNikgcmV0dXJuICcwJyArIG4udG9TdHJpbmcoMTYpXG4gIHJldHVybiBuLnRvU3RyaW5nKDE2KVxufVxuXG5mdW5jdGlvbiB1dGY4VG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIHZhciBiID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBpZiAoYiA8PSAweDdGKVxuICAgICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkpXG4gICAgZWxzZSB7XG4gICAgICB2YXIgc3RhcnQgPSBpXG4gICAgICBpZiAoYiA+PSAweEQ4MDAgJiYgYiA8PSAweERGRkYpIGkrK1xuICAgICAgdmFyIGggPSBlbmNvZGVVUklDb21wb25lbnQoc3RyLnNsaWNlKHN0YXJ0LCBpKzEpKS5zdWJzdHIoMSkuc3BsaXQoJyUnKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBoLmxlbmd0aDsgaisrKVxuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYmFzZTY0VG9CeXRlcyAoc3RyKSB7XG4gIHJldHVybiBiYXNlNjQudG9CeXRlQXJyYXkoc3RyKVxufVxuXG5mdW5jdGlvbiBibGl0QnVmZmVyIChzcmMsIGRzdCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIHBvc1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChpICsgb2Zmc2V0ID49IGRzdC5sZW5ndGgpIHx8IChpID49IHNyYy5sZW5ndGgpKVxuICAgICAgYnJlYWtcbiAgICBkc3RbaSArIG9mZnNldF0gPSBzcmNbaV1cbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBkZWNvZGVVdGY4Q2hhciAoc3RyKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzdHIpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKDB4RkZGRCkgLy8gVVRGIDggaW52YWxpZCBjaGFyXG4gIH1cbn1cblxuLypcbiAqIFdlIGhhdmUgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIHZhbHVlIGlzIGEgdmFsaWQgaW50ZWdlci4gVGhpcyBtZWFucyB0aGF0IGl0XG4gKiBpcyBub24tbmVnYXRpdmUuIEl0IGhhcyBubyBmcmFjdGlvbmFsIGNvbXBvbmVudCBhbmQgdGhhdCBpdCBkb2VzIG5vdFxuICogZXhjZWVkIHRoZSBtYXhpbXVtIGFsbG93ZWQgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIHZlcmlmdWludCAodmFsdWUsIG1heCkge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA+PSAwLFxuICAgICAgJ3NwZWNpZmllZCBhIG5lZ2F0aXZlIHZhbHVlIGZvciB3cml0aW5nIGFuIHVuc2lnbmVkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGlzIGxhcmdlciB0aGFuIG1heGltdW0gdmFsdWUgZm9yIHR5cGUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZnNpbnQodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZJRUVFNzU0KHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG59XG5cbmZ1bmN0aW9uIGFzc2VydCAodGVzdCwgbWVzc2FnZSkge1xuICBpZiAoIXRlc3QpIHRocm93IG5ldyBFcnJvcihtZXNzYWdlIHx8ICdGYWlsZWQgYXNzZXJ0aW9uJylcbn1cbiIsInZhciBsb29rdXAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG5cbjsoZnVuY3Rpb24gKGV4cG9ydHMpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG4gIHZhciBBcnIgPSAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKVxuICAgID8gVWludDhBcnJheVxuICAgIDogQXJyYXlcblxuXHR2YXIgWkVSTyAgID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTKVxuXHRcdFx0cmV0dXJuIDYyIC8vICcrJ1xuXHRcdGlmIChjb2RlID09PSBTTEFTSClcblx0XHRcdHJldHVybiA2MyAvLyAnLydcblx0XHRpZiAoY29kZSA8IE5VTUJFUilcblx0XHRcdHJldHVybiAtMSAvL25vIG1hdGNoXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIgKyAxMClcblx0XHRcdHJldHVybiBjb2RlIC0gTlVNQkVSICsgMjYgKyAyNlxuXHRcdGlmIChjb2RlIDwgVVBQRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gVVBQRVJcblx0XHRpZiAoY29kZSA8IExPV0VSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIExPV0VSICsgMjZcblx0fVxuXG5cdGZ1bmN0aW9uIGI2NFRvQnl0ZUFycmF5IChiNjQpIHtcblx0XHR2YXIgaSwgaiwgbCwgdG1wLCBwbGFjZUhvbGRlcnMsIGFyclxuXG5cdFx0aWYgKGI2NC5sZW5ndGggJSA0ID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0Jylcblx0XHR9XG5cblx0XHQvLyB0aGUgbnVtYmVyIG9mIGVxdWFsIHNpZ25zIChwbGFjZSBob2xkZXJzKVxuXHRcdC8vIGlmIHRoZXJlIGFyZSB0d28gcGxhY2Vob2xkZXJzLCB0aGFuIHRoZSB0d28gY2hhcmFjdGVycyBiZWZvcmUgaXRcblx0XHQvLyByZXByZXNlbnQgb25lIGJ5dGVcblx0XHQvLyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgdGhlbiB0aGUgdGhyZWUgY2hhcmFjdGVycyBiZWZvcmUgaXQgcmVwcmVzZW50IDIgYnl0ZXNcblx0XHQvLyB0aGlzIGlzIGp1c3QgYSBjaGVhcCBoYWNrIHRvIG5vdCBkbyBpbmRleE9mIHR3aWNlXG5cdFx0dmFyIGxlbiA9IGI2NC5sZW5ndGhcblx0XHRwbGFjZUhvbGRlcnMgPSAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMikgPyAyIDogJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDEpID8gMSA6IDBcblxuXHRcdC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuXHRcdGFyciA9IG5ldyBBcnIoYjY0Lmxlbmd0aCAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKVxuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHBsYWNlaG9sZGVycywgb25seSBnZXQgdXAgdG8gdGhlIGxhc3QgY29tcGxldGUgNCBjaGFyc1xuXHRcdGwgPSBwbGFjZUhvbGRlcnMgPiAwID8gYjY0Lmxlbmd0aCAtIDQgOiBiNjQubGVuZ3RoXG5cblx0XHR2YXIgTCA9IDBcblxuXHRcdGZ1bmN0aW9uIHB1c2ggKHYpIHtcblx0XHRcdGFycltMKytdID0gdlxuXHRcdH1cblxuXHRcdGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbDsgaSArPSA0LCBqICs9IDMpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTgpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgMTIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPDwgNikgfCBkZWNvZGUoYjY0LmNoYXJBdChpICsgMykpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDAwMCkgPj4gMTYpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDApID4+IDgpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpID4+IDQpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fSBlbHNlIGlmIChwbGFjZUhvbGRlcnMgPT09IDEpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTApIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgNCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA+PiAyKVxuXHRcdFx0cHVzaCgodG1wID4+IDgpICYgMHhGRilcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJyXG5cdH1cblxuXHRmdW5jdGlvbiB1aW50OFRvQmFzZTY0ICh1aW50OCkge1xuXHRcdHZhciBpLFxuXHRcdFx0ZXh0cmFCeXRlcyA9IHVpbnQ4Lmxlbmd0aCAlIDMsIC8vIGlmIHdlIGhhdmUgMSBieXRlIGxlZnQsIHBhZCAyIGJ5dGVzXG5cdFx0XHRvdXRwdXQgPSBcIlwiLFxuXHRcdFx0dGVtcCwgbGVuZ3RoXG5cblx0XHRmdW5jdGlvbiBlbmNvZGUgKG51bSkge1xuXHRcdFx0cmV0dXJuIGxvb2t1cC5jaGFyQXQobnVtKVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRyaXBsZXRUb0Jhc2U2NCAobnVtKSB7XG5cdFx0XHRyZXR1cm4gZW5jb2RlKG51bSA+PiAxOCAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiAxMiAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiA2ICYgMHgzRikgKyBlbmNvZGUobnVtICYgMHgzRilcblx0XHR9XG5cblx0XHQvLyBnbyB0aHJvdWdoIHRoZSBhcnJheSBldmVyeSB0aHJlZSBieXRlcywgd2UnbGwgZGVhbCB3aXRoIHRyYWlsaW5nIHN0dWZmIGxhdGVyXG5cdFx0Zm9yIChpID0gMCwgbGVuZ3RoID0gdWludDgubGVuZ3RoIC0gZXh0cmFCeXRlczsgaSA8IGxlbmd0aDsgaSArPSAzKSB7XG5cdFx0XHR0ZW1wID0gKHVpbnQ4W2ldIDw8IDE2KSArICh1aW50OFtpICsgMV0gPDwgOCkgKyAodWludDhbaSArIDJdKVxuXHRcdFx0b3V0cHV0ICs9IHRyaXBsZXRUb0Jhc2U2NCh0ZW1wKVxuXHRcdH1cblxuXHRcdC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcblx0XHRzd2l0Y2ggKGV4dHJhQnl0ZXMpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0dGVtcCA9IHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAyKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9PSdcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgMjpcblx0XHRcdFx0dGVtcCA9ICh1aW50OFt1aW50OC5sZW5ndGggLSAyXSA8PCA4KSArICh1aW50OFt1aW50OC5sZW5ndGggLSAxXSlcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDEwKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wID4+IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCAyKSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPSdcblx0XHRcdFx0YnJlYWtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0XG5cdH1cblxuXHRtb2R1bGUuZXhwb3J0cy50b0J5dGVBcnJheSA9IGI2NFRvQnl0ZUFycmF5XG5cdG1vZHVsZS5leHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KCkpXG4iLCJleHBvcnRzLnJlYWQgPSBmdW5jdGlvbihidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIG5CaXRzID0gLTcsXG4gICAgICBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDAsXG4gICAgICBkID0gaXNMRSA/IC0xIDogMSxcbiAgICAgIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV07XG5cbiAgaSArPSBkO1xuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBzID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gZUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIGUgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBtTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBpZiAoZSA9PT0gMCkge1xuICAgIGUgPSAxIC0gZUJpYXM7XG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KTtcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pO1xuICAgIGUgPSBlIC0gZUJpYXM7XG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbik7XG59O1xuXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGMsXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApLFxuICAgICAgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpLFxuICAgICAgZCA9IGlzTEUgPyAxIDogLTEsXG4gICAgICBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwO1xuXG4gIHZhbHVlID0gTWF0aC5hYnModmFsdWUpO1xuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwO1xuICAgIGUgPSBlTWF4O1xuICB9IGVsc2Uge1xuICAgIGUgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKTtcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS07XG4gICAgICBjICo9IDI7XG4gICAgfVxuICAgIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgdmFsdWUgKz0gcnQgLyBjO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcyk7XG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrO1xuICAgICAgYyAvPSAyO1xuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDA7XG4gICAgICBlID0gZU1heDtcbiAgICB9IGVsc2UgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICBtID0gKHZhbHVlICogYyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gZSArIGVCaWFzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gMDtcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KTtcblxuICBlID0gKGUgPDwgbUxlbikgfCBtO1xuICBlTGVuICs9IG1MZW47XG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCk7XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4O1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID1cclxuXHJcbiAgZmlyc3Q6IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFlvdXIgZmlyc3QgTG9vcFNjcmlwdC4gU29tZWRheSB0aGVyZSB3aWxsIGJlIGRvY3VtZW50YXRpb24hXHJcblxyXG50b25lIG5vdGUxXHJcbiAgZHVyYXRpb24gMjUwXHJcbiAgb2N0YXZlIDRcclxuICBub3RlIENcclxuXHJcbnRvbmUgYmFzczFcclxuICBkdXJhdGlvbiAyNTBcclxuICBvY3RhdmUgMVxyXG4gIG5vdGUgQlxyXG5cclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gbm90ZTEgeC4uLi4uLi54Li4uLi4uLlxyXG4gIHBhdHRlcm4gYmFzczEgLi4uLnguLi4uLi4ueC4uLlxyXG5cclxuXCJcIlwiXHJcblxyXG4gIG5vdGVzOiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBOb3RlIG92ZXJyaWRlcyFcclxuXHJcbiMgVHJ5IHNldHRpbmcgdGhlIGR1cmF0aW9uIHRvIDEwMFxyXG50b25lIG5vdGUxXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgZHVyYXRpb24gMjUwXHJcblxyXG4jIElmIHlvdSB1c2UgYW55IGxldHRlcnMgb3RoZXIgdGhhbiBcInhcIiBvbiBhIHRvbmUgcGF0dGVybiwgeW91IG92ZXJyaWRlIGl0c1xyXG4jIG5vdGUgd2l0aCB0aGUgbm90ZSBsaXN0ZWQuXHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBub3RlMSBiLmEuZy5hLmIuYi5iLlxyXG5cclxuXCJcIlwiXHJcblxyXG4gIG1vdHRvOiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBbiBhcHByb3hpbWF0aW9uIG9mIHRoZSBiZWF0IGZyb20gRHJha2UncyBcIlRoZSBNb3R0b1wiXHJcblxyXG5icG0gMTAwXHJcblxyXG5zZWN0aW9uIEJhc3MgKGluIGEgc2VjdGlvbiB0byBzaGFyZSBBRFNSKVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG4gIHRvbmUgYmFzczFcclxuICAgIG9jdGF2ZSAxXHJcbiAgdG9uZSBiYXNzMlxyXG4gICAgb2N0YXZlIDJcclxuXHJcbnNhbXBsZSBjbGFwXHJcbiAgc3JjIHNhbXBsZXMvY2xhcC53YXZcclxuc2FtcGxlIHNuYXJlXHJcbiAgc3JjIHNhbXBsZXMvc25hcmUud2F2XHJcbnNhbXBsZSBoaWhhdFxyXG4gIHNyYyBzYW1wbGVzL2hpaGF0LndhdlxyXG5cclxuIyBUT0RPOiBmaXggc25hcmUgcGF0dGVybiB0byBtYXRjaCBzb25nXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIGhpaGF0IC4ueC4uLi4uLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uXHJcbiAgcGF0dGVybiBjbGFwICAuLi4ueC4uLi4uLi54Li4uLi4uLnguLi4uLi4ueC4uLlxyXG4gIHBhdHRlcm4gc25hcmUgLi4uLi4ueC4uLnguLi54LnguLi4uLi4uLi4uLi4uLi5cclxuICBwYXR0ZXJuIGJhc3MxIEJiYmJiYi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcbiAgcGF0dGVybiBiYXNzMiAuLi4uLi5IaGhoaGhEZGRkZGQuLi4uSGhoaEpqLkpqLlxyXG5cclxudHJhY2sgc29uZ1xyXG4gIHBhdHRlcm4gbG9vcDEgeHh4eFxyXG5cclxuXCJcIlwiXHJcblxyXG4gIGxlbmd0aDogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgU2hvd2luZyBvZmYgdmFyaW91cyBub3RlIGxlbmd0aHMgdXNpbmcgY2FwcyBhbmQgbG93ZXJjYXNlXHJcbiMgQWxzbyBzaG93cyB3aGF0IEFEU1IgY2FuIGRvIVxyXG5cclxudG9uZSBub3RlMVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG5cclxudG9uZSBub3RlMlxyXG4gICMgTm90ZTogT25seSB0aGUgZmlyc3QgdG9uZSBoYXMgQURTUlxyXG5cclxuIyBJZiB5b3UgdXNlIGFueSBsZXR0ZXJzIG90aGVyIHRoYW4gXCJ4XCIgb24gYSB0b25lIHBhdHRlcm4sIHlvdSBvdmVycmlkZSBpdHNcclxuIyBub3RlIHdpdGggdGhlIG5vdGUgbGlzdGVkLiBBbHNvLCBpZiB5b3UgdXNlIGFueSBjYXBpdGFsIGxldHRlcnMgaW4gYSBwYXR0ZXJuLFxyXG4jIHlvdSBvdmVycmlkZSB0aGUgbGVuZ3RoIG9mIHRoYXQgbm90ZSB3aXRoIHRoZSBudW1iZXIgb2YgbWF0Y2hpbmcgbG93ZXJjYXNlXHJcbiMgbGV0dGVycyBmb2xsb3dpbmcgaXQuXHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBub3RlMSBHZ2dnZ2dnZ0ZmZmZmZi4uQWFhYUJiYi5DYy4uRC4uLlxyXG5cclxubG9vcCBsb29wMlxyXG4gIHBhdHRlcm4gbm90ZTIgR2dnZ2dnZ2dGZmZmZmYuLkFhYWFCYmIuQ2MuLkQuLi5cclxuXHJcbnRyYWNrIHNvbmdcclxuICBwYXR0ZXJuIGxvb3AxIHguXHJcbiAgcGF0dGVybiBsb29wMiAueFxyXG5cclxuXCJcIlwiXHJcbiIsImZyZXFUYWJsZSA9IFtcclxuICB7ICMgT2N0YXZlIDBcclxuXHJcbiAgICBcImFcIjogMjcuNTAwMFxyXG4gICAgXCJsXCI6IDI5LjEzNTNcclxuICAgIFwiYlwiOiAzMC44Njc3XHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDFcclxuICAgIFwiY1wiOiAzMi43MDMyXHJcbiAgICBcImhcIjogMzQuNjQ3OVxyXG4gICAgXCJkXCI6IDM2LjcwODFcclxuICAgIFwiaVwiOiAzOC44OTA5XHJcbiAgICBcImVcIjogNDEuMjAzNVxyXG4gICAgXCJmXCI6IDQzLjY1MzZcclxuICAgIFwialwiOiA0Ni4yNDkzXHJcbiAgICBcImdcIjogNDguOTk5NVxyXG4gICAgXCJrXCI6IDUxLjkxMzBcclxuICAgIFwiYVwiOiA1NS4wMDAwXHJcbiAgICBcImxcIjogNTguMjcwNVxyXG4gICAgXCJiXCI6IDYxLjczNTRcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgMlxyXG4gICAgXCJjXCI6IDY1LjQwNjRcclxuICAgIFwiaFwiOiA2OS4yOTU3XHJcbiAgICBcImRcIjogNzMuNDE2MlxyXG4gICAgXCJpXCI6IDc3Ljc4MTdcclxuICAgIFwiZVwiOiA4Mi40MDY5XHJcbiAgICBcImZcIjogODcuMzA3MVxyXG4gICAgXCJqXCI6IDkyLjQ5ODZcclxuICAgIFwiZ1wiOiA5Ny45OTg5XHJcbiAgICBcImtcIjogMTAzLjgyNlxyXG4gICAgXCJhXCI6IDExMC4wMDBcclxuICAgIFwibFwiOiAxMTYuNTQxXHJcbiAgICBcImJcIjogMTIzLjQ3MVxyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSAzXHJcbiAgICBcImNcIjogMTMwLjgxM1xyXG4gICAgXCJoXCI6IDEzOC41OTFcclxuICAgIFwiZFwiOiAxNDYuODMyXHJcbiAgICBcImlcIjogMTU1LjU2M1xyXG4gICAgXCJlXCI6IDE2NC44MTRcclxuICAgIFwiZlwiOiAxNzQuNjE0XHJcbiAgICBcImpcIjogMTg0Ljk5N1xyXG4gICAgXCJnXCI6IDE5NS45OThcclxuICAgIFwia1wiOiAyMDcuNjUyXHJcbiAgICBcImFcIjogMjIwLjAwMFxyXG4gICAgXCJsXCI6IDIzMy4wODJcclxuICAgIFwiYlwiOiAyNDYuOTQyXHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDRcclxuICAgIFwiY1wiOiAyNjEuNjI2XHJcbiAgICBcImhcIjogMjc3LjE4M1xyXG4gICAgXCJkXCI6IDI5My42NjVcclxuICAgIFwiaVwiOiAzMTEuMTI3XHJcbiAgICBcImVcIjogMzI5LjYyOFxyXG4gICAgXCJmXCI6IDM0OS4yMjhcclxuICAgIFwialwiOiAzNjkuOTk0XHJcbiAgICBcImdcIjogMzkxLjk5NVxyXG4gICAgXCJrXCI6IDQxNS4zMDVcclxuICAgIFwiYVwiOiA0NDAuMDAwXHJcbiAgICBcImxcIjogNDY2LjE2NFxyXG4gICAgXCJiXCI6IDQ5My44ODNcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgNVxyXG4gICAgXCJjXCI6IDUyMy4yNTFcclxuICAgIFwiaFwiOiA1NTQuMzY1XHJcbiAgICBcImRcIjogNTg3LjMzMFxyXG4gICAgXCJpXCI6IDYyMi4yNTRcclxuICAgIFwiZVwiOiA2NTkuMjU1XHJcbiAgICBcImZcIjogNjk4LjQ1NlxyXG4gICAgXCJqXCI6IDczOS45ODlcclxuICAgIFwiZ1wiOiA3ODMuOTkxXHJcbiAgICBcImtcIjogODMwLjYwOVxyXG4gICAgXCJhXCI6IDg4MC4wMDBcclxuICAgIFwibFwiOiA5MzIuMzI4XHJcbiAgICBcImJcIjogOTg3Ljc2N1xyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSA2XHJcbiAgICBcImNcIjogMTA0Ni41MFxyXG4gICAgXCJoXCI6IDExMDguNzNcclxuICAgIFwiZFwiOiAxMTc0LjY2XHJcbiAgICBcImlcIjogMTI0NC41MVxyXG4gICAgXCJlXCI6IDEzMTguNTFcclxuICAgIFwiZlwiOiAxMzk2LjkxXHJcbiAgICBcImpcIjogMTQ3OS45OFxyXG4gICAgXCJnXCI6IDE1NjcuOThcclxuICAgIFwia1wiOiAxNjYxLjIyXHJcbiAgICBcImFcIjogMTc2MC4wMFxyXG4gICAgXCJsXCI6IDE4NjQuNjZcclxuICAgIFwiYlwiOiAxOTc1LjUzXHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDdcclxuICAgIFwiY1wiOiAyMDkzLjAwXHJcbiAgICBcImhcIjogMjIxNy40NlxyXG4gICAgXCJkXCI6IDIzNDkuMzJcclxuICAgIFwiaVwiOiAyNDg5LjAyXHJcbiAgICBcImVcIjogMjYzNy4wMlxyXG4gICAgXCJmXCI6IDI3OTMuODNcclxuICAgIFwialwiOiAyOTU5Ljk2XHJcbiAgICBcImdcIjogMzEzNS45NlxyXG4gICAgXCJrXCI6IDMzMjIuNDRcclxuICAgIFwiYVwiOiAzNTIwLjAwXHJcbiAgICBcImxcIjogMzcyOS4zMVxyXG4gICAgXCJiXCI6IDM5NTEuMDdcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgOFxyXG4gICAgXCJjXCI6IDQxODYuMDFcclxuICB9XHJcbl1cclxuXHJcbmxlZ2FsTm90ZVJlZ2V4ID0gL1thLWxdL1xyXG5cclxuZmluZEZyZXEgPSAob2N0YXZlLCBub3RlKSAtPlxyXG4gIG5vdGUgPSBub3RlLnRvTG93ZXJDYXNlKClcclxuICBpZiAob2N0YXZlID49IDApIGFuZCAob2N0YXZlIDwgZnJlcVRhYmxlLmxlbmd0aCkgYW5kIGxlZ2FsTm90ZVJlZ2V4LnRlc3Qobm90ZSlcclxuICAgIG9jdGF2ZVRhYmxlID0gZnJlcVRhYmxlW29jdGF2ZV1cclxuICAgIGlmIG9jdGF2ZVRhYmxlPyBhbmQgb2N0YXZlVGFibGVbbm90ZV0/XHJcbiAgICAgIHJldHVybiBvY3RhdmVUYWJsZVtub3RlXVxyXG4gIHJldHVybiA0NDAuMFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPVxyXG4gIGZyZXFUYWJsZTogZnJlcVRhYmxlXHJcbiAgZmluZEZyZXE6IGZpbmRGcmVxXHJcbiIsIiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEltcG9ydHNcclxuXHJcbnt3cml0ZVdBViwgbWFrZUJsb2JVcmx9ID0gcmVxdWlyZSBcIi4vcmlmZndhdmVcIlxyXG57ZmluZEZyZXF9ICAgICAgICAgICAgICA9IHJlcXVpcmUgJy4vZnJlcSdcclxuZnMgICAgICAgICAgICAgICAgICAgICAgPSByZXF1aXJlICdmcydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEhlbHBlciBmdW5jdGlvbnNcclxuXHJcbmNsb25lID0gKG9iaikgLT5cclxuICBpZiBub3Qgb2JqPyBvciB0eXBlb2Ygb2JqIGlzbnQgJ29iamVjdCdcclxuICAgIHJldHVybiBvYmpcclxuXHJcbiAgaWYgb2JqIGluc3RhbmNlb2YgRGF0ZVxyXG4gICAgcmV0dXJuIG5ldyBEYXRlKG9iai5nZXRUaW1lKCkpXHJcblxyXG4gIGlmIG9iaiBpbnN0YW5jZW9mIFJlZ0V4cFxyXG4gICAgZmxhZ3MgPSAnJ1xyXG4gICAgZmxhZ3MgKz0gJ2cnIGlmIG9iai5nbG9iYWw/XHJcbiAgICBmbGFncyArPSAnaScgaWYgb2JqLmlnbm9yZUNhc2U/XHJcbiAgICBmbGFncyArPSAnbScgaWYgb2JqLm11bHRpbGluZT9cclxuICAgIGZsYWdzICs9ICd5JyBpZiBvYmouc3RpY2t5P1xyXG4gICAgcmV0dXJuIG5ldyBSZWdFeHAob2JqLnNvdXJjZSwgZmxhZ3MpXHJcblxyXG4gIG5ld0luc3RhbmNlID0gbmV3IG9iai5jb25zdHJ1Y3RvcigpXHJcblxyXG4gIGZvciBrZXkgb2Ygb2JqXHJcbiAgICBuZXdJbnN0YW5jZVtrZXldID0gY2xvbmUgb2JqW2tleV1cclxuXHJcbiAgcmV0dXJuIG5ld0luc3RhbmNlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBJbmRlbnRTdGFjayAtIHVzZWQgYnkgUGFyc2VyXHJcblxyXG5jbGFzcyBJbmRlbnRTdGFja1xyXG4gIGNvbnN0cnVjdG9yOiAtPlxyXG4gICAgQHN0YWNrID0gWzBdXHJcblxyXG4gIHB1c2g6IChpbmRlbnQpIC0+XHJcbiAgICBAc3RhY2sucHVzaCBpbmRlbnRcclxuXHJcbiAgcG9wOiAtPlxyXG4gICAgaWYgQHN0YWNrLmxlbmd0aCA+IDFcclxuICAgICAgQHN0YWNrLnBvcCgpXHJcbiAgICAgIHJldHVybiB0cnVlXHJcbiAgICByZXR1cm4gZmFsc2VcclxuXHJcbiAgdG9wOiAtPlxyXG4gICAgcmV0dXJuIEBzdGFja1tAc3RhY2subGVuZ3RoIC0gMV1cclxuXHJcbmNvdW50SW5kZW50ID0gKHRleHQpIC0+XHJcbiAgaW5kZW50ID0gMFxyXG4gIGZvciBpIGluIFswLi4udGV4dC5sZW5ndGhdXHJcbiAgICBpZiB0ZXh0W2ldID09ICdcXHQnXHJcbiAgICAgIGluZGVudCArPSA4XHJcbiAgICBlbHNlXHJcbiAgICAgIGluZGVudCsrXHJcbiAgcmV0dXJuIGluZGVudFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgUGFyc2VyXHJcblxyXG5jbGFzcyBQYXJzZXJcclxuICBjb25zdHJ1Y3RvcjogKEBsb2cpIC0+XHJcbiAgICBAY29tbWVudFJlZ2V4ID0gL14oW14jXSo/KShcXHMqIy4qKT8kL1xyXG4gICAgQG9ubHlXaGl0ZXNwYWNlUmVnZXggPSAvXlxccyokL1xyXG4gICAgQGluZGVudFJlZ2V4ID0gL14oXFxzKikoXFxTLiopJC9cclxuICAgIEBsZWFkaW5nVW5kZXJzY29yZVJlZ2V4ID0gL15fL1xyXG4gICAgQGhhc0NhcGl0YWxMZXR0ZXJzUmVnZXggPSAvW0EtWl0vXHJcbiAgICBAaXNOb3RlUmVnZXggPSAvW0EtTGEtbF0vXHJcblxyXG4gICAgIyBILUwgYXJlIHRoZSBibGFjayBrZXlzOlxyXG4gICAgIyAgSCBJICAgSiBLIExcclxuICAgICMgQyBEIEUgRiBHIEEgQlxyXG5cclxuICAgIEBuYW1lZFN0YXRlcyA9XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgd2F2ZTogJ3NpbmUnXHJcbiAgICAgICAgYnBtOiAxMjBcclxuICAgICAgICBkdXJhdGlvbjogMjAwXHJcbiAgICAgICAgYmVhdHM6IDRcclxuICAgICAgICBvY3RhdmU6IDRcclxuICAgICAgICBub3RlOiAnYSdcclxuICAgICAgICB2b2x1bWU6IDEuMFxyXG4gICAgICAgIGFkc3I6ICMgbm8tb3AgQURTUiAoZnVsbCAxLjAgc3VzdGFpbilcclxuICAgICAgICAgIGE6IDBcclxuICAgICAgICAgIGQ6IDBcclxuICAgICAgICAgIHM6IDFcclxuICAgICAgICAgIHI6IDFcclxuXHJcbiAgICAjIGlmIGEga2V5IGlzIHByZXNlbnQgaW4gdGhpcyBtYXAsIHRoYXQgbmFtZSBpcyBjb25zaWRlcmVkIGFuIFwib2JqZWN0XCJcclxuICAgIEBvYmplY3RLZXlzID1cclxuICAgICAgdG9uZTpcclxuICAgICAgICB3YXZlOiAnc3RyaW5nJ1xyXG4gICAgICAgIGZyZXE6ICdmbG9hdCdcclxuICAgICAgICBkdXJhdGlvbjogJ2Zsb2F0J1xyXG4gICAgICAgIGFkc3I6ICdhZHNyJ1xyXG4gICAgICAgIG9jdGF2ZTogJ2ludCdcclxuICAgICAgICBub3RlOiAnc3RyaW5nJ1xyXG4gICAgICAgIHZvbHVtZTogJ2Zsb2F0J1xyXG5cclxuICAgICAgc2FtcGxlOlxyXG4gICAgICAgIHNyYzogJ3N0cmluZydcclxuICAgICAgICB2b2x1bWU6ICdmbG9hdCdcclxuXHJcbiAgICAgIGxvb3A6XHJcbiAgICAgICAgYnBtOiAnaW50J1xyXG4gICAgICAgIGJlYXRzOiAnaW50J1xyXG5cclxuICAgICAgdHJhY2s6IHt9XHJcblxyXG4gICAgQGluZGVudFN0YWNrID0gbmV3IEluZGVudFN0YWNrXHJcbiAgICBAc3RhdGVTdGFjayA9IFtdXHJcbiAgICBAcmVzZXQgJ2RlZmF1bHQnXHJcbiAgICBAb2JqZWN0cyA9IHt9XHJcbiAgICBAb2JqZWN0ID0gbnVsbFxyXG4gICAgQG9iamVjdFNjb3BlUmVhZHkgPSBmYWxzZVxyXG5cclxuICBpc09iamVjdFR5cGU6ICh0eXBlKSAtPlxyXG4gICAgcmV0dXJuIEBvYmplY3RLZXlzW3R5cGVdP1xyXG5cclxuICBlcnJvcjogKHRleHQpIC0+XHJcbiAgICBAbG9nIFwiUEFSU0UgRVJST1IsIGxpbmUgI3tAbGluZU5vfTogI3t0ZXh0fVwiXHJcblxyXG4gIHJlc2V0OiAobmFtZSkgLT5cclxuICAgIG5hbWUgPz0gJ2RlZmF1bHQnXHJcbiAgICBpZiBub3QgQG5hbWVkU3RhdGVzW25hbWVdXHJcbiAgICAgIEBlcnJvciBcImludmFsaWQgcmVzZXQgbmFtZTogI3tuYW1lfVwiXHJcbiAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgQHN0YXRlU3RhY2sucHVzaCBjbG9uZShAbmFtZWRTdGF0ZXNbbmFtZV0pXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuICBmbGF0dGVuOiAoKSAtPlxyXG4gICAgZmxhdHRlbmVkU3RhdGUgPSB7fVxyXG4gICAgZm9yIHN0YXRlIGluIEBzdGF0ZVN0YWNrXHJcbiAgICAgIGZvciBrZXkgb2Ygc3RhdGVcclxuICAgICAgICBmbGF0dGVuZWRTdGF0ZVtrZXldID0gc3RhdGVba2V5XVxyXG4gICAgcmV0dXJuIGZsYXR0ZW5lZFN0YXRlXHJcblxyXG4gIHRyYWNlOiAocHJlZml4KSAtPlxyXG4gICAgcHJlZml4ID89ICcnXHJcbiAgICBAbG9nIFwidHJhY2U6ICN7cHJlZml4fSBcIiArIEpTT04uc3RyaW5naWZ5KEBmbGF0dGVuKCkpXHJcblxyXG4gIGNyZWF0ZU9iamVjdDogKGRhdGEuLi4pIC0+XHJcbiAgICAgIEBmaW5pc2hPYmplY3QoKVxyXG5cclxuICAgICAgQG9iamVjdCA9IHt9XHJcbiAgICAgIGZvciBpIGluIFswLi4uZGF0YS5sZW5ndGhdIGJ5IDJcclxuICAgICAgICBAb2JqZWN0W2RhdGFbaV1dID0gZGF0YVtpKzFdXHJcbiAgICAgIEBvYmplY3RTY29wZVJlYWR5ID0gdHJ1ZVxyXG5cclxuICAgICAgaWYgQG9iamVjdC5fdHlwZSA9PSAnbG9vcCdcclxuICAgICAgICBAb2JqZWN0Ll9wYXR0ZXJucyA9IFtdXHJcblxyXG4gICAgICBpZiBAb2JqZWN0Ll90eXBlID09ICd0cmFjaydcclxuICAgICAgICBAb2JqZWN0Ll9wYXR0ZXJucyA9IFtdXHJcblxyXG4gICAgICBpZiBAb2JqZWN0Ll9uYW1lXHJcbiAgICAgICAgQGxhc3RPYmplY3QgPSBAb2JqZWN0Ll9uYW1lXHJcblxyXG4gIGZpbmlzaE9iamVjdDogLT5cclxuICAgIGlmIEBvYmplY3RcclxuICAgICAgc3RhdGUgPSBAZmxhdHRlbigpXHJcbiAgICAgIGZvciBrZXkgb2YgQG9iamVjdEtleXNbQG9iamVjdC5fdHlwZV1cclxuICAgICAgICBleHBlY3RlZFR5cGUgPSBAb2JqZWN0S2V5c1tAb2JqZWN0Ll90eXBlXVtrZXldXHJcbiAgICAgICAgaWYgc3RhdGVba2V5XT9cclxuICAgICAgICAgIHYgPSBzdGF0ZVtrZXldXHJcbiAgICAgICAgICBAb2JqZWN0W2tleV0gPSBzd2l0Y2ggZXhwZWN0ZWRUeXBlXHJcbiAgICAgICAgICAgIHdoZW4gJ2ludCcgdGhlbiBwYXJzZUludCh2KVxyXG4gICAgICAgICAgICB3aGVuICdmbG9hdCcgdGhlbiBwYXJzZUZsb2F0KHYpXHJcbiAgICAgICAgICAgIGVsc2UgdlxyXG4gICAgICBAb2JqZWN0c1tAb2JqZWN0Ll9uYW1lXSA9IEBvYmplY3RcclxuICAgIEBvYmplY3QgPSBudWxsXHJcblxyXG4gIGNyZWF0aW5nT2JqZWN0VHlwZTogKHR5cGUpIC0+XHJcbiAgICByZXR1cm4gZmFsc2UgaWYgbm90IEBvYmplY3RcclxuICAgIHJldHVybiBmYWxzZSBpZiBub3QgQG9iamVjdC5fdHlwZSA9PSB0eXBlXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuICBwdXNoU2NvcGU6IC0+XHJcbiAgICBpZiBub3QgQG9iamVjdFNjb3BlUmVhZHlcclxuICAgICAgQGVycm9yIFwidW5leHBlY3RlZCBpbmRlbnRcIlxyXG4gICAgICByZXR1cm4gZmFsc2VcclxuICAgIEBvYmplY3RTY29wZVJlYWR5ID0gZmFsc2VcclxuICAgIEBzdGF0ZVN0YWNrLnB1c2ggeyBfc2NvcGU6IHRydWUgfVxyXG4gICAgcmV0dXJuIHRydWVcclxuXHJcbiAgcG9wU2NvcGU6IC0+XHJcbiAgICBAZmluaXNoT2JqZWN0KClcclxuICAgIGxvb3BcclxuICAgICAgaWYgQHN0YXRlU3RhY2subGVuZ3RoID09IDBcclxuICAgICAgICBAZXJyb3IgXCJzdGF0ZSBzdGFjayBpcyBlbXB0eSEgc29tZXRoaW5nIGJhZCBoYXMgaGFwcGVuZWRcIlxyXG4gICAgICB0b3AgPSBAc3RhdGVTdGFja1tAc3RhdGVTdGFjay5sZW5ndGggLSAxXVxyXG4gICAgICBicmVhayBpZiB0b3AuX3Njb3BlP1xyXG4gICAgICBAc3RhdGVTdGFjay5wb3AoKVxyXG4gICAgQHN0YXRlU3RhY2sucG9wKClcclxuICAgIHJldHVybiB0cnVlXHJcblxyXG4gIHBhcnNlUGF0dGVybjogKHBhdHRlcm4pIC0+XHJcbiAgICBvdmVycmlkZUxlbmd0aCA9IEBoYXNDYXBpdGFsTGV0dGVyc1JlZ2V4LnRlc3QocGF0dGVybilcclxuICAgIGkgPSAwXHJcbiAgICBzb3VuZHMgPSBbXVxyXG4gICAgd2hpbGUgaSA8IHBhdHRlcm4ubGVuZ3RoXHJcbiAgICAgIGMgPSBwYXR0ZXJuW2ldXHJcbiAgICAgIGlmIGMgIT0gJy4nXHJcbiAgICAgICAgc3ltYm9sID0gYy50b0xvd2VyQ2FzZSgpXHJcbiAgICAgICAgc291bmQgPSB7IG9mZnNldDogaSB9XHJcbiAgICAgICAgaWYgQGlzTm90ZVJlZ2V4LnRlc3QoYylcclxuICAgICAgICAgIHNvdW5kLm5vdGUgPSBzeW1ib2xcclxuICAgICAgICBpZiBvdmVycmlkZUxlbmd0aFxyXG4gICAgICAgICAgbGVuZ3RoID0gMVxyXG4gICAgICAgICAgbG9vcFxyXG4gICAgICAgICAgICBuZXh0ID0gcGF0dGVybltpKzFdXHJcbiAgICAgICAgICAgIGlmIG5leHQgPT0gc3ltYm9sXHJcbiAgICAgICAgICAgICAgbGVuZ3RoKytcclxuICAgICAgICAgICAgICBpKytcclxuICAgICAgICAgICAgICBpZiBpID09IHBhdHRlcm4ubGVuZ3RoXHJcbiAgICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgIHNvdW5kLmxlbmd0aCA9IGxlbmd0aFxyXG4gICAgICAgIHNvdW5kcy5wdXNoIHNvdW5kXHJcbiAgICAgIGkrK1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgbGVuZ3RoOiBwYXR0ZXJuLmxlbmd0aFxyXG4gICAgICBzb3VuZHM6IHNvdW5kc1xyXG4gICAgfVxyXG5cclxuICBwcm9jZXNzVG9rZW5zOiAodG9rZW5zKSAtPlxyXG4gICAgY21kID0gdG9rZW5zWzBdLnRvTG93ZXJDYXNlKClcclxuICAgIGlmIGNtZCA9PSAncmVzZXQnXHJcbiAgICAgIGlmIG5vdCBAcmVzZXQodG9rZW5zWzFdKVxyXG4gICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgZWxzZSBpZiBjbWQgPT0gJ3NlY3Rpb24nXHJcbiAgICAgIEBvYmplY3RTY29wZVJlYWR5ID0gdHJ1ZVxyXG4gICAgZWxzZSBpZiBAaXNPYmplY3RUeXBlKGNtZClcclxuICAgICAgQGNyZWF0ZU9iamVjdCAnX3R5cGUnLCBjbWQsICdfbmFtZScsIHRva2Vuc1sxXVxyXG4gICAgZWxzZSBpZiBjbWQgPT0gJ3BhdHRlcm4nXHJcbiAgICAgIGlmIG5vdCAoQGNyZWF0aW5nT2JqZWN0VHlwZSgnbG9vcCcpIG9yIEBjcmVhdGluZ09iamVjdFR5cGUoJ3RyYWNrJykpXHJcbiAgICAgICAgQGVycm9yIFwidW5leHBlY3RlZCBwYXR0ZXJuIGNvbW1hbmRcIlxyXG4gICAgICAgIHJldHVybiBmYWxzZVxyXG5cclxuICAgICAgcGF0dGVybiA9IEBwYXJzZVBhdHRlcm4odG9rZW5zWzJdKVxyXG4gICAgICBwYXR0ZXJuLnNyYyA9IHRva2Vuc1sxXVxyXG4gICAgICBAb2JqZWN0Ll9wYXR0ZXJucy5wdXNoIHBhdHRlcm5cclxuICAgIGVsc2UgaWYgY21kID09ICdhZHNyJ1xyXG4gICAgICBAc3RhdGVTdGFja1tAc3RhdGVTdGFjay5sZW5ndGggLSAxXVtjbWRdID1cclxuICAgICAgICBhOiBwYXJzZUZsb2F0KHRva2Vuc1sxXSlcclxuICAgICAgICBkOiBwYXJzZUZsb2F0KHRva2Vuc1syXSlcclxuICAgICAgICBzOiBwYXJzZUZsb2F0KHRva2Vuc1szXSlcclxuICAgICAgICByOiBwYXJzZUZsb2F0KHRva2Vuc1s0XSlcclxuICAgIGVsc2VcclxuICAgICAgIyBUaGUgYm9yaW5nIHJlZ3VsYXIgY2FzZTogc3Rhc2ggb2ZmIHRoaXMgdmFsdWVcclxuICAgICAgaWYgQGxlYWRpbmdVbmRlcnNjb3JlUmVnZXgudGVzdChjbWQpXHJcbiAgICAgICAgQGVycm9yIFwiY2Fubm90IHNldCBpbnRlcm5hbCBuYW1lcyAodW5kZXJzY29yZSBwcmVmaXgpXCJcclxuICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgQHN0YXRlU3RhY2tbQHN0YXRlU3RhY2subGVuZ3RoIC0gMV1bY21kXSA9IHRva2Vuc1sxXVxyXG5cclxuICAgIHJldHVybiB0cnVlXHJcblxyXG4gIHBhcnNlOiAodGV4dCkgLT5cclxuICAgIGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJylcclxuICAgIEBsaW5lTm8gPSAwXHJcbiAgICBmb3IgbGluZSBpbiBsaW5lc1xyXG4gICAgICBAbGluZU5vKytcclxuICAgICAgbGluZSA9IGxpbmUucmVwbGFjZSgvKFxcclxcbnxcXG58XFxyKS9nbSxcIlwiKSAjIHN0cmlwIG5ld2xpbmVzXHJcbiAgICAgIGxpbmUgPSBAY29tbWVudFJlZ2V4LmV4ZWMobGluZSlbMV0gICAgICAgICMgc3RyaXAgY29tbWVudHMgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2VcclxuICAgICAgY29udGludWUgaWYgQG9ubHlXaGl0ZXNwYWNlUmVnZXgudGVzdChsaW5lKVxyXG4gICAgICBbXywgaW5kZW50VGV4dCwgbGluZV0gPSBAaW5kZW50UmVnZXguZXhlYyBsaW5lXHJcbiAgICAgIGluZGVudCA9IGNvdW50SW5kZW50IGluZGVudFRleHRcclxuXHJcbiAgICAgIHRvcEluZGVudCA9IEBpbmRlbnRTdGFjay50b3AoKVxyXG4gICAgICBpZiBpbmRlbnQgPT0gdG9wSW5kZW50XHJcbiAgICAgICAgIyBkbyBub3RoaW5nXHJcbiAgICAgIGVsc2UgaWYgaW5kZW50ID4gdG9wSW5kZW50XHJcbiAgICAgICAgQGluZGVudFN0YWNrLnB1c2ggaW5kZW50XHJcbiAgICAgICAgaWYgbm90IEBwdXNoU2NvcGUoKVxyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgIGVsc2VcclxuICAgICAgICBsb29wXHJcbiAgICAgICAgICBpZiBub3QgQGluZGVudFN0YWNrLnBvcCgpXHJcbiAgICAgICAgICAgIEBsb2cgXCJVbmV4cGVjdGVkIGluZGVudCAje2luZGVudH0gb24gbGluZSAje2xpbmVOb306ICN7bGluZX1cIlxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICAgIGlmIG5vdCBAcG9wU2NvcGUoKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICAgIGJyZWFrIGlmIEBpbmRlbnRTdGFjay50b3AoKSA9PSBpbmRlbnRcclxuXHJcbiAgICAgIGlmIG5vdCBAcHJvY2Vzc1Rva2VucyhsaW5lLnNwbGl0KC9cXHMrLykpXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlXHJcblxyXG4gICAgd2hpbGUgQGluZGVudFN0YWNrLnBvcCgpXHJcbiAgICAgIEBwb3BTY29wZSgpXHJcblxyXG4gICAgQGZpbmlzaE9iamVjdCgpXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgUmVuZGVyZXJcclxuXHJcbmNsYXNzIFJlbmRlcmVyXHJcbiAgY29uc3RydWN0b3I6IChAbG9nLCBAc2FtcGxlUmF0ZSwgQHJlYWRMb2NhbEZpbGVzLCBAb2JqZWN0cykgLT5cclxuICAgIEBzYW1wbGVDYWNoZSA9IHt9XHJcblxyXG4gIGVycm9yOiAodGV4dCkgLT5cclxuICAgIEBsb2cgXCJSRU5ERVIgRVJST1I6ICN7dGV4dH1cIlxyXG5cclxuICBnZW5lcmF0ZUVudmVsb3BlOiAoYWRzciwgbGVuZ3RoKSAtPlxyXG4gICAgZW52ZWxvcGUgPSBBcnJheShsZW5ndGgpXHJcbiAgICBBdG9EID0gTWF0aC5mbG9vcihhZHNyLmEgKiBsZW5ndGgpXHJcbiAgICBEdG9TID0gTWF0aC5mbG9vcihhZHNyLmQgKiBsZW5ndGgpXHJcbiAgICBTdG9SID0gTWF0aC5mbG9vcihhZHNyLnIgKiBsZW5ndGgpXHJcbiAgICBhdHRhY2tMZW4gPSBBdG9EXHJcbiAgICBkZWNheUxlbiA9IER0b1MgLSBBdG9EXHJcbiAgICBzdXN0YWluTGVuID0gU3RvUiAtIER0b1NcclxuICAgIHJlbGVhc2VMZW4gPSBsZW5ndGggLSBTdG9SXHJcbiAgICBzdXN0YWluID0gYWRzci5zXHJcbiAgICBwZWFrU3VzdGFpbkRlbHRhID0gMS4wIC0gc3VzdGFpblxyXG4gICAgZm9yIGkgaW4gWzAuLi5hdHRhY2tMZW5dXHJcbiAgICAgICMgQXR0YWNrXHJcbiAgICAgIGVudmVsb3BlW2ldID0gaSAvIGF0dGFja0xlblxyXG4gICAgZm9yIGkgaW4gWzAuLi5kZWNheUxlbl1cclxuICAgICAgIyBEZWNheVxyXG4gICAgICBlbnZlbG9wZVtBdG9EICsgaV0gPSAxLjAgLSAocGVha1N1c3RhaW5EZWx0YSAqIChpIC8gZGVjYXlMZW4pKVxyXG4gICAgZm9yIGkgaW4gWzAuLi5zdXN0YWluTGVuXVxyXG4gICAgICAjIFN1c3RhaW5cclxuICAgICAgZW52ZWxvcGVbRHRvUyArIGldID0gc3VzdGFpblxyXG4gICAgZm9yIGkgaW4gWzAuLi5yZWxlYXNlTGVuXVxyXG4gICAgICAjIFJlbGVhc2VcclxuICAgICAgZW52ZWxvcGVbU3RvUiArIGldID0gc3VzdGFpbiAtIChzdXN0YWluICogKGkgLyByZWxlYXNlTGVuKSlcclxuICAgIHJldHVybiBlbnZlbG9wZVxyXG5cclxuICByZW5kZXJUb25lOiAodG9uZU9iaiwgb3ZlcnJpZGVzKSAtPlxyXG4gICAgb2Zmc2V0ID0gMFxyXG4gICAgYW1wbGl0dWRlID0gMTYwMDBcclxuICAgIGlmIG92ZXJyaWRlcy5sZW5ndGggPiAwXHJcbiAgICAgIGxlbmd0aCA9IG92ZXJyaWRlcy5sZW5ndGhcclxuICAgIGVsc2VcclxuICAgICAgbGVuZ3RoID0gTWF0aC5mbG9vcih0b25lT2JqLmR1cmF0aW9uICogQHNhbXBsZVJhdGUgLyAxMDAwKVxyXG4gICAgc2FtcGxlcyA9IEFycmF5KGxlbmd0aClcclxuICAgIEEgPSAyMDBcclxuICAgIEIgPSAwLjVcclxuICAgIGlmIG92ZXJyaWRlcy5ub3RlP1xyXG4gICAgICBmcmVxID0gZmluZEZyZXEodG9uZU9iai5vY3RhdmUsIG92ZXJyaWRlcy5ub3RlKVxyXG4gICAgZWxzZSBpZiB0b25lT2JqLmZyZXE/XHJcbiAgICAgIGZyZXEgPSB0b25lT2JqLmZyZXFcclxuICAgIGVsc2VcclxuICAgICAgZnJlcSA9IGZpbmRGcmVxKHRvbmVPYmoub2N0YXZlLCB0b25lT2JqLm5vdGUpXHJcbiAgICBlbnZlbG9wZSA9IEBnZW5lcmF0ZUVudmVsb3BlKHRvbmVPYmouYWRzciwgbGVuZ3RoKVxyXG4gICAgZm9yIGkgaW4gWzAuLi5sZW5ndGhdXHJcbiAgICAgIHBlcmlvZCA9IEBzYW1wbGVSYXRlIC8gZnJlcVxyXG4gICAgICBzaW5lID0gTWF0aC5zaW4ob2Zmc2V0ICsgaSAvIHBlcmlvZCAqIDIgKiBNYXRoLlBJKVxyXG4gICAgICAjIGlmKHRvbmVPYmoud2F2ID09IFwic3F1YXJlXCIpXHJcbiAgICAgICMgICBzaW5lID0gKHNpbmUgPiAwKSA/IDEgOiAtMVxyXG4gICAgICBzYW1wbGVzW2ldID0gc2luZSAqIGFtcGxpdHVkZSAqIGVudmVsb3BlW2ldICogdG9uZU9iai52b2x1bWVcclxuICAgIHJldHVybiBzYW1wbGVzXHJcblxyXG4gIHJlbmRlclNhbXBsZTogKHNhbXBsZU9iaikgLT5cclxuICAgIHZpZXcgPSBudWxsXHJcblxyXG4gICAgaWYgQHJlYWRMb2NhbEZpbGVzXHJcbiAgICAgIGlmIG5vdCBqRGF0YVZpZXc/XHJcbiAgICAgICAgakRhdGFWaWV3ID0gcmVxdWlyZSAnLi9qRGF0YVZpZXcnXHJcbiAgICAgIGRhdGEgPSBmcy5yZWFkRmlsZVN5bmMgc2FtcGxlT2JqLnNyY1xyXG4gICAgICB2aWV3ID0gbmV3IGpEYXRhVmlldyhkYXRhLCAwLCBkYXRhLmxlbmd0aCwgdHJ1ZSlcclxuICAgIGVsc2VcclxuICAgICAgJC5hamF4IHtcclxuICAgICAgICB1cmw6IHNhbXBsZU9iai5zcmNcclxuICAgICAgICBtaW1lVHlwZTogJ3RleHQvcGxhaW47IGNoYXJzZXQ9eC11c2VyLWRlZmluZWQnXHJcbiAgICAgICAgc3VjY2VzczogKGRhdGEpIC0+XHJcbiAgICAgICAgICB2aWV3ID0gbmV3IGpEYXRhVmlldyhkYXRhLCAwLCBkYXRhLmxlbmd0aCwgdHJ1ZSlcclxuICAgICAgICBhc3luYzogZmFsc2VcclxuICAgICAgfVxyXG5cclxuICAgIGlmIG5vdCB2aWV3XHJcbiAgICAgIHJldHVybiBbXVxyXG5cclxuICAgICMgY29uc29sZS5sb2cgXCIje3NhbXBsZU9iai5zcmN9IGlzICN7dmlldy5ieXRlTGVuZ3RofSBpbiBzaXplXCJcclxuXHJcbiAgICAjIHNraXAgdGhlIGZpcnN0IDQwIGJ5dGVzXHJcbiAgICB2aWV3LnNlZWsoNDApXHJcbiAgICBzdWJjaHVuazJTaXplID0gdmlldy5nZXRJbnQzMigpXHJcbiAgICAjIGNvbnNvbGUubG9nIFwic3ViY2h1bmsyU2l6ZSBpcyAje3N1YmNodW5rMlNpemV9XCJcclxuXHJcbiAgICBzYW1wbGVzID0gW11cclxuICAgIHdoaWxlIHZpZXcudGVsbCgpKzEgPCB2aWV3LmJ5dGVMZW5ndGhcclxuICAgICAgc2FtcGxlcy5wdXNoIHZpZXcuZ2V0SW50MTYoKVxyXG4gICAgIyBjb25zb2xlLmxvZyBcImxvb3BlZCAje3NhbXBsZXMubGVuZ3RofSB0aW1lc1wiXHJcblxyXG4gICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzLmxlbmd0aF1cclxuICAgICAgc2FtcGxlc1tpXSAqPSBzYW1wbGVPYmoudm9sdW1lXHJcblxyXG4gICAgcmV0dXJuIHNhbXBsZXNcclxuXHJcbiAgcmVuZGVyUGF0dGVybnM6IChwYXR0ZXJucywgdG90YWxMZW5ndGgsIGNhbGNPZmZzZXRMZW5ndGgpIC0+XHJcbiAgICBzYW1wbGVzID0gQXJyYXkodG90YWxMZW5ndGgpXHJcbiAgICBmb3IgaSBpbiBbMC4uLnRvdGFsTGVuZ3RoXVxyXG4gICAgICBzYW1wbGVzW2ldID0gMFxyXG5cclxuICAgIGZvciBwYXR0ZXJuIGluIHBhdHRlcm5zXHJcbiAgICAgIGZvciBzb3VuZCBpbiBwYXR0ZXJuLnNvdW5kc1xyXG4gICAgICAgIG92ZXJyaWRlcyA9IHt9XHJcbiAgICAgICAgc2VjdGlvbkNvdW50ID0gcGF0dGVybi5sZW5ndGggLyAxNlxyXG4gICAgICAgIG9mZnNldExlbmd0aCA9IE1hdGguZmxvb3IodG90YWxMZW5ndGggLyAxNiAvIHNlY3Rpb25Db3VudClcclxuICAgICAgICBpZiBzb3VuZC5sZW5ndGggPiAwXHJcbiAgICAgICAgICBvdmVycmlkZXMubGVuZ3RoID0gc291bmQubGVuZ3RoICogb2Zmc2V0TGVuZ3RoXHJcbiAgICAgICAgaWYgc291bmQubm90ZT9cclxuICAgICAgICAgIG92ZXJyaWRlcy5ub3RlID0gc291bmQubm90ZVxyXG5cclxuICAgICAgICBzcmNTYW1wbGVzID0gQHJlbmRlcihwYXR0ZXJuLnNyYywgb3ZlcnJpZGVzKVxyXG4gICAgICAgIGlmIG5vdCBjYWxjT2Zmc2V0TGVuZ3RoXHJcbiAgICAgICAgICBvZmZzZXRMZW5ndGggPSBzcmNTYW1wbGVzLmxlbmd0aFxyXG5cclxuICAgICAgICBvZmZzZXQgPSBzb3VuZC5vZmZzZXQgKiBvZmZzZXRMZW5ndGhcclxuICAgICAgICBjb3B5TGVuID0gc3JjU2FtcGxlcy5sZW5ndGhcclxuICAgICAgICBpZiAob2Zmc2V0ICsgY29weUxlbikgPiB0b3RhbExlbmd0aFxyXG4gICAgICAgICAgY29weUxlbiA9IHRvdGFsTGVuZ3RoIC0gb2Zmc2V0XHJcbiAgICAgICAgZm9yIGogaW4gWzAuLi5jb3B5TGVuXVxyXG4gICAgICAgICAgc2FtcGxlc1tvZmZzZXQgKyBqXSArPSBzcmNTYW1wbGVzW2pdXHJcblxyXG4gICAgcmV0dXJuIHNhbXBsZXNcclxuXHJcbiAgcmVuZGVyTG9vcDogKGxvb3BPYmopIC0+XHJcbiAgICBiZWF0Q291bnQgPSAwXHJcbiAgICBmb3IgcGF0dGVybiBpbiBsb29wT2JqLl9wYXR0ZXJuc1xyXG4gICAgICBpZiBiZWF0Q291bnQgPCBwYXR0ZXJuLmxlbmd0aFxyXG4gICAgICAgIGJlYXRDb3VudCA9IHBhdHRlcm4ubGVuZ3RoXHJcblxyXG4gICAgc2FtcGxlc1BlckJlYXQgPSBAc2FtcGxlUmF0ZSAvIChsb29wT2JqLmJwbSAvIDYwKSAvIGxvb3BPYmouYmVhdHNcclxuICAgIGxvb3BMZW5ndGggPSBzYW1wbGVzUGVyQmVhdCAqIGJlYXRDb3VudFxyXG5cclxuICAgIHJldHVybiBAcmVuZGVyUGF0dGVybnMobG9vcE9iai5fcGF0dGVybnMsIGxvb3BMZW5ndGgsIHRydWUpXHJcblxyXG4gIHJlbmRlclRyYWNrOiAodHJhY2tPYmopIC0+XHJcbiAgICB0cmFja0xlbmd0aCA9IDBcclxuICAgIGZvciBwYXR0ZXJuIGluIHRyYWNrT2JqLl9wYXR0ZXJuc1xyXG4gICAgICBzcmNTYW1wbGVzID0gQHJlbmRlcihwYXR0ZXJuLnNyYylcclxuICAgICAgcGF0dGVybkxlbmd0aCA9IHNyY1NhbXBsZXMubGVuZ3RoICogcGF0dGVybi5sZW5ndGhcclxuICAgICAgaWYgdHJhY2tMZW5ndGggPCBwYXR0ZXJuTGVuZ3RoXHJcbiAgICAgICAgdHJhY2tMZW5ndGggPSBwYXR0ZXJuTGVuZ3RoXHJcblxyXG4gICAgcmV0dXJuIEByZW5kZXJQYXR0ZXJucyh0cmFja09iai5fcGF0dGVybnMsIHRyYWNrTGVuZ3RoLCBmYWxzZSlcclxuXHJcbiAgY2FsY0NhY2hlTmFtZTogKHR5cGUsIHdoaWNoLCBvdmVycmlkZXMpIC0+XHJcbiAgICBpZiB0eXBlICE9ICd0b25lJ1xyXG4gICAgICByZXR1cm4gd2hpY2hcclxuXHJcbiAgICBuYW1lID0gd2hpY2hcclxuICAgIGlmIG92ZXJyaWRlcy5ub3RlXHJcbiAgICAgIG5hbWUgKz0gXCIvTiN7b3ZlcnJpZGVzLm5vdGV9XCJcclxuICAgIGlmIG92ZXJyaWRlcy5sZW5ndGhcclxuICAgICAgbmFtZSArPSBcIi9MI3tvdmVycmlkZXMubGVuZ3RofVwiXHJcblxyXG4gICAgcmV0dXJuIG5hbWVcclxuXHJcbiAgcmVuZGVyOiAod2hpY2gsIG92ZXJyaWRlcykgLT5cclxuICAgIG9iamVjdCA9IEBvYmplY3RzW3doaWNoXVxyXG4gICAgaWYgbm90IG9iamVjdFxyXG4gICAgICBAZXJyb3IgXCJubyBzdWNoIG9iamVjdCAje3doaWNofVwiXHJcbiAgICAgIHJldHVybiBudWxsXHJcblxyXG4gICAgY2FjaGVOYW1lID0gQGNhbGNDYWNoZU5hbWUob2JqZWN0Ll90eXBlLCB3aGljaCwgb3ZlcnJpZGVzKVxyXG4gICAgaWYgQHNhbXBsZUNhY2hlW2NhY2hlTmFtZV1cclxuICAgICAgcmV0dXJuIEBzYW1wbGVDYWNoZVtjYWNoZU5hbWVdXHJcblxyXG4gICAgc2FtcGxlcyA9IHN3aXRjaCBvYmplY3QuX3R5cGVcclxuICAgICAgd2hlbiAndG9uZScgdGhlbiBAcmVuZGVyVG9uZShvYmplY3QsIG92ZXJyaWRlcylcclxuICAgICAgd2hlbiAnbG9vcCcgdGhlbiBAcmVuZGVyTG9vcChvYmplY3QpXHJcbiAgICAgIHdoZW4gJ3RyYWNrJyB0aGVuIEByZW5kZXJUcmFjayhvYmplY3QpXHJcbiAgICAgIHdoZW4gJ3NhbXBsZScgdGhlbiBAcmVuZGVyU2FtcGxlKG9iamVjdClcclxuICAgICAgZWxzZVxyXG4gICAgICAgIEBlcnJvciBcInVua25vd24gdHlwZSAje29iamVjdC5fdHlwZX1cIlxyXG4gICAgICAgIG51bGxcclxuXHJcbiAgICBAbG9nIFwiUmVuZGVyZWQgI3tjYWNoZU5hbWV9LlwiXHJcbiAgICBAc2FtcGxlQ2FjaGVbY2FjaGVOYW1lXSA9IHNhbXBsZXNcclxuICAgIHJldHVybiBzYW1wbGVzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBFeHBvcnRzXHJcblxyXG5yZW5kZXJMb29wU2NyaXB0ID0gKGFyZ3MpIC0+XHJcbiAgbG9nQ0IgPSBhcmdzLmxvZ1xyXG4gIGxvZ0NCIFwiUGFyc2luZy4uLlwiXHJcbiAgcGFyc2VyID0gbmV3IFBhcnNlcihsb2dDQilcclxuICBwYXJzZXIucGFyc2UgYXJncy5zY3JpcHRcclxuXHJcbiAgd2hpY2ggPSBhcmdzLndoaWNoXHJcbiAgd2hpY2ggPz0gcGFyc2VyLmxhc3RPYmplY3RcclxuXHJcbiAgaWYgd2hpY2hcclxuICAgIHNhbXBsZVJhdGUgPSA0NDEwMFxyXG4gICAgbG9nQ0IgXCJSZW5kZXJpbmcuLi5cIlxyXG4gICAgcmVuZGVyZXIgPSBuZXcgUmVuZGVyZXIobG9nQ0IsIHNhbXBsZVJhdGUsIGFyZ3MucmVhZExvY2FsRmlsZXMsIHBhcnNlci5vYmplY3RzKVxyXG4gICAgb3V0cHV0U2FtcGxlcyA9IHJlbmRlcmVyLnJlbmRlcihwYXJzZXIubGFzdE9iamVjdCwge30pXHJcbiAgICBpZiBhcmdzLm91dHB1dEZpbGVuYW1lXHJcbiAgICAgIHJldHVybiB3cml0ZVdBViBhcmdzLm91dHB1dEZpbGVuYW1lLCBzYW1wbGVSYXRlLCBvdXRwdXRTYW1wbGVzXHJcbiAgICByZXR1cm4gbWFrZUJsb2JVcmwoc2FtcGxlUmF0ZSwgb3V0cHV0U2FtcGxlcylcclxuXHJcbiAgcmV0dXJuIG51bGxcclxuXHJcbm1vZHVsZS5leHBvcnRzID1cclxuICByZW5kZXI6IHJlbmRlckxvb3BTY3JpcHRcclxuIiwiZnMgPSByZXF1aXJlIFwiZnNcIlxyXG5cclxuY2xhc3MgRmFzdEJhc2U2NFxyXG5cclxuICBjb25zdHJ1Y3RvcjogLT5cclxuICAgIEBjaGFycyA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLz1cIlxyXG4gICAgQGVuY0xvb2t1cCA9IFtdXHJcbiAgICBmb3IgaSBpbiBbMC4uLjQwOTZdXHJcbiAgICAgIEBlbmNMb29rdXBbaV0gPSBAY2hhcnNbaSA+PiA2XSArIEBjaGFyc1tpICYgMHgzRl1cclxuXHJcbiAgZW5jb2RlOiAoc3JjKSAtPlxyXG4gICAgbGVuID0gc3JjLmxlbmd0aFxyXG4gICAgZHN0ID0gJydcclxuICAgIGkgPSAwXHJcbiAgICB3aGlsZSAobGVuID4gMilcclxuICAgICAgbiA9IChzcmNbaV0gPDwgMTYpIHwgKHNyY1tpKzFdPDw4KSB8IHNyY1tpKzJdXHJcbiAgICAgIGRzdCs9IHRoaXMuZW5jTG9va3VwW24gPj4gMTJdICsgdGhpcy5lbmNMb29rdXBbbiAmIDB4RkZGXVxyXG4gICAgICBsZW4tPSAzXHJcbiAgICAgIGkrPSAzXHJcbiAgICBpZiAobGVuID4gMClcclxuICAgICAgbjE9IChzcmNbaV0gJiAweEZDKSA+PiAyXHJcbiAgICAgIG4yPSAoc3JjW2ldICYgMHgwMykgPDwgNFxyXG4gICAgICBpZiAobGVuID4gMSlcclxuICAgICAgICBuMiB8PSAoc3JjWysraV0gJiAweEYwKSA+PiA0XHJcbiAgICAgIGRzdCs9IHRoaXMuY2hhcnNbbjFdXHJcbiAgICAgIGRzdCs9IHRoaXMuY2hhcnNbbjJdXHJcbiAgICAgIGlmIChsZW4gPT0gMilcclxuICAgICAgICBuMz0gKHNyY1tpKytdICYgMHgwRikgPDwgMlxyXG4gICAgICAgIG4zIHw9IChzcmNbaV0gJiAweEMwKSA+PiA2XHJcbiAgICAgICAgZHN0Kz0gdGhpcy5jaGFyc1tuM11cclxuICAgICAgaWYgKGxlbiA9PSAxKVxyXG4gICAgICAgIGRzdCs9ICc9J1xyXG4gICAgICBkc3QrPSAnPSdcclxuXHJcbiAgICByZXR1cm4gZHN0XHJcblxyXG5jbGFzcyBSSUZGV0FWRVxyXG4gIGNvbnN0cnVjdG9yOiAoQHNhbXBsZVJhdGUsIEBkYXRhKSAtPlxyXG4gICAgQHdhdiA9IFtdICAgICAjIEFycmF5IGNvbnRhaW5pbmcgdGhlIGdlbmVyYXRlZCB3YXZlIGZpbGVcclxuICAgIEBoZWFkZXIgPSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjIE9GRlMgU0laRSBOT1RFU1xyXG4gICAgICBjaHVua0lkICAgICAgOiBbMHg1MiwweDQ5LDB4NDYsMHg0Nl0sICMgMCAgICA0ICBcIlJJRkZcIiA9IDB4NTI0OTQ2NDZcclxuICAgICAgY2h1bmtTaXplICAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDQgICAgNCAgMzYrU3ViQ2h1bmsyU2l6ZSA9IDQrKDgrU3ViQ2h1bmsxU2l6ZSkrKDgrU3ViQ2h1bmsyU2l6ZSlcclxuICAgICAgZm9ybWF0ICAgICAgIDogWzB4NTcsMHg0MSwweDU2LDB4NDVdLCAjIDggICAgNCAgXCJXQVZFXCIgPSAweDU3NDE1NjQ1XHJcbiAgICAgIHN1YkNodW5rMUlkICA6IFsweDY2LDB4NmQsMHg3NCwweDIwXSwgIyAxMiAgIDQgIFwiZm10IFwiID0gMHg2NjZkNzQyMFxyXG4gICAgICBzdWJDaHVuazFTaXplOiAxNiwgICAgICAgICAgICAgICAgICAgICMgMTYgICA0ICAxNiBmb3IgUENNXHJcbiAgICAgIGF1ZGlvRm9ybWF0ICA6IDEsICAgICAgICAgICAgICAgICAgICAgIyAyMCAgIDIgIFBDTSA9IDFcclxuICAgICAgbnVtQ2hhbm5lbHMgIDogMSwgICAgICAgICAgICAgICAgICAgICAjIDIyICAgMiAgTW9ubyA9IDEsIFN0ZXJlbyA9IDIuLi5cclxuICAgICAgc2FtcGxlUmF0ZSAgIDogQHNhbXBsZVJhdGUsICAgICAgICAgICAjIDI0ICAgNCAgODAwMCwgNDQxMDAuLi5cclxuICAgICAgYnl0ZVJhdGUgICAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDI4ICAgNCAgU2FtcGxlUmF0ZSpOdW1DaGFubmVscypCaXRzUGVyU2FtcGxlLzhcclxuICAgICAgYmxvY2tBbGlnbiAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDMyICAgMiAgTnVtQ2hhbm5lbHMqQml0c1BlclNhbXBsZS84XHJcbiAgICAgIGJpdHNQZXJTYW1wbGU6IDE2LCAgICAgICAgICAgICAgICAgICAgIyAzNCAgIDIgIDggYml0cyA9IDgsIDE2IGJpdHMgPSAxNlxyXG4gICAgICBzdWJDaHVuazJJZCAgOiBbMHg2NCwweDYxLDB4NzQsMHg2MV0sICMgMzYgICA0ICBcImRhdGFcIiA9IDB4NjQ2MTc0NjFcclxuICAgICAgc3ViQ2h1bmsyU2l6ZTogMCAgICAgICAgICAgICAgICAgICAgICAjIDQwICAgNCAgZGF0YSBzaXplID0gTnVtU2FtcGxlcypOdW1DaGFubmVscypCaXRzUGVyU2FtcGxlLzhcclxuXHJcbiAgICBAZ2VuZXJhdGUoKVxyXG5cclxuICB1MzJUb0FycmF5OiAoaSkgLT5cclxuICAgIHJldHVybiBbaSYweEZGLCAoaT4+OCkmMHhGRiwgKGk+PjE2KSYweEZGLCAoaT4+MjQpJjB4RkZdXHJcblxyXG4gIHUxNlRvQXJyYXk6IChpKSAtPlxyXG4gICAgcmV0dXJuIFtpJjB4RkYsIChpPj44KSYweEZGXVxyXG5cclxuICBzcGxpdDE2Yml0QXJyYXk6IChkYXRhKSAtPlxyXG4gICAgciA9IFtdXHJcbiAgICBqID0gMFxyXG4gICAgbGVuID0gZGF0YS5sZW5ndGhcclxuICAgIGZvciBpIGluIFswLi4ubGVuXVxyXG4gICAgICByW2orK10gPSBkYXRhW2ldICYgMHhGRlxyXG4gICAgICByW2orK10gPSAoZGF0YVtpXT4+OCkgJiAweEZGXHJcblxyXG4gICAgcmV0dXJuIHJcclxuXHJcbiAgZ2VuZXJhdGU6IC0+XHJcbiAgICBAaGVhZGVyLmJsb2NrQWxpZ24gPSAoQGhlYWRlci5udW1DaGFubmVscyAqIEBoZWFkZXIuYml0c1BlclNhbXBsZSkgPj4gM1xyXG4gICAgQGhlYWRlci5ieXRlUmF0ZSA9IEBoZWFkZXIuYmxvY2tBbGlnbiAqIEBzYW1wbGVSYXRlXHJcbiAgICBAaGVhZGVyLnN1YkNodW5rMlNpemUgPSBAZGF0YS5sZW5ndGggKiAoQGhlYWRlci5iaXRzUGVyU2FtcGxlID4+IDMpXHJcbiAgICBAaGVhZGVyLmNodW5rU2l6ZSA9IDM2ICsgQGhlYWRlci5zdWJDaHVuazJTaXplXHJcblxyXG4gICAgaWYgQGhlYWRlci5iaXRzUGVyU2FtcGxlID09IDE2XHJcbiAgICAgIEBkYXRhID0gQHNwbGl0MTZiaXRBcnJheShAZGF0YSlcclxuXHJcbiAgICBAd2F2ID0gQGhlYWRlci5jaHVua0lkLmNvbmNhdChcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5jaHVua1NpemUpLFxyXG4gICAgICBAaGVhZGVyLmZvcm1hdCxcclxuICAgICAgQGhlYWRlci5zdWJDaHVuazFJZCxcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5zdWJDaHVuazFTaXplKSxcclxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5hdWRpb0Zvcm1hdCksXHJcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIubnVtQ2hhbm5lbHMpLFxyXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLnNhbXBsZVJhdGUpLFxyXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLmJ5dGVSYXRlKSxcclxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5ibG9ja0FsaWduKSxcclxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5iaXRzUGVyU2FtcGxlKSxcclxuICAgICAgQGhlYWRlci5zdWJDaHVuazJJZCxcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5zdWJDaHVuazJTaXplKSxcclxuICAgICAgQGRhdGFcclxuICAgIClcclxuICAgIGZiID0gbmV3IEZhc3RCYXNlNjRcclxuICAgIEBiYXNlNjREYXRhID0gZmIuZW5jb2RlKEB3YXYpXHJcbiAgICBAZGF0YVVSSSA9ICdkYXRhOmF1ZGlvL3dhdjtiYXNlNjQsJyArIEBiYXNlNjREYXRhXHJcblxyXG4gIHJhdzogLT5cclxuICAgIHJldHVybiBuZXcgQnVmZmVyKEBiYXNlNjREYXRhLCBcImJhc2U2NFwiKVxyXG5cclxud3JpdGVXQVYgPSAoZmlsZW5hbWUsIHNhbXBsZVJhdGUsIHNhbXBsZXMpIC0+XHJcbiAgd2F2ZSA9IG5ldyBSSUZGV0FWRSBzYW1wbGVSYXRlLCBzYW1wbGVzXHJcbiAgZnMud3JpdGVGaWxlU3luYyhmaWxlbmFtZSwgd2F2ZS5yYXcoKSlcclxuICByZXR1cm4gdHJ1ZVxyXG5cclxubWFrZURhdGFVUkkgPSAoc2FtcGxlUmF0ZSwgc2FtcGxlcykgLT5cclxuICB3YXZlID0gbmV3IFJJRkZXQVZFIHNhbXBsZVJhdGUsIHNhbXBsZXNcclxuICByZXR1cm4gd2F2ZS5kYXRhVVJJXHJcblxyXG5iNjR0b0Jsb2IgPSAoYjY0RGF0YSwgY29udGVudFR5cGUsIHNsaWNlU2l6ZSkgLT5cclxuICBjb250ZW50VHlwZSA9IGNvbnRlbnRUeXBlIHx8ICcnXHJcbiAgc2xpY2VTaXplID0gc2xpY2VTaXplIHx8IDUxMlxyXG5cclxuICBieXRlQ2hhcmFjdGVycyA9IGF0b2IoYjY0RGF0YSlcclxuICBieXRlQXJyYXlzID0gW11cclxuXHJcbiAgZm9yIG9mZnNldCBpbiBbMC4uLmJ5dGVDaGFyYWN0ZXJzLmxlbmd0aF0gYnkgc2xpY2VTaXplXHJcbiAgICBzbGljZSA9IGJ5dGVDaGFyYWN0ZXJzLnNsaWNlKG9mZnNldCwgb2Zmc2V0ICsgc2xpY2VTaXplKVxyXG5cclxuICAgIGJ5dGVOdW1iZXJzID0gbmV3IEFycmF5KHNsaWNlLmxlbmd0aClcclxuICAgIGZvciBpIGluIFswLi4uc2xpY2UubGVuZ3RoXVxyXG4gICAgICBieXRlTnVtYmVyc1tpXSA9IHNsaWNlLmNoYXJDb2RlQXQoaSlcclxuXHJcbiAgICBieXRlQXJyYXkgPSBuZXcgVWludDhBcnJheShieXRlTnVtYmVycylcclxuXHJcbiAgICBieXRlQXJyYXlzLnB1c2goYnl0ZUFycmF5KVxyXG5cclxuICBibG9iID0gbmV3IEJsb2IoYnl0ZUFycmF5cywge3R5cGU6IGNvbnRlbnRUeXBlfSlcclxuICByZXR1cm4gYmxvYlxyXG5cclxubWFrZUJsb2JVcmwgPSAoc2FtcGxlUmF0ZSwgc2FtcGxlcykgLT5cclxuICB3YXZlID0gbmV3IFJJRkZXQVZFIHNhbXBsZVJhdGUsIHNhbXBsZXNcclxuICBibG9iID0gYjY0dG9CbG9iKHdhdmUuYmFzZTY0RGF0YSwgXCJhdWRpby93YXZcIilcclxuICByZXR1cm4gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPVxyXG4gIFJJRkZXQVZFOiBSSUZGV0FWRVxyXG4gIHdyaXRlV0FWOiB3cml0ZVdBVlxyXG4gIG1ha2VEYXRhVVJJOiBtYWtlRGF0YVVSSVxyXG4gIG1ha2VCbG9iVXJsOiBtYWtlQmxvYlVybFxyXG4iXX0=
