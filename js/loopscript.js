require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (Buffer){
//
// jDataView by Vjeux <vjeuxx@gmail.com> - Jan 2010
// Continued by RReverser <me@rreverser.com> - Feb 2013
//
// A unique way to work with a binary file in the browser
// http://github.com/jDataView/jDataView
// http://jDataView.github.io/

(function (global) {

'use strict';

var compatibility = {
	// NodeJS Buffer in v0.5.5 and newer
	NodeBuffer: 'Buffer' in global && 'readInt16LE' in Buffer.prototype,
	DataView: 'DataView' in global && (
		'getFloat64' in DataView.prototype ||            // Chrome
		'getFloat64' in new DataView(new ArrayBuffer(1)) // Node
	),
	ArrayBuffer: 'ArrayBuffer' in global,
	PixelData: 'CanvasPixelArray' in global && 'ImageData' in global && 'document' in global
};

// we don't want to bother with old Buffer implementation
if (compatibility.NodeBuffer) {
	(function (buffer) {
		try {
			buffer.writeFloatLE(Infinity, 0);
		} catch (e) {
			compatibility.NodeBuffer = false;
		}
	})(new Buffer(4));
}

if (compatibility.PixelData) {
	var createPixelData = function (byteLength, buffer) {
		var data = createPixelData.context2d.createImageData((byteLength + 3) / 4, 1).data;
		data.byteLength = byteLength;
		if (buffer !== undefined) {
			for (var i = 0; i < byteLength; i++) {
				data[i] = buffer[i];
			}
		}
		return data;
	};
	createPixelData.context2d = document.createElement('canvas').getContext('2d');
}

var dataTypes = {
	'Int8': 1,
	'Int16': 2,
	'Int32': 4,
	'Uint8': 1,
	'Uint16': 2,
	'Uint32': 4,
	'Float32': 4,
	'Float64': 8
};

var nodeNaming = {
	'Int8': 'Int8',
	'Int16': 'Int16',
	'Int32': 'Int32',
	'Uint8': 'UInt8',
	'Uint16': 'UInt16',
	'Uint32': 'UInt32',
	'Float32': 'Float',
	'Float64': 'Double'
};

function arrayFrom(arrayLike, forceCopy) {
	return (!forceCopy && (arrayLike instanceof Array)) ? arrayLike : Array.prototype.slice.call(arrayLike);
}

function defined(value, defaultValue) {
	return value !== undefined ? value : defaultValue;
}

function jDataView(buffer, byteOffset, byteLength, littleEndian) {
	/* jshint validthis:true */

	if (buffer instanceof jDataView) {
		var result = buffer.slice(byteOffset, byteOffset + byteLength);
		result._littleEndian = defined(littleEndian, result._littleEndian);
		return result;
	}

	if (!(this instanceof jDataView)) {
		return new jDataView(buffer, byteOffset, byteLength, littleEndian);
	}

	this.buffer = buffer = jDataView.wrapBuffer(buffer);

	// Check parameters and existing functionnalities
	this._isArrayBuffer = compatibility.ArrayBuffer && buffer instanceof ArrayBuffer;
	this._isPixelData = compatibility.PixelData && buffer instanceof CanvasPixelArray;
	this._isDataView = compatibility.DataView && this._isArrayBuffer;
	this._isNodeBuffer = compatibility.NodeBuffer && buffer instanceof Buffer;

	// Handle Type Errors
	if (!this._isNodeBuffer && !this._isArrayBuffer && !this._isPixelData && !(buffer instanceof Array)) {
		throw new TypeError('jDataView buffer has an incompatible type');
	}

	// Default Values
	this._littleEndian = !!littleEndian;

	var bufferLength = 'byteLength' in buffer ? buffer.byteLength : buffer.length;
	this.byteOffset = byteOffset = defined(byteOffset, 0);
	this.byteLength = byteLength = defined(byteLength, bufferLength - byteOffset);

	if (!this._isDataView) {
		this._checkBounds(byteOffset, byteLength, bufferLength);
	} else {
		this._view = new DataView(buffer, byteOffset, byteLength);
	}

	// Create uniform methods (action wrappers) for the following data types

	this._engineAction =
		this._isDataView
			? this._dataViewAction
		: this._isNodeBuffer
			? this._nodeBufferAction
		: this._isArrayBuffer
			? this._arrayBufferAction
		: this._arrayAction;
}

function getCharCodes(string) {
	if (compatibility.NodeBuffer) {
		return new Buffer(string, 'binary');
	}

	var Type = compatibility.ArrayBuffer ? Uint8Array : Array,
		codes = new Type(string.length);

	for (var i = 0, length = string.length; i < length; i++) {
		codes[i] = string.charCodeAt(i) & 0xff;
	}
	return codes;
}

// mostly internal function for wrapping any supported input (String or Array-like) to best suitable buffer format
jDataView.wrapBuffer = function (buffer) {
	switch (typeof buffer) {
		case 'number':
			if (compatibility.NodeBuffer) {
				buffer = new Buffer(buffer);
				buffer.fill(0);
			} else
			if (compatibility.ArrayBuffer) {
				buffer = new Uint8Array(buffer).buffer;
			} else
			if (compatibility.PixelData) {
				buffer = createPixelData(buffer);
			} else {
				buffer = new Array(buffer);
				for (var i = 0; i < buffer.length; i++) {
					buffer[i] = 0;
				}
			}
			return buffer;

		case 'string':
			buffer = getCharCodes(buffer);
			/* falls through */
		default:
			if ('length' in buffer && !((compatibility.NodeBuffer && buffer instanceof Buffer) || (compatibility.ArrayBuffer && buffer instanceof ArrayBuffer) || (compatibility.PixelData && buffer instanceof CanvasPixelArray))) {
				if (compatibility.NodeBuffer) {
					buffer = new Buffer(buffer);
				} else
				if (compatibility.ArrayBuffer) {
					if (!(buffer instanceof ArrayBuffer)) {
						buffer = new Uint8Array(buffer).buffer;
						// bug in Node.js <= 0.8:
						if (!(buffer instanceof ArrayBuffer)) {
							buffer = new Uint8Array(arrayFrom(buffer, true)).buffer;
						}
					}
				} else
				if (compatibility.PixelData) {
					buffer = createPixelData(buffer.length, buffer);
				} else {
					buffer = arrayFrom(buffer);
				}
			}
			return buffer;
	}
};

function pow2(n) {
	return (n >= 0 && n < 31) ? (1 << n) : (pow2[n] || (pow2[n] = Math.pow(2, n)));
}

// left for backward compatibility
jDataView.createBuffer = function () {
	return jDataView.wrapBuffer(arguments);
};

function Uint64(lo, hi) {
	this.lo = lo;
	this.hi = hi;
}

jDataView.Uint64 = Uint64;

Uint64.prototype = {
	valueOf: function () {
		return this.lo + pow2(32) * this.hi;
	},

	toString: function () {
		return Number.prototype.toString.apply(this.valueOf(), arguments);
	}
};

Uint64.fromNumber = function (number) {
	var hi = Math.floor(number / pow2(32)),
		lo = number - hi * pow2(32);

	return new Uint64(lo, hi);
};

function Int64(lo, hi) {
	Uint64.apply(this, arguments);
}

jDataView.Int64 = Int64;

Int64.prototype = 'create' in Object ? Object.create(Uint64.prototype) : new Uint64();

Int64.prototype.valueOf = function () {
	if (this.hi < pow2(31)) {
		return Uint64.prototype.valueOf.apply(this, arguments);
	}
	return -((pow2(32) - this.lo) + pow2(32) * (pow2(32) - 1 - this.hi));
};

Int64.fromNumber = function (number) {
	var lo, hi;
	if (number >= 0) {
		var unsigned = Uint64.fromNumber(number);
		lo = unsigned.lo;
		hi = unsigned.hi;
	} else {
		hi = Math.floor(number / pow2(32));
		lo = number - hi * pow2(32);
		hi += pow2(32);
	}
	return new Int64(lo, hi);
};

jDataView.prototype = {
	_offset: 0,
	_bitOffset: 0,

	compatibility: compatibility,

	_checkBounds: function (byteOffset, byteLength, maxLength) {
		// Do additional checks to simulate DataView
		if (typeof byteOffset !== 'number') {
			throw new TypeError('Offset is not a number.');
		}
		if (typeof byteLength !== 'number') {
			throw new TypeError('Size is not a number.');
		}
		if (byteLength < 0) {
			throw new RangeError('Length is negative.');
		}
		if (byteOffset < 0 || byteOffset + byteLength > defined(maxLength, this.byteLength)) {
			throw new RangeError('Offsets are out of bounds.');
		}
	},

	_action: function (type, isReadAction, byteOffset, littleEndian, value) {
		return this._engineAction(
			type,
			isReadAction,
			defined(byteOffset, this._offset),
			defined(littleEndian, this._littleEndian),
			value
		);
	},

	_dataViewAction: function (type, isReadAction, byteOffset, littleEndian, value) {
		// Move the internal offset forward
		this._offset = byteOffset + dataTypes[type];
		return isReadAction ? this._view['get' + type](byteOffset, littleEndian) : this._view['set' + type](byteOffset, value, littleEndian);
	},

	_nodeBufferAction: function (type, isReadAction, byteOffset, littleEndian, value) {
		// Move the internal offset forward
		this._offset = byteOffset + dataTypes[type];
		var nodeName = nodeNaming[type] + ((type === 'Int8' || type === 'Uint8') ? '' : littleEndian ? 'LE' : 'BE');
		byteOffset += this.byteOffset;
		return isReadAction ? this.buffer['read' + nodeName](byteOffset) : this.buffer['write' + nodeName](value, byteOffset);
	},

	_arrayBufferAction: function (type, isReadAction, byteOffset, littleEndian, value) {
		var size = dataTypes[type], TypedArray = global[type + 'Array'], typedArray;

		littleEndian = defined(littleEndian, this._littleEndian);

		// ArrayBuffer: we use a typed array of size 1 from original buffer if alignment is good and from slice when it's not
		if (size === 1 || ((this.byteOffset + byteOffset) % size === 0 && littleEndian)) {
			typedArray = new TypedArray(this.buffer, this.byteOffset + byteOffset, 1);
			this._offset = byteOffset + size;
			return isReadAction ? typedArray[0] : (typedArray[0] = value);
		} else {
			var bytes = new Uint8Array(isReadAction ? this.getBytes(size, byteOffset, littleEndian, true) : size);
			typedArray = new TypedArray(bytes.buffer, 0, 1);

			if (isReadAction) {
				return typedArray[0];
			} else {
				typedArray[0] = value;
				this._setBytes(byteOffset, bytes, littleEndian);
			}
		}
	},

	_arrayAction: function (type, isReadAction, byteOffset, littleEndian, value) {
		return isReadAction ? this['_get' + type](byteOffset, littleEndian) : this['_set' + type](byteOffset, value, littleEndian);
	},

	// Helpers

	_getBytes: function (length, byteOffset, littleEndian) {
		littleEndian = defined(littleEndian, this._littleEndian);
		byteOffset = defined(byteOffset, this._offset);
		length = defined(length, this.byteLength - byteOffset);

		this._checkBounds(byteOffset, length);

		byteOffset += this.byteOffset;

		this._offset = byteOffset - this.byteOffset + length;

		var result = this._isArrayBuffer
					 ? new Uint8Array(this.buffer, byteOffset, length)
					 : (this.buffer.slice || Array.prototype.slice).call(this.buffer, byteOffset, byteOffset + length);

		return littleEndian || length <= 1 ? result : arrayFrom(result).reverse();
	},

	// wrapper for external calls (do not return inner buffer directly to prevent it's modifying)
	getBytes: function (length, byteOffset, littleEndian, toArray) {
		var result = this._getBytes(length, byteOffset, defined(littleEndian, true));
		return toArray ? arrayFrom(result) : result;
	},

	_setBytes: function (byteOffset, bytes, littleEndian) {
		var length = bytes.length;

		// needed for Opera
		if (length === 0) {
			return;
		}

		littleEndian = defined(littleEndian, this._littleEndian);
		byteOffset = defined(byteOffset, this._offset);

		this._checkBounds(byteOffset, length);

		if (!littleEndian && length > 1) {
			bytes = arrayFrom(bytes, true).reverse();
		}

		byteOffset += this.byteOffset;

		if (this._isArrayBuffer) {
			new Uint8Array(this.buffer, byteOffset, length).set(bytes);
		}
		else {
			if (this._isNodeBuffer) {
				new Buffer(bytes).copy(this.buffer, byteOffset);
			} else {
				for (var i = 0; i < length; i++) {
					this.buffer[byteOffset + i] = bytes[i];
				}
			}
		}

		this._offset = byteOffset - this.byteOffset + length;
	},

	setBytes: function (byteOffset, bytes, littleEndian) {
		this._setBytes(byteOffset, bytes, defined(littleEndian, true));
	},

	getString: function (byteLength, byteOffset, encoding) {
		if (this._isNodeBuffer) {
			byteOffset = defined(byteOffset, this._offset);
			byteLength = defined(byteLength, this.byteLength - byteOffset);

			this._checkBounds(byteOffset, byteLength);

			this._offset = byteOffset + byteLength;
			return this.buffer.toString(encoding || 'binary', this.byteOffset + byteOffset, this.byteOffset + this._offset);
		}
		var bytes = this._getBytes(byteLength, byteOffset, true), string = '';
		byteLength = bytes.length;
		for (var i = 0; i < byteLength; i++) {
			string += String.fromCharCode(bytes[i]);
		}
		if (encoding === 'utf8') {
			string = decodeURIComponent(escape(string));
		}
		return string;
	},

	setString: function (byteOffset, subString, encoding) {
		if (this._isNodeBuffer) {
			byteOffset = defined(byteOffset, this._offset);
			this._checkBounds(byteOffset, subString.length);
			this._offset = byteOffset + this.buffer.write(subString, this.byteOffset + byteOffset, encoding || 'binary');
			return;
		}
		if (encoding === 'utf8') {
			subString = unescape(encodeURIComponent(subString));
		}
		this._setBytes(byteOffset, getCharCodes(subString), true);
	},

	getChar: function (byteOffset) {
		return this.getString(1, byteOffset);
	},

	setChar: function (byteOffset, character) {
		this.setString(byteOffset, character);
	},

	tell: function () {
		return this._offset;
	},

	seek: function (byteOffset) {
		this._checkBounds(byteOffset, 0);
		/* jshint boss: true */
		return this._offset = byteOffset;
	},

	skip: function (byteLength) {
		return this.seek(this._offset + byteLength);
	},

	slice: function (start, end, forceCopy) {
		function normalizeOffset(offset, byteLength) {
			return offset < 0 ? offset + byteLength : offset;
		}

		start = normalizeOffset(start, this.byteLength);
		end = normalizeOffset(defined(end, this.byteLength), this.byteLength);

		return forceCopy
			   ? new jDataView(this.getBytes(end - start, start, true, true), undefined, undefined, this._littleEndian)
			   : new jDataView(this.buffer, this.byteOffset + start, end - start, this._littleEndian);
	},

	alignBy: function (byteCount) {
		this._bitOffset = 0;
		if (defined(byteCount, 1) !== 1) {
			return this.skip(byteCount - (this._offset % byteCount || byteCount));
		} else {
			return this._offset;
		}
	},

	// Compatibility functions

	_getFloat64: function (byteOffset, littleEndian) {
		var b = this._getBytes(8, byteOffset, littleEndian),

			sign = 1 - (2 * (b[7] >> 7)),
			exponent = ((((b[7] << 1) & 0xff) << 3) | (b[6] >> 4)) - ((1 << 10) - 1),

		// Binary operators such as | and << operate on 32 bit values, using + and Math.pow(2) instead
			mantissa = ((b[6] & 0x0f) * pow2(48)) + (b[5] * pow2(40)) + (b[4] * pow2(32)) +
						(b[3] * pow2(24)) + (b[2] * pow2(16)) + (b[1] * pow2(8)) + b[0];

		if (exponent === 1024) {
			if (mantissa !== 0) {
				return NaN;
			} else {
				return sign * Infinity;
			}
		}

		if (exponent === -1023) { // Denormalized
			return sign * mantissa * pow2(-1022 - 52);
		}

		return sign * (1 + mantissa * pow2(-52)) * pow2(exponent);
	},

	_getFloat32: function (byteOffset, littleEndian) {
		var b = this._getBytes(4, byteOffset, littleEndian),

			sign = 1 - (2 * (b[3] >> 7)),
			exponent = (((b[3] << 1) & 0xff) | (b[2] >> 7)) - 127,
			mantissa = ((b[2] & 0x7f) << 16) | (b[1] << 8) | b[0];

		if (exponent === 128) {
			if (mantissa !== 0) {
				return NaN;
			} else {
				return sign * Infinity;
			}
		}

		if (exponent === -127) { // Denormalized
			return sign * mantissa * pow2(-126 - 23);
		}

		return sign * (1 + mantissa * pow2(-23)) * pow2(exponent);
	},

	_get64: function (Type, byteOffset, littleEndian) {
		littleEndian = defined(littleEndian, this._littleEndian);
		byteOffset = defined(byteOffset, this._offset);

		var parts = littleEndian ? [0, 4] : [4, 0];

		for (var i = 0; i < 2; i++) {
			parts[i] = this.getUint32(byteOffset + parts[i], littleEndian);
		}

		this._offset = byteOffset + 8;

		return new Type(parts[0], parts[1]);
	},

	getInt64: function (byteOffset, littleEndian) {
		return this._get64(Int64, byteOffset, littleEndian);
	},

	getUint64: function (byteOffset, littleEndian) {
		return this._get64(Uint64, byteOffset, littleEndian);
	},

	_getInt32: function (byteOffset, littleEndian) {
		var b = this._getBytes(4, byteOffset, littleEndian);
		return (b[3] << 24) | (b[2] << 16) | (b[1] << 8) | b[0];
	},

	_getUint32: function (byteOffset, littleEndian) {
		return this._getInt32(byteOffset, littleEndian) >>> 0;
	},

	_getInt16: function (byteOffset, littleEndian) {
		return (this._getUint16(byteOffset, littleEndian) << 16) >> 16;
	},

	_getUint16: function (byteOffset, littleEndian) {
		var b = this._getBytes(2, byteOffset, littleEndian);
		return (b[1] << 8) | b[0];
	},

	_getInt8: function (byteOffset) {
		return (this._getUint8(byteOffset) << 24) >> 24;
	},

	_getUint8: function (byteOffset) {
		return this._getBytes(1, byteOffset)[0];
	},

	_getBitRangeData: function (bitLength, byteOffset) {
		var startBit = (defined(byteOffset, this._offset) << 3) + this._bitOffset,
			endBit = startBit + bitLength,
			start = startBit >>> 3,
			end = (endBit + 7) >>> 3,
			b = this._getBytes(end - start, start, true),
			wideValue = 0;

		/* jshint boss: true */
		if (this._bitOffset = endBit & 7) {
			this._bitOffset -= 8;
		}

		for (var i = 0, length = b.length; i < length; i++) {
			wideValue = (wideValue << 8) | b[i];
		}

		return {
			start: start,
			bytes: b,
			wideValue: wideValue
		};
	},

	getSigned: function (bitLength, byteOffset) {
		var shift = 32 - bitLength;
		return (this.getUnsigned(bitLength, byteOffset) << shift) >> shift;
	},

	getUnsigned: function (bitLength, byteOffset) {
		var value = this._getBitRangeData(bitLength, byteOffset).wideValue >>> -this._bitOffset;
		return bitLength < 32 ? (value & ~(-1 << bitLength)) : value;
	},

	_setBinaryFloat: function (byteOffset, value, mantSize, expSize, littleEndian) {
		var signBit = value < 0 ? 1 : 0,
			exponent,
			mantissa,
			eMax = ~(-1 << (expSize - 1)),
			eMin = 1 - eMax;

		if (value < 0) {
			value = -value;
		}

		if (value === 0) {
			exponent = 0;
			mantissa = 0;
		} else if (isNaN(value)) {
			exponent = 2 * eMax + 1;
			mantissa = 1;
		} else if (value === Infinity) {
			exponent = 2 * eMax + 1;
			mantissa = 0;
		} else {
			exponent = Math.floor(Math.log(value) / Math.LN2);
			if (exponent >= eMin && exponent <= eMax) {
				mantissa = Math.floor((value * pow2(-exponent) - 1) * pow2(mantSize));
				exponent += eMax;
			} else {
				mantissa = Math.floor(value / pow2(eMin - mantSize));
				exponent = 0;
			}
		}

		var b = [];
		while (mantSize >= 8) {
			b.push(mantissa % 256);
			mantissa = Math.floor(mantissa / 256);
			mantSize -= 8;
		}
		exponent = (exponent << mantSize) | mantissa;
		expSize += mantSize;
		while (expSize >= 8) {
			b.push(exponent & 0xff);
			exponent >>>= 8;
			expSize -= 8;
		}
		b.push((signBit << expSize) | exponent);

		this._setBytes(byteOffset, b, littleEndian);
	},

	_setFloat32: function (byteOffset, value, littleEndian) {
		this._setBinaryFloat(byteOffset, value, 23, 8, littleEndian);
	},

	_setFloat64: function (byteOffset, value, littleEndian) {
		this._setBinaryFloat(byteOffset, value, 52, 11, littleEndian);
	},

	_set64: function (Type, byteOffset, value, littleEndian) {
		if (!(value instanceof Type)) {
			value = Type.fromNumber(value);
		}

		littleEndian = defined(littleEndian, this._littleEndian);
		byteOffset = defined(byteOffset, this._offset);

		var parts = littleEndian ? {lo: 0, hi: 4} : {lo: 4, hi: 0};

		for (var partName in parts) {
			this.setUint32(byteOffset + parts[partName], value[partName], littleEndian);
		}

		this._offset = byteOffset + 8;
	},

	setInt64: function (byteOffset, value, littleEndian) {
		this._set64(Int64, byteOffset, value, littleEndian);
	},

	setUint64: function (byteOffset, value, littleEndian) {
		this._set64(Uint64, byteOffset, value, littleEndian);
	},

	_setUint32: function (byteOffset, value, littleEndian) {
		this._setBytes(byteOffset, [
			value & 0xff,
			(value >>> 8) & 0xff,
			(value >>> 16) & 0xff,
			value >>> 24
		], littleEndian);
	},

	_setUint16: function (byteOffset, value, littleEndian) {
		this._setBytes(byteOffset, [
			value & 0xff,
			(value >>> 8) & 0xff
		], littleEndian);
	},

	_setUint8: function (byteOffset, value) {
		this._setBytes(byteOffset, [value & 0xff]);
	},

	setUnsigned: function (byteOffset, value, bitLength) {
		var data = this._getBitRangeData(bitLength, byteOffset),
			wideValue = data.wideValue,
			b = data.bytes;

		wideValue &= ~(~(-1 << bitLength) << -this._bitOffset); // clearing bit range before binary "or"
		wideValue |= (bitLength < 32 ? (value & ~(-1 << bitLength)) : value) << -this._bitOffset; // setting bits

		for (var i = b.length - 1; i >= 0; i--) {
			b[i] = wideValue & 0xff;
			wideValue >>>= 8;
		}

		this._setBytes(data.start, b, true);
	}
};

var proto = jDataView.prototype;

for (var type in dataTypes) {
	(function (type) {
		proto['get' + type] = function (byteOffset, littleEndian) {
			return this._action(type, true, byteOffset, littleEndian);
		};
		proto['set' + type] = function (byteOffset, value, littleEndian) {
			this._action(type, false, byteOffset, littleEndian, value);
		};
	})(type);
}

proto._setInt32 = proto._setUint32;
proto._setInt16 = proto._setUint16;
proto._setInt8 = proto._setUint8;
proto.setSigned = proto.setUnsigned;

for (var method in proto) {
	if (method.slice(0, 3) === 'set') {
		(function (type) {
			proto['write' + type] = function () {
				Array.prototype.unshift.call(arguments, undefined);
				this['set' + type].apply(this, arguments);
			};
		})(method.slice(3));
	}
}

if (typeof module !== 'undefined' && typeof module.exports === 'object') {
	module.exports = jDataView;
} else
if (typeof define === 'function' && define.amd) {
	define([], function () { return jDataView });
} else {
	var oldGlobal = global.jDataView;
	(global.jDataView = jDataView).noConflict = function () {
		global.jDataView = oldGlobal;
		return this;
	};
}

})((function () { /* jshint strict: false */ return this })());
}).call(this,require("buffer").Buffer)
},{"buffer":3}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
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

},{"base64-js":4,"ieee754":5}],4:[function(require,module,exports){
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

},{}],5:[function(require,module,exports){
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
  first: "# ------------------------------------------------------------\n# Your first LoopScript. Click \"Compile\" below to start!\n\ntone note1\n  duration 250\n  octave 4\n  note C\n\ntone bass1\n  duration 250\n  octave 1\n  note B\n\nloop loop1\n  pattern note1 x.......x.......\n  pattern bass1 ....x.......x...\n",
  notes: "# ------------------------------------------------------------\n# Note overrides!\n\n# H-L are the black keys:\n#     H I   J K L\n#    C D E F G A B\n\n# Try setting the duration to 100\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  duration 250\n\n# Samples can have their notes overridden too!\nsample ding\n  src samples/ding_e.wav\n  srcnote e\n\nloop loop1\n  pattern note1 b.a.g.a.b.b.b...\n\nloop loop2\n  pattern ding b.a.g.a.b.b.b...\n\ntrack song\n  pattern loop1 x\n  pattern loop2 .x\n",
  motto: "# ------------------------------------------------------------\n# An approximation of the beat from Drake's \"The Motto\"\n\nbpm 100\nsection # to share ADSR\n  adsr 0.005 0.05 0.7 0.05\n  tone bass1\n    octave 1\n  tone bass2\n    octave 2\n\nsample clap  -> src samples/clap.wav\nsample snare -> src samples/snare.wav\nsample hihat -> src samples/hihat.wav\n\nloop loop1\n  pattern hihat ..x.......x.......x.......x.....\n  pattern clap  ....x.......x.......x.......x...\n  pattern snare ......x...x...x.x...............\n  pattern bass1 Bbbbbb..........................\n  pattern bass2 ......HhhhhhDddddd....HhhhJj.Jj.\n\ntrack song\n  pattern loop1 xxxx\n",
  length: "# ------------------------------------------------------------\n# Showing off various note lengths using caps and lowercase\n# Also shows what ADSR can do!\n\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n\ntone note2\n  # Note: Only the first tone has ADSR\n\n# If you use any letters other than \"x\" on a tone pattern, you override its\n# note with the note listed. Also, if you use any capital letters in a pattern,\n# you override the length of that note with the number of matching lowercase\n# letters following it.\n\nloop loop1\n  pattern note1 GgggggggFfffff..AaaaBbb.Cc..D...\n\nloop loop2\n  pattern note2 GgggggggFfffff..AaaaBbb.Cc..D...\n\ntrack song\n  pattern loop1 x.\n  pattern loop2 .x\n",
  chocobo: "# ------------------------------------------------------------\n# The Chocobo Theme (first part only)\n\nbpm 125\n\nsection Tone (in a section to share ADSR)\n  adsr 0.005 0.05 0.7 0.05\n  tone chocobo1\n    octave 5\n  tone chocobo2\n    octave 4\n\nloop loop1\n pattern chocobo1 Dddd......Dd..........................................D.E.Ffffff...\n pattern chocobo2 ....BbGgEe..BbGgBb..Gg..Bbbbbb.AaGgGAG.F.Gggggg.F.GgGB.............\n\ntrack song\n  pattern loop1 xx"
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


},{}],"./loopscript":[function(require,module,exports){
module.exports=require('1yrpF2');
},{}],"1yrpF2":[function(require,module,exports){
var IndentStack, Parser, Renderer, clone, countIndent, findFreq, fs, jDataView, parseBool, renderLoopScript, riffwave,
  __slice = [].slice;

findFreq = require('./freq').findFreq;

riffwave = require("./riffwave");

jDataView = require('../js/jdataview');

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

parseBool = function(v) {
  switch (String(v)) {
    case "true":
      return true;
    case "yes":
      return true;
    case "on":
      return true;
    case "1":
      return true;
    default:
      return false;
  }
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

  IndentStack.prototype.replaceTop = function(v) {
    return this.stack[this.stack.length - 1] = v;
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
        srcoctave: 4,
        srcnote: 'a',
        octave: 4,
        note: 'a',
        wave: 'sine',
        bpm: 120,
        duration: 200,
        beats: 4,
        volume: 1.0,
        clip: true,
        reverb: {
          delay: 0,
          decay: 0
        },
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
        volume: 'float',
        clip: 'bool',
        reverb: 'reverb'
      },
      sample: {
        src: 'string',
        volume: 'float',
        clip: 'bool',
        reverb: 'reverb',
        srcoctave: 'int',
        srcnote: 'string',
        octave: 'int',
        note: 'string'
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
    return this.log.error("PARSE ERROR, line " + this.lineNo + ": " + text);
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
    return this.log.verbose(("trace: " + prefix + " ") + JSON.stringify(this.flatten()));
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
              case 'bool':
                return parseBool(v);
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
      pattern: pattern,
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
    } else if (cmd === 'reverb') {
      this.stateStack[this.stateStack.length - 1][cmd] = {
        delay: parseInt(tokens[1]),
        decay: parseFloat(tokens[2])
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
    var arrowSection, arrowSections, indent, indentText, line, lineObjs, lines, obj, semiSection, semiSections, topIndent, _, _i, _j, _k, _l, _len, _len1, _len2, _len3, _ref;
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
      lineObjs = [];
      arrowSections = line.split(/\s*->\s*/);
      for (_j = 0, _len1 = arrowSections.length; _j < _len1; _j++) {
        arrowSection = arrowSections[_j];
        semiSections = arrowSection.split(/\s*;\s*/);
        for (_k = 0, _len2 = semiSections.length; _k < _len2; _k++) {
          semiSection = semiSections[_k];
          lineObjs.push({
            indent: indent,
            line: semiSection
          });
        }
        indent += 1000;
      }
      for (_l = 0, _len3 = lineObjs.length; _l < _len3; _l++) {
        obj = lineObjs[_l];
        topIndent = this.indentStack.top();
        if (obj.indent === topIndent) {

        } else if (obj.indent > topIndent) {
          this.indentStack.push(obj.indent);
          if (!this.pushScope()) {
            return false;
          }
        } else if ((obj.indent < 1000) && (topIndent >= 1000)) {
          this.indentStack.replaceTop(obj.indent);
        } else {
          while (true) {
            if (!this.indentStack.pop()) {
              this.log.error("Unexpected indent " + obj.indent + " on line " + this.lineNo + ": " + obj.line);
              return false;
            }
            if (!this.popScope()) {
              return false;
            }
            if (this.indentStack.top() >= 1000) {
              continue;
            }
            if (this.indentStack.top() === obj.indent) {
              break;
            }
          }
        }
        if (!this.processTokens(obj.line.split(/\s+/))) {
          return false;
        }
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
    this.soundCache = {};
  }

  Renderer.prototype.error = function(text) {
    return this.log.error("RENDER ERROR: " + text);
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
    amplitude = 10000;
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
      samples[i] = sine * amplitude * envelope[i];
    }
    return {
      samples: samples,
      length: samples.length
    };
  };

  Renderer.prototype.renderSample = function(sampleObj, overrides) {
    var data, factor, i, newfreq, oldfreq, overrideNote, relength, resamples, samples, subchunk2Size, view, _i, _j;
    view = null;
    if (this.readLocalFiles) {
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
      return {
        samples: [],
        length: 0
      };
    }
    view.seek(40);
    subchunk2Size = view.getInt32();
    samples = [];
    while (view.tell() + 1 < view.byteLength) {
      samples.push(view.getInt16());
    }
    overrideNote = overrides.note ? overrides.note : sampleObj.note;
    if ((overrideNote !== sampleObj.srcnote) || (sampleObj.octave !== sampleObj.srcoctave)) {
      oldfreq = findFreq(sampleObj.srcoctave, sampleObj.srcnote);
      newfreq = findFreq(sampleObj.octave, overrideNote);
      factor = oldfreq / newfreq;
      relength = Math.floor(samples.length * factor);
      resamples = Array(relength);
      for (i = _i = 0; 0 <= relength ? _i < relength : _i > relength; i = 0 <= relength ? ++_i : --_i) {
        resamples[i] = 0;
      }
      for (i = _j = 0; 0 <= relength ? _j < relength : _j > relength; i = 0 <= relength ? ++_j : --_j) {
        resamples[i] = samples[Math.floor(i / factor)];
      }
      return {
        samples: resamples,
        length: resamples.length
      };
    } else {
      return {
        samples: samples,
        length: samples.length
      };
    }
  };

  Renderer.prototype.renderLoop = function(loopObj) {
    var beatCount, copyLen, end, fadeClip, i, j, obj, offset, offsetLength, overflowLength, overrides, pattern, patternSamples, samples, samplesPerBeat, sectionCount, sound, srcSound, totalLength, v, _i, _j, _k, _l, _len, _len1, _len2, _len3, _len4, _m, _n, _o, _p, _q, _r, _ref, _ref1, _ref2, _ref3, _ref4, _s, _t;
    beatCount = 0;
    _ref = loopObj._patterns;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      pattern = _ref[_i];
      if (beatCount < pattern.length) {
        beatCount = pattern.length;
      }
    }
    samplesPerBeat = this.sampleRate / (loopObj.bpm / 60) / loopObj.beats;
    totalLength = samplesPerBeat * beatCount;
    overflowLength = totalLength;
    _ref1 = loopObj._patterns;
    for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
      pattern = _ref1[_j];
      sectionCount = pattern.length / 16;
      offsetLength = Math.floor(totalLength / 16 / sectionCount);
      _ref2 = pattern.sounds;
      for (_k = 0, _len2 = _ref2.length; _k < _len2; _k++) {
        sound = _ref2[_k];
        overrides = {};
        if (sound.length > 0) {
          overrides.length = sound.length * offsetLength;
        }
        if (sound.note != null) {
          overrides.note = sound.note;
        }
        sound._render = this.render(pattern.src, overrides);
        end = (sound.offset * offsetLength) + sound._render.samples.length;
        if (overflowLength < end) {
          overflowLength = end;
        }
      }
    }
    samples = Array(overflowLength);
    for (i = _l = 0; 0 <= overflowLength ? _l < overflowLength : _l > overflowLength; i = 0 <= overflowLength ? ++_l : --_l) {
      samples[i] = 0;
    }
    _ref3 = loopObj._patterns;
    for (_m = 0, _len3 = _ref3.length; _m < _len3; _m++) {
      pattern = _ref3[_m];
      sectionCount = pattern.length / 16;
      offsetLength = Math.floor(totalLength / 16 / sectionCount);
      patternSamples = Array(overflowLength);
      for (i = _n = 0; 0 <= overflowLength ? _n < overflowLength : _n > overflowLength; i = 0 <= overflowLength ? ++_n : --_n) {
        patternSamples[i] = 0;
      }
      _ref4 = pattern.sounds;
      for (_o = 0, _len4 = _ref4.length; _o < _len4; _o++) {
        sound = _ref4[_o];
        srcSound = sound._render;
        obj = this.getObject(pattern.src);
        offset = sound.offset * offsetLength;
        copyLen = srcSound.samples.length;
        if ((offset + copyLen) > overflowLength) {
          copyLen = overflowLength - offset;
        }
        if (obj.clip) {
          fadeClip = 200;
          if (offset > fadeClip) {
            for (j = _p = 0; 0 <= fadeClip ? _p < fadeClip : _p > fadeClip; j = 0 <= fadeClip ? ++_p : --_p) {
              v = patternSamples[offset - fadeClip + j];
              patternSamples[offset - fadeClip + j] = Math.floor(v * ((fadeClip - j) / fadeClip));
            }
          }
          for (j = _q = offset; offset <= overflowLength ? _q < overflowLength : _q > overflowLength; j = offset <= overflowLength ? ++_q : --_q) {
            patternSamples[j] = 0;
          }
          for (j = _r = 0; 0 <= copyLen ? _r < copyLen : _r > copyLen; j = 0 <= copyLen ? ++_r : --_r) {
            patternSamples[offset + j] = srcSound.samples[j];
          }
        } else {
          for (j = _s = 0; 0 <= copyLen ? _s < copyLen : _s > copyLen; j = 0 <= copyLen ? ++_s : --_s) {
            patternSamples[offset + j] += srcSound.samples[j];
          }
        }
      }
      for (j = _t = 0; 0 <= overflowLength ? _t < overflowLength : _t > overflowLength; j = 0 <= overflowLength ? ++_t : --_t) {
        samples[j] += patternSamples[j];
      }
    }
    return {
      samples: samples,
      length: totalLength
    };
  };

  Renderer.prototype.renderTrack = function(trackObj) {
    var copyLen, i, j, overflowLength, pattern, pieceCount, pieceIndex, pieceOverflowLength, pieceTotalLength, possibleMaxLength, samples, srcSound, totalLength, trackOffset, _i, _j, _k, _l, _len, _len1, _len2, _m, _n, _o, _ref, _ref1, _ref2;
    pieceCount = 0;
    _ref = trackObj._patterns;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      pattern = _ref[_i];
      if (pieceCount < pattern.pattern.length) {
        pieceCount = pattern.pattern.length;
      }
    }
    totalLength = 0;
    overflowLength = 0;
    pieceTotalLength = Array(pieceCount);
    pieceOverflowLength = Array(pieceCount);
    for (pieceIndex = _j = 0; 0 <= pieceCount ? _j < pieceCount : _j > pieceCount; pieceIndex = 0 <= pieceCount ? ++_j : --_j) {
      pieceTotalLength[pieceIndex] = 0;
      pieceOverflowLength[pieceIndex] = 0;
      _ref1 = trackObj._patterns;
      for (_k = 0, _len1 = _ref1.length; _k < _len1; _k++) {
        pattern = _ref1[_k];
        if ((pieceIndex < pattern.pattern.length) && (pattern.pattern[pieceIndex] !== '.')) {
          srcSound = this.render(pattern.src);
          if (pieceTotalLength[pieceIndex] < srcSound.length) {
            pieceTotalLength[pieceIndex] = srcSound.length;
          }
          if (pieceOverflowLength[pieceIndex] < srcSound.samples.length) {
            pieceOverflowLength[pieceIndex] = srcSound.samples.length;
          }
        }
      }
      possibleMaxLength = totalLength + pieceOverflowLength[pieceIndex];
      if (overflowLength < possibleMaxLength) {
        overflowLength = possibleMaxLength;
      }
      totalLength += pieceTotalLength[pieceIndex];
    }
    samples = Array(overflowLength);
    for (i = _l = 0; 0 <= overflowLength ? _l < overflowLength : _l > overflowLength; i = 0 <= overflowLength ? ++_l : --_l) {
      samples[i] = 0;
    }
    _ref2 = trackObj._patterns;
    for (_m = 0, _len2 = _ref2.length; _m < _len2; _m++) {
      pattern = _ref2[_m];
      trackOffset = 0;
      srcSound = this.render(pattern.src, {});
      for (pieceIndex = _n = 0; 0 <= pieceCount ? _n < pieceCount : _n > pieceCount; pieceIndex = 0 <= pieceCount ? ++_n : --_n) {
        if ((pieceIndex < pattern.pattern.length) && (pattern.pattern[pieceIndex] !== '.')) {
          copyLen = srcSound.samples.length;
          if ((trackOffset + copyLen) > overflowLength) {
            copyLen = overflowLength - trackOffset;
          }
          for (j = _o = 0; 0 <= copyLen ? _o < copyLen : _o > copyLen; j = 0 <= copyLen ? ++_o : --_o) {
            samples[trackOffset + j] += srcSound.samples[j];
          }
        }
        trackOffset += pieceTotalLength[pieceIndex];
      }
    }
    return {
      samples: samples,
      length: totalLength
    };
  };

  Renderer.prototype.calcCacheName = function(type, which, overrides) {
    var name;
    if ((type !== 'tone') && (type !== 'sample')) {
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

  Renderer.prototype.getObject = function(which) {
    var object;
    object = this.objects[which];
    if (!object) {
      this.error("no such object " + which);
      return null;
    }
    return object;
  };

  Renderer.prototype.render = function(which, overrides) {
    var cacheName, delaySamples, i, object, samples, sound, totalLength, _i, _j, _k, _l, _ref, _ref1, _ref2, _ref3;
    object = this.getObject(which);
    if (!object) {
      return null;
    }
    cacheName = this.calcCacheName(object._type, which, overrides);
    if (this.soundCache[cacheName]) {
      return this.soundCache[cacheName];
    }
    sound = (function() {
      switch (object._type) {
        case 'tone':
          return this.renderTone(object, overrides);
        case 'sample':
          return this.renderSample(object, overrides);
        case 'loop':
          return this.renderLoop(object);
        case 'track':
          return this.renderTrack(object);
        default:
          this.error("unknown type " + object._type);
          return null;
      }
    }).call(this);
    if ((object.volume != null) && (object.volume !== 1.0)) {
      for (i = _i = 0, _ref = sound.samples.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
        sound.samples[i] *= object.volume;
      }
    }
    if ((object.reverb != null) && (object.reverb.delay > 0)) {
      delaySamples = Math.floor(object.reverb.delay * this.sampleRate / 1000);
      if (sound.samples.length > delaySamples) {
        totalLength = sound.samples.length + (delaySamples * 8);
        samples = Array(totalLength);
        for (i = _j = 0, _ref1 = sound.samples.length; 0 <= _ref1 ? _j < _ref1 : _j > _ref1; i = 0 <= _ref1 ? ++_j : --_j) {
          samples[i] = sound.samples[i];
        }
        for (i = _k = _ref2 = sound.samples.length; _ref2 <= totalLength ? _k < totalLength : _k > totalLength; i = _ref2 <= totalLength ? ++_k : --_k) {
          samples[i] = 0;
        }
        for (i = _l = 0, _ref3 = totalLength - delaySamples; 0 <= _ref3 ? _l < _ref3 : _l > _ref3; i = 0 <= _ref3 ? ++_l : --_l) {
          samples[i + delaySamples] += Math.floor(samples[i] * object.reverb.decay);
        }
        sound.samples = samples;
      }
    }
    this.log.verbose("Rendered " + cacheName + ".");
    this.soundCache[cacheName] = sound;
    return sound;
  };

  return Renderer;

})();

renderLoopScript = function(args) {
  var logObj, outputSound, parser, renderer, sampleRate, which;
  logObj = args.log;
  logObj.verbose("Parsing...");
  parser = new Parser(logObj);
  parser.parse(args.script);
  which = args.which;
  if (which == null) {
    which = parser.lastObject;
  }
  if (which) {
    sampleRate = 44100;
    logObj.verbose("Rendering...");
    renderer = new Renderer(logObj, sampleRate, args.readLocalFiles, parser.objects);
    outputSound = renderer.render(which, {});
    if (args.outputFilename) {
      return riffwave.writeWAV(args.outputFilename, sampleRate, outputSound.samples);
    }
    return riffwave.makeBlobUrl(sampleRate, outputSound.samples);
  }
  return null;
};

module.exports = {
  render: renderLoopScript
};


},{"../js/jdataview":1,"./freq":"8uZMKg","./riffwave":"y6ZgdS","fs":2}],"./riffwave":[function(require,module,exports){
module.exports=require('y6ZgdS');
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
},{"buffer":3,"fs":2}]},{},[])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCJqZGF0YXZpZXcuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxsaWJcXF9lbXB0eS5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcbmF0aXZlLWJ1ZmZlci1icm93c2VyaWZ5XFxpbmRleC5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcbmF0aXZlLWJ1ZmZlci1icm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJhc2U2NC1qc1xcbGliXFxiNjQuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXG5hdGl2ZS1idWZmZXItYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxpZWVlNzU0XFxpbmRleC5qcyIsIi4uXFxzcmNcXGV4YW1wbGVzLmNvZmZlZSIsIi4uXFxzcmNcXGZyZXEuY29mZmVlIiwiLi5cXHNyY1xcbG9vcHNjcmlwdC5jb2ZmZWUiLCIuLlxcc3JjXFxyaWZmd2F2ZS5jb2ZmZWUiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNXZCQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoaUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQSxNQUFNLENBQUMsT0FBUCxHQUVFO0FBQUEsRUFBQSxLQUFBLEVBQU8sd1RBQVA7QUFBQSxFQW9CQSxLQUFBLEVBQU8sZ2ZBcEJQO0FBQUEsRUFrREEsS0FBQSxFQUFPLHVwQkFsRFA7QUFBQSxFQThFQSxNQUFBLEVBQVEsOHJCQTlFUjtBQUFBLEVBMEdBLE9BQUEsRUFBUyx1ZEExR1Q7Q0FGRixDQUFBOzs7Ozs7OztBQ0FBLElBQUEsbUNBQUE7O0FBQUEsU0FBQSxHQUFZO0VBQ1Y7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7R0FEVSxFQVFWO0FBQUEsSUFDRSxHQUFBLEVBQUssT0FEUDtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtBQUFBLElBS0UsR0FBQSxFQUFLLE9BTFA7QUFBQSxJQU1FLEdBQUEsRUFBSyxPQU5QO0FBQUEsSUFPRSxHQUFBLEVBQUssT0FQUDtBQUFBLElBUUUsR0FBQSxFQUFLLE9BUlA7QUFBQSxJQVNFLEdBQUEsRUFBSyxPQVRQO0FBQUEsSUFVRSxHQUFBLEVBQUssT0FWUDtBQUFBLElBV0UsR0FBQSxFQUFLLE9BWFA7QUFBQSxJQVlFLEdBQUEsRUFBSyxPQVpQO0dBUlUsRUF1QlY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0F2QlUsRUFzQ1Y7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0F0Q1UsRUFxRFY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0FyRFUsRUFvRVY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFB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QUFBLEtBQUEsQ0FBTSxLQUFLLENBQUMsTUFBWixDQUZsQixDQUFBO0FBR0EsU0FBUyxvR0FBVCxHQUFBO0FBQ0UsTUFBQSxXQUFZLENBQUEsQ0FBQSxDQUFaLEdBQWlCLEtBQUssQ0FBQyxVQUFOLENBQWlCLENBQWpCLENBQWpCLENBREY7QUFBQSxLQUhBO0FBQUEsSUFNQSxTQUFBLEdBQWdCLElBQUEsVUFBQSxDQUFXLFdBQVgsQ0FOaEIsQ0FBQTtBQUFBLElBUUEsVUFBVSxDQUFDLElBQVgsQ0FBZ0IsU0FBaEIsQ0FSQSxDQURGO0FBQUEsR0FOQTtBQUFBLEVBaUJBLElBQUEsR0FBVyxJQUFBLElBQUEsQ0FBSyxVQUFMLEVBQWlCO0FBQUEsSUFBQyxJQUFBLEVBQU0sV0FBUDtHQUFqQixDQWpCWCxDQUFBO0FBa0JBLFNBQU8sSUFBUCxDQW5CVTtBQUFBLENBaEhaLENBQUE7O0FBQUEsV0FxSUEsR0FBYyxTQUFDLFVBQUQsRUFBYSxPQUFiLEdBQUE7QUFDWixNQUFBLFVBQUE7QUFBQSxFQUFBLElBQUEsR0FBVyxJQUFBLFFBQUEsQ0FBUyxVQUFULEVBQXFCLE9BQXJCLENBQVgsQ0FBQTtBQUFBLEVBQ0EsSUFBQSxHQUFPLFNBQUEsQ0FBVSxJQUFJLENBQUMsVUFBZixFQUEyQixXQUEzQixDQURQLENBQUE7QUFFQSxTQUFPLEdBQUcsQ0FBQyxlQUFKLENBQW9CLElBQXBCLENBQVAsQ0FIWTtBQUFBLENBcklkLENBQUE7O0FBQUEsTUEwSU0sQ0FBQyxPQUFQLEdBQ0U7QUFBQSxFQUFBLFFBQUEsRUFBVSxRQUFWO0FBQUEsRUFDQSxRQUFBLEVBQVUsUUFEVjtBQUFBLEVBRUEsV0FBQSxFQUFhLFdBRmI7QUFBQSxFQUdBLFdBQUEsRUFBYSxXQUhiO0NBM0lGLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIihmdW5jdGlvbiAoQnVmZmVyKXtcbi8vXG4vLyBqRGF0YVZpZXcgYnkgVmpldXggPHZqZXV4eEBnbWFpbC5jb20+IC0gSmFuIDIwMTBcbi8vIENvbnRpbnVlZCBieSBSUmV2ZXJzZXIgPG1lQHJyZXZlcnNlci5jb20+IC0gRmViIDIwMTNcbi8vXG4vLyBBIHVuaXF1ZSB3YXkgdG8gd29yayB3aXRoIGEgYmluYXJ5IGZpbGUgaW4gdGhlIGJyb3dzZXJcbi8vIGh0dHA6Ly9naXRodWIuY29tL2pEYXRhVmlldy9qRGF0YVZpZXdcbi8vIGh0dHA6Ly9qRGF0YVZpZXcuZ2l0aHViLmlvL1xuXG4oZnVuY3Rpb24gKGdsb2JhbCkge1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBjb21wYXRpYmlsaXR5ID0ge1xuXHQvLyBOb2RlSlMgQnVmZmVyIGluIHYwLjUuNSBhbmQgbmV3ZXJcblx0Tm9kZUJ1ZmZlcjogJ0J1ZmZlcicgaW4gZ2xvYmFsICYmICdyZWFkSW50MTZMRScgaW4gQnVmZmVyLnByb3RvdHlwZSxcblx0RGF0YVZpZXc6ICdEYXRhVmlldycgaW4gZ2xvYmFsICYmIChcblx0XHQnZ2V0RmxvYXQ2NCcgaW4gRGF0YVZpZXcucHJvdG90eXBlIHx8ICAgICAgICAgICAgLy8gQ2hyb21lXG5cdFx0J2dldEZsb2F0NjQnIGluIG5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIoMSkpIC8vIE5vZGVcblx0KSxcblx0QXJyYXlCdWZmZXI6ICdBcnJheUJ1ZmZlcicgaW4gZ2xvYmFsLFxuXHRQaXhlbERhdGE6ICdDYW52YXNQaXhlbEFycmF5JyBpbiBnbG9iYWwgJiYgJ0ltYWdlRGF0YScgaW4gZ2xvYmFsICYmICdkb2N1bWVudCcgaW4gZ2xvYmFsXG59O1xuXG4vLyB3ZSBkb24ndCB3YW50IHRvIGJvdGhlciB3aXRoIG9sZCBCdWZmZXIgaW1wbGVtZW50YXRpb25cbmlmIChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIpIHtcblx0KGZ1bmN0aW9uIChidWZmZXIpIHtcblx0XHR0cnkge1xuXHRcdFx0YnVmZmVyLndyaXRlRmxvYXRMRShJbmZpbml0eSwgMCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyID0gZmFsc2U7XG5cdFx0fVxuXHR9KShuZXcgQnVmZmVyKDQpKTtcbn1cblxuaWYgKGNvbXBhdGliaWxpdHkuUGl4ZWxEYXRhKSB7XG5cdHZhciBjcmVhdGVQaXhlbERhdGEgPSBmdW5jdGlvbiAoYnl0ZUxlbmd0aCwgYnVmZmVyKSB7XG5cdFx0dmFyIGRhdGEgPSBjcmVhdGVQaXhlbERhdGEuY29udGV4dDJkLmNyZWF0ZUltYWdlRGF0YSgoYnl0ZUxlbmd0aCArIDMpIC8gNCwgMSkuZGF0YTtcblx0XHRkYXRhLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoO1xuXHRcdGlmIChidWZmZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBieXRlTGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0ZGF0YVtpXSA9IGJ1ZmZlcltpXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH07XG5cdGNyZWF0ZVBpeGVsRGF0YS5jb250ZXh0MmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKS5nZXRDb250ZXh0KCcyZCcpO1xufVxuXG52YXIgZGF0YVR5cGVzID0ge1xuXHQnSW50OCc6IDEsXG5cdCdJbnQxNic6IDIsXG5cdCdJbnQzMic6IDQsXG5cdCdVaW50OCc6IDEsXG5cdCdVaW50MTYnOiAyLFxuXHQnVWludDMyJzogNCxcblx0J0Zsb2F0MzInOiA0LFxuXHQnRmxvYXQ2NCc6IDhcbn07XG5cbnZhciBub2RlTmFtaW5nID0ge1xuXHQnSW50OCc6ICdJbnQ4Jyxcblx0J0ludDE2JzogJ0ludDE2Jyxcblx0J0ludDMyJzogJ0ludDMyJyxcblx0J1VpbnQ4JzogJ1VJbnQ4Jyxcblx0J1VpbnQxNic6ICdVSW50MTYnLFxuXHQnVWludDMyJzogJ1VJbnQzMicsXG5cdCdGbG9hdDMyJzogJ0Zsb2F0Jyxcblx0J0Zsb2F0NjQnOiAnRG91YmxlJ1xufTtcblxuZnVuY3Rpb24gYXJyYXlGcm9tKGFycmF5TGlrZSwgZm9yY2VDb3B5KSB7XG5cdHJldHVybiAoIWZvcmNlQ29weSAmJiAoYXJyYXlMaWtlIGluc3RhbmNlb2YgQXJyYXkpKSA/IGFycmF5TGlrZSA6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFycmF5TGlrZSk7XG59XG5cbmZ1bmN0aW9uIGRlZmluZWQodmFsdWUsIGRlZmF1bHRWYWx1ZSkge1xuXHRyZXR1cm4gdmFsdWUgIT09IHVuZGVmaW5lZCA/IHZhbHVlIDogZGVmYXVsdFZhbHVlO1xufVxuXG5mdW5jdGlvbiBqRGF0YVZpZXcoYnVmZmVyLCBieXRlT2Zmc2V0LCBieXRlTGVuZ3RoLCBsaXR0bGVFbmRpYW4pIHtcblx0LyoganNoaW50IHZhbGlkdGhpczp0cnVlICovXG5cblx0aWYgKGJ1ZmZlciBpbnN0YW5jZW9mIGpEYXRhVmlldykge1xuXHRcdHZhciByZXN1bHQgPSBidWZmZXIuc2xpY2UoYnl0ZU9mZnNldCwgYnl0ZU9mZnNldCArIGJ5dGVMZW5ndGgpO1xuXHRcdHJlc3VsdC5fbGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHJlc3VsdC5fbGl0dGxlRW5kaWFuKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0aWYgKCEodGhpcyBpbnN0YW5jZW9mIGpEYXRhVmlldykpIHtcblx0XHRyZXR1cm4gbmV3IGpEYXRhVmlldyhidWZmZXIsIGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgsIGxpdHRsZUVuZGlhbik7XG5cdH1cblxuXHR0aGlzLmJ1ZmZlciA9IGJ1ZmZlciA9IGpEYXRhVmlldy53cmFwQnVmZmVyKGJ1ZmZlcik7XG5cblx0Ly8gQ2hlY2sgcGFyYW1ldGVycyBhbmQgZXhpc3RpbmcgZnVuY3Rpb25uYWxpdGllc1xuXHR0aGlzLl9pc0FycmF5QnVmZmVyID0gY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlciAmJiBidWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcjtcblx0dGhpcy5faXNQaXhlbERhdGEgPSBjb21wYXRpYmlsaXR5LlBpeGVsRGF0YSAmJiBidWZmZXIgaW5zdGFuY2VvZiBDYW52YXNQaXhlbEFycmF5O1xuXHR0aGlzLl9pc0RhdGFWaWV3ID0gY29tcGF0aWJpbGl0eS5EYXRhVmlldyAmJiB0aGlzLl9pc0FycmF5QnVmZmVyO1xuXHR0aGlzLl9pc05vZGVCdWZmZXIgPSBjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIgJiYgYnVmZmVyIGluc3RhbmNlb2YgQnVmZmVyO1xuXG5cdC8vIEhhbmRsZSBUeXBlIEVycm9yc1xuXHRpZiAoIXRoaXMuX2lzTm9kZUJ1ZmZlciAmJiAhdGhpcy5faXNBcnJheUJ1ZmZlciAmJiAhdGhpcy5faXNQaXhlbERhdGEgJiYgIShidWZmZXIgaW5zdGFuY2VvZiBBcnJheSkpIHtcblx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdqRGF0YVZpZXcgYnVmZmVyIGhhcyBhbiBpbmNvbXBhdGlibGUgdHlwZScpO1xuXHR9XG5cblx0Ly8gRGVmYXVsdCBWYWx1ZXNcblx0dGhpcy5fbGl0dGxlRW5kaWFuID0gISFsaXR0bGVFbmRpYW47XG5cblx0dmFyIGJ1ZmZlckxlbmd0aCA9ICdieXRlTGVuZ3RoJyBpbiBidWZmZXIgPyBidWZmZXIuYnl0ZUxlbmd0aCA6IGJ1ZmZlci5sZW5ndGg7XG5cdHRoaXMuYnl0ZU9mZnNldCA9IGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIDApO1xuXHR0aGlzLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoID0gZGVmaW5lZChieXRlTGVuZ3RoLCBidWZmZXJMZW5ndGggLSBieXRlT2Zmc2V0KTtcblxuXHRpZiAoIXRoaXMuX2lzRGF0YVZpZXcpIHtcblx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBieXRlTGVuZ3RoLCBidWZmZXJMZW5ndGgpO1xuXHR9IGVsc2Uge1xuXHRcdHRoaXMuX3ZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmZmVyLCBieXRlT2Zmc2V0LCBieXRlTGVuZ3RoKTtcblx0fVxuXG5cdC8vIENyZWF0ZSB1bmlmb3JtIG1ldGhvZHMgKGFjdGlvbiB3cmFwcGVycykgZm9yIHRoZSBmb2xsb3dpbmcgZGF0YSB0eXBlc1xuXG5cdHRoaXMuX2VuZ2luZUFjdGlvbiA9XG5cdFx0dGhpcy5faXNEYXRhVmlld1xuXHRcdFx0PyB0aGlzLl9kYXRhVmlld0FjdGlvblxuXHRcdDogdGhpcy5faXNOb2RlQnVmZmVyXG5cdFx0XHQ/IHRoaXMuX25vZGVCdWZmZXJBY3Rpb25cblx0XHQ6IHRoaXMuX2lzQXJyYXlCdWZmZXJcblx0XHRcdD8gdGhpcy5fYXJyYXlCdWZmZXJBY3Rpb25cblx0XHQ6IHRoaXMuX2FycmF5QWN0aW9uO1xufVxuXG5mdW5jdGlvbiBnZXRDaGFyQ29kZXMoc3RyaW5nKSB7XG5cdGlmIChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIpIHtcblx0XHRyZXR1cm4gbmV3IEJ1ZmZlcihzdHJpbmcsICdiaW5hcnknKTtcblx0fVxuXG5cdHZhciBUeXBlID0gY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlciA/IFVpbnQ4QXJyYXkgOiBBcnJheSxcblx0XHRjb2RlcyA9IG5ldyBUeXBlKHN0cmluZy5sZW5ndGgpO1xuXG5cdGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBzdHJpbmcubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRjb2Rlc1tpXSA9IHN0cmluZy5jaGFyQ29kZUF0KGkpICYgMHhmZjtcblx0fVxuXHRyZXR1cm4gY29kZXM7XG59XG5cbi8vIG1vc3RseSBpbnRlcm5hbCBmdW5jdGlvbiBmb3Igd3JhcHBpbmcgYW55IHN1cHBvcnRlZCBpbnB1dCAoU3RyaW5nIG9yIEFycmF5LWxpa2UpIHRvIGJlc3Qgc3VpdGFibGUgYnVmZmVyIGZvcm1hdFxuakRhdGFWaWV3LndyYXBCdWZmZXIgPSBmdW5jdGlvbiAoYnVmZmVyKSB7XG5cdHN3aXRjaCAodHlwZW9mIGJ1ZmZlcikge1xuXHRcdGNhc2UgJ251bWJlcic6XG5cdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyKSB7XG5cdFx0XHRcdGJ1ZmZlciA9IG5ldyBCdWZmZXIoYnVmZmVyKTtcblx0XHRcdFx0YnVmZmVyLmZpbGwoMCk7XG5cdFx0XHR9IGVsc2Vcblx0XHRcdGlmIChjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyKSB7XG5cdFx0XHRcdGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcikuYnVmZmVyO1xuXHRcdFx0fSBlbHNlXG5cdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5QaXhlbERhdGEpIHtcblx0XHRcdFx0YnVmZmVyID0gY3JlYXRlUGl4ZWxEYXRhKGJ1ZmZlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRidWZmZXIgPSBuZXcgQXJyYXkoYnVmZmVyKTtcblx0XHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBidWZmZXIubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRidWZmZXJbaV0gPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYnVmZmVyO1xuXG5cdFx0Y2FzZSAnc3RyaW5nJzpcblx0XHRcdGJ1ZmZlciA9IGdldENoYXJDb2RlcyhidWZmZXIpO1xuXHRcdFx0LyogZmFsbHMgdGhyb3VnaCAqL1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRpZiAoJ2xlbmd0aCcgaW4gYnVmZmVyICYmICEoKGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlciAmJiBidWZmZXIgaW5zdGFuY2VvZiBCdWZmZXIpIHx8IChjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyICYmIGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB8fCAoY29tcGF0aWJpbGl0eS5QaXhlbERhdGEgJiYgYnVmZmVyIGluc3RhbmNlb2YgQ2FudmFzUGl4ZWxBcnJheSkpKSB7XG5cdFx0XHRcdGlmIChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIpIHtcblx0XHRcdFx0XHRidWZmZXIgPSBuZXcgQnVmZmVyKGJ1ZmZlcik7XG5cdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlcikge1xuXHRcdFx0XHRcdGlmICghKGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSkge1xuXHRcdFx0XHRcdFx0YnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKS5idWZmZXI7XG5cdFx0XHRcdFx0XHQvLyBidWcgaW4gTm9kZS5qcyA8PSAwLjg6XG5cdFx0XHRcdFx0XHRpZiAoIShidWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikpIHtcblx0XHRcdFx0XHRcdFx0YnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXlGcm9tKGJ1ZmZlciwgdHJ1ZSkpLmJ1ZmZlcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5QaXhlbERhdGEpIHtcblx0XHRcdFx0XHRidWZmZXIgPSBjcmVhdGVQaXhlbERhdGEoYnVmZmVyLmxlbmd0aCwgYnVmZmVyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRidWZmZXIgPSBhcnJheUZyb20oYnVmZmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJ1ZmZlcjtcblx0fVxufTtcblxuZnVuY3Rpb24gcG93MihuKSB7XG5cdHJldHVybiAobiA+PSAwICYmIG4gPCAzMSkgPyAoMSA8PCBuKSA6IChwb3cyW25dIHx8IChwb3cyW25dID0gTWF0aC5wb3coMiwgbikpKTtcbn1cblxuLy8gbGVmdCBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuakRhdGFWaWV3LmNyZWF0ZUJ1ZmZlciA9IGZ1bmN0aW9uICgpIHtcblx0cmV0dXJuIGpEYXRhVmlldy53cmFwQnVmZmVyKGFyZ3VtZW50cyk7XG59O1xuXG5mdW5jdGlvbiBVaW50NjQobG8sIGhpKSB7XG5cdHRoaXMubG8gPSBsbztcblx0dGhpcy5oaSA9IGhpO1xufVxuXG5qRGF0YVZpZXcuVWludDY0ID0gVWludDY0O1xuXG5VaW50NjQucHJvdG90eXBlID0ge1xuXHR2YWx1ZU9mOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRoaXMubG8gKyBwb3cyKDMyKSAqIHRoaXMuaGk7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gTnVtYmVyLnByb3RvdHlwZS50b1N0cmluZy5hcHBseSh0aGlzLnZhbHVlT2YoKSwgYXJndW1lbnRzKTtcblx0fVxufTtcblxuVWludDY0LmZyb21OdW1iZXIgPSBmdW5jdGlvbiAobnVtYmVyKSB7XG5cdHZhciBoaSA9IE1hdGguZmxvb3IobnVtYmVyIC8gcG93MigzMikpLFxuXHRcdGxvID0gbnVtYmVyIC0gaGkgKiBwb3cyKDMyKTtcblxuXHRyZXR1cm4gbmV3IFVpbnQ2NChsbywgaGkpO1xufTtcblxuZnVuY3Rpb24gSW50NjQobG8sIGhpKSB7XG5cdFVpbnQ2NC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xufVxuXG5qRGF0YVZpZXcuSW50NjQgPSBJbnQ2NDtcblxuSW50NjQucHJvdG90eXBlID0gJ2NyZWF0ZScgaW4gT2JqZWN0ID8gT2JqZWN0LmNyZWF0ZShVaW50NjQucHJvdG90eXBlKSA6IG5ldyBVaW50NjQoKTtcblxuSW50NjQucHJvdG90eXBlLnZhbHVlT2YgPSBmdW5jdGlvbiAoKSB7XG5cdGlmICh0aGlzLmhpIDwgcG93MigzMSkpIHtcblx0XHRyZXR1cm4gVWludDY0LnByb3RvdHlwZS52YWx1ZU9mLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdH1cblx0cmV0dXJuIC0oKHBvdzIoMzIpIC0gdGhpcy5sbykgKyBwb3cyKDMyKSAqIChwb3cyKDMyKSAtIDEgLSB0aGlzLmhpKSk7XG59O1xuXG5JbnQ2NC5mcm9tTnVtYmVyID0gZnVuY3Rpb24gKG51bWJlcikge1xuXHR2YXIgbG8sIGhpO1xuXHRpZiAobnVtYmVyID49IDApIHtcblx0XHR2YXIgdW5zaWduZWQgPSBVaW50NjQuZnJvbU51bWJlcihudW1iZXIpO1xuXHRcdGxvID0gdW5zaWduZWQubG87XG5cdFx0aGkgPSB1bnNpZ25lZC5oaTtcblx0fSBlbHNlIHtcblx0XHRoaSA9IE1hdGguZmxvb3IobnVtYmVyIC8gcG93MigzMikpO1xuXHRcdGxvID0gbnVtYmVyIC0gaGkgKiBwb3cyKDMyKTtcblx0XHRoaSArPSBwb3cyKDMyKTtcblx0fVxuXHRyZXR1cm4gbmV3IEludDY0KGxvLCBoaSk7XG59O1xuXG5qRGF0YVZpZXcucHJvdG90eXBlID0ge1xuXHRfb2Zmc2V0OiAwLFxuXHRfYml0T2Zmc2V0OiAwLFxuXG5cdGNvbXBhdGliaWxpdHk6IGNvbXBhdGliaWxpdHksXG5cblx0X2NoZWNrQm91bmRzOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCwgbWF4TGVuZ3RoKSB7XG5cdFx0Ly8gRG8gYWRkaXRpb25hbCBjaGVja3MgdG8gc2ltdWxhdGUgRGF0YVZpZXdcblx0XHRpZiAodHlwZW9mIGJ5dGVPZmZzZXQgIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdPZmZzZXQgaXMgbm90IGEgbnVtYmVyLicpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGJ5dGVMZW5ndGggIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdTaXplIGlzIG5vdCBhIG51bWJlci4nKTtcblx0XHR9XG5cdFx0aWYgKGJ5dGVMZW5ndGggPCAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgUmFuZ2VFcnJvcignTGVuZ3RoIGlzIG5lZ2F0aXZlLicpO1xuXHRcdH1cblx0XHRpZiAoYnl0ZU9mZnNldCA8IDAgfHwgYnl0ZU9mZnNldCArIGJ5dGVMZW5ndGggPiBkZWZpbmVkKG1heExlbmd0aCwgdGhpcy5ieXRlTGVuZ3RoKSkge1xuXHRcdFx0dGhyb3cgbmV3IFJhbmdlRXJyb3IoJ09mZnNldHMgYXJlIG91dCBvZiBib3VuZHMuJyk7XG5cdFx0fVxuXHR9LFxuXG5cdF9hY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5naW5lQWN0aW9uKFxuXHRcdFx0dHlwZSxcblx0XHRcdGlzUmVhZEFjdGlvbixcblx0XHRcdGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KSxcblx0XHRcdGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pLFxuXHRcdFx0dmFsdWVcblx0XHQpO1xuXHR9LFxuXG5cdF9kYXRhVmlld0FjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdC8vIE1vdmUgdGhlIGludGVybmFsIG9mZnNldCBmb3J3YXJkXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIGRhdGFUeXBlc1t0eXBlXTtcblx0XHRyZXR1cm4gaXNSZWFkQWN0aW9uID8gdGhpcy5fdmlld1snZ2V0JyArIHR5cGVdKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikgOiB0aGlzLl92aWV3WydzZXQnICsgdHlwZV0oYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X25vZGVCdWZmZXJBY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHQvLyBNb3ZlIHRoZSBpbnRlcm5hbCBvZmZzZXQgZm9yd2FyZFxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyBkYXRhVHlwZXNbdHlwZV07XG5cdFx0dmFyIG5vZGVOYW1lID0gbm9kZU5hbWluZ1t0eXBlXSArICgodHlwZSA9PT0gJ0ludDgnIHx8IHR5cGUgPT09ICdVaW50OCcpID8gJycgOiBsaXR0bGVFbmRpYW4gPyAnTEUnIDogJ0JFJyk7XG5cdFx0Ynl0ZU9mZnNldCArPSB0aGlzLmJ5dGVPZmZzZXQ7XG5cdFx0cmV0dXJuIGlzUmVhZEFjdGlvbiA/IHRoaXMuYnVmZmVyWydyZWFkJyArIG5vZGVOYW1lXShieXRlT2Zmc2V0KSA6IHRoaXMuYnVmZmVyWyd3cml0ZScgKyBub2RlTmFtZV0odmFsdWUsIGJ5dGVPZmZzZXQpO1xuXHR9LFxuXG5cdF9hcnJheUJ1ZmZlckFjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdHZhciBzaXplID0gZGF0YVR5cGVzW3R5cGVdLCBUeXBlZEFycmF5ID0gZ2xvYmFsW3R5cGUgKyAnQXJyYXknXSwgdHlwZWRBcnJheTtcblxuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXG5cdFx0Ly8gQXJyYXlCdWZmZXI6IHdlIHVzZSBhIHR5cGVkIGFycmF5IG9mIHNpemUgMSBmcm9tIG9yaWdpbmFsIGJ1ZmZlciBpZiBhbGlnbm1lbnQgaXMgZ29vZCBhbmQgZnJvbSBzbGljZSB3aGVuIGl0J3Mgbm90XG5cdFx0aWYgKHNpemUgPT09IDEgfHwgKCh0aGlzLmJ5dGVPZmZzZXQgKyBieXRlT2Zmc2V0KSAlIHNpemUgPT09IDAgJiYgbGl0dGxlRW5kaWFuKSkge1xuXHRcdFx0dHlwZWRBcnJheSA9IG5ldyBUeXBlZEFycmF5KHRoaXMuYnVmZmVyLCB0aGlzLmJ5dGVPZmZzZXQgKyBieXRlT2Zmc2V0LCAxKTtcblx0XHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyBzaXplO1xuXHRcdFx0cmV0dXJuIGlzUmVhZEFjdGlvbiA/IHR5cGVkQXJyYXlbMF0gOiAodHlwZWRBcnJheVswXSA9IHZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoaXNSZWFkQWN0aW9uID8gdGhpcy5nZXRCeXRlcyhzaXplLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpIDogc2l6ZSk7XG5cdFx0XHR0eXBlZEFycmF5ID0gbmV3IFR5cGVkQXJyYXkoYnl0ZXMuYnVmZmVyLCAwLCAxKTtcblxuXHRcdFx0aWYgKGlzUmVhZEFjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdHlwZWRBcnJheVswXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHR5cGVkQXJyYXlbMF0gPSB2YWx1ZTtcblx0XHRcdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgYnl0ZXMsIGxpdHRsZUVuZGlhbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxuXG5cdF9hcnJheUFjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdHJldHVybiBpc1JlYWRBY3Rpb24gPyB0aGlzWydfZ2V0JyArIHR5cGVdKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikgOiB0aGlzWydfc2V0JyArIHR5cGVdKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdC8vIEhlbHBlcnNcblxuXHRfZ2V0Qnl0ZXM6IGZ1bmN0aW9uIChsZW5ndGgsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cdFx0bGVuZ3RoID0gZGVmaW5lZChsZW5ndGgsIHRoaXMuYnl0ZUxlbmd0aCAtIGJ5dGVPZmZzZXQpO1xuXG5cdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgbGVuZ3RoKTtcblxuXHRcdGJ5dGVPZmZzZXQgKz0gdGhpcy5ieXRlT2Zmc2V0O1xuXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCAtIHRoaXMuYnl0ZU9mZnNldCArIGxlbmd0aDtcblxuXHRcdHZhciByZXN1bHQgPSB0aGlzLl9pc0FycmF5QnVmZmVyXG5cdFx0XHRcdFx0ID8gbmV3IFVpbnQ4QXJyYXkodGhpcy5idWZmZXIsIGJ5dGVPZmZzZXQsIGxlbmd0aClcblx0XHRcdFx0XHQgOiAodGhpcy5idWZmZXIuc2xpY2UgfHwgQXJyYXkucHJvdG90eXBlLnNsaWNlKS5jYWxsKHRoaXMuYnVmZmVyLCBieXRlT2Zmc2V0LCBieXRlT2Zmc2V0ICsgbGVuZ3RoKTtcblxuXHRcdHJldHVybiBsaXR0bGVFbmRpYW4gfHwgbGVuZ3RoIDw9IDEgPyByZXN1bHQgOiBhcnJheUZyb20ocmVzdWx0KS5yZXZlcnNlKCk7XG5cdH0sXG5cblx0Ly8gd3JhcHBlciBmb3IgZXh0ZXJuYWwgY2FsbHMgKGRvIG5vdCByZXR1cm4gaW5uZXIgYnVmZmVyIGRpcmVjdGx5IHRvIHByZXZlbnQgaXQncyBtb2RpZnlpbmcpXG5cdGdldEJ5dGVzOiBmdW5jdGlvbiAobGVuZ3RoLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRvQXJyYXkpIHtcblx0XHR2YXIgcmVzdWx0ID0gdGhpcy5fZ2V0Qnl0ZXMobGVuZ3RoLCBieXRlT2Zmc2V0LCBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdHJ1ZSkpO1xuXHRcdHJldHVybiB0b0FycmF5ID8gYXJyYXlGcm9tKHJlc3VsdCkgOiByZXN1bHQ7XG5cdH0sXG5cblx0X3NldEJ5dGVzOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgYnl0ZXMsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBsZW5ndGggPSBieXRlcy5sZW5ndGg7XG5cblx0XHQvLyBuZWVkZWQgZm9yIE9wZXJhXG5cdFx0aWYgKGxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cblx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBsZW5ndGgpO1xuXG5cdFx0aWYgKCFsaXR0bGVFbmRpYW4gJiYgbGVuZ3RoID4gMSkge1xuXHRcdFx0Ynl0ZXMgPSBhcnJheUZyb20oYnl0ZXMsIHRydWUpLnJldmVyc2UoKTtcblx0XHR9XG5cblx0XHRieXRlT2Zmc2V0ICs9IHRoaXMuYnl0ZU9mZnNldDtcblxuXHRcdGlmICh0aGlzLl9pc0FycmF5QnVmZmVyKSB7XG5cdFx0XHRuZXcgVWludDhBcnJheSh0aGlzLmJ1ZmZlciwgYnl0ZU9mZnNldCwgbGVuZ3RoKS5zZXQoYnl0ZXMpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGlmICh0aGlzLl9pc05vZGVCdWZmZXIpIHtcblx0XHRcdFx0bmV3IEJ1ZmZlcihieXRlcykuY29weSh0aGlzLmJ1ZmZlciwgYnl0ZU9mZnNldCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0dGhpcy5idWZmZXJbYnl0ZU9mZnNldCArIGldID0gYnl0ZXNbaV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0IC0gdGhpcy5ieXRlT2Zmc2V0ICsgbGVuZ3RoO1xuXHR9LFxuXG5cdHNldEJ5dGVzOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgYnl0ZXMsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIGJ5dGVzLCBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdHJ1ZSkpO1xuXHR9LFxuXG5cdGdldFN0cmluZzogZnVuY3Rpb24gKGJ5dGVMZW5ndGgsIGJ5dGVPZmZzZXQsIGVuY29kaW5nKSB7XG5cdFx0aWYgKHRoaXMuX2lzTm9kZUJ1ZmZlcikge1xuXHRcdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblx0XHRcdGJ5dGVMZW5ndGggPSBkZWZpbmVkKGJ5dGVMZW5ndGgsIHRoaXMuYnl0ZUxlbmd0aCAtIGJ5dGVPZmZzZXQpO1xuXG5cdFx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBieXRlTGVuZ3RoKTtcblxuXHRcdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIGJ5dGVMZW5ndGg7XG5cdFx0XHRyZXR1cm4gdGhpcy5idWZmZXIudG9TdHJpbmcoZW5jb2RpbmcgfHwgJ2JpbmFyeScsIHRoaXMuYnl0ZU9mZnNldCArIGJ5dGVPZmZzZXQsIHRoaXMuYnl0ZU9mZnNldCArIHRoaXMuX29mZnNldCk7XG5cdFx0fVxuXHRcdHZhciBieXRlcyA9IHRoaXMuX2dldEJ5dGVzKGJ5dGVMZW5ndGgsIGJ5dGVPZmZzZXQsIHRydWUpLCBzdHJpbmcgPSAnJztcblx0XHRieXRlTGVuZ3RoID0gYnl0ZXMubGVuZ3RoO1xuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZUxlbmd0aDsgaSsrKSB7XG5cdFx0XHRzdHJpbmcgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSk7XG5cdFx0fVxuXHRcdGlmIChlbmNvZGluZyA9PT0gJ3V0ZjgnKSB7XG5cdFx0XHRzdHJpbmcgPSBkZWNvZGVVUklDb21wb25lbnQoZXNjYXBlKHN0cmluZykpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RyaW5nO1xuXHR9LFxuXG5cdHNldFN0cmluZzogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHN1YlN0cmluZywgZW5jb2RpbmcpIHtcblx0XHRpZiAodGhpcy5faXNOb2RlQnVmZmVyKSB7XG5cdFx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXHRcdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgc3ViU3RyaW5nLmxlbmd0aCk7XG5cdFx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgdGhpcy5idWZmZXIud3JpdGUoc3ViU3RyaW5nLCB0aGlzLmJ5dGVPZmZzZXQgKyBieXRlT2Zmc2V0LCBlbmNvZGluZyB8fCAnYmluYXJ5Jyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlbmNvZGluZyA9PT0gJ3V0ZjgnKSB7XG5cdFx0XHRzdWJTdHJpbmcgPSB1bmVzY2FwZShlbmNvZGVVUklDb21wb25lbnQoc3ViU3RyaW5nKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIGdldENoYXJDb2RlcyhzdWJTdHJpbmcpLCB0cnVlKTtcblx0fSxcblxuXHRnZXRDaGFyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCkge1xuXHRcdHJldHVybiB0aGlzLmdldFN0cmluZygxLCBieXRlT2Zmc2V0KTtcblx0fSxcblxuXHRzZXRDaGFyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgY2hhcmFjdGVyKSB7XG5cdFx0dGhpcy5zZXRTdHJpbmcoYnl0ZU9mZnNldCwgY2hhcmFjdGVyKTtcblx0fSxcblxuXHR0ZWxsOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX29mZnNldDtcblx0fSxcblxuXHRzZWVrOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCkge1xuXHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIDApO1xuXHRcdC8qIGpzaGludCBib3NzOiB0cnVlICovXG5cdFx0cmV0dXJuIHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQ7XG5cdH0sXG5cblx0c2tpcDogZnVuY3Rpb24gKGJ5dGVMZW5ndGgpIHtcblx0XHRyZXR1cm4gdGhpcy5zZWVrKHRoaXMuX29mZnNldCArIGJ5dGVMZW5ndGgpO1xuXHR9LFxuXG5cdHNsaWNlOiBmdW5jdGlvbiAoc3RhcnQsIGVuZCwgZm9yY2VDb3B5KSB7XG5cdFx0ZnVuY3Rpb24gbm9ybWFsaXplT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG9mZnNldCA8IDAgPyBvZmZzZXQgKyBieXRlTGVuZ3RoIDogb2Zmc2V0O1xuXHRcdH1cblxuXHRcdHN0YXJ0ID0gbm9ybWFsaXplT2Zmc2V0KHN0YXJ0LCB0aGlzLmJ5dGVMZW5ndGgpO1xuXHRcdGVuZCA9IG5vcm1hbGl6ZU9mZnNldChkZWZpbmVkKGVuZCwgdGhpcy5ieXRlTGVuZ3RoKSwgdGhpcy5ieXRlTGVuZ3RoKTtcblxuXHRcdHJldHVybiBmb3JjZUNvcHlcblx0XHRcdCAgID8gbmV3IGpEYXRhVmlldyh0aGlzLmdldEJ5dGVzKGVuZCAtIHN0YXJ0LCBzdGFydCwgdHJ1ZSwgdHJ1ZSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLl9saXR0bGVFbmRpYW4pXG5cdFx0XHQgICA6IG5ldyBqRGF0YVZpZXcodGhpcy5idWZmZXIsIHRoaXMuYnl0ZU9mZnNldCArIHN0YXJ0LCBlbmQgLSBzdGFydCwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRhbGlnbkJ5OiBmdW5jdGlvbiAoYnl0ZUNvdW50KSB7XG5cdFx0dGhpcy5fYml0T2Zmc2V0ID0gMDtcblx0XHRpZiAoZGVmaW5lZChieXRlQ291bnQsIDEpICE9PSAxKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5za2lwKGJ5dGVDb3VudCAtICh0aGlzLl9vZmZzZXQgJSBieXRlQ291bnQgfHwgYnl0ZUNvdW50KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9vZmZzZXQ7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIENvbXBhdGliaWxpdHkgZnVuY3Rpb25zXG5cblx0X2dldEZsb2F0NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgYiA9IHRoaXMuX2dldEJ5dGVzKDgsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiksXG5cblx0XHRcdHNpZ24gPSAxIC0gKDIgKiAoYls3XSA+PiA3KSksXG5cdFx0XHRleHBvbmVudCA9ICgoKChiWzddIDw8IDEpICYgMHhmZikgPDwgMykgfCAoYls2XSA+PiA0KSkgLSAoKDEgPDwgMTApIC0gMSksXG5cblx0XHQvLyBCaW5hcnkgb3BlcmF0b3JzIHN1Y2ggYXMgfCBhbmQgPDwgb3BlcmF0ZSBvbiAzMiBiaXQgdmFsdWVzLCB1c2luZyArIGFuZCBNYXRoLnBvdygyKSBpbnN0ZWFkXG5cdFx0XHRtYW50aXNzYSA9ICgoYls2XSAmIDB4MGYpICogcG93Mig0OCkpICsgKGJbNV0gKiBwb3cyKDQwKSkgKyAoYls0XSAqIHBvdzIoMzIpKSArXG5cdFx0XHRcdFx0XHQoYlszXSAqIHBvdzIoMjQpKSArIChiWzJdICogcG93MigxNikpICsgKGJbMV0gKiBwb3cyKDgpKSArIGJbMF07XG5cblx0XHRpZiAoZXhwb25lbnQgPT09IDEwMjQpIHtcblx0XHRcdGlmIChtYW50aXNzYSAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gTmFOO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHNpZ24gKiBJbmZpbml0eTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXhwb25lbnQgPT09IC0xMDIzKSB7IC8vIERlbm9ybWFsaXplZFxuXHRcdFx0cmV0dXJuIHNpZ24gKiBtYW50aXNzYSAqIHBvdzIoLTEwMjIgLSA1Mik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNpZ24gKiAoMSArIG1hbnRpc3NhICogcG93MigtNTIpKSAqIHBvdzIoZXhwb25lbnQpO1xuXHR9LFxuXG5cdF9nZXRGbG9hdDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGIgPSB0aGlzLl9nZXRCeXRlcyg0LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pLFxuXG5cdFx0XHRzaWduID0gMSAtICgyICogKGJbM10gPj4gNykpLFxuXHRcdFx0ZXhwb25lbnQgPSAoKChiWzNdIDw8IDEpICYgMHhmZikgfCAoYlsyXSA+PiA3KSkgLSAxMjcsXG5cdFx0XHRtYW50aXNzYSA9ICgoYlsyXSAmIDB4N2YpIDw8IDE2KSB8IChiWzFdIDw8IDgpIHwgYlswXTtcblxuXHRcdGlmIChleHBvbmVudCA9PT0gMTI4KSB7XG5cdFx0XHRpZiAobWFudGlzc2EgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIE5hTjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBzaWduICogSW5maW5pdHk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGV4cG9uZW50ID09PSAtMTI3KSB7IC8vIERlbm9ybWFsaXplZFxuXHRcdFx0cmV0dXJuIHNpZ24gKiBtYW50aXNzYSAqIHBvdzIoLTEyNiAtIDIzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc2lnbiAqICgxICsgbWFudGlzc2EgKiBwb3cyKC0yMykpICogcG93MihleHBvbmVudCk7XG5cdH0sXG5cblx0X2dldDY0OiBmdW5jdGlvbiAoVHlwZSwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0bGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblxuXHRcdHZhciBwYXJ0cyA9IGxpdHRsZUVuZGlhbiA/IFswLCA0XSA6IFs0LCAwXTtcblxuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgMjsgaSsrKSB7XG5cdFx0XHRwYXJ0c1tpXSA9IHRoaXMuZ2V0VWludDMyKGJ5dGVPZmZzZXQgKyBwYXJ0c1tpXSwgbGl0dGxlRW5kaWFuKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgODtcblxuXHRcdHJldHVybiBuZXcgVHlwZShwYXJ0c1swXSwgcGFydHNbMV0pO1xuXHR9LFxuXG5cdGdldEludDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldDY0KEludDY0LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdGdldFVpbnQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHJldHVybiB0aGlzLl9nZXQ2NChVaW50NjQsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X2dldEludDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGIgPSB0aGlzLl9nZXRCeXRlcyg0LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHRcdHJldHVybiAoYlszXSA8PCAyNCkgfCAoYlsyXSA8PCAxNikgfCAoYlsxXSA8PCA4KSB8IGJbMF07XG5cdH0sXG5cblx0X2dldFVpbnQzMjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHJldHVybiB0aGlzLl9nZXRJbnQzMihieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pID4+PiAwO1xuXHR9LFxuXG5cdF9nZXRJbnQxNjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHJldHVybiAodGhpcy5fZ2V0VWludDE2KGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikgPDwgMTYpID4+IDE2O1xuXHR9LFxuXG5cdF9nZXRVaW50MTY6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgYiA9IHRoaXMuX2dldEJ5dGVzKDIsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdFx0cmV0dXJuIChiWzFdIDw8IDgpIHwgYlswXTtcblx0fSxcblxuXHRfZ2V0SW50ODogZnVuY3Rpb24gKGJ5dGVPZmZzZXQpIHtcblx0XHRyZXR1cm4gKHRoaXMuX2dldFVpbnQ4KGJ5dGVPZmZzZXQpIDw8IDI0KSA+PiAyNDtcblx0fSxcblxuXHRfZ2V0VWludDg6IGZ1bmN0aW9uIChieXRlT2Zmc2V0KSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJ5dGVzKDEsIGJ5dGVPZmZzZXQpWzBdO1xuXHR9LFxuXG5cdF9nZXRCaXRSYW5nZURhdGE6IGZ1bmN0aW9uIChiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpIHtcblx0XHR2YXIgc3RhcnRCaXQgPSAoZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpIDw8IDMpICsgdGhpcy5fYml0T2Zmc2V0LFxuXHRcdFx0ZW5kQml0ID0gc3RhcnRCaXQgKyBiaXRMZW5ndGgsXG5cdFx0XHRzdGFydCA9IHN0YXJ0Qml0ID4+PiAzLFxuXHRcdFx0ZW5kID0gKGVuZEJpdCArIDcpID4+PiAzLFxuXHRcdFx0YiA9IHRoaXMuX2dldEJ5dGVzKGVuZCAtIHN0YXJ0LCBzdGFydCwgdHJ1ZSksXG5cdFx0XHR3aWRlVmFsdWUgPSAwO1xuXG5cdFx0LyoganNoaW50IGJvc3M6IHRydWUgKi9cblx0XHRpZiAodGhpcy5fYml0T2Zmc2V0ID0gZW5kQml0ICYgNykge1xuXHRcdFx0dGhpcy5fYml0T2Zmc2V0IC09IDg7XG5cdFx0fVxuXG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGIubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdHdpZGVWYWx1ZSA9ICh3aWRlVmFsdWUgPDwgOCkgfCBiW2ldO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydDogc3RhcnQsXG5cdFx0XHRieXRlczogYixcblx0XHRcdHdpZGVWYWx1ZTogd2lkZVZhbHVlXG5cdFx0fTtcblx0fSxcblxuXHRnZXRTaWduZWQ6IGZ1bmN0aW9uIChiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpIHtcblx0XHR2YXIgc2hpZnQgPSAzMiAtIGJpdExlbmd0aDtcblx0XHRyZXR1cm4gKHRoaXMuZ2V0VW5zaWduZWQoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KSA8PCBzaGlmdCkgPj4gc2hpZnQ7XG5cdH0sXG5cblx0Z2V0VW5zaWduZWQ6IGZ1bmN0aW9uIChiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpIHtcblx0XHR2YXIgdmFsdWUgPSB0aGlzLl9nZXRCaXRSYW5nZURhdGEoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KS53aWRlVmFsdWUgPj4+IC10aGlzLl9iaXRPZmZzZXQ7XG5cdFx0cmV0dXJuIGJpdExlbmd0aCA8IDMyID8gKHZhbHVlICYgfigtMSA8PCBiaXRMZW5ndGgpKSA6IHZhbHVlO1xuXHR9LFxuXG5cdF9zZXRCaW5hcnlGbG9hdDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBtYW50U2l6ZSwgZXhwU2l6ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIHNpZ25CaXQgPSB2YWx1ZSA8IDAgPyAxIDogMCxcblx0XHRcdGV4cG9uZW50LFxuXHRcdFx0bWFudGlzc2EsXG5cdFx0XHRlTWF4ID0gfigtMSA8PCAoZXhwU2l6ZSAtIDEpKSxcblx0XHRcdGVNaW4gPSAxIC0gZU1heDtcblxuXHRcdGlmICh2YWx1ZSA8IDApIHtcblx0XHRcdHZhbHVlID0gLXZhbHVlO1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZSA9PT0gMCkge1xuXHRcdFx0ZXhwb25lbnQgPSAwO1xuXHRcdFx0bWFudGlzc2EgPSAwO1xuXHRcdH0gZWxzZSBpZiAoaXNOYU4odmFsdWUpKSB7XG5cdFx0XHRleHBvbmVudCA9IDIgKiBlTWF4ICsgMTtcblx0XHRcdG1hbnRpc3NhID0gMTtcblx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSBJbmZpbml0eSkge1xuXHRcdFx0ZXhwb25lbnQgPSAyICogZU1heCArIDE7XG5cdFx0XHRtYW50aXNzYSA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGV4cG9uZW50ID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMik7XG5cdFx0XHRpZiAoZXhwb25lbnQgPj0gZU1pbiAmJiBleHBvbmVudCA8PSBlTWF4KSB7XG5cdFx0XHRcdG1hbnRpc3NhID0gTWF0aC5mbG9vcigodmFsdWUgKiBwb3cyKC1leHBvbmVudCkgLSAxKSAqIHBvdzIobWFudFNpemUpKTtcblx0XHRcdFx0ZXhwb25lbnQgKz0gZU1heDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1hbnRpc3NhID0gTWF0aC5mbG9vcih2YWx1ZSAvIHBvdzIoZU1pbiAtIG1hbnRTaXplKSk7XG5cdFx0XHRcdGV4cG9uZW50ID0gMDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR2YXIgYiA9IFtdO1xuXHRcdHdoaWxlIChtYW50U2l6ZSA+PSA4KSB7XG5cdFx0XHRiLnB1c2gobWFudGlzc2EgJSAyNTYpO1xuXHRcdFx0bWFudGlzc2EgPSBNYXRoLmZsb29yKG1hbnRpc3NhIC8gMjU2KTtcblx0XHRcdG1hbnRTaXplIC09IDg7XG5cdFx0fVxuXHRcdGV4cG9uZW50ID0gKGV4cG9uZW50IDw8IG1hbnRTaXplKSB8IG1hbnRpc3NhO1xuXHRcdGV4cFNpemUgKz0gbWFudFNpemU7XG5cdFx0d2hpbGUgKGV4cFNpemUgPj0gOCkge1xuXHRcdFx0Yi5wdXNoKGV4cG9uZW50ICYgMHhmZik7XG5cdFx0XHRleHBvbmVudCA+Pj49IDg7XG5cdFx0XHRleHBTaXplIC09IDg7XG5cdFx0fVxuXHRcdGIucHVzaCgoc2lnbkJpdCA8PCBleHBTaXplKSB8IGV4cG9uZW50KTtcblxuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIGIsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldEZsb2F0MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0QmluYXJ5RmxvYXQoYnl0ZU9mZnNldCwgdmFsdWUsIDIzLCA4LCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRGbG9hdDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJpbmFyeUZsb2F0KGJ5dGVPZmZzZXQsIHZhbHVlLCA1MiwgMTEsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldDY0OiBmdW5jdGlvbiAoVHlwZSwgYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdGlmICghKHZhbHVlIGluc3RhbmNlb2YgVHlwZSkpIHtcblx0XHRcdHZhbHVlID0gVHlwZS5mcm9tTnVtYmVyKHZhbHVlKTtcblx0XHR9XG5cblx0XHRsaXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXG5cdFx0dmFyIHBhcnRzID0gbGl0dGxlRW5kaWFuID8ge2xvOiAwLCBoaTogNH0gOiB7bG86IDQsIGhpOiAwfTtcblxuXHRcdGZvciAodmFyIHBhcnROYW1lIGluIHBhcnRzKSB7XG5cdFx0XHR0aGlzLnNldFVpbnQzMihieXRlT2Zmc2V0ICsgcGFydHNbcGFydE5hbWVdLCB2YWx1ZVtwYXJ0TmFtZV0sIGxpdHRsZUVuZGlhbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIDg7XG5cdH0sXG5cblx0c2V0SW50NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0NjQoSW50NjQsIGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdHNldFVpbnQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXQ2NChVaW50NjQsIGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRVaW50MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgW1xuXHRcdFx0dmFsdWUgJiAweGZmLFxuXHRcdFx0KHZhbHVlID4+PiA4KSAmIDB4ZmYsXG5cdFx0XHQodmFsdWUgPj4+IDE2KSAmIDB4ZmYsXG5cdFx0XHR2YWx1ZSA+Pj4gMjRcblx0XHRdLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRVaW50MTY6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgW1xuXHRcdFx0dmFsdWUgJiAweGZmLFxuXHRcdFx0KHZhbHVlID4+PiA4KSAmIDB4ZmZcblx0XHRdLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRVaW50ODogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlKSB7XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgW3ZhbHVlICYgMHhmZl0pO1xuXHR9LFxuXG5cdHNldFVuc2lnbmVkOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGJpdExlbmd0aCkge1xuXHRcdHZhciBkYXRhID0gdGhpcy5fZ2V0Qml0UmFuZ2VEYXRhKGJpdExlbmd0aCwgYnl0ZU9mZnNldCksXG5cdFx0XHR3aWRlVmFsdWUgPSBkYXRhLndpZGVWYWx1ZSxcblx0XHRcdGIgPSBkYXRhLmJ5dGVzO1xuXG5cdFx0d2lkZVZhbHVlICY9IH4ofigtMSA8PCBiaXRMZW5ndGgpIDw8IC10aGlzLl9iaXRPZmZzZXQpOyAvLyBjbGVhcmluZyBiaXQgcmFuZ2UgYmVmb3JlIGJpbmFyeSBcIm9yXCJcblx0XHR3aWRlVmFsdWUgfD0gKGJpdExlbmd0aCA8IDMyID8gKHZhbHVlICYgfigtMSA8PCBiaXRMZW5ndGgpKSA6IHZhbHVlKSA8PCAtdGhpcy5fYml0T2Zmc2V0OyAvLyBzZXR0aW5nIGJpdHNcblxuXHRcdGZvciAodmFyIGkgPSBiLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRiW2ldID0gd2lkZVZhbHVlICYgMHhmZjtcblx0XHRcdHdpZGVWYWx1ZSA+Pj49IDg7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2V0Qnl0ZXMoZGF0YS5zdGFydCwgYiwgdHJ1ZSk7XG5cdH1cbn07XG5cbnZhciBwcm90byA9IGpEYXRhVmlldy5wcm90b3R5cGU7XG5cbmZvciAodmFyIHR5cGUgaW4gZGF0YVR5cGVzKSB7XG5cdChmdW5jdGlvbiAodHlwZSkge1xuXHRcdHByb3RvWydnZXQnICsgdHlwZV0gPSBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uKHR5cGUsIHRydWUsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdFx0fTtcblx0XHRwcm90b1snc2V0JyArIHR5cGVdID0gZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHRcdHRoaXMuX2FjdGlvbih0eXBlLCBmYWxzZSwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSk7XG5cdFx0fTtcblx0fSkodHlwZSk7XG59XG5cbnByb3RvLl9zZXRJbnQzMiA9IHByb3RvLl9zZXRVaW50MzI7XG5wcm90by5fc2V0SW50MTYgPSBwcm90by5fc2V0VWludDE2O1xucHJvdG8uX3NldEludDggPSBwcm90by5fc2V0VWludDg7XG5wcm90by5zZXRTaWduZWQgPSBwcm90by5zZXRVbnNpZ25lZDtcblxuZm9yICh2YXIgbWV0aG9kIGluIHByb3RvKSB7XG5cdGlmIChtZXRob2Quc2xpY2UoMCwgMykgPT09ICdzZXQnKSB7XG5cdFx0KGZ1bmN0aW9uICh0eXBlKSB7XG5cdFx0XHRwcm90b1snd3JpdGUnICsgdHlwZV0gPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdEFycmF5LnByb3RvdHlwZS51bnNoaWZ0LmNhbGwoYXJndW1lbnRzLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzWydzZXQnICsgdHlwZV0uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRcdH07XG5cdFx0fSkobWV0aG9kLnNsaWNlKDMpKTtcblx0fVxufVxuXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzID09PSAnb2JqZWN0Jykge1xuXHRtb2R1bGUuZXhwb3J0cyA9IGpEYXRhVmlldztcbn0gZWxzZVxuaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuXHRkZWZpbmUoW10sIGZ1bmN0aW9uICgpIHsgcmV0dXJuIGpEYXRhVmlldyB9KTtcbn0gZWxzZSB7XG5cdHZhciBvbGRHbG9iYWwgPSBnbG9iYWwuakRhdGFWaWV3O1xuXHQoZ2xvYmFsLmpEYXRhVmlldyA9IGpEYXRhVmlldykubm9Db25mbGljdCA9IGZ1bmN0aW9uICgpIHtcblx0XHRnbG9iYWwuakRhdGFWaWV3ID0gb2xkR2xvYmFsO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xufVxuXG59KSgoZnVuY3Rpb24gKCkgeyAvKiBqc2hpbnQgc3RyaWN0OiBmYWxzZSAqLyByZXR1cm4gdGhpcyB9KSgpKTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcikiLG51bGwsInZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcblxuZXhwb3J0cy5CdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuU2xvd0J1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUyA9IDUwXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyXG5cbi8qKlxuICogSWYgYEJ1ZmZlci5fdXNlVHlwZWRBcnJheXNgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAoY29tcGF0aWJsZSBkb3duIHRvIElFNilcbiAqL1xuQnVmZmVyLl91c2VUeXBlZEFycmF5cyA9IChmdW5jdGlvbiAoKSB7XG4gICAvLyBEZXRlY3QgaWYgYnJvd3NlciBzdXBwb3J0cyBUeXBlZCBBcnJheXMuIFN1cHBvcnRlZCBicm93c2VycyBhcmUgSUUgMTArLFxuICAgLy8gRmlyZWZveCA0KywgQ2hyb21lIDcrLCBTYWZhcmkgNS4xKywgT3BlcmEgMTEuNissIGlPUyA0LjIrLlxuICAgaWYgKHR5cGVvZiBVaW50OEFycmF5ID09PSAndW5kZWZpbmVkJyB8fCB0eXBlb2YgQXJyYXlCdWZmZXIgPT09ICd1bmRlZmluZWQnKVxuICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgLy8gRG9lcyB0aGUgYnJvd3NlciBzdXBwb3J0IGFkZGluZyBwcm9wZXJ0aWVzIHRvIGBVaW50OEFycmF5YCBpbnN0YW5jZXM/IElmXG4gIC8vIG5vdCwgdGhlbiB0aGF0J3MgdGhlIHNhbWUgYXMgbm8gYFVpbnQ4QXJyYXlgIHN1cHBvcnQuIFdlIG5lZWQgdG8gYmUgYWJsZSB0b1xuICAvLyBhZGQgYWxsIHRoZSBub2RlIEJ1ZmZlciBBUEkgbWV0aG9kcy5cbiAgLy8gUmVsZXZhbnQgRmlyZWZveCBidWc6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOFxuICB0cnkge1xuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheSgwKVxuICAgIGFyci5mb28gPSBmdW5jdGlvbiAoKSB7IHJldHVybiA0MiB9XG4gICAgcmV0dXJuIDQyID09PSBhcnIuZm9vKCkgJiZcbiAgICAgICAgdHlwZW9mIGFyci5zdWJhcnJheSA9PT0gJ2Z1bmN0aW9uJyAvLyBDaHJvbWUgOS0xMCBsYWNrIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gV29ya2Fyb3VuZDogbm9kZSdzIGJhc2U2NCBpbXBsZW1lbnRhdGlvbiBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgc3RyaW5nc1xuICAvLyB3aGlsZSBiYXNlNjQtanMgZG9lcyBub3QuXG4gIGlmIChlbmNvZGluZyA9PT0gJ2Jhc2U2NCcgJiYgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBzdWJqZWN0ID0gc3RyaW5ndHJpbShzdWJqZWN0KVxuICAgIHdoaWxlIChzdWJqZWN0Lmxlbmd0aCAlIDQgIT09IDApIHtcbiAgICAgIHN1YmplY3QgPSBzdWJqZWN0ICsgJz0nXG4gICAgfVxuICB9XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0KVxuICBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJylcbiAgICBsZW5ndGggPSBCdWZmZXIuYnl0ZUxlbmd0aChzdWJqZWN0LCBlbmNvZGluZylcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QubGVuZ3RoKSAvLyBBc3N1bWUgb2JqZWN0IGlzIGFuIGFycmF5XG4gIGVsc2VcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IG5lZWRzIHRvIGJlIGEgbnVtYmVyLCBhcnJheSBvciBzdHJpbmcuJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgLy8gUHJlZmVycmVkOiBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIGJ1ZiA9IGF1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIFRISVMgaW5zdGFuY2Ugb2YgQnVmZmVyIChjcmVhdGVkIGJ5IGBuZXdgKVxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gICAgYnVmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmIHR5cGVvZiBVaW50OEFycmF5ID09PSAnZnVuY3Rpb24nICYmXG4gICAgICBzdWJqZWN0IGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIFVpbnQ4QXJyYXlcbiAgICBidWYuX3NldChzdWJqZWN0KVxuICB9IGVsc2UgaWYgKGlzQXJyYXlpc2goc3ViamVjdCkpIHtcbiAgICAvLyBUcmVhdCBhcnJheS1pc2ggb2JqZWN0cyBhcyBhIGJ5dGUgYXJyYXlcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkpXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3QucmVhZFVJbnQ4KGkpXG4gICAgICBlbHNlXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3RbaV1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBidWYud3JpdGUoc3ViamVjdCwgMCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgIUJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgIW5vWmVybykge1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgYnVmW2ldID0gMFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBidWZcbn1cblxuLy8gU1RBVElDIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09XG5cbkJ1ZmZlci5pc0VuY29kaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nKSB7XG4gIHN3aXRjaCAoU3RyaW5nKGVuY29kaW5nKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICBjYXNlICdyYXcnOlxuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiAoYikge1xuICByZXR1cm4gISEoYiAhPT0gbnVsbCAmJiBiICE9PSB1bmRlZmluZWQgJiYgYi5faXNCdWZmZXIpXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldFxuICBzdHIgPSBzdHIgKyAnJ1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoIC8gMlxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdyYXcnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAqIDJcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIuY29uY2F0ID0gZnVuY3Rpb24gKGxpc3QsIHRvdGFsTGVuZ3RoKSB7XG4gIGFzc2VydChpc0FycmF5KGxpc3QpLCAnVXNhZ2U6IEJ1ZmZlci5jb25jYXQobGlzdCwgW3RvdGFsTGVuZ3RoXSlcXG4nICtcbiAgICAgICdsaXN0IHNob3VsZCBiZSBhbiBBcnJheS4nKVxuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKDApXG4gIH0gZWxzZSBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gbGlzdFswXVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB0b3RhbExlbmd0aCAhPT0gJ251bWJlcicpIHtcbiAgICB0b3RhbExlbmd0aCA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgdG90YWxMZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcih0b3RhbExlbmd0aClcbiAgdmFyIHBvcyA9IDBcbiAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgaXRlbSA9IGxpc3RbaV1cbiAgICBpdGVtLmNvcHkoYnVmLCBwb3MpXG4gICAgcG9zICs9IGl0ZW0ubGVuZ3RoXG4gIH1cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBCVUZGRVIgSU5TVEFOQ0UgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gX2hleFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gYnVmLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG5cbiAgLy8gbXVzdCBiZSBhbiBldmVuIG51bWJlciBvZiBkaWdpdHNcbiAgdmFyIHN0ckxlbiA9IHN0cmluZy5sZW5ndGhcbiAgYXNzZXJ0KHN0ckxlbiAlIDIgPT09IDAsICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBhc3NlcnQoIWlzTmFOKGJ5dGUpLCAnSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPSBpICogMlxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBfdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjhUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2FzY2lpV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2JpbmFyeVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIF9hc2NpaVdyaXRlKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGJhc2U2NFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24gKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKSB7XG4gIC8vIFN1cHBvcnQgYm90aCAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpXG4gIC8vIGFuZCB0aGUgbGVnYWN5IChzdHJpbmcsIGVuY29kaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgaWYgKGlzRmluaXRlKG9mZnNldCkpIHtcbiAgICBpZiAoIWlzRmluaXRlKGxlbmd0aCkpIHtcbiAgICAgIGVuY29kaW5nID0gbGVuZ3RoXG4gICAgICBsZW5ndGggPSB1bmRlZmluZWRcbiAgICB9XG4gIH0gZWxzZSB7ICAvLyBsZWdhY3lcbiAgICB2YXIgc3dhcCA9IGVuY29kaW5nXG4gICAgZW5jb2RpbmcgPSBvZmZzZXRcbiAgICBvZmZzZXQgPSBsZW5ndGhcbiAgICBsZW5ndGggPSBzd2FwXG4gIH1cblxuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSB0aGlzLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuXG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0dXJuIF9oZXhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICd1Y3MyJzogLy8gVE9ETzogTm8gc3VwcG9ydCBmb3IgdWNzMiBvciB1dGYxNmxlIGVuY29kaW5ncyB5ZXRcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIF91dGY4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXR1cm4gX2FzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0dXJuIF9iaW5hcnlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXR1cm4gX2Jhc2U2NFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgc2VsZiA9IHRoaXNcblxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcbiAgc3RhcnQgPSBOdW1iZXIoc3RhcnQpIHx8IDBcbiAgZW5kID0gKGVuZCAhPT0gdW5kZWZpbmVkKVxuICAgID8gTnVtYmVyKGVuZClcbiAgICA6IGVuZCA9IHNlbGYubGVuZ3RoXG5cbiAgLy8gRmFzdHBhdGggZW1wdHkgc3RyaW5nc1xuICBpZiAoZW5kID09PSBzdGFydClcbiAgICByZXR1cm4gJydcblxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldHVybiBfaGV4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAndWNzMic6IC8vIFRPRE86IE5vIHN1cHBvcnQgZm9yIHVjczIgb3IgdXRmMTZsZSBlbmNvZGluZ3MgeWV0XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiBfdXRmOFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0dXJuIF9hc2NpaVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldHVybiBfYmluYXJ5U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0dXJuIF9iYXNlNjRTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4ge1xuICAgIHR5cGU6ICdCdWZmZXInLFxuICAgIGRhdGE6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuX2FyciB8fCB0aGlzLCAwKVxuICB9XG59XG5cbi8vIGNvcHkodGFyZ2V0QnVmZmVyLCB0YXJnZXRTdGFydD0wLCBzb3VyY2VTdGFydD0wLCBzb3VyY2VFbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uICh0YXJnZXQsIHRhcmdldF9zdGFydCwgc3RhcnQsIGVuZCkge1xuICB2YXIgc291cmNlID0gdGhpc1xuXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICghdGFyZ2V0X3N0YXJ0KSB0YXJnZXRfc3RhcnQgPSAwXG5cbiAgLy8gQ29weSAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRhcmdldC5sZW5ndGggPT09IDAgfHwgc291cmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgLy8gRmF0YWwgZXJyb3IgY29uZGl0aW9uc1xuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBhc3NlcnQodGFyZ2V0X3N0YXJ0ID49IDAgJiYgdGFyZ2V0X3N0YXJ0IDwgdGFyZ2V0Lmxlbmd0aCxcbiAgICAgICd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCBzb3VyY2UubGVuZ3RoLCAnc291cmNlU3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gc291cmNlLmxlbmd0aCwgJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpXG4gICAgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgPCBlbmQgLSBzdGFydClcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0ICsgc3RhcnRcblxuICAvLyBjb3B5IVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGVuZCAtIHN0YXJ0OyBpKyspXG4gICAgdGFyZ2V0W2kgKyB0YXJnZXRfc3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gX3V0ZjhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXMgPSAnJ1xuICB2YXIgdG1wID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgaWYgKGJ1ZltpXSA8PSAweDdGKSB7XG4gICAgICByZXMgKz0gZGVjb2RlVXRmOENoYXIodG1wKSArIFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICAgICAgdG1wID0gJydcbiAgICB9IGVsc2Uge1xuICAgICAgdG1wICs9ICclJyArIGJ1ZltpXS50b1N0cmluZygxNilcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzICsgZGVjb2RlVXRmOENoYXIodG1wKVxufVxuXG5mdW5jdGlvbiBfYXNjaWlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXQgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspXG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHJldHVybiBfYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIF9oZXhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG5cbiAgaWYgKCFzdGFydCB8fCBzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCB8fCBlbmQgPCAwIHx8IGVuZCA+IGxlbikgZW5kID0gbGVuXG5cbiAgdmFyIG91dCA9ICcnXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgb3V0ICs9IHRvSGV4KGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbi8vIGh0dHA6Ly9ub2RlanMub3JnL2FwaS9idWZmZXIuaHRtbCNidWZmZXJfYnVmX3NsaWNlX3N0YXJ0X2VuZFxuQnVmZmVyLnByb3RvdHlwZS5zbGljZSA9IGZ1bmN0aW9uIChzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBzdGFydCA9IGNsYW1wKHN0YXJ0LCBsZW4sIDApXG4gIGVuZCA9IGNsYW1wKGVuZCwgbGVuLCBsZW4pXG5cbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICByZXR1cm4gYXVnbWVudCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBlbmQpKVxuICB9IGVsc2Uge1xuICAgIHZhciBzbGljZUxlbiA9IGVuZCAtIHN0YXJ0XG4gICAgdmFyIG5ld0J1ZiA9IG5ldyBCdWZmZXIoc2xpY2VMZW4sIHVuZGVmaW5lZCwgdHJ1ZSlcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNsaWNlTGVuOyBpKyspIHtcbiAgICAgIG5ld0J1ZltpXSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgICByZXR1cm4gbmV3QnVmXG4gIH1cbn1cblxuLy8gYGdldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLmdldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMucmVhZFVJbnQ4KG9mZnNldClcbn1cblxuLy8gYHNldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKHYsIG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLnNldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMud3JpdGVVSW50OCh2LCBvZmZzZXQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgdmFsID0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICB9IGVsc2Uge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV1cbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDJdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgICB2YWwgfD0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0ICsgM10gPDwgMjQgPj4+IDApXG4gIH0gZWxzZSB7XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMV0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMl0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAzXVxuICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0XSA8PCAyNCA+Pj4gMClcbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsXG4gICAgICAgICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICB2YXIgbmVnID0gdGhpc1tvZmZzZXRdICYgMHg4MFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZiAtIHRoaXNbb2Zmc2V0XSArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQxNihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MzIoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMDAwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZmZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRmxvYXQgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWREb3VibGUgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aCkgcmV0dXJuXG5cbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCAyKTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSAmICgweGZmIDw8ICg4ICogKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkpKSkgPj4+XG4gICAgICAgICAgICAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSAqIDhcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZmZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgNCk7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgPj4+IChsaXR0bGVFbmRpYW4gPyBpIDogMyAtIGkpICogOCkgJiAweGZmXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2YsIC0weDgwKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICB0aGlzLndyaXRlVUludDgodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICB0aGlzLndyaXRlVUludDgoMHhmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmLCAtMHg4MDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQxNihidWYsIDB4ZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQzMihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MzIoYnVmLCAweGZmZmZmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdExFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZURvdWJsZSAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCxcbiAgICAgICAgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAxLjc5NzY5MzEzNDg2MjMxNTdFKzMwOCwgLTEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG4vLyBmaWxsKHZhbHVlLCBzdGFydD0wLCBlbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuZmlsbCA9IGZ1bmN0aW9uICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgdmFsdWUgPSB2YWx1ZS5jaGFyQ29kZUF0KDApXG4gIH1cblxuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiAhaXNOYU4odmFsdWUpLCAndmFsdWUgaXMgbm90IGEgbnVtYmVyJylcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ2VuZCA8IHN0YXJ0JylcblxuICAvLyBGaWxsIDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGhpcy5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgdGhpcy5sZW5ndGgsICdzdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSB0aGlzLmxlbmd0aCwgJ2VuZCBvdXQgb2YgYm91bmRzJylcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHRoaXNbaV0gPSB2YWx1ZVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG91dCA9IFtdXG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgb3V0W2ldID0gdG9IZXgodGhpc1tpXSlcbiAgICBpZiAoaSA9PT0gZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUykge1xuICAgICAgb3V0W2kgKyAxXSA9ICcuLi4nXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIG91dC5qb2luKCcgJykgKyAnPidcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgPT09ICdmdW5jdGlvbicpIHtcbiAgICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgICAgcmV0dXJuIChuZXcgQnVmZmVyKHRoaXMpKS5idWZmZXJcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJ1ZiA9IG5ldyBVaW50OEFycmF5KHRoaXMubGVuZ3RoKVxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGJ1Zi5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMSlcbiAgICAgICAgYnVmW2ldID0gdGhpc1tpXVxuICAgICAgcmV0dXJuIGJ1Zi5idWZmZXJcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCdWZmZXIudG9BcnJheUJ1ZmZlciBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicpXG4gIH1cbn1cblxuLy8gSEVMUEVSIEZVTkNUSU9OU1xuLy8gPT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBzdHJpbmd0cmltIChzdHIpIHtcbiAgaWYgKHN0ci50cmltKSByZXR1cm4gc3RyLnRyaW0oKVxuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxufVxuXG52YXIgQlAgPSBCdWZmZXIucHJvdG90eXBlXG5cbi8qKlxuICogQXVnbWVudCB0aGUgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIGNsYXNzISkgd2l0aCBCdWZmZXIgbWV0aG9kc1xuICovXG5mdW5jdGlvbiBhdWdtZW50IChhcnIpIHtcbiAgYXJyLl9pc0J1ZmZlciA9IHRydWVcblxuICAvLyBzYXZlIHJlZmVyZW5jZSB0byBvcmlnaW5hbCBVaW50OEFycmF5IGdldC9zZXQgbWV0aG9kcyBiZWZvcmUgb3ZlcndyaXRpbmdcbiAgYXJyLl9nZXQgPSBhcnIuZ2V0XG4gIGFyci5fc2V0ID0gYXJyLnNldFxuXG4gIC8vIGRlcHJlY2F0ZWQsIHdpbGwgYmUgcmVtb3ZlZCBpbiBub2RlIDAuMTMrXG4gIGFyci5nZXQgPSBCUC5nZXRcbiAgYXJyLnNldCA9IEJQLnNldFxuXG4gIGFyci53cml0ZSA9IEJQLndyaXRlXG4gIGFyci50b1N0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0xvY2FsZVN0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0pTT04gPSBCUC50b0pTT05cbiAgYXJyLmNvcHkgPSBCUC5jb3B5XG4gIGFyci5zbGljZSA9IEJQLnNsaWNlXG4gIGFyci5yZWFkVUludDggPSBCUC5yZWFkVUludDhcbiAgYXJyLnJlYWRVSW50MTZMRSA9IEJQLnJlYWRVSW50MTZMRVxuICBhcnIucmVhZFVJbnQxNkJFID0gQlAucmVhZFVJbnQxNkJFXG4gIGFyci5yZWFkVUludDMyTEUgPSBCUC5yZWFkVUludDMyTEVcbiAgYXJyLnJlYWRVSW50MzJCRSA9IEJQLnJlYWRVSW50MzJCRVxuICBhcnIucmVhZEludDggPSBCUC5yZWFkSW50OFxuICBhcnIucmVhZEludDE2TEUgPSBCUC5yZWFkSW50MTZMRVxuICBhcnIucmVhZEludDE2QkUgPSBCUC5yZWFkSW50MTZCRVxuICBhcnIucmVhZEludDMyTEUgPSBCUC5yZWFkSW50MzJMRVxuICBhcnIucmVhZEludDMyQkUgPSBCUC5yZWFkSW50MzJCRVxuICBhcnIucmVhZEZsb2F0TEUgPSBCUC5yZWFkRmxvYXRMRVxuICBhcnIucmVhZEZsb2F0QkUgPSBCUC5yZWFkRmxvYXRCRVxuICBhcnIucmVhZERvdWJsZUxFID0gQlAucmVhZERvdWJsZUxFXG4gIGFyci5yZWFkRG91YmxlQkUgPSBCUC5yZWFkRG91YmxlQkVcbiAgYXJyLndyaXRlVUludDggPSBCUC53cml0ZVVJbnQ4XG4gIGFyci53cml0ZVVJbnQxNkxFID0gQlAud3JpdGVVSW50MTZMRVxuICBhcnIud3JpdGVVSW50MTZCRSA9IEJQLndyaXRlVUludDE2QkVcbiAgYXJyLndyaXRlVUludDMyTEUgPSBCUC53cml0ZVVJbnQzMkxFXG4gIGFyci53cml0ZVVJbnQzMkJFID0gQlAud3JpdGVVSW50MzJCRVxuICBhcnIud3JpdGVJbnQ4ID0gQlAud3JpdGVJbnQ4XG4gIGFyci53cml0ZUludDE2TEUgPSBCUC53cml0ZUludDE2TEVcbiAgYXJyLndyaXRlSW50MTZCRSA9IEJQLndyaXRlSW50MTZCRVxuICBhcnIud3JpdGVJbnQzMkxFID0gQlAud3JpdGVJbnQzMkxFXG4gIGFyci53cml0ZUludDMyQkUgPSBCUC53cml0ZUludDMyQkVcbiAgYXJyLndyaXRlRmxvYXRMRSA9IEJQLndyaXRlRmxvYXRMRVxuICBhcnIud3JpdGVGbG9hdEJFID0gQlAud3JpdGVGbG9hdEJFXG4gIGFyci53cml0ZURvdWJsZUxFID0gQlAud3JpdGVEb3VibGVMRVxuICBhcnIud3JpdGVEb3VibGVCRSA9IEJQLndyaXRlRG91YmxlQkVcbiAgYXJyLmZpbGwgPSBCUC5maWxsXG4gIGFyci5pbnNwZWN0ID0gQlAuaW5zcGVjdFxuICBhcnIudG9BcnJheUJ1ZmZlciA9IEJQLnRvQXJyYXlCdWZmZXJcblxuICByZXR1cm4gYXJyXG59XG5cbi8vIHNsaWNlKHN0YXJ0LCBlbmQpXG5mdW5jdGlvbiBjbGFtcCAoaW5kZXgsIGxlbiwgZGVmYXVsdFZhbHVlKSB7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09ICdudW1iZXInKSByZXR1cm4gZGVmYXVsdFZhbHVlXG4gIGluZGV4ID0gfn5pbmRleDsgIC8vIENvZXJjZSB0byBpbnRlZ2VyLlxuICBpZiAoaW5kZXggPj0gbGVuKSByZXR1cm4gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgaW5kZXggKz0gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gY29lcmNlIChsZW5ndGgpIHtcbiAgLy8gQ29lcmNlIGxlbmd0aCB0byBhIG51bWJlciAocG9zc2libHkgTmFOKSwgcm91bmQgdXBcbiAgLy8gaW4gY2FzZSBpdCdzIGZyYWN0aW9uYWwgKGUuZy4gMTIzLjQ1NikgdGhlbiBkbyBhXG4gIC8vIGRvdWJsZSBuZWdhdGUgdG8gY29lcmNlIGEgTmFOIHRvIDAuIEVhc3ksIHJpZ2h0P1xuICBsZW5ndGggPSB+fk1hdGguY2VpbCgrbGVuZ3RoKVxuICByZXR1cm4gbGVuZ3RoIDwgMCA/IDAgOiBsZW5ndGhcbn1cblxuZnVuY3Rpb24gaXNBcnJheSAoc3ViamVjdCkge1xuICByZXR1cm4gKEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHN1YmplY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHN1YmplY3QpID09PSAnW29iamVjdCBBcnJheV0nXG4gIH0pKHN1YmplY3QpXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlpc2ggKHN1YmplY3QpIHtcbiAgcmV0dXJuIGlzQXJyYXkoc3ViamVjdCkgfHwgQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpIHx8XG4gICAgICBzdWJqZWN0ICYmIHR5cGVvZiBzdWJqZWN0ID09PSAnb2JqZWN0JyAmJlxuICAgICAgdHlwZW9mIHN1YmplY3QubGVuZ3RoID09PSAnbnVtYmVyJ1xufVxuXG5mdW5jdGlvbiB0b0hleCAobikge1xuICBpZiAobiA8IDE2KSByZXR1cm4gJzAnICsgbi50b1N0cmluZygxNilcbiAgcmV0dXJuIG4udG9TdHJpbmcoMTYpXG59XG5cbmZ1bmN0aW9uIHV0ZjhUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGIgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGlmIChiIDw9IDB4N0YpXG4gICAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSlcbiAgICBlbHNlIHtcbiAgICAgIHZhciBzdGFydCA9IGlcbiAgICAgIGlmIChiID49IDB4RDgwMCAmJiBiIDw9IDB4REZGRikgaSsrXG4gICAgICB2YXIgaCA9IGVuY29kZVVSSUNvbXBvbmVudChzdHIuc2xpY2Uoc3RhcnQsIGkrMSkpLnN1YnN0cigxKS5zcGxpdCgnJScpXG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGgubGVuZ3RoOyBqKyspXG4gICAgICAgIGJ5dGVBcnJheS5wdXNoKHBhcnNlSW50KGhbal0sIDE2KSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBhc2NpaVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAvLyBOb2RlJ3MgY29kZSBzZWVtcyB0byBiZSBkb2luZyB0aGlzIGFuZCBub3QgJiAweDdGLi5cbiAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSAmIDB4RkYpXG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBiYXNlNjRUb0J5dGVzIChzdHIpIHtcbiAgcmV0dXJuIGJhc2U2NC50b0J5dGVBcnJheShzdHIpXG59XG5cbmZ1bmN0aW9uIGJsaXRCdWZmZXIgKHNyYywgZHN0LCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgcG9zXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKGkgKyBvZmZzZXQgPj0gZHN0Lmxlbmd0aCkgfHwgKGkgPj0gc3JjLmxlbmd0aCkpXG4gICAgICBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIGRlY29kZVV0ZjhDaGFyIChzdHIpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHN0cilcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoMHhGRkZEKSAvLyBVVEYgOCBpbnZhbGlkIGNoYXJcbiAgfVxufVxuXG4vKlxuICogV2UgaGF2ZSB0byBtYWtlIHN1cmUgdGhhdCB0aGUgdmFsdWUgaXMgYSB2YWxpZCBpbnRlZ2VyLiBUaGlzIG1lYW5zIHRoYXQgaXRcbiAqIGlzIG5vbi1uZWdhdGl2ZS4gSXQgaGFzIG5vIGZyYWN0aW9uYWwgY29tcG9uZW50IGFuZCB0aGF0IGl0IGRvZXMgbm90XG4gKiBleGNlZWQgdGhlIG1heGltdW0gYWxsb3dlZCB2YWx1ZS5cbiAqL1xuZnVuY3Rpb24gdmVyaWZ1aW50ICh2YWx1ZSwgbWF4KSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlID49IDAsXG4gICAgICAnc3BlY2lmaWVkIGEgbmVnYXRpdmUgdmFsdWUgZm9yIHdyaXRpbmcgYW4gdW5zaWduZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgaXMgbGFyZ2VyIHRoYW4gbWF4aW11bSB2YWx1ZSBmb3IgdHlwZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmc2ludCh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZklFRUU3NTQodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbn1cblxuZnVuY3Rpb24gYXNzZXJ0ICh0ZXN0LCBtZXNzYWdlKSB7XG4gIGlmICghdGVzdCkgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UgfHwgJ0ZhaWxlZCBhc3NlcnRpb24nKVxufVxuIiwidmFyIGxvb2t1cCA9ICdBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvJztcblxuOyhmdW5jdGlvbiAoZXhwb3J0cykge1xuXHQndXNlIHN0cmljdCc7XG5cbiAgdmFyIEFyciA9ICh0eXBlb2YgVWludDhBcnJheSAhPT0gJ3VuZGVmaW5lZCcpXG4gICAgPyBVaW50OEFycmF5XG4gICAgOiBBcnJheVxuXG5cdHZhciBaRVJPICAgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgUExVUyAgID0gJysnLmNoYXJDb2RlQXQoMClcblx0dmFyIFNMQVNIICA9ICcvJy5jaGFyQ29kZUF0KDApXG5cdHZhciBOVU1CRVIgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgTE9XRVIgID0gJ2EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFVQUEVSICA9ICdBJy5jaGFyQ29kZUF0KDApXG5cblx0ZnVuY3Rpb24gZGVjb2RlIChlbHQpIHtcblx0XHR2YXIgY29kZSA9IGVsdC5jaGFyQ29kZUF0KDApXG5cdFx0aWYgKGNvZGUgPT09IFBMVVMpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdG1vZHVsZS5leHBvcnRzLnRvQnl0ZUFycmF5ID0gYjY0VG9CeXRlQXJyYXlcblx0bW9kdWxlLmV4cG9ydHMuZnJvbUJ5dGVBcnJheSA9IHVpbnQ4VG9CYXNlNjRcbn0oKSlcbiIsImV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXTtcblxuICBpICs9IGQ7XG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIHMgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBlTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgZSA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IG1MZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhcztcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpO1xuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbik7XG4gICAgZSA9IGUgLSBlQmlhcztcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKTtcbn07XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDA7XG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSk7XG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDA7XG4gICAgZSA9IGVNYXg7XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLTtcbiAgICAgIGMgKj0gMjtcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKys7XG4gICAgICBjIC89IDI7XG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMDtcbiAgICAgIGUgPSBlTWF4O1xuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSBlICsgZUJpYXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSAwO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpO1xuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG07XG4gIGVMZW4gKz0gbUxlbjtcbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KTtcblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjg7XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPVxyXG5cclxuICBmaXJzdDogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgWW91ciBmaXJzdCBMb29wU2NyaXB0LiBDbGljayBcIkNvbXBpbGVcIiBiZWxvdyB0byBzdGFydCFcclxuXHJcbnRvbmUgbm90ZTFcclxuICBkdXJhdGlvbiAyNTBcclxuICBvY3RhdmUgNFxyXG4gIG5vdGUgQ1xyXG5cclxudG9uZSBiYXNzMVxyXG4gIGR1cmF0aW9uIDI1MFxyXG4gIG9jdGF2ZSAxXHJcbiAgbm90ZSBCXHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBub3RlMSB4Li4uLi4uLnguLi4uLi4uXHJcbiAgcGF0dGVybiBiYXNzMSAuLi4ueC4uLi4uLi54Li4uXHJcblxyXG5cIlwiXCJcclxuXHJcbiAgbm90ZXM6IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIE5vdGUgb3ZlcnJpZGVzIVxyXG5cclxuIyBILUwgYXJlIHRoZSBibGFjayBrZXlzOlxyXG4jICAgICBIIEkgICBKIEsgTFxyXG4jICAgIEMgRCBFIEYgRyBBIEJcclxuXHJcbiMgVHJ5IHNldHRpbmcgdGhlIGR1cmF0aW9uIHRvIDEwMFxyXG50b25lIG5vdGUxXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgZHVyYXRpb24gMjUwXHJcblxyXG4jIFNhbXBsZXMgY2FuIGhhdmUgdGhlaXIgbm90ZXMgb3ZlcnJpZGRlbiB0b28hXHJcbnNhbXBsZSBkaW5nXHJcbiAgc3JjIHNhbXBsZXMvZGluZ19lLndhdlxyXG4gIHNyY25vdGUgZVxyXG5cclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gbm90ZTEgYi5hLmcuYS5iLmIuYi4uLlxyXG5cclxubG9vcCBsb29wMlxyXG4gIHBhdHRlcm4gZGluZyBiLmEuZy5hLmIuYi5iLi4uXHJcblxyXG50cmFjayBzb25nXHJcbiAgcGF0dGVybiBsb29wMSB4XHJcbiAgcGF0dGVybiBsb29wMiAueFxyXG5cclxuXCJcIlwiXHJcblxyXG4gIG1vdHRvOiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBbiBhcHByb3hpbWF0aW9uIG9mIHRoZSBiZWF0IGZyb20gRHJha2UncyBcIlRoZSBNb3R0b1wiXHJcblxyXG5icG0gMTAwXHJcbnNlY3Rpb24gIyB0byBzaGFyZSBBRFNSXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgdG9uZSBiYXNzMVxyXG4gICAgb2N0YXZlIDFcclxuICB0b25lIGJhc3MyXHJcbiAgICBvY3RhdmUgMlxyXG5cclxuc2FtcGxlIGNsYXAgIC0+IHNyYyBzYW1wbGVzL2NsYXAud2F2XHJcbnNhbXBsZSBzbmFyZSAtPiBzcmMgc2FtcGxlcy9zbmFyZS53YXZcclxuc2FtcGxlIGhpaGF0IC0+IHNyYyBzYW1wbGVzL2hpaGF0LndhdlxyXG5cclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gaGloYXQgLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uLi54Li4uLi5cclxuICBwYXR0ZXJuIGNsYXAgIC4uLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uLi54Li4uXHJcbiAgcGF0dGVybiBzbmFyZSAuLi4uLi54Li4ueC4uLngueC4uLi4uLi4uLi4uLi4uLlxyXG4gIHBhdHRlcm4gYmFzczEgQmJiYmJiLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuICBwYXR0ZXJuIGJhc3MyIC4uLi4uLkhoaGhoaERkZGRkZC4uLi5IaGhoSmouSmouXHJcblxyXG50cmFjayBzb25nXHJcbiAgcGF0dGVybiBsb29wMSB4eHh4XHJcblxyXG5cIlwiXCJcclxuXHJcbiAgbGVuZ3RoOiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBTaG93aW5nIG9mZiB2YXJpb3VzIG5vdGUgbGVuZ3RocyB1c2luZyBjYXBzIGFuZCBsb3dlcmNhc2VcclxuIyBBbHNvIHNob3dzIHdoYXQgQURTUiBjYW4gZG8hXHJcblxyXG50b25lIG5vdGUxXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcblxyXG50b25lIG5vdGUyXHJcbiAgIyBOb3RlOiBPbmx5IHRoZSBmaXJzdCB0b25lIGhhcyBBRFNSXHJcblxyXG4jIElmIHlvdSB1c2UgYW55IGxldHRlcnMgb3RoZXIgdGhhbiBcInhcIiBvbiBhIHRvbmUgcGF0dGVybiwgeW91IG92ZXJyaWRlIGl0c1xyXG4jIG5vdGUgd2l0aCB0aGUgbm90ZSBsaXN0ZWQuIEFsc28sIGlmIHlvdSB1c2UgYW55IGNhcGl0YWwgbGV0dGVycyBpbiBhIHBhdHRlcm4sXHJcbiMgeW91IG92ZXJyaWRlIHRoZSBsZW5ndGggb2YgdGhhdCBub3RlIHdpdGggdGhlIG51bWJlciBvZiBtYXRjaGluZyBsb3dlcmNhc2VcclxuIyBsZXR0ZXJzIGZvbGxvd2luZyBpdC5cclxuXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIG5vdGUxIEdnZ2dnZ2dnRmZmZmZmLi5BYWFhQmJiLkNjLi5ELi4uXHJcblxyXG5sb29wIGxvb3AyXHJcbiAgcGF0dGVybiBub3RlMiBHZ2dnZ2dnZ0ZmZmZmZi4uQWFhYUJiYi5DYy4uRC4uLlxyXG5cclxudHJhY2sgc29uZ1xyXG4gIHBhdHRlcm4gbG9vcDEgeC5cclxuICBwYXR0ZXJuIGxvb3AyIC54XHJcblxyXG5cIlwiXCJcclxuXHJcbiAgY2hvY29ibzogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgVGhlIENob2NvYm8gVGhlbWUgKGZpcnN0IHBhcnQgb25seSlcclxuXHJcbmJwbSAxMjVcclxuXHJcbnNlY3Rpb24gVG9uZSAoaW4gYSBzZWN0aW9uIHRvIHNoYXJlIEFEU1IpXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgdG9uZSBjaG9jb2JvMVxyXG4gICAgb2N0YXZlIDVcclxuICB0b25lIGNob2NvYm8yXHJcbiAgICBvY3RhdmUgNFxyXG5cclxubG9vcCBsb29wMVxyXG4gcGF0dGVybiBjaG9jb2JvMSBEZGRkLi4uLi4uRGQuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5ELkUuRmZmZmZmLi4uXHJcbiBwYXR0ZXJuIGNob2NvYm8yIC4uLi5CYkdnRWUuLkJiR2dCYi4uR2cuLkJiYmJiYi5BYUdnR0FHLkYuR2dnZ2dnLkYuR2dHQi4uLi4uLi4uLi4uLi5cclxuXHJcbnRyYWNrIHNvbmdcclxuICBwYXR0ZXJuIGxvb3AxIHh4XHJcblwiXCJcIiIsImZyZXFUYWJsZSA9IFtcclxuICB7ICMgT2N0YXZlIDBcclxuXHJcbiAgICBcImFcIjogMjcuNTAwMFxyXG4gICAgXCJsXCI6IDI5LjEzNTNcclxuICAgIFwiYlwiOiAzMC44Njc3XHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDFcclxuICAgIFwiY1wiOiAzMi43MDMyXHJcbiAgICBcImhcIjogMzQuNjQ3OVxyXG4gICAgXCJkXCI6IDM2LjcwODFcclxuICAgIFwiaVwiOiAzOC44OTA5XHJcbiAgICBcImVcIjogNDEuMjAzNVxyXG4gICAgXCJmXCI6IDQzLjY1MzZcclxuICAgIFwialwiOiA0Ni4yNDkzXHJcbiAgICBcImdcIjogNDguOTk5NVxyXG4gICAgXCJrXCI6IDUxLjkxMzBcclxuICAgIFwiYVwiOiA1NS4wMDAwXHJcbiAgICBcImxcIjogNTguMjcwNVxyXG4gICAgXCJiXCI6IDYxLjczNTRcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgMlxyXG4gICAgXCJjXCI6IDY1LjQwNjRcclxuICAgIFwiaFwiOiA2OS4yOTU3XHJcbiAgICBcImRcIjogNzMuNDE2MlxyXG4gICAgXCJpXCI6IDc3Ljc4MTdcclxuICAgIFwiZVwiOiA4Mi40MDY5XHJcbiAgICBcImZcIjogODcuMzA3MVxyXG4gICAgXCJqXCI6IDkyLjQ5ODZcclxuICAgIFwiZ1wiOiA5Ny45OTg5XHJcbiAgICBcImtcIjogMTAzLjgyNlxyXG4gICAgXCJhXCI6IDExMC4wMDBcclxuICAgIFwibFwiOiAxMTYuNTQxXHJcbiAgICBcImJcIjogMTIzLjQ3MVxyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSAzXHJcbiAgICBcImNcIjogMTMwLjgxM1xyXG4gICAgXCJoXCI6IDEzOC41OTFcclxuICAgIFwiZFwiOiAxNDYuODMyXHJcbiAgICBcImlcIjogMTU1LjU2M1xyXG4gICAgXCJlXCI6IDE2NC44MTRcclxuICAgIFwiZlwiOiAxNzQuNjE0XHJcbiAgICBcImpcIjogMTg0Ljk5N1xyXG4gICAgXCJnXCI6IDE5NS45OThcclxuICAgIFwia1wiOiAyMDcuNjUyXHJcbiAgICBcImFcIjogMjIwLjAwMFxyXG4gICAgXCJsXCI6IDIzMy4wODJcclxuICAgIFwiYlwiOiAyNDYuOTQyXHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDRcclxuICAgIFwiY1wiOiAyNjEuNjI2XHJcbiAgICBcImhcIjogMjc3LjE4M1xyXG4gICAgXCJkXCI6IDI5My42NjVcclxuICAgIFwiaVwiOiAzMTEuMTI3XHJcbiAgICBcImVcIjogMzI5LjYyOFxyXG4gICAgXCJmXCI6IDM0OS4yMjhcclxuICAgIFwialwiOiAzNjkuOTk0XHJcbiAgICBcImdcIjogMzkxLjk5NVxyXG4gICAgXCJrXCI6IDQxNS4zMDVcclxuICAgIFwiYVwiOiA0NDAuMDAwXHJcbiAgICBcImxcIjogNDY2LjE2NFxyXG4gICAgXCJiXCI6IDQ5My44ODNcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgNVxyXG4gICAgXCJjXCI6IDUyMy4yNTFcclxuICAgIFwiaFwiOiA1NTQuMzY1XHJcbiAgICBcImRcIjogNTg3LjMzMFxyXG4gICAgXCJpXCI6IDYyMi4yNTRcclxuICAgIFwiZVwiOiA2NTkuMjU1XHJcbiAgICBcImZcIjogNjk4LjQ1NlxyXG4gICAgXCJqXCI6IDczOS45ODlcclxuICAgIFwiZ1wiOiA3ODMuOTkxXHJcbiAgICBcImtcIjogODMwLjYwOVxyXG4gICAgXCJhXCI6IDg4MC4wMDBcclxuICAgIFwibFwiOiA5MzIuMzI4XHJcbiAgICBcImJcIjogOTg3Ljc2N1xyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSA2XHJcbiAgICBcImNcIjogMTA0Ni41MFxyXG4gICAgXCJoXCI6IDExMDguNzNcclxuICAgIFwiZFwiOiAxMTc0LjY2XHJcbiAgICBcImlcIjogMTI0NC41MVxyXG4gICAgXCJlXCI6IDEzMTguNTFcclxuICAgIFwiZlwiOiAxMzk2LjkxXHJcbiAgICBcImpcIjogMTQ3OS45OFxyXG4gICAgXCJnXCI6IDE1NjcuOThcclxuICAgIFwia1wiOiAxNjYxLjIyXHJcbiAgICBcImFcIjogMTc2MC4wMFxyXG4gICAgXCJsXCI6IDE4NjQuNjZcclxuICAgIFwiYlwiOiAxOTc1LjUzXHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDdcclxuICAgIFwiY1wiOiAyMDkzLjAwXHJcbiAgICBcImhcIjogMjIxNy40NlxyXG4gICAgXCJkXCI6IDIzNDkuMzJcclxuICAgIFwiaVwiOiAyNDg5LjAyXHJcbiAgICBcImVcIjogMjYzNy4wMlxyXG4gICAgXCJmXCI6IDI3OTMuODNcclxuICAgIFwialwiOiAyOTU5Ljk2XHJcbiAgICBcImdcIjogMzEzNS45NlxyXG4gICAgXCJrXCI6IDMzMjIuNDRcclxuICAgIFwiYVwiOiAzNTIwLjAwXHJcbiAgICBcImxcIjogMzcyOS4zMVxyXG4gICAgXCJiXCI6IDM5NTEuMDdcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgOFxyXG4gICAgXCJjXCI6IDQxODYuMDFcclxuICB9XHJcbl1cclxuXHJcbmxlZ2FsTm90ZVJlZ2V4ID0gL1thLWxdL1xyXG5cclxuZmluZEZyZXEgPSAob2N0YXZlLCBub3RlKSAtPlxyXG4gIG5vdGUgPSBub3RlLnRvTG93ZXJDYXNlKClcclxuICBpZiAob2N0YXZlID49IDApIGFuZCAob2N0YXZlIDwgZnJlcVRhYmxlLmxlbmd0aCkgYW5kIGxlZ2FsTm90ZVJlZ2V4LnRlc3Qobm90ZSlcclxuICAgIG9jdGF2ZVRhYmxlID0gZnJlcVRhYmxlW29jdGF2ZV1cclxuICAgIGlmIG9jdGF2ZVRhYmxlPyBhbmQgb2N0YXZlVGFibGVbbm90ZV0/XHJcbiAgICAgIHJldHVybiBvY3RhdmVUYWJsZVtub3RlXVxyXG4gIHJldHVybiA0NDAuMFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPVxyXG4gIGZyZXFUYWJsZTogZnJlcVRhYmxlXHJcbiAgZmluZEZyZXE6IGZpbmRGcmVxXHJcbiIsIiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEltcG9ydHNcclxuXHJcbntmaW5kRnJlcX0gPSByZXF1aXJlICcuL2ZyZXEnXHJcbnJpZmZ3YXZlICAgPSByZXF1aXJlIFwiLi9yaWZmd2F2ZVwiXHJcbmpEYXRhVmlldyAgPSByZXF1aXJlICcuLi9qcy9qZGF0YXZpZXcnXHJcbmZzICAgICAgICAgPSByZXF1aXJlICdmcydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEhlbHBlciBmdW5jdGlvbnNcclxuXHJcbmNsb25lID0gKG9iaikgLT5cclxuICBpZiBub3Qgb2JqPyBvciB0eXBlb2Ygb2JqIGlzbnQgJ29iamVjdCdcclxuICAgIHJldHVybiBvYmpcclxuXHJcbiAgaWYgb2JqIGluc3RhbmNlb2YgRGF0ZVxyXG4gICAgcmV0dXJuIG5ldyBEYXRlKG9iai5nZXRUaW1lKCkpXHJcblxyXG4gIGlmIG9iaiBpbnN0YW5jZW9mIFJlZ0V4cFxyXG4gICAgZmxhZ3MgPSAnJ1xyXG4gICAgZmxhZ3MgKz0gJ2cnIGlmIG9iai5nbG9iYWw/XHJcbiAgICBmbGFncyArPSAnaScgaWYgb2JqLmlnbm9yZUNhc2U/XHJcbiAgICBmbGFncyArPSAnbScgaWYgb2JqLm11bHRpbGluZT9cclxuICAgIGZsYWdzICs9ICd5JyBpZiBvYmouc3RpY2t5P1xyXG4gICAgcmV0dXJuIG5ldyBSZWdFeHAob2JqLnNvdXJjZSwgZmxhZ3MpXHJcblxyXG4gIG5ld0luc3RhbmNlID0gbmV3IG9iai5jb25zdHJ1Y3RvcigpXHJcblxyXG4gIGZvciBrZXkgb2Ygb2JqXHJcbiAgICBuZXdJbnN0YW5jZVtrZXldID0gY2xvbmUgb2JqW2tleV1cclxuXHJcbiAgcmV0dXJuIG5ld0luc3RhbmNlXHJcblxyXG5wYXJzZUJvb2wgPSAodikgLT5cclxuICBzd2l0Y2ggU3RyaW5nKHYpXHJcbiAgICB3aGVuIFwidHJ1ZVwiIHRoZW4gdHJ1ZVxyXG4gICAgd2hlbiBcInllc1wiIHRoZW4gdHJ1ZVxyXG4gICAgd2hlbiBcIm9uXCIgdGhlbiB0cnVlXHJcbiAgICB3aGVuIFwiMVwiIHRoZW4gdHJ1ZVxyXG4gICAgZWxzZSBmYWxzZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgSW5kZW50U3RhY2sgLSB1c2VkIGJ5IFBhcnNlclxyXG5cclxuY2xhc3MgSW5kZW50U3RhY2tcclxuICBjb25zdHJ1Y3RvcjogLT5cclxuICAgIEBzdGFjayA9IFswXVxyXG5cclxuICBwdXNoOiAoaW5kZW50KSAtPlxyXG4gICAgQHN0YWNrLnB1c2ggaW5kZW50XHJcblxyXG4gIHBvcDogLT5cclxuICAgIGlmIEBzdGFjay5sZW5ndGggPiAxXHJcbiAgICAgIEBzdGFjay5wb3AoKVxyXG4gICAgICByZXR1cm4gdHJ1ZVxyXG4gICAgcmV0dXJuIGZhbHNlXHJcblxyXG4gIHRvcDogLT5cclxuICAgIHJldHVybiBAc3RhY2tbQHN0YWNrLmxlbmd0aCAtIDFdXHJcblxyXG4gIHJlcGxhY2VUb3A6ICh2KSAtPlxyXG4gICAgQHN0YWNrW0BzdGFjay5sZW5ndGggLSAxXSA9IHZcclxuXHJcbmNvdW50SW5kZW50ID0gKHRleHQpIC0+XHJcbiAgaW5kZW50ID0gMFxyXG4gIGZvciBpIGluIFswLi4udGV4dC5sZW5ndGhdXHJcbiAgICBpZiB0ZXh0W2ldID09ICdcXHQnXHJcbiAgICAgIGluZGVudCArPSA4XHJcbiAgICBlbHNlXHJcbiAgICAgIGluZGVudCsrXHJcbiAgcmV0dXJuIGluZGVudFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgUGFyc2VyXHJcblxyXG5jbGFzcyBQYXJzZXJcclxuICBjb25zdHJ1Y3RvcjogKEBsb2cpIC0+XHJcbiAgICBAY29tbWVudFJlZ2V4ID0gL14oW14jXSo/KShcXHMqIy4qKT8kL1xyXG4gICAgQG9ubHlXaGl0ZXNwYWNlUmVnZXggPSAvXlxccyokL1xyXG4gICAgQGluZGVudFJlZ2V4ID0gL14oXFxzKikoXFxTLiopJC9cclxuICAgIEBsZWFkaW5nVW5kZXJzY29yZVJlZ2V4ID0gL15fL1xyXG4gICAgQGhhc0NhcGl0YWxMZXR0ZXJzUmVnZXggPSAvW0EtWl0vXHJcbiAgICBAaXNOb3RlUmVnZXggPSAvW0EtTGEtbF0vXHJcblxyXG4gICAgIyBILUwgYXJlIHRoZSBibGFjayBrZXlzOlxyXG4gICAgIyAgSCBJICAgSiBLIExcclxuICAgICMgQyBEIEUgRiBHIEEgQlxyXG5cclxuICAgIEBuYW1lZFN0YXRlcyA9XHJcbiAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgc3Jjb2N0YXZlOiA0XHJcbiAgICAgICAgc3Jjbm90ZTogJ2EnXHJcbiAgICAgICAgb2N0YXZlOiA0XHJcbiAgICAgICAgbm90ZTogJ2EnXHJcbiAgICAgICAgd2F2ZTogJ3NpbmUnXHJcbiAgICAgICAgYnBtOiAxMjBcclxuICAgICAgICBkdXJhdGlvbjogMjAwXHJcbiAgICAgICAgYmVhdHM6IDRcclxuICAgICAgICB2b2x1bWU6IDEuMFxyXG4gICAgICAgIGNsaXA6IHRydWVcclxuICAgICAgICByZXZlcmI6XHJcbiAgICAgICAgICBkZWxheTogMFxyXG4gICAgICAgICAgZGVjYXk6IDBcclxuICAgICAgICBhZHNyOiAjIG5vLW9wIEFEU1IgKGZ1bGwgMS4wIHN1c3RhaW4pXHJcbiAgICAgICAgICBhOiAwXHJcbiAgICAgICAgICBkOiAwXHJcbiAgICAgICAgICBzOiAxXHJcbiAgICAgICAgICByOiAxXHJcblxyXG4gICAgIyBpZiBhIGtleSBpcyBwcmVzZW50IGluIHRoaXMgbWFwLCB0aGF0IG5hbWUgaXMgY29uc2lkZXJlZCBhbiBcIm9iamVjdFwiXHJcbiAgICBAb2JqZWN0S2V5cyA9XHJcbiAgICAgIHRvbmU6XHJcbiAgICAgICAgd2F2ZTogJ3N0cmluZydcclxuICAgICAgICBmcmVxOiAnZmxvYXQnXHJcbiAgICAgICAgZHVyYXRpb246ICdmbG9hdCdcclxuICAgICAgICBhZHNyOiAnYWRzcidcclxuICAgICAgICBvY3RhdmU6ICdpbnQnXHJcbiAgICAgICAgbm90ZTogJ3N0cmluZydcclxuICAgICAgICB2b2x1bWU6ICdmbG9hdCdcclxuICAgICAgICBjbGlwOiAnYm9vbCdcclxuICAgICAgICByZXZlcmI6ICdyZXZlcmInXHJcblxyXG4gICAgICBzYW1wbGU6XHJcbiAgICAgICAgc3JjOiAnc3RyaW5nJ1xyXG4gICAgICAgIHZvbHVtZTogJ2Zsb2F0J1xyXG4gICAgICAgIGNsaXA6ICdib29sJ1xyXG4gICAgICAgIHJldmVyYjogJ3JldmVyYidcclxuICAgICAgICBzcmNvY3RhdmU6ICdpbnQnXHJcbiAgICAgICAgc3Jjbm90ZTogJ3N0cmluZydcclxuICAgICAgICBvY3RhdmU6ICdpbnQnXHJcbiAgICAgICAgbm90ZTogJ3N0cmluZydcclxuXHJcbiAgICAgIGxvb3A6XHJcbiAgICAgICAgYnBtOiAnaW50J1xyXG4gICAgICAgIGJlYXRzOiAnaW50J1xyXG5cclxuICAgICAgdHJhY2s6IHt9XHJcblxyXG4gICAgQGluZGVudFN0YWNrID0gbmV3IEluZGVudFN0YWNrXHJcbiAgICBAc3RhdGVTdGFjayA9IFtdXHJcbiAgICBAcmVzZXQgJ2RlZmF1bHQnXHJcbiAgICBAb2JqZWN0cyA9IHt9XHJcbiAgICBAb2JqZWN0ID0gbnVsbFxyXG4gICAgQG9iamVjdFNjb3BlUmVhZHkgPSBmYWxzZVxyXG5cclxuICBpc09iamVjdFR5cGU6ICh0eXBlKSAtPlxyXG4gICAgcmV0dXJuIEBvYmplY3RLZXlzW3R5cGVdP1xyXG5cclxuICBlcnJvcjogKHRleHQpIC0+XHJcbiAgICBAbG9nLmVycm9yIFwiUEFSU0UgRVJST1IsIGxpbmUgI3tAbGluZU5vfTogI3t0ZXh0fVwiXHJcblxyXG4gIHJlc2V0OiAobmFtZSkgLT5cclxuICAgIG5hbWUgPz0gJ2RlZmF1bHQnXHJcbiAgICBpZiBub3QgQG5hbWVkU3RhdGVzW25hbWVdXHJcbiAgICAgIEBlcnJvciBcImludmFsaWQgcmVzZXQgbmFtZTogI3tuYW1lfVwiXHJcbiAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgQHN0YXRlU3RhY2sucHVzaCBjbG9uZShAbmFtZWRTdGF0ZXNbbmFtZV0pXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuICBmbGF0dGVuOiAoKSAtPlxyXG4gICAgZmxhdHRlbmVkU3RhdGUgPSB7fVxyXG4gICAgZm9yIHN0YXRlIGluIEBzdGF0ZVN0YWNrXHJcbiAgICAgIGZvciBrZXkgb2Ygc3RhdGVcclxuICAgICAgICBmbGF0dGVuZWRTdGF0ZVtrZXldID0gc3RhdGVba2V5XVxyXG4gICAgcmV0dXJuIGZsYXR0ZW5lZFN0YXRlXHJcblxyXG4gIHRyYWNlOiAocHJlZml4KSAtPlxyXG4gICAgcHJlZml4ID89ICcnXHJcbiAgICBAbG9nLnZlcmJvc2UgXCJ0cmFjZTogI3twcmVmaXh9IFwiICsgSlNPTi5zdHJpbmdpZnkoQGZsYXR0ZW4oKSlcclxuXHJcbiAgY3JlYXRlT2JqZWN0OiAoZGF0YS4uLikgLT5cclxuICAgICAgQGZpbmlzaE9iamVjdCgpXHJcblxyXG4gICAgICBAb2JqZWN0ID0ge31cclxuICAgICAgZm9yIGkgaW4gWzAuLi5kYXRhLmxlbmd0aF0gYnkgMlxyXG4gICAgICAgIEBvYmplY3RbZGF0YVtpXV0gPSBkYXRhW2krMV1cclxuICAgICAgQG9iamVjdFNjb3BlUmVhZHkgPSB0cnVlXHJcblxyXG4gICAgICBpZiBAb2JqZWN0Ll90eXBlID09ICdsb29wJ1xyXG4gICAgICAgIEBvYmplY3QuX3BhdHRlcm5zID0gW11cclxuXHJcbiAgICAgIGlmIEBvYmplY3QuX3R5cGUgPT0gJ3RyYWNrJ1xyXG4gICAgICAgIEBvYmplY3QuX3BhdHRlcm5zID0gW11cclxuXHJcbiAgICAgIGlmIEBvYmplY3QuX25hbWVcclxuICAgICAgICBAbGFzdE9iamVjdCA9IEBvYmplY3QuX25hbWVcclxuXHJcbiAgZmluaXNoT2JqZWN0OiAtPlxyXG4gICAgaWYgQG9iamVjdFxyXG4gICAgICBzdGF0ZSA9IEBmbGF0dGVuKClcclxuICAgICAgZm9yIGtleSBvZiBAb2JqZWN0S2V5c1tAb2JqZWN0Ll90eXBlXVxyXG4gICAgICAgIGV4cGVjdGVkVHlwZSA9IEBvYmplY3RLZXlzW0BvYmplY3QuX3R5cGVdW2tleV1cclxuICAgICAgICBpZiBzdGF0ZVtrZXldP1xyXG4gICAgICAgICAgdiA9IHN0YXRlW2tleV1cclxuICAgICAgICAgIEBvYmplY3Rba2V5XSA9IHN3aXRjaCBleHBlY3RlZFR5cGVcclxuICAgICAgICAgICAgd2hlbiAnaW50JyB0aGVuIHBhcnNlSW50KHYpXHJcbiAgICAgICAgICAgIHdoZW4gJ2Zsb2F0JyB0aGVuIHBhcnNlRmxvYXQodilcclxuICAgICAgICAgICAgd2hlbiAnYm9vbCcgdGhlbiBwYXJzZUJvb2wodilcclxuICAgICAgICAgICAgZWxzZSB2XHJcbiAgICAgICAgICAjIEBsb2cudmVyYm9zZSBcInNldHRpbmcgI3tAb2JqZWN0Ll9uYW1lfSdzICN7a2V5fSB0byBcIiArIEpTT04uc3RyaW5naWZ5KEBvYmplY3Rba2V5XSlcclxuXHJcbiAgICAgIEBvYmplY3RzW0BvYmplY3QuX25hbWVdID0gQG9iamVjdFxyXG4gICAgQG9iamVjdCA9IG51bGxcclxuXHJcbiAgY3JlYXRpbmdPYmplY3RUeXBlOiAodHlwZSkgLT5cclxuICAgIHJldHVybiBmYWxzZSBpZiBub3QgQG9iamVjdFxyXG4gICAgcmV0dXJuIGZhbHNlIGlmIG5vdCBAb2JqZWN0Ll90eXBlID09IHR5cGVcclxuICAgIHJldHVybiB0cnVlXHJcblxyXG4gIHB1c2hTY29wZTogLT5cclxuICAgICMgY29uc29sZS5sb2cgXCJQVVNIXCJcclxuICAgIGlmIG5vdCBAb2JqZWN0U2NvcGVSZWFkeVxyXG4gICAgICBAZXJyb3IgXCJ1bmV4cGVjdGVkIGluZGVudFwiXHJcbiAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgQG9iamVjdFNjb3BlUmVhZHkgPSBmYWxzZVxyXG4gICAgQHN0YXRlU3RhY2sucHVzaCB7IF9zY29wZTogdHJ1ZSB9XHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuICBwb3BTY29wZTogLT5cclxuICAgICMgY29uc29sZS5sb2cgXCJQT1BcIlxyXG4gICAgQGZpbmlzaE9iamVjdCgpXHJcbiAgICBsb29wXHJcbiAgICAgIGlmIEBzdGF0ZVN0YWNrLmxlbmd0aCA9PSAwXHJcbiAgICAgICAgQGVycm9yIFwic3RhdGUgc3RhY2sgaXMgZW1wdHkhIHNvbWV0aGluZyBiYWQgaGFzIGhhcHBlbmVkXCJcclxuICAgICAgdG9wID0gQHN0YXRlU3RhY2tbQHN0YXRlU3RhY2subGVuZ3RoIC0gMV1cclxuICAgICAgYnJlYWsgaWYgdG9wLl9zY29wZT9cclxuICAgICAgQHN0YXRlU3RhY2sucG9wKClcclxuICAgIEBzdGF0ZVN0YWNrLnBvcCgpXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuICBwYXJzZVBhdHRlcm46IChwYXR0ZXJuKSAtPlxyXG4gICAgb3ZlcnJpZGVMZW5ndGggPSBAaGFzQ2FwaXRhbExldHRlcnNSZWdleC50ZXN0KHBhdHRlcm4pXHJcbiAgICBpID0gMFxyXG4gICAgc291bmRzID0gW11cclxuICAgIHdoaWxlIGkgPCBwYXR0ZXJuLmxlbmd0aFxyXG4gICAgICBjID0gcGF0dGVybltpXVxyXG4gICAgICBpZiBjICE9ICcuJ1xyXG4gICAgICAgIHN5bWJvbCA9IGMudG9Mb3dlckNhc2UoKVxyXG4gICAgICAgIHNvdW5kID0geyBvZmZzZXQ6IGkgfVxyXG4gICAgICAgIGlmIEBpc05vdGVSZWdleC50ZXN0KGMpXHJcbiAgICAgICAgICBzb3VuZC5ub3RlID0gc3ltYm9sXHJcbiAgICAgICAgaWYgb3ZlcnJpZGVMZW5ndGhcclxuICAgICAgICAgIGxlbmd0aCA9IDFcclxuICAgICAgICAgIGxvb3BcclxuICAgICAgICAgICAgbmV4dCA9IHBhdHRlcm5baSsxXVxyXG4gICAgICAgICAgICBpZiBuZXh0ID09IHN5bWJvbFxyXG4gICAgICAgICAgICAgIGxlbmd0aCsrXHJcbiAgICAgICAgICAgICAgaSsrXHJcbiAgICAgICAgICAgICAgaWYgaSA9PSBwYXR0ZXJuLmxlbmd0aFxyXG4gICAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgICAgZWxzZVxyXG4gICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICBzb3VuZC5sZW5ndGggPSBsZW5ndGhcclxuICAgICAgICBzb3VuZHMucHVzaCBzb3VuZFxyXG4gICAgICBpKytcclxuICAgIHJldHVybiB7XHJcbiAgICAgIHBhdHRlcm46IHBhdHRlcm5cclxuICAgICAgbGVuZ3RoOiBwYXR0ZXJuLmxlbmd0aFxyXG4gICAgICBzb3VuZHM6IHNvdW5kc1xyXG4gICAgfVxyXG5cclxuICBwcm9jZXNzVG9rZW5zOiAodG9rZW5zKSAtPlxyXG4gICAgY21kID0gdG9rZW5zWzBdLnRvTG93ZXJDYXNlKClcclxuICAgIGlmIGNtZCA9PSAncmVzZXQnXHJcbiAgICAgIGlmIG5vdCBAcmVzZXQodG9rZW5zWzFdKVxyXG4gICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgZWxzZSBpZiBjbWQgPT0gJ3NlY3Rpb24nXHJcbiAgICAgIEBvYmplY3RTY29wZVJlYWR5ID0gdHJ1ZVxyXG4gICAgZWxzZSBpZiBAaXNPYmplY3RUeXBlKGNtZClcclxuICAgICAgQGNyZWF0ZU9iamVjdCAnX3R5cGUnLCBjbWQsICdfbmFtZScsIHRva2Vuc1sxXVxyXG4gICAgZWxzZSBpZiBjbWQgPT0gJ3BhdHRlcm4nXHJcbiAgICAgIGlmIG5vdCAoQGNyZWF0aW5nT2JqZWN0VHlwZSgnbG9vcCcpIG9yIEBjcmVhdGluZ09iamVjdFR5cGUoJ3RyYWNrJykpXHJcbiAgICAgICAgQGVycm9yIFwidW5leHBlY3RlZCBwYXR0ZXJuIGNvbW1hbmRcIlxyXG4gICAgICAgIHJldHVybiBmYWxzZVxyXG5cclxuICAgICAgcGF0dGVybiA9IEBwYXJzZVBhdHRlcm4odG9rZW5zWzJdKVxyXG4gICAgICBwYXR0ZXJuLnNyYyA9IHRva2Vuc1sxXVxyXG4gICAgICBAb2JqZWN0Ll9wYXR0ZXJucy5wdXNoIHBhdHRlcm5cclxuICAgIGVsc2UgaWYgY21kID09ICdhZHNyJ1xyXG4gICAgICBAc3RhdGVTdGFja1tAc3RhdGVTdGFjay5sZW5ndGggLSAxXVtjbWRdID1cclxuICAgICAgICBhOiBwYXJzZUZsb2F0KHRva2Vuc1sxXSlcclxuICAgICAgICBkOiBwYXJzZUZsb2F0KHRva2Vuc1syXSlcclxuICAgICAgICBzOiBwYXJzZUZsb2F0KHRva2Vuc1szXSlcclxuICAgICAgICByOiBwYXJzZUZsb2F0KHRva2Vuc1s0XSlcclxuICAgIGVsc2UgaWYgY21kID09ICdyZXZlcmInXHJcbiAgICAgIEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdW2NtZF0gPVxyXG4gICAgICAgIGRlbGF5OiBwYXJzZUludCh0b2tlbnNbMV0pXHJcbiAgICAgICAgZGVjYXk6IHBhcnNlRmxvYXQodG9rZW5zWzJdKVxyXG4gICAgZWxzZVxyXG4gICAgICAjIFRoZSBib3JpbmcgcmVndWxhciBjYXNlOiBzdGFzaCBvZmYgdGhpcyB2YWx1ZVxyXG4gICAgICBpZiBAbGVhZGluZ1VuZGVyc2NvcmVSZWdleC50ZXN0KGNtZClcclxuICAgICAgICBAZXJyb3IgXCJjYW5ub3Qgc2V0IGludGVybmFsIG5hbWVzICh1bmRlcnNjb3JlIHByZWZpeClcIlxyXG4gICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICBAc3RhdGVTdGFja1tAc3RhdGVTdGFjay5sZW5ndGggLSAxXVtjbWRdID0gdG9rZW5zWzFdXHJcblxyXG4gICAgcmV0dXJuIHRydWVcclxuXHJcbiAgcGFyc2U6ICh0ZXh0KSAtPlxyXG4gICAgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKVxyXG4gICAgQGxpbmVObyA9IDBcclxuICAgIGZvciBsaW5lIGluIGxpbmVzXHJcbiAgICAgIEBsaW5lTm8rK1xyXG4gICAgICBsaW5lID0gbGluZS5yZXBsYWNlKC8oXFxyXFxufFxcbnxcXHIpL2dtLFwiXCIpICMgc3RyaXAgbmV3bGluZXNcclxuICAgICAgbGluZSA9IEBjb21tZW50UmVnZXguZXhlYyhsaW5lKVsxXSAgICAgICAjIHN0cmlwIGNvbW1lbnRzIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlXHJcbiAgICAgIGNvbnRpbnVlIGlmIEBvbmx5V2hpdGVzcGFjZVJlZ2V4LnRlc3QobGluZSlcclxuICAgICAgW18sIGluZGVudFRleHQsIGxpbmVdID0gQGluZGVudFJlZ2V4LmV4ZWMgbGluZVxyXG4gICAgICBpbmRlbnQgPSBjb3VudEluZGVudCBpbmRlbnRUZXh0XHJcbiAgICAgIGxpbmVPYmpzID0gW11cclxuXHJcbiAgICAgIGFycm93U2VjdGlvbnMgPSBsaW5lLnNwbGl0KC9cXHMqLT5cXHMqLylcclxuICAgICAgZm9yIGFycm93U2VjdGlvbiBpbiBhcnJvd1NlY3Rpb25zXHJcbiAgICAgICAgc2VtaVNlY3Rpb25zID0gYXJyb3dTZWN0aW9uLnNwbGl0KC9cXHMqO1xccyovKVxyXG4gICAgICAgIGZvciBzZW1pU2VjdGlvbiBpbiBzZW1pU2VjdGlvbnNcclxuICAgICAgICAgIGxpbmVPYmpzLnB1c2gge1xyXG4gICAgICAgICAgICAgIGluZGVudDogaW5kZW50XHJcbiAgICAgICAgICAgICAgbGluZTogc2VtaVNlY3Rpb25cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIGluZGVudCArPSAxMDAwXHJcblxyXG4gICAgICBmb3Igb2JqIGluIGxpbmVPYmpzXHJcbiAgICAgICAgIyBjb25zb2xlLmxvZyBKU09OLnN0cmluZ2lmeShvYmopXHJcbiAgICAgICAgdG9wSW5kZW50ID0gQGluZGVudFN0YWNrLnRvcCgpXHJcbiAgICAgICAgaWYgb2JqLmluZGVudCA9PSB0b3BJbmRlbnRcclxuICAgICAgICAgICMgZG8gbm90aGluZ1xyXG4gICAgICAgIGVsc2UgaWYgb2JqLmluZGVudCA+IHRvcEluZGVudFxyXG4gICAgICAgICAgQGluZGVudFN0YWNrLnB1c2ggb2JqLmluZGVudFxyXG4gICAgICAgICAgaWYgbm90IEBwdXNoU2NvcGUoKVxyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICBlbHNlIGlmIChvYmouaW5kZW50IDwgMTAwMCkgYW5kICh0b3BJbmRlbnQgPj0gMTAwMClcclxuICAgICAgICAgICMgd2UncmUgcmVjZWl2aW5nIGEgcHJvcGVyIGluZGVudCBmb3Igb3VyIHN0YWNrJ3MgdG9wLiByZXBsYWNlIGl0IVxyXG4gICAgICAgICAgQGluZGVudFN0YWNrLnJlcGxhY2VUb3Aob2JqLmluZGVudClcclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICBsb29wXHJcbiAgICAgICAgICAgIGlmIG5vdCBAaW5kZW50U3RhY2sucG9wKClcclxuICAgICAgICAgICAgICBAbG9nLmVycm9yIFwiVW5leHBlY3RlZCBpbmRlbnQgI3tvYmouaW5kZW50fSBvbiBsaW5lICN7QGxpbmVOb306ICN7b2JqLmxpbmV9XCJcclxuICAgICAgICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgICAgICAgaWYgbm90IEBwb3BTY29wZSgpXHJcbiAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgICAgIGNvbnRpbnVlIGlmIEBpbmRlbnRTdGFjay50b3AoKSA+PSAxMDAwXHJcbiAgICAgICAgICAgIGJyZWFrIGlmIEBpbmRlbnRTdGFjay50b3AoKSA9PSBvYmouaW5kZW50XHJcblxyXG4gICAgICAgIGlmIG5vdCBAcHJvY2Vzc1Rva2VucyhvYmoubGluZS5zcGxpdCgvXFxzKy8pKVxyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlXHJcblxyXG4gICAgd2hpbGUgQGluZGVudFN0YWNrLnBvcCgpXHJcbiAgICAgIEBwb3BTY29wZSgpXHJcblxyXG4gICAgQGZpbmlzaE9iamVjdCgpXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgUmVuZGVyZXJcclxuXHJcbiMgSW4gYWxsIGNhc2VzIHdoZXJlIGEgcmVuZGVyZWQgc291bmQgaXMgZ2VuZXJhdGVkLCB0aGVyZSBhcmUgYWN0dWFsbHkgdHdvIGxlbmd0aHNcclxuIyBhc3NvY2lhdGVkIHdpdGggdGhlIHNvdW5kLiBcInNvdW5kLmxlbmd0aFwiIGlzIHRoZSBcImV4cGVjdGVkXCIgbGVuZ3RoLCB3aXRoIHJlZ2FyZHNcclxuIyB0byB0aGUgdHlwZWQtaW4gZHVyYXRpb24gZm9yIGl0IG9yIGZvciBkZXRlcm1pbmluZyBsb29wIG9mZmV0cy4gVGhlIG90aGVyIGxlbmd0aFxyXG4jIGlzIHRoZSBzb3VuZC5zYW1wbGVzLmxlbmd0aCAoYWxzbyBrbm93biBhcyB0aGUgXCJvdmVyZmxvdyBsZW5ndGhcIiksIHdoaWNoIGlzIHRoZVxyXG4jIGxlbmd0aCB0aGF0IGFjY291bnRzIGZvciB0aGluZ3MgbGlrZSByZXZlcmIgb3IgYW55dGhpbmcgZWxzZSB0aGF0IHdvdWxkIGNhdXNlIHRoZVxyXG4jIHNvdW5kIHRvIHNwaWxsIGludG8gdGhlIG5leHQgbG9vcC90cmFjay4gVGhpcyBhbGxvd3MgZm9yIHNlYW1sZXNzIGxvb3BzIHRoYXQgY2FuXHJcbiMgcGxheSBhIGxvbmcgc291bmQgYXMgdGhlIGVuZCBvZiBhIHBhdHRlcm4sIGFuZCBpdCdsbCBjbGVhbmx5IG1peCBpbnRvIHRoZSBiZWdpbm5pbmdcclxuIyBvZiB0aGUgbmV4dCBwYXR0ZXJuLlxyXG5cclxuY2xhc3MgUmVuZGVyZXJcclxuICBjb25zdHJ1Y3RvcjogKEBsb2csIEBzYW1wbGVSYXRlLCBAcmVhZExvY2FsRmlsZXMsIEBvYmplY3RzKSAtPlxyXG4gICAgQHNvdW5kQ2FjaGUgPSB7fVxyXG5cclxuICBlcnJvcjogKHRleHQpIC0+XHJcbiAgICBAbG9nLmVycm9yIFwiUkVOREVSIEVSUk9SOiAje3RleHR9XCJcclxuXHJcbiAgZ2VuZXJhdGVFbnZlbG9wZTogKGFkc3IsIGxlbmd0aCkgLT5cclxuICAgIGVudmVsb3BlID0gQXJyYXkobGVuZ3RoKVxyXG4gICAgQXRvRCA9IE1hdGguZmxvb3IoYWRzci5hICogbGVuZ3RoKVxyXG4gICAgRHRvUyA9IE1hdGguZmxvb3IoYWRzci5kICogbGVuZ3RoKVxyXG4gICAgU3RvUiA9IE1hdGguZmxvb3IoYWRzci5yICogbGVuZ3RoKVxyXG4gICAgYXR0YWNrTGVuID0gQXRvRFxyXG4gICAgZGVjYXlMZW4gPSBEdG9TIC0gQXRvRFxyXG4gICAgc3VzdGFpbkxlbiA9IFN0b1IgLSBEdG9TXHJcbiAgICByZWxlYXNlTGVuID0gbGVuZ3RoIC0gU3RvUlxyXG4gICAgc3VzdGFpbiA9IGFkc3Iuc1xyXG4gICAgcGVha1N1c3RhaW5EZWx0YSA9IDEuMCAtIHN1c3RhaW5cclxuICAgIGZvciBpIGluIFswLi4uYXR0YWNrTGVuXVxyXG4gICAgICAjIEF0dGFja1xyXG4gICAgICBlbnZlbG9wZVtpXSA9IGkgLyBhdHRhY2tMZW5cclxuICAgIGZvciBpIGluIFswLi4uZGVjYXlMZW5dXHJcbiAgICAgICMgRGVjYXlcclxuICAgICAgZW52ZWxvcGVbQXRvRCArIGldID0gMS4wIC0gKHBlYWtTdXN0YWluRGVsdGEgKiAoaSAvIGRlY2F5TGVuKSlcclxuICAgIGZvciBpIGluIFswLi4uc3VzdGFpbkxlbl1cclxuICAgICAgIyBTdXN0YWluXHJcbiAgICAgIGVudmVsb3BlW0R0b1MgKyBpXSA9IHN1c3RhaW5cclxuICAgIGZvciBpIGluIFswLi4ucmVsZWFzZUxlbl1cclxuICAgICAgIyBSZWxlYXNlXHJcbiAgICAgIGVudmVsb3BlW1N0b1IgKyBpXSA9IHN1c3RhaW4gLSAoc3VzdGFpbiAqIChpIC8gcmVsZWFzZUxlbikpXHJcbiAgICByZXR1cm4gZW52ZWxvcGVcclxuXHJcbiAgcmVuZGVyVG9uZTogKHRvbmVPYmosIG92ZXJyaWRlcykgLT5cclxuICAgIG9mZnNldCA9IDBcclxuICAgIGFtcGxpdHVkZSA9IDEwMDAwXHJcbiAgICBpZiBvdmVycmlkZXMubGVuZ3RoID4gMFxyXG4gICAgICBsZW5ndGggPSBvdmVycmlkZXMubGVuZ3RoXHJcbiAgICBlbHNlXHJcbiAgICAgIGxlbmd0aCA9IE1hdGguZmxvb3IodG9uZU9iai5kdXJhdGlvbiAqIEBzYW1wbGVSYXRlIC8gMTAwMClcclxuICAgIHNhbXBsZXMgPSBBcnJheShsZW5ndGgpXHJcbiAgICBBID0gMjAwXHJcbiAgICBCID0gMC41XHJcbiAgICBpZiBvdmVycmlkZXMubm90ZT9cclxuICAgICAgZnJlcSA9IGZpbmRGcmVxKHRvbmVPYmoub2N0YXZlLCBvdmVycmlkZXMubm90ZSlcclxuICAgIGVsc2UgaWYgdG9uZU9iai5mcmVxP1xyXG4gICAgICBmcmVxID0gdG9uZU9iai5mcmVxXHJcbiAgICBlbHNlXHJcbiAgICAgIGZyZXEgPSBmaW5kRnJlcSh0b25lT2JqLm9jdGF2ZSwgdG9uZU9iai5ub3RlKVxyXG4gICAgZW52ZWxvcGUgPSBAZ2VuZXJhdGVFbnZlbG9wZSh0b25lT2JqLmFkc3IsIGxlbmd0aClcclxuICAgIGZvciBpIGluIFswLi4ubGVuZ3RoXVxyXG4gICAgICBwZXJpb2QgPSBAc2FtcGxlUmF0ZSAvIGZyZXFcclxuICAgICAgc2luZSA9IE1hdGguc2luKG9mZnNldCArIGkgLyBwZXJpb2QgKiAyICogTWF0aC5QSSlcclxuICAgICAgIyBpZih0b25lT2JqLndhdiA9PSBcInNxdWFyZVwiKVxyXG4gICAgICAjICAgc2luZSA9IChzaW5lID4gMCkgPyAxIDogLTFcclxuICAgICAgc2FtcGxlc1tpXSA9IHNpbmUgKiBhbXBsaXR1ZGUgKiBlbnZlbG9wZVtpXVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHNhbXBsZXM6IHNhbXBsZXNcclxuICAgICAgbGVuZ3RoOiBzYW1wbGVzLmxlbmd0aFxyXG4gICAgfVxyXG5cclxuICByZW5kZXJTYW1wbGU6IChzYW1wbGVPYmosIG92ZXJyaWRlcykgLT5cclxuICAgIHZpZXcgPSBudWxsXHJcblxyXG4gICAgaWYgQHJlYWRMb2NhbEZpbGVzXHJcbiAgICAgIGRhdGEgPSBmcy5yZWFkRmlsZVN5bmMgc2FtcGxlT2JqLnNyY1xyXG4gICAgICB2aWV3ID0gbmV3IGpEYXRhVmlldyhkYXRhLCAwLCBkYXRhLmxlbmd0aCwgdHJ1ZSlcclxuICAgIGVsc2VcclxuICAgICAgJC5hamF4IHtcclxuICAgICAgICB1cmw6IHNhbXBsZU9iai5zcmNcclxuICAgICAgICBtaW1lVHlwZTogJ3RleHQvcGxhaW47IGNoYXJzZXQ9eC11c2VyLWRlZmluZWQnXHJcbiAgICAgICAgc3VjY2VzczogKGRhdGEpIC0+XHJcbiAgICAgICAgICB2aWV3ID0gbmV3IGpEYXRhVmlldyhkYXRhLCAwLCBkYXRhLmxlbmd0aCwgdHJ1ZSlcclxuICAgICAgICBhc3luYzogZmFsc2VcclxuICAgICAgfVxyXG5cclxuICAgIGlmIG5vdCB2aWV3XHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc2FtcGxlczogW11cclxuICAgICAgICBsZW5ndGg6IDBcclxuICAgICAgfVxyXG5cclxuICAgICMgc2tpcCB0aGUgZmlyc3QgNDAgYnl0ZXNcclxuICAgIHZpZXcuc2Vlayg0MClcclxuICAgIHN1YmNodW5rMlNpemUgPSB2aWV3LmdldEludDMyKClcclxuICAgIHNhbXBsZXMgPSBbXVxyXG4gICAgd2hpbGUgdmlldy50ZWxsKCkrMSA8IHZpZXcuYnl0ZUxlbmd0aFxyXG4gICAgICBzYW1wbGVzLnB1c2ggdmlldy5nZXRJbnQxNigpXHJcblxyXG4gICAgb3ZlcnJpZGVOb3RlID0gaWYgb3ZlcnJpZGVzLm5vdGUgdGhlbiBvdmVycmlkZXMubm90ZSBlbHNlIHNhbXBsZU9iai5ub3RlXHJcbiAgICBpZiAob3ZlcnJpZGVOb3RlICE9IHNhbXBsZU9iai5zcmNub3RlKSBvciAoc2FtcGxlT2JqLm9jdGF2ZSAhPSBzYW1wbGVPYmouc3Jjb2N0YXZlKVxyXG4gICAgICBvbGRmcmVxID0gZmluZEZyZXEoc2FtcGxlT2JqLnNyY29jdGF2ZSwgc2FtcGxlT2JqLnNyY25vdGUpXHJcbiAgICAgIG5ld2ZyZXEgPSBmaW5kRnJlcShzYW1wbGVPYmoub2N0YXZlLCBvdmVycmlkZU5vdGUpXHJcblxyXG4gICAgICBmYWN0b3IgPSBvbGRmcmVxIC8gbmV3ZnJlcVxyXG4gICAgICAjIEBsb2cudmVyYm9zZSBcIm9sZDogI3tvbGRmcmVxfSwgbmV3OiAje25ld2ZyZXF9LCBmYWN0b3I6ICN7ZmFjdG9yfVwiXHJcblxyXG4gICAgICAjIFRPRE86IFByb3Blcmx5IHJlc2FtcGxlIGhlcmUgd2l0aCBzb21ldGhpbmcgb3RoZXIgdGhhbiBcIm5lYXJlc3QgbmVpZ2hib3JcIlxyXG4gICAgICByZWxlbmd0aCA9IE1hdGguZmxvb3Ioc2FtcGxlcy5sZW5ndGggKiBmYWN0b3IpXHJcbiAgICAgIHJlc2FtcGxlcyA9IEFycmF5KHJlbGVuZ3RoKVxyXG4gICAgICBmb3IgaSBpbiBbMC4uLnJlbGVuZ3RoXVxyXG4gICAgICAgIHJlc2FtcGxlc1tpXSA9IDBcclxuICAgICAgZm9yIGkgaW4gWzAuLi5yZWxlbmd0aF1cclxuICAgICAgICByZXNhbXBsZXNbaV0gPSBzYW1wbGVzW01hdGguZmxvb3IoaSAvIGZhY3RvcildXHJcblxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHNhbXBsZXM6IHJlc2FtcGxlc1xyXG4gICAgICAgIGxlbmd0aDogcmVzYW1wbGVzLmxlbmd0aFxyXG4gICAgICB9XHJcbiAgICBlbHNlXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc2FtcGxlczogc2FtcGxlc1xyXG4gICAgICAgIGxlbmd0aDogc2FtcGxlcy5sZW5ndGhcclxuICAgICAgfVxyXG5cclxuICByZW5kZXJMb29wOiAobG9vcE9iaikgLT5cclxuICAgIGJlYXRDb3VudCA9IDBcclxuICAgIGZvciBwYXR0ZXJuIGluIGxvb3BPYmouX3BhdHRlcm5zXHJcbiAgICAgIGlmIGJlYXRDb3VudCA8IHBhdHRlcm4ubGVuZ3RoXHJcbiAgICAgICAgYmVhdENvdW50ID0gcGF0dGVybi5sZW5ndGhcclxuXHJcbiAgICBzYW1wbGVzUGVyQmVhdCA9IEBzYW1wbGVSYXRlIC8gKGxvb3BPYmouYnBtIC8gNjApIC8gbG9vcE9iai5iZWF0c1xyXG4gICAgdG90YWxMZW5ndGggPSBzYW1wbGVzUGVyQmVhdCAqIGJlYXRDb3VudFxyXG4gICAgb3ZlcmZsb3dMZW5ndGggPSB0b3RhbExlbmd0aFxyXG5cclxuICAgIGZvciBwYXR0ZXJuIGluIGxvb3BPYmouX3BhdHRlcm5zXHJcbiAgICAgIHNlY3Rpb25Db3VudCA9IHBhdHRlcm4ubGVuZ3RoIC8gMTZcclxuICAgICAgb2Zmc2V0TGVuZ3RoID0gTWF0aC5mbG9vcih0b3RhbExlbmd0aCAvIDE2IC8gc2VjdGlvbkNvdW50KVxyXG4gICAgICBmb3Igc291bmQgaW4gcGF0dGVybi5zb3VuZHNcclxuICAgICAgICBvdmVycmlkZXMgPSB7fVxyXG4gICAgICAgIGlmIHNvdW5kLmxlbmd0aCA+IDBcclxuICAgICAgICAgIG92ZXJyaWRlcy5sZW5ndGggPSBzb3VuZC5sZW5ndGggKiBvZmZzZXRMZW5ndGhcclxuICAgICAgICBpZiBzb3VuZC5ub3RlP1xyXG4gICAgICAgICAgb3ZlcnJpZGVzLm5vdGUgPSBzb3VuZC5ub3RlXHJcbiAgICAgICAgc291bmQuX3JlbmRlciA9IEByZW5kZXIocGF0dGVybi5zcmMsIG92ZXJyaWRlcylcclxuICAgICAgICBlbmQgPSAoc291bmQub2Zmc2V0ICogb2Zmc2V0TGVuZ3RoKSArIHNvdW5kLl9yZW5kZXIuc2FtcGxlcy5sZW5ndGhcclxuICAgICAgICBpZiBvdmVyZmxvd0xlbmd0aCA8IGVuZFxyXG4gICAgICAgICAgb3ZlcmZsb3dMZW5ndGggPSBlbmRcclxuXHJcbiAgICBzYW1wbGVzID0gQXJyYXkob3ZlcmZsb3dMZW5ndGgpXHJcbiAgICBmb3IgaSBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxyXG4gICAgICBzYW1wbGVzW2ldID0gMFxyXG5cclxuICAgIGZvciBwYXR0ZXJuIGluIGxvb3BPYmouX3BhdHRlcm5zXHJcbiAgICAgIHNlY3Rpb25Db3VudCA9IHBhdHRlcm4ubGVuZ3RoIC8gMTZcclxuICAgICAgb2Zmc2V0TGVuZ3RoID0gTWF0aC5mbG9vcih0b3RhbExlbmd0aCAvIDE2IC8gc2VjdGlvbkNvdW50KVxyXG5cclxuICAgICAgcGF0dGVyblNhbXBsZXMgPSBBcnJheShvdmVyZmxvd0xlbmd0aClcclxuICAgICAgZm9yIGkgaW4gWzAuLi5vdmVyZmxvd0xlbmd0aF1cclxuICAgICAgICBwYXR0ZXJuU2FtcGxlc1tpXSA9IDBcclxuXHJcbiAgICAgIGZvciBzb3VuZCBpbiBwYXR0ZXJuLnNvdW5kc1xyXG4gICAgICAgIHNyY1NvdW5kID0gc291bmQuX3JlbmRlclxyXG5cclxuICAgICAgICBvYmogPSBAZ2V0T2JqZWN0KHBhdHRlcm4uc3JjKVxyXG4gICAgICAgIG9mZnNldCA9IHNvdW5kLm9mZnNldCAqIG9mZnNldExlbmd0aFxyXG4gICAgICAgIGNvcHlMZW4gPSBzcmNTb3VuZC5zYW1wbGVzLmxlbmd0aFxyXG4gICAgICAgIGlmIChvZmZzZXQgKyBjb3B5TGVuKSA+IG92ZXJmbG93TGVuZ3RoXHJcbiAgICAgICAgICBjb3B5TGVuID0gb3ZlcmZsb3dMZW5ndGggLSBvZmZzZXRcclxuXHJcbiAgICAgICAgaWYgb2JqLmNsaXBcclxuICAgICAgICAgIGZhZGVDbGlwID0gMjAwICMgZmFkZSBvdXQgb3ZlciB0aGlzIG1hbnkgc2FtcGxlcyBwcmlvciB0byBhIGNsaXAgdG8gYXZvaWQgYSBwb3BcclxuICAgICAgICAgIGlmIG9mZnNldCA+IGZhZGVDbGlwXHJcbiAgICAgICAgICAgIGZvciBqIGluIFswLi4uZmFkZUNsaXBdXHJcbiAgICAgICAgICAgICAgdiA9IHBhdHRlcm5TYW1wbGVzW29mZnNldCAtIGZhZGVDbGlwICsgal1cclxuICAgICAgICAgICAgICBwYXR0ZXJuU2FtcGxlc1tvZmZzZXQgLSBmYWRlQ2xpcCArIGpdID0gTWF0aC5mbG9vcih2ICogKChmYWRlQ2xpcCAtIGopIC8gZmFkZUNsaXApKVxyXG4gICAgICAgICAgZm9yIGogaW4gW29mZnNldC4uLm92ZXJmbG93TGVuZ3RoXVxyXG4gICAgICAgICAgICAjIGNsZWFuIG91dCB0aGUgcmVzdCBvZiB0aGUgc291bmQgdG8gZW5zdXJlIHRoYXQgdGhlIHByZXZpb3VzIG9uZSAod2hpY2ggY291bGQgYmUgbG9uZ2VyKSB3YXMgZnVsbHkgY2xpcHBlZFxyXG4gICAgICAgICAgICBwYXR0ZXJuU2FtcGxlc1tqXSA9IDBcclxuICAgICAgICAgIGZvciBqIGluIFswLi4uY29weUxlbl1cclxuICAgICAgICAgICAgcGF0dGVyblNhbXBsZXNbb2Zmc2V0ICsgal0gPSBzcmNTb3VuZC5zYW1wbGVzW2pdXHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgZm9yIGogaW4gWzAuLi5jb3B5TGVuXVxyXG4gICAgICAgICAgICBwYXR0ZXJuU2FtcGxlc1tvZmZzZXQgKyBqXSArPSBzcmNTb3VuZC5zYW1wbGVzW2pdXHJcblxyXG4gICAgICAjIE5vdyBjb3B5IHRoZSBjbGlwcGVkIHBhdHRlcm4gaW50byB0aGUgZmluYWwgbG9vcFxyXG4gICAgICBmb3IgaiBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxyXG4gICAgICAgIHNhbXBsZXNbal0gKz0gcGF0dGVyblNhbXBsZXNbal1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzYW1wbGVzOiBzYW1wbGVzXHJcbiAgICAgIGxlbmd0aDogdG90YWxMZW5ndGhcclxuICAgIH1cclxuXHJcbiAgcmVuZGVyVHJhY2s6ICh0cmFja09iaikgLT5cclxuICAgIHBpZWNlQ291bnQgPSAwXHJcbiAgICBmb3IgcGF0dGVybiBpbiB0cmFja09iai5fcGF0dGVybnNcclxuICAgICAgaWYgcGllY2VDb3VudCA8IHBhdHRlcm4ucGF0dGVybi5sZW5ndGhcclxuICAgICAgICBwaWVjZUNvdW50ID0gcGF0dGVybi5wYXR0ZXJuLmxlbmd0aFxyXG5cclxuICAgIHRvdGFsTGVuZ3RoID0gMFxyXG4gICAgb3ZlcmZsb3dMZW5ndGggPSAwXHJcbiAgICBwaWVjZVRvdGFsTGVuZ3RoID0gQXJyYXkocGllY2VDb3VudClcclxuICAgIHBpZWNlT3ZlcmZsb3dMZW5ndGggPSBBcnJheShwaWVjZUNvdW50KVxyXG4gICAgZm9yIHBpZWNlSW5kZXggaW4gWzAuLi5waWVjZUNvdW50XVxyXG4gICAgICBwaWVjZVRvdGFsTGVuZ3RoW3BpZWNlSW5kZXhdID0gMFxyXG4gICAgICBwaWVjZU92ZXJmbG93TGVuZ3RoW3BpZWNlSW5kZXhdID0gMFxyXG4gICAgICBmb3IgcGF0dGVybiBpbiB0cmFja09iai5fcGF0dGVybnNcclxuICAgICAgICBpZiAocGllY2VJbmRleCA8IHBhdHRlcm4ucGF0dGVybi5sZW5ndGgpIGFuZCAocGF0dGVybi5wYXR0ZXJuW3BpZWNlSW5kZXhdICE9ICcuJylcclxuICAgICAgICAgIHNyY1NvdW5kID0gQHJlbmRlcihwYXR0ZXJuLnNyYylcclxuICAgICAgICAgIGlmIHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF0gPCBzcmNTb3VuZC5sZW5ndGhcclxuICAgICAgICAgICAgcGllY2VUb3RhbExlbmd0aFtwaWVjZUluZGV4XSA9IHNyY1NvdW5kLmxlbmd0aFxyXG4gICAgICAgICAgaWYgcGllY2VPdmVyZmxvd0xlbmd0aFtwaWVjZUluZGV4XSA8IHNyY1NvdW5kLnNhbXBsZXMubGVuZ3RoXHJcbiAgICAgICAgICAgIHBpZWNlT3ZlcmZsb3dMZW5ndGhbcGllY2VJbmRleF0gPSBzcmNTb3VuZC5zYW1wbGVzLmxlbmd0aFxyXG4gICAgICBwb3NzaWJsZU1heExlbmd0aCA9IHRvdGFsTGVuZ3RoICsgcGllY2VPdmVyZmxvd0xlbmd0aFtwaWVjZUluZGV4XVxyXG4gICAgICBpZiBvdmVyZmxvd0xlbmd0aCA8IHBvc3NpYmxlTWF4TGVuZ3RoXHJcbiAgICAgICAgb3ZlcmZsb3dMZW5ndGggPSBwb3NzaWJsZU1heExlbmd0aFxyXG4gICAgICB0b3RhbExlbmd0aCArPSBwaWVjZVRvdGFsTGVuZ3RoW3BpZWNlSW5kZXhdXHJcblxyXG4gICAgc2FtcGxlcyA9IEFycmF5KG92ZXJmbG93TGVuZ3RoKVxyXG4gICAgZm9yIGkgaW4gWzAuLi5vdmVyZmxvd0xlbmd0aF1cclxuICAgICAgc2FtcGxlc1tpXSA9IDBcclxuXHJcbiAgICBmb3IgcGF0dGVybiBpbiB0cmFja09iai5fcGF0dGVybnNcclxuICAgICAgdHJhY2tPZmZzZXQgPSAwXHJcbiAgICAgIHNyY1NvdW5kID0gQHJlbmRlcihwYXR0ZXJuLnNyYywge30pXHJcbiAgICAgIGZvciBwaWVjZUluZGV4IGluIFswLi4ucGllY2VDb3VudF1cclxuICAgICAgICBpZiAocGllY2VJbmRleCA8IHBhdHRlcm4ucGF0dGVybi5sZW5ndGgpIGFuZCAocGF0dGVybi5wYXR0ZXJuW3BpZWNlSW5kZXhdICE9ICcuJylcclxuICAgICAgICAgIGNvcHlMZW4gPSBzcmNTb3VuZC5zYW1wbGVzLmxlbmd0aFxyXG4gICAgICAgICAgaWYgKHRyYWNrT2Zmc2V0ICsgY29weUxlbikgPiBvdmVyZmxvd0xlbmd0aFxyXG4gICAgICAgICAgICBjb3B5TGVuID0gb3ZlcmZsb3dMZW5ndGggLSB0cmFja09mZnNldFxyXG4gICAgICAgICAgZm9yIGogaW4gWzAuLi5jb3B5TGVuXVxyXG4gICAgICAgICAgICBzYW1wbGVzW3RyYWNrT2Zmc2V0ICsgal0gKz0gc3JjU291bmQuc2FtcGxlc1tqXVxyXG5cclxuICAgICAgICB0cmFja09mZnNldCArPSBwaWVjZVRvdGFsTGVuZ3RoW3BpZWNlSW5kZXhdXHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc2FtcGxlczogc2FtcGxlc1xyXG4gICAgICBsZW5ndGg6IHRvdGFsTGVuZ3RoXHJcbiAgICB9XHJcblxyXG4gIGNhbGNDYWNoZU5hbWU6ICh0eXBlLCB3aGljaCwgb3ZlcnJpZGVzKSAtPlxyXG4gICAgaWYgKHR5cGUgIT0gJ3RvbmUnKSBhbmQgKHR5cGUgIT0gJ3NhbXBsZScpXHJcbiAgICAgIHJldHVybiB3aGljaFxyXG5cclxuICAgIG5hbWUgPSB3aGljaFxyXG4gICAgaWYgb3ZlcnJpZGVzLm5vdGVcclxuICAgICAgbmFtZSArPSBcIi9OI3tvdmVycmlkZXMubm90ZX1cIlxyXG4gICAgaWYgb3ZlcnJpZGVzLmxlbmd0aFxyXG4gICAgICBuYW1lICs9IFwiL0wje292ZXJyaWRlcy5sZW5ndGh9XCJcclxuXHJcbiAgICByZXR1cm4gbmFtZVxyXG5cclxuICBnZXRPYmplY3Q6ICh3aGljaCkgLT5cclxuICAgIG9iamVjdCA9IEBvYmplY3RzW3doaWNoXVxyXG4gICAgaWYgbm90IG9iamVjdFxyXG4gICAgICBAZXJyb3IgXCJubyBzdWNoIG9iamVjdCAje3doaWNofVwiXHJcbiAgICAgIHJldHVybiBudWxsXHJcbiAgICByZXR1cm4gb2JqZWN0XHJcblxyXG4gIHJlbmRlcjogKHdoaWNoLCBvdmVycmlkZXMpIC0+XHJcbiAgICBvYmplY3QgPSBAZ2V0T2JqZWN0KHdoaWNoKVxyXG4gICAgaWYgbm90IG9iamVjdFxyXG4gICAgICByZXR1cm4gbnVsbFxyXG5cclxuICAgIGNhY2hlTmFtZSA9IEBjYWxjQ2FjaGVOYW1lKG9iamVjdC5fdHlwZSwgd2hpY2gsIG92ZXJyaWRlcylcclxuICAgIGlmIEBzb3VuZENhY2hlW2NhY2hlTmFtZV1cclxuICAgICAgcmV0dXJuIEBzb3VuZENhY2hlW2NhY2hlTmFtZV1cclxuXHJcbiAgICBzb3VuZCA9IHN3aXRjaCBvYmplY3QuX3R5cGVcclxuICAgICAgd2hlbiAndG9uZScgdGhlbiBAcmVuZGVyVG9uZShvYmplY3QsIG92ZXJyaWRlcylcclxuICAgICAgd2hlbiAnc2FtcGxlJyB0aGVuIEByZW5kZXJTYW1wbGUob2JqZWN0LCBvdmVycmlkZXMpXHJcbiAgICAgIHdoZW4gJ2xvb3AnIHRoZW4gQHJlbmRlckxvb3Aob2JqZWN0KVxyXG4gICAgICB3aGVuICd0cmFjaycgdGhlbiBAcmVuZGVyVHJhY2sob2JqZWN0KVxyXG4gICAgICBlbHNlXHJcbiAgICAgICAgQGVycm9yIFwidW5rbm93biB0eXBlICN7b2JqZWN0Ll90eXBlfVwiXHJcbiAgICAgICAgbnVsbFxyXG5cclxuICAgICMgVm9sdW1lXHJcbiAgICBpZiBvYmplY3Qudm9sdW1lPyBhbmQgKG9iamVjdC52b2x1bWUgIT0gMS4wKVxyXG4gICAgICBmb3IgaSBpbiBbMC4uLnNvdW5kLnNhbXBsZXMubGVuZ3RoXVxyXG4gICAgICAgIHNvdW5kLnNhbXBsZXNbaV0gKj0gb2JqZWN0LnZvbHVtZVxyXG5cclxuICAgICMgUmV2ZXJiXHJcbiAgICBpZiBvYmplY3QucmV2ZXJiPyBhbmQgKG9iamVjdC5yZXZlcmIuZGVsYXkgPiAwKVxyXG4gICAgICBkZWxheVNhbXBsZXMgPSBNYXRoLmZsb29yKG9iamVjdC5yZXZlcmIuZGVsYXkgKiBAc2FtcGxlUmF0ZSAvIDEwMDApXHJcbiAgICAgIGlmIHNvdW5kLnNhbXBsZXMubGVuZ3RoID4gZGVsYXlTYW1wbGVzXHJcbiAgICAgICAgdG90YWxMZW5ndGggPSBzb3VuZC5zYW1wbGVzLmxlbmd0aCArIChkZWxheVNhbXBsZXMgKiA4KSAjIHRoaXMgKjggaXMgdG90YWxseSB3cm9uZy4gTmVlZHMgbW9yZSB0aG91Z2h0LlxyXG4gICAgICAgICMgQGxvZy52ZXJib3NlIFwicmV2ZXJiaW5nICN7Y2FjaGVOYW1lfTogI3tkZWxheVNhbXBsZXN9LiBsZW5ndGggdXBkYXRlICN7c291bmQuc2FtcGxlcy5sZW5ndGh9IC0+ICN7dG90YWxMZW5ndGh9XCJcclxuICAgICAgICBzYW1wbGVzID0gQXJyYXkodG90YWxMZW5ndGgpXHJcbiAgICAgICAgZm9yIGkgaW4gWzAuLi5zb3VuZC5zYW1wbGVzLmxlbmd0aF1cclxuICAgICAgICAgIHNhbXBsZXNbaV0gPSBzb3VuZC5zYW1wbGVzW2ldXHJcbiAgICAgICAgZm9yIGkgaW4gW3NvdW5kLnNhbXBsZXMubGVuZ3RoLi4udG90YWxMZW5ndGhdXHJcbiAgICAgICAgICBzYW1wbGVzW2ldID0gMFxyXG4gICAgICAgIGZvciBpIGluIFswLi4uKHRvdGFsTGVuZ3RoIC0gZGVsYXlTYW1wbGVzKV1cclxuICAgICAgICAgIHNhbXBsZXNbaSArIGRlbGF5U2FtcGxlc10gKz0gTWF0aC5mbG9vcihzYW1wbGVzW2ldICogb2JqZWN0LnJldmVyYi5kZWNheSlcclxuICAgICAgICBzb3VuZC5zYW1wbGVzID0gc2FtcGxlc1xyXG5cclxuICAgIEBsb2cudmVyYm9zZSBcIlJlbmRlcmVkICN7Y2FjaGVOYW1lfS5cIlxyXG4gICAgQHNvdW5kQ2FjaGVbY2FjaGVOYW1lXSA9IHNvdW5kXHJcbiAgICByZXR1cm4gc291bmRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEV4cG9ydHNcclxuXHJcbnJlbmRlckxvb3BTY3JpcHQgPSAoYXJncykgLT5cclxuICBsb2dPYmogPSBhcmdzLmxvZ1xyXG4gIGxvZ09iai52ZXJib3NlIFwiUGFyc2luZy4uLlwiXHJcbiAgcGFyc2VyID0gbmV3IFBhcnNlcihsb2dPYmopXHJcbiAgcGFyc2VyLnBhcnNlIGFyZ3Muc2NyaXB0XHJcblxyXG4gIHdoaWNoID0gYXJncy53aGljaFxyXG4gIHdoaWNoID89IHBhcnNlci5sYXN0T2JqZWN0XHJcblxyXG4gIGlmIHdoaWNoXHJcbiAgICBzYW1wbGVSYXRlID0gNDQxMDBcclxuICAgIGxvZ09iai52ZXJib3NlIFwiUmVuZGVyaW5nLi4uXCJcclxuICAgIHJlbmRlcmVyID0gbmV3IFJlbmRlcmVyKGxvZ09iaiwgc2FtcGxlUmF0ZSwgYXJncy5yZWFkTG9jYWxGaWxlcywgcGFyc2VyLm9iamVjdHMpXHJcbiAgICBvdXRwdXRTb3VuZCA9IHJlbmRlcmVyLnJlbmRlcih3aGljaCwge30pXHJcbiAgICBpZiBhcmdzLm91dHB1dEZpbGVuYW1lXHJcbiAgICAgIHJldHVybiByaWZmd2F2ZS53cml0ZVdBViBhcmdzLm91dHB1dEZpbGVuYW1lLCBzYW1wbGVSYXRlLCBvdXRwdXRTb3VuZC5zYW1wbGVzXHJcbiAgICByZXR1cm4gcmlmZndhdmUubWFrZUJsb2JVcmwoc2FtcGxlUmF0ZSwgb3V0cHV0U291bmQuc2FtcGxlcylcclxuXHJcbiAgcmV0dXJuIG51bGxcclxuXHJcbm1vZHVsZS5leHBvcnRzID1cclxuICByZW5kZXI6IHJlbmRlckxvb3BTY3JpcHRcclxuIiwiZnMgPSByZXF1aXJlIFwiZnNcIlxyXG5cclxuY2xhc3MgRmFzdEJhc2U2NFxyXG5cclxuICBjb25zdHJ1Y3RvcjogLT5cclxuICAgIEBjaGFycyA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLz1cIlxyXG4gICAgQGVuY0xvb2t1cCA9IFtdXHJcbiAgICBmb3IgaSBpbiBbMC4uLjQwOTZdXHJcbiAgICAgIEBlbmNMb29rdXBbaV0gPSBAY2hhcnNbaSA+PiA2XSArIEBjaGFyc1tpICYgMHgzRl1cclxuXHJcbiAgZW5jb2RlOiAoc3JjKSAtPlxyXG4gICAgbGVuID0gc3JjLmxlbmd0aFxyXG4gICAgZHN0ID0gJydcclxuICAgIGkgPSAwXHJcbiAgICB3aGlsZSAobGVuID4gMilcclxuICAgICAgbiA9IChzcmNbaV0gPDwgMTYpIHwgKHNyY1tpKzFdPDw4KSB8IHNyY1tpKzJdXHJcbiAgICAgIGRzdCs9IHRoaXMuZW5jTG9va3VwW24gPj4gMTJdICsgdGhpcy5lbmNMb29rdXBbbiAmIDB4RkZGXVxyXG4gICAgICBsZW4tPSAzXHJcbiAgICAgIGkrPSAzXHJcbiAgICBpZiAobGVuID4gMClcclxuICAgICAgbjE9IChzcmNbaV0gJiAweEZDKSA+PiAyXHJcbiAgICAgIG4yPSAoc3JjW2ldICYgMHgwMykgPDwgNFxyXG4gICAgICBpZiAobGVuID4gMSlcclxuICAgICAgICBuMiB8PSAoc3JjWysraV0gJiAweEYwKSA+PiA0XHJcbiAgICAgIGRzdCs9IHRoaXMuY2hhcnNbbjFdXHJcbiAgICAgIGRzdCs9IHRoaXMuY2hhcnNbbjJdXHJcbiAgICAgIGlmIChsZW4gPT0gMilcclxuICAgICAgICBuMz0gKHNyY1tpKytdICYgMHgwRikgPDwgMlxyXG4gICAgICAgIG4zIHw9IChzcmNbaV0gJiAweEMwKSA+PiA2XHJcbiAgICAgICAgZHN0Kz0gdGhpcy5jaGFyc1tuM11cclxuICAgICAgaWYgKGxlbiA9PSAxKVxyXG4gICAgICAgIGRzdCs9ICc9J1xyXG4gICAgICBkc3QrPSAnPSdcclxuXHJcbiAgICByZXR1cm4gZHN0XHJcblxyXG5jbGFzcyBSSUZGV0FWRVxyXG4gIGNvbnN0cnVjdG9yOiAoQHNhbXBsZVJhdGUsIEBkYXRhKSAtPlxyXG4gICAgQHdhdiA9IFtdICAgICAjIEFycmF5IGNvbnRhaW5pbmcgdGhlIGdlbmVyYXRlZCB3YXZlIGZpbGVcclxuICAgIEBoZWFkZXIgPSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjIE9GRlMgU0laRSBOT1RFU1xyXG4gICAgICBjaHVua0lkICAgICAgOiBbMHg1MiwweDQ5LDB4NDYsMHg0Nl0sICMgMCAgICA0ICBcIlJJRkZcIiA9IDB4NTI0OTQ2NDZcclxuICAgICAgY2h1bmtTaXplICAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDQgICAgNCAgMzYrU3ViQ2h1bmsyU2l6ZSA9IDQrKDgrU3ViQ2h1bmsxU2l6ZSkrKDgrU3ViQ2h1bmsyU2l6ZSlcclxuICAgICAgZm9ybWF0ICAgICAgIDogWzB4NTcsMHg0MSwweDU2LDB4NDVdLCAjIDggICAgNCAgXCJXQVZFXCIgPSAweDU3NDE1NjQ1XHJcbiAgICAgIHN1YkNodW5rMUlkICA6IFsweDY2LDB4NmQsMHg3NCwweDIwXSwgIyAxMiAgIDQgIFwiZm10IFwiID0gMHg2NjZkNzQyMFxyXG4gICAgICBzdWJDaHVuazFTaXplOiAxNiwgICAgICAgICAgICAgICAgICAgICMgMTYgICA0ICAxNiBmb3IgUENNXHJcbiAgICAgIGF1ZGlvRm9ybWF0ICA6IDEsICAgICAgICAgICAgICAgICAgICAgIyAyMCAgIDIgIFBDTSA9IDFcclxuICAgICAgbnVtQ2hhbm5lbHMgIDogMSwgICAgICAgICAgICAgICAgICAgICAjIDIyICAgMiAgTW9ubyA9IDEsIFN0ZXJlbyA9IDIuLi5cclxuICAgICAgc2FtcGxlUmF0ZSAgIDogQHNhbXBsZVJhdGUsICAgICAgICAgICAjIDI0ICAgNCAgODAwMCwgNDQxMDAuLi5cclxuICAgICAgYnl0ZVJhdGUgICAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDI4ICAgNCAgU2FtcGxlUmF0ZSpOdW1DaGFubmVscypCaXRzUGVyU2FtcGxlLzhcclxuICAgICAgYmxvY2tBbGlnbiAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDMyICAgMiAgTnVtQ2hhbm5lbHMqQml0c1BlclNhbXBsZS84XHJcbiAgICAgIGJpdHNQZXJTYW1wbGU6IDE2LCAgICAgICAgICAgICAgICAgICAgIyAzNCAgIDIgIDggYml0cyA9IDgsIDE2IGJpdHMgPSAxNlxyXG4gICAgICBzdWJDaHVuazJJZCAgOiBbMHg2NCwweDYxLDB4NzQsMHg2MV0sICMgMzYgICA0ICBcImRhdGFcIiA9IDB4NjQ2MTc0NjFcclxuICAgICAgc3ViQ2h1bmsyU2l6ZTogMCAgICAgICAgICAgICAgICAgICAgICAjIDQwICAgNCAgZGF0YSBzaXplID0gTnVtU2FtcGxlcypOdW1DaGFubmVscypCaXRzUGVyU2FtcGxlLzhcclxuXHJcbiAgICBAZ2VuZXJhdGUoKVxyXG5cclxuICB1MzJUb0FycmF5OiAoaSkgLT5cclxuICAgIHJldHVybiBbaSYweEZGLCAoaT4+OCkmMHhGRiwgKGk+PjE2KSYweEZGLCAoaT4+MjQpJjB4RkZdXHJcblxyXG4gIHUxNlRvQXJyYXk6IChpKSAtPlxyXG4gICAgcmV0dXJuIFtpJjB4RkYsIChpPj44KSYweEZGXVxyXG5cclxuICBzcGxpdDE2Yml0QXJyYXk6IChkYXRhKSAtPlxyXG4gICAgciA9IFtdXHJcbiAgICBqID0gMFxyXG4gICAgbGVuID0gZGF0YS5sZW5ndGhcclxuICAgIGZvciBpIGluIFswLi4ubGVuXVxyXG4gICAgICByW2orK10gPSBkYXRhW2ldICYgMHhGRlxyXG4gICAgICByW2orK10gPSAoZGF0YVtpXT4+OCkgJiAweEZGXHJcblxyXG4gICAgcmV0dXJuIHJcclxuXHJcbiAgZ2VuZXJhdGU6IC0+XHJcbiAgICBAaGVhZGVyLmJsb2NrQWxpZ24gPSAoQGhlYWRlci5udW1DaGFubmVscyAqIEBoZWFkZXIuYml0c1BlclNhbXBsZSkgPj4gM1xyXG4gICAgQGhlYWRlci5ieXRlUmF0ZSA9IEBoZWFkZXIuYmxvY2tBbGlnbiAqIEBzYW1wbGVSYXRlXHJcbiAgICBAaGVhZGVyLnN1YkNodW5rMlNpemUgPSBAZGF0YS5sZW5ndGggKiAoQGhlYWRlci5iaXRzUGVyU2FtcGxlID4+IDMpXHJcbiAgICBAaGVhZGVyLmNodW5rU2l6ZSA9IDM2ICsgQGhlYWRlci5zdWJDaHVuazJTaXplXHJcblxyXG4gICAgaWYgQGhlYWRlci5iaXRzUGVyU2FtcGxlID09IDE2XHJcbiAgICAgIEBkYXRhID0gQHNwbGl0MTZiaXRBcnJheShAZGF0YSlcclxuXHJcbiAgICBAd2F2ID0gQGhlYWRlci5jaHVua0lkLmNvbmNhdChcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5jaHVua1NpemUpLFxyXG4gICAgICBAaGVhZGVyLmZvcm1hdCxcclxuICAgICAgQGhlYWRlci5zdWJDaHVuazFJZCxcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5zdWJDaHVuazFTaXplKSxcclxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5hdWRpb0Zvcm1hdCksXHJcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIubnVtQ2hhbm5lbHMpLFxyXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLnNhbXBsZVJhdGUpLFxyXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLmJ5dGVSYXRlKSxcclxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5ibG9ja0FsaWduKSxcclxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5iaXRzUGVyU2FtcGxlKSxcclxuICAgICAgQGhlYWRlci5zdWJDaHVuazJJZCxcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5zdWJDaHVuazJTaXplKSxcclxuICAgICAgQGRhdGFcclxuICAgIClcclxuICAgIGZiID0gbmV3IEZhc3RCYXNlNjRcclxuICAgIEBiYXNlNjREYXRhID0gZmIuZW5jb2RlKEB3YXYpXHJcbiAgICBAZGF0YVVSSSA9ICdkYXRhOmF1ZGlvL3dhdjtiYXNlNjQsJyArIEBiYXNlNjREYXRhXHJcblxyXG4gIHJhdzogLT5cclxuICAgIHJldHVybiBuZXcgQnVmZmVyKEBiYXNlNjREYXRhLCBcImJhc2U2NFwiKVxyXG5cclxud3JpdGVXQVYgPSAoZmlsZW5hbWUsIHNhbXBsZVJhdGUsIHNhbXBsZXMpIC0+XHJcbiAgd2F2ZSA9IG5ldyBSSUZGV0FWRSBzYW1wbGVSYXRlLCBzYW1wbGVzXHJcbiAgZnMud3JpdGVGaWxlU3luYyhmaWxlbmFtZSwgd2F2ZS5yYXcoKSlcclxuICByZXR1cm4gdHJ1ZVxyXG5cclxubWFrZURhdGFVUkkgPSAoc2FtcGxlUmF0ZSwgc2FtcGxlcykgLT5cclxuICB3YXZlID0gbmV3IFJJRkZXQVZFIHNhbXBsZVJhdGUsIHNhbXBsZXNcclxuICByZXR1cm4gd2F2ZS5kYXRhVVJJXHJcblxyXG5iNjR0b0Jsb2IgPSAoYjY0RGF0YSwgY29udGVudFR5cGUsIHNsaWNlU2l6ZSkgLT5cclxuICBjb250ZW50VHlwZSA9IGNvbnRlbnRUeXBlIHx8ICcnXHJcbiAgc2xpY2VTaXplID0gc2xpY2VTaXplIHx8IDUxMlxyXG5cclxuICBieXRlQ2hhcmFjdGVycyA9IGF0b2IoYjY0RGF0YSlcclxuICBieXRlQXJyYXlzID0gW11cclxuXHJcbiAgZm9yIG9mZnNldCBpbiBbMC4uLmJ5dGVDaGFyYWN0ZXJzLmxlbmd0aF0gYnkgc2xpY2VTaXplXHJcbiAgICBzbGljZSA9IGJ5dGVDaGFyYWN0ZXJzLnNsaWNlKG9mZnNldCwgb2Zmc2V0ICsgc2xpY2VTaXplKVxyXG5cclxuICAgIGJ5dGVOdW1iZXJzID0gbmV3IEFycmF5KHNsaWNlLmxlbmd0aClcclxuICAgIGZvciBpIGluIFswLi4uc2xpY2UubGVuZ3RoXVxyXG4gICAgICBieXRlTnVtYmVyc1tpXSA9IHNsaWNlLmNoYXJDb2RlQXQoaSlcclxuXHJcbiAgICBieXRlQXJyYXkgPSBuZXcgVWludDhBcnJheShieXRlTnVtYmVycylcclxuXHJcbiAgICBieXRlQXJyYXlzLnB1c2goYnl0ZUFycmF5KVxyXG5cclxuICBibG9iID0gbmV3IEJsb2IoYnl0ZUFycmF5cywge3R5cGU6IGNvbnRlbnRUeXBlfSlcclxuICByZXR1cm4gYmxvYlxyXG5cclxubWFrZUJsb2JVcmwgPSAoc2FtcGxlUmF0ZSwgc2FtcGxlcykgLT5cclxuICB3YXZlID0gbmV3IFJJRkZXQVZFIHNhbXBsZVJhdGUsIHNhbXBsZXNcclxuICBibG9iID0gYjY0dG9CbG9iKHdhdmUuYmFzZTY0RGF0YSwgXCJhdWRpby93YXZcIilcclxuICByZXR1cm4gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPVxyXG4gIFJJRkZXQVZFOiBSSUZGV0FWRVxyXG4gIHdyaXRlV0FWOiB3cml0ZVdBVlxyXG4gIG1ha2VEYXRhVVJJOiBtYWtlRGF0YVVSSVxyXG4gIG1ha2VCbG9iVXJsOiBtYWtlQmxvYlVybFxyXG4iXX0=
