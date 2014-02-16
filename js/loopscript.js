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

},{}],"examples":[function(require,module,exports){
module.exports=require('DalL2z');
},{}],"DalL2z":[function(require,module,exports){
module.exports = {
  first: "# ------------------------------------------------------------\n# Your first LoopScript. Someday there will be documentation!\n\ntone note1\n  duration 250\n  octave 4\n  note C\n\ntone bass1\n  duration 250\n  octave 1\n  note B\n\nloop loop1\n  pattern note1 x.......x.......\n  pattern bass1 ....x.......x...\n",
  notes: "# ------------------------------------------------------------\n# Note overrides!\n\n# Try setting the duration to 100\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  duration 250\n\n# If you use any letters other than \"x\" on a tone pattern, you override its\n# note with the note listed.\n\nloop loop1\n  pattern note1 b.a.g.a.b.b.b.\n",
  motto: "# ------------------------------------------------------------\n# An approximation of the beat from Drake's \"The Motto\"\n\nbpm 100\n\nsection Bass (in a section to share ADSR)\n  adsr 0.005 0.05 0.7 0.05\n  tone bass1\n    octave 1\n  tone bass2\n    octave 2\n\nsample clap\n  src samples/clap.wav\nsample snare\n  src samples/snare.wav\nsample hihat\n  src samples/hihat.wav\n\n# TODO: fix snare pattern to match song\nloop loop1\n  pattern hihat ..x.......x.......x.......x.....\n  pattern clap  ....x.......x.......x.......x...\n  pattern snare ......x...x...x.x...............\n  pattern bass1 Bbbbbb..........................\n  pattern bass2 ......HhhhhhDddddd....HhhhJj.Jj.\n\ntrack song\n  pattern loop1 xxxx\n",
  length: "# ------------------------------------------------------------\n# Showing off various note lengths using caps and lowercase\n# Also shows what ADSR can do!\n\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n\ntone note2\n  # Note: Only the first tone has ADSR\n\n# If you use any letters other than \"x\" on a tone pattern, you override its\n# note with the note listed. Also, if you use any capital letters in a pattern,\n# you override the length of that note with the number of matching lowercase\n# letters following it.\n\nloop loop1\n  pattern note1 GgggggggFfffff..AaaaBbb.Cc..D...\n\nloop loop2\n  pattern note2 GgggggggFfffff..AaaaBbb.Cc..D...\n\ntrack song\n  pattern loop1 x.\n  pattern loop2 .x\n"
};


},{}],"freq":[function(require,module,exports){
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
var IndentStack, Parser, Renderer, clone, countIndent, findFreq, makeBlobUrl, renderLoopScript,
  __slice = [].slice;

makeBlobUrl = require("riffwave").makeBlobUrl;

findFreq = require('freq').findFreq;

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
  var i, indent, _i, _ref;
  indent = 0;
  for (i = _i = 0, _ref = text.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
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
    var flattenedState, key, state, _i, _len, _ref;
    flattenedState = {};
    _ref = this.stateStack;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      state = _ref[_i];
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
    var data, i, _i, _ref;
    data = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
    this.finishObject();
    this.object = {};
    for (i = _i = 0, _ref = data.length; _i < _ref; i = _i += 2) {
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
    var indent, indentText, line, lines, topIndent, _, _i, _len, _ref;
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
      _ref = this.indentRegex.exec(line), _ = _ref[0], indentText = _ref[1], line = _ref[2];
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
  function Renderer(log, sampleRate, objects) {
    this.log = log;
    this.sampleRate = sampleRate;
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
    var i, samples, subchunk2Size, view, _i, _ref;
    view = null;
    $.ajax({
      url: sampleObj.src,
      mimeType: 'text/plain; charset=x-user-defined',
      success: function(data) {
        console.log("data length " + data.length);
        return view = new jDataView(data, 0, data.length, true);
      },
      async: false
    });
    if (!view) {
      return [];
    }
    console.log("" + sampleObj.src + " is " + view.byteLength + " in size");
    view.seek(40);
    subchunk2Size = view.getInt32();
    console.log("subchunk2Size is " + subchunk2Size);
    samples = [];
    while (view.tell() + 1 < view.byteLength) {
      samples.push(view.getInt16());
    }
    console.log("looped " + samples.length + " times");
    for (i = _i = 0, _ref = samples.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
      samples[i] *= sampleObj.volume;
    }
    return samples;
  };

  Renderer.prototype.renderPatterns = function(patterns, totalLength, calcOffsetLength) {
    var copyLen, i, j, offset, offsetLength, overrides, pattern, samples, sectionCount, sound, srcSamples, _i, _j, _k, _l, _len, _len1, _ref;
    samples = Array(totalLength);
    for (i = _i = 0; 0 <= totalLength ? _i < totalLength : _i > totalLength; i = 0 <= totalLength ? ++_i : --_i) {
      samples[i] = 0;
    }
    for (_j = 0, _len = patterns.length; _j < _len; _j++) {
      pattern = patterns[_j];
      _ref = pattern.sounds;
      for (_k = 0, _len1 = _ref.length; _k < _len1; _k++) {
        sound = _ref[_k];
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
    var beatCount, loopLength, pattern, samplesPerBeat, _i, _len, _ref;
    beatCount = 0;
    _ref = loopObj._patterns;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      pattern = _ref[_i];
      if (beatCount < pattern.length) {
        beatCount = pattern.length;
      }
    }
    samplesPerBeat = this.sampleRate / (loopObj.bpm / 60) / loopObj.beats;
    loopLength = samplesPerBeat * beatCount;
    return this.renderPatterns(loopObj._patterns, loopLength, true);
  };

  Renderer.prototype.renderTrack = function(trackObj) {
    var pattern, patternLength, srcSamples, trackLength, _i, _len, _ref;
    trackLength = 0;
    _ref = trackObj._patterns;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      pattern = _ref[_i];
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

renderLoopScript = function(loopscript, logCB) {
  var outputSamples, parser, renderer, sampleRate;
  logCB("Parsing...");
  parser = new Parser(logCB);
  parser.parse(loopscript);
  if (parser.lastObject) {
    sampleRate = 44100;
    logCB("Rendering...");
    renderer = new Renderer(logCB, sampleRate, parser.objects);
    outputSamples = renderer.render(parser.lastObject);
    return makeBlobUrl(sampleRate, outputSamples);
  }
  return null;
};

module.exports = {
  render: renderLoopScript
};


},{"freq":"8uZMKg","riffwave":"y6ZgdS"}],"loopscript":[function(require,module,exports){
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
},{"buffer":2,"fs":1}],"riffwave":[function(require,module,exports){
module.exports=require('y6ZgdS');
},{}]},{},[])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxsaWJcXF9lbXB0eS5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcbmF0aXZlLWJ1ZmZlci1icm93c2VyaWZ5XFxpbmRleC5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcbmF0aXZlLWJ1ZmZlci1icm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJhc2U2NC1qc1xcbGliXFxiNjQuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXG5hdGl2ZS1idWZmZXItYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxpZWVlNzU0XFxpbmRleC5qcyIsIi4uXFxzcmNcXGV4YW1wbGVzLmNvZmZlZSIsIi4uXFxzcmNcXGZyZXEuY29mZmVlIiwiLi5cXHNyY1xcbG9vcHNjcmlwdC5jb2ZmZWUiLCIuLlxcc3JjXFxyaWZmd2F2ZS5jb2ZmZWUiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoaUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDcEZBLE1BQU0sQ0FBQyxPQUFQLEdBRUU7QUFBQSxFQUFBLEtBQUEsRUFBTywyVEFBUDtBQUFBLEVBb0JBLEtBQUEsRUFBTywrVUFwQlA7QUFBQSxFQXFDQSxLQUFBLEVBQU8sbXRCQXJDUDtBQUFBLEVBc0VBLE1BQUEsRUFBUSw4ckJBdEVSO0NBRkYsQ0FBQTs7Ozs7O0FDQUEsSUFBQSxtQ0FBQTs7QUFBQSxTQUFBLEdBQVk7RUFDVjtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtHQURVLEVBUVY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0FSVSxFQXVCVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXZCVSxFQXNDVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXRDVSxFQXFEVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXJEVSxFQW9FVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXBFVSxFQW1GVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FB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e2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLG51bGwsInZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcblxuZXhwb3J0cy5CdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuU2xvd0J1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUyA9IDUwXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyXG5cbi8qKlxuICogSWYgYEJ1ZmZlci5fdXNlVHlwZWRBcnJheXNgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAoY29tcGF0aWJsZSBkb3duIHRvIElFNilcbiAqL1xuQnVmZmVyLl91c2VUeXBlZEFycmF5cyA9IChmdW5jdGlvbiAoKSB7XG4gICAvLyBEZXRlY3QgaWYgYnJvd3NlciBzdXBwb3J0cyBUeXBlZCBBcnJheXMuIFN1cHBvcnRlZCBicm93c2VycyBhcmUgSUUgMTArLFxuICAgLy8gRmlyZWZveCA0KywgQ2hyb21lIDcrLCBTYWZhcmkgNS4xKywgT3BlcmEgMTEuNissIGlPUyA0LjIrLlxuICAgaWYgKHR5cGVvZiBVaW50OEFycmF5ID09PSAndW5kZWZpbmVkJyB8fCB0eXBlb2YgQXJyYXlCdWZmZXIgPT09ICd1bmRlZmluZWQnKVxuICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgLy8gRG9lcyB0aGUgYnJvd3NlciBzdXBwb3J0IGFkZGluZyBwcm9wZXJ0aWVzIHRvIGBVaW50OEFycmF5YCBpbnN0YW5jZXM/IElmXG4gIC8vIG5vdCwgdGhlbiB0aGF0J3MgdGhlIHNhbWUgYXMgbm8gYFVpbnQ4QXJyYXlgIHN1cHBvcnQuIFdlIG5lZWQgdG8gYmUgYWJsZSB0b1xuICAvLyBhZGQgYWxsIHRoZSBub2RlIEJ1ZmZlciBBUEkgbWV0aG9kcy5cbiAgLy8gUmVsZXZhbnQgRmlyZWZveCBidWc6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOFxuICB0cnkge1xuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheSgwKVxuICAgIGFyci5mb28gPSBmdW5jdGlvbiAoKSB7IHJldHVybiA0MiB9XG4gICAgcmV0dXJuIDQyID09PSBhcnIuZm9vKCkgJiZcbiAgICAgICAgdHlwZW9mIGFyci5zdWJhcnJheSA9PT0gJ2Z1bmN0aW9uJyAvLyBDaHJvbWUgOS0xMCBsYWNrIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gV29ya2Fyb3VuZDogbm9kZSdzIGJhc2U2NCBpbXBsZW1lbnRhdGlvbiBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgc3RyaW5nc1xuICAvLyB3aGlsZSBiYXNlNjQtanMgZG9lcyBub3QuXG4gIGlmIChlbmNvZGluZyA9PT0gJ2Jhc2U2NCcgJiYgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBzdWJqZWN0ID0gc3RyaW5ndHJpbShzdWJqZWN0KVxuICAgIHdoaWxlIChzdWJqZWN0Lmxlbmd0aCAlIDQgIT09IDApIHtcbiAgICAgIHN1YmplY3QgPSBzdWJqZWN0ICsgJz0nXG4gICAgfVxuICB9XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0KVxuICBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJylcbiAgICBsZW5ndGggPSBCdWZmZXIuYnl0ZUxlbmd0aChzdWJqZWN0LCBlbmNvZGluZylcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QubGVuZ3RoKSAvLyBBc3N1bWUgb2JqZWN0IGlzIGFuIGFycmF5XG4gIGVsc2VcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IG5lZWRzIHRvIGJlIGEgbnVtYmVyLCBhcnJheSBvciBzdHJpbmcuJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgLy8gUHJlZmVycmVkOiBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIGJ1ZiA9IGF1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIFRISVMgaW5zdGFuY2Ugb2YgQnVmZmVyIChjcmVhdGVkIGJ5IGBuZXdgKVxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gICAgYnVmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmIHR5cGVvZiBVaW50OEFycmF5ID09PSAnZnVuY3Rpb24nICYmXG4gICAgICBzdWJqZWN0IGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIFVpbnQ4QXJyYXlcbiAgICBidWYuX3NldChzdWJqZWN0KVxuICB9IGVsc2UgaWYgKGlzQXJyYXlpc2goc3ViamVjdCkpIHtcbiAgICAvLyBUcmVhdCBhcnJheS1pc2ggb2JqZWN0cyBhcyBhIGJ5dGUgYXJyYXlcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkpXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3QucmVhZFVJbnQ4KGkpXG4gICAgICBlbHNlXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3RbaV1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBidWYud3JpdGUoc3ViamVjdCwgMCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgIUJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgIW5vWmVybykge1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgYnVmW2ldID0gMFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBidWZcbn1cblxuLy8gU1RBVElDIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09XG5cbkJ1ZmZlci5pc0VuY29kaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nKSB7XG4gIHN3aXRjaCAoU3RyaW5nKGVuY29kaW5nKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICBjYXNlICdyYXcnOlxuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiAoYikge1xuICByZXR1cm4gISEoYiAhPT0gbnVsbCAmJiBiICE9PSB1bmRlZmluZWQgJiYgYi5faXNCdWZmZXIpXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldFxuICBzdHIgPSBzdHIgKyAnJ1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoIC8gMlxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdyYXcnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAqIDJcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIuY29uY2F0ID0gZnVuY3Rpb24gKGxpc3QsIHRvdGFsTGVuZ3RoKSB7XG4gIGFzc2VydChpc0FycmF5KGxpc3QpLCAnVXNhZ2U6IEJ1ZmZlci5jb25jYXQobGlzdCwgW3RvdGFsTGVuZ3RoXSlcXG4nICtcbiAgICAgICdsaXN0IHNob3VsZCBiZSBhbiBBcnJheS4nKVxuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKDApXG4gIH0gZWxzZSBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gbGlzdFswXVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB0b3RhbExlbmd0aCAhPT0gJ251bWJlcicpIHtcbiAgICB0b3RhbExlbmd0aCA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgdG90YWxMZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcih0b3RhbExlbmd0aClcbiAgdmFyIHBvcyA9IDBcbiAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgaXRlbSA9IGxpc3RbaV1cbiAgICBpdGVtLmNvcHkoYnVmLCBwb3MpXG4gICAgcG9zICs9IGl0ZW0ubGVuZ3RoXG4gIH1cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBCVUZGRVIgSU5TVEFOQ0UgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gX2hleFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gYnVmLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG5cbiAgLy8gbXVzdCBiZSBhbiBldmVuIG51bWJlciBvZiBkaWdpdHNcbiAgdmFyIHN0ckxlbiA9IHN0cmluZy5sZW5ndGhcbiAgYXNzZXJ0KHN0ckxlbiAlIDIgPT09IDAsICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBhc3NlcnQoIWlzTmFOKGJ5dGUpLCAnSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPSBpICogMlxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBfdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjhUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2FzY2lpV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2JpbmFyeVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIF9hc2NpaVdyaXRlKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGJhc2U2NFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKSB7XG4gIC8vIFN1cHBvcnQgYm90aCAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpXG4gIC8vIGFuZCB0aGUgbGVnYWN5IChzdHJpbmcsIGVuY29kaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgaWYgKGlzRmluaXRlKG9mZnNldCkpIHtcbiAgICBpZiAoIWlzRmluaXRlKGxlbmd0aCkpIHtcbiAgICAgIGVuY29kaW5nID0gbGVuZ3RoXG4gICAgICBsZW5ndGggPSB1bmRlZmluZWRcbiAgICB9XG4gIH0gZWxzZSB7ICAvLyBsZWdhY3lcbiAgICB2YXIgc3dhcCA9IGVuY29kaW5nXG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBvZmZzZXQgPSBsZW5ndGhcbiAgICBsZW5ndGggPSBzd2FwXG4gIH1cblxuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSB0aGlzLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuXG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0dXJuIF9oZXhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICd1Y3MyJzogLy8gVE9ETzogTm8gc3VwcG9ydCBmb3IgdWNzMiBvciB1dGYxNmxlIGVuY29kaW5ncyB5ZXRcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIF91dGY4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXR1cm4gX2FzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0dXJuIF9iaW5hcnlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXR1cm4gX2Jhc2U2NFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgc2VsZiA9IHRoaXNcblxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcbiAgc3RhcnQgPSBOdW1iZXIoc3RhcnQpIHx8IDBcbiAgZW5kID0gKGVuZCAhPT0gdW5kZWZpbmVkKVxuICAgID8gTnVtYmVyKGVuZClcbiAgICA6IGVuZCA9IHNlbGYubGVuZ3RoXG5cbiAgLy8gRmFzdHBhdGggZW1wdHkgc3RyaW5nc1xuICBpZiAoZW5kID09PSBzdGFydClcbiAgICByZXR1cm4gJydcblxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldHVybiBfaGV4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAndWNzMic6IC8vIFRPRE86IE5vIHN1cHBvcnQgZm9yIHVjczIgb3IgdXRmMTZsZSBlbmNvZGluZ3MgeWV0XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiBfdXRmOFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0dXJuIF9hc2NpaVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldHVybiBfYmluYXJ5U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0dXJuIF9iYXNlNjRTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4ge1xuICAgIHR5cGU6ICdCdWZmZXInLFxuICAgIGRhdGE6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuX2FyciB8fCB0aGlzLCAwKVxuICB9XG59XG5cbi8vIGNvcHkodGFyZ2V0QnVmZmVyLCB0YXJnZXRTdGFydD0wLCBzb3VyY2VTdGFydD0wLCBzb3VyY2VFbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uICh0YXJnZXQsIHRhcmdldF9zdGFydCwgc3RhcnQsIGVuZCkge1xuICB2YXIgc291cmNlID0gdGhpc1xuXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICghdGFyZ2V0X3N0YXJ0KSB0YXJnZXRfc3RhcnQgPSAwXG5cbiAgLy8gQ29weSAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRhcmdldC5sZW5ndGggPT09IDAgfHwgc291cmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgLy8gRmF0YWwgZXJyb3IgY29uZGl0aW9uc1xuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBhc3NlcnQodGFyZ2V0X3N0YXJ0ID49IDAgJiYgdGFyZ2V0X3N0YXJ0IDwgdGFyZ2V0Lmxlbmd0aCxcbiAgICAgICd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCBzb3VyY2UubGVuZ3RoLCAnc291cmNlU3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gc291cmNlLmxlbmd0aCwgJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpXG4gICAgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgPCBlbmQgLSBzdGFydClcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0ICsgc3RhcnRcblxuICAvLyBjb3B5IVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGVuZCAtIHN0YXJ0OyBpKyspXG4gICAgdGFyZ2V0W2kgKyB0YXJnZXRfc3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gX3V0ZjhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXMgPSAnJ1xuICB2YXIgdG1wID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgaWYgKGJ1ZltpXSA8PSAweDdGKSB7XG4gICAgICByZXMgKz0gZGVjb2RlVXRmOENoYXIodG1wKSArIFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICAgICAgdG1wID0gJydcbiAgICB9IGVsc2Uge1xuICAgICAgdG1wICs9ICclJyArIGJ1ZltpXS50b1N0cmluZygxNilcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzICsgZGVjb2RlVXRmOENoYXIodG1wKVxufVxuXG5mdW5jdGlvbiBfYXNjaWlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXQgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspXG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHJldHVybiBfYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIF9oZXhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG5cbiAgaWYgKCFzdGFydCB8fCBzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCB8fCBlbmQgPCAwIHx8IGVuZCA+IGxlbikgZW5kID0gbGVuXG5cbiAgdmFyIG91dCA9ICcnXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgb3V0ICs9IHRvSGV4KGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbi8vIGh0dHA6Ly9ub2RlanMub3JnL2FwaS9idWZmZXIuaHRtbCNidWZmZXJfYnVmX3NsaWNlX3N0YXJ0X2VuZFxuQnVmZmVyLnByb3RvdHlwZS5zbGljZSA9IGZ1bmN0aW9uIChzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBzdGFydCA9IGNsYW1wKHN0YXJ0LCBsZW4sIDApXG4gIGVuZCA9IGNsYW1wKGVuZCwgbGVuLCBsZW4pXG5cbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICByZXR1cm4gYXVnbWVudCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBlbmQpKVxuICB9IGVsc2Uge1xuICAgIHZhciBzbGljZUxlbiA9IGVuZCAtIHN0YXJ0XG4gICAgdmFyIG5ld0J1ZiA9IG5ldyBCdWZmZXIoc2xpY2VMZW4sIHVuZGVmaW5lZCwgdHJ1ZSlcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNsaWNlTGVuOyBpKyspIHtcbiAgICAgIG5ld0J1ZltpXSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgICByZXR1cm4gbmV3QnVmXG4gIH1cbn1cblxuLy8gYGdldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLmdldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMucmVhZFVJbnQ4KG9mZnNldClcbn1cblxuLy8gYHNldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKHYsIG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLnNldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMud3JpdGVVSW50OCh2LCBvZmZzZXQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgdmFsID0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICB9IGVsc2Uge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV1cbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDJdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgICB2YWwgfD0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0ICsgM10gPDwgMjQgPj4+IDApXG4gIH0gZWxzZSB7XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMV0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMl0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAzXVxuICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0XSA8PCAyNCA+Pj4gMClcbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsXG4gICAgICAgICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICB2YXIgbmVnID0gdGhpc1tvZmZzZXRdICYgMHg4MFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZiAtIHRoaXNbb2Zmc2V0XSArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQxNihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MzIoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMDAwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZmZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRmxvYXQgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWREb3VibGUgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aCkgcmV0dXJuXG5cbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCAyKTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSAmICgweGZmIDw8ICg4ICogKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkpKSkgPj4+XG4gICAgICAgICAgICAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSAqIDhcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZmZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgNCk7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgPj4+IChsaXR0bGVFbmRpYW4gPyBpIDogMyAtIGkpICogOCkgJiAweGZmXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2YsIC0weDgwKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICB0aGlzLndyaXRlVUludDgodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICB0aGlzLndyaXRlVUludDgoMHhmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmLCAtMHg4MDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQxNihidWYsIDB4ZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQzMihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MzIoYnVmLCAweGZmZmZmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdExFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZURvdWJsZSAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCxcbiAgICAgICAgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAxLjc5NzY5MzEzNDg2MjMxNTdFKzMwOCwgLTEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG4vLyBmaWxsKHZhbHVlLCBzdGFydD0wLCBlbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuZmlsbCA9IGZ1bmN0aW9uICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgdmFsdWUgPSB2YWx1ZS5jaGFyQ29kZUF0KDApXG4gIH1cblxuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiAhaXNOYU4odmFsdWUpLCAndmFsdWUgaXMgbm90IGEgbnVtYmVyJylcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ2VuZCA8IHN0YXJ0JylcblxuICAvLyBGaWxsIDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGhpcy5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgdGhpcy5sZW5ndGgsICdzdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSB0aGlzLmxlbmd0aCwgJ2VuZCBvdXQgb2YgYm91bmRzJylcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHRoaXNbaV0gPSB2YWx1ZVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG91dCA9IFtdXG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgb3V0W2ldID0gdG9IZXgodGhpc1tpXSlcbiAgICBpZiAoaSA9PT0gZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUykge1xuICAgICAgb3V0W2kgKyAxXSA9ICcuLi4nXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIG91dC5qb2luKCcgJykgKyAnPidcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgPT09ICdmdW5jdGlvbicpIHtcbiAgICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgICAgcmV0dXJuIChuZXcgQnVmZmVyKHRoaXMpKS5idWZmZXJcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJ1ZiA9IG5ldyBVaW50OEFycmF5KHRoaXMubGVuZ3RoKVxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGJ1Zi5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMSlcbiAgICAgICAgYnVmW2ldID0gdGhpc1tpXVxuICAgICAgcmV0dXJuIGJ1Zi5idWZmZXJcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCdWZmZXIudG9BcnJheUJ1ZmZlciBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicpXG4gIH1cbn1cblxuLy8gSEVMUEVSIEZVTkNUSU9OU1xuLy8gPT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBzdHJpbmd0cmltIChzdHIpIHtcbiAgaWYgKHN0ci50cmltKSByZXR1cm4gc3RyLnRyaW0oKVxuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxufVxuXG52YXIgQlAgPSBCdWZmZXIucHJvdG90eXBlXG5cbi8qKlxuICogQXVnbWVudCB0aGUgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIGNsYXNzISkgd2l0aCBCdWZmZXIgbWV0aG9kc1xuICovXG5mdW5jdGlvbiBhdWdtZW50IChhcnIpIHtcbiAgYXJyLl9pc0J1ZmZlciA9IHRydWVcblxuICAvLyBzYXZlIHJlZmVyZW5jZSB0byBvcmlnaW5hbCBVaW50OEFycmF5IGdldC9zZXQgbWV0aG9kcyBiZWZvcmUgb3ZlcndyaXRpbmdcbiAgYXJyLl9nZXQgPSBhcnIuZ2V0XG4gIGFyci5fc2V0ID0gYXJyLnNldFxuXG4gIC8vIGRlcHJlY2F0ZWQsIHdpbGwgYmUgcmVtb3ZlZCBpbiBub2RlIDAuMTMrXG4gIGFyci5nZXQgPSBCUC5nZXRcbiAgYXJyLnNldCA9IEJQLnNldFxuXG4gIGFyci53cml0ZSA9IEJQLndyaXRlXG4gIGFyci50b1N0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0xvY2FsZVN0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0pTT04gPSBCUC50b0pTT05cbiAgYXJyLmNvcHkgPSBCUC5jb3B5XG4gIGFyci5zbGljZSA9IEJQLnNsaWNlXG4gIGFyci5yZWFkVUludDggPSBCUC5yZWFkVUludDhcbiAgYXJyLnJlYWRVSW50MTZMRSA9IEJQLnJlYWRVSW50MTZMRVxuICBhcnIucmVhZFVJbnQxNkJFID0gQlAucmVhZFVJbnQxNkJFXG4gIGFyci5yZWFkVUludDMyTEUgPSBCUC5yZWFkVUludDMyTEVcbiAgYXJyLnJlYWRVSW50MzJCRSA9IEJQLnJlYWRVSW50MzJCRVxuICBhcnIucmVhZEludDggPSBCUC5yZWFkSW50OFxuICBhcnIucmVhZEludDE2TEUgPSBCUC5yZWFkSW50MTZMRVxuICBhcnIucmVhZEludDE2QkUgPSBCUC5yZWFkSW50MTZCRVxuICBhcnIucmVhZEludDMyTEUgPSBCUC5yZWFkSW50MzJMRVxuICBhcnIucmVhZEludDMyQkUgPSBCUC5yZWFkSW50MzJCRVxuICBhcnIucmVhZEZsb2F0TEUgPSBCUC5yZWFkRmxvYXRMRVxuICBhcnIucmVhZEZsb2F0QkUgPSBCUC5yZWFkRmxvYXRCRVxuICBhcnIucmVhZERvdWJsZUxFID0gQlAucmVhZERvdWJsZUxFXG4gIGFyci5yZWFkRG91YmxlQkUgPSBCUC5yZWFkRG91YmxlQkVcbiAgYXJyLndyaXRlVUludDggPSBCUC53cml0ZVVJbnQ4XG4gIGFyci53cml0ZVVJbnQxNkxFID0gQlAud3JpdGVVSW50MTZMRVxuICBhcnIud3JpdGVVSW50MTZCRSA9IEJQLndyaXRlVUludDE2QkVcbiAgYXJyLndyaXRlVUludDMyTEUgPSBCUC53cml0ZVVJbnQzMkxFXG4gIGFyci53cml0ZVVJbnQzMkJFID0gQlAud3JpdGVVSW50MzJCRVxuICBhcnIud3JpdGVJbnQ4ID0gQlAud3JpdGVJbnQ4XG4gIGFyci53cml0ZUludDE2TEUgPSBCUC53cml0ZUludDE2TEVcbiAgYXJyLndyaXRlSW50MTZCRSA9IEJQLndyaXRlSW50MTZCRVxuICBhcnIud3JpdGVJbnQzMkxFID0gQlAud3JpdGVJbnQzMkxFXG4gIGFyci53cml0ZUludDMyQkUgPSBCUC53cml0ZUludDMyQkVcbiAgYXJyLndyaXRlRmxvYXRMRSA9IEJQLndyaXRlRmxvYXRMRVxuICBhcnIud3JpdGVGbG9hdEJFID0gQlAud3JpdGVGbG9hdEJFXG4gIGFyci53cml0ZURvdWJsZUxFID0gQlAud3JpdGVEb3VibGVMRVxuICBhcnIud3JpdGVEb3VibGVCRSA9IEJQLndyaXRlRG91YmxlQkVcbiAgYXJyLmZpbGwgPSBCUC5maWxsXG4gIGFyci5pbnNwZWN0ID0gQlAuaW5zcGVjdFxuICBhcnIudG9BcnJheUJ1ZmZlciA9IEJQLnRvQXJyYXlCdWZmZXJcblxuICByZXR1cm4gYXJyXG59XG5cbi8vIHNsaWNlKHN0YXJ0LCBlbmQpXG5mdW5jdGlvbiBjbGFtcCAoaW5kZXgsIGxlbiwgZGVmYXVsdFZhbHVlKSB7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09ICdudW1iZXInKSByZXR1cm4gZGVmYXVsdFZhbHVlXG4gIGluZGV4ID0gfn5pbmRleDsgIC8vIENvZXJjZSB0byBpbnRlZ2VyLlxuICBpZiAoaW5kZXggPj0gbGVuKSByZXR1cm4gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgaW5kZXggKz0gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gY29lcmNlIChsZW5ndGgpIHtcbiAgLy8gQ29lcmNlIGxlbmd0aCB0byBhIG51bWJlciAocG9zc2libHkgTmFOKSwgcm91bmQgdXBcbiAgLy8gaW4gY2FzZSBpdCdzIGZyYWN0aW9uYWwgKGUuZy4gMTIzLjQ1NikgdGhlbiBkbyBhXG4gIC8vIGRvdWJsZSBuZWdhdGUgdG8gY29lcmNlIGEgTmFOIHRvIDAuIEVhc3ksIHJpZ2h0P1xuICBsZW5ndGggPSB+fk1hdGguY2VpbCgrbGVuZ3RoKVxuICByZXR1cm4gbGVuZ3RoIDwgMCA/IDAgOiBsZW5ndGhcbn1cblxuZnVuY3Rpb24gaXNBcnJheSAoc3ViamVjdCkge1xuICByZXR1cm4gKEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHN1YmplY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHN1YmplY3QpID09PSAnW29iamVjdCBBcnJheV0nXG4gIH0pKHN1YmplY3QpXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlpc2ggKHN1YmplY3QpIHtcbiAgcmV0dXJuIGlzQXJyYXkoc3ViamVjdCkgfHwgQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpIHx8XG4gICAgICBzdWJqZWN0ICYmIHR5cGVvZiBzdWJqZWN0ID09PSAnb2JqZWN0JyAmJlxuICAgICAgdHlwZW9mIHN1YmplY3QubGVuZ3RoID09PSAnbnVtYmVyJ1xufVxuXG5mdW5jdGlvbiB0b0hleCAobikge1xuICBpZiAobiA8IDE2KSByZXR1cm4gJzAnICsgbi50b1N0cmluZygxNilcbiAgcmV0dXJuIG4udG9TdHJpbmcoMTYpXG59XG5cbmZ1bmN0aW9uIHV0ZjhUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGIgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGlmIChiIDw9IDB4N0YpXG4gICAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSlcbiAgICBlbHNlIHtcbiAgICAgIHZhciBzdGFydCA9IGlcbiAgICAgIGlmIChiID49IDB4RDgwMCAmJiBiIDw9IDB4REZGRikgaSsrXG4gICAgICB2YXIgaCA9IGVuY29kZVVSSUNvbXBvbmVudChzdHIuc2xpY2Uoc3RhcnQsIGkrMSkpLnN1YnN0cigxKS5zcGxpdCgnJScpXG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGgubGVuZ3RoOyBqKyspXG4gICAgICAgIGJ5dGVBcnJheS5wdXNoKHBhcnNlSW50KGhbal0sIDE2KSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBhc2NpaVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAvLyBOb2RlJ3MgY29kZSBzZWVtcyB0byBiZSBkb2luZyB0aGlzIGFuZCBub3QgJiAweDdGLi5cbiAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSAmIDB4RkYpXG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBiYXNlNjRUb0J5dGVzIChzdHIpIHtcbiAgcmV0dXJuIGJhc2U2NC50b0J5dGVBcnJheShzdHIpXG59XG5cbmZ1bmN0aW9uIGJsaXRCdWZmZXIgKHNyYywgZHN0LCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgcG9zXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKGkgKyBvZmZzZXQgPj0gZHN0Lmxlbmd0aCkgfHwgKGkgPj0gc3JjLmxlbmd0aCkpXG4gICAgICBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIGRlY29kZVV0ZjhDaGFyIChzdHIpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHN0cilcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoMHhGRkZEKSAvLyBVVEYgOCBpbnZhbGlkIGNoYXJcbiAgfVxufVxuXG4vKlxuICogV2UgaGF2ZSB0byBtYWtlIHN1cmUgdGhhdCB0aGUgdmFsdWUgaXMgYSB2YWxpZCBpbnRlZ2VyLiBUaGlzIG1lYW5zIHRoYXQgaXRcbiAqIGlzIG5vbi1uZWdhdGl2ZS4gSXQgaGFzIG5vIGZyYWN0aW9uYWwgY29tcG9uZW50IGFuZCB0aGF0IGl0IGRvZXMgbm90XG4gKiBleGNlZWQgdGhlIG1heGltdW0gYWxsb3dlZCB2YWx1ZS5cbiAqL1xuZnVuY3Rpb24gdmVyaWZ1aW50ICh2YWx1ZSwgbWF4KSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlID49IDAsXG4gICAgICAnc3BlY2lmaWVkIGEgbmVnYXRpdmUgdmFsdWUgZm9yIHdyaXRpbmcgYW4gdW5zaWduZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgaXMgbGFyZ2VyIHRoYW4gbWF4aW11bSB2YWx1ZSBmb3IgdHlwZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmc2ludCh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZklFRUU3NTQodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbn1cblxuZnVuY3Rpb24gYXNzZXJ0ICh0ZXN0LCBtZXNzYWdlKSB7XG4gIGlmICghdGVzdCkgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UgfHwgJ0ZhaWxlZCBhc3NlcnRpb24nKVxufVxuIiwidmFyIGxvb2t1cCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcblxuOyhmdW5jdGlvbiAoZXhwb3J0cykge1xuXHQndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFyciA9ICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBVaW50OEFycmF5XG4gICAgOiBBcnJheVxuXG5cdHZhciBaRVJPICAgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgUExVUyAgID0gJysnLmNoYXJDb2RlQXQoMClcblx0dmFyIFNMQVNIICA9ICcvJy5jaGFyQ29kZUF0KDApXG5cdHZhciBOVU1CRVIgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgTE9XRVIgID0gJ2EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFVQUEVSICA9ICdBJy5jaGFyQ29kZUF0KDApXG5cblx0ZnVuY3Rpb24gZGVjb2RlIChlbHQpIHtcblx0XHR2YXIgY29kZSA9IGVsdC5jaGFyQ29kZUF0KDApXG5cdFx0aWYgKGNvZGUgPT09IFBMVVMpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdG1vZHVsZS5leHBvcnRzLnRvQnl0ZUFycmF5ID0gYjY0VG9CeXRlQXJyYXlcblx0bW9kdWxlLmV4cG9ydHMuZnJvbUJ5dGVBcnJheSA9IHVpbnQ4VG9CYXNlNjRcbn0oKSlcbiIsImV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXTtcblxuICBpICs9IGQ7XG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIHMgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBlTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgZSA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IG1MZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhcztcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpO1xuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbik7XG4gICAgZSA9IGUgLSBlQmlhcztcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKTtcbn07XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDA7XG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSk7XG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDA7XG4gICAgZSA9IGVNYXg7XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLTtcbiAgICAgIGMgKj0gMjtcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKys7XG4gICAgICBjIC89IDI7XG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMDtcbiAgICAgIGUgPSBlTWF4O1xuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSBlICsgZUJpYXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSAwO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpO1xuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG07XG4gIGVMZW4gKz0gbUxlbjtcbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KTtcblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjg7XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPVxyXG5cclxuICBmaXJzdDogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgWW91ciBmaXJzdCBMb29wU2NyaXB0LiBTb21lZGF5IHRoZXJlIHdpbGwgYmUgZG9jdW1lbnRhdGlvbiFcclxuXHJcbnRvbmUgbm90ZTFcclxuICBkdXJhdGlvbiAyNTBcclxuICBvY3RhdmUgNFxyXG4gIG5vdGUgQ1xyXG5cclxudG9uZSBiYXNzMVxyXG4gIGR1cmF0aW9uIDI1MFxyXG4gIG9jdGF2ZSAxXHJcbiAgbm90ZSBCXHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBub3RlMSB4Li4uLi4uLnguLi4uLi4uXHJcbiAgcGF0dGVybiBiYXNzMSAuLi4ueC4uLi4uLi54Li4uXHJcblxyXG5cIlwiXCJcclxuXHJcbiAgbm90ZXM6IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIE5vdGUgb3ZlcnJpZGVzIVxyXG5cclxuIyBUcnkgc2V0dGluZyB0aGUgZHVyYXRpb24gdG8gMTAwXHJcbnRvbmUgbm90ZTFcclxuICBhZHNyIDAuMDA1IDAuMDUgMC43IDAuMDVcclxuICBkdXJhdGlvbiAyNTBcclxuXHJcbiMgSWYgeW91IHVzZSBhbnkgbGV0dGVycyBvdGhlciB0aGFuIFwieFwiIG9uIGEgdG9uZSBwYXR0ZXJuLCB5b3Ugb3ZlcnJpZGUgaXRzXHJcbiMgbm90ZSB3aXRoIHRoZSBub3RlIGxpc3RlZC5cclxuXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIG5vdGUxIGIuYS5nLmEuYi5iLmIuXHJcblxyXG5cIlwiXCJcclxuXHJcbiAgbW90dG86IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFuIGFwcHJveGltYXRpb24gb2YgdGhlIGJlYXQgZnJvbSBEcmFrZSdzIFwiVGhlIE1vdHRvXCJcclxuXHJcbmJwbSAxMDBcclxuXHJcbnNlY3Rpb24gQmFzcyAoaW4gYSBzZWN0aW9uIHRvIHNoYXJlIEFEU1IpXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgdG9uZSBiYXNzMVxyXG4gICAgb2N0YXZlIDFcclxuICB0b25lIGJhc3MyXHJcbiAgICBvY3RhdmUgMlxyXG5cclxuc2FtcGxlIGNsYXBcclxuICBzcmMgc2FtcGxlcy9jbGFwLndhdlxyXG5zYW1wbGUgc25hcmVcclxuICBzcmMgc2FtcGxlcy9zbmFyZS53YXZcclxuc2FtcGxlIGhpaGF0XHJcbiAgc3JjIHNhbXBsZXMvaGloYXQud2F2XHJcblxyXG4jIFRPRE86IGZpeCBzbmFyZSBwYXR0ZXJuIHRvIG1hdGNoIHNvbmdcclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gaGloYXQgLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uLi54Li4uLi5cclxuICBwYXR0ZXJuIGNsYXAgIC4uLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uLi54Li4uXHJcbiAgcGF0dGVybiBzbmFyZSAuLi4uLi54Li4ueC4uLngueC4uLi4uLi4uLi4uLi4uLlxyXG4gIHBhdHRlcm4gYmFzczEgQmJiYmJiLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuICBwYXR0ZXJuIGJhc3MyIC4uLi4uLkhoaGhoaERkZGRkZC4uLi5IaGhoSmouSmouXHJcblxyXG50cmFjayBzb25nXHJcbiAgcGF0dGVybiBsb29wMSB4eHh4XHJcblxyXG5cIlwiXCJcclxuXHJcbiAgbGVuZ3RoOiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBTaG93aW5nIG9mZiB2YXJpb3VzIG5vdGUgbGVuZ3RocyB1c2luZyBjYXBzIGFuZCBsb3dlcmNhc2VcclxuIyBBbHNvIHNob3dzIHdoYXQgQURTUiBjYW4gZG8hXHJcblxyXG50b25lIG5vdGUxXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcblxyXG50b25lIG5vdGUyXHJcbiAgIyBOb3RlOiBPbmx5IHRoZSBmaXJzdCB0b25lIGhhcyBBRFNSXHJcblxyXG4jIElmIHlvdSB1c2UgYW55IGxldHRlcnMgb3RoZXIgdGhhbiBcInhcIiBvbiBhIHRvbmUgcGF0dGVybiwgeW91IG92ZXJyaWRlIGl0c1xyXG4jIG5vdGUgd2l0aCB0aGUgbm90ZSBsaXN0ZWQuIEFsc28sIGlmIHlvdSB1c2UgYW55IGNhcGl0YWwgbGV0dGVycyBpbiBhIHBhdHRlcm4sXHJcbiMgeW91IG92ZXJyaWRlIHRoZSBsZW5ndGggb2YgdGhhdCBub3RlIHdpdGggdGhlIG51bWJlciBvZiBtYXRjaGluZyBsb3dlcmNhc2VcclxuIyBsZXR0ZXJzIGZvbGxvd2luZyBpdC5cclxuXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIG5vdGUxIEdnZ2dnZ2dnRmZmZmZmLi5BYWFhQmJiLkNjLi5ELi4uXHJcblxyXG5sb29wIGxvb3AyXHJcbiAgcGF0dGVybiBub3RlMiBHZ2dnZ2dnZ0ZmZmZmZi4uQWFhYUJiYi5DYy4uRC4uLlxyXG5cclxudHJhY2sgc29uZ1xyXG4gIHBhdHRlcm4gbG9vcDEgeC5cclxuICBwYXR0ZXJuIGxvb3AyIC54XHJcblxyXG5cIlwiXCJcclxuIiwiZnJlcVRhYmxlID0gW1xyXG4gIHsgIyBPY3RhdmUgMFxyXG5cclxuICAgIFwiYVwiOiAyNy41MDAwXHJcbiAgICBcImxcIjogMjkuMTM1M1xyXG4gICAgXCJiXCI6IDMwLjg2NzdcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgMVxyXG4gICAgXCJjXCI6IDMyLjcwMzJcclxuICAgIFwiaFwiOiAzNC42NDc5XHJcbiAgICBcImRcIjogMzYuNzA4MVxyXG4gICAgXCJpXCI6IDM4Ljg5MDlcclxuICAgIFwiZVwiOiA0MS4yMDM1XHJcbiAgICBcImZcIjogNDMuNjUzNlxyXG4gICAgXCJqXCI6IDQ2LjI0OTNcclxuICAgIFwiZ1wiOiA0OC45OTk1XHJcbiAgICBcImtcIjogNTEuOTEzMFxyXG4gICAgXCJhXCI6IDU1LjAwMDBcclxuICAgIFwibFwiOiA1OC4yNzA1XHJcbiAgICBcImJcIjogNjEuNzM1NFxyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSAyXHJcbiAgICBcImNcIjogNjUuNDA2NFxyXG4gICAgXCJoXCI6IDY5LjI5NTdcclxuICAgIFwiZFwiOiA3My40MTYyXHJcbiAgICBcImlcIjogNzcuNzgxN1xyXG4gICAgXCJlXCI6IDgyLjQwNjlcclxuICAgIFwiZlwiOiA4Ny4zMDcxXHJcbiAgICBcImpcIjogOTIuNDk4NlxyXG4gICAgXCJnXCI6IDk3Ljk5ODlcclxuICAgIFwia1wiOiAxMDMuODI2XHJcbiAgICBcImFcIjogMTEwLjAwMFxyXG4gICAgXCJsXCI6IDExNi41NDFcclxuICAgIFwiYlwiOiAxMjMuNDcxXHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDNcclxuICAgIFwiY1wiOiAxMzAuODEzXHJcbiAgICBcImhcIjogMTM4LjU5MVxyXG4gICAgXCJkXCI6IDE0Ni44MzJcclxuICAgIFwiaVwiOiAxNTUuNTYzXHJcbiAgICBcImVcIjogMTY0LjgxNFxyXG4gICAgXCJmXCI6IDE3NC42MTRcclxuICAgIFwialwiOiAxODQuOTk3XHJcbiAgICBcImdcIjogMTk1Ljk5OFxyXG4gICAgXCJrXCI6IDIwNy42NTJcclxuICAgIFwiYVwiOiAyMjAuMDAwXHJcbiAgICBcImxcIjogMjMzLjA4MlxyXG4gICAgXCJiXCI6IDI0Ni45NDJcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgNFxyXG4gICAgXCJjXCI6IDI2MS42MjZcclxuICAgIFwiaFwiOiAyNzcuMTgzXHJcbiAgICBcImRcIjogMjkzLjY2NVxyXG4gICAgXCJpXCI6IDMxMS4xMjdcclxuICAgIFwiZVwiOiAzMjkuNjI4XHJcbiAgICBcImZcIjogMzQ5LjIyOFxyXG4gICAgXCJqXCI6IDM2OS45OTRcclxuICAgIFwiZ1wiOiAzOTEuOTk1XHJcbiAgICBcImtcIjogNDE1LjMwNVxyXG4gICAgXCJhXCI6IDQ0MC4wMDBcclxuICAgIFwibFwiOiA0NjYuMTY0XHJcbiAgICBcImJcIjogNDkzLjg4M1xyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSA1XHJcbiAgICBcImNcIjogNTIzLjI1MVxyXG4gICAgXCJoXCI6IDU1NC4zNjVcclxuICAgIFwiZFwiOiA1ODcuMzMwXHJcbiAgICBcImlcIjogNjIyLjI1NFxyXG4gICAgXCJlXCI6IDY1OS4yNTVcclxuICAgIFwiZlwiOiA2OTguNDU2XHJcbiAgICBcImpcIjogNzM5Ljk4OVxyXG4gICAgXCJnXCI6IDc4My45OTFcclxuICAgIFwia1wiOiA4MzAuNjA5XHJcbiAgICBcImFcIjogODgwLjAwMFxyXG4gICAgXCJsXCI6IDkzMi4zMjhcclxuICAgIFwiYlwiOiA5ODcuNzY3XHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDZcclxuICAgIFwiY1wiOiAxMDQ2LjUwXHJcbiAgICBcImhcIjogMTEwOC43M1xyXG4gICAgXCJkXCI6IDExNzQuNjZcclxuICAgIFwiaVwiOiAxMjQ0LjUxXHJcbiAgICBcImVcIjogMTMxOC41MVxyXG4gICAgXCJmXCI6IDEzOTYuOTFcclxuICAgIFwialwiOiAxNDc5Ljk4XHJcbiAgICBcImdcIjogMTU2Ny45OFxyXG4gICAgXCJrXCI6IDE2NjEuMjJcclxuICAgIFwiYVwiOiAxNzYwLjAwXHJcbiAgICBcImxcIjogMTg2NC42NlxyXG4gICAgXCJiXCI6IDE5NzUuNTNcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgN1xyXG4gICAgXCJjXCI6IDIwOTMuMDBcclxuICAgIFwiaFwiOiAyMjE3LjQ2XHJcbiAgICBcImRcIjogMjM0OS4zMlxyXG4gICAgXCJpXCI6IDI0ODkuMDJcclxuICAgIFwiZVwiOiAyNjM3LjAyXHJcbiAgICBcImZcIjogMjc5My44M1xyXG4gICAgXCJqXCI6IDI5NTkuOTZcclxuICAgIFwiZ1wiOiAzMTM1Ljk2XHJcbiAgICBcImtcIjogMzMyMi40NFxyXG4gICAgXCJhXCI6IDM1MjAuMDBcclxuICAgIFwibFwiOiAzNzI5LjMxXHJcbiAgICBcImJcIjogMzk1MS4wN1xyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSA4XHJcbiAgICBcImNcIjogNDE4Ni4wMVxyXG4gIH1cclxuXVxyXG5cclxubGVnYWxOb3RlUmVnZXggPSAvW2EtbF0vXHJcblxyXG5maW5kRnJlcSA9IChvY3RhdmUsIG5vdGUpIC0+XHJcbiAgbm90ZSA9IG5vdGUudG9Mb3dlckNhc2UoKVxyXG4gIGlmIChvY3RhdmUgPj0gMCkgYW5kIChvY3RhdmUgPCBmcmVxVGFibGUubGVuZ3RoKSBhbmQgbGVnYWxOb3RlUmVnZXgudGVzdChub3RlKVxyXG4gICAgb2N0YXZlVGFibGUgPSBmcmVxVGFibGVbb2N0YXZlXVxyXG4gICAgaWYgb2N0YXZlVGFibGU/IGFuZCBvY3RhdmVUYWJsZVtub3RlXT9cclxuICAgICAgcmV0dXJuIG9jdGF2ZVRhYmxlW25vdGVdXHJcbiAgcmV0dXJuIDQ0MC4wXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9XHJcbiAgZnJlcVRhYmxlOiBmcmVxVGFibGVcclxuICBmaW5kRnJlcTogZmluZEZyZXFcclxuIiwiIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgSW1wb3J0c1xyXG5cclxue21ha2VCbG9iVXJsfSA9IHJlcXVpcmUgXCJyaWZmd2F2ZVwiXHJcbntmaW5kRnJlcX0gICAgPSByZXF1aXJlICdmcmVxJ1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgSGVscGVyIGZ1bmN0aW9uc1xyXG5cclxuY2xvbmUgPSAob2JqKSAtPlxyXG4gIGlmIG5vdCBvYmo/IG9yIHR5cGVvZiBvYmogaXNudCAnb2JqZWN0J1xyXG4gICAgcmV0dXJuIG9ialxyXG5cclxuICBpZiBvYmogaW5zdGFuY2VvZiBEYXRlXHJcbiAgICByZXR1cm4gbmV3IERhdGUob2JqLmdldFRpbWUoKSlcclxuXHJcbiAgaWYgb2JqIGluc3RhbmNlb2YgUmVnRXhwXHJcbiAgICBmbGFncyA9ICcnXHJcbiAgICBmbGFncyArPSAnZycgaWYgb2JqLmdsb2JhbD9cclxuICAgIGZsYWdzICs9ICdpJyBpZiBvYmouaWdub3JlQ2FzZT9cclxuICAgIGZsYWdzICs9ICdtJyBpZiBvYmoubXVsdGlsaW5lP1xyXG4gICAgZmxhZ3MgKz0gJ3knIGlmIG9iai5zdGlja3k/XHJcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChvYmouc291cmNlLCBmbGFncylcclxuXHJcbiAgbmV3SW5zdGFuY2UgPSBuZXcgb2JqLmNvbnN0cnVjdG9yKClcclxuXHJcbiAgZm9yIGtleSBvZiBvYmpcclxuICAgIG5ld0luc3RhbmNlW2tleV0gPSBjbG9uZSBvYmpba2V5XVxyXG5cclxuICByZXR1cm4gbmV3SW5zdGFuY2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEluZGVudFN0YWNrIC0gdXNlZCBieSBQYXJzZXJcclxuXHJcbmNsYXNzIEluZGVudFN0YWNrXHJcbiAgY29uc3RydWN0b3I6IC0+XHJcbiAgICBAc3RhY2sgPSBbMF1cclxuXHJcbiAgcHVzaDogKGluZGVudCkgLT5cclxuICAgIEBzdGFjay5wdXNoIGluZGVudFxyXG5cclxuICBwb3A6IC0+XHJcbiAgICBpZiBAc3RhY2subGVuZ3RoID4gMVxyXG4gICAgICBAc3RhY2sucG9wKClcclxuICAgICAgcmV0dXJuIHRydWVcclxuICAgIHJldHVybiBmYWxzZVxyXG5cclxuICB0b3A6IC0+XHJcbiAgICByZXR1cm4gQHN0YWNrW0BzdGFjay5sZW5ndGggLSAxXVxyXG5cclxuY291bnRJbmRlbnQgPSAodGV4dCkgLT5cclxuICBpbmRlbnQgPSAwXHJcbiAgZm9yIGkgaW4gWzAuLi50ZXh0Lmxlbmd0aF1cclxuICAgIGlmIHRleHRbaV0gPT0gJ1xcdCdcclxuICAgICAgaW5kZW50ICs9IDhcclxuICAgIGVsc2VcclxuICAgICAgaW5kZW50KytcclxuICByZXR1cm4gaW5kZW50XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBQYXJzZXJcclxuXHJcbmNsYXNzIFBhcnNlclxyXG4gIGNvbnN0cnVjdG9yOiAoQGxvZykgLT5cclxuICAgIEBjb21tZW50UmVnZXggPSAvXihbXiNdKj8pKFxccyojLiopPyQvXHJcbiAgICBAb25seVdoaXRlc3BhY2VSZWdleCA9IC9eXFxzKiQvXHJcbiAgICBAaW5kZW50UmVnZXggPSAvXihcXHMqKShcXFMuKikkL1xyXG4gICAgQGxlYWRpbmdVbmRlcnNjb3JlUmVnZXggPSAvXl8vXHJcbiAgICBAaGFzQ2FwaXRhbExldHRlcnNSZWdleCA9IC9bQS1aXS9cclxuICAgIEBpc05vdGVSZWdleCA9IC9bQS1MYS1sXS9cclxuXHJcbiAgICAjIEgtTCBhcmUgdGhlIGJsYWNrIGtleXM6XHJcbiAgICAjICBIIEkgICBKIEsgTFxyXG4gICAgIyBDIEQgRSBGIEcgQSBCXHJcblxyXG4gICAgQG5hbWVkU3RhdGVzID1cclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICB3YXZlOiAnc2luZSdcclxuICAgICAgICBicG06IDEyMFxyXG4gICAgICAgIGR1cmF0aW9uOiAyMDBcclxuICAgICAgICBiZWF0czogNFxyXG4gICAgICAgIG9jdGF2ZTogNFxyXG4gICAgICAgIG5vdGU6ICdhJ1xyXG4gICAgICAgIHZvbHVtZTogMS4wXHJcbiAgICAgICAgYWRzcjogIyBuby1vcCBBRFNSIChmdWxsIDEuMCBzdXN0YWluKVxyXG4gICAgICAgICAgYTogMFxyXG4gICAgICAgICAgZDogMFxyXG4gICAgICAgICAgczogMVxyXG4gICAgICAgICAgcjogMVxyXG5cclxuICAgICMgaWYgYSBrZXkgaXMgcHJlc2VudCBpbiB0aGlzIG1hcCwgdGhhdCBuYW1lIGlzIGNvbnNpZGVyZWQgYW4gXCJvYmplY3RcIlxyXG4gICAgQG9iamVjdEtleXMgPVxyXG4gICAgICB0b25lOlxyXG4gICAgICAgIHdhdmU6ICdzdHJpbmcnXHJcbiAgICAgICAgZnJlcTogJ2Zsb2F0J1xyXG4gICAgICAgIGR1cmF0aW9uOiAnZmxvYXQnXHJcbiAgICAgICAgYWRzcjogJ2Fkc3InXHJcbiAgICAgICAgb2N0YXZlOiAnaW50J1xyXG4gICAgICAgIG5vdGU6ICdzdHJpbmcnXHJcbiAgICAgICAgdm9sdW1lOiAnZmxvYXQnXHJcblxyXG4gICAgICBzYW1wbGU6XHJcbiAgICAgICAgc3JjOiAnc3RyaW5nJ1xyXG4gICAgICAgIHZvbHVtZTogJ2Zsb2F0J1xyXG5cclxuICAgICAgbG9vcDpcclxuICAgICAgICBicG06ICdpbnQnXHJcbiAgICAgICAgYmVhdHM6ICdpbnQnXHJcblxyXG4gICAgICB0cmFjazoge31cclxuXHJcbiAgICBAaW5kZW50U3RhY2sgPSBuZXcgSW5kZW50U3RhY2tcclxuICAgIEBzdGF0ZVN0YWNrID0gW11cclxuICAgIEByZXNldCAnZGVmYXVsdCdcclxuICAgIEBvYmplY3RzID0ge31cclxuICAgIEBvYmplY3QgPSBudWxsXHJcbiAgICBAb2JqZWN0U2NvcGVSZWFkeSA9IGZhbHNlXHJcblxyXG4gIGlzT2JqZWN0VHlwZTogKHR5cGUpIC0+XHJcbiAgICByZXR1cm4gQG9iamVjdEtleXNbdHlwZV0/XHJcblxyXG4gIGVycm9yOiAodGV4dCkgLT5cclxuICAgIEBsb2cgXCJQQVJTRSBFUlJPUiwgbGluZSAje0BsaW5lTm99OiAje3RleHR9XCJcclxuXHJcbiAgcmVzZXQ6IChuYW1lKSAtPlxyXG4gICAgbmFtZSA/PSAnZGVmYXVsdCdcclxuICAgIGlmIG5vdCBAbmFtZWRTdGF0ZXNbbmFtZV1cclxuICAgICAgQGVycm9yIFwiaW52YWxpZCByZXNldCBuYW1lOiAje25hbWV9XCJcclxuICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICBAc3RhdGVTdGFjay5wdXNoIGNsb25lKEBuYW1lZFN0YXRlc1tuYW1lXSlcclxuICAgIHJldHVybiB0cnVlXHJcblxyXG4gIGZsYXR0ZW46ICgpIC0+XHJcbiAgICBmbGF0dGVuZWRTdGF0ZSA9IHt9XHJcbiAgICBmb3Igc3RhdGUgaW4gQHN0YXRlU3RhY2tcclxuICAgICAgZm9yIGtleSBvZiBzdGF0ZVxyXG4gICAgICAgIGZsYXR0ZW5lZFN0YXRlW2tleV0gPSBzdGF0ZVtrZXldXHJcbiAgICByZXR1cm4gZmxhdHRlbmVkU3RhdGVcclxuXHJcbiAgdHJhY2U6IChwcmVmaXgpIC0+XHJcbiAgICBwcmVmaXggPz0gJydcclxuICAgIEBsb2cgXCJ0cmFjZTogI3twcmVmaXh9IFwiICsgSlNPTi5zdHJpbmdpZnkoQGZsYXR0ZW4oKSlcclxuXHJcbiAgY3JlYXRlT2JqZWN0OiAoZGF0YS4uLikgLT5cclxuICAgICAgQGZpbmlzaE9iamVjdCgpXHJcblxyXG4gICAgICBAb2JqZWN0ID0ge31cclxuICAgICAgZm9yIGkgaW4gWzAuLi5kYXRhLmxlbmd0aF0gYnkgMlxyXG4gICAgICAgIEBvYmplY3RbZGF0YVtpXV0gPSBkYXRhW2krMV1cclxuICAgICAgQG9iamVjdFNjb3BlUmVhZHkgPSB0cnVlXHJcblxyXG4gICAgICBpZiBAb2JqZWN0Ll90eXBlID09ICdsb29wJ1xyXG4gICAgICAgIEBvYmplY3QuX3BhdHRlcm5zID0gW11cclxuXHJcbiAgICAgIGlmIEBvYmplY3QuX3R5cGUgPT0gJ3RyYWNrJ1xyXG4gICAgICAgIEBvYmplY3QuX3BhdHRlcm5zID0gW11cclxuXHJcbiAgICAgIGlmIEBvYmplY3QuX25hbWVcclxuICAgICAgICBAbGFzdE9iamVjdCA9IEBvYmplY3QuX25hbWVcclxuXHJcbiAgZmluaXNoT2JqZWN0OiAtPlxyXG4gICAgaWYgQG9iamVjdFxyXG4gICAgICBzdGF0ZSA9IEBmbGF0dGVuKClcclxuICAgICAgZm9yIGtleSBvZiBAb2JqZWN0S2V5c1tAb2JqZWN0Ll90eXBlXVxyXG4gICAgICAgIGV4cGVjdGVkVHlwZSA9IEBvYmplY3RLZXlzW0BvYmplY3QuX3R5cGVdW2tleV1cclxuICAgICAgICBpZiBzdGF0ZVtrZXldP1xyXG4gICAgICAgICAgdiA9IHN0YXRlW2tleV1cclxuICAgICAgICAgIEBvYmplY3Rba2V5XSA9IHN3aXRjaCBleHBlY3RlZFR5cGVcclxuICAgICAgICAgICAgd2hlbiAnaW50JyB0aGVuIHBhcnNlSW50KHYpXHJcbiAgICAgICAgICAgIHdoZW4gJ2Zsb2F0JyB0aGVuIHBhcnNlRmxvYXQodilcclxuICAgICAgICAgICAgZWxzZSB2XHJcbiAgICAgIEBvYmplY3RzW0BvYmplY3QuX25hbWVdID0gQG9iamVjdFxyXG4gICAgQG9iamVjdCA9IG51bGxcclxuXHJcbiAgY3JlYXRpbmdPYmplY3RUeXBlOiAodHlwZSkgLT5cclxuICAgIHJldHVybiBmYWxzZSBpZiBub3QgQG9iamVjdFxyXG4gICAgcmV0dXJuIGZhbHNlIGlmIG5vdCBAb2JqZWN0Ll90eXBlID09IHR5cGVcclxuICAgIHJldHVybiB0cnVlXHJcblxyXG4gIHB1c2hTY29wZTogLT5cclxuICAgIGlmIG5vdCBAb2JqZWN0U2NvcGVSZWFkeVxyXG4gICAgICBAZXJyb3IgXCJ1bmV4cGVjdGVkIGluZGVudFwiXHJcbiAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgQG9iamVjdFNjb3BlUmVhZHkgPSBmYWxzZVxyXG4gICAgQHN0YXRlU3RhY2sucHVzaCB7IF9zY29wZTogdHJ1ZSB9XHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuICBwb3BTY29wZTogLT5cclxuICAgIEBmaW5pc2hPYmplY3QoKVxyXG4gICAgbG9vcFxyXG4gICAgICBpZiBAc3RhdGVTdGFjay5sZW5ndGggPT0gMFxyXG4gICAgICAgIEBlcnJvciBcInN0YXRlIHN0YWNrIGlzIGVtcHR5ISBzb21ldGhpbmcgYmFkIGhhcyBoYXBwZW5lZFwiXHJcbiAgICAgIHRvcCA9IEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdXHJcbiAgICAgIGJyZWFrIGlmIHRvcC5fc2NvcGU/XHJcbiAgICAgIEBzdGF0ZVN0YWNrLnBvcCgpXHJcbiAgICBAc3RhdGVTdGFjay5wb3AoKVxyXG4gICAgcmV0dXJuIHRydWVcclxuXHJcbiAgcGFyc2VQYXR0ZXJuOiAocGF0dGVybikgLT5cclxuICAgIG92ZXJyaWRlTGVuZ3RoID0gQGhhc0NhcGl0YWxMZXR0ZXJzUmVnZXgudGVzdChwYXR0ZXJuKVxyXG4gICAgaSA9IDBcclxuICAgIHNvdW5kcyA9IFtdXHJcbiAgICB3aGlsZSBpIDwgcGF0dGVybi5sZW5ndGhcclxuICAgICAgYyA9IHBhdHRlcm5baV1cclxuICAgICAgaWYgYyAhPSAnLidcclxuICAgICAgICBzeW1ib2wgPSBjLnRvTG93ZXJDYXNlKClcclxuICAgICAgICBzb3VuZCA9IHsgb2Zmc2V0OiBpIH1cclxuICAgICAgICBpZiBAaXNOb3RlUmVnZXgudGVzdChjKVxyXG4gICAgICAgICAgc291bmQubm90ZSA9IHN5bWJvbFxyXG4gICAgICAgIGlmIG92ZXJyaWRlTGVuZ3RoXHJcbiAgICAgICAgICBsZW5ndGggPSAxXHJcbiAgICAgICAgICBsb29wXHJcbiAgICAgICAgICAgIG5leHQgPSBwYXR0ZXJuW2krMV1cclxuICAgICAgICAgICAgaWYgbmV4dCA9PSBzeW1ib2xcclxuICAgICAgICAgICAgICBsZW5ndGgrK1xyXG4gICAgICAgICAgICAgIGkrK1xyXG4gICAgICAgICAgICAgIGlmIGkgPT0gcGF0dGVybi5sZW5ndGhcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgc291bmQubGVuZ3RoID0gbGVuZ3RoXHJcbiAgICAgICAgc291bmRzLnB1c2ggc291bmRcclxuICAgICAgaSsrXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBsZW5ndGg6IHBhdHRlcm4ubGVuZ3RoXHJcbiAgICAgIHNvdW5kczogc291bmRzXHJcbiAgICB9XHJcblxyXG4gIHByb2Nlc3NUb2tlbnM6ICh0b2tlbnMpIC0+XHJcbiAgICBjbWQgPSB0b2tlbnNbMF0udG9Mb3dlckNhc2UoKVxyXG4gICAgaWYgY21kID09ICdyZXNldCdcclxuICAgICAgaWYgbm90IEByZXNldCh0b2tlbnNbMV0pXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICBlbHNlIGlmIGNtZCA9PSAnc2VjdGlvbidcclxuICAgICAgQG9iamVjdFNjb3BlUmVhZHkgPSB0cnVlXHJcbiAgICBlbHNlIGlmIEBpc09iamVjdFR5cGUoY21kKVxyXG4gICAgICBAY3JlYXRlT2JqZWN0ICdfdHlwZScsIGNtZCwgJ19uYW1lJywgdG9rZW5zWzFdXHJcbiAgICBlbHNlIGlmIGNtZCA9PSAncGF0dGVybidcclxuICAgICAgaWYgbm90IChAY3JlYXRpbmdPYmplY3RUeXBlKCdsb29wJykgb3IgQGNyZWF0aW5nT2JqZWN0VHlwZSgndHJhY2snKSlcclxuICAgICAgICBAZXJyb3IgXCJ1bmV4cGVjdGVkIHBhdHRlcm4gY29tbWFuZFwiXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlXHJcblxyXG4gICAgICBwYXR0ZXJuID0gQHBhcnNlUGF0dGVybih0b2tlbnNbMl0pXHJcbiAgICAgIHBhdHRlcm4uc3JjID0gdG9rZW5zWzFdXHJcbiAgICAgIEBvYmplY3QuX3BhdHRlcm5zLnB1c2ggcGF0dGVyblxyXG4gICAgZWxzZSBpZiBjbWQgPT0gJ2Fkc3InXHJcbiAgICAgIEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdW2NtZF0gPVxyXG4gICAgICAgIGE6IHBhcnNlRmxvYXQodG9rZW5zWzFdKVxyXG4gICAgICAgIGQ6IHBhcnNlRmxvYXQodG9rZW5zWzJdKVxyXG4gICAgICAgIHM6IHBhcnNlRmxvYXQodG9rZW5zWzNdKVxyXG4gICAgICAgIHI6IHBhcnNlRmxvYXQodG9rZW5zWzRdKVxyXG4gICAgZWxzZVxyXG4gICAgICAjIFRoZSBib3JpbmcgcmVndWxhciBjYXNlOiBzdGFzaCBvZmYgdGhpcyB2YWx1ZVxyXG4gICAgICBpZiBAbGVhZGluZ1VuZGVyc2NvcmVSZWdleC50ZXN0KGNtZClcclxuICAgICAgICBAZXJyb3IgXCJjYW5ub3Qgc2V0IGludGVybmFsIG5hbWVzICh1bmRlcnNjb3JlIHByZWZpeClcIlxyXG4gICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICBAc3RhdGVTdGFja1tAc3RhdGVTdGFjay5sZW5ndGggLSAxXVtjbWRdID0gdG9rZW5zWzFdXHJcblxyXG4gICAgcmV0dXJuIHRydWVcclxuXHJcbiAgcGFyc2U6ICh0ZXh0KSAtPlxyXG4gICAgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKVxyXG4gICAgQGxpbmVObyA9IDBcclxuICAgIGZvciBsaW5lIGluIGxpbmVzXHJcbiAgICAgIEBsaW5lTm8rK1xyXG4gICAgICBsaW5lID0gbGluZS5yZXBsYWNlKC8oXFxyXFxufFxcbnxcXHIpL2dtLFwiXCIpICMgc3RyaXAgbmV3bGluZXNcclxuICAgICAgbGluZSA9IEBjb21tZW50UmVnZXguZXhlYyhsaW5lKVsxXSAgICAgICAgIyBzdHJpcCBjb21tZW50cyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZVxyXG4gICAgICBjb250aW51ZSBpZiBAb25seVdoaXRlc3BhY2VSZWdleC50ZXN0KGxpbmUpXHJcbiAgICAgIFtfLCBpbmRlbnRUZXh0LCBsaW5lXSA9IEBpbmRlbnRSZWdleC5leGVjIGxpbmVcclxuICAgICAgaW5kZW50ID0gY291bnRJbmRlbnQgaW5kZW50VGV4dFxyXG5cclxuICAgICAgdG9wSW5kZW50ID0gQGluZGVudFN0YWNrLnRvcCgpXHJcbiAgICAgIGlmIGluZGVudCA9PSB0b3BJbmRlbnRcclxuICAgICAgICAjIGRvIG5vdGhpbmdcclxuICAgICAgZWxzZSBpZiBpbmRlbnQgPiB0b3BJbmRlbnRcclxuICAgICAgICBAaW5kZW50U3RhY2sucHVzaCBpbmRlbnRcclxuICAgICAgICBpZiBub3QgQHB1c2hTY29wZSgpXHJcbiAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgZWxzZVxyXG4gICAgICAgIGxvb3BcclxuICAgICAgICAgIGlmIG5vdCBAaW5kZW50U3RhY2sucG9wKClcclxuICAgICAgICAgICAgQGxvZyBcIlVuZXhwZWN0ZWQgaW5kZW50ICN7aW5kZW50fSBvbiBsaW5lICN7bGluZU5vfTogI3tsaW5lfVwiXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgICAgaWYgbm90IEBwb3BTY29wZSgpXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgICAgYnJlYWsgaWYgQGluZGVudFN0YWNrLnRvcCgpID09IGluZGVudFxyXG5cclxuICAgICAgaWYgbm90IEBwcm9jZXNzVG9rZW5zKGxpbmUuc3BsaXQoL1xccysvKSlcclxuICAgICAgICByZXR1cm4gZmFsc2VcclxuXHJcbiAgICB3aGlsZSBAaW5kZW50U3RhY2sucG9wKClcclxuICAgICAgQHBvcFNjb3BlKClcclxuXHJcbiAgICBAZmluaXNoT2JqZWN0KClcclxuICAgIHJldHVybiB0cnVlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBSZW5kZXJlclxyXG5cclxuY2xhc3MgUmVuZGVyZXJcclxuICBjb25zdHJ1Y3RvcjogKEBsb2csIEBzYW1wbGVSYXRlLCBAb2JqZWN0cykgLT5cclxuICAgIEBzYW1wbGVDYWNoZSA9IHt9XHJcblxyXG4gIGVycm9yOiAodGV4dCkgLT5cclxuICAgIEBsb2cgXCJSRU5ERVIgRVJST1I6ICN7dGV4dH1cIlxyXG5cclxuICBnZW5lcmF0ZUVudmVsb3BlOiAoYWRzciwgbGVuZ3RoKSAtPlxyXG4gICAgZW52ZWxvcGUgPSBBcnJheShsZW5ndGgpXHJcbiAgICBBdG9EID0gTWF0aC5mbG9vcihhZHNyLmEgKiBsZW5ndGgpXHJcbiAgICBEdG9TID0gTWF0aC5mbG9vcihhZHNyLmQgKiBsZW5ndGgpXHJcbiAgICBTdG9SID0gTWF0aC5mbG9vcihhZHNyLnIgKiBsZW5ndGgpXHJcbiAgICBhdHRhY2tMZW4gPSBBdG9EXHJcbiAgICBkZWNheUxlbiA9IER0b1MgLSBBdG9EXHJcbiAgICBzdXN0YWluTGVuID0gU3RvUiAtIER0b1NcclxuICAgIHJlbGVhc2VMZW4gPSBsZW5ndGggLSBTdG9SXHJcbiAgICBzdXN0YWluID0gYWRzci5zXHJcbiAgICBwZWFrU3VzdGFpbkRlbHRhID0gMS4wIC0gc3VzdGFpblxyXG4gICAgZm9yIGkgaW4gWzAuLi5hdHRhY2tMZW5dXHJcbiAgICAgICMgQXR0YWNrXHJcbiAgICAgIGVudmVsb3BlW2ldID0gaSAvIGF0dGFja0xlblxyXG4gICAgZm9yIGkgaW4gWzAuLi5kZWNheUxlbl1cclxuICAgICAgIyBEZWNheVxyXG4gICAgICBlbnZlbG9wZVtBdG9EICsgaV0gPSAxLjAgLSAocGVha1N1c3RhaW5EZWx0YSAqIChpIC8gZGVjYXlMZW4pKVxyXG4gICAgZm9yIGkgaW4gWzAuLi5zdXN0YWluTGVuXVxyXG4gICAgICAjIFN1c3RhaW5cclxuICAgICAgZW52ZWxvcGVbRHRvUyArIGldID0gc3VzdGFpblxyXG4gICAgZm9yIGkgaW4gWzAuLi5yZWxlYXNlTGVuXVxyXG4gICAgICAjIFJlbGVhc2VcclxuICAgICAgZW52ZWxvcGVbU3RvUiArIGldID0gc3VzdGFpbiAtIChzdXN0YWluICogKGkgLyByZWxlYXNlTGVuKSlcclxuICAgIHJldHVybiBlbnZlbG9wZVxyXG5cclxuICByZW5kZXJUb25lOiAodG9uZU9iaiwgb3ZlcnJpZGVzKSAtPlxyXG4gICAgb2Zmc2V0ID0gMFxyXG4gICAgYW1wbGl0dWRlID0gMTYwMDBcclxuICAgIGlmIG92ZXJyaWRlcy5sZW5ndGggPiAwXHJcbiAgICAgIGxlbmd0aCA9IG92ZXJyaWRlcy5sZW5ndGhcclxuICAgIGVsc2VcclxuICAgICAgbGVuZ3RoID0gTWF0aC5mbG9vcih0b25lT2JqLmR1cmF0aW9uICogQHNhbXBsZVJhdGUgLyAxMDAwKVxyXG4gICAgc2FtcGxlcyA9IEFycmF5KGxlbmd0aClcclxuICAgIEEgPSAyMDBcclxuICAgIEIgPSAwLjVcclxuICAgIGlmIG92ZXJyaWRlcy5ub3RlP1xyXG4gICAgICBmcmVxID0gZmluZEZyZXEodG9uZU9iai5vY3RhdmUsIG92ZXJyaWRlcy5ub3RlKVxyXG4gICAgZWxzZSBpZiB0b25lT2JqLmZyZXE/XHJcbiAgICAgIGZyZXEgPSB0b25lT2JqLmZyZXFcclxuICAgIGVsc2VcclxuICAgICAgZnJlcSA9IGZpbmRGcmVxKHRvbmVPYmoub2N0YXZlLCB0b25lT2JqLm5vdGUpXHJcbiAgICBlbnZlbG9wZSA9IEBnZW5lcmF0ZUVudmVsb3BlKHRvbmVPYmouYWRzciwgbGVuZ3RoKVxyXG4gICAgZm9yIGkgaW4gWzAuLi5sZW5ndGhdXHJcbiAgICAgIHBlcmlvZCA9IEBzYW1wbGVSYXRlIC8gZnJlcVxyXG4gICAgICBzaW5lID0gTWF0aC5zaW4ob2Zmc2V0ICsgaSAvIHBlcmlvZCAqIDIgKiBNYXRoLlBJKVxyXG4gICAgICAjIGlmKHRvbmVPYmoud2F2ID09IFwic3F1YXJlXCIpXHJcbiAgICAgICMgICBzaW5lID0gKHNpbmUgPiAwKSA/IDEgOiAtMVxyXG4gICAgICBzYW1wbGVzW2ldID0gc2luZSAqIGFtcGxpdHVkZSAqIGVudmVsb3BlW2ldICogdG9uZU9iai52b2x1bWVcclxuICAgIHJldHVybiBzYW1wbGVzXHJcblxyXG4gIHJlbmRlclNhbXBsZTogKHNhbXBsZU9iaikgLT5cclxuICAgIHZpZXcgPSBudWxsXHJcblxyXG4gICAgJC5hamF4IHtcclxuICAgICAgdXJsOiBzYW1wbGVPYmouc3JjXHJcbiAgICAgIG1pbWVUeXBlOiAndGV4dC9wbGFpbjsgY2hhcnNldD14LXVzZXItZGVmaW5lZCdcclxuICAgICAgc3VjY2VzczogKGRhdGEpIC0+XHJcbiAgICAgICAgY29uc29sZS5sb2cgXCJkYXRhIGxlbmd0aCAje2RhdGEubGVuZ3RofVwiXHJcbiAgICAgICAgdmlldyA9IG5ldyBqRGF0YVZpZXcoZGF0YSwgMCwgZGF0YS5sZW5ndGgsIHRydWUpXHJcbiAgICAgIGFzeW5jOiBmYWxzZVxyXG4gICAgfVxyXG5cclxuICAgIGlmIG5vdCB2aWV3XHJcbiAgICAgIHJldHVybiBbXVxyXG5cclxuICAgIGNvbnNvbGUubG9nIFwiI3tzYW1wbGVPYmouc3JjfSBpcyAje3ZpZXcuYnl0ZUxlbmd0aH0gaW4gc2l6ZVwiXHJcblxyXG4gICAgIyBza2lwIHRoZSBmaXJzdCA0MCBieXRlc1xyXG4gICAgdmlldy5zZWVrKDQwKVxyXG4gICAgc3ViY2h1bmsyU2l6ZSA9IHZpZXcuZ2V0SW50MzIoKVxyXG4gICAgY29uc29sZS5sb2cgXCJzdWJjaHVuazJTaXplIGlzICN7c3ViY2h1bmsyU2l6ZX1cIlxyXG5cclxuICAgIHNhbXBsZXMgPSBbXVxyXG4gICAgd2hpbGUgdmlldy50ZWxsKCkrMSA8IHZpZXcuYnl0ZUxlbmd0aFxyXG4gICAgICBzYW1wbGVzLnB1c2ggdmlldy5nZXRJbnQxNigpXHJcbiAgICBjb25zb2xlLmxvZyBcImxvb3BlZCAje3NhbXBsZXMubGVuZ3RofSB0aW1lc1wiXHJcblxyXG4gICAgZm9yIGkgaW4gWzAuLi5zYW1wbGVzLmxlbmd0aF1cclxuICAgICAgc2FtcGxlc1tpXSAqPSBzYW1wbGVPYmoudm9sdW1lXHJcblxyXG4gICAgcmV0dXJuIHNhbXBsZXNcclxuXHJcbiAgcmVuZGVyUGF0dGVybnM6IChwYXR0ZXJucywgdG90YWxMZW5ndGgsIGNhbGNPZmZzZXRMZW5ndGgpIC0+XHJcbiAgICBzYW1wbGVzID0gQXJyYXkodG90YWxMZW5ndGgpXHJcbiAgICBmb3IgaSBpbiBbMC4uLnRvdGFsTGVuZ3RoXVxyXG4gICAgICBzYW1wbGVzW2ldID0gMFxyXG5cclxuICAgIGZvciBwYXR0ZXJuIGluIHBhdHRlcm5zXHJcbiAgICAgIGZvciBzb3VuZCBpbiBwYXR0ZXJuLnNvdW5kc1xyXG4gICAgICAgIG92ZXJyaWRlcyA9IHt9XHJcbiAgICAgICAgc2VjdGlvbkNvdW50ID0gcGF0dGVybi5sZW5ndGggLyAxNlxyXG4gICAgICAgIG9mZnNldExlbmd0aCA9IE1hdGguZmxvb3IodG90YWxMZW5ndGggLyAxNiAvIHNlY3Rpb25Db3VudClcclxuICAgICAgICBpZiBzb3VuZC5sZW5ndGggPiAwXHJcbiAgICAgICAgICBvdmVycmlkZXMubGVuZ3RoID0gc291bmQubGVuZ3RoICogb2Zmc2V0TGVuZ3RoXHJcbiAgICAgICAgaWYgc291bmQubm90ZT9cclxuICAgICAgICAgIG92ZXJyaWRlcy5ub3RlID0gc291bmQubm90ZVxyXG5cclxuICAgICAgICBzcmNTYW1wbGVzID0gQHJlbmRlcihwYXR0ZXJuLnNyYywgb3ZlcnJpZGVzKVxyXG4gICAgICAgIGlmIG5vdCBjYWxjT2Zmc2V0TGVuZ3RoXHJcbiAgICAgICAgICBvZmZzZXRMZW5ndGggPSBzcmNTYW1wbGVzLmxlbmd0aFxyXG5cclxuICAgICAgICBvZmZzZXQgPSBzb3VuZC5vZmZzZXQgKiBvZmZzZXRMZW5ndGhcclxuICAgICAgICBjb3B5TGVuID0gc3JjU2FtcGxlcy5sZW5ndGhcclxuICAgICAgICBpZiAob2Zmc2V0ICsgY29weUxlbikgPiB0b3RhbExlbmd0aFxyXG4gICAgICAgICAgY29weUxlbiA9IHRvdGFsTGVuZ3RoIC0gb2Zmc2V0XHJcbiAgICAgICAgZm9yIGogaW4gWzAuLi5jb3B5TGVuXVxyXG4gICAgICAgICAgc2FtcGxlc1tvZmZzZXQgKyBqXSArPSBzcmNTYW1wbGVzW2pdXHJcblxyXG4gICAgcmV0dXJuIHNhbXBsZXNcclxuXHJcbiAgcmVuZGVyTG9vcDogKGxvb3BPYmopIC0+XHJcbiAgICBiZWF0Q291bnQgPSAwXHJcbiAgICBmb3IgcGF0dGVybiBpbiBsb29wT2JqLl9wYXR0ZXJuc1xyXG4gICAgICBpZiBiZWF0Q291bnQgPCBwYXR0ZXJuLmxlbmd0aFxyXG4gICAgICAgIGJlYXRDb3VudCA9IHBhdHRlcm4ubGVuZ3RoXHJcblxyXG4gICAgc2FtcGxlc1BlckJlYXQgPSBAc2FtcGxlUmF0ZSAvIChsb29wT2JqLmJwbSAvIDYwKSAvIGxvb3BPYmouYmVhdHNcclxuICAgIGxvb3BMZW5ndGggPSBzYW1wbGVzUGVyQmVhdCAqIGJlYXRDb3VudFxyXG5cclxuICAgIHJldHVybiBAcmVuZGVyUGF0dGVybnMobG9vcE9iai5fcGF0dGVybnMsIGxvb3BMZW5ndGgsIHRydWUpXHJcblxyXG4gIHJlbmRlclRyYWNrOiAodHJhY2tPYmopIC0+XHJcbiAgICB0cmFja0xlbmd0aCA9IDBcclxuICAgIGZvciBwYXR0ZXJuIGluIHRyYWNrT2JqLl9wYXR0ZXJuc1xyXG4gICAgICBzcmNTYW1wbGVzID0gQHJlbmRlcihwYXR0ZXJuLnNyYylcclxuICAgICAgcGF0dGVybkxlbmd0aCA9IHNyY1NhbXBsZXMubGVuZ3RoICogcGF0dGVybi5sZW5ndGhcclxuICAgICAgaWYgdHJhY2tMZW5ndGggPCBwYXR0ZXJuTGVuZ3RoXHJcbiAgICAgICAgdHJhY2tMZW5ndGggPSBwYXR0ZXJuTGVuZ3RoXHJcblxyXG4gICAgcmV0dXJuIEByZW5kZXJQYXR0ZXJucyh0cmFja09iai5fcGF0dGVybnMsIHRyYWNrTGVuZ3RoLCBmYWxzZSlcclxuXHJcbiAgY2FsY0NhY2hlTmFtZTogKHR5cGUsIHdoaWNoLCBvdmVycmlkZXMpIC0+XHJcbiAgICBpZiB0eXBlICE9ICd0b25lJ1xyXG4gICAgICByZXR1cm4gd2hpY2hcclxuXHJcbiAgICBuYW1lID0gd2hpY2hcclxuICAgIGlmIG92ZXJyaWRlcy5ub3RlXHJcbiAgICAgIG5hbWUgKz0gXCIvTiN7b3ZlcnJpZGVzLm5vdGV9XCJcclxuICAgIGlmIG92ZXJyaWRlcy5sZW5ndGhcclxuICAgICAgbmFtZSArPSBcIi9MI3tvdmVycmlkZXMubGVuZ3RofVwiXHJcblxyXG4gICAgcmV0dXJuIG5hbWVcclxuXHJcbiAgcmVuZGVyOiAod2hpY2gsIG92ZXJyaWRlcykgLT5cclxuICAgIG9iamVjdCA9IEBvYmplY3RzW3doaWNoXVxyXG4gICAgaWYgbm90IG9iamVjdFxyXG4gICAgICBAZXJyb3IgXCJubyBzdWNoIG9iamVjdCAje3doaWNofVwiXHJcbiAgICAgIHJldHVybiBudWxsXHJcblxyXG4gICAgY2FjaGVOYW1lID0gQGNhbGNDYWNoZU5hbWUob2JqZWN0Ll90eXBlLCB3aGljaCwgb3ZlcnJpZGVzKVxyXG4gICAgaWYgQHNhbXBsZUNhY2hlW2NhY2hlTmFtZV1cclxuICAgICAgcmV0dXJuIEBzYW1wbGVDYWNoZVtjYWNoZU5hbWVdXHJcblxyXG4gICAgc2FtcGxlcyA9IHN3aXRjaCBvYmplY3QuX3R5cGVcclxuICAgICAgd2hlbiAndG9uZScgdGhlbiBAcmVuZGVyVG9uZShvYmplY3QsIG92ZXJyaWRlcylcclxuICAgICAgd2hlbiAnbG9vcCcgdGhlbiBAcmVuZGVyTG9vcChvYmplY3QpXHJcbiAgICAgIHdoZW4gJ3RyYWNrJyB0aGVuIEByZW5kZXJUcmFjayhvYmplY3QpXHJcbiAgICAgIHdoZW4gJ3NhbXBsZScgdGhlbiBAcmVuZGVyU2FtcGxlKG9iamVjdClcclxuICAgICAgZWxzZVxyXG4gICAgICAgIEBlcnJvciBcInVua25vd24gdHlwZSAje29iamVjdC5fdHlwZX1cIlxyXG4gICAgICAgIG51bGxcclxuXHJcbiAgICBAbG9nIFwiUmVuZGVyZWQgI3tjYWNoZU5hbWV9LlwiXHJcbiAgICBAc2FtcGxlQ2FjaGVbY2FjaGVOYW1lXSA9IHNhbXBsZXNcclxuICAgIHJldHVybiBzYW1wbGVzXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBFeHBvcnRzXHJcblxyXG5yZW5kZXJMb29wU2NyaXB0ID0gKGxvb3BzY3JpcHQsIGxvZ0NCKSAtPlxyXG4gIGxvZ0NCIFwiUGFyc2luZy4uLlwiXHJcbiAgcGFyc2VyID0gbmV3IFBhcnNlcihsb2dDQilcclxuICBwYXJzZXIucGFyc2UgbG9vcHNjcmlwdFxyXG5cclxuICBpZiBwYXJzZXIubGFzdE9iamVjdFxyXG4gICAgc2FtcGxlUmF0ZSA9IDQ0MTAwXHJcbiAgICBsb2dDQiBcIlJlbmRlcmluZy4uLlwiXHJcbiAgICByZW5kZXJlciA9IG5ldyBSZW5kZXJlcihsb2dDQiwgc2FtcGxlUmF0ZSwgcGFyc2VyLm9iamVjdHMpXHJcbiAgICBvdXRwdXRTYW1wbGVzID0gcmVuZGVyZXIucmVuZGVyKHBhcnNlci5sYXN0T2JqZWN0KVxyXG4gICAgcmV0dXJuIG1ha2VCbG9iVXJsKHNhbXBsZVJhdGUsIG91dHB1dFNhbXBsZXMpXHJcblxyXG4gIHJldHVybiBudWxsXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9XHJcbiAgcmVuZGVyOiByZW5kZXJMb29wU2NyaXB0XHJcbiIsImZzID0gcmVxdWlyZSBcImZzXCJcclxuXHJcbmNsYXNzIEZhc3RCYXNlNjRcclxuXHJcbiAgY29uc3RydWN0b3I6IC0+XHJcbiAgICBAY2hhcnMgPSBcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky89XCJcclxuICAgIEBlbmNMb29rdXAgPSBbXVxyXG4gICAgZm9yIGkgaW4gWzAuLi40MDk2XVxyXG4gICAgICBAZW5jTG9va3VwW2ldID0gQGNoYXJzW2kgPj4gNl0gKyBAY2hhcnNbaSAmIDB4M0ZdXHJcblxyXG4gIGVuY29kZTogKHNyYykgLT5cclxuICAgIGxlbiA9IHNyYy5sZW5ndGhcclxuICAgIGRzdCA9ICcnXHJcbiAgICBpID0gMFxyXG4gICAgd2hpbGUgKGxlbiA+IDIpXHJcbiAgICAgIG4gPSAoc3JjW2ldIDw8IDE2KSB8IChzcmNbaSsxXTw8OCkgfCBzcmNbaSsyXVxyXG4gICAgICBkc3QrPSB0aGlzLmVuY0xvb2t1cFtuID4+IDEyXSArIHRoaXMuZW5jTG9va3VwW24gJiAweEZGRl1cclxuICAgICAgbGVuLT0gM1xyXG4gICAgICBpKz0gM1xyXG4gICAgaWYgKGxlbiA+IDApXHJcbiAgICAgIG4xPSAoc3JjW2ldICYgMHhGQykgPj4gMlxyXG4gICAgICBuMj0gKHNyY1tpXSAmIDB4MDMpIDw8IDRcclxuICAgICAgaWYgKGxlbiA+IDEpXHJcbiAgICAgICAgbjIgfD0gKHNyY1srK2ldICYgMHhGMCkgPj4gNFxyXG4gICAgICBkc3QrPSB0aGlzLmNoYXJzW24xXVxyXG4gICAgICBkc3QrPSB0aGlzLmNoYXJzW24yXVxyXG4gICAgICBpZiAobGVuID09IDIpXHJcbiAgICAgICAgbjM9IChzcmNbaSsrXSAmIDB4MEYpIDw8IDJcclxuICAgICAgICBuMyB8PSAoc3JjW2ldICYgMHhDMCkgPj4gNlxyXG4gICAgICAgIGRzdCs9IHRoaXMuY2hhcnNbbjNdXHJcbiAgICAgIGlmIChsZW4gPT0gMSlcclxuICAgICAgICBkc3QrPSAnPSdcclxuICAgICAgZHN0Kz0gJz0nXHJcblxyXG4gICAgcmV0dXJuIGRzdFxyXG5cclxuY2xhc3MgUklGRldBVkVcclxuICBjb25zdHJ1Y3RvcjogKEBzYW1wbGVSYXRlLCBAZGF0YSkgLT5cclxuICAgIEB3YXYgPSBbXSAgICAgIyBBcnJheSBjb250YWluaW5nIHRoZSBnZW5lcmF0ZWQgd2F2ZSBmaWxlXHJcbiAgICBAaGVhZGVyID0gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIyBPRkZTIFNJWkUgTk9URVNcclxuICAgICAgY2h1bmtJZCAgICAgIDogWzB4NTIsMHg0OSwweDQ2LDB4NDZdLCAjIDAgICAgNCAgXCJSSUZGXCIgPSAweDUyNDk0NjQ2XHJcbiAgICAgIGNodW5rU2l6ZSAgICA6IDAsICAgICAgICAgICAgICAgICAgICAgIyA0ICAgIDQgIDM2K1N1YkNodW5rMlNpemUgPSA0Kyg4K1N1YkNodW5rMVNpemUpKyg4K1N1YkNodW5rMlNpemUpXHJcbiAgICAgIGZvcm1hdCAgICAgICA6IFsweDU3LDB4NDEsMHg1NiwweDQ1XSwgIyA4ICAgIDQgIFwiV0FWRVwiID0gMHg1NzQxNTY0NVxyXG4gICAgICBzdWJDaHVuazFJZCAgOiBbMHg2NiwweDZkLDB4NzQsMHgyMF0sICMgMTIgICA0ICBcImZtdCBcIiA9IDB4NjY2ZDc0MjBcclxuICAgICAgc3ViQ2h1bmsxU2l6ZTogMTYsICAgICAgICAgICAgICAgICAgICAjIDE2ICAgNCAgMTYgZm9yIFBDTVxyXG4gICAgICBhdWRpb0Zvcm1hdCAgOiAxLCAgICAgICAgICAgICAgICAgICAgICMgMjAgICAyICBQQ00gPSAxXHJcbiAgICAgIG51bUNoYW5uZWxzICA6IDEsICAgICAgICAgICAgICAgICAgICAgIyAyMiAgIDIgIE1vbm8gPSAxLCBTdGVyZW8gPSAyLi4uXHJcbiAgICAgIHNhbXBsZVJhdGUgICA6IEBzYW1wbGVSYXRlLCAgICAgICAgICAgIyAyNCAgIDQgIDgwMDAsIDQ0MTAwLi4uXHJcbiAgICAgIGJ5dGVSYXRlICAgICA6IDAsICAgICAgICAgICAgICAgICAgICAgIyAyOCAgIDQgIFNhbXBsZVJhdGUqTnVtQ2hhbm5lbHMqQml0c1BlclNhbXBsZS84XHJcbiAgICAgIGJsb2NrQWxpZ24gICA6IDAsICAgICAgICAgICAgICAgICAgICAgIyAzMiAgIDIgIE51bUNoYW5uZWxzKkJpdHNQZXJTYW1wbGUvOFxyXG4gICAgICBiaXRzUGVyU2FtcGxlOiAxNiwgICAgICAgICAgICAgICAgICAgICMgMzQgICAyICA4IGJpdHMgPSA4LCAxNiBiaXRzID0gMTZcclxuICAgICAgc3ViQ2h1bmsySWQgIDogWzB4NjQsMHg2MSwweDc0LDB4NjFdLCAjIDM2ICAgNCAgXCJkYXRhXCIgPSAweDY0NjE3NDYxXHJcbiAgICAgIHN1YkNodW5rMlNpemU6IDAgICAgICAgICAgICAgICAgICAgICAgIyA0MCAgIDQgIGRhdGEgc2l6ZSA9IE51bVNhbXBsZXMqTnVtQ2hhbm5lbHMqQml0c1BlclNhbXBsZS84XHJcblxyXG4gICAgQGdlbmVyYXRlKClcclxuXHJcbiAgdTMyVG9BcnJheTogKGkpIC0+XHJcbiAgICByZXR1cm4gW2kmMHhGRiwgKGk+PjgpJjB4RkYsIChpPj4xNikmMHhGRiwgKGk+PjI0KSYweEZGXVxyXG5cclxuICB1MTZUb0FycmF5OiAoaSkgLT5cclxuICAgIHJldHVybiBbaSYweEZGLCAoaT4+OCkmMHhGRl1cclxuXHJcbiAgc3BsaXQxNmJpdEFycmF5OiAoZGF0YSkgLT5cclxuICAgIHIgPSBbXVxyXG4gICAgaiA9IDBcclxuICAgIGxlbiA9IGRhdGEubGVuZ3RoXHJcbiAgICBmb3IgaSBpbiBbMC4uLmxlbl1cclxuICAgICAgcltqKytdID0gZGF0YVtpXSAmIDB4RkZcclxuICAgICAgcltqKytdID0gKGRhdGFbaV0+PjgpICYgMHhGRlxyXG5cclxuICAgIHJldHVybiByXHJcblxyXG4gIGdlbmVyYXRlOiAtPlxyXG4gICAgQGhlYWRlci5ibG9ja0FsaWduID0gKEBoZWFkZXIubnVtQ2hhbm5lbHMgKiBAaGVhZGVyLmJpdHNQZXJTYW1wbGUpID4+IDNcclxuICAgIEBoZWFkZXIuYnl0ZVJhdGUgPSBAaGVhZGVyLmJsb2NrQWxpZ24gKiBAc2FtcGxlUmF0ZVxyXG4gICAgQGhlYWRlci5zdWJDaHVuazJTaXplID0gQGRhdGEubGVuZ3RoICogKEBoZWFkZXIuYml0c1BlclNhbXBsZSA+PiAzKVxyXG4gICAgQGhlYWRlci5jaHVua1NpemUgPSAzNiArIEBoZWFkZXIuc3ViQ2h1bmsyU2l6ZVxyXG5cclxuICAgIGlmIEBoZWFkZXIuYml0c1BlclNhbXBsZSA9PSAxNlxyXG4gICAgICBAZGF0YSA9IEBzcGxpdDE2Yml0QXJyYXkoQGRhdGEpXHJcblxyXG4gICAgQHdhdiA9IEBoZWFkZXIuY2h1bmtJZC5jb25jYXQoXHJcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuY2h1bmtTaXplKSxcclxuICAgICAgQGhlYWRlci5mb3JtYXQsXHJcbiAgICAgIEBoZWFkZXIuc3ViQ2h1bmsxSWQsXHJcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuc3ViQ2h1bmsxU2l6ZSksXHJcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIuYXVkaW9Gb3JtYXQpLFxyXG4gICAgICBAdTE2VG9BcnJheShAaGVhZGVyLm51bUNoYW5uZWxzKSxcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5zYW1wbGVSYXRlKSxcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5ieXRlUmF0ZSksXHJcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIuYmxvY2tBbGlnbiksXHJcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIuYml0c1BlclNhbXBsZSksXHJcbiAgICAgIEBoZWFkZXIuc3ViQ2h1bmsySWQsXHJcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuc3ViQ2h1bmsyU2l6ZSksXHJcbiAgICAgIEBkYXRhXHJcbiAgICApXHJcbiAgICBmYiA9IG5ldyBGYXN0QmFzZTY0XHJcbiAgICBAYmFzZTY0RGF0YSA9IGZiLmVuY29kZShAd2F2KVxyXG4gICAgQGRhdGFVUkkgPSAnZGF0YTphdWRpby93YXY7YmFzZTY0LCcgKyBAYmFzZTY0RGF0YVxyXG5cclxuICByYXc6IC0+XHJcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihAYmFzZTY0RGF0YSwgXCJiYXNlNjRcIilcclxuXHJcbndyaXRlV0FWID0gKGZpbGVuYW1lLCBzYW1wbGVSYXRlLCBzYW1wbGVzKSAtPlxyXG4gIHdhdmUgPSBuZXcgUklGRldBVkUgc2FtcGxlUmF0ZSwgc2FtcGxlc1xyXG4gIGZzLndyaXRlRmlsZVN5bmMoZmlsZW5hbWUsIHdhdmUucmF3KCkpXHJcbiAgcmV0dXJuIHRydWVcclxuXHJcbm1ha2VEYXRhVVJJID0gKHNhbXBsZVJhdGUsIHNhbXBsZXMpIC0+XHJcbiAgd2F2ZSA9IG5ldyBSSUZGV0FWRSBzYW1wbGVSYXRlLCBzYW1wbGVzXHJcbiAgcmV0dXJuIHdhdmUuZGF0YVVSSVxyXG5cclxuYjY0dG9CbG9iID0gKGI2NERhdGEsIGNvbnRlbnRUeXBlLCBzbGljZVNpemUpIC0+XHJcbiAgY29udGVudFR5cGUgPSBjb250ZW50VHlwZSB8fCAnJ1xyXG4gIHNsaWNlU2l6ZSA9IHNsaWNlU2l6ZSB8fCA1MTJcclxuXHJcbiAgYnl0ZUNoYXJhY3RlcnMgPSBhdG9iKGI2NERhdGEpXHJcbiAgYnl0ZUFycmF5cyA9IFtdXHJcblxyXG4gIGZvciBvZmZzZXQgaW4gWzAuLi5ieXRlQ2hhcmFjdGVycy5sZW5ndGhdIGJ5IHNsaWNlU2l6ZVxyXG4gICAgc2xpY2UgPSBieXRlQ2hhcmFjdGVycy5zbGljZShvZmZzZXQsIG9mZnNldCArIHNsaWNlU2l6ZSlcclxuXHJcbiAgICBieXRlTnVtYmVycyA9IG5ldyBBcnJheShzbGljZS5sZW5ndGgpXHJcbiAgICBmb3IgaSBpbiBbMC4uLnNsaWNlLmxlbmd0aF1cclxuICAgICAgYnl0ZU51bWJlcnNbaV0gPSBzbGljZS5jaGFyQ29kZUF0KGkpXHJcblxyXG4gICAgYnl0ZUFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnl0ZU51bWJlcnMpXHJcblxyXG4gICAgYnl0ZUFycmF5cy5wdXNoKGJ5dGVBcnJheSlcclxuXHJcbiAgYmxvYiA9IG5ldyBCbG9iKGJ5dGVBcnJheXMsIHt0eXBlOiBjb250ZW50VHlwZX0pXHJcbiAgcmV0dXJuIGJsb2JcclxuXHJcbm1ha2VCbG9iVXJsID0gKHNhbXBsZVJhdGUsIHNhbXBsZXMpIC0+XHJcbiAgd2F2ZSA9IG5ldyBSSUZGV0FWRSBzYW1wbGVSYXRlLCBzYW1wbGVzXHJcbiAgYmxvYiA9IGI2NHRvQmxvYih3YXZlLmJhc2U2NERhdGEsIFwiYXVkaW8vd2F2XCIpXHJcbiAgcmV0dXJuIFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYilcclxuXHJcbm1vZHVsZS5leHBvcnRzID1cclxuICBSSUZGV0FWRTogUklGRldBVkVcclxuICB3cml0ZVdBVjogd3JpdGVXQVZcclxuICBtYWtlRGF0YVVSSTogbWFrZURhdGFVUklcclxuICBtYWtlQmxvYlVybDogbWFrZUJsb2JVcmxcclxuIl19
