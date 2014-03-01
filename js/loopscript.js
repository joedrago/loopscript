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
  first: "# ------------------------------------------------------------\n# Your first LoopScript. Someday there will be documentation!\n\ntone note1\n  duration 250\n  octave 4\n  note C\n\ntone bass1\n  duration 250\n  octave 1\n  note B\n\nloop loop1\n  pattern note1 x.......x.......\n  pattern bass1 ....x.......x...\n",
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
    var data, factor, i, newfreq, oldfreq, relength, resamples, samples, subchunk2Size, view, _i, _j;
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
    if (((overrides.note != null) && (overrides.note !== sampleObj.srcnote)) || (sampleObj.octave !== sampleObj.srcoctave)) {
      oldfreq = findFreq(sampleObj.srcoctave, sampleObj.srcnote);
      newfreq = findFreq(sampleObj.octave, overrides.note);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCJqZGF0YXZpZXcuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxsaWJcXF9lbXB0eS5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcbmF0aXZlLWJ1ZmZlci1icm93c2VyaWZ5XFxpbmRleC5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcbmF0aXZlLWJ1ZmZlci1icm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJhc2U2NC1qc1xcbGliXFxiNjQuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXG5hdGl2ZS1idWZmZXItYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxpZWVlNzU0XFxpbmRleC5qcyIsIi4uXFxzcmNcXGV4YW1wbGVzLmNvZmZlZSIsIi4uXFxzcmNcXGZyZXEuY29mZmVlIiwiLi5cXHNyY1xcbG9vcHNjcmlwdC5jb2ZmZWUiLCIuLlxcc3JjXFxyaWZmd2F2ZS5jb2ZmZWUiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNXZCQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoaUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQSxNQUFNLENBQUMsT0FBUCxHQUVFO0FBQUEsRUFBQSxLQUFBLEVBQU8sMlRBQVA7QUFBQSxFQW9CQSxLQUFBLEVBQU8sZ2ZBcEJQO0FBQUEsRUFrREEsS0FBQSxFQUFPLHVwQkFsRFA7QUFBQSxFQThFQSxNQUFBLEVBQVEsOHJCQTlFUjtBQUFBLEVBMEdBLE9BQUEsRUFBUyx1ZEExR1Q7Q0FGRixDQUFBOzs7Ozs7OztBQ0FBLElBQUEsbUNBQUE7O0FBQUEsU0FBQSxHQUFZO0VBQ1Y7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7R0FEVSxFQVFWO0FBQUEsSUFDRSxHQUFBLEVBQUssT0FEUDtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtBQUFBLElBS0UsR0FBQSxFQUFLLE9BTFA7QUFBQSxJQU1FLEdBQUEsRUFBSyxPQU5QO0FBQUEsSUFPRSxHQUFBLEVBQUssT0FQUDtBQUFBLElBUUUsR0FBQSxFQUFLLE9BUlA7QUFBQSxJQVNFLEdBQUEsRUFBSyxPQVRQO0FBQUEsSUFVRSxHQUFBLEVBQUssT0FWUDtBQUFBLElBV0UsR0FBQSxFQUFLLE9BWFA7QUFBQSxJQVlFLEdBQUEsRUFBSyxPQVpQO0dBUlUsRUF1QlY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0F2QlUsRUFzQ1Y7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0F0Q1UsRUFxRFY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0FyRFUsRUFvRVY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0FwRVUsRUFtRlY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0FuRlUsRUFrR1Y7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0FsR1UsRUFpSFY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0dBakhVO0NBQVosQ0FBQTs7QUFBQSxjQXNIQSxHQUFpQixPQXRIakIsQ0FBQTs7QUFBQSxRQXdIQSxHQUFXLFNBQUMsTUFBRCxFQUFTLElBQVQsR0FBQTtBQUNULE1BQUEsV0FBQTtBQUFBLEVBQUEsSUFBQSxHQUFPLElBQUksQ0FBQyxXQUFMLENBQUEsQ0FBUCxDQUFBO0FBQ0EsRUFBQSxJQUFHLENBQUMsTUFBQSxJQUFVLENBQVgsQ0FBQSxJQUFrQixDQUFDLE1BQUEsR0FBUyxTQUFTLENBQUMsTUFBcEIsQ0FBbEIsSUFBa0QsY0FBYyxDQUFDLElBQWYsQ0FBb0IsSUFBcEIsQ0FBckQ7QUFDRSxJQUFBLFdBQUEsR0FBYyxTQUFVLENBQUEsTUFBQSxDQUF4QixDQUFBO0FBQ0EsSUFBQSxJQUFHLHFCQUFBLElBQWlCLDJCQUFwQjtBQUNFLGFBQU8sV0FBWSxDQUFBLElBQUEsQ0FBbkIsQ0FERjtLQUZGO0dBREE7QUFLQSxTQUFPLEtBQVAsQ0FOUztBQUFBLENBeEhYLENBQUE7O0FBQUEsTUFnSU0sQ0FBQyxPQUFQLEdBQ0U7QUFBQSxFQUFBLFNBQUEsRUFBVyxTQUFYO0FBQUEsRUFDQSxRQUFBLEVBQVUsUUFEVjtDQWpJRixDQUFBOzs7Ozs7QUNHQSxJQUFBLGlIQUFBO0VBQUEsa0JBQUE7O0FBQUEsV0FBYSxPQUFBLENBQVEsUUFBUixFQUFaLFFBQUQsQ0FBQTs7QUFBQSxRQUNBLEdBQWEsT0FBQSxDQUFRLFlBQVIsQ0FEYixDQUFBOztBQUFBLFNBRUEsR0FBYSxPQUFBLENBQVEsaUJBQVIsQ0FGYixDQUFBOztBQUFBLEVBR0EsR0FBYSxPQUFBLENBQVEsSUFBUixDQUhiLENBQUE7O0FBQUEsS0FRQSxHQUFRLFNBQUMsR0FBRCxHQUFBO0FBQ04sTUFBQSx1QkFBQTtBQUFBLEVBQUEsSUFBTyxhQUFKLElBQVksTUFBQSxDQUFBLEdBQUEsS0FBZ0IsUUFBL0I7QUFDRSxXQUFPLEdBQVAsQ0FERjtHQUFBO0FBR0EsRUFBQSxJQUFHLEdBQUEsWUFBZSxJQUFsQjtBQUNFLFdBQVcsSUFBQSxJQUFBLENBQUssR0FBRyxDQUFDLE9BQUosQ0FBQSxDQUFMLENBQVgsQ0FERjtHQUhBO0FBTUEsRUFBQSxJQUFHLEdBQUEsWUFBZSxNQUFsQjtBQUNFLElBQUEsS0FBQSxHQUFRLEVBQVIsQ0FBQTtBQUNBLElBQUEsSUFBZ0Isa0JBQWhCO0FBQUEsTUFBQSxLQUFBLElBQVMsR0FBVCxDQUFBO0tBREE7QUFFQSxJQUFBLElBQWdCLHNCQUFoQjtBQUFBLE1BQUEsS0FBQSxJQUFTLEdBQVQsQ0FBQTtLQUZBO0FBR0EsSUFBQSxJQUFnQixxQkFBaEI7QUFBQSxNQUFBLEtBQUEsSUFBUyxHQUFULENBQUE7S0FIQTtBQUlBLElBQUEsSUFBZ0Isa0JBQWhCO0FBQUEsTUFBQSxLQUFBLElBQVMsR0FBVCxDQUFBO0tBSkE7QUFLQSxXQUFXLElBQUEsTUFBQSxDQUFPLEdBQUcsQ0FBQyxNQUFYLEVBQW1CLEtBQW5CLENBQVgsQ0FORjtHQU5BO0FBQUEsRUFjQSxXQUFBLEdBQWtCLElBQUEsR0FBRyxDQUFDLFdBQUosQ0FBQSxDQWRsQixDQUFBO0FBZ0JBLE9BQUEsVUFBQSxHQUFBO0FBQ0UsSUFBQSxXQUFZLENBQUEsR0FBQSxDQUFaLEdBQW1CLEtBQUEsQ0FBTSxHQUFJLENBQUEsR0FBQSxDQUFWLENBQW5CLENBREY7QUFBQSxHQWhCQTtBQW1CQSxTQUFPLFdBQVAsQ0FwQk07QUFBQSxDQVJSLENBQUE7O0FBQUEsU0E4QkEsR0FBWSxTQUFDLENBQUQsR0FBQTtBQUNWLFVBQU8sTUFBQSxDQUFPLENBQVAsQ0FBUDtBQUFBLFNBQ08sTUFEUDthQUNtQixLQURuQjtBQUFBLFNBRU8sS0FGUDthQUVrQixLQUZsQjtBQUFBLFNBR08sSUFIUDthQUdpQixLQUhqQjtBQUFBLFNBSU8sR0FKUDthQUlnQixLQUpoQjtBQUFBO2FBS08sTUFMUDtBQUFBLEdBRFU7QUFBQSxDQTlCWixDQUFBOztBQUFBO0FBMENlLEVBQUEscUJBQUEsR0FBQTtBQUNYLElBQUEsSUFBQyxDQUFBLEtBQUQsR0FBUyxDQUFDLENBQUQsQ0FBVCxDQURXO0VBQUEsQ0FBYjs7QUFBQSx3QkFHQSxJQUFBLEdBQU0sU0FBQyxNQUFELEdBQUE7V0FDSixJQUFDLENBQUEsS0FBSyxDQUFDLElBQVAsQ0FBWSxNQUFaLEVBREk7RUFBQSxDQUhOLENBQUE7O0FBQUEsd0JBTUEsR0FBQSxHQUFLLFNBQUEsR0FBQTtBQUNILElBQUEsSUFBRyxJQUFDLENBQUEsS0FBSyxDQUFDLE1BQVAsR0FBZ0IsQ0FBbkI7QUFDRSxNQUFBLElBQUMsQ0FBQSxLQUFLLENBQUMsR0FBUCxDQUFBLENBQUEsQ0FBQTtBQUNBLGFBQU8sSUFBUCxDQUZGO0tBQUE7QUFHQSxXQUFPLEtBQVAsQ0FKRztFQUFBLENBTkwsQ0FBQTs7QUFBQSx3QkFZQSxHQUFBLEdBQUssU0FBQSxHQUFBO0FBQ0gsV0FBTyxJQUFDLENBQUEsS0FBTSxDQUFBLElBQUMsQ0FBQSxLQUFLLENBQUMsTUFBUCxHQUFnQixDQUFoQixDQUFkLENBREc7RUFBQSxDQVpMLENBQUE7O0FBQUEsd0JBZUEsVUFBQSxHQUFZLFNBQUMsQ0FBRCxHQUFBO1dBQ1YsSUFBQyxDQUFBLEtBQU0sQ0FBQSxJQUFDLENBQUEsS0FBSyxDQUFDLE1BQVAsR0FBZ0IsQ0FBaEIsQ0FBUCxHQUE0QixFQURsQjtFQUFBLENBZlosQ0FBQTs7cUJBQUE7O0lBMUNGLENBQUE7O0FBQUEsV0E0REEsR0FBYyxTQUFDLElBQUQsR0FBQTtBQUNaLE1BQUEsbUJBQUE7QUFBQSxFQUFBLE1BQUEsR0FBUyxDQUFULENBQUE7QUFDQSxPQUFTLDhGQUFULEdBQUE7QUFDRSxJQUFBLElBQUcsSUFBSyxDQUFBLENBQUEsQ0FBTCxLQUFXLElBQWQ7QUFDRSxNQUFBLE1BQUEsSUFBVSxDQUFWLENBREY7S0FBQSxNQUFBO0FBR0UsTUFBQSxNQUFBLEVBQUEsQ0FIRjtLQURGO0FBQUEsR0FEQTtBQU1BLFNBQU8sTUFBUCxDQVBZO0FBQUEsQ0E1RGQsQ0FBQTs7QUFBQTtBQXlFZSxFQUFBLGdCQUFFLEdBQUYsR0FBQTtBQUNYLElBRFksSUFBQyxDQUFBLE1BQUEsR0FDYixDQUFBO0FBQUEsSUFBQSxJQUFDLENBQUEsWUFBRCxHQUFnQixxQkFBaEIsQ0FBQTtBQUFBLElBQ0EsSUFBQyxDQUFBLG1CQUFELEdBQXVCLE9BRHZCLENBQUE7QUFBQSxJQUVBLElBQUMsQ0FBQSxXQUFELEdBQWUsZUFGZixDQUFBO0FBQUEsSUFHQSxJQUFDLENBQUEsc0JBQUQsR0FBMEIsSUFIMUIsQ0FBQTtBQUFBLElBSUEsSUFBQyxDQUFBLHNCQUFELEdBQTBCLE9BSjFCLENBQUE7QUFBQSxJQUtBLElBQUMsQ0FBQSxXQUFELEdBQWUsVUFMZixDQUFBO0FBQUEsSUFXQSxJQUFDLENBQUEsV0FBRCxHQUNFO0FBQUEsTUFBQSxTQUFBLEVBQ0U7QUFBQSxRQUFBLFNBQUEsRUFBVyxDQUFYO0FBQUEsUUFDQSxPQUFBLEVBQVMsR0FEVDtBQUFBLFFBRUEsTUFBQSxFQUFRLENBRlI7QUFBQSxRQUdBLElBQUEsRUFBTSxHQUhOO0FBQUEsUUFJQSxJQUFBLEVBQU0sTUFKTjtBQUFBLFFBS0EsR0FBQSxFQUFLLEdBTEw7QUFBQSxRQU1BLFFBQUEsRUFBVSxHQU5WO0FBQUEsUUFPQSxLQUFBLEVBQU8sQ0FQUDtBQUFBLFFBUUEsTUFBQSxFQUFRLEdBUlI7QUFBQSxRQVNBLElBQUEsRUFBTSxJQVROO0FBQUEsUUFVQSxNQUFBLEVBQ0U7QUFBQSxVQUFBLEtBQUEsRUFBTyxDQUFQO0FBQUEsVUFDQSxLQUFBLEVBQU8sQ0FEUDtTQVhGO0FBQUEsUUFhQSxJQUFBLEVBQ0U7QUFBQSxVQUFBLENBQUEsRUFBRyxDQUFIO0FBQUEsVUFDQSxDQUFBLEVBQUcsQ0FESDtBQUFBLFVBRUEsQ0FBQSxFQUFHLENBRkg7QUFBQSxVQUdBLENBQUEsRUFBRyxDQUhIO1NBZEY7T0FERjtLQVpGLENBQUE7QUFBQSxJQWlDQSxJQUFDLENBQUEsVUFBRCxHQUNFO0FBQUEsTUFBQSxJQUFBLEVBQ0U7QUFBQSxRQUFBLElBQUEsRUFBTSxRQUFOO0FBQUEsUUFDQSxJQUFBLEVBQU0sT0FETjtBQUFBLFFBRUEsUUFBQSxFQUFVLE9BRlY7QUFBQSxRQUdBLElBQUEsRUFBTSxNQUhOO0FBQUEsUUFJQSxNQUFBLEVBQVEsS0FKUjtBQUFBLFFBS0EsSUFBQSxFQUFNLFFBTE47QUFBQSxRQU1BLE1BQUEsRUFBUSxPQU5SO0FBQUEsUUFPQSxJQUFBLEVBQU0sTUFQTjtBQUFBLFFBUUEsTUFBQSxFQUFRLFFBUlI7T0FERjtBQUFBLE1BV0EsTUFBQSxFQUNFO0FBQUEsUUFBQSxHQUFBLEVBQUssUUFBTDtBQUFBLFFBQ0EsTUFBQSxFQUFRLE9BRFI7QUFBQSxRQUVBLElBQUEsRUFBTSxNQUZOO0FBQUEsUUFHQSxNQUFBLEVBQVEsUUFIUjtBQUFBLFFBSUEsU0FBQSxFQUFXLEtBSlg7QUFBQSxRQUtBLE9BQUEsRUFBUyxRQUxUO0FBQUEsUUFNQSxNQUFBLEVBQVEsS0FOUjtBQUFBLFFBT0EsSUFBQSxFQUFNLFFBUE47T0FaRjtBQUFBLE1BcUJBLElBQUEsRUFDRTtBQUFBLFFBQUEsR0FBQSxFQUFLLEtBQUw7QUFBQSxRQUNBLEtBQUEsRUFBTyxLQURQO09BdEJGO0FBQUEsTUF5QkEsS0FBQSxFQUFPLEVBekJQO0tBbENGLENBQUE7QUFBQSxJQTZEQSxJQUFDLENBQUEsV0FBRCxHQUFlLEdBQUEsQ0FBQSxXQTdEZixDQUFBO0FBQUEsSUE4REEsSUFBQyxDQUFBLFVBQUQsR0FBYyxFQTlEZCxDQUFBO0FBQUEsSUErREEsSUFBQyxDQUFBLEtBQUQsQ0FBTyxTQUFQLENBL0RBLENBQUE7QUFBQSxJQWdFQSxJQUFDLENBQUEsT0FBRCxHQUFXLEVBaEVYLENBQUE7QUFBQSxJQWlFQSxJQUFDLENBQUEsTUFBRCxHQUFVLElBakVWLENBQUE7QUFBQSxJQWtFQSxJQUFDLENBQUEsZ0JBQUQsR0FBb0IsS0FsRXBCLENBRFc7RUFBQSxDQUFiOztBQUFBLG1CQXFFQSxZQUFBLEdBQWMsU0FBQyxJQUFELEdBQUE7QUFDWixXQUFPLDZCQUFQLENBRFk7RUFBQSxDQXJFZCxDQUFBOztBQUFBLG1CQXdFQSxLQUFBLEdBQU8sU0FBQyxJQUFELEdBQUE7V0FDTCxJQUFDLENBQUEsR0FBRyxDQUFDLEtBQUwsQ0FBWSxvQkFBQSxHQUFtQixJQUFDLENBQUEsTUFBcEIsR0FBNEIsSUFBNUIsR0FBK0IsSUFBM0MsRUFESztFQUFBLENBeEVQLENBQUE7O0FBQUEsbUJBMkVBLEtBQUEsR0FBTyxTQUFDLElBQUQsR0FBQTs7TUFDTCxPQUFRO0tBQVI7QUFDQSxJQUFBLElBQUcsQ0FBQSxJQUFLLENBQUEsV0FBWSxDQUFBLElBQUEsQ0FBcEI7QUFDRSxNQUFBLElBQUMsQ0FBQSxLQUFELENBQVEsc0JBQUEsR0FBcUIsSUFBN0IsQ0FBQSxDQUFBO0FBQ0EsYUFBTyxLQUFQLENBRkY7S0FEQTtBQUFBLElBSUEsSUFBQyxDQUFBLFVBQVUsQ0FBQyxJQUFaLENBQWlCLEtBQUEsQ0FBTSxJQUFDLENBQUEsV0FBWSxDQUFBLElBQUEsQ0FBbkIsQ0FBakIsQ0FKQSxDQUFBO0FBS0EsV0FBTyxJQUFQLENBTks7RUFBQSxDQTNFUCxDQUFBOztBQUFBLG1CQW1GQSxPQUFBLEdBQVMsU0FBQSxHQUFBO0FBQ1AsUUFBQSwwQ0FBQTtBQUFBLElBQUEsY0FBQSxHQUFpQixFQUFqQixDQUFBO0FBQ0E7QUFBQSxTQUFBLDJDQUFBO3VCQUFBO0FBQ0UsV0FBQSxZQUFBLEdBQUE7QUFDRSxRQUFBLGNBQWUsQ0FBQSxHQUFBLENBQWYsR0FBc0IsS0FBTSxDQUFBLEdBQUEsQ0FBNUIsQ0FERjtBQUFBLE9BREY7QUFBQSxLQURBO0FBSUEsV0FBTyxjQUFQLENBTE87RUFBQSxDQW5GVCxDQUFBOztBQUFBLG1CQTBGQSxLQUFBLEdBQU8sU0FBQyxNQUFELEdBQUE7O01BQ0wsU0FBVTtLQUFWO1dBQ0EsSUFBQyxDQUFBLEdBQUcsQ0FBQyxPQUFMLENBQWEsQ0FBQyxTQUFBLEdBQVEsTUFBUixHQUFnQixHQUFqQixDQUFBLEdBQXNCLElBQUksQ0FBQyxTQUFMLENBQWUsSUFBQyxDQUFBLE9BQUQsQ0FBQSxDQUFmLENBQW5DLEVBRks7RUFBQSxDQTFGUCxDQUFBOztBQUFBLG1CQThGQSxZQUFBLEdBQWMsU0FBQSxHQUFBO0FBQ1YsUUFBQSxpQkFBQTtBQUFBLElBRFcsOERBQ1gsQ0FBQTtBQUFBLElBQUEsSUFBQyxDQUFBLFlBQUQsQ0FBQSxDQUFBLENBQUE7QUFBQSxJQUVBLElBQUMsQ0FBQSxNQUFELEdBQVUsRUFGVixDQUFBO0FBR0EsU0FBUyxzREFBVCxHQUFBO0FBQ0UsTUFBQSxJQUFDLENBQUEsTUFBTyxDQUFBLElBQUssQ0FBQSxDQUFBLENBQUwsQ0FBUixHQUFtQixJQUFLLENBQUEsQ0FBQSxHQUFFLENBQUYsQ0FBeEIsQ0FERjtBQUFBLEtBSEE7QUFBQSxJQUtBLElBQUMsQ0FBQSxnQkFBRCxHQUFvQixJQUxwQixDQUFBO0FBT0EsSUFBQSxJQUFHLElBQUMsQ0FBQSxNQUFNLENBQUMsS0FBUixLQUFpQixNQUFwQjtBQUNFLE1BQUEsSUFBQyxDQUFBLE1BQU0sQ0FBQyxTQUFSLEdBQW9CLEVBQXBCLENBREY7S0FQQTtBQVVBLElBQUEsSUFBRyxJQUFDLENBQUEsTUFBTSxDQUFDLEtBQVIsS0FBaUIsT0FBcEI7QUFDRSxNQUFBLElBQUMsQ0FBQSxNQUFNLENBQUMsU0FBUixHQUFvQixFQUFwQixDQURGO0tBVkE7QUFhQSxJQUFBLElBQUcsSUFBQyxDQUFBLE1BQU0sQ0FBQyxLQUFYO2FBQ0UsSUFBQyxDQUFBLFVBQUQsR0FBYyxJQUFDLENBQUEsTUFBTSxDQUFDLE1BRHhCO0tBZFU7RUFBQSxDQTlGZCxDQUFBOztBQUFBLG1CQStHQSxZQUFBLEdBQWMsU0FBQSxHQUFBO0FBQ1osUUFBQSwyQkFBQTtBQUFBLElBQUEsSUFBRyxJQUFDLENBQUEsTUFBSjtBQUNFLE1BQUEsS0FBQSxHQUFRLElBQUMsQ0FBQSxPQUFELENBQUEsQ0FBUixDQUFBO0FBQ0EsV0FBQSx5Q0FBQSxHQUFBO0FBQ0UsUUFBQSxZQUFBLEdBQWUsSUFBQyxDQUFBLFVBQVcsQ0FBQSxJQUFDLENBQUEsTUFBTSxDQUFDLEtBQVIsQ0FBZSxDQUFBLEdBQUEsQ0FBMUMsQ0FBQTtBQUNBLFFBQUEsSUFBRyxrQkFBSDtBQUNFLFVBQUEsQ0FBQSxHQUFJLEtBQU0sQ0FBQSxHQUFBLENBQVYsQ0FBQTtBQUFBLFVBQ0EsSUFBQyxDQUFBLE1BQU8sQ0FBQSxHQUFBLENBQVI7QUFBZSxvQkFBTyxZQUFQO0FBQUEsbUJBQ1IsS0FEUTt1QkFDRyxRQUFBLENBQVMsQ0FBVCxFQURIO0FBQUEsbUJBRVIsT0FGUTt1QkFFSyxVQUFBLENBQVcsQ0FBWCxFQUZMO0FBQUEsbUJBR1IsTUFIUTt1QkFHSSxTQUFBLENBQVUsQ0FBVixFQUhKO0FBQUE7dUJBSVIsRUFKUTtBQUFBO2NBRGYsQ0FERjtTQUZGO0FBQUEsT0FEQTtBQUFBLE1BWUEsSUFBQyxDQUFBLE9BQVEsQ0FBQSxJQUFDLENBQUEsTUFBTSxDQUFDLEtBQVIsQ0FBVCxHQUEwQixJQUFDLENBQUEsTUFaM0IsQ0FERjtLQUFBO1dBY0EsSUFBQyxDQUFBLE1BQUQsR0FBVSxLQWZFO0VBQUEsQ0EvR2QsQ0FBQTs7QUFBQSxtQkFnSUEsa0JBQUEsR0FBb0IsU0FBQyxJQUFELEdBQUE7QUFDbEIsSUFBQSxJQUFnQixDQUFBLElBQUssQ0FBQSxNQUFyQjtBQUFBLGFBQU8sS0FBUCxDQUFBO0tBQUE7QUFDQSxJQUFBLElBQWdCLENBQUEsSUFBSyxDQUFBLE1BQU0sQ0FBQyxLQUFaLEtBQXFCLElBQXJDO0FBQUEsYUFBTyxLQUFQLENBQUE7S0FEQTtBQUVBLFdBQU8sSUFBUCxDQUhrQjtFQUFBLENBaElwQixDQUFBOztBQUFBLG1CQXFJQSxTQUFBLEdBQVcsU0FBQSxHQUFBO0FBRVQsSUFBQSxJQUFHLENBQUEsSUFBSyxDQUFBLGdCQUFSO0FBQ0UsTUFBQSxJQUFDLENBQUEsS0FBRCxDQUFPLG1CQUFQLENBQUEsQ0FBQTtBQUNBLGFBQU8sS0FBUCxDQUZGO0tBQUE7QUFBQSxJQUdBLElBQUMsQ0FBQSxnQkFBRCxHQUFvQixLQUhwQixDQUFBO0FBQUEsSUFJQSxJQUFDLENBQUEsVUFBVSxDQUFDLElBQVosQ0FBaUI7QUFBQSxNQUFFLE1BQUEsRUFBUSxJQUFWO0tBQWpCLENBSkEsQ0FBQTtBQUtBLFdBQU8sSUFBUCxDQVBTO0VBQUEsQ0FySVgsQ0FBQTs7QUFBQSxtQkE4SUEsUUFBQSxHQUFVLFNBQUEsR0FBQTtBQUVSLFFBQUEsR0FBQTtBQUFBLElBQUEsSUFBQyxDQUFBLFlBQUQsQ0FBQSxDQUFBLENBQUE7QUFDQSxXQUFBLElBQUEsR0FBQTtBQUNFLE1BQUEsSUFBRyxJQUFDLENBQUEsVUFBVSxDQUFDLE1BQVosS0FBc0IsQ0FBekI7QUFDRSxRQUFBLElBQUMsQ0FBQSxLQUFELENBQU8sa0RBQVAsQ0FBQSxDQURGO09BQUE7QUFBQSxNQUVBLEdBQUEsR0FBTSxJQUFDLENBQUEsVUFBVyxDQUFBLElBQUMsQ0FBQSxVQUFVLENBQUMsTUFBWixHQUFxQixDQUFyQixDQUZsQixDQUFBO0FBR0EsTUFBQSxJQUFTLGtCQUFUO0FBQUEsY0FBQTtPQUhBO0FBQUEsTUFJQSxJQUFDLENBQUEsVUFBVSxDQUFDLEdBQVosQ0FBQSxDQUpBLENBREY7SUFBQSxDQURBO0FBQUEsSUFPQSxJQUFDLENBQUEsVUFBVSxDQUFDLEdBQVosQ0FBQSxDQVBBLENBQUE7QUFRQSxXQUFPLElBQVAsQ0FWUTtFQUFBLENBOUlWLENBQUE7O0FBQUEsbUJBMEpBLFlBQUEsR0FBYyxTQUFDLE9BQUQsR0FBQTtBQUNaLFFBQUEseURBQUE7QUFBQSxJQUFBLGNBQUEsR0FBaUIsSUFBQyxDQUFBLHNCQUFzQixDQUFDLElBQXhCLENBQTZCLE9BQTdCLENBQWpCLENBQUE7QUFBQSxJQUNBLENBQUEsR0FBSSxDQURKLENBQUE7QUFBQSxJQUVBLE1BQUEsR0FBUyxFQUZULENBQUE7QUFHQSxXQUFNLENBQUEsR0FBSSxPQUFPLENBQUMsTUFBbEIsR0FBQTtBQUNFLE1BQUEsQ0FBQSxHQUFJLE9BQVEsQ0FBQSxDQUFBLENBQVosQ0FBQTtBQUNBLE1BQUEsSUFBRyxDQUFBLEtBQUssR0FBUjtBQUNFLFFBQUEsTUFBQSxHQUFTLENBQUMsQ0FBQyxXQUFGLENBQUEsQ0FBVCxDQUFBO0FBQUEsUUFDQSxLQUFBLEdBQVE7QUFBQSxVQUFFLE1BQUEsRUFBUSxDQUFWO1NBRFIsQ0FBQTtBQUVBLFFBQUEsSUFBRyxJQUFDLENBQUEsV0FBVyxDQUFDLElBQWIsQ0FBa0IsQ0FBbEIsQ0FBSDtBQUNFLFVBQUEsS0FBSyxDQUFDLElBQU4sR0FBYSxNQUFiLENBREY7U0FGQTtBQUlBLFFBQUEsSUFBRyxjQUFIO0FBQ0UsVUFBQSxNQUFBLEdBQVMsQ0FBVCxDQUFBO0FBQ0EsaUJBQUEsSUFBQSxHQUFBO0FBQ0UsWUFBQSxJQUFBLEdBQU8sT0FBUSxDQUFBLENBQUEsR0FBRSxDQUFGLENBQWYsQ0FBQTtBQUNBLFlBQUEsSUFBRyxJQUFBLEtBQVEsTUFBWDtBQUNFLGNBQUEsTUFBQSxFQUFBLENBQUE7QUFBQSxjQUNBLENBQUEsRUFEQSxDQUFBO0FBRUEsY0FBQSxJQUFHLENBQUEsS0FBSyxPQUFPLENBQUMsTUFBaEI7QUFDRSxzQkFERjtlQUhGO2FBQUEsTUFBQTtBQU1FLG9CQU5GO2FBRkY7VUFBQSxDQURBO0FBQUEsVUFVQSxLQUFLLENBQUMsTUFBTixHQUFlLE1BVmYsQ0FERjtTQUpBO0FBQUEsUUFnQkEsTUFBTSxDQUFDLElBQVAsQ0FBWSxLQUFaLENBaEJBLENBREY7T0FEQTtBQUFBLE1BbUJBLENBQUEsRUFuQkEsQ0FERjtJQUFBLENBSEE7QUF3QkEsV0FBTztBQUFBLE1BQ0wsT0FBQSxFQUFTLE9BREo7QUFBQSxNQUVMLE1BQUEsRUFBUSxPQUFPLENBQUMsTUFGWDtBQUFBLE1BR0wsTUFBQSxFQUFRLE1BSEg7S0FBUCxDQXpCWTtFQUFBLENBMUpkLENBQUE7O0FBQUEsbUJBeUxBLGFBQUEsR0FBZSxTQUFDLE1BQUQsR0FBQTtBQUNiLFFBQUEsWUFBQTtBQUFBLElBQUEsR0FBQSxHQUFNLE1BQU8sQ0FBQSxDQUFBLENBQUUsQ0FBQyxXQUFWLENBQUEsQ0FBTixDQUFBO0FBQ0EsSUFBQSxJQUFHLEdBQUEsS0FBTyxPQUFWO0FBQ0UsTUFBQSxJQUFHLENBQUEsSUFBSyxDQUFBLEtBQUQsQ0FBTyxNQUFPLENBQUEsQ0FBQSxDQUFkLENBQVA7QUFDRSxlQUFPLEtBQVAsQ0FERjtPQURGO0tBQUEsTUFHSyxJQUFHLEdBQUEsS0FBTyxTQUFWO0FBQ0gsTUFBQSxJQUFDLENBQUEsZ0JBQUQsR0FBb0IsSUFBcEIsQ0FERztLQUFBLE1BRUEsSUFBRyxJQUFDLENBQUEsWUFBRCxDQUFjLEdBQWQsQ0FBSDtBQUNILE1BQUEsSUFBQyxDQUFBLFlBQUQsQ0FBYyxPQUFkLEVBQXVCLEdBQXZCLEVBQTRCLE9BQTVCLEVBQXFDLE1BQU8sQ0FBQSxDQUFBLENBQTVDLENBQUEsQ0FERztLQUFBLE1BRUEsSUFBRyxHQUFBLEtBQU8sU0FBVjtBQUNILE1BQUEsSUFBRyxDQUFBLENBQUssSUFBQyxDQUFBLGtCQUFELENBQW9CLE1BQXBCLENBQUEsSUFBK0IsSUFBQyxDQUFBLGtCQUFELENBQW9CLE9BQXBCLENBQWhDLENBQVA7QUFDRSxRQUFBLElBQUMsQ0FBQSxLQUFELENBQU8sNEJBQVAsQ0FBQSxDQUFBO0FBQ0EsZUFBTyxLQUFQLENBRkY7T0FBQTtBQUFBLE1BSUEsT0FBQSxHQUFVLElBQUMsQ0FBQSxZQUFELENBQWMsTUFBTyxDQUFBLENBQUEsQ0FBckIsQ0FKVixDQUFBO0FBQUEsTUFLQSxPQUFPLENBQUMsR0FBUixHQUFjLE1BQU8sQ0FBQSxDQUFBLENBTHJCLENBQUE7QUFBQSxNQU1BLElBQUMsQ0FBQSxNQUFNLENBQUMsU0FBUyxDQUFDLElBQWxCLENBQXVCLE9BQXZCLENBTkEsQ0FERztLQUFBLE1BUUEsSUFBRyxHQUFBLEtBQU8sTUFBVjtBQUNILE1BQUEsSUFBQyxDQUFBLFVBQVcsQ0FBQSxJQUFDLENBQUEsVUFBVSxDQUFDLE1BQVosR0FBcUIsQ0FBckIsQ0FBd0IsQ0FBQSxHQUFBLENBQXBDLEdBQ0U7QUFBQSxRQUFBLENBQUEsRUFBRyxVQUFBLENBQVcsTUFBTyxDQUFBLENBQUEsQ0FBbEIsQ0FBSDtBQUFBLFFBQ0EsQ0FBQSxFQUFHLFVBQUEsQ0FBVyxNQUFPLENBQUEsQ0FBQSxDQUFsQixDQURIO0FBQUEsUUFFQSxDQUFBLEVBQUcsVUFBQSxDQUFXLE1BQU8sQ0FBQSxDQUFBLENBQWxCLENBRkg7QUFBQSxRQUdBLENBQUEsRUFBRyxVQUFBLENBQVcsTUFBTyxDQUFBLENBQUEsQ0FBbEIsQ0FISDtPQURGLENBREc7S0FBQSxNQU1BLElBQUcsR0FBQSxLQUFPLFFBQVY7QUFDSCxNQUFBLElBQUMsQ0FBQSxVQUFXLENBQUEsSUFBQyxDQUFBLFVBQVUsQ0FBQyxNQUFaLEdBQXFCLENBQXJCLENBQXdCLENBQUEsR0FBQSxDQUFwQyxHQUNFO0FBQUEsUUFBQSxLQUFBLEVBQU8sUUFBQSxDQUFTLE1BQU8sQ0FBQSxDQUFBLENBQWhCLENBQVA7QUFBQSxRQUNBLEtBQUEsRUFBTyxVQUFBLENBQVcsTUFBTyxDQUFBLENBQUEsQ0FBbEIsQ0FEUDtPQURGLENBREc7S0FBQSxNQUFBO0FBTUgsTUFBQSxJQUFHLElBQUMsQ0FBQSxzQkFBc0IsQ0FBQyxJQUF4QixDQUE2QixHQUE3QixDQUFIO0FBQ0UsUUFBQSxJQUFDLENBQUEsS0FBRCxDQUFPLCtDQUFQLENBQUEsQ0FBQTtBQUNBLGVBQU8sS0FBUCxDQUZGO09BQUE7QUFBQSxNQUdBLElBQUMsQ0FBQSxVQUFXLENBQUEsSUFBQyxDQUFBLFVBQVUsQ0FBQyxNQUFaLEdBQXFCLENBQXJCLENBQXdCLENBQUEsR0FBQSxDQUFwQyxHQUEyQyxNQUFPLENBQUEsQ0FBQSxDQUhsRCxDQU5HO0tBdEJMO0FBaUNBLFdBQU8sSUFBUCxDQWxDYTtFQUFBLENBekxmLENBQUE7O0FBQUEsbUJBNk5BLEtBQUEsR0FBTyxTQUFDLElBQUQsR0FBQTtBQUNMLFFBQUEscUtBQUE7QUFBQSxJQUFBLEtBQUEsR0FBUSxJQUFJLENBQUMsS0FBTCxDQUFXLElBQVgsQ0FBUixDQUFBO0FBQUEsSUFDQSxJQUFDLENBQUEsTUFBRCxHQUFVLENBRFYsQ0FBQTtBQUVBLFNBQUEsNENBQUE7dUJBQUE7QUFDRSxNQUFBLElBQUMsQ0FBQSxNQUFELEVBQUEsQ0FBQTtBQUFBLE1BQ0EsSUFBQSxHQUFPLElBQUksQ0FBQyxPQUFMLENBQWEsZ0JBQWIsRUFBOEIsRUFBOUIsQ0FEUCxDQUFBO0FBQUEsTUFFQSxJQUFBLEdBQU8sSUFBQyxDQUFBLFlBQVksQ0FBQyxJQUFkLENBQW1CLElBQW5CLENBQXlCLENBQUEsQ0FBQSxDQUZoQyxDQUFBO0FBR0EsTUFBQSxJQUFZLElBQUMsQ0FBQSxtQkFBbUIsQ0FBQyxJQUFyQixDQUEwQixJQUExQixDQUFaO0FBQUEsaUJBQUE7T0FIQTtBQUFBLE1BSUEsT0FBd0IsSUFBQyxDQUFBLFdBQVcsQ0FBQyxJQUFiLENBQWtCLElBQWxCLENBQXhCLEVBQUMsV0FBRCxFQUFJLG9CQUFKLEVBQWdCLGNBSmhCLENBQUE7QUFBQSxNQUtBLE1BQUEsR0FBUyxXQUFBLENBQVksVUFBWixDQUxULENBQUE7QUFBQSxNQU1BLFFBQUEsR0FBVyxFQU5YLENBQUE7QUFBQSxNQVFBLGFBQUEsR0FBZ0IsSUFBSSxDQUFDLEtBQUwsQ0FBVyxVQUFYLENBUmhCLENBQUE7QUFTQSxXQUFBLHNEQUFBO3lDQUFBO0FBQ0UsUUFBQSxZQUFBLEdBQWUsWUFBWSxDQUFDLEtBQWIsQ0FBbUIsU0FBbkIsQ0FBZixDQUFBO0FBQ0EsYUFBQSxxREFBQTt5Q0FBQTtBQUNFLFVBQUEsUUFBUSxDQUFDLElBQVQsQ0FBYztBQUFBLFlBQ1YsTUFBQSxFQUFRLE1BREU7QUFBQSxZQUVWLElBQUEsRUFBTSxXQUZJO1dBQWQsQ0FBQSxDQURGO0FBQUEsU0FEQTtBQUFBLFFBTUEsTUFBQSxJQUFVLElBTlYsQ0FERjtBQUFBLE9BVEE7QUFrQkEsV0FBQSxpREFBQTsyQkFBQTtBQUVFLFFBQUEsU0FBQSxHQUFZLElBQUMsQ0FBQSxXQUFXLENBQUMsR0FBYixDQUFBLENBQVosQ0FBQTtBQUNBLFFBQUEsSUFBRyxHQUFHLENBQUMsTUFBSixLQUFjLFNBQWpCO0FBQUE7U0FBQSxNQUVLLElBQUcsR0FBRyxDQUFDLE1BQUosR0FBYSxTQUFoQjtBQUNILFVBQUEsSUFBQyxDQUFBLFdBQVcsQ0FBQyxJQUFiLENBQWtCLEdBQUcsQ0FBQyxNQUF0QixDQUFBLENBQUE7QUFDQSxVQUFBLElBQUcsQ0FBQSxJQUFLLENBQUEsU0FBRCxDQUFBLENBQVA7QUFDRSxtQkFBTyxLQUFQLENBREY7V0FGRztTQUFBLE1BSUEsSUFBRyxDQUFDLEdBQUcsQ0FBQyxNQUFKLEdBQWEsSUFBZCxDQUFBLElBQXdCLENBQUMsU0FBQSxJQUFhLElBQWQsQ0FBM0I7QUFFSCxVQUFBLElBQUMsQ0FBQSxXQUFXLENBQUMsVUFBYixDQUF3QixHQUFHLENBQUMsTUFBNUIsQ0FBQSxDQUZHO1NBQUEsTUFBQTtBQUlILGlCQUFBLElBQUEsR0FBQTtBQUNFLFlBQUEsSUFBRyxDQUFBLElBQUssQ0FBQSxXQUFXLENBQUMsR0FBYixDQUFBLENBQVA7QUFDRSxjQUFBLElBQUMsQ0FBQSxHQUFHLENBQUMsS0FBTCxDQUFZLG9CQUFBLEdBQW1CLEdBQUcsQ0FBQyxNQUF2QixHQUErQixXQUEvQixHQUF5QyxJQUFDLENBQUEsTUFBMUMsR0FBa0QsSUFBbEQsR0FBcUQsR0FBRyxDQUFDLElBQXJFLENBQUEsQ0FBQTtBQUNBLHFCQUFPLEtBQVAsQ0FGRjthQUFBO0FBR0EsWUFBQSxJQUFHLENBQUEsSUFBSyxDQUFBLFFBQUQsQ0FBQSxDQUFQO0FBQ0UscUJBQU8sS0FBUCxDQURGO2FBSEE7QUFLQSxZQUFBLElBQVksSUFBQyxDQUFBLFdBQVcsQ0FBQyxHQUFiLENBQUEsQ0FBQSxJQUFzQixJQUFsQztBQUFBLHVCQUFBO2FBTEE7QUFNQSxZQUFBLElBQVMsSUFBQyxDQUFBLFdBQVcsQ0FBQyxHQUFiLENBQUEsQ0FBQSxLQUFzQixHQUFHLENBQUMsTUFBbkM7QUFBQSxvQkFBQTthQVBGO1VBQUEsQ0FKRztTQVBMO0FBb0JBLFFBQUEsSUFBRyxDQUFBLElBQUssQ0FBQSxhQUFELENBQWUsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFULENBQWUsS0FBZixDQUFmLENBQVA7QUFDRSxpQkFBTyxLQUFQLENBREY7U0F0QkY7QUFBQSxPQW5CRjtBQUFBLEtBRkE7QUE4Q0EsV0FBTSxJQUFDLENBQUEsV0FBVyxDQUFDLEdBQWIsQ0FBQSxDQUFOLEdBQUE7QUFDRSxNQUFBLElBQUMsQ0FBQSxRQUFELENBQUEsQ0FBQSxDQURGO0lBQUEsQ0E5Q0E7QUFBQSxJQWlEQSxJQUFDLENBQUEsWUFBRCxDQUFBLENBakRBLENBQUE7QUFrREEsV0FBTyxJQUFQLENBbkRLO0VBQUEsQ0E3TlAsQ0FBQTs7Z0JBQUE7O0lBekVGLENBQUE7O0FBQUE7QUF3V2UsRUFBQSxrQkFBRSxHQUFGLEVBQVEsVUFBUixFQUFxQixjQUFyQixFQUFzQyxPQUF0QyxHQUFBO0FBQ1gsSUFEWSxJQUFDLENBQUEsTUFBQSxHQUNiLENBQUE7QUFBQSxJQURrQixJQUFDLENBQUEsYUFBQSxVQUNuQixDQUFBO0FBQUEsSUFEK0IsSUFBQyxDQUFBLGlCQUFBLGNBQ2hDLENBQUE7QUFBQSxJQURnRCxJQUFDLENBQUEsVUFBQSxPQUNqRCxDQUFBO0FBQUEsSUFBQSxJQUFDLENBQUEsVUFBRCxHQUFjLEVBQWQsQ0FEVztFQUFBLENBQWI7O0FBQUEscUJBR0EsS0FBQSxHQUFPLFNBQUMsSUFBRCxHQUFBO1dBQ0wsSUFBQyxDQUFBLEdBQUcsQ0FBQyxLQUFMLENBQVksZ0JBQUEsR0FBZSxJQUEzQixFQURLO0VBQUEsQ0FIUCxDQUFBOztBQUFBLHFCQU1BLGdCQUFBLEdBQWtCLFNBQUMsSUFBRCxFQUFPLE1BQVAsR0FBQTtBQUNoQixRQUFBLHFIQUFBO0FBQUEsSUFBQSxRQUFBLEdBQVcsS0FBQSxDQUFNLE1BQU4sQ0FBWCxDQUFBO0FBQUEsSUFDQSxJQUFBLEdBQU8sSUFBSSxDQUFDLEtBQUwsQ0FBVyxJQUFJLENBQUMsQ0FBTCxHQUFTLE1BQXBCLENBRFAsQ0FBQTtBQUFBLElBRUEsSUFBQSxHQUFPLElBQUksQ0FBQyxLQUFMLENBQVcsSUFBSSxDQUFDLENBQUwsR0FBUyxNQUFwQixDQUZQLENBQUE7QUFBQSxJQUdBLElBQUEsR0FBTyxJQUFJLENBQUMsS0FBTCxDQUFXLElBQUksQ0FBQyxDQUFMLEdBQVMsTUFBcEIsQ0FIUCxDQUFBO0FBQUEsSUFJQSxTQUFBLEdBQVksSUFKWixDQUFBO0FBQUEsSUFLQSxRQUFBLEdBQVcsSUFBQSxHQUFPLElBTGxCLENBQUE7QUFBQSxJQU1BLFVBQUEsR0FBYSxJQUFBLEdBQU8sSUFOcEIsQ0FBQTtBQUFBLElBT0EsVUFBQSxHQUFhLE1BQUEsR0FBUyxJQVB0QixDQUFBO0FBQUEsSUFRQSxPQUFBLEdBQVUsSUFBSSxDQUFDLENBUmYsQ0FBQTtBQUFBLElBU0EsZ0JBQUEsR0FBbUIsR0FBQSxHQUFNLE9BVHpCLENBQUE7QUFVQSxTQUFTLDhGQUFULEdBQUE7QUFFRSxNQUFBLFFBQVMsQ0FBQSxDQUFBLENBQVQsR0FBYyxDQUFBLEdBQUksU0FBbEIsQ0FGRjtBQUFBLEtBVkE7QUFhQSxTQUFTLDBGQUFULEdBQUE7QUFFRSxNQUFBLFFBQVMsQ0FBQSxJQUFBLEdBQU8sQ0FBUCxDQUFULEdBQXFCLEdBQUEsR0FBTSxDQUFDLGdCQUFBLEdBQW1CLENBQUMsQ0FBQSxHQUFJLFFBQUwsQ0FBcEIsQ0FBM0IsQ0FGRjtBQUFBLEtBYkE7QUFnQkEsU0FBUyxrR0FBVCxHQUFBO0FBRUUsTUFBQSxRQUFTLENBQUEsSUFBQSxHQUFPLENBQVAsQ0FBVCxHQUFxQixPQUFyQixDQUZGO0FBQUEsS0FoQkE7QUFtQkEsU0FBUyxrR0FBVCxHQUFBO0FBRUUsTUFBQSxRQUFTLENBQUEsSUFBQSxHQUFPLENBQVAsQ0FBVCxHQUFxQixPQUFBLEdBQVUsQ0FBQyxPQUFBLEdBQVUsQ0FBQyxDQUFBLEdBQUksVUFBTCxDQUFYLENBQS9CLENBRkY7QUFBQSxLQW5CQTtBQXNCQSxXQUFPLFFBQVAsQ0F2QmdCO0VBQUEsQ0FObEIsQ0FBQTs7QUFBQSxxQkErQkEsVUFBQSxHQUFZLFNBQUMsT0FBRCxFQUFVLFNBQVYsR0FBQTtBQUNWLFFBQUEsNkVBQUE7QUFBQSxJQUFBLE1BQUEsR0FBUyxDQUFULENBQUE7QUFBQSxJQUNBLFNBQUEsR0FBWSxLQURaLENBQUE7QUFFQSxJQUFBLElBQUcsU0FBUyxDQUFDLE1BQVYsR0FBbUIsQ0FBdEI7QUFDRSxNQUFBLE1BQUEsR0FBUyxTQUFTLENBQUMsTUFBbkIsQ0FERjtLQUFBLE1BQUE7QUFHRSxNQUFBLE1BQUEsR0FBUyxJQUFJLENBQUMsS0FBTCxDQUFXLE9BQU8sQ0FBQyxRQUFSLEdBQW1CLElBQUMsQ0FBQSxVQUFwQixHQUFpQyxJQUE1QyxDQUFULENBSEY7S0FGQTtBQUFBLElBTUEsT0FBQSxHQUFVLEtBQUEsQ0FBTSxNQUFOLENBTlYsQ0FBQTtBQUFBLElBT0EsQ0FBQSxHQUFJLEdBUEosQ0FBQTtBQUFBLElBUUEsQ0FBQSxHQUFJLEdBUkosQ0FBQTtBQVNBLElBQUEsSUFBRyxzQkFBSDtBQUNFLE1BQUEsSUFBQSxHQUFPLFFBQUEsQ0FBUyxPQUFPLENBQUMsTUFBakIsRUFBeUIsU0FBUyxDQUFDLElBQW5DLENBQVAsQ0FERjtLQUFBLE1BRUssSUFBRyxvQkFBSDtBQUNILE1BQUEsSUFBQSxHQUFPLE9BQU8sQ0FBQyxJQUFmLENBREc7S0FBQSxNQUFBO0FBR0gsTUFBQSxJQUFBLEdBQU8sUUFBQSxDQUFTLE9BQU8sQ0FBQyxNQUFqQixFQUF5QixPQUFPLENBQUMsSUFBakMsQ0FBUCxDQUhHO0tBWEw7QUFBQSxJQWVBLFFBQUEsR0FBVyxJQUFDLENBQUEsZ0JBQUQsQ0FBa0IsT0FBTyxDQUFDLElBQTFCLEVBQWdDLE1BQWhDLENBZlgsQ0FBQTtBQWdCQSxTQUFTLGtGQUFULEdBQUE7QUFDRSxNQUFBLE1BQUEsR0FBUyxJQUFDLENBQUEsVUFBRCxHQUFjLElBQXZCLENBQUE7QUFBQSxNQUNBLElBQUEsR0FBTyxJQUFJLENBQUMsR0FBTCxDQUFTLE1BQUEsR0FBUyxDQUFBLEdBQUksTUFBSixHQUFhLENBQWIsR0FBaUIsSUFBSSxDQUFDLEVBQXhDLENBRFAsQ0FBQTtBQUFBLE1BSUEsT0FBUSxDQUFBLENBQUEsQ0FBUixHQUFhLElBQUEsR0FBTyxTQUFQLEdBQW1CLFFBQVMsQ0FBQSxDQUFBLENBSnpDLENBREY7QUFBQSxLQWhCQTtBQXVCQSxXQUFPO0FBQUEsTUFDTCxPQUFBLEVBQVMsT0FESjtBQUFBLE1BRUwsTUFBQSxFQUFRLE9BQU8sQ0FBQyxNQUZYO0tBQVAsQ0F4QlU7RUFBQSxDQS9CWixDQUFBOztBQUFBLHFCQTREQSxZQUFBLEdBQWMsU0FBQyxTQUFELEVBQVksU0FBWixHQUFBO0FBQ1osUUFBQSw0RkFBQTtBQUFBLElBQUEsSUFBQSxHQUFPLElBQVAsQ0FBQTtBQUVBLElBQUEsSUFBRyxJQUFDLENBQUEsY0FBSjtBQUNFLE1BQUEsSUFBQSxHQUFPLEVBQUUsQ0FBQyxZQUFILENBQWdCLFNBQVMsQ0FBQyxHQUExQixDQUFQLENBQUE7QUFBQSxNQUNBLElBQUEsR0FBVyxJQUFBLFNBQUEsQ0FBVSxJQUFWLEVBQWdCLENBQWhCLEVBQW1CLElBQUksQ0FBQyxNQUF4QixFQUFnQyxJQUFoQyxDQURYLENBREY7S0FBQSxNQUFBO0FBSUUsTUFBQSxDQUFDLENBQUMsSUFBRixDQUFPO0FBQUEsUUFDTCxHQUFBLEVBQUssU0FBUyxDQUFDLEdBRFY7QUFBQSxRQUVMLFFBQUEsRUFBVSxvQ0FGTDtBQUFBLFFBR0wsT0FBQSxFQUFTLFNBQUMsSUFBRCxHQUFBO2lCQUNQLElBQUEsR0FBVyxJQUFBLFNBQUEsQ0FBVSxJQUFWLEVBQWdCLENBQWhCLEVBQW1CLElBQUksQ0FBQyxNQUF4QixFQUFnQyxJQUFoQyxFQURKO1FBQUEsQ0FISjtBQUFBLFFBS0wsS0FBQSxFQUFPLEtBTEY7T0FBUCxDQUFBLENBSkY7S0FGQTtBQWNBLElBQUEsSUFBRyxDQUFBLElBQUg7QUFDRSxhQUFPO0FBQUEsUUFDTCxPQUFBLEVBQVMsRUFESjtBQUFBLFFBRUwsTUFBQSxFQUFRLENBRkg7T0FBUCxDQURGO0tBZEE7QUFBQSxJQXFCQSxJQUFJLENBQUMsSUFBTCxDQUFVLEVBQVYsQ0FyQkEsQ0FBQTtBQUFBLElBc0JBLGFBQUEsR0FBZ0IsSUFBSSxDQUFDLFFBQUwsQ0FBQSxDQXRCaEIsQ0FBQTtBQUFBLElBdUJBLE9BQUEsR0FBVSxFQXZCVixDQUFBO0FBd0JBLFdBQU0sSUFBSSxDQUFDLElBQUwsQ0FBQSxDQUFBLEdBQVksQ0FBWixHQUFnQixJQUFJLENBQUMsVUFBM0IsR0FBQTtBQUNFLE1BQUEsT0FBTyxDQUFDLElBQVIsQ0FBYSxJQUFJLENBQUMsUUFBTCxDQUFBLENBQWIsQ0FBQSxDQURGO0lBQUEsQ0F4QkE7QUEyQkEsSUFBQSxJQUFHLENBQUMsd0JBQUEsSUFBb0IsQ0FBQyxTQUFTLENBQUMsSUFBVixLQUFrQixTQUFTLENBQUMsT0FBN0IsQ0FBckIsQ0FBQSxJQUErRCxDQUFDLFNBQVMsQ0FBQyxNQUFWLEtBQW9CLFNBQVMsQ0FBQyxTQUEvQixDQUFsRTtBQUNFLE1BQUEsT0FBQSxHQUFVLFFBQUEsQ0FBUyxTQUFTLENBQUMsU0FBbkIsRUFBOEIsU0FBUyxDQUFDLE9BQXhDLENBQVYsQ0FBQTtBQUFBLE1BQ0EsT0FBQSxHQUFVLFFBQUEsQ0FBUyxTQUFTLENBQUMsTUFBbkIsRUFBMkIsU0FBUyxDQUFDLElBQXJDLENBRFYsQ0FBQTtBQUFBLE1BR0EsTUFBQSxHQUFTLE9BQUEsR0FBVSxPQUhuQixDQUFBO0FBQUEsTUFPQSxRQUFBLEdBQVcsSUFBSSxDQUFDLEtBQUwsQ0FBVyxPQUFPLENBQUMsTUFBUixHQUFpQixNQUE1QixDQVBYLENBQUE7QUFBQSxNQVFBLFNBQUEsR0FBWSxLQUFBLENBQU0sUUFBTixDQVJaLENBQUE7QUFTQSxXQUFTLDBGQUFULEdBQUE7QUFDRSxRQUFBLFNBQVUsQ0FBQSxDQUFBLENBQVYsR0FBZSxDQUFmLENBREY7QUFBQSxPQVRBO0FBV0EsV0FBUywwRkFBVCxHQUFBO0FBQ0UsUUFBQSxTQUFVLENBQUEsQ0FBQSxDQUFWLEdBQWUsT0FBUSxDQUFBLElBQUksQ0FBQyxLQUFMLENBQVcsQ0FBQSxHQUFJLE1BQWYsQ0FBQSxDQUF2QixDQURGO0FBQUEsT0FYQTtBQWNBLGFBQU87QUFBQSxRQUNMLE9BQUEsRUFBUyxTQURKO0FBQUEsUUFFTCxNQUFBLEVBQVEsU0FBUyxDQUFDLE1BRmI7T0FBUCxDQWZGO0tBQUEsTUFBQTtBQW9CRSxhQUFPO0FBQUEsUUFDTCxPQUFBLEVBQVMsT0FESjtBQUFBLFFBRUwsTUFBQSxFQUFRLE9BQU8sQ0FBQyxNQUZYO09BQVAsQ0FwQkY7S0E1Qlk7RUFBQSxDQTVEZCxDQUFBOztBQUFBLHFCQWlIQSxVQUFBLEdBQVksU0FBQyxPQUFELEdBQUE7QUFDVixRQUFBLGtUQUFBO0FBQUEsSUFBQSxTQUFBLEdBQVksQ0FBWixDQUFBO0FBQ0E7QUFBQSxTQUFBLDJDQUFBO3lCQUFBO0FBQ0UsTUFBQSxJQUFHLFNBQUEsR0FBWSxPQUFPLENBQUMsTUFBdkI7QUFDRSxRQUFBLFNBQUEsR0FBWSxPQUFPLENBQUMsTUFBcEIsQ0FERjtPQURGO0FBQUEsS0FEQTtBQUFBLElBS0EsY0FBQSxHQUFpQixJQUFDLENBQUEsVUFBRCxHQUFjLENBQUMsT0FBTyxDQUFDLEdBQVIsR0FBYyxFQUFmLENBQWQsR0FBbUMsT0FBTyxDQUFDLEtBTDVELENBQUE7QUFBQSxJQU1BLFdBQUEsR0FBYyxjQUFBLEdBQWlCLFNBTi9CLENBQUE7QUFBQSxJQU9BLGNBQUEsR0FBaUIsV0FQakIsQ0FBQTtBQVNBO0FBQUEsU0FBQSw4Q0FBQTswQkFBQTtBQUNFLE1BQUEsWUFBQSxHQUFlLE9BQU8sQ0FBQyxNQUFSLEdBQWlCLEVBQWhDLENBQUE7QUFBQSxNQUNBLFlBQUEsR0FBZSxJQUFJLENBQUMsS0FBTCxDQUFXLFdBQUEsR0FBYyxFQUFkLEdBQW1CLFlBQTlCLENBRGYsQ0FBQTtBQUVBO0FBQUEsV0FBQSw4Q0FBQTswQkFBQTtBQUNFLFFBQUEsU0FBQSxHQUFZLEVBQVosQ0FBQTtBQUNBLFFBQUEsSUFBRyxLQUFLLENBQUMsTUFBTixHQUFlLENBQWxCO0FBQ0UsVUFBQSxTQUFTLENBQUMsTUFBVixHQUFtQixLQUFLLENBQUMsTUFBTixHQUFlLFlBQWxDLENBREY7U0FEQTtBQUdBLFFBQUEsSUFBRyxrQkFBSDtBQUNFLFVBQUEsU0FBUyxDQUFDLElBQVYsR0FBaUIsS0FBSyxDQUFDLElBQXZCLENBREY7U0FIQTtBQUFBLFFBS0EsS0FBSyxDQUFDLE9BQU4sR0FBZ0IsSUFBQyxDQUFBLE1BQUQsQ0FBUSxPQUFPLENBQUMsR0FBaEIsRUFBcUIsU0FBckIsQ0FMaEIsQ0FBQTtBQUFBLFFBTUEsR0FBQSxHQUFNLENBQUMsS0FBSyxDQUFDLE1BQU4sR0FBZSxZQUFoQixDQUFBLEdBQWdDLEtBQUssQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BTjVELENBQUE7QUFPQSxRQUFBLElBQUcsY0FBQSxHQUFpQixHQUFwQjtBQUNFLFVBQUEsY0FBQSxHQUFpQixHQUFqQixDQURGO1NBUkY7QUFBQSxPQUhGO0FBQUEsS0FUQTtBQUFBLElBdUJBLE9BQUEsR0FBVSxLQUFBLENBQU0sY0FBTixDQXZCVixDQUFBO0FBd0JBLFNBQVMsa0hBQVQsR0FBQTtBQUNFLE1BQUEsT0FBUSxDQUFBLENBQUEsQ0FBUixHQUFhLENBQWIsQ0FERjtBQUFBLEtBeEJBO0FBMkJBO0FBQUEsU0FBQSw4Q0FBQTswQkFBQTtBQUNFLE1BQUEsWUFBQSxHQUFlLE9BQU8sQ0FBQyxNQUFSLEdBQWlCLEVBQWhDLENBQUE7QUFBQSxNQUNBLFlBQUEsR0FBZSxJQUFJLENBQUMsS0FBTCxDQUFXLFdBQUEsR0FBYyxFQUFkLEdBQW1CLFlBQTlCLENBRGYsQ0FBQTtBQUFBLE1BR0EsY0FBQSxHQUFpQixLQUFBLENBQU0sY0FBTixDQUhqQixDQUFBO0FBSUEsV0FBUyxrSEFBVCxHQUFBO0FBQ0UsUUFBQSxjQUFlLENBQUEsQ0FBQSxDQUFmLEdBQW9CLENBQXBCLENBREY7QUFBQSxPQUpBO0FBT0E7QUFBQSxXQUFBLDhDQUFBOzBCQUFBO0FBQ0UsUUFBQSxRQUFBLEdBQVcsS0FBSyxDQUFDLE9BQWpCLENBQUE7QUFBQSxRQUVBLEdBQUEsR0FBTSxJQUFDLENBQUEsU0FBRCxDQUFXLE9BQU8sQ0FBQyxHQUFuQixDQUZOLENBQUE7QUFBQSxRQUdBLE1BQUEsR0FBUyxLQUFLLENBQUMsTUFBTixHQUFlLFlBSHhCLENBQUE7QUFBQSxRQUlBLE9BQUEsR0FBVSxRQUFRLENBQUMsT0FBTyxDQUFDLE1BSjNCLENBQUE7QUFLQSxRQUFBLElBQUcsQ0FBQyxNQUFBLEdBQVMsT0FBVixDQUFBLEdBQXFCLGNBQXhCO0FBQ0UsVUFBQSxPQUFBLEdBQVUsY0FBQSxHQUFpQixNQUEzQixDQURGO1NBTEE7QUFRQSxRQUFBLElBQUcsR0FBRyxDQUFDLElBQVA7QUFDRSxVQUFBLFFBQUEsR0FBVyxHQUFYLENBQUE7QUFDQSxVQUFBLElBQUcsTUFBQSxHQUFTLFFBQVo7QUFDRSxpQkFBUywwRkFBVCxHQUFBO0FBQ0UsY0FBQSxDQUFBLEdBQUksY0FBZSxDQUFBLE1BQUEsR0FBUyxRQUFULEdBQW9CLENBQXBCLENBQW5CLENBQUE7QUFBQSxjQUNBLGNBQWUsQ0FBQSxNQUFBLEdBQVMsUUFBVCxHQUFvQixDQUFwQixDQUFmLEdBQXdDLElBQUksQ0FBQyxLQUFMLENBQVcsQ0FBQSxHQUFJLENBQUMsQ0FBQyxRQUFBLEdBQVcsQ0FBWixDQUFBLEdBQWlCLFFBQWxCLENBQWYsQ0FEeEMsQ0FERjtBQUFBLGFBREY7V0FEQTtBQUtBLGVBQVMsaUlBQVQsR0FBQTtBQUVFLFlBQUEsY0FBZSxDQUFBLENBQUEsQ0FBZixHQUFvQixDQUFwQixDQUZGO0FBQUEsV0FMQTtBQVFBLGVBQVMsc0ZBQVQsR0FBQTtBQUNFLFlBQUEsY0FBZSxDQUFBLE1BQUEsR0FBUyxDQUFULENBQWYsR0FBNkIsUUFBUSxDQUFDLE9BQVEsQ0FBQSxDQUFBLENBQTlDLENBREY7QUFBQSxXQVRGO1NBQUEsTUFBQTtBQVlFLGVBQVMsc0ZBQVQsR0FBQTtBQUNFLFlBQUEsY0FBZSxDQUFBLE1BQUEsR0FBUyxDQUFULENBQWYsSUFBOEIsUUFBUSxDQUFDLE9BQVEsQ0FBQSxDQUFBLENBQS9DLENBREY7QUFBQSxXQVpGO1NBVEY7QUFBQSxPQVBBO0FBZ0NBLFdBQVMsa0hBQVQsR0FBQTtBQUNFLFFBQUEsT0FBUSxDQUFBLENBQUEsQ0FBUixJQUFjLGNBQWUsQ0FBQSxDQUFBLENBQTdCLENBREY7QUFBQSxPQWpDRjtBQUFBLEtBM0JBO0FBK0RBLFdBQU87QUFBQSxNQUNMLE9BQUEsRUFBUyxPQURKO0FBQUEsTUFFTCxNQUFBLEVBQVEsV0FGSDtLQUFQLENBaEVVO0VBQUEsQ0FqSFosQ0FBQTs7QUFBQSxxQkFzTEEsV0FBQSxHQUFhLFNBQUMsUUFBRCxHQUFBO0FBQ1gsUUFBQSx5T0FBQTtBQUFBLElBQUEsVUFBQSxHQUFhLENBQWIsQ0FBQTtBQUNBO0FBQUEsU0FBQSwyQ0FBQTt5QkFBQTtBQUNFLE1BQUEsSUFBRyxVQUFBLEdBQWEsT0FBTyxDQUFDLE9BQU8sQ0FBQyxNQUFoQztBQUNFLFFBQUEsVUFBQSxHQUFhLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBN0IsQ0FERjtPQURGO0FBQUEsS0FEQTtBQUFBLElBS0EsV0FBQSxHQUFjLENBTGQsQ0FBQTtBQUFBLElBTUEsY0FBQSxHQUFpQixDQU5qQixDQUFBO0FBQUEsSUFPQSxnQkFBQSxHQUFtQixLQUFBLENBQU0sVUFBTixDQVBuQixDQUFBO0FBQUEsSUFRQSxtQkFBQSxHQUFzQixLQUFBLENBQU0sVUFBTixDQVJ0QixDQUFBO0FBU0EsU0FBa0Isb0hBQWxCLEdBQUE7QUFDRSxNQUFBLGdCQUFpQixDQUFBLFVBQUEsQ0FBakIsR0FBK0IsQ0FBL0IsQ0FBQTtBQUFBLE1BQ0EsbUJBQW9CLENBQUEsVUFBQSxDQUFwQixHQUFrQyxDQURsQyxDQUFBO0FBRUE7QUFBQSxXQUFBLDhDQUFBOzRCQUFBO0FBQ0UsUUFBQSxJQUFHLENBQUMsVUFBQSxHQUFhLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBOUIsQ0FBQSxJQUEwQyxDQUFDLE9BQU8sQ0FBQyxPQUFRLENBQUEsVUFBQSxDQUFoQixLQUErQixHQUFoQyxDQUE3QztBQUNFLFVBQUEsUUFBQSxHQUFXLElBQUMsQ0FBQSxNQUFELENBQVEsT0FBTyxDQUFDLEdBQWhCLENBQVgsQ0FBQTtBQUNBLFVBQUEsSUFBRyxnQkFBaUIsQ0FBQSxVQUFBLENBQWpCLEdBQStCLFFBQVEsQ0FBQyxNQUEzQztBQUNFLFlBQUEsZ0JBQWlCLENBQUEsVUFBQSxDQUFqQixHQUErQixRQUFRLENBQUMsTUFBeEMsQ0FERjtXQURBO0FBR0EsVUFBQSxJQUFHLG1CQUFvQixDQUFBLFVBQUEsQ0FBcEIsR0FBa0MsUUFBUSxDQUFDLE9BQU8sQ0FBQyxNQUF0RDtBQUNFLFlBQUEsbUJBQW9CLENBQUEsVUFBQSxDQUFwQixHQUFrQyxRQUFRLENBQUMsT0FBTyxDQUFDLE1BQW5ELENBREY7V0FKRjtTQURGO0FBQUEsT0FGQTtBQUFBLE1BU0EsaUJBQUEsR0FBb0IsV0FBQSxHQUFjLG1CQUFvQixDQUFBLFVBQUEsQ0FUdEQsQ0FBQTtBQVVBLE1BQUEsSUFBRyxjQUFBLEdBQWlCLGlCQUFwQjtBQUNFLFFBQUEsY0FBQSxHQUFpQixpQkFBakIsQ0FERjtPQVZBO0FBQUEsTUFZQSxXQUFBLElBQWUsZ0JBQWlCLENBQUEsVUFBQSxDQVpoQyxDQURGO0FBQUEsS0FUQTtBQUFBLElBd0JBLE9BQUEsR0FBVSxLQUFBLENBQU0sY0FBTixDQXhCVixDQUFBO0FBeUJBLFNBQVMsa0hBQVQsR0FBQTtBQUNFLE1BQUEsT0FBUSxDQUFBLENBQUEsQ0FBUixHQUFhLENBQWIsQ0FERjtBQUFBLEtBekJBO0FBNEJBO0FBQUEsU0FBQSw4Q0FBQTswQkFBQTtBQUNFLE1BQUEsV0FBQSxHQUFjLENBQWQsQ0FBQTtBQUFBLE1BQ0EsUUFBQSxHQUFXLElBQUMsQ0FBQSxNQUFELENBQVEsT0FBTyxDQUFDLEdBQWhCLEVBQXFCLEVBQXJCLENBRFgsQ0FBQTtBQUVBLFdBQWtCLG9IQUFsQixHQUFBO0FBQ0UsUUFBQSxJQUFHLENBQUMsVUFBQSxHQUFhLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBOUIsQ0FBQSxJQUEwQyxDQUFDLE9BQU8sQ0FBQyxPQUFRLENBQUEsVUFBQSxDQUFoQixLQUErQixHQUFoQyxDQUE3QztBQUNFLFVBQUEsT0FBQSxHQUFVLFFBQVEsQ0FBQyxPQUFPLENBQUMsTUFBM0IsQ0FBQTtBQUNBLFVBQUEsSUFBRyxDQUFDLFdBQUEsR0FBYyxPQUFmLENBQUEsR0FBMEIsY0FBN0I7QUFDRSxZQUFBLE9BQUEsR0FBVSxjQUFBLEdBQWlCLFdBQTNCLENBREY7V0FEQTtBQUdBLGVBQVMsc0ZBQVQsR0FBQTtBQUNFLFlBQUEsT0FBUSxDQUFBLFdBQUEsR0FBYyxDQUFkLENBQVIsSUFBNEIsUUFBUSxDQUFDLE9BQVEsQ0FBQSxDQUFBLENBQTdDLENBREY7QUFBQSxXQUpGO1NBQUE7QUFBQSxRQU9BLFdBQUEsSUFBZSxnQkFBaUIsQ0FBQSxVQUFBLENBUGhDLENBREY7QUFBQSxPQUhGO0FBQUEsS0E1QkE7QUF5Q0EsV0FBTztBQUFBLE1BQ0wsT0FBQSxFQUFTLE9BREo7QUFBQSxNQUVMLE1BQUEsRUFBUSxXQUZIO0tBQVAsQ0ExQ1c7RUFBQSxDQXRMYixDQUFBOztBQUFBLHFCQXFPQSxhQUFBLEdBQWUsU0FBQyxJQUFELEVBQU8sS0FBUCxFQUFjLFNBQWQsR0FBQTtBQUNiLFFBQUEsSUFBQTtBQUFBLElBQUEsSUFBRyxDQUFDLElBQUEsS0FBUSxNQUFULENBQUEsSUFBcUIsQ0FBQyxJQUFBLEtBQVEsUUFBVCxDQUF4QjtBQUNFLGFBQU8sS0FBUCxDQURGO0tBQUE7QUFBQSxJQUdBLElBQUEsR0FBTyxLQUhQLENBQUE7QUFJQSxJQUFBLElBQUcsU0FBUyxDQUFDLElBQWI7QUFDRSxNQUFBLElBQUEsSUFBUyxJQUFBLEdBQUcsU0FBUyxDQUFDLElBQXRCLENBREY7S0FKQTtBQU1BLElBQUEsSUFBRyxTQUFTLENBQUMsTUFBYjtBQUNFLE1BQUEsSUFBQSxJQUFTLElBQUEsR0FBRyxTQUFTLENBQUMsTUFBdEIsQ0FERjtLQU5BO0FBU0EsV0FBTyxJQUFQLENBVmE7RUFBQSxDQXJPZixDQUFBOztBQUFBLHFCQWlQQSxTQUFBLEdBQVcsU0FBQyxLQUFELEdBQUE7QUFDVCxRQUFBLE1BQUE7QUFBQSxJQUFBLE1BQUEsR0FBUyxJQUFDLENBQUEsT0FBUSxDQUFBLEtBQUEsQ0FBbEIsQ0FBQTtBQUNBLElBQUEsSUFBRyxDQUFBLE1BQUg7QUFDRSxNQUFBLElBQUMsQ0FBQSxLQUFELENBQVEsaUJBQUEsR0FBZ0IsS0FBeEIsQ0FBQSxDQUFBO0FBQ0EsYUFBTyxJQUFQLENBRkY7S0FEQTtBQUlBLFdBQU8sTUFBUCxDQUxTO0VBQUEsQ0FqUFgsQ0FBQTs7QUFBQSxxQkF3UEEsTUFBQSxHQUFRLFNBQUMsS0FBRCxFQUFRLFNBQVIsR0FBQTtBQUNOLFFBQUEsMEdBQUE7QUFBQSxJQUFBLE1BQUEsR0FBUyxJQUFDLENBQUEsU0FBRCxDQUFXLEtBQVgsQ0FBVCxDQUFBO0FBQ0EsSUFBQSxJQUFHLENBQUEsTUFBSDtBQUNFLGFBQU8sSUFBUCxDQURGO0tBREE7QUFBQSxJQUlBLFNBQUEsR0FBWSxJQUFDLENBQUEsYUFBRCxDQUFlLE1BQU0sQ0FBQyxLQUF0QixFQUE2QixLQUE3QixFQUFvQyxTQUFwQyxDQUpaLENBQUE7QUFLQSxJQUFBLElBQUcsSUFBQyxDQUFBLFVBQVcsQ0FBQSxTQUFBLENBQWY7QUFDRSxhQUFPLElBQUMsQ0FBQSxVQUFXLENBQUEsU0FBQSxDQUFuQixDQURGO0tBTEE7QUFBQSxJQVFBLEtBQUE7QUFBUSxjQUFPLE1BQU0sQ0FBQyxLQUFkO0FBQUEsYUFDRCxNQURDO2lCQUNXLElBQUMsQ0FBQSxVQUFELENBQVksTUFBWixFQUFvQixTQUFwQixFQURYO0FBQUEsYUFFRCxRQUZDO2lCQUVhLElBQUMsQ0FBQSxZQUFELENBQWMsTUFBZCxFQUFzQixTQUF0QixFQUZiO0FBQUEsYUFHRCxNQUhDO2lCQUdXLElBQUMsQ0FBQSxVQUFELENBQVksTUFBWixFQUhYO0FBQUEsYUFJRCxPQUpDO2lCQUlZLElBQUMsQ0FBQSxXQUFELENBQWEsTUFBYixFQUpaO0FBQUE7QUFNSixVQUFBLElBQUMsQ0FBQSxLQUFELENBQVEsZUFBQSxHQUFjLE1BQU0sQ0FBQyxLQUE3QixDQUFBLENBQUE7aUJBQ0EsS0FQSTtBQUFBO2lCQVJSLENBQUE7QUFrQkEsSUFBQSxJQUFHLHVCQUFBLElBQW1CLENBQUMsTUFBTSxDQUFDLE1BQVAsS0FBaUIsR0FBbEIsQ0FBdEI7QUFDRSxXQUFTLHVHQUFULEdBQUE7QUFDRSxRQUFBLEtBQUssQ0FBQyxPQUFRLENBQUEsQ0FBQSxDQUFkLElBQW9CLE1BQU0sQ0FBQyxNQUEzQixDQURGO0FBQUEsT0FERjtLQWxCQTtBQXVCQSxJQUFBLElBQUcsdUJBQUEsSUFBbUIsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQWQsR0FBc0IsQ0FBdkIsQ0FBdEI7QUFDRSxNQUFBLFlBQUEsR0FBZSxJQUFJLENBQUMsS0FBTCxDQUFXLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBZCxHQUFzQixJQUFDLENBQUEsVUFBdkIsR0FBb0MsSUFBL0MsQ0FBZixDQUFBO0FBQ0EsTUFBQSxJQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBZCxHQUF1QixZQUExQjtBQUNFLFFBQUEsV0FBQSxHQUFjLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBZCxHQUF1QixDQUFDLFlBQUEsR0FBZSxDQUFoQixDQUFyQyxDQUFBO0FBQUEsUUFFQSxPQUFBLEdBQVUsS0FBQSxDQUFNLFdBQU4sQ0FGVixDQUFBO0FBR0EsYUFBUyw0R0FBVCxHQUFBO0FBQ0UsVUFBQSxPQUFRLENBQUEsQ0FBQSxDQUFSLEdBQWEsS0FBSyxDQUFDLE9BQVEsQ0FBQSxDQUFBLENBQTNCLENBREY7QUFBQSxTQUhBO0FBS0EsYUFBUyx5SUFBVCxHQUFBO0FBQ0UsVUFBQSxPQUFRLENBQUEsQ0FBQSxDQUFSLEdBQWEsQ0FBYixDQURGO0FBQUEsU0FMQTtBQU9BLGFBQVMsa0hBQVQsR0FBQTtBQUNFLFVBQUEsT0FBUSxDQUFBLENBQUEsR0FBSSxZQUFKLENBQVIsSUFBNkIsSUFBSSxDQUFDLEtBQUwsQ0FBVyxPQUFRLENBQUEsQ0FBQSxDQUFSLEdBQWEsTUFBTSxDQUFDLE1BQU0sQ0FBQyxLQUF0QyxDQUE3QixDQURGO0FBQUEsU0FQQTtBQUFBLFFBU0EsS0FBSyxDQUFDLE9BQU4sR0FBZ0IsT0FUaEIsQ0FERjtPQUZGO0tBdkJBO0FBQUEsSUFxQ0EsSUFBQyxDQUFBLEdBQUcsQ0FBQyxPQUFMLENBQWMsV0FBQSxHQUFVLFNBQVYsR0FBcUIsR0FBbkMsQ0FyQ0EsQ0FBQTtBQUFBLElBc0NBLElBQUMsQ0FBQSxVQUFXLENBQUEsU0FBQSxDQUFaLEdBQXlCLEtBdEN6QixDQUFBO0FBdUNBLFdBQU8sS0FBUCxDQXhDTTtFQUFBLENBeFBSLENBQUE7O2tCQUFBOztJQXhXRixDQUFBOztBQUFBLGdCQTZvQkEsR0FBbUIsU0FBQyxJQUFELEdBQUE7QUFDakIsTUFBQSx3REFBQTtBQUFBLEVBQUEsTUFBQSxHQUFTLElBQUksQ0FBQyxHQUFkLENBQUE7QUFBQSxFQUNBLE1BQU0sQ0FBQyxPQUFQLENBQWUsWUFBZixDQURBLENBQUE7QUFBQSxFQUVBLE1BQUEsR0FBYSxJQUFBLE1BQUEsQ0FBTyxNQUFQLENBRmIsQ0FBQTtBQUFBLEVBR0EsTUFBTSxDQUFDLEtBQVAsQ0FBYSxJQUFJLENBQUMsTUFBbEIsQ0FIQSxDQUFBO0FBQUEsRUFLQSxLQUFBLEdBQVEsSUFBSSxDQUFDLEtBTGIsQ0FBQTs7SUFNQSxRQUFTLE1BQU0sQ0FBQztHQU5oQjtBQVFBLEVBQUEsSUFBRyxLQUFIO0FBQ0UsSUFBQSxVQUFBLEdBQWEsS0FBYixDQUFBO0FBQUEsSUFDQSxNQUFNLENBQUMsT0FBUCxDQUFlLGNBQWYsQ0FEQSxDQUFBO0FBQUEsSUFFQSxRQUFBLEdBQWUsSUFBQSxRQUFBLENBQVMsTUFBVCxFQUFpQixVQUFqQixFQUE2QixJQUFJLENBQUMsY0FBbEMsRUFBa0QsTUFBTSxDQUFDLE9BQXpELENBRmYsQ0FBQTtBQUFBLElBR0EsV0FBQSxHQUFjLFFBQVEsQ0FBQyxNQUFULENBQWdCLEtBQWhCLEVBQXVCLEVBQXZCLENBSGQsQ0FBQTtBQUlBLElBQUEsSUFBRyxJQUFJLENBQUMsY0FBUjtBQUNFLGFBQU8sUUFBUSxDQUFDLFFBQVQsQ0FBa0IsSUFBSSxDQUFDLGNBQXZCLEVBQXVDLFVBQXZDLEVBQW1ELFdBQVcsQ0FBQyxPQUEvRCxDQUFQLENBREY7S0FKQTtBQU1BLFdBQU8sUUFBUSxDQUFDLFdBQVQsQ0FBcUIsVUFBckIsRUFBaUMsV0FBVyxDQUFDLE9BQTdDLENBQVAsQ0FQRjtHQVJBO0FBaUJBLFNBQU8sSUFBUCxDQWxCaUI7QUFBQSxDQTdvQm5CLENBQUE7O0FBQUEsTUFpcUJNLENBQUMsT0FBUCxHQUNFO0FBQUEsRUFBQSxNQUFBLEVBQVEsZ0JBQVI7Q0FscUJGLENBQUE7Ozs7OztBQ0hBLElBQUEsdUVBQUE7O0FBQUEsRUFBQSxHQUFLLE9BQUEsQ0FBUSxJQUFSLENBQUwsQ0FBQTs7QUFBQTtBQUllLEVBQUEsb0JBQUEsR0FBQTtBQUNYLFFBQUEsS0FBQTtBQUFBLElBQUEsSUFBQyxDQUFBLEtBQUQsR0FBUyxtRUFBVCxDQUFBO0FBQUEsSUFDQSxJQUFDLENBQUEsU0FBRCxHQUFhLEVBRGIsQ0FBQTtBQUVBLFNBQVMsK0JBQVQsR0FBQTtBQUNFLE1BQUEsSUFBQyxDQUFBLFNBQVUsQ0FBQSxDQUFBLENBQVgsR0FBZ0IsSUFBQyxDQUFBLEtBQU0sQ0FBQSxDQUFBLElBQUssQ0FBTCxDQUFQLEdBQWlCLElBQUMsQ0FBQSxLQUFNLENBQUEsQ0FBQSxHQUFJLElBQUosQ0FBeEMsQ0FERjtBQUFBLEtBSFc7RUFBQSxDQUFiOztBQUFBLHVCQU1BLE1BQUEsR0FBUSxTQUFDLEdBQUQsR0FBQTtBQUNOLFFBQUEsMEJBQUE7QUFBQSxJQUFBLEdBQUEsR0FBTSxHQUFHLENBQUMsTUFBVixDQUFBO0FBQUEsSUFDQSxHQUFBLEdBQU0sRUFETixDQUFBO0FBQUEsSUFFQSxDQUFBLEdBQUksQ0FGSixDQUFBO0FBR0EsV0FBTyxHQUFBLEdBQU0sQ0FBYixHQUFBO0FBQ0UsTUFBQSxDQUFBLEdBQUksQ0FBQyxHQUFJLENBQUEsQ0FBQSxDQUFKLElBQVUsRUFBWCxDQUFBLEdBQWlCLENBQUMsR0FBSSxDQUFBLENBQUEsR0FBRSxDQUFGLENBQUosSUFBVSxDQUFYLENBQWpCLEdBQWlDLEdBQUksQ0FBQSxDQUFBLEdBQUUsQ0FBRixDQUF6QyxDQUFBO0FBQUEsTUFDQSxHQUFBLElBQU0sSUFBSSxDQUFDLFNBQVUsQ0FBQSxDQUFBLElBQUssRUFBTCxDQUFmLEdBQTBCLElBQUksQ0FBQyxTQUFVLENBQUEsQ0FBQSxHQUFJLEtBQUosQ0FEL0MsQ0FBQTtBQUFBLE1BRUEsR0FBQSxJQUFNLENBRk4sQ0FBQTtBQUFBLE1BR0EsQ0FBQSxJQUFJLENBSEosQ0FERjtJQUFBLENBSEE7QUFRQSxJQUFBLElBQUksR0FBQSxHQUFNLENBQVY7QUFDRSxNQUFBLEVBQUEsR0FBSSxDQUFDLEdBQUksQ0FBQSxDQUFBLENBQUosR0FBUyxJQUFWLENBQUEsSUFBbUIsQ0FBdkIsQ0FBQTtBQUFBLE1BQ0EsRUFBQSxHQUFJLENBQUMsR0FBSSxDQUFBLENBQUEsQ0FBSixHQUFTLElBQVYsQ0FBQSxJQUFtQixDQUR2QixDQUFBO0FBRUEsTUFBQSxJQUFJLEdBQUEsR0FBTSxDQUFWO0FBQ0UsUUFBQSxFQUFBLElBQU0sQ0FBQyxHQUFJLENBQUEsRUFBQSxDQUFBLENBQUosR0FBVyxJQUFaLENBQUEsSUFBcUIsQ0FBM0IsQ0FERjtPQUZBO0FBQUEsTUFJQSxHQUFBLElBQU0sSUFBSSxDQUFDLEtBQU0sQ0FBQSxFQUFBLENBSmpCLENBQUE7QUFBQSxNQUtBLEdBQUEsSUFBTSxJQUFJLENBQUMsS0FBTSxDQUFBLEVBQUEsQ0FMakIsQ0FBQTtBQU1BLE1BQUEsSUFBSSxHQUFBLEtBQU8sQ0FBWDtBQUNFLFFBQUEsRUFBQSxHQUFJLENBQUMsR0FBSSxDQUFBLENBQUEsRUFBQSxDQUFKLEdBQVcsSUFBWixDQUFBLElBQXFCLENBQXpCLENBQUE7QUFBQSxRQUNBLEVBQUEsSUFBTSxDQUFDLEdBQUksQ0FBQSxDQUFBLENBQUosR0FBUyxJQUFWLENBQUEsSUFBbUIsQ0FEekIsQ0FBQTtBQUFBLFFBRUEsR0FBQSxJQUFNLElBQUksQ0FBQyxLQUFNLENBQUEsRUFBQSxDQUZqQixDQURGO09BTkE7QUFVQSxNQUFBLElBQUksR0FBQSxLQUFPLENBQVg7QUFDRSxRQUFBLEdBQUEsSUFBTSxHQUFOLENBREY7T0FWQTtBQUFBLE1BWUEsR0FBQSxJQUFNLEdBWk4sQ0FERjtLQVJBO0FBdUJBLFdBQU8sR0FBUCxDQXhCTTtFQUFBLENBTlIsQ0FBQTs7b0JBQUE7O0lBSkYsQ0FBQTs7QUFBQTtBQXFDZSxFQUFBLGtCQUFFLFVBQUYsRUFBZSxJQUFmLEdBQUE7QUFDWCxJQURZLElBQUMsQ0FBQSxhQUFBLFVBQ2IsQ0FBQTtBQUFBLElBRHlCLElBQUMsQ0FBQSxPQUFBLElBQzFCLENBQUE7QUFBQSxJQUFBLElBQUMsQ0FBQSxHQUFELEdBQU8sRUFBUCxDQUFBO0FBQUEsSUFDQSxJQUFDLENBQUEsTUFBRCxHQUNFO0FBQUEsTUFBQSxPQUFBLEVBQWUsQ0FBQyxJQUFELEVBQU0sSUFBTixFQUFXLElBQVgsRUFBZ0IsSUFBaEIsQ0FBZjtBQUFBLE1BQ0EsU0FBQSxFQUFlLENBRGY7QUFBQSxNQUVBLE1BQUEsRUFBZSxDQUFDLElBQUQsRUFBTSxJQUFOLEVBQVcsSUFBWCxFQUFnQixJQUFoQixDQUZmO0FBQUEsTUFHQSxXQUFBLEVBQWUsQ0FBQyxJQUFELEVBQU0sSUFBTixFQUFXLElBQVgsRUFBZ0IsSUFBaEIsQ0FIZjtBQUFBLE1BSUEsYUFBQSxFQUFlLEVBSmY7QUFBQSxNQUtBLFdBQUEsRUFBZSxDQUxmO0FBQUEsTUFNQSxXQUFBLEVBQWUsQ0FOZjtBQUFBLE1BT0EsVUFBQSxFQUFlLElBQUMsQ0FBQSxVQVBoQjtBQUFBLE1BUUEsUUFBQSxFQUFlLENBUmY7QUFBQSxNQVNBLFVBQUEsRUFBZSxDQVRmO0FBQUEsTUFVQSxhQUFBLEVBQWUsRUFWZjtBQUFBLE1BV0EsV0FBQSxFQUFlLENBQUMsSUFBRCxFQUFNLElBQU4sRUFBVyxJQUFYLEVBQWdCLElBQWhCLENBWGY7QUFBQSxNQVlBLGFBQUEsRUFBZSxDQVpmO0tBRkYsQ0FBQTtBQUFBLElBZ0JBLElBQUMsQ0FBQSxRQUFELENBQUEsQ0FoQkEsQ0FEVztFQUFBLENBQWI7O0FBQUEscUJBbUJBLFVBQUEsR0FBWSxTQUFDLENBQUQsR0FBQTtBQUNWLFdBQU8sQ0FBQyxDQUFBLEdBQUUsSUFBSCxFQUFTLENBQUMsQ0FBQSxJQUFHLENBQUosQ0FBQSxHQUFPLElBQWhCLEVBQXNCLENBQUMsQ0FBQSxJQUFHLEVBQUosQ0FBQSxHQUFRLElBQTlCLEVBQW9DLENBQUMsQ0FBQSxJQUFHLEVBQUosQ0FBQSxHQUFRLElBQTVDLENBQVAsQ0FEVTtFQUFBLENBbkJaLENBQUE7O0FBQUEscUJBc0JBLFVBQUEsR0FBWSxTQUFDLENBQUQsR0FBQTtBQUNWLFdBQU8sQ0FBQyxDQUFBLEdBQUUsSUFBSCxFQUFTLENBQUMsQ0FBQSxJQUFHLENBQUosQ0FBQSxHQUFPLElBQWhCLENBQVAsQ0FEVTtFQUFBLENBdEJaLENBQUE7O0FBQUEscUJBeUJBLGVBQUEsR0FBaUIsU0FBQyxJQUFELEdBQUE7QUFDZixRQUFBLGdCQUFBO0FBQUEsSUFBQSxDQUFBLEdBQUksRUFBSixDQUFBO0FBQUEsSUFDQSxDQUFBLEdBQUksQ0FESixDQUFBO0FBQUEsSUFFQSxHQUFBLEdBQU0sSUFBSSxDQUFDLE1BRlgsQ0FBQTtBQUdBLFNBQVMsc0VBQVQsR0FBQTtBQUNFLE1BQUEsQ0FBRSxDQUFBLENBQUEsRUFBQSxDQUFGLEdBQVMsSUFBSyxDQUFBLENBQUEsQ0FBTCxHQUFVLElBQW5CLENBQUE7QUFBQSxNQUNBLENBQUUsQ0FBQSxDQUFBLEVBQUEsQ0FBRixHQUFTLENBQUMsSUFBSyxDQUFBLENBQUEsQ0FBTCxJQUFTLENBQVYsQ0FBQSxHQUFlLElBRHhCLENBREY7QUFBQSxLQUhBO0FBT0EsV0FBTyxDQUFQLENBUmU7RUFBQSxDQXpCakIsQ0FBQTs7QUFBQSxxQkFtQ0EsUUFBQSxHQUFVLFNBQUEsR0FBQTtBQUNSLFFBQUEsRUFBQTtBQUFBLElBQUEsSUFBQyxDQUFBLE1BQU0sQ0FBQyxVQUFSLEdBQXFCLENBQUMsSUFBQyxDQUFBLE1BQU0sQ0FBQyxXQUFSLEdBQXNCLElBQUMsQ0FBQSxNQUFNLENBQUMsYUFBL0IsQ0FBQSxJQUFpRCxDQUF0RSxDQUFBO0FBQUEsSUFDQSxJQUFDLENBQUEsTUFBTSxDQUFDLFFBQVIsR0FBbUIsSUFBQyxDQUFBLE1BQU0sQ0FBQyxVQUFSLEdBQXFCLElBQUMsQ0FBQSxVQUR6QyxDQUFBO0FBQUEsSUFFQSxJQUFDLENBQUEsTUFBTSxDQUFDLGFBQVIsR0FBd0IsSUFBQyxDQUFBLElBQUksQ0FBQyxNQUFOLEdBQWUsQ0FBQyxJQUFDLENBQUEsTUFBTSxDQUFDLGFBQVIsSUFBeUIsQ0FBMUIsQ0FGdkMsQ0FBQTtBQUFBLElBR0EsSUFBQyxDQUFBLE1BQU0sQ0FBQyxTQUFSLEdBQW9CLEVBQUEsR0FBSyxJQUFDLENBQUEsTUFBTSxDQUFDLGFBSGpDLENBQUE7QUFLQSxJQUFBLElBQUcsSUFBQyxDQUFBLE1BQU0sQ0FBQyxhQUFSLEtBQXlCLEVBQTVCO0FBQ0UsTUFBQSxJQUFDLENBQUEsSUFBRCxHQUFRLElBQUMsQ0FBQSxlQUFELENBQWlCLElBQUMsQ0FBQSxJQUFsQixDQUFSLENBREY7S0FMQTtBQUFBLElBUUEsSUFBQyxDQUFBLEdBQUQsR0FBTyxJQUFDLENBQUEsTUFBTSxDQUFDLE9BQU8sQ0FBQyxNQUFoQixDQUNMLElBQUMsQ0FBQSxVQUFELENBQVksSUFBQyxDQUFBLE1BQU0sQ0FBQyxTQUFwQixDQURLLEVBRUwsSUFBQyxDQUFBLE1BQU0sQ0FBQyxNQUZILEVBR0wsSUFBQyxDQUFBLE1BQU0sQ0FBQyxXQUhILEVBSUwsSUFBQyxDQUFBLFVBQUQsQ0FBWSxJQUFDLENBQUEsTUFBTSxDQUFDLGFBQXBCLENBSkssRUFLTCxJQUFDLENBQUEsVUFBRCxDQUFZLElBQUMsQ0FBQSxNQUFNLENBQUMsV0FBcEIsQ0FMSyxFQU1MLElBQUMsQ0FBQSxVQUFELENBQVksSUFBQyxDQUFBLE1BQU0sQ0FBQyxXQUFwQixDQU5LLEVBT0wsSUFBQyxDQUFBLFVBQUQsQ0FBWSxJQUFDLENBQUEsTUFBTSxDQUFDLFVBQXBCLENBUEssRUFRTCxJQUFDLENBQUEsVUFBRCxDQUFZLElBQUMsQ0FBQSxNQUFNLENBQUMsUUFBcEIsQ0FSSyxFQVNMLElBQUMsQ0FBQSxVQUFELENBQVksSUFBQyxDQUFBLE1BQU0sQ0FBQyxVQUFwQixDQVRLLEVBVUwsSUFBQyxDQUFBLFVBQUQsQ0FBWSxJQUFDLENBQUEsTUFBTSxDQUFDLGFBQXBCLENBVkssRUFXTCxJQUFDLENBQUEsTUFBTSxDQUFDLFdBWEgsRUFZTCxJQUFDLENBQUEsVUFBRCxDQUFZLElBQUMsQ0FBQSxNQUFNLENBQUMsYUFBcEIsQ0FaSyxFQWFMLElBQUMsQ0FBQSxJQWJJLENBUlAsQ0FBQTtBQUFBLElBdUJBLEVBQUEsR0FBSyxHQUFBLENBQUEsVUF2QkwsQ0FBQTtBQUFBLElBd0JBLElBQUMsQ0FBQSxVQUFELEdBQWMsRUFBRSxDQUFDLE1BQUgsQ0FBVSxJQUFDLENBQUEsR0FBWCxDQXhCZCxDQUFBO1dBeUJBLElBQUMsQ0FBQSxPQUFELEdBQVcsd0JBQUEsR0FBMkIsSUFBQyxDQUFBLFdBMUIvQjtFQUFBLENBbkNWLENBQUE7O0FBQUEscUJBK0RBLEdBQUEsR0FBSyxTQUFBLEdBQUE7QUFDSCxXQUFXLElBQUEsTUFBQSxDQUFPLElBQUMsQ0FBQSxVQUFSLEVBQW9CLFFBQXBCLENBQVgsQ0FERztFQUFBLENBL0RMLENBQUE7O2tCQUFBOztJQXJDRixDQUFBOztBQUFBLFFBdUdBLEdBQVcsU0FBQyxRQUFELEVBQVcsVUFBWCxFQUF1QixPQUF2QixHQUFBO0FBQ1QsTUFBQSxJQUFBO0FBQUEsRUFBQSxJQUFBLEdBQVcsSUFBQSxRQUFBLENBQVMsVUFBVCxFQUFxQixPQUFyQixDQUFYLENBQUE7QUFBQSxFQUNBLEVBQUUsQ0FBQyxhQUFILENBQWlCLFFBQWpCLEVBQTJCLElBQUksQ0FBQyxHQUFMLENBQUEsQ0FBM0IsQ0FEQSxDQUFBO0FBRUEsU0FBTyxJQUFQLENBSFM7QUFBQSxDQXZHWCxDQUFBOztBQUFBLFdBNEdBLEdBQWMsU0FBQyxVQUFELEVBQWEsT0FBYixHQUFBO0FBQ1osTUFBQSxJQUFBO0FBQUEsRUFBQSxJQUFBLEdBQVcsSUFBQSxRQUFBLENBQVMsVUFBVCxFQUFxQixPQUFyQixDQUFYLENBQUE7QUFDQSxTQUFPLElBQUksQ0FBQyxPQUFaLENBRlk7QUFBQSxDQTVHZCxDQUFBOztBQUFBLFNBZ0hBLEdBQVksU0FBQyxPQUFELEVBQVUsV0FBVixFQUF1QixTQUF2QixHQUFBO0FBQ1YsTUFBQSwrRkFBQTtBQUFBLEVBQUEsV0FBQSxHQUFjLFdBQUEsSUFBZSxFQUE3QixDQUFBO0FBQUEsRUFDQSxTQUFBLEdBQVksU0FBQSxJQUFhLEdBRHpCLENBQUE7QUFBQSxFQUdBLGNBQUEsR0FBaUIsSUFBQSxDQUFLLE9BQUwsQ0FIakIsQ0FBQTtBQUFBLEVBSUEsVUFBQSxHQUFhLEVBSmIsQ0FBQTtBQU1BLE9BQWMsOEdBQWQsR0FBQTtBQUNFLElBQUEsS0FBQSxHQUFRLGNBQWMsQ0FBQyxLQUFmLENBQXFCLE1BQXJCLEVBQTZCLE1BQUEsR0FBUyxTQUF0QyxDQUFSLENBQUE7QUFBQSxJQUVBLFdBQUEsR0FBa0IsSUFBQSxLQUFBLENBQU0sS0FBSyxDQUFDLE1BQVosQ0FGbEIsQ0FBQTtBQUdBLFNBQVMsb0dBQVQsR0FBQTtBQUNFLE1BQUEsV0FBWSxDQUFBLENBQUEsQ0FBWixHQUFpQixLQUFLLENBQUMsVUFBTixDQUFpQixDQUFqQixDQUFqQixDQURGO0FBQUEsS0FIQTtBQUFBLElBTUEsU0FBQSxHQUFnQixJQUFBLFVBQUEsQ0FBVyxXQUFYLENBTmhCLENBQUE7QUFBQSxJQVFBLFVBQVUsQ0FBQyxJQUFYLENBQWdCLFNBQWhCLENBUkEsQ0FERjtBQUFBLEdBTkE7QUFBQSxFQWlCQSxJQUFBLEdBQVcsSUFBQSxJQUFBLENBQUssVUFBTCxFQUFpQjtBQUFBLElBQUMsSUFBQSxFQUFNLFdBQVA7R0FBakIsQ0FqQlgsQ0FBQTtBQWtCQSxTQUFPLElBQVAsQ0FuQlU7QUFBQSxDQWhIWixDQUFBOztBQUFBLFdBcUlBLEdBQWMsU0FBQyxVQUFELEVBQWEsT0FBYixHQUFBO0FBQ1osTUFBQSxVQUFBO0FBQUEsRUFBQSxJQUFBLEdBQVcsSUFBQSxRQUFBLENBQVMsVUFBVCxFQUFxQixPQUFyQixDQUFYLENBQUE7QUFBQSxFQUNBLElBQUEsR0FBTyxTQUFBLENBQVUsSUFBSSxDQUFDLFVBQWYsRUFBMkIsV0FBM0IsQ0FEUCxDQUFBO0FBRUEsU0FBTyxHQUFHLENBQUMsZUFBSixDQUFvQixJQUFwQixDQUFQLENBSFk7QUFBQSxDQXJJZCxDQUFBOztBQUFBLE1BMElNLENBQUMsT0FBUCxHQUNFO0FBQUEsRUFBQSxRQUFBLEVBQVUsUUFBVjtBQUFBLEVBQ0EsUUFBQSxFQUFVLFFBRFY7QUFBQSxFQUVBLFdBQUEsRUFBYSxXQUZiO0FBQUEsRUFHQSxXQUFBLEVBQWEsV0FIYjtDQTNJRixDQUFBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIoZnVuY3Rpb24gKEJ1ZmZlcil7XG4vL1xuLy8gakRhdGFWaWV3IGJ5IFZqZXV4IDx2amV1eHhAZ21haWwuY29tPiAtIEphbiAyMDEwXG4vLyBDb250aW51ZWQgYnkgUlJldmVyc2VyIDxtZUBycmV2ZXJzZXIuY29tPiAtIEZlYiAyMDEzXG4vL1xuLy8gQSB1bmlxdWUgd2F5IHRvIHdvcmsgd2l0aCBhIGJpbmFyeSBmaWxlIGluIHRoZSBicm93c2VyXG4vLyBodHRwOi8vZ2l0aHViLmNvbS9qRGF0YVZpZXcvakRhdGFWaWV3XG4vLyBodHRwOi8vakRhdGFWaWV3LmdpdGh1Yi5pby9cblxuKGZ1bmN0aW9uIChnbG9iYWwpIHtcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgY29tcGF0aWJpbGl0eSA9IHtcblx0Ly8gTm9kZUpTIEJ1ZmZlciBpbiB2MC41LjUgYW5kIG5ld2VyXG5cdE5vZGVCdWZmZXI6ICdCdWZmZXInIGluIGdsb2JhbCAmJiAncmVhZEludDE2TEUnIGluIEJ1ZmZlci5wcm90b3R5cGUsXG5cdERhdGFWaWV3OiAnRGF0YVZpZXcnIGluIGdsb2JhbCAmJiAoXG5cdFx0J2dldEZsb2F0NjQnIGluIERhdGFWaWV3LnByb3RvdHlwZSB8fCAgICAgICAgICAgIC8vIENocm9tZVxuXHRcdCdnZXRGbG9hdDY0JyBpbiBuZXcgRGF0YVZpZXcobmV3IEFycmF5QnVmZmVyKDEpKSAvLyBOb2RlXG5cdCksXG5cdEFycmF5QnVmZmVyOiAnQXJyYXlCdWZmZXInIGluIGdsb2JhbCxcblx0UGl4ZWxEYXRhOiAnQ2FudmFzUGl4ZWxBcnJheScgaW4gZ2xvYmFsICYmICdJbWFnZURhdGEnIGluIGdsb2JhbCAmJiAnZG9jdW1lbnQnIGluIGdsb2JhbFxufTtcblxuLy8gd2UgZG9uJ3Qgd2FudCB0byBib3RoZXIgd2l0aCBvbGQgQnVmZmVyIGltcGxlbWVudGF0aW9uXG5pZiAoY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyKSB7XG5cdChmdW5jdGlvbiAoYnVmZmVyKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGJ1ZmZlci53cml0ZUZsb2F0TEUoSW5maW5pdHksIDApO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlciA9IGZhbHNlO1xuXHRcdH1cblx0fSkobmV3IEJ1ZmZlcig0KSk7XG59XG5cbmlmIChjb21wYXRpYmlsaXR5LlBpeGVsRGF0YSkge1xuXHR2YXIgY3JlYXRlUGl4ZWxEYXRhID0gZnVuY3Rpb24gKGJ5dGVMZW5ndGgsIGJ1ZmZlcikge1xuXHRcdHZhciBkYXRhID0gY3JlYXRlUGl4ZWxEYXRhLmNvbnRleHQyZC5jcmVhdGVJbWFnZURhdGEoKGJ5dGVMZW5ndGggKyAzKSAvIDQsIDEpLmRhdGE7XG5cdFx0ZGF0YS5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aDtcblx0XHRpZiAoYnVmZmVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZUxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGRhdGFbaV0gPSBidWZmZXJbaV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBkYXRhO1xuXHR9O1xuXHRjcmVhdGVQaXhlbERhdGEuY29udGV4dDJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJykuZ2V0Q29udGV4dCgnMmQnKTtcbn1cblxudmFyIGRhdGFUeXBlcyA9IHtcblx0J0ludDgnOiAxLFxuXHQnSW50MTYnOiAyLFxuXHQnSW50MzInOiA0LFxuXHQnVWludDgnOiAxLFxuXHQnVWludDE2JzogMixcblx0J1VpbnQzMic6IDQsXG5cdCdGbG9hdDMyJzogNCxcblx0J0Zsb2F0NjQnOiA4XG59O1xuXG52YXIgbm9kZU5hbWluZyA9IHtcblx0J0ludDgnOiAnSW50OCcsXG5cdCdJbnQxNic6ICdJbnQxNicsXG5cdCdJbnQzMic6ICdJbnQzMicsXG5cdCdVaW50OCc6ICdVSW50OCcsXG5cdCdVaW50MTYnOiAnVUludDE2Jyxcblx0J1VpbnQzMic6ICdVSW50MzInLFxuXHQnRmxvYXQzMic6ICdGbG9hdCcsXG5cdCdGbG9hdDY0JzogJ0RvdWJsZSdcbn07XG5cbmZ1bmN0aW9uIGFycmF5RnJvbShhcnJheUxpa2UsIGZvcmNlQ29weSkge1xuXHRyZXR1cm4gKCFmb3JjZUNvcHkgJiYgKGFycmF5TGlrZSBpbnN0YW5jZW9mIEFycmF5KSkgPyBhcnJheUxpa2UgOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnJheUxpa2UpO1xufVxuXG5mdW5jdGlvbiBkZWZpbmVkKHZhbHVlLCBkZWZhdWx0VmFsdWUpIHtcblx0cmV0dXJuIHZhbHVlICE9PSB1bmRlZmluZWQgPyB2YWx1ZSA6IGRlZmF1bHRWYWx1ZTtcbn1cblxuZnVuY3Rpb24gakRhdGFWaWV3KGJ1ZmZlciwgYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCwgbGl0dGxlRW5kaWFuKSB7XG5cdC8qIGpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuXG5cdGlmIChidWZmZXIgaW5zdGFuY2VvZiBqRGF0YVZpZXcpIHtcblx0XHR2YXIgcmVzdWx0ID0gYnVmZmVyLnNsaWNlKGJ5dGVPZmZzZXQsIGJ5dGVPZmZzZXQgKyBieXRlTGVuZ3RoKTtcblx0XHRyZXN1bHQuX2xpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCByZXN1bHQuX2xpdHRsZUVuZGlhbik7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlmICghKHRoaXMgaW5zdGFuY2VvZiBqRGF0YVZpZXcpKSB7XG5cdFx0cmV0dXJuIG5ldyBqRGF0YVZpZXcoYnVmZmVyLCBieXRlT2Zmc2V0LCBieXRlTGVuZ3RoLCBsaXR0bGVFbmRpYW4pO1xuXHR9XG5cblx0dGhpcy5idWZmZXIgPSBidWZmZXIgPSBqRGF0YVZpZXcud3JhcEJ1ZmZlcihidWZmZXIpO1xuXG5cdC8vIENoZWNrIHBhcmFtZXRlcnMgYW5kIGV4aXN0aW5nIGZ1bmN0aW9ubmFsaXRpZXNcblx0dGhpcy5faXNBcnJheUJ1ZmZlciA9IGNvbXBhdGliaWxpdHkuQXJyYXlCdWZmZXIgJiYgYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXI7XG5cdHRoaXMuX2lzUGl4ZWxEYXRhID0gY29tcGF0aWJpbGl0eS5QaXhlbERhdGEgJiYgYnVmZmVyIGluc3RhbmNlb2YgQ2FudmFzUGl4ZWxBcnJheTtcblx0dGhpcy5faXNEYXRhVmlldyA9IGNvbXBhdGliaWxpdHkuRGF0YVZpZXcgJiYgdGhpcy5faXNBcnJheUJ1ZmZlcjtcblx0dGhpcy5faXNOb2RlQnVmZmVyID0gY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyICYmIGJ1ZmZlciBpbnN0YW5jZW9mIEJ1ZmZlcjtcblxuXHQvLyBIYW5kbGUgVHlwZSBFcnJvcnNcblx0aWYgKCF0aGlzLl9pc05vZGVCdWZmZXIgJiYgIXRoaXMuX2lzQXJyYXlCdWZmZXIgJiYgIXRoaXMuX2lzUGl4ZWxEYXRhICYmICEoYnVmZmVyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG5cdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignakRhdGFWaWV3IGJ1ZmZlciBoYXMgYW4gaW5jb21wYXRpYmxlIHR5cGUnKTtcblx0fVxuXG5cdC8vIERlZmF1bHQgVmFsdWVzXG5cdHRoaXMuX2xpdHRsZUVuZGlhbiA9ICEhbGl0dGxlRW5kaWFuO1xuXG5cdHZhciBidWZmZXJMZW5ndGggPSAnYnl0ZUxlbmd0aCcgaW4gYnVmZmVyID8gYnVmZmVyLmJ5dGVMZW5ndGggOiBidWZmZXIubGVuZ3RoO1xuXHR0aGlzLmJ5dGVPZmZzZXQgPSBieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCAwKTtcblx0dGhpcy5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCA9IGRlZmluZWQoYnl0ZUxlbmd0aCwgYnVmZmVyTGVuZ3RoIC0gYnl0ZU9mZnNldCk7XG5cblx0aWYgKCF0aGlzLl9pc0RhdGFWaWV3KSB7XG5cdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCwgYnVmZmVyTGVuZ3RoKTtcblx0fSBlbHNlIHtcblx0XHR0aGlzLl92aWV3ID0gbmV3IERhdGFWaWV3KGJ1ZmZlciwgYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCk7XG5cdH1cblxuXHQvLyBDcmVhdGUgdW5pZm9ybSBtZXRob2RzIChhY3Rpb24gd3JhcHBlcnMpIGZvciB0aGUgZm9sbG93aW5nIGRhdGEgdHlwZXNcblxuXHR0aGlzLl9lbmdpbmVBY3Rpb24gPVxuXHRcdHRoaXMuX2lzRGF0YVZpZXdcblx0XHRcdD8gdGhpcy5fZGF0YVZpZXdBY3Rpb25cblx0XHQ6IHRoaXMuX2lzTm9kZUJ1ZmZlclxuXHRcdFx0PyB0aGlzLl9ub2RlQnVmZmVyQWN0aW9uXG5cdFx0OiB0aGlzLl9pc0FycmF5QnVmZmVyXG5cdFx0XHQ/IHRoaXMuX2FycmF5QnVmZmVyQWN0aW9uXG5cdFx0OiB0aGlzLl9hcnJheUFjdGlvbjtcbn1cblxuZnVuY3Rpb24gZ2V0Q2hhckNvZGVzKHN0cmluZykge1xuXHRpZiAoY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyKSB7XG5cdFx0cmV0dXJuIG5ldyBCdWZmZXIoc3RyaW5nLCAnYmluYXJ5Jyk7XG5cdH1cblxuXHR2YXIgVHlwZSA9IGNvbXBhdGliaWxpdHkuQXJyYXlCdWZmZXIgPyBVaW50OEFycmF5IDogQXJyYXksXG5cdFx0Y29kZXMgPSBuZXcgVHlwZShzdHJpbmcubGVuZ3RoKTtcblxuXHRmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0Y29kZXNbaV0gPSBzdHJpbmcuY2hhckNvZGVBdChpKSAmIDB4ZmY7XG5cdH1cblx0cmV0dXJuIGNvZGVzO1xufVxuXG4vLyBtb3N0bHkgaW50ZXJuYWwgZnVuY3Rpb24gZm9yIHdyYXBwaW5nIGFueSBzdXBwb3J0ZWQgaW5wdXQgKFN0cmluZyBvciBBcnJheS1saWtlKSB0byBiZXN0IHN1aXRhYmxlIGJ1ZmZlciBmb3JtYXRcbmpEYXRhVmlldy53cmFwQnVmZmVyID0gZnVuY3Rpb24gKGJ1ZmZlcikge1xuXHRzd2l0Y2ggKHR5cGVvZiBidWZmZXIpIHtcblx0XHRjYXNlICdudW1iZXInOlxuXHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlcikge1xuXHRcdFx0XHRidWZmZXIgPSBuZXcgQnVmZmVyKGJ1ZmZlcik7XG5cdFx0XHRcdGJ1ZmZlci5maWxsKDApO1xuXHRcdFx0fSBlbHNlXG5cdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlcikge1xuXHRcdFx0XHRidWZmZXIgPSBuZXcgVWludDhBcnJheShidWZmZXIpLmJ1ZmZlcjtcblx0XHRcdH0gZWxzZVxuXHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuUGl4ZWxEYXRhKSB7XG5cdFx0XHRcdGJ1ZmZlciA9IGNyZWF0ZVBpeGVsRGF0YShidWZmZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnVmZmVyID0gbmV3IEFycmF5KGJ1ZmZlcik7XG5cdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgYnVmZmVyLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0YnVmZmVyW2ldID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJ1ZmZlcjtcblxuXHRcdGNhc2UgJ3N0cmluZyc6XG5cdFx0XHRidWZmZXIgPSBnZXRDaGFyQ29kZXMoYnVmZmVyKTtcblx0XHRcdC8qIGZhbGxzIHRocm91Z2ggKi9cblx0XHRkZWZhdWx0OlxuXHRcdFx0aWYgKCdsZW5ndGgnIGluIGJ1ZmZlciAmJiAhKChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIgJiYgYnVmZmVyIGluc3RhbmNlb2YgQnVmZmVyKSB8fCAoY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlciAmJiBidWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikgfHwgKGNvbXBhdGliaWxpdHkuUGl4ZWxEYXRhICYmIGJ1ZmZlciBpbnN0YW5jZW9mIENhbnZhc1BpeGVsQXJyYXkpKSkge1xuXHRcdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyKSB7XG5cdFx0XHRcdFx0YnVmZmVyID0gbmV3IEJ1ZmZlcihidWZmZXIpO1xuXHRcdFx0XHR9IGVsc2Vcblx0XHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuQXJyYXlCdWZmZXIpIHtcblx0XHRcdFx0XHRpZiAoIShidWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikpIHtcblx0XHRcdFx0XHRcdGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcikuYnVmZmVyO1xuXHRcdFx0XHRcdFx0Ly8gYnVnIGluIE5vZGUuanMgPD0gMC44OlxuXHRcdFx0XHRcdFx0aWYgKCEoYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpKSB7XG5cdFx0XHRcdFx0XHRcdGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KGFycmF5RnJvbShidWZmZXIsIHRydWUpKS5idWZmZXI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Vcblx0XHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuUGl4ZWxEYXRhKSB7XG5cdFx0XHRcdFx0YnVmZmVyID0gY3JlYXRlUGl4ZWxEYXRhKGJ1ZmZlci5sZW5ndGgsIGJ1ZmZlcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnVmZmVyID0gYXJyYXlGcm9tKGJ1ZmZlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBidWZmZXI7XG5cdH1cbn07XG5cbmZ1bmN0aW9uIHBvdzIobikge1xuXHRyZXR1cm4gKG4gPj0gMCAmJiBuIDwgMzEpID8gKDEgPDwgbikgOiAocG93MltuXSB8fCAocG93MltuXSA9IE1hdGgucG93KDIsIG4pKSk7XG59XG5cbi8vIGxlZnQgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbmpEYXRhVmlldy5jcmVhdGVCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG5cdHJldHVybiBqRGF0YVZpZXcud3JhcEJ1ZmZlcihhcmd1bWVudHMpO1xufTtcblxuZnVuY3Rpb24gVWludDY0KGxvLCBoaSkge1xuXHR0aGlzLmxvID0gbG87XG5cdHRoaXMuaGkgPSBoaTtcbn1cblxuakRhdGFWaWV3LlVpbnQ2NCA9IFVpbnQ2NDtcblxuVWludDY0LnByb3RvdHlwZSA9IHtcblx0dmFsdWVPZjogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzLmxvICsgcG93MigzMikgKiB0aGlzLmhpO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIE51bWJlci5wcm90b3R5cGUudG9TdHJpbmcuYXBwbHkodGhpcy52YWx1ZU9mKCksIGFyZ3VtZW50cyk7XG5cdH1cbn07XG5cblVpbnQ2NC5mcm9tTnVtYmVyID0gZnVuY3Rpb24gKG51bWJlcikge1xuXHR2YXIgaGkgPSBNYXRoLmZsb29yKG51bWJlciAvIHBvdzIoMzIpKSxcblx0XHRsbyA9IG51bWJlciAtIGhpICogcG93MigzMik7XG5cblx0cmV0dXJuIG5ldyBVaW50NjQobG8sIGhpKTtcbn07XG5cbmZ1bmN0aW9uIEludDY0KGxvLCBoaSkge1xuXHRVaW50NjQuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbn1cblxuakRhdGFWaWV3LkludDY0ID0gSW50NjQ7XG5cbkludDY0LnByb3RvdHlwZSA9ICdjcmVhdGUnIGluIE9iamVjdCA/IE9iamVjdC5jcmVhdGUoVWludDY0LnByb3RvdHlwZSkgOiBuZXcgVWludDY0KCk7XG5cbkludDY0LnByb3RvdHlwZS52YWx1ZU9mID0gZnVuY3Rpb24gKCkge1xuXHRpZiAodGhpcy5oaSA8IHBvdzIoMzEpKSB7XG5cdFx0cmV0dXJuIFVpbnQ2NC5wcm90b3R5cGUudmFsdWVPZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHR9XG5cdHJldHVybiAtKChwb3cyKDMyKSAtIHRoaXMubG8pICsgcG93MigzMikgKiAocG93MigzMikgLSAxIC0gdGhpcy5oaSkpO1xufTtcblxuSW50NjQuZnJvbU51bWJlciA9IGZ1bmN0aW9uIChudW1iZXIpIHtcblx0dmFyIGxvLCBoaTtcblx0aWYgKG51bWJlciA+PSAwKSB7XG5cdFx0dmFyIHVuc2lnbmVkID0gVWludDY0LmZyb21OdW1iZXIobnVtYmVyKTtcblx0XHRsbyA9IHVuc2lnbmVkLmxvO1xuXHRcdGhpID0gdW5zaWduZWQuaGk7XG5cdH0gZWxzZSB7XG5cdFx0aGkgPSBNYXRoLmZsb29yKG51bWJlciAvIHBvdzIoMzIpKTtcblx0XHRsbyA9IG51bWJlciAtIGhpICogcG93MigzMik7XG5cdFx0aGkgKz0gcG93MigzMik7XG5cdH1cblx0cmV0dXJuIG5ldyBJbnQ2NChsbywgaGkpO1xufTtcblxuakRhdGFWaWV3LnByb3RvdHlwZSA9IHtcblx0X29mZnNldDogMCxcblx0X2JpdE9mZnNldDogMCxcblxuXHRjb21wYXRpYmlsaXR5OiBjb21wYXRpYmlsaXR5LFxuXG5cdF9jaGVja0JvdW5kczogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgsIG1heExlbmd0aCkge1xuXHRcdC8vIERvIGFkZGl0aW9uYWwgY2hlY2tzIHRvIHNpbXVsYXRlIERhdGFWaWV3XG5cdFx0aWYgKHR5cGVvZiBieXRlT2Zmc2V0ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignT2Zmc2V0IGlzIG5vdCBhIG51bWJlci4nKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBieXRlTGVuZ3RoICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignU2l6ZSBpcyBub3QgYSBudW1iZXIuJyk7XG5cdFx0fVxuXHRcdGlmIChieXRlTGVuZ3RoIDwgMCkge1xuXHRcdFx0dGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0xlbmd0aCBpcyBuZWdhdGl2ZS4nKTtcblx0XHR9XG5cdFx0aWYgKGJ5dGVPZmZzZXQgPCAwIHx8IGJ5dGVPZmZzZXQgKyBieXRlTGVuZ3RoID4gZGVmaW5lZChtYXhMZW5ndGgsIHRoaXMuYnl0ZUxlbmd0aCkpIHtcblx0XHRcdHRocm93IG5ldyBSYW5nZUVycm9yKCdPZmZzZXRzIGFyZSBvdXQgb2YgYm91bmRzLicpO1xuXHRcdH1cblx0fSxcblxuXHRfYWN0aW9uOiBmdW5jdGlvbiAodHlwZSwgaXNSZWFkQWN0aW9uLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VuZ2luZUFjdGlvbihcblx0XHRcdHR5cGUsXG5cdFx0XHRpc1JlYWRBY3Rpb24sXG5cdFx0XHRkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCksXG5cdFx0XHRkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKSxcblx0XHRcdHZhbHVlXG5cdFx0KTtcblx0fSxcblxuXHRfZGF0YVZpZXdBY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHQvLyBNb3ZlIHRoZSBpbnRlcm5hbCBvZmZzZXQgZm9yd2FyZFxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyBkYXRhVHlwZXNbdHlwZV07XG5cdFx0cmV0dXJuIGlzUmVhZEFjdGlvbiA/IHRoaXMuX3ZpZXdbJ2dldCcgKyB0eXBlXShieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIDogdGhpcy5fdmlld1snc2V0JyArIHR5cGVdKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9ub2RlQnVmZmVyQWN0aW9uOiBmdW5jdGlvbiAodHlwZSwgaXNSZWFkQWN0aW9uLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKSB7XG5cdFx0Ly8gTW92ZSB0aGUgaW50ZXJuYWwgb2Zmc2V0IGZvcndhcmRcblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgZGF0YVR5cGVzW3R5cGVdO1xuXHRcdHZhciBub2RlTmFtZSA9IG5vZGVOYW1pbmdbdHlwZV0gKyAoKHR5cGUgPT09ICdJbnQ4JyB8fCB0eXBlID09PSAnVWludDgnKSA/ICcnIDogbGl0dGxlRW5kaWFuID8gJ0xFJyA6ICdCRScpO1xuXHRcdGJ5dGVPZmZzZXQgKz0gdGhpcy5ieXRlT2Zmc2V0O1xuXHRcdHJldHVybiBpc1JlYWRBY3Rpb24gPyB0aGlzLmJ1ZmZlclsncmVhZCcgKyBub2RlTmFtZV0oYnl0ZU9mZnNldCkgOiB0aGlzLmJ1ZmZlclsnd3JpdGUnICsgbm9kZU5hbWVdKHZhbHVlLCBieXRlT2Zmc2V0KTtcblx0fSxcblxuXHRfYXJyYXlCdWZmZXJBY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHR2YXIgc2l6ZSA9IGRhdGFUeXBlc1t0eXBlXSwgVHlwZWRBcnJheSA9IGdsb2JhbFt0eXBlICsgJ0FycmF5J10sIHR5cGVkQXJyYXk7XG5cblx0XHRsaXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblxuXHRcdC8vIEFycmF5QnVmZmVyOiB3ZSB1c2UgYSB0eXBlZCBhcnJheSBvZiBzaXplIDEgZnJvbSBvcmlnaW5hbCBidWZmZXIgaWYgYWxpZ25tZW50IGlzIGdvb2QgYW5kIGZyb20gc2xpY2Ugd2hlbiBpdCdzIG5vdFxuXHRcdGlmIChzaXplID09PSAxIHx8ICgodGhpcy5ieXRlT2Zmc2V0ICsgYnl0ZU9mZnNldCkgJSBzaXplID09PSAwICYmIGxpdHRsZUVuZGlhbikpIHtcblx0XHRcdHR5cGVkQXJyYXkgPSBuZXcgVHlwZWRBcnJheSh0aGlzLmJ1ZmZlciwgdGhpcy5ieXRlT2Zmc2V0ICsgYnl0ZU9mZnNldCwgMSk7XG5cdFx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgc2l6ZTtcblx0XHRcdHJldHVybiBpc1JlYWRBY3Rpb24gPyB0eXBlZEFycmF5WzBdIDogKHR5cGVkQXJyYXlbMF0gPSB2YWx1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBieXRlcyA9IG5ldyBVaW50OEFycmF5KGlzUmVhZEFjdGlvbiA/IHRoaXMuZ2V0Qnl0ZXMoc2l6ZSwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKSA6IHNpemUpO1xuXHRcdFx0dHlwZWRBcnJheSA9IG5ldyBUeXBlZEFycmF5KGJ5dGVzLmJ1ZmZlciwgMCwgMSk7XG5cblx0XHRcdGlmIChpc1JlYWRBY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuIHR5cGVkQXJyYXlbMF07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0eXBlZEFycmF5WzBdID0gdmFsdWU7XG5cdFx0XHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIGJ5dGVzLCBsaXR0bGVFbmRpYW4pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblxuXHRfYXJyYXlBY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHRyZXR1cm4gaXNSZWFkQWN0aW9uID8gdGhpc1snX2dldCcgKyB0eXBlXShieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIDogdGhpc1snX3NldCcgKyB0eXBlXShieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHQvLyBIZWxwZXJzXG5cblx0X2dldEJ5dGVzOiBmdW5jdGlvbiAobGVuZ3RoLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRsaXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXHRcdGxlbmd0aCA9IGRlZmluZWQobGVuZ3RoLCB0aGlzLmJ5dGVMZW5ndGggLSBieXRlT2Zmc2V0KTtcblxuXHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIGxlbmd0aCk7XG5cblx0XHRieXRlT2Zmc2V0ICs9IHRoaXMuYnl0ZU9mZnNldDtcblxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgLSB0aGlzLmJ5dGVPZmZzZXQgKyBsZW5ndGg7XG5cblx0XHR2YXIgcmVzdWx0ID0gdGhpcy5faXNBcnJheUJ1ZmZlclxuXHRcdFx0XHRcdCA/IG5ldyBVaW50OEFycmF5KHRoaXMuYnVmZmVyLCBieXRlT2Zmc2V0LCBsZW5ndGgpXG5cdFx0XHRcdFx0IDogKHRoaXMuYnVmZmVyLnNsaWNlIHx8IEFycmF5LnByb3RvdHlwZS5zbGljZSkuY2FsbCh0aGlzLmJ1ZmZlciwgYnl0ZU9mZnNldCwgYnl0ZU9mZnNldCArIGxlbmd0aCk7XG5cblx0XHRyZXR1cm4gbGl0dGxlRW5kaWFuIHx8IGxlbmd0aCA8PSAxID8gcmVzdWx0IDogYXJyYXlGcm9tKHJlc3VsdCkucmV2ZXJzZSgpO1xuXHR9LFxuXG5cdC8vIHdyYXBwZXIgZm9yIGV4dGVybmFsIGNhbGxzIChkbyBub3QgcmV0dXJuIGlubmVyIGJ1ZmZlciBkaXJlY3RseSB0byBwcmV2ZW50IGl0J3MgbW9kaWZ5aW5nKVxuXHRnZXRCeXRlczogZnVuY3Rpb24gKGxlbmd0aCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB0b0FycmF5KSB7XG5cdFx0dmFyIHJlc3VsdCA9IHRoaXMuX2dldEJ5dGVzKGxlbmd0aCwgYnl0ZU9mZnNldCwgZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRydWUpKTtcblx0XHRyZXR1cm4gdG9BcnJheSA/IGFycmF5RnJvbShyZXN1bHQpIDogcmVzdWx0O1xuXHR9LFxuXG5cdF9zZXRCeXRlczogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGJ5dGVzLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgbGVuZ3RoID0gYnl0ZXMubGVuZ3RoO1xuXG5cdFx0Ly8gbmVlZGVkIGZvciBPcGVyYVxuXHRcdGlmIChsZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsaXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXG5cdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgbGVuZ3RoKTtcblxuXHRcdGlmICghbGl0dGxlRW5kaWFuICYmIGxlbmd0aCA+IDEpIHtcblx0XHRcdGJ5dGVzID0gYXJyYXlGcm9tKGJ5dGVzLCB0cnVlKS5yZXZlcnNlKCk7XG5cdFx0fVxuXG5cdFx0Ynl0ZU9mZnNldCArPSB0aGlzLmJ5dGVPZmZzZXQ7XG5cblx0XHRpZiAodGhpcy5faXNBcnJheUJ1ZmZlcikge1xuXHRcdFx0bmV3IFVpbnQ4QXJyYXkodGhpcy5idWZmZXIsIGJ5dGVPZmZzZXQsIGxlbmd0aCkuc2V0KGJ5dGVzKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5faXNOb2RlQnVmZmVyKSB7XG5cdFx0XHRcdG5ldyBCdWZmZXIoYnl0ZXMpLmNvcHkodGhpcy5idWZmZXIsIGJ5dGVPZmZzZXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHRoaXMuYnVmZmVyW2J5dGVPZmZzZXQgKyBpXSA9IGJ5dGVzW2ldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCAtIHRoaXMuYnl0ZU9mZnNldCArIGxlbmd0aDtcblx0fSxcblxuXHRzZXRCeXRlczogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGJ5dGVzLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBieXRlcywgZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRydWUpKTtcblx0fSxcblxuXHRnZXRTdHJpbmc6IGZ1bmN0aW9uIChieXRlTGVuZ3RoLCBieXRlT2Zmc2V0LCBlbmNvZGluZykge1xuXHRcdGlmICh0aGlzLl9pc05vZGVCdWZmZXIpIHtcblx0XHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cdFx0XHRieXRlTGVuZ3RoID0gZGVmaW5lZChieXRlTGVuZ3RoLCB0aGlzLmJ5dGVMZW5ndGggLSBieXRlT2Zmc2V0KTtcblxuXHRcdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCk7XG5cblx0XHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyBieXRlTGVuZ3RoO1xuXHRcdFx0cmV0dXJuIHRoaXMuYnVmZmVyLnRvU3RyaW5nKGVuY29kaW5nIHx8ICdiaW5hcnknLCB0aGlzLmJ5dGVPZmZzZXQgKyBieXRlT2Zmc2V0LCB0aGlzLmJ5dGVPZmZzZXQgKyB0aGlzLl9vZmZzZXQpO1xuXHRcdH1cblx0XHR2YXIgYnl0ZXMgPSB0aGlzLl9nZXRCeXRlcyhieXRlTGVuZ3RoLCBieXRlT2Zmc2V0LCB0cnVlKSwgc3RyaW5nID0gJyc7XG5cdFx0Ynl0ZUxlbmd0aCA9IGJ5dGVzLmxlbmd0aDtcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVMZW5ndGg7IGkrKykge1xuXHRcdFx0c3RyaW5nICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0pO1xuXHRcdH1cblx0XHRpZiAoZW5jb2RpbmcgPT09ICd1dGY4Jykge1xuXHRcdFx0c3RyaW5nID0gZGVjb2RlVVJJQ29tcG9uZW50KGVzY2FwZShzdHJpbmcpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0cmluZztcblx0fSxcblxuXHRzZXRTdHJpbmc6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBzdWJTdHJpbmcsIGVuY29kaW5nKSB7XG5cdFx0aWYgKHRoaXMuX2lzTm9kZUJ1ZmZlcikge1xuXHRcdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblx0XHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIHN1YlN0cmluZy5sZW5ndGgpO1xuXHRcdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIHRoaXMuYnVmZmVyLndyaXRlKHN1YlN0cmluZywgdGhpcy5ieXRlT2Zmc2V0ICsgYnl0ZU9mZnNldCwgZW5jb2RpbmcgfHwgJ2JpbmFyeScpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZW5jb2RpbmcgPT09ICd1dGY4Jykge1xuXHRcdFx0c3ViU3RyaW5nID0gdW5lc2NhcGUoZW5jb2RlVVJJQ29tcG9uZW50KHN1YlN0cmluZykpO1xuXHRcdH1cblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBnZXRDaGFyQ29kZXMoc3ViU3RyaW5nKSwgdHJ1ZSk7XG5cdH0sXG5cblx0Z2V0Q2hhcjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdHJpbmcoMSwgYnl0ZU9mZnNldCk7XG5cdH0sXG5cblx0c2V0Q2hhcjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGNoYXJhY3Rlcikge1xuXHRcdHRoaXMuc2V0U3RyaW5nKGJ5dGVPZmZzZXQsIGNoYXJhY3Rlcik7XG5cdH0sXG5cblx0dGVsbDogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzLl9vZmZzZXQ7XG5cdH0sXG5cblx0c2VlazogZnVuY3Rpb24gKGJ5dGVPZmZzZXQpIHtcblx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCAwKTtcblx0XHQvKiBqc2hpbnQgYm9zczogdHJ1ZSAqL1xuXHRcdHJldHVybiB0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0O1xuXHR9LFxuXG5cdHNraXA6IGZ1bmN0aW9uIChieXRlTGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vlayh0aGlzLl9vZmZzZXQgKyBieXRlTGVuZ3RoKTtcblx0fSxcblxuXHRzbGljZTogZnVuY3Rpb24gKHN0YXJ0LCBlbmQsIGZvcmNlQ29weSkge1xuXHRcdGZ1bmN0aW9uIG5vcm1hbGl6ZU9mZnNldChvZmZzZXQsIGJ5dGVMZW5ndGgpIHtcblx0XHRcdHJldHVybiBvZmZzZXQgPCAwID8gb2Zmc2V0ICsgYnl0ZUxlbmd0aCA6IG9mZnNldDtcblx0XHR9XG5cblx0XHRzdGFydCA9IG5vcm1hbGl6ZU9mZnNldChzdGFydCwgdGhpcy5ieXRlTGVuZ3RoKTtcblx0XHRlbmQgPSBub3JtYWxpemVPZmZzZXQoZGVmaW5lZChlbmQsIHRoaXMuYnl0ZUxlbmd0aCksIHRoaXMuYnl0ZUxlbmd0aCk7XG5cblx0XHRyZXR1cm4gZm9yY2VDb3B5XG5cdFx0XHQgICA/IG5ldyBqRGF0YVZpZXcodGhpcy5nZXRCeXRlcyhlbmQgLSBzdGFydCwgc3RhcnQsIHRydWUsIHRydWUpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5fbGl0dGxlRW5kaWFuKVxuXHRcdFx0ICAgOiBuZXcgakRhdGFWaWV3KHRoaXMuYnVmZmVyLCB0aGlzLmJ5dGVPZmZzZXQgKyBzdGFydCwgZW5kIC0gc3RhcnQsIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0YWxpZ25CeTogZnVuY3Rpb24gKGJ5dGVDb3VudCkge1xuXHRcdHRoaXMuX2JpdE9mZnNldCA9IDA7XG5cdFx0aWYgKGRlZmluZWQoYnl0ZUNvdW50LCAxKSAhPT0gMSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2tpcChieXRlQ291bnQgLSAodGhpcy5fb2Zmc2V0ICUgYnl0ZUNvdW50IHx8IGJ5dGVDb3VudCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb2Zmc2V0O1xuXHRcdH1cblx0fSxcblxuXHQvLyBDb21wYXRpYmlsaXR5IGZ1bmN0aW9uc1xuXG5cdF9nZXRGbG9hdDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGIgPSB0aGlzLl9nZXRCeXRlcyg4LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pLFxuXG5cdFx0XHRzaWduID0gMSAtICgyICogKGJbN10gPj4gNykpLFxuXHRcdFx0ZXhwb25lbnQgPSAoKCgoYls3XSA8PCAxKSAmIDB4ZmYpIDw8IDMpIHwgKGJbNl0gPj4gNCkpIC0gKCgxIDw8IDEwKSAtIDEpLFxuXG5cdFx0Ly8gQmluYXJ5IG9wZXJhdG9ycyBzdWNoIGFzIHwgYW5kIDw8IG9wZXJhdGUgb24gMzIgYml0IHZhbHVlcywgdXNpbmcgKyBhbmQgTWF0aC5wb3coMikgaW5zdGVhZFxuXHRcdFx0bWFudGlzc2EgPSAoKGJbNl0gJiAweDBmKSAqIHBvdzIoNDgpKSArIChiWzVdICogcG93Mig0MCkpICsgKGJbNF0gKiBwb3cyKDMyKSkgK1xuXHRcdFx0XHRcdFx0KGJbM10gKiBwb3cyKDI0KSkgKyAoYlsyXSAqIHBvdzIoMTYpKSArIChiWzFdICogcG93Mig4KSkgKyBiWzBdO1xuXG5cdFx0aWYgKGV4cG9uZW50ID09PSAxMDI0KSB7XG5cdFx0XHRpZiAobWFudGlzc2EgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIE5hTjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBzaWduICogSW5maW5pdHk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGV4cG9uZW50ID09PSAtMTAyMykgeyAvLyBEZW5vcm1hbGl6ZWRcblx0XHRcdHJldHVybiBzaWduICogbWFudGlzc2EgKiBwb3cyKC0xMDIyIC0gNTIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzaWduICogKDEgKyBtYW50aXNzYSAqIHBvdzIoLTUyKSkgKiBwb3cyKGV4cG9uZW50KTtcblx0fSxcblxuXHRfZ2V0RmxvYXQzMjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBiID0gdGhpcy5fZ2V0Qnl0ZXMoNCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSxcblxuXHRcdFx0c2lnbiA9IDEgLSAoMiAqIChiWzNdID4+IDcpKSxcblx0XHRcdGV4cG9uZW50ID0gKCgoYlszXSA8PCAxKSAmIDB4ZmYpIHwgKGJbMl0gPj4gNykpIC0gMTI3LFxuXHRcdFx0bWFudGlzc2EgPSAoKGJbMl0gJiAweDdmKSA8PCAxNikgfCAoYlsxXSA8PCA4KSB8IGJbMF07XG5cblx0XHRpZiAoZXhwb25lbnQgPT09IDEyOCkge1xuXHRcdFx0aWYgKG1hbnRpc3NhICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiBOYU47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gc2lnbiAqIEluZmluaXR5O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleHBvbmVudCA9PT0gLTEyNykgeyAvLyBEZW5vcm1hbGl6ZWRcblx0XHRcdHJldHVybiBzaWduICogbWFudGlzc2EgKiBwb3cyKC0xMjYgLSAyMyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNpZ24gKiAoMSArIG1hbnRpc3NhICogcG93MigtMjMpKSAqIHBvdzIoZXhwb25lbnQpO1xuXHR9LFxuXG5cdF9nZXQ2NDogZnVuY3Rpb24gKFR5cGUsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cblx0XHR2YXIgcGFydHMgPSBsaXR0bGVFbmRpYW4gPyBbMCwgNF0gOiBbNCwgMF07XG5cblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IDI7IGkrKykge1xuXHRcdFx0cGFydHNbaV0gPSB0aGlzLmdldFVpbnQzMihieXRlT2Zmc2V0ICsgcGFydHNbaV0sIGxpdHRsZUVuZGlhbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIDg7XG5cblx0XHRyZXR1cm4gbmV3IFR5cGUocGFydHNbMF0sIHBhcnRzWzFdKTtcblx0fSxcblxuXHRnZXRJbnQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHJldHVybiB0aGlzLl9nZXQ2NChJbnQ2NCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRnZXRVaW50NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0NjQoVWludDY0LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9nZXRJbnQzMjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBiID0gdGhpcy5fZ2V0Qnl0ZXMoNCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKTtcblx0XHRyZXR1cm4gKGJbM10gPDwgMjQpIHwgKGJbMl0gPDwgMTYpIHwgKGJbMV0gPDwgOCkgfCBiWzBdO1xuXHR9LFxuXG5cdF9nZXRVaW50MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0SW50MzIoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSA+Pj4gMDtcblx0fSxcblxuXHRfZ2V0SW50MTY6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRyZXR1cm4gKHRoaXMuX2dldFVpbnQxNihieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIDw8IDE2KSA+PiAxNjtcblx0fSxcblxuXHRfZ2V0VWludDE2OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGIgPSB0aGlzLl9nZXRCeXRlcygyLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHRcdHJldHVybiAoYlsxXSA8PCA4KSB8IGJbMF07XG5cdH0sXG5cblx0X2dldEludDg6IGZ1bmN0aW9uIChieXRlT2Zmc2V0KSB7XG5cdFx0cmV0dXJuICh0aGlzLl9nZXRVaW50OChieXRlT2Zmc2V0KSA8PCAyNCkgPj4gMjQ7XG5cdH0sXG5cblx0X2dldFVpbnQ4OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCkge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCeXRlcygxLCBieXRlT2Zmc2V0KVswXTtcblx0fSxcblxuXHRfZ2V0Qml0UmFuZ2VEYXRhOiBmdW5jdGlvbiAoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KSB7XG5cdFx0dmFyIHN0YXJ0Qml0ID0gKGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KSA8PCAzKSArIHRoaXMuX2JpdE9mZnNldCxcblx0XHRcdGVuZEJpdCA9IHN0YXJ0Qml0ICsgYml0TGVuZ3RoLFxuXHRcdFx0c3RhcnQgPSBzdGFydEJpdCA+Pj4gMyxcblx0XHRcdGVuZCA9IChlbmRCaXQgKyA3KSA+Pj4gMyxcblx0XHRcdGIgPSB0aGlzLl9nZXRCeXRlcyhlbmQgLSBzdGFydCwgc3RhcnQsIHRydWUpLFxuXHRcdFx0d2lkZVZhbHVlID0gMDtcblxuXHRcdC8qIGpzaGludCBib3NzOiB0cnVlICovXG5cdFx0aWYgKHRoaXMuX2JpdE9mZnNldCA9IGVuZEJpdCAmIDcpIHtcblx0XHRcdHRoaXMuX2JpdE9mZnNldCAtPSA4O1xuXHRcdH1cblxuXHRcdGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBiLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHR3aWRlVmFsdWUgPSAod2lkZVZhbHVlIDw8IDgpIHwgYltpXTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnQ6IHN0YXJ0LFxuXHRcdFx0Ynl0ZXM6IGIsXG5cdFx0XHR3aWRlVmFsdWU6IHdpZGVWYWx1ZVxuXHRcdH07XG5cdH0sXG5cblx0Z2V0U2lnbmVkOiBmdW5jdGlvbiAoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KSB7XG5cdFx0dmFyIHNoaWZ0ID0gMzIgLSBiaXRMZW5ndGg7XG5cdFx0cmV0dXJuICh0aGlzLmdldFVuc2lnbmVkKGJpdExlbmd0aCwgYnl0ZU9mZnNldCkgPDwgc2hpZnQpID4+IHNoaWZ0O1xuXHR9LFxuXG5cdGdldFVuc2lnbmVkOiBmdW5jdGlvbiAoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KSB7XG5cdFx0dmFyIHZhbHVlID0gdGhpcy5fZ2V0Qml0UmFuZ2VEYXRhKGJpdExlbmd0aCwgYnl0ZU9mZnNldCkud2lkZVZhbHVlID4+PiAtdGhpcy5fYml0T2Zmc2V0O1xuXHRcdHJldHVybiBiaXRMZW5ndGggPCAzMiA/ICh2YWx1ZSAmIH4oLTEgPDwgYml0TGVuZ3RoKSkgOiB2YWx1ZTtcblx0fSxcblxuXHRfc2V0QmluYXJ5RmxvYXQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbWFudFNpemUsIGV4cFNpemUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBzaWduQml0ID0gdmFsdWUgPCAwID8gMSA6IDAsXG5cdFx0XHRleHBvbmVudCxcblx0XHRcdG1hbnRpc3NhLFxuXHRcdFx0ZU1heCA9IH4oLTEgPDwgKGV4cFNpemUgLSAxKSksXG5cdFx0XHRlTWluID0gMSAtIGVNYXg7XG5cblx0XHRpZiAodmFsdWUgPCAwKSB7XG5cdFx0XHR2YWx1ZSA9IC12YWx1ZTtcblx0XHR9XG5cblx0XHRpZiAodmFsdWUgPT09IDApIHtcblx0XHRcdGV4cG9uZW50ID0gMDtcblx0XHRcdG1hbnRpc3NhID0gMDtcblx0XHR9IGVsc2UgaWYgKGlzTmFOKHZhbHVlKSkge1xuXHRcdFx0ZXhwb25lbnQgPSAyICogZU1heCArIDE7XG5cdFx0XHRtYW50aXNzYSA9IDE7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gSW5maW5pdHkpIHtcblx0XHRcdGV4cG9uZW50ID0gMiAqIGVNYXggKyAxO1xuXHRcdFx0bWFudGlzc2EgPSAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRleHBvbmVudCA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuXHRcdFx0aWYgKGV4cG9uZW50ID49IGVNaW4gJiYgZXhwb25lbnQgPD0gZU1heCkge1xuXHRcdFx0XHRtYW50aXNzYSA9IE1hdGguZmxvb3IoKHZhbHVlICogcG93MigtZXhwb25lbnQpIC0gMSkgKiBwb3cyKG1hbnRTaXplKSk7XG5cdFx0XHRcdGV4cG9uZW50ICs9IGVNYXg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtYW50aXNzYSA9IE1hdGguZmxvb3IodmFsdWUgLyBwb3cyKGVNaW4gLSBtYW50U2l6ZSkpO1xuXHRcdFx0XHRleHBvbmVudCA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dmFyIGIgPSBbXTtcblx0XHR3aGlsZSAobWFudFNpemUgPj0gOCkge1xuXHRcdFx0Yi5wdXNoKG1hbnRpc3NhICUgMjU2KTtcblx0XHRcdG1hbnRpc3NhID0gTWF0aC5mbG9vcihtYW50aXNzYSAvIDI1Nik7XG5cdFx0XHRtYW50U2l6ZSAtPSA4O1xuXHRcdH1cblx0XHRleHBvbmVudCA9IChleHBvbmVudCA8PCBtYW50U2l6ZSkgfCBtYW50aXNzYTtcblx0XHRleHBTaXplICs9IG1hbnRTaXplO1xuXHRcdHdoaWxlIChleHBTaXplID49IDgpIHtcblx0XHRcdGIucHVzaChleHBvbmVudCAmIDB4ZmYpO1xuXHRcdFx0ZXhwb25lbnQgPj4+PSA4O1xuXHRcdFx0ZXhwU2l6ZSAtPSA4O1xuXHRcdH1cblx0XHRiLnB1c2goKHNpZ25CaXQgPDwgZXhwU2l6ZSkgfCBleHBvbmVudCk7XG5cblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBiLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRGbG9hdDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJpbmFyeUZsb2F0KGJ5dGVPZmZzZXQsIHZhbHVlLCAyMywgOCwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0RmxvYXQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXRCaW5hcnlGbG9hdChieXRlT2Zmc2V0LCB2YWx1ZSwgNTIsIDExLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXQ2NDogZnVuY3Rpb24gKFR5cGUsIGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHRpZiAoISh2YWx1ZSBpbnN0YW5jZW9mIFR5cGUpKSB7XG5cdFx0XHR2YWx1ZSA9IFR5cGUuZnJvbU51bWJlcih2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0bGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblxuXHRcdHZhciBwYXJ0cyA9IGxpdHRsZUVuZGlhbiA/IHtsbzogMCwgaGk6IDR9IDoge2xvOiA0LCBoaTogMH07XG5cblx0XHRmb3IgKHZhciBwYXJ0TmFtZSBpbiBwYXJ0cykge1xuXHRcdFx0dGhpcy5zZXRVaW50MzIoYnl0ZU9mZnNldCArIHBhcnRzW3BhcnROYW1lXSwgdmFsdWVbcGFydE5hbWVdLCBsaXR0bGVFbmRpYW4pO1xuXHRcdH1cblxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyA4O1xuXHR9LFxuXG5cdHNldEludDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldDY0KEludDY0LCBieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRzZXRVaW50NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0NjQoVWludDY0LCBieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0VWludDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIFtcblx0XHRcdHZhbHVlICYgMHhmZixcblx0XHRcdCh2YWx1ZSA+Pj4gOCkgJiAweGZmLFxuXHRcdFx0KHZhbHVlID4+PiAxNikgJiAweGZmLFxuXHRcdFx0dmFsdWUgPj4+IDI0XG5cdFx0XSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0VWludDE2OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIFtcblx0XHRcdHZhbHVlICYgMHhmZixcblx0XHRcdCh2YWx1ZSA+Pj4gOCkgJiAweGZmXG5cdFx0XSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0VWludDg6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSkge1xuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIFt2YWx1ZSAmIDB4ZmZdKTtcblx0fSxcblxuXHRzZXRVbnNpZ25lZDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBiaXRMZW5ndGgpIHtcblx0XHR2YXIgZGF0YSA9IHRoaXMuX2dldEJpdFJhbmdlRGF0YShiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpLFxuXHRcdFx0d2lkZVZhbHVlID0gZGF0YS53aWRlVmFsdWUsXG5cdFx0XHRiID0gZGF0YS5ieXRlcztcblxuXHRcdHdpZGVWYWx1ZSAmPSB+KH4oLTEgPDwgYml0TGVuZ3RoKSA8PCAtdGhpcy5fYml0T2Zmc2V0KTsgLy8gY2xlYXJpbmcgYml0IHJhbmdlIGJlZm9yZSBiaW5hcnkgXCJvclwiXG5cdFx0d2lkZVZhbHVlIHw9IChiaXRMZW5ndGggPCAzMiA/ICh2YWx1ZSAmIH4oLTEgPDwgYml0TGVuZ3RoKSkgOiB2YWx1ZSkgPDwgLXRoaXMuX2JpdE9mZnNldDsgLy8gc2V0dGluZyBiaXRzXG5cblx0XHRmb3IgKHZhciBpID0gYi5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0YltpXSA9IHdpZGVWYWx1ZSAmIDB4ZmY7XG5cdFx0XHR3aWRlVmFsdWUgPj4+PSA4O1xuXHRcdH1cblxuXHRcdHRoaXMuX3NldEJ5dGVzKGRhdGEuc3RhcnQsIGIsIHRydWUpO1xuXHR9XG59O1xuXG52YXIgcHJvdG8gPSBqRGF0YVZpZXcucHJvdG90eXBlO1xuXG5mb3IgKHZhciB0eXBlIGluIGRhdGFUeXBlcykge1xuXHQoZnVuY3Rpb24gKHR5cGUpIHtcblx0XHRwcm90b1snZ2V0JyArIHR5cGVdID0gZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdGlvbih0eXBlLCB0cnVlLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHRcdH07XG5cdFx0cHJvdG9bJ3NldCcgKyB0eXBlXSA9IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0XHR0aGlzLl9hY3Rpb24odHlwZSwgZmFsc2UsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpO1xuXHRcdH07XG5cdH0pKHR5cGUpO1xufVxuXG5wcm90by5fc2V0SW50MzIgPSBwcm90by5fc2V0VWludDMyO1xucHJvdG8uX3NldEludDE2ID0gcHJvdG8uX3NldFVpbnQxNjtcbnByb3RvLl9zZXRJbnQ4ID0gcHJvdG8uX3NldFVpbnQ4O1xucHJvdG8uc2V0U2lnbmVkID0gcHJvdG8uc2V0VW5zaWduZWQ7XG5cbmZvciAodmFyIG1ldGhvZCBpbiBwcm90bykge1xuXHRpZiAobWV0aG9kLnNsaWNlKDAsIDMpID09PSAnc2V0Jykge1xuXHRcdChmdW5jdGlvbiAodHlwZSkge1xuXHRcdFx0cHJvdG9bJ3dyaXRlJyArIHR5cGVdID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRBcnJheS5wcm90b3R5cGUudW5zaGlmdC5jYWxsKGFyZ3VtZW50cywgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpc1snc2V0JyArIHR5cGVdLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0XHR9O1xuXHRcdH0pKG1ldGhvZC5zbGljZSgzKSk7XG5cdH1cbn1cblxuaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBtb2R1bGUuZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcblx0bW9kdWxlLmV4cG9ydHMgPSBqRGF0YVZpZXc7XG59IGVsc2VcbmlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcblx0ZGVmaW5lKFtdLCBmdW5jdGlvbiAoKSB7IHJldHVybiBqRGF0YVZpZXcgfSk7XG59IGVsc2Uge1xuXHR2YXIgb2xkR2xvYmFsID0gZ2xvYmFsLmpEYXRhVmlldztcblx0KGdsb2JhbC5qRGF0YVZpZXcgPSBqRGF0YVZpZXcpLm5vQ29uZmxpY3QgPSBmdW5jdGlvbiAoKSB7XG5cdFx0Z2xvYmFsLmpEYXRhVmlldyA9IG9sZEdsb2JhbDtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcbn1cblxufSkoKGZ1bmN0aW9uICgpIHsgLyoganNoaW50IHN0cmljdDogZmFsc2UgKi8gcmV0dXJuIHRoaXMgfSkoKSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIpIixudWxsLCJ2YXIgYmFzZTY0ID0gcmVxdWlyZSgnYmFzZTY0LWpzJylcbnZhciBpZWVlNzU0ID0gcmVxdWlyZSgnaWVlZTc1NCcpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MlxuXG4vKipcbiAqIElmIGBCdWZmZXIuX3VzZVR5cGVkQXJyYXlzYDpcbiAqICAgPT09IHRydWUgICAgVXNlIFVpbnQ4QXJyYXkgaW1wbGVtZW50YXRpb24gKGZhc3Rlc3QpXG4gKiAgID09PSBmYWxzZSAgIFVzZSBPYmplY3QgaW1wbGVtZW50YXRpb24gKGNvbXBhdGlibGUgZG93biB0byBJRTYpXG4gKi9cbkJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgPSAoZnVuY3Rpb24gKCkge1xuICAgLy8gRGV0ZWN0IGlmIGJyb3dzZXIgc3VwcG9ydHMgVHlwZWQgQXJyYXlzLiBTdXBwb3J0ZWQgYnJvd3NlcnMgYXJlIElFIDEwKyxcbiAgIC8vIEZpcmVmb3ggNCssIENocm9tZSA3KywgU2FmYXJpIDUuMSssIE9wZXJhIDExLjYrLCBpT1MgNC4yKy5cbiAgIGlmICh0eXBlb2YgVWludDhBcnJheSA9PT0gJ3VuZGVmaW5lZCcgfHwgdHlwZW9mIEFycmF5QnVmZmVyID09PSAndW5kZWZpbmVkJylcbiAgICAgIHJldHVybiBmYWxzZVxuXG4gIC8vIERvZXMgdGhlIGJyb3dzZXIgc3VwcG9ydCBhZGRpbmcgcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzPyBJZlxuICAvLyBub3QsIHRoZW4gdGhhdCdzIHRoZSBzYW1lIGFzIG5vIGBVaW50OEFycmF5YCBzdXBwb3J0LiBXZSBuZWVkIHRvIGJlIGFibGUgdG9cbiAgLy8gYWRkIGFsbCB0aGUgbm9kZSBCdWZmZXIgQVBJIG1ldGhvZHMuXG4gIC8vIFJlbGV2YW50IEZpcmVmb3ggYnVnOiBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTU0MzhcbiAgdHJ5IHtcbiAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoMClcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpICYmXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgLy8gQ2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSkoKVxuXG4vKipcbiAqIENsYXNzOiBCdWZmZXJcbiAqID09PT09PT09PT09PT1cbiAqXG4gKiBUaGUgQnVmZmVyIGNvbnN0cnVjdG9yIHJldHVybnMgaW5zdGFuY2VzIG9mIGBVaW50OEFycmF5YCB0aGF0IGFyZSBhdWdtZW50ZWRcbiAqIHdpdGggZnVuY3Rpb24gcHJvcGVydGllcyBmb3IgYWxsIHRoZSBub2RlIGBCdWZmZXJgIEFQSSBmdW5jdGlvbnMuIFdlIHVzZVxuICogYFVpbnQ4QXJyYXlgIHNvIHRoYXQgc3F1YXJlIGJyYWNrZXQgbm90YXRpb24gd29ya3MgYXMgZXhwZWN0ZWQgLS0gaXQgcmV0dXJuc1xuICogYSBzaW5nbGUgb2N0ZXQuXG4gKlxuICogQnkgYXVnbWVudGluZyB0aGUgaW5zdGFuY2VzLCB3ZSBjYW4gYXZvaWQgbW9kaWZ5aW5nIHRoZSBgVWludDhBcnJheWBcbiAqIHByb3RvdHlwZS5cbiAqL1xuZnVuY3Rpb24gQnVmZmVyIChzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBCdWZmZXIpKVxuICAgIHJldHVybiBuZXcgQnVmZmVyKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pXG5cbiAgdmFyIHR5cGUgPSB0eXBlb2Ygc3ViamVjdFxuXG4gIC8vIFdvcmthcm91bmQ6IG5vZGUncyBiYXNlNjQgaW1wbGVtZW50YXRpb24gYWxsb3dzIGZvciBub24tcGFkZGVkIHN0cmluZ3NcbiAgLy8gd2hpbGUgYmFzZTY0LWpzIGRvZXMgbm90LlxuICBpZiAoZW5jb2RpbmcgPT09ICdiYXNlNjQnICYmIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgc3ViamVjdCA9IHN0cmluZ3RyaW0oc3ViamVjdClcbiAgICB3aGlsZSAoc3ViamVjdC5sZW5ndGggJSA0ICE9PSAwKSB7XG4gICAgICBzdWJqZWN0ID0gc3ViamVjdCArICc9J1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpbmQgdGhlIGxlbmd0aFxuICB2YXIgbGVuZ3RoXG4gIGlmICh0eXBlID09PSAnbnVtYmVyJylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdClcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpXG4gICAgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoc3ViamVjdCwgZW5jb2RpbmcpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0Lmxlbmd0aCkgLy8gQXNzdW1lIG9iamVjdCBpcyBhbiBhcnJheVxuICBlbHNlXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGaXJzdCBhcmd1bWVudCBuZWVkcyB0byBiZSBhIG51bWJlciwgYXJyYXkgb3Igc3RyaW5nLicpXG5cbiAgdmFyIGJ1ZlxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBhdWdtZW50KG5ldyBVaW50OEFycmF5KGxlbmd0aCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gRmFsbGJhY2s6IFJldHVybiBUSElTIGluc3RhbmNlIG9mIEJ1ZmZlciAoY3JlYXRlZCBieSBgbmV3YClcbiAgICBidWYgPSB0aGlzXG4gICAgYnVmLmxlbmd0aCA9IGxlbmd0aFxuICAgIGJ1Zi5faXNCdWZmZXIgPSB0cnVlXG4gIH1cblxuICB2YXIgaVxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiB0eXBlb2YgVWludDhBcnJheSA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgc3ViamVjdCBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpIHtcbiAgICAvLyBTcGVlZCBvcHRpbWl6YXRpb24gLS0gdXNlIHNldCBpZiB3ZSdyZSBjb3B5aW5nIGZyb20gYSBVaW50OEFycmF5XG4gICAgYnVmLl9zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgICAgZWxzZVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0W2ldXG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmICFub1plcm8pIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGJ1ZltpXSA9IDBcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmXG59XG5cbi8vIFNUQVRJQyBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gKGIpIHtcbiAgcmV0dXJuICEhKGIgIT09IG51bGwgJiYgYiAhPT0gdW5kZWZpbmVkICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGZ1bmN0aW9uIChzdHIsIGVuY29kaW5nKSB7XG4gIHZhciByZXRcbiAgc3RyID0gc3RyICsgJydcbiAgc3dpdGNoIChlbmNvZGluZyB8fCAndXRmOCcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAvIDJcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAncmF3JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IGJhc2U2NFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggKiAyXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBhc3NlcnQoaXNBcnJheShsaXN0KSwgJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3QsIFt0b3RhbExlbmd0aF0pXFxuJyArXG4gICAgICAnbGlzdCBzaG91bGQgYmUgYW4gQXJyYXkuJylcblxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcigwKVxuICB9IGVsc2UgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGxpc3RbMF1cbiAgfVxuXG4gIHZhciBpXG4gIGlmICh0eXBlb2YgdG90YWxMZW5ndGggIT09ICdudW1iZXInKSB7XG4gICAgdG90YWxMZW5ndGggPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRvdGFsTGVuZ3RoICs9IGxpc3RbaV0ubGVuZ3RoXG4gICAgfVxuICB9XG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIodG90YWxMZW5ndGgpXG4gIHZhciBwb3MgPSAwXG4gIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBsaXN0W2ldXG4gICAgaXRlbS5jb3B5KGJ1ZiwgcG9zKVxuICAgIHBvcyArPSBpdGVtLmxlbmd0aFxuICB9XG4gIHJldHVybiBidWZcbn1cblxuLy8gQlVGRkVSIElOU1RBTkNFIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIF9oZXhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IGJ1Zi5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuXG4gIC8vIG11c3QgYmUgYW4gZXZlbiBudW1iZXIgb2YgZGlnaXRzXG4gIHZhciBzdHJMZW4gPSBzdHJpbmcubGVuZ3RoXG4gIGFzc2VydChzdHJMZW4gJSAyID09PSAwLCAnSW52YWxpZCBoZXggc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGJ5dGUgPSBwYXJzZUludChzdHJpbmcuc3Vic3RyKGkgKiAyLCAyKSwgMTYpXG4gICAgYXNzZXJ0KCFpc05hTihieXRlKSwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG4gICAgYnVmW29mZnNldCArIGldID0gYnl0ZVxuICB9XG4gIEJ1ZmZlci5fY2hhcnNXcml0dGVuID0gaSAqIDJcbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gX3V0ZjhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGY4VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGFzY2lpVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBfYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihiYXNlNjRUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldHVybiBfaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAndWNzMic6IC8vIFRPRE86IE5vIHN1cHBvcnQgZm9yIHVjczIgb3IgdXRmMTZsZSBlbmNvZGluZ3MgeWV0XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiBfdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0dXJuIF9hc2NpaVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldHVybiBfYmluYXJ5V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0dXJuIF9iYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG4gIHN0YXJ0ID0gTnVtYmVyKHN0YXJ0KSB8fCAwXG4gIGVuZCA9IChlbmQgIT09IHVuZGVmaW5lZClcbiAgICA/IE51bWJlcihlbmQpXG4gICAgOiBlbmQgPSBzZWxmLmxlbmd0aFxuXG4gIC8vIEZhc3RwYXRoIGVtcHR5IHN0cmluZ3NcbiAgaWYgKGVuZCA9PT0gc3RhcnQpXG4gICAgcmV0dXJuICcnXG5cbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXR1cm4gX2hleFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ3VjczInOiAvLyBUT0RPOiBObyBzdXBwb3J0IGZvciB1Y3MyIG9yIHV0ZjE2bGUgZW5jb2RpbmdzIHlldFxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXR1cm4gX3V0ZjhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldHVybiBfYXNjaWlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXR1cm4gX2JpbmFyeVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldHVybiBfYmFzZTY0U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG4vLyBjb3B5KHRhcmdldEJ1ZmZlciwgdGFyZ2V0U3RhcnQ9MCwgc291cmNlU3RhcnQ9MCwgc291cmNlRW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmNvcHkgPSBmdW5jdGlvbiAodGFyZ2V0LCB0YXJnZXRfc3RhcnQsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNvdXJjZSA9IHRoaXNcblxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgJiYgZW5kICE9PSAwKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoIXRhcmdldF9zdGFydCkgdGFyZ2V0X3N0YXJ0ID0gMFxuXG4gIC8vIENvcHkgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0YXJnZXQubGVuZ3RoID09PSAwIHx8IHNvdXJjZS5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIC8vIEZhdGFsIGVycm9yIGNvbmRpdGlvbnNcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ3NvdXJjZUVuZCA8IHNvdXJjZVN0YXJ0JylcbiAgYXNzZXJ0KHRhcmdldF9zdGFydCA+PSAwICYmIHRhcmdldF9zdGFydCA8IHRhcmdldC5sZW5ndGgsXG4gICAgICAndGFyZ2V0U3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgc291cmNlLmxlbmd0aCwgJ3NvdXJjZVN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VFbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgLy8gQXJlIHdlIG9vYj9cbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKVxuICAgIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICh0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0IDwgZW5kIC0gc3RhcnQpXG4gICAgZW5kID0gdGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCArIHN0YXJ0XG5cbiAgLy8gY29weSFcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBlbmQgLSBzdGFydDsgaSsrKVxuICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBpZiAoc3RhcnQgPT09IDAgJiYgZW5kID09PSBidWYubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1ZilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmLnNsaWNlKHN0YXJ0LCBlbmQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIF91dGY4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmVzID0gJydcbiAgdmFyIHRtcCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIGlmIChidWZbaV0gPD0gMHg3Rikge1xuICAgICAgcmVzICs9IGRlY29kZVV0ZjhDaGFyKHRtcCkgKyBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgICAgIHRtcCA9ICcnXG4gICAgfSBlbHNlIHtcbiAgICAgIHRtcCArPSAnJScgKyBidWZbaV0udG9TdHJpbmcoMTYpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlcyArIGRlY29kZVV0ZjhDaGFyKHRtcClcbn1cblxuZnVuY3Rpb24gX2FzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKVxuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgcmV0dXJuIHJldFxufVxuXG5mdW5jdGlvbiBfYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gX2FzY2lpU2xpY2UoYnVmLCBzdGFydCwgZW5kKVxufVxuXG5mdW5jdGlvbiBfaGV4U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuXG4gIGlmICghc3RhcnQgfHwgc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKCFlbmQgfHwgZW5kIDwgMCB8fCBlbmQgPiBsZW4pIGVuZCA9IGxlblxuXG4gIHZhciBvdXQgPSAnJ1xuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIG91dCArPSB0b0hleChidWZbaV0pXG4gIH1cbiAgcmV0dXJuIG91dFxufVxuXG4vLyBodHRwOi8vbm9kZWpzLm9yZy9hcGkvYnVmZmVyLmh0bWwjYnVmZmVyX2J1Zl9zbGljZV9zdGFydF9lbmRcbkJ1ZmZlci5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgc3RhcnQgPSBjbGFtcChzdGFydCwgbGVuLCAwKVxuICBlbmQgPSBjbGFtcChlbmQsIGxlbiwgbGVuKVxuXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgcmV0dXJuIGF1Z21lbnQodGhpcy5zdWJhcnJheShzdGFydCwgZW5kKSlcbiAgfSBlbHNlIHtcbiAgICB2YXIgc2xpY2VMZW4gPSBlbmQgLSBzdGFydFxuICAgIHZhciBuZXdCdWYgPSBuZXcgQnVmZmVyKHNsaWNlTGVuLCB1bmRlZmluZWQsIHRydWUpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbGljZUxlbjsgaSsrKSB7XG4gICAgICBuZXdCdWZbaV0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gICAgcmV0dXJuIG5ld0J1ZlxuICB9XG59XG5cbi8vIGBnZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5nZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLnJlYWRVSW50OChvZmZzZXQpXG59XG5cbi8vIGBzZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uICh2LCBvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5zZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLndyaXRlVUludDgodiwgb2Zmc2V0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgfSBlbHNlIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAyXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gICAgdmFsIHw9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldCArIDNdIDw8IDI0ID4+PiAwKVxuICB9IGVsc2Uge1xuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDFdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDJdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgM11cbiAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldF0gPDwgMjQgPj4+IDApXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLFxuICAgICAgICAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgdmFyIG5lZyA9IHRoaXNbb2Zmc2V0XSAmIDB4ODBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MTYoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDMyKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDAwMDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmZmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEZsb2F0IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdEJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRG91YmxlIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZilcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpIHJldHVyblxuXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmZmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDQpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlID4+PiAobGl0dGxlRW5kaWFuID8gaSA6IDMgLSBpKSAqIDgpICYgMHhmZlxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmLCAtMHg4MClcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgdGhpcy53cml0ZVVJbnQ4KHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgdGhpcy53cml0ZVVJbnQ4KDB4ZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZiwgLTB4ODAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQxNihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MTYoYnVmLCAweGZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MzIoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgMHhmZmZmZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVGbG9hdCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAzLjQwMjgyMzQ2NjM4NTI4ODZlKzM4LCAtMy40MDI4MjM0NjYzODUyODg2ZSszOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsXG4gICAgICAgICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgsIC0xLjc5NzY5MzEzNDg2MjMxNTdFKzMwOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gZmlsbCh2YWx1ZSwgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiAodmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCF2YWx1ZSkgdmFsdWUgPSAwXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCkgZW5kID0gdGhpcy5sZW5ndGhcblxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHZhbHVlID0gdmFsdWUuY2hhckNvZGVBdCgwKVxuICB9XG5cbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgIWlzTmFOKHZhbHVlKSwgJ3ZhbHVlIGlzIG5vdCBhIG51bWJlcicpXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdlbmQgPCBzdGFydCcpXG5cbiAgLy8gRmlsbCAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHRoaXMubGVuZ3RoLCAnc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gdGhpcy5sZW5ndGgsICdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICB0aGlzW2ldID0gdmFsdWVcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBvdXQgPSBbXVxuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIG91dFtpXSA9IHRvSGV4KHRoaXNbaV0pXG4gICAgaWYgKGkgPT09IGV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMpIHtcbiAgICAgIG91dFtpICsgMV0gPSAnLi4uJ1xuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICc8QnVmZmVyICcgKyBvdXQuam9pbignICcpICsgJz4nXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgQXJyYXlCdWZmZXJgIHdpdGggdGhlICpjb3BpZWQqIG1lbW9yeSBvZiB0aGUgYnVmZmVyIGluc3RhbmNlLlxuICogQWRkZWQgaW4gTm9kZSAwLjEyLiBPbmx5IGF2YWlsYWJsZSBpbiBicm93c2VycyB0aGF0IHN1cHBvcnQgQXJyYXlCdWZmZXIuXG4gKi9cbkJ1ZmZlci5wcm90b3R5cGUudG9BcnJheUJ1ZmZlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiBVaW50OEFycmF5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAgIHJldHVybiAobmV3IEJ1ZmZlcih0aGlzKSkuYnVmZmVyXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBidWYgPSBuZXcgVWludDhBcnJheSh0aGlzLmxlbmd0aClcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBidWYubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDEpXG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignQnVmZmVyLnRvQXJyYXlCdWZmZXIgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGJyb3dzZXInKVxuICB9XG59XG5cbi8vIEhFTFBFUiBGVU5DVElPTlNcbi8vID09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxudmFyIEJQID0gQnVmZmVyLnByb3RvdHlwZVxuXG4vKipcbiAqIEF1Z21lbnQgdGhlIFVpbnQ4QXJyYXkgKmluc3RhbmNlKiAobm90IHRoZSBjbGFzcyEpIHdpdGggQnVmZmVyIG1ldGhvZHNcbiAqL1xuZnVuY3Rpb24gYXVnbWVudCAoYXJyKSB7XG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG4vLyBzbGljZShzdGFydCwgZW5kKVxuZnVuY3Rpb24gY2xhbXAgKGluZGV4LCBsZW4sIGRlZmF1bHRWYWx1ZSkge1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSAnbnVtYmVyJykgcmV0dXJuIGRlZmF1bHRWYWx1ZVxuICBpbmRleCA9IH5+aW5kZXg7ICAvLyBDb2VyY2UgdG8gaW50ZWdlci5cbiAgaWYgKGluZGV4ID49IGxlbikgcmV0dXJuIGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIGluZGV4ICs9IGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGNvZXJjZSAobGVuZ3RoKSB7XG4gIC8vIENvZXJjZSBsZW5ndGggdG8gYSBudW1iZXIgKHBvc3NpYmx5IE5hTiksIHJvdW5kIHVwXG4gIC8vIGluIGNhc2UgaXQncyBmcmFjdGlvbmFsIChlLmcuIDEyMy40NTYpIHRoZW4gZG8gYVxuICAvLyBkb3VibGUgbmVnYXRlIHRvIGNvZXJjZSBhIE5hTiB0byAwLiBFYXN5LCByaWdodD9cbiAgbGVuZ3RoID0gfn5NYXRoLmNlaWwoK2xlbmd0aClcbiAgcmV0dXJuIGxlbmd0aCA8IDAgPyAwIDogbGVuZ3RoXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXkgKHN1YmplY3QpIHtcbiAgcmV0dXJuIChBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChzdWJqZWN0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzdWJqZWN0KSA9PT0gJ1tvYmplY3QgQXJyYXldJ1xuICB9KShzdWJqZWN0KVxufVxuXG5mdW5jdGlvbiBpc0FycmF5aXNoIChzdWJqZWN0KSB7XG4gIHJldHVybiBpc0FycmF5KHN1YmplY3QpIHx8IEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSB8fFxuICAgICAgc3ViamVjdCAmJiB0eXBlb2Ygc3ViamVjdCA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHR5cGVvZiBzdWJqZWN0Lmxlbmd0aCA9PT0gJ251bWJlcidcbn1cblxuZnVuY3Rpb24gdG9IZXggKG4pIHtcbiAgaWYgKG4gPCAxNikgcmV0dXJuICcwJyArIG4udG9TdHJpbmcoMTYpXG4gIHJldHVybiBuLnRvU3RyaW5nKDE2KVxufVxuXG5mdW5jdGlvbiB1dGY4VG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIHZhciBiID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBpZiAoYiA8PSAweDdGKVxuICAgICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkpXG4gICAgZWxzZSB7XG4gICAgICB2YXIgc3RhcnQgPSBpXG4gICAgICBpZiAoYiA+PSAweEQ4MDAgJiYgYiA8PSAweERGRkYpIGkrK1xuICAgICAgdmFyIGggPSBlbmNvZGVVUklDb21wb25lbnQoc3RyLnNsaWNlKHN0YXJ0LCBpKzEpKS5zdWJzdHIoMSkuc3BsaXQoJyUnKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBoLmxlbmd0aDsgaisrKVxuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYmFzZTY0VG9CeXRlcyAoc3RyKSB7XG4gIHJldHVybiBiYXNlNjQudG9CeXRlQXJyYXkoc3RyKVxufVxuXG5mdW5jdGlvbiBibGl0QnVmZmVyIChzcmMsIGRzdCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIHBvc1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChpICsgb2Zmc2V0ID49IGRzdC5sZW5ndGgpIHx8IChpID49IHNyYy5sZW5ndGgpKVxuICAgICAgYnJlYWtcbiAgICBkc3RbaSArIG9mZnNldF0gPSBzcmNbaV1cbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBkZWNvZGVVdGY4Q2hhciAoc3RyKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzdHIpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKDB4RkZGRCkgLy8gVVRGIDggaW52YWxpZCBjaGFyXG4gIH1cbn1cblxuLypcbiAqIFdlIGhhdmUgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIHZhbHVlIGlzIGEgdmFsaWQgaW50ZWdlci4gVGhpcyBtZWFucyB0aGF0IGl0XG4gKiBpcyBub24tbmVnYXRpdmUuIEl0IGhhcyBubyBmcmFjdGlvbmFsIGNvbXBvbmVudCBhbmQgdGhhdCBpdCBkb2VzIG5vdFxuICogZXhjZWVkIHRoZSBtYXhpbXVtIGFsbG93ZWQgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIHZlcmlmdWludCAodmFsdWUsIG1heCkge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA+PSAwLFxuICAgICAgJ3NwZWNpZmllZCBhIG5lZ2F0aXZlIHZhbHVlIGZvciB3cml0aW5nIGFuIHVuc2lnbmVkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGlzIGxhcmdlciB0aGFuIG1heGltdW0gdmFsdWUgZm9yIHR5cGUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZnNpbnQodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGxhcmdlciB0aGFuIG1heGltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA+PSBtaW4sICd2YWx1ZSBzbWFsbGVyIHRoYW4gbWluaW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZJRUVFNzU0KHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG59XG5cbmZ1bmN0aW9uIGFzc2VydCAodGVzdCwgbWVzc2FnZSkge1xuICBpZiAoIXRlc3QpIHRocm93IG5ldyBFcnJvcihtZXNzYWdlIHx8ICdGYWlsZWQgYXNzZXJ0aW9uJylcbn1cbiIsInZhciBsb29rdXAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG5cbjsoZnVuY3Rpb24gKGV4cG9ydHMpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG4gIHZhciBBcnIgPSAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKVxuICAgID8gVWludDhBcnJheVxuICAgIDogQXJyYXlcblxuXHR2YXIgWkVSTyAgID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTKVxuXHRcdFx0cmV0dXJuIDYyIC8vICcrJ1xuXHRcdGlmIChjb2RlID09PSBTTEFTSClcblx0XHRcdHJldHVybiA2MyAvLyAnLydcblx0XHRpZiAoY29kZSA8IE5VTUJFUilcblx0XHRcdHJldHVybiAtMSAvL25vIG1hdGNoXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIgKyAxMClcblx0XHRcdHJldHVybiBjb2RlIC0gTlVNQkVSICsgMjYgKyAyNlxuXHRcdGlmIChjb2RlIDwgVVBQRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gVVBQRVJcblx0XHRpZiAoY29kZSA8IExPV0VSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIExPV0VSICsgMjZcblx0fVxuXG5cdGZ1bmN0aW9uIGI2NFRvQnl0ZUFycmF5IChiNjQpIHtcblx0XHR2YXIgaSwgaiwgbCwgdG1wLCBwbGFjZUhvbGRlcnMsIGFyclxuXG5cdFx0aWYgKGI2NC5sZW5ndGggJSA0ID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0Jylcblx0XHR9XG5cblx0XHQvLyB0aGUgbnVtYmVyIG9mIGVxdWFsIHNpZ25zIChwbGFjZSBob2xkZXJzKVxuXHRcdC8vIGlmIHRoZXJlIGFyZSB0d28gcGxhY2Vob2xkZXJzLCB0aGFuIHRoZSB0d28gY2hhcmFjdGVycyBiZWZvcmUgaXRcblx0XHQvLyByZXByZXNlbnQgb25lIGJ5dGVcblx0XHQvLyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgdGhlbiB0aGUgdGhyZWUgY2hhcmFjdGVycyBiZWZvcmUgaXQgcmVwcmVzZW50IDIgYnl0ZXNcblx0XHQvLyB0aGlzIGlzIGp1c3QgYSBjaGVhcCBoYWNrIHRvIG5vdCBkbyBpbmRleE9mIHR3aWNlXG5cdFx0dmFyIGxlbiA9IGI2NC5sZW5ndGhcblx0XHRwbGFjZUhvbGRlcnMgPSAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMikgPyAyIDogJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDEpID8gMSA6IDBcblxuXHRcdC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuXHRcdGFyciA9IG5ldyBBcnIoYjY0Lmxlbmd0aCAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKVxuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHBsYWNlaG9sZGVycywgb25seSBnZXQgdXAgdG8gdGhlIGxhc3QgY29tcGxldGUgNCBjaGFyc1xuXHRcdGwgPSBwbGFjZUhvbGRlcnMgPiAwID8gYjY0Lmxlbmd0aCAtIDQgOiBiNjQubGVuZ3RoXG5cblx0XHR2YXIgTCA9IDBcblxuXHRcdGZ1bmN0aW9uIHB1c2ggKHYpIHtcblx0XHRcdGFycltMKytdID0gdlxuXHRcdH1cblxuXHRcdGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbDsgaSArPSA0LCBqICs9IDMpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTgpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgMTIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPDwgNikgfCBkZWNvZGUoYjY0LmNoYXJBdChpICsgMykpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDAwMCkgPj4gMTYpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDApID4+IDgpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpID4+IDQpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fSBlbHNlIGlmIChwbGFjZUhvbGRlcnMgPT09IDEpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTApIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgNCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA+PiAyKVxuXHRcdFx0cHVzaCgodG1wID4+IDgpICYgMHhGRilcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJyXG5cdH1cblxuXHRmdW5jdGlvbiB1aW50OFRvQmFzZTY0ICh1aW50OCkge1xuXHRcdHZhciBpLFxuXHRcdFx0ZXh0cmFCeXRlcyA9IHVpbnQ4Lmxlbmd0aCAlIDMsIC8vIGlmIHdlIGhhdmUgMSBieXRlIGxlZnQsIHBhZCAyIGJ5dGVzXG5cdFx0XHRvdXRwdXQgPSBcIlwiLFxuXHRcdFx0dGVtcCwgbGVuZ3RoXG5cblx0XHRmdW5jdGlvbiBlbmNvZGUgKG51bSkge1xuXHRcdFx0cmV0dXJuIGxvb2t1cC5jaGFyQXQobnVtKVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRyaXBsZXRUb0Jhc2U2NCAobnVtKSB7XG5cdFx0XHRyZXR1cm4gZW5jb2RlKG51bSA+PiAxOCAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiAxMiAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiA2ICYgMHgzRikgKyBlbmNvZGUobnVtICYgMHgzRilcblx0XHR9XG5cblx0XHQvLyBnbyB0aHJvdWdoIHRoZSBhcnJheSBldmVyeSB0aHJlZSBieXRlcywgd2UnbGwgZGVhbCB3aXRoIHRyYWlsaW5nIHN0dWZmIGxhdGVyXG5cdFx0Zm9yIChpID0gMCwgbGVuZ3RoID0gdWludDgubGVuZ3RoIC0gZXh0cmFCeXRlczsgaSA8IGxlbmd0aDsgaSArPSAzKSB7XG5cdFx0XHR0ZW1wID0gKHVpbnQ4W2ldIDw8IDE2KSArICh1aW50OFtpICsgMV0gPDwgOCkgKyAodWludDhbaSArIDJdKVxuXHRcdFx0b3V0cHV0ICs9IHRyaXBsZXRUb0Jhc2U2NCh0ZW1wKVxuXHRcdH1cblxuXHRcdC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcblx0XHRzd2l0Y2ggKGV4dHJhQnl0ZXMpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0dGVtcCA9IHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAyKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9PSdcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgMjpcblx0XHRcdFx0dGVtcCA9ICh1aW50OFt1aW50OC5sZW5ndGggLSAyXSA8PCA4KSArICh1aW50OFt1aW50OC5sZW5ndGggLSAxXSlcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDEwKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wID4+IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCAyKSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPSdcblx0XHRcdFx0YnJlYWtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0XG5cdH1cblxuXHRtb2R1bGUuZXhwb3J0cy50b0J5dGVBcnJheSA9IGI2NFRvQnl0ZUFycmF5XG5cdG1vZHVsZS5leHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KCkpXG4iLCJleHBvcnRzLnJlYWQgPSBmdW5jdGlvbihidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIG5CaXRzID0gLTcsXG4gICAgICBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDAsXG4gICAgICBkID0gaXNMRSA/IC0xIDogMSxcbiAgICAgIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV07XG5cbiAgaSArPSBkO1xuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBzID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gZUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIGUgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBtTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBpZiAoZSA9PT0gMCkge1xuICAgIGUgPSAxIC0gZUJpYXM7XG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KTtcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pO1xuICAgIGUgPSBlIC0gZUJpYXM7XG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbik7XG59O1xuXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGMsXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApLFxuICAgICAgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpLFxuICAgICAgZCA9IGlzTEUgPyAxIDogLTEsXG4gICAgICBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwO1xuXG4gIHZhbHVlID0gTWF0aC5hYnModmFsdWUpO1xuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwO1xuICAgIGUgPSBlTWF4O1xuICB9IGVsc2Uge1xuICAgIGUgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKTtcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS07XG4gICAgICBjICo9IDI7XG4gICAgfVxuICAgIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgdmFsdWUgKz0gcnQgLyBjO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcyk7XG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrO1xuICAgICAgYyAvPSAyO1xuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDA7XG4gICAgICBlID0gZU1heDtcbiAgICB9IGVsc2UgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICBtID0gKHZhbHVlICogYyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gZSArIGVCaWFzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gMDtcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KTtcblxuICBlID0gKGUgPDwgbUxlbikgfCBtO1xuICBlTGVuICs9IG1MZW47XG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCk7XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4O1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID1cclxuXHJcbiAgZmlyc3Q6IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFlvdXIgZmlyc3QgTG9vcFNjcmlwdC4gU29tZWRheSB0aGVyZSB3aWxsIGJlIGRvY3VtZW50YXRpb24hXHJcblxyXG50b25lIG5vdGUxXHJcbiAgZHVyYXRpb24gMjUwXHJcbiAgb2N0YXZlIDRcclxuICBub3RlIENcclxuXHJcbnRvbmUgYmFzczFcclxuICBkdXJhdGlvbiAyNTBcclxuICBvY3RhdmUgMVxyXG4gIG5vdGUgQlxyXG5cclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gbm90ZTEgeC4uLi4uLi54Li4uLi4uLlxyXG4gIHBhdHRlcm4gYmFzczEgLi4uLnguLi4uLi4ueC4uLlxyXG5cclxuXCJcIlwiXHJcblxyXG4gIG5vdGVzOiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBOb3RlIG92ZXJyaWRlcyFcclxuXHJcbiMgSC1MIGFyZSB0aGUgYmxhY2sga2V5czpcclxuIyAgICAgSCBJICAgSiBLIExcclxuIyAgICBDIEQgRSBGIEcgQSBCXHJcblxyXG4jIFRyeSBzZXR0aW5nIHRoZSBkdXJhdGlvbiB0byAxMDBcclxudG9uZSBub3RlMVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG4gIGR1cmF0aW9uIDI1MFxyXG5cclxuIyBTYW1wbGVzIGNhbiBoYXZlIHRoZWlyIG5vdGVzIG92ZXJyaWRkZW4gdG9vIVxyXG5zYW1wbGUgZGluZ1xyXG4gIHNyYyBzYW1wbGVzL2RpbmdfZS53YXZcclxuICBzcmNub3RlIGVcclxuXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIG5vdGUxIGIuYS5nLmEuYi5iLmIuLi5cclxuXHJcbmxvb3AgbG9vcDJcclxuICBwYXR0ZXJuIGRpbmcgYi5hLmcuYS5iLmIuYi4uLlxyXG5cclxudHJhY2sgc29uZ1xyXG4gIHBhdHRlcm4gbG9vcDEgeFxyXG4gIHBhdHRlcm4gbG9vcDIgLnhcclxuXHJcblwiXCJcIlxyXG5cclxuICBtb3R0bzogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQW4gYXBwcm94aW1hdGlvbiBvZiB0aGUgYmVhdCBmcm9tIERyYWtlJ3MgXCJUaGUgTW90dG9cIlxyXG5cclxuYnBtIDEwMFxyXG5zZWN0aW9uICMgdG8gc2hhcmUgQURTUlxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG4gIHRvbmUgYmFzczFcclxuICAgIG9jdGF2ZSAxXHJcbiAgdG9uZSBiYXNzMlxyXG4gICAgb2N0YXZlIDJcclxuXHJcbnNhbXBsZSBjbGFwICAtPiBzcmMgc2FtcGxlcy9jbGFwLndhdlxyXG5zYW1wbGUgc25hcmUgLT4gc3JjIHNhbXBsZXMvc25hcmUud2F2XHJcbnNhbXBsZSBoaWhhdCAtPiBzcmMgc2FtcGxlcy9oaWhhdC53YXZcclxuXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIGhpaGF0IC4ueC4uLi4uLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uXHJcbiAgcGF0dGVybiBjbGFwICAuLi4ueC4uLi4uLi54Li4uLi4uLnguLi4uLi4ueC4uLlxyXG4gIHBhdHRlcm4gc25hcmUgLi4uLi4ueC4uLnguLi54LnguLi4uLi4uLi4uLi4uLi5cclxuICBwYXR0ZXJuIGJhc3MxIEJiYmJiYi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcbiAgcGF0dGVybiBiYXNzMiAuLi4uLi5IaGhoaGhEZGRkZGQuLi4uSGhoaEpqLkpqLlxyXG5cclxudHJhY2sgc29uZ1xyXG4gIHBhdHRlcm4gbG9vcDEgeHh4eFxyXG5cclxuXCJcIlwiXHJcblxyXG4gIGxlbmd0aDogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgU2hvd2luZyBvZmYgdmFyaW91cyBub3RlIGxlbmd0aHMgdXNpbmcgY2FwcyBhbmQgbG93ZXJjYXNlXHJcbiMgQWxzbyBzaG93cyB3aGF0IEFEU1IgY2FuIGRvIVxyXG5cclxudG9uZSBub3RlMVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG5cclxudG9uZSBub3RlMlxyXG4gICMgTm90ZTogT25seSB0aGUgZmlyc3QgdG9uZSBoYXMgQURTUlxyXG5cclxuIyBJZiB5b3UgdXNlIGFueSBsZXR0ZXJzIG90aGVyIHRoYW4gXCJ4XCIgb24gYSB0b25lIHBhdHRlcm4sIHlvdSBvdmVycmlkZSBpdHNcclxuIyBub3RlIHdpdGggdGhlIG5vdGUgbGlzdGVkLiBBbHNvLCBpZiB5b3UgdXNlIGFueSBjYXBpdGFsIGxldHRlcnMgaW4gYSBwYXR0ZXJuLFxyXG4jIHlvdSBvdmVycmlkZSB0aGUgbGVuZ3RoIG9mIHRoYXQgbm90ZSB3aXRoIHRoZSBudW1iZXIgb2YgbWF0Y2hpbmcgbG93ZXJjYXNlXHJcbiMgbGV0dGVycyBmb2xsb3dpbmcgaXQuXHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBub3RlMSBHZ2dnZ2dnZ0ZmZmZmZi4uQWFhYUJiYi5DYy4uRC4uLlxyXG5cclxubG9vcCBsb29wMlxyXG4gIHBhdHRlcm4gbm90ZTIgR2dnZ2dnZ2dGZmZmZmYuLkFhYWFCYmIuQ2MuLkQuLi5cclxuXHJcbnRyYWNrIHNvbmdcclxuICBwYXR0ZXJuIGxvb3AxIHguXHJcbiAgcGF0dGVybiBsb29wMiAueFxyXG5cclxuXCJcIlwiXHJcblxyXG4gIGNob2NvYm86IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFRoZSBDaG9jb2JvIFRoZW1lIChmaXJzdCBwYXJ0IG9ubHkpXHJcblxyXG5icG0gMTI1XHJcblxyXG5zZWN0aW9uIFRvbmUgKGluIGEgc2VjdGlvbiB0byBzaGFyZSBBRFNSKVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG4gIHRvbmUgY2hvY29ibzFcclxuICAgIG9jdGF2ZSA1XHJcbiAgdG9uZSBjaG9jb2JvMlxyXG4gICAgb2N0YXZlIDRcclxuXHJcbmxvb3AgbG9vcDFcclxuIHBhdHRlcm4gY2hvY29ibzEgRGRkZC4uLi4uLkRkLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uRC5FLkZmZmZmZi4uLlxyXG4gcGF0dGVybiBjaG9jb2JvMiAuLi4uQmJHZ0VlLi5CYkdnQmIuLkdnLi5CYmJiYmIuQWFHZ0dBRy5GLkdnZ2dnZy5GLkdnR0IuLi4uLi4uLi4uLi4uXHJcblxyXG50cmFjayBzb25nXHJcbiAgcGF0dGVybiBsb29wMSB4eFxyXG5cIlwiXCIiLCJmcmVxVGFibGUgPSBbXHJcbiAgeyAjIE9jdGF2ZSAwXHJcblxyXG4gICAgXCJhXCI6IDI3LjUwMDBcclxuICAgIFwibFwiOiAyOS4xMzUzXHJcbiAgICBcImJcIjogMzAuODY3N1xyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSAxXHJcbiAgICBcImNcIjogMzIuNzAzMlxyXG4gICAgXCJoXCI6IDM0LjY0NzlcclxuICAgIFwiZFwiOiAzNi43MDgxXHJcbiAgICBcImlcIjogMzguODkwOVxyXG4gICAgXCJlXCI6IDQxLjIwMzVcclxuICAgIFwiZlwiOiA0My42NTM2XHJcbiAgICBcImpcIjogNDYuMjQ5M1xyXG4gICAgXCJnXCI6IDQ4Ljk5OTVcclxuICAgIFwia1wiOiA1MS45MTMwXHJcbiAgICBcImFcIjogNTUuMDAwMFxyXG4gICAgXCJsXCI6IDU4LjI3MDVcclxuICAgIFwiYlwiOiA2MS43MzU0XHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDJcclxuICAgIFwiY1wiOiA2NS40MDY0XHJcbiAgICBcImhcIjogNjkuMjk1N1xyXG4gICAgXCJkXCI6IDczLjQxNjJcclxuICAgIFwiaVwiOiA3Ny43ODE3XHJcbiAgICBcImVcIjogODIuNDA2OVxyXG4gICAgXCJmXCI6IDg3LjMwNzFcclxuICAgIFwialwiOiA5Mi40OTg2XHJcbiAgICBcImdcIjogOTcuOTk4OVxyXG4gICAgXCJrXCI6IDEwMy44MjZcclxuICAgIFwiYVwiOiAxMTAuMDAwXHJcbiAgICBcImxcIjogMTE2LjU0MVxyXG4gICAgXCJiXCI6IDEyMy40NzFcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgM1xyXG4gICAgXCJjXCI6IDEzMC44MTNcclxuICAgIFwiaFwiOiAxMzguNTkxXHJcbiAgICBcImRcIjogMTQ2LjgzMlxyXG4gICAgXCJpXCI6IDE1NS41NjNcclxuICAgIFwiZVwiOiAxNjQuODE0XHJcbiAgICBcImZcIjogMTc0LjYxNFxyXG4gICAgXCJqXCI6IDE4NC45OTdcclxuICAgIFwiZ1wiOiAxOTUuOTk4XHJcbiAgICBcImtcIjogMjA3LjY1MlxyXG4gICAgXCJhXCI6IDIyMC4wMDBcclxuICAgIFwibFwiOiAyMzMuMDgyXHJcbiAgICBcImJcIjogMjQ2Ljk0MlxyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSA0XHJcbiAgICBcImNcIjogMjYxLjYyNlxyXG4gICAgXCJoXCI6IDI3Ny4xODNcclxuICAgIFwiZFwiOiAyOTMuNjY1XHJcbiAgICBcImlcIjogMzExLjEyN1xyXG4gICAgXCJlXCI6IDMyOS42MjhcclxuICAgIFwiZlwiOiAzNDkuMjI4XHJcbiAgICBcImpcIjogMzY5Ljk5NFxyXG4gICAgXCJnXCI6IDM5MS45OTVcclxuICAgIFwia1wiOiA0MTUuMzA1XHJcbiAgICBcImFcIjogNDQwLjAwMFxyXG4gICAgXCJsXCI6IDQ2Ni4xNjRcclxuICAgIFwiYlwiOiA0OTMuODgzXHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDVcclxuICAgIFwiY1wiOiA1MjMuMjUxXHJcbiAgICBcImhcIjogNTU0LjM2NVxyXG4gICAgXCJkXCI6IDU4Ny4zMzBcclxuICAgIFwiaVwiOiA2MjIuMjU0XHJcbiAgICBcImVcIjogNjU5LjI1NVxyXG4gICAgXCJmXCI6IDY5OC40NTZcclxuICAgIFwialwiOiA3MzkuOTg5XHJcbiAgICBcImdcIjogNzgzLjk5MVxyXG4gICAgXCJrXCI6IDgzMC42MDlcclxuICAgIFwiYVwiOiA4ODAuMDAwXHJcbiAgICBcImxcIjogOTMyLjMyOFxyXG4gICAgXCJiXCI6IDk4Ny43NjdcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgNlxyXG4gICAgXCJjXCI6IDEwNDYuNTBcclxuICAgIFwiaFwiOiAxMTA4LjczXHJcbiAgICBcImRcIjogMTE3NC42NlxyXG4gICAgXCJpXCI6IDEyNDQuNTFcclxuICAgIFwiZVwiOiAxMzE4LjUxXHJcbiAgICBcImZcIjogMTM5Ni45MVxyXG4gICAgXCJqXCI6IDE0NzkuOThcclxuICAgIFwiZ1wiOiAxNTY3Ljk4XHJcbiAgICBcImtcIjogMTY2MS4yMlxyXG4gICAgXCJhXCI6IDE3NjAuMDBcclxuICAgIFwibFwiOiAxODY0LjY2XHJcbiAgICBcImJcIjogMTk3NS41M1xyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSA3XHJcbiAgICBcImNcIjogMjA5My4wMFxyXG4gICAgXCJoXCI6IDIyMTcuNDZcclxuICAgIFwiZFwiOiAyMzQ5LjMyXHJcbiAgICBcImlcIjogMjQ4OS4wMlxyXG4gICAgXCJlXCI6IDI2MzcuMDJcclxuICAgIFwiZlwiOiAyNzkzLjgzXHJcbiAgICBcImpcIjogMjk1OS45NlxyXG4gICAgXCJnXCI6IDMxMzUuOTZcclxuICAgIFwia1wiOiAzMzIyLjQ0XHJcbiAgICBcImFcIjogMzUyMC4wMFxyXG4gICAgXCJsXCI6IDM3MjkuMzFcclxuICAgIFwiYlwiOiAzOTUxLjA3XHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDhcclxuICAgIFwiY1wiOiA0MTg2LjAxXHJcbiAgfVxyXG5dXHJcblxyXG5sZWdhbE5vdGVSZWdleCA9IC9bYS1sXS9cclxuXHJcbmZpbmRGcmVxID0gKG9jdGF2ZSwgbm90ZSkgLT5cclxuICBub3RlID0gbm90ZS50b0xvd2VyQ2FzZSgpXHJcbiAgaWYgKG9jdGF2ZSA+PSAwKSBhbmQgKG9jdGF2ZSA8IGZyZXFUYWJsZS5sZW5ndGgpIGFuZCBsZWdhbE5vdGVSZWdleC50ZXN0KG5vdGUpXHJcbiAgICBvY3RhdmVUYWJsZSA9IGZyZXFUYWJsZVtvY3RhdmVdXHJcbiAgICBpZiBvY3RhdmVUYWJsZT8gYW5kIG9jdGF2ZVRhYmxlW25vdGVdP1xyXG4gICAgICByZXR1cm4gb2N0YXZlVGFibGVbbm90ZV1cclxuICByZXR1cm4gNDQwLjBcclxuXHJcbm1vZHVsZS5leHBvcnRzID1cclxuICBmcmVxVGFibGU6IGZyZXFUYWJsZVxyXG4gIGZpbmRGcmVxOiBmaW5kRnJlcVxyXG4iLCIjIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBJbXBvcnRzXHJcblxyXG57ZmluZEZyZXF9ID0gcmVxdWlyZSAnLi9mcmVxJ1xyXG5yaWZmd2F2ZSAgID0gcmVxdWlyZSBcIi4vcmlmZndhdmVcIlxyXG5qRGF0YVZpZXcgID0gcmVxdWlyZSAnLi4vanMvamRhdGF2aWV3J1xyXG5mcyAgICAgICAgID0gcmVxdWlyZSAnZnMnXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBIZWxwZXIgZnVuY3Rpb25zXHJcblxyXG5jbG9uZSA9IChvYmopIC0+XHJcbiAgaWYgbm90IG9iaj8gb3IgdHlwZW9mIG9iaiBpc250ICdvYmplY3QnXHJcbiAgICByZXR1cm4gb2JqXHJcblxyXG4gIGlmIG9iaiBpbnN0YW5jZW9mIERhdGVcclxuICAgIHJldHVybiBuZXcgRGF0ZShvYmouZ2V0VGltZSgpKVxyXG5cclxuICBpZiBvYmogaW5zdGFuY2VvZiBSZWdFeHBcclxuICAgIGZsYWdzID0gJydcclxuICAgIGZsYWdzICs9ICdnJyBpZiBvYmouZ2xvYmFsP1xyXG4gICAgZmxhZ3MgKz0gJ2knIGlmIG9iai5pZ25vcmVDYXNlP1xyXG4gICAgZmxhZ3MgKz0gJ20nIGlmIG9iai5tdWx0aWxpbmU/XHJcbiAgICBmbGFncyArPSAneScgaWYgb2JqLnN0aWNreT9cclxuICAgIHJldHVybiBuZXcgUmVnRXhwKG9iai5zb3VyY2UsIGZsYWdzKVxyXG5cclxuICBuZXdJbnN0YW5jZSA9IG5ldyBvYmouY29uc3RydWN0b3IoKVxyXG5cclxuICBmb3Iga2V5IG9mIG9ialxyXG4gICAgbmV3SW5zdGFuY2Vba2V5XSA9IGNsb25lIG9ialtrZXldXHJcblxyXG4gIHJldHVybiBuZXdJbnN0YW5jZVxyXG5cclxucGFyc2VCb29sID0gKHYpIC0+XHJcbiAgc3dpdGNoIFN0cmluZyh2KVxyXG4gICAgd2hlbiBcInRydWVcIiB0aGVuIHRydWVcclxuICAgIHdoZW4gXCJ5ZXNcIiB0aGVuIHRydWVcclxuICAgIHdoZW4gXCJvblwiIHRoZW4gdHJ1ZVxyXG4gICAgd2hlbiBcIjFcIiB0aGVuIHRydWVcclxuICAgIGVsc2UgZmFsc2VcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEluZGVudFN0YWNrIC0gdXNlZCBieSBQYXJzZXJcclxuXHJcbmNsYXNzIEluZGVudFN0YWNrXHJcbiAgY29uc3RydWN0b3I6IC0+XHJcbiAgICBAc3RhY2sgPSBbMF1cclxuXHJcbiAgcHVzaDogKGluZGVudCkgLT5cclxuICAgIEBzdGFjay5wdXNoIGluZGVudFxyXG5cclxuICBwb3A6IC0+XHJcbiAgICBpZiBAc3RhY2subGVuZ3RoID4gMVxyXG4gICAgICBAc3RhY2sucG9wKClcclxuICAgICAgcmV0dXJuIHRydWVcclxuICAgIHJldHVybiBmYWxzZVxyXG5cclxuICB0b3A6IC0+XHJcbiAgICByZXR1cm4gQHN0YWNrW0BzdGFjay5sZW5ndGggLSAxXVxyXG5cclxuICByZXBsYWNlVG9wOiAodikgLT5cclxuICAgIEBzdGFja1tAc3RhY2subGVuZ3RoIC0gMV0gPSB2XHJcblxyXG5jb3VudEluZGVudCA9ICh0ZXh0KSAtPlxyXG4gIGluZGVudCA9IDBcclxuICBmb3IgaSBpbiBbMC4uLnRleHQubGVuZ3RoXVxyXG4gICAgaWYgdGV4dFtpXSA9PSAnXFx0J1xyXG4gICAgICBpbmRlbnQgKz0gOFxyXG4gICAgZWxzZVxyXG4gICAgICBpbmRlbnQrK1xyXG4gIHJldHVybiBpbmRlbnRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFBhcnNlclxyXG5cclxuY2xhc3MgUGFyc2VyXHJcbiAgY29uc3RydWN0b3I6IChAbG9nKSAtPlxyXG4gICAgQGNvbW1lbnRSZWdleCA9IC9eKFteI10qPykoXFxzKiMuKik/JC9cclxuICAgIEBvbmx5V2hpdGVzcGFjZVJlZ2V4ID0gL15cXHMqJC9cclxuICAgIEBpbmRlbnRSZWdleCA9IC9eKFxccyopKFxcUy4qKSQvXHJcbiAgICBAbGVhZGluZ1VuZGVyc2NvcmVSZWdleCA9IC9eXy9cclxuICAgIEBoYXNDYXBpdGFsTGV0dGVyc1JlZ2V4ID0gL1tBLVpdL1xyXG4gICAgQGlzTm90ZVJlZ2V4ID0gL1tBLUxhLWxdL1xyXG5cclxuICAgICMgSC1MIGFyZSB0aGUgYmxhY2sga2V5czpcclxuICAgICMgIEggSSAgIEogSyBMXHJcbiAgICAjIEMgRCBFIEYgRyBBIEJcclxuXHJcbiAgICBAbmFtZWRTdGF0ZXMgPVxyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHNyY29jdGF2ZTogNFxyXG4gICAgICAgIHNyY25vdGU6ICdhJ1xyXG4gICAgICAgIG9jdGF2ZTogNFxyXG4gICAgICAgIG5vdGU6ICdhJ1xyXG4gICAgICAgIHdhdmU6ICdzaW5lJ1xyXG4gICAgICAgIGJwbTogMTIwXHJcbiAgICAgICAgZHVyYXRpb246IDIwMFxyXG4gICAgICAgIGJlYXRzOiA0XHJcbiAgICAgICAgdm9sdW1lOiAxLjBcclxuICAgICAgICBjbGlwOiB0cnVlXHJcbiAgICAgICAgcmV2ZXJiOlxyXG4gICAgICAgICAgZGVsYXk6IDBcclxuICAgICAgICAgIGRlY2F5OiAwXHJcbiAgICAgICAgYWRzcjogIyBuby1vcCBBRFNSIChmdWxsIDEuMCBzdXN0YWluKVxyXG4gICAgICAgICAgYTogMFxyXG4gICAgICAgICAgZDogMFxyXG4gICAgICAgICAgczogMVxyXG4gICAgICAgICAgcjogMVxyXG5cclxuICAgICMgaWYgYSBrZXkgaXMgcHJlc2VudCBpbiB0aGlzIG1hcCwgdGhhdCBuYW1lIGlzIGNvbnNpZGVyZWQgYW4gXCJvYmplY3RcIlxyXG4gICAgQG9iamVjdEtleXMgPVxyXG4gICAgICB0b25lOlxyXG4gICAgICAgIHdhdmU6ICdzdHJpbmcnXHJcbiAgICAgICAgZnJlcTogJ2Zsb2F0J1xyXG4gICAgICAgIGR1cmF0aW9uOiAnZmxvYXQnXHJcbiAgICAgICAgYWRzcjogJ2Fkc3InXHJcbiAgICAgICAgb2N0YXZlOiAnaW50J1xyXG4gICAgICAgIG5vdGU6ICdzdHJpbmcnXHJcbiAgICAgICAgdm9sdW1lOiAnZmxvYXQnXHJcbiAgICAgICAgY2xpcDogJ2Jvb2wnXHJcbiAgICAgICAgcmV2ZXJiOiAncmV2ZXJiJ1xyXG5cclxuICAgICAgc2FtcGxlOlxyXG4gICAgICAgIHNyYzogJ3N0cmluZydcclxuICAgICAgICB2b2x1bWU6ICdmbG9hdCdcclxuICAgICAgICBjbGlwOiAnYm9vbCdcclxuICAgICAgICByZXZlcmI6ICdyZXZlcmInXHJcbiAgICAgICAgc3Jjb2N0YXZlOiAnaW50J1xyXG4gICAgICAgIHNyY25vdGU6ICdzdHJpbmcnXHJcbiAgICAgICAgb2N0YXZlOiAnaW50J1xyXG4gICAgICAgIG5vdGU6ICdzdHJpbmcnXHJcblxyXG4gICAgICBsb29wOlxyXG4gICAgICAgIGJwbTogJ2ludCdcclxuICAgICAgICBiZWF0czogJ2ludCdcclxuXHJcbiAgICAgIHRyYWNrOiB7fVxyXG5cclxuICAgIEBpbmRlbnRTdGFjayA9IG5ldyBJbmRlbnRTdGFja1xyXG4gICAgQHN0YXRlU3RhY2sgPSBbXVxyXG4gICAgQHJlc2V0ICdkZWZhdWx0J1xyXG4gICAgQG9iamVjdHMgPSB7fVxyXG4gICAgQG9iamVjdCA9IG51bGxcclxuICAgIEBvYmplY3RTY29wZVJlYWR5ID0gZmFsc2VcclxuXHJcbiAgaXNPYmplY3RUeXBlOiAodHlwZSkgLT5cclxuICAgIHJldHVybiBAb2JqZWN0S2V5c1t0eXBlXT9cclxuXHJcbiAgZXJyb3I6ICh0ZXh0KSAtPlxyXG4gICAgQGxvZy5lcnJvciBcIlBBUlNFIEVSUk9SLCBsaW5lICN7QGxpbmVOb306ICN7dGV4dH1cIlxyXG5cclxuICByZXNldDogKG5hbWUpIC0+XHJcbiAgICBuYW1lID89ICdkZWZhdWx0J1xyXG4gICAgaWYgbm90IEBuYW1lZFN0YXRlc1tuYW1lXVxyXG4gICAgICBAZXJyb3IgXCJpbnZhbGlkIHJlc2V0IG5hbWU6ICN7bmFtZX1cIlxyXG4gICAgICByZXR1cm4gZmFsc2VcclxuICAgIEBzdGF0ZVN0YWNrLnB1c2ggY2xvbmUoQG5hbWVkU3RhdGVzW25hbWVdKVxyXG4gICAgcmV0dXJuIHRydWVcclxuXHJcbiAgZmxhdHRlbjogKCkgLT5cclxuICAgIGZsYXR0ZW5lZFN0YXRlID0ge31cclxuICAgIGZvciBzdGF0ZSBpbiBAc3RhdGVTdGFja1xyXG4gICAgICBmb3Iga2V5IG9mIHN0YXRlXHJcbiAgICAgICAgZmxhdHRlbmVkU3RhdGVba2V5XSA9IHN0YXRlW2tleV1cclxuICAgIHJldHVybiBmbGF0dGVuZWRTdGF0ZVxyXG5cclxuICB0cmFjZTogKHByZWZpeCkgLT5cclxuICAgIHByZWZpeCA/PSAnJ1xyXG4gICAgQGxvZy52ZXJib3NlIFwidHJhY2U6ICN7cHJlZml4fSBcIiArIEpTT04uc3RyaW5naWZ5KEBmbGF0dGVuKCkpXHJcblxyXG4gIGNyZWF0ZU9iamVjdDogKGRhdGEuLi4pIC0+XHJcbiAgICAgIEBmaW5pc2hPYmplY3QoKVxyXG5cclxuICAgICAgQG9iamVjdCA9IHt9XHJcbiAgICAgIGZvciBpIGluIFswLi4uZGF0YS5sZW5ndGhdIGJ5IDJcclxuICAgICAgICBAb2JqZWN0W2RhdGFbaV1dID0gZGF0YVtpKzFdXHJcbiAgICAgIEBvYmplY3RTY29wZVJlYWR5ID0gdHJ1ZVxyXG5cclxuICAgICAgaWYgQG9iamVjdC5fdHlwZSA9PSAnbG9vcCdcclxuICAgICAgICBAb2JqZWN0Ll9wYXR0ZXJucyA9IFtdXHJcblxyXG4gICAgICBpZiBAb2JqZWN0Ll90eXBlID09ICd0cmFjaydcclxuICAgICAgICBAb2JqZWN0Ll9wYXR0ZXJucyA9IFtdXHJcblxyXG4gICAgICBpZiBAb2JqZWN0Ll9uYW1lXHJcbiAgICAgICAgQGxhc3RPYmplY3QgPSBAb2JqZWN0Ll9uYW1lXHJcblxyXG4gIGZpbmlzaE9iamVjdDogLT5cclxuICAgIGlmIEBvYmplY3RcclxuICAgICAgc3RhdGUgPSBAZmxhdHRlbigpXHJcbiAgICAgIGZvciBrZXkgb2YgQG9iamVjdEtleXNbQG9iamVjdC5fdHlwZV1cclxuICAgICAgICBleHBlY3RlZFR5cGUgPSBAb2JqZWN0S2V5c1tAb2JqZWN0Ll90eXBlXVtrZXldXHJcbiAgICAgICAgaWYgc3RhdGVba2V5XT9cclxuICAgICAgICAgIHYgPSBzdGF0ZVtrZXldXHJcbiAgICAgICAgICBAb2JqZWN0W2tleV0gPSBzd2l0Y2ggZXhwZWN0ZWRUeXBlXHJcbiAgICAgICAgICAgIHdoZW4gJ2ludCcgdGhlbiBwYXJzZUludCh2KVxyXG4gICAgICAgICAgICB3aGVuICdmbG9hdCcgdGhlbiBwYXJzZUZsb2F0KHYpXHJcbiAgICAgICAgICAgIHdoZW4gJ2Jvb2wnIHRoZW4gcGFyc2VCb29sKHYpXHJcbiAgICAgICAgICAgIGVsc2UgdlxyXG4gICAgICAgICAgIyBAbG9nLnZlcmJvc2UgXCJzZXR0aW5nICN7QG9iamVjdC5fbmFtZX0ncyAje2tleX0gdG8gXCIgKyBKU09OLnN0cmluZ2lmeShAb2JqZWN0W2tleV0pXHJcblxyXG4gICAgICBAb2JqZWN0c1tAb2JqZWN0Ll9uYW1lXSA9IEBvYmplY3RcclxuICAgIEBvYmplY3QgPSBudWxsXHJcblxyXG4gIGNyZWF0aW5nT2JqZWN0VHlwZTogKHR5cGUpIC0+XHJcbiAgICByZXR1cm4gZmFsc2UgaWYgbm90IEBvYmplY3RcclxuICAgIHJldHVybiBmYWxzZSBpZiBub3QgQG9iamVjdC5fdHlwZSA9PSB0eXBlXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuICBwdXNoU2NvcGU6IC0+XHJcbiAgICAjIGNvbnNvbGUubG9nIFwiUFVTSFwiXHJcbiAgICBpZiBub3QgQG9iamVjdFNjb3BlUmVhZHlcclxuICAgICAgQGVycm9yIFwidW5leHBlY3RlZCBpbmRlbnRcIlxyXG4gICAgICByZXR1cm4gZmFsc2VcclxuICAgIEBvYmplY3RTY29wZVJlYWR5ID0gZmFsc2VcclxuICAgIEBzdGF0ZVN0YWNrLnB1c2ggeyBfc2NvcGU6IHRydWUgfVxyXG4gICAgcmV0dXJuIHRydWVcclxuXHJcbiAgcG9wU2NvcGU6IC0+XHJcbiAgICAjIGNvbnNvbGUubG9nIFwiUE9QXCJcclxuICAgIEBmaW5pc2hPYmplY3QoKVxyXG4gICAgbG9vcFxyXG4gICAgICBpZiBAc3RhdGVTdGFjay5sZW5ndGggPT0gMFxyXG4gICAgICAgIEBlcnJvciBcInN0YXRlIHN0YWNrIGlzIGVtcHR5ISBzb21ldGhpbmcgYmFkIGhhcyBoYXBwZW5lZFwiXHJcbiAgICAgIHRvcCA9IEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdXHJcbiAgICAgIGJyZWFrIGlmIHRvcC5fc2NvcGU/XHJcbiAgICAgIEBzdGF0ZVN0YWNrLnBvcCgpXHJcbiAgICBAc3RhdGVTdGFjay5wb3AoKVxyXG4gICAgcmV0dXJuIHRydWVcclxuXHJcbiAgcGFyc2VQYXR0ZXJuOiAocGF0dGVybikgLT5cclxuICAgIG92ZXJyaWRlTGVuZ3RoID0gQGhhc0NhcGl0YWxMZXR0ZXJzUmVnZXgudGVzdChwYXR0ZXJuKVxyXG4gICAgaSA9IDBcclxuICAgIHNvdW5kcyA9IFtdXHJcbiAgICB3aGlsZSBpIDwgcGF0dGVybi5sZW5ndGhcclxuICAgICAgYyA9IHBhdHRlcm5baV1cclxuICAgICAgaWYgYyAhPSAnLidcclxuICAgICAgICBzeW1ib2wgPSBjLnRvTG93ZXJDYXNlKClcclxuICAgICAgICBzb3VuZCA9IHsgb2Zmc2V0OiBpIH1cclxuICAgICAgICBpZiBAaXNOb3RlUmVnZXgudGVzdChjKVxyXG4gICAgICAgICAgc291bmQubm90ZSA9IHN5bWJvbFxyXG4gICAgICAgIGlmIG92ZXJyaWRlTGVuZ3RoXHJcbiAgICAgICAgICBsZW5ndGggPSAxXHJcbiAgICAgICAgICBsb29wXHJcbiAgICAgICAgICAgIG5leHQgPSBwYXR0ZXJuW2krMV1cclxuICAgICAgICAgICAgaWYgbmV4dCA9PSBzeW1ib2xcclxuICAgICAgICAgICAgICBsZW5ndGgrK1xyXG4gICAgICAgICAgICAgIGkrK1xyXG4gICAgICAgICAgICAgIGlmIGkgPT0gcGF0dGVybi5sZW5ndGhcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgc291bmQubGVuZ3RoID0gbGVuZ3RoXHJcbiAgICAgICAgc291bmRzLnB1c2ggc291bmRcclxuICAgICAgaSsrXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBwYXR0ZXJuOiBwYXR0ZXJuXHJcbiAgICAgIGxlbmd0aDogcGF0dGVybi5sZW5ndGhcclxuICAgICAgc291bmRzOiBzb3VuZHNcclxuICAgIH1cclxuXHJcbiAgcHJvY2Vzc1Rva2VuczogKHRva2VucykgLT5cclxuICAgIGNtZCA9IHRva2Vuc1swXS50b0xvd2VyQ2FzZSgpXHJcbiAgICBpZiBjbWQgPT0gJ3Jlc2V0J1xyXG4gICAgICBpZiBub3QgQHJlc2V0KHRva2Vuc1sxXSlcclxuICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgIGVsc2UgaWYgY21kID09ICdzZWN0aW9uJ1xyXG4gICAgICBAb2JqZWN0U2NvcGVSZWFkeSA9IHRydWVcclxuICAgIGVsc2UgaWYgQGlzT2JqZWN0VHlwZShjbWQpXHJcbiAgICAgIEBjcmVhdGVPYmplY3QgJ190eXBlJywgY21kLCAnX25hbWUnLCB0b2tlbnNbMV1cclxuICAgIGVsc2UgaWYgY21kID09ICdwYXR0ZXJuJ1xyXG4gICAgICBpZiBub3QgKEBjcmVhdGluZ09iamVjdFR5cGUoJ2xvb3AnKSBvciBAY3JlYXRpbmdPYmplY3RUeXBlKCd0cmFjaycpKVxyXG4gICAgICAgIEBlcnJvciBcInVuZXhwZWN0ZWQgcGF0dGVybiBjb21tYW5kXCJcclxuICAgICAgICByZXR1cm4gZmFsc2VcclxuXHJcbiAgICAgIHBhdHRlcm4gPSBAcGFyc2VQYXR0ZXJuKHRva2Vuc1syXSlcclxuICAgICAgcGF0dGVybi5zcmMgPSB0b2tlbnNbMV1cclxuICAgICAgQG9iamVjdC5fcGF0dGVybnMucHVzaCBwYXR0ZXJuXHJcbiAgICBlbHNlIGlmIGNtZCA9PSAnYWRzcidcclxuICAgICAgQHN0YXRlU3RhY2tbQHN0YXRlU3RhY2subGVuZ3RoIC0gMV1bY21kXSA9XHJcbiAgICAgICAgYTogcGFyc2VGbG9hdCh0b2tlbnNbMV0pXHJcbiAgICAgICAgZDogcGFyc2VGbG9hdCh0b2tlbnNbMl0pXHJcbiAgICAgICAgczogcGFyc2VGbG9hdCh0b2tlbnNbM10pXHJcbiAgICAgICAgcjogcGFyc2VGbG9hdCh0b2tlbnNbNF0pXHJcbiAgICBlbHNlIGlmIGNtZCA9PSAncmV2ZXJiJ1xyXG4gICAgICBAc3RhdGVTdGFja1tAc3RhdGVTdGFjay5sZW5ndGggLSAxXVtjbWRdID1cclxuICAgICAgICBkZWxheTogcGFyc2VJbnQodG9rZW5zWzFdKVxyXG4gICAgICAgIGRlY2F5OiBwYXJzZUZsb2F0KHRva2Vuc1syXSlcclxuICAgIGVsc2VcclxuICAgICAgIyBUaGUgYm9yaW5nIHJlZ3VsYXIgY2FzZTogc3Rhc2ggb2ZmIHRoaXMgdmFsdWVcclxuICAgICAgaWYgQGxlYWRpbmdVbmRlcnNjb3JlUmVnZXgudGVzdChjbWQpXHJcbiAgICAgICAgQGVycm9yIFwiY2Fubm90IHNldCBpbnRlcm5hbCBuYW1lcyAodW5kZXJzY29yZSBwcmVmaXgpXCJcclxuICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgQHN0YXRlU3RhY2tbQHN0YXRlU3RhY2subGVuZ3RoIC0gMV1bY21kXSA9IHRva2Vuc1sxXVxyXG5cclxuICAgIHJldHVybiB0cnVlXHJcblxyXG4gIHBhcnNlOiAodGV4dCkgLT5cclxuICAgIGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJylcclxuICAgIEBsaW5lTm8gPSAwXHJcbiAgICBmb3IgbGluZSBpbiBsaW5lc1xyXG4gICAgICBAbGluZU5vKytcclxuICAgICAgbGluZSA9IGxpbmUucmVwbGFjZSgvKFxcclxcbnxcXG58XFxyKS9nbSxcIlwiKSAjIHN0cmlwIG5ld2xpbmVzXHJcbiAgICAgIGxpbmUgPSBAY29tbWVudFJlZ2V4LmV4ZWMobGluZSlbMV0gICAgICAgIyBzdHJpcCBjb21tZW50cyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZVxyXG4gICAgICBjb250aW51ZSBpZiBAb25seVdoaXRlc3BhY2VSZWdleC50ZXN0KGxpbmUpXHJcbiAgICAgIFtfLCBpbmRlbnRUZXh0LCBsaW5lXSA9IEBpbmRlbnRSZWdleC5leGVjIGxpbmVcclxuICAgICAgaW5kZW50ID0gY291bnRJbmRlbnQgaW5kZW50VGV4dFxyXG4gICAgICBsaW5lT2JqcyA9IFtdXHJcblxyXG4gICAgICBhcnJvd1NlY3Rpb25zID0gbGluZS5zcGxpdCgvXFxzKi0+XFxzKi8pXHJcbiAgICAgIGZvciBhcnJvd1NlY3Rpb24gaW4gYXJyb3dTZWN0aW9uc1xyXG4gICAgICAgIHNlbWlTZWN0aW9ucyA9IGFycm93U2VjdGlvbi5zcGxpdCgvXFxzKjtcXHMqLylcclxuICAgICAgICBmb3Igc2VtaVNlY3Rpb24gaW4gc2VtaVNlY3Rpb25zXHJcbiAgICAgICAgICBsaW5lT2Jqcy5wdXNoIHtcclxuICAgICAgICAgICAgICBpbmRlbnQ6IGluZGVudFxyXG4gICAgICAgICAgICAgIGxpbmU6IHNlbWlTZWN0aW9uXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICBpbmRlbnQgKz0gMTAwMFxyXG5cclxuICAgICAgZm9yIG9iaiBpbiBsaW5lT2Jqc1xyXG4gICAgICAgICMgY29uc29sZS5sb2cgSlNPTi5zdHJpbmdpZnkob2JqKVxyXG4gICAgICAgIHRvcEluZGVudCA9IEBpbmRlbnRTdGFjay50b3AoKVxyXG4gICAgICAgIGlmIG9iai5pbmRlbnQgPT0gdG9wSW5kZW50XHJcbiAgICAgICAgICAjIGRvIG5vdGhpbmdcclxuICAgICAgICBlbHNlIGlmIG9iai5pbmRlbnQgPiB0b3BJbmRlbnRcclxuICAgICAgICAgIEBpbmRlbnRTdGFjay5wdXNoIG9iai5pbmRlbnRcclxuICAgICAgICAgIGlmIG5vdCBAcHVzaFNjb3BlKClcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgZWxzZSBpZiAob2JqLmluZGVudCA8IDEwMDApIGFuZCAodG9wSW5kZW50ID49IDEwMDApXHJcbiAgICAgICAgICAjIHdlJ3JlIHJlY2VpdmluZyBhIHByb3BlciBpbmRlbnQgZm9yIG91ciBzdGFjaydzIHRvcC4gcmVwbGFjZSBpdCFcclxuICAgICAgICAgIEBpbmRlbnRTdGFjay5yZXBsYWNlVG9wKG9iai5pbmRlbnQpXHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgbG9vcFxyXG4gICAgICAgICAgICBpZiBub3QgQGluZGVudFN0YWNrLnBvcCgpXHJcbiAgICAgICAgICAgICAgQGxvZy5lcnJvciBcIlVuZXhwZWN0ZWQgaW5kZW50ICN7b2JqLmluZGVudH0gb24gbGluZSAje0BsaW5lTm99OiAje29iai5saW5lfVwiXHJcbiAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgICAgIGlmIG5vdCBAcG9wU2NvcGUoKVxyXG4gICAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICAgICAgICBjb250aW51ZSBpZiBAaW5kZW50U3RhY2sudG9wKCkgPj0gMTAwMFxyXG4gICAgICAgICAgICBicmVhayBpZiBAaW5kZW50U3RhY2sudG9wKCkgPT0gb2JqLmluZGVudFxyXG5cclxuICAgICAgICBpZiBub3QgQHByb2Nlc3NUb2tlbnMob2JqLmxpbmUuc3BsaXQoL1xccysvKSlcclxuICAgICAgICAgIHJldHVybiBmYWxzZVxyXG5cclxuICAgIHdoaWxlIEBpbmRlbnRTdGFjay5wb3AoKVxyXG4gICAgICBAcG9wU2NvcGUoKVxyXG5cclxuICAgIEBmaW5pc2hPYmplY3QoKVxyXG4gICAgcmV0dXJuIHRydWVcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFJlbmRlcmVyXHJcblxyXG4jIEluIGFsbCBjYXNlcyB3aGVyZSBhIHJlbmRlcmVkIHNvdW5kIGlzIGdlbmVyYXRlZCwgdGhlcmUgYXJlIGFjdHVhbGx5IHR3byBsZW5ndGhzXHJcbiMgYXNzb2NpYXRlZCB3aXRoIHRoZSBzb3VuZC4gXCJzb3VuZC5sZW5ndGhcIiBpcyB0aGUgXCJleHBlY3RlZFwiIGxlbmd0aCwgd2l0aCByZWdhcmRzXHJcbiMgdG8gdGhlIHR5cGVkLWluIGR1cmF0aW9uIGZvciBpdCBvciBmb3IgZGV0ZXJtaW5pbmcgbG9vcCBvZmZldHMuIFRoZSBvdGhlciBsZW5ndGhcclxuIyBpcyB0aGUgc291bmQuc2FtcGxlcy5sZW5ndGggKGFsc28ga25vd24gYXMgdGhlIFwib3ZlcmZsb3cgbGVuZ3RoXCIpLCB3aGljaCBpcyB0aGVcclxuIyBsZW5ndGggdGhhdCBhY2NvdW50cyBmb3IgdGhpbmdzIGxpa2UgcmV2ZXJiIG9yIGFueXRoaW5nIGVsc2UgdGhhdCB3b3VsZCBjYXVzZSB0aGVcclxuIyBzb3VuZCB0byBzcGlsbCBpbnRvIHRoZSBuZXh0IGxvb3AvdHJhY2suIFRoaXMgYWxsb3dzIGZvciBzZWFtbGVzcyBsb29wcyB0aGF0IGNhblxyXG4jIHBsYXkgYSBsb25nIHNvdW5kIGFzIHRoZSBlbmQgb2YgYSBwYXR0ZXJuLCBhbmQgaXQnbGwgY2xlYW5seSBtaXggaW50byB0aGUgYmVnaW5uaW5nXHJcbiMgb2YgdGhlIG5leHQgcGF0dGVybi5cclxuXHJcbmNsYXNzIFJlbmRlcmVyXHJcbiAgY29uc3RydWN0b3I6IChAbG9nLCBAc2FtcGxlUmF0ZSwgQHJlYWRMb2NhbEZpbGVzLCBAb2JqZWN0cykgLT5cclxuICAgIEBzb3VuZENhY2hlID0ge31cclxuXHJcbiAgZXJyb3I6ICh0ZXh0KSAtPlxyXG4gICAgQGxvZy5lcnJvciBcIlJFTkRFUiBFUlJPUjogI3t0ZXh0fVwiXHJcblxyXG4gIGdlbmVyYXRlRW52ZWxvcGU6IChhZHNyLCBsZW5ndGgpIC0+XHJcbiAgICBlbnZlbG9wZSA9IEFycmF5KGxlbmd0aClcclxuICAgIEF0b0QgPSBNYXRoLmZsb29yKGFkc3IuYSAqIGxlbmd0aClcclxuICAgIER0b1MgPSBNYXRoLmZsb29yKGFkc3IuZCAqIGxlbmd0aClcclxuICAgIFN0b1IgPSBNYXRoLmZsb29yKGFkc3IuciAqIGxlbmd0aClcclxuICAgIGF0dGFja0xlbiA9IEF0b0RcclxuICAgIGRlY2F5TGVuID0gRHRvUyAtIEF0b0RcclxuICAgIHN1c3RhaW5MZW4gPSBTdG9SIC0gRHRvU1xyXG4gICAgcmVsZWFzZUxlbiA9IGxlbmd0aCAtIFN0b1JcclxuICAgIHN1c3RhaW4gPSBhZHNyLnNcclxuICAgIHBlYWtTdXN0YWluRGVsdGEgPSAxLjAgLSBzdXN0YWluXHJcbiAgICBmb3IgaSBpbiBbMC4uLmF0dGFja0xlbl1cclxuICAgICAgIyBBdHRhY2tcclxuICAgICAgZW52ZWxvcGVbaV0gPSBpIC8gYXR0YWNrTGVuXHJcbiAgICBmb3IgaSBpbiBbMC4uLmRlY2F5TGVuXVxyXG4gICAgICAjIERlY2F5XHJcbiAgICAgIGVudmVsb3BlW0F0b0QgKyBpXSA9IDEuMCAtIChwZWFrU3VzdGFpbkRlbHRhICogKGkgLyBkZWNheUxlbikpXHJcbiAgICBmb3IgaSBpbiBbMC4uLnN1c3RhaW5MZW5dXHJcbiAgICAgICMgU3VzdGFpblxyXG4gICAgICBlbnZlbG9wZVtEdG9TICsgaV0gPSBzdXN0YWluXHJcbiAgICBmb3IgaSBpbiBbMC4uLnJlbGVhc2VMZW5dXHJcbiAgICAgICMgUmVsZWFzZVxyXG4gICAgICBlbnZlbG9wZVtTdG9SICsgaV0gPSBzdXN0YWluIC0gKHN1c3RhaW4gKiAoaSAvIHJlbGVhc2VMZW4pKVxyXG4gICAgcmV0dXJuIGVudmVsb3BlXHJcblxyXG4gIHJlbmRlclRvbmU6ICh0b25lT2JqLCBvdmVycmlkZXMpIC0+XHJcbiAgICBvZmZzZXQgPSAwXHJcbiAgICBhbXBsaXR1ZGUgPSAxMDAwMFxyXG4gICAgaWYgb3ZlcnJpZGVzLmxlbmd0aCA+IDBcclxuICAgICAgbGVuZ3RoID0gb3ZlcnJpZGVzLmxlbmd0aFxyXG4gICAgZWxzZVxyXG4gICAgICBsZW5ndGggPSBNYXRoLmZsb29yKHRvbmVPYmouZHVyYXRpb24gKiBAc2FtcGxlUmF0ZSAvIDEwMDApXHJcbiAgICBzYW1wbGVzID0gQXJyYXkobGVuZ3RoKVxyXG4gICAgQSA9IDIwMFxyXG4gICAgQiA9IDAuNVxyXG4gICAgaWYgb3ZlcnJpZGVzLm5vdGU/XHJcbiAgICAgIGZyZXEgPSBmaW5kRnJlcSh0b25lT2JqLm9jdGF2ZSwgb3ZlcnJpZGVzLm5vdGUpXHJcbiAgICBlbHNlIGlmIHRvbmVPYmouZnJlcT9cclxuICAgICAgZnJlcSA9IHRvbmVPYmouZnJlcVxyXG4gICAgZWxzZVxyXG4gICAgICBmcmVxID0gZmluZEZyZXEodG9uZU9iai5vY3RhdmUsIHRvbmVPYmoubm90ZSlcclxuICAgIGVudmVsb3BlID0gQGdlbmVyYXRlRW52ZWxvcGUodG9uZU9iai5hZHNyLCBsZW5ndGgpXHJcbiAgICBmb3IgaSBpbiBbMC4uLmxlbmd0aF1cclxuICAgICAgcGVyaW9kID0gQHNhbXBsZVJhdGUgLyBmcmVxXHJcbiAgICAgIHNpbmUgPSBNYXRoLnNpbihvZmZzZXQgKyBpIC8gcGVyaW9kICogMiAqIE1hdGguUEkpXHJcbiAgICAgICMgaWYodG9uZU9iai53YXYgPT0gXCJzcXVhcmVcIilcclxuICAgICAgIyAgIHNpbmUgPSAoc2luZSA+IDApID8gMSA6IC0xXHJcbiAgICAgIHNhbXBsZXNbaV0gPSBzaW5lICogYW1wbGl0dWRlICogZW52ZWxvcGVbaV1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzYW1wbGVzOiBzYW1wbGVzXHJcbiAgICAgIGxlbmd0aDogc2FtcGxlcy5sZW5ndGhcclxuICAgIH1cclxuXHJcbiAgcmVuZGVyU2FtcGxlOiAoc2FtcGxlT2JqLCBvdmVycmlkZXMpIC0+XHJcbiAgICB2aWV3ID0gbnVsbFxyXG5cclxuICAgIGlmIEByZWFkTG9jYWxGaWxlc1xyXG4gICAgICBkYXRhID0gZnMucmVhZEZpbGVTeW5jIHNhbXBsZU9iai5zcmNcclxuICAgICAgdmlldyA9IG5ldyBqRGF0YVZpZXcoZGF0YSwgMCwgZGF0YS5sZW5ndGgsIHRydWUpXHJcbiAgICBlbHNlXHJcbiAgICAgICQuYWpheCB7XHJcbiAgICAgICAgdXJsOiBzYW1wbGVPYmouc3JjXHJcbiAgICAgICAgbWltZVR5cGU6ICd0ZXh0L3BsYWluOyBjaGFyc2V0PXgtdXNlci1kZWZpbmVkJ1xyXG4gICAgICAgIHN1Y2Nlc3M6IChkYXRhKSAtPlxyXG4gICAgICAgICAgdmlldyA9IG5ldyBqRGF0YVZpZXcoZGF0YSwgMCwgZGF0YS5sZW5ndGgsIHRydWUpXHJcbiAgICAgICAgYXN5bmM6IGZhbHNlXHJcbiAgICAgIH1cclxuXHJcbiAgICBpZiBub3Qgdmlld1xyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHNhbXBsZXM6IFtdXHJcbiAgICAgICAgbGVuZ3RoOiAwXHJcbiAgICAgIH1cclxuXHJcbiAgICAjIHNraXAgdGhlIGZpcnN0IDQwIGJ5dGVzXHJcbiAgICB2aWV3LnNlZWsoNDApXHJcbiAgICBzdWJjaHVuazJTaXplID0gdmlldy5nZXRJbnQzMigpXHJcbiAgICBzYW1wbGVzID0gW11cclxuICAgIHdoaWxlIHZpZXcudGVsbCgpKzEgPCB2aWV3LmJ5dGVMZW5ndGhcclxuICAgICAgc2FtcGxlcy5wdXNoIHZpZXcuZ2V0SW50MTYoKVxyXG5cclxuICAgIGlmIChvdmVycmlkZXMubm90ZT8gYW5kIChvdmVycmlkZXMubm90ZSAhPSBzYW1wbGVPYmouc3Jjbm90ZSkpIG9yIChzYW1wbGVPYmoub2N0YXZlICE9IHNhbXBsZU9iai5zcmNvY3RhdmUpXHJcbiAgICAgIG9sZGZyZXEgPSBmaW5kRnJlcShzYW1wbGVPYmouc3Jjb2N0YXZlLCBzYW1wbGVPYmouc3Jjbm90ZSlcclxuICAgICAgbmV3ZnJlcSA9IGZpbmRGcmVxKHNhbXBsZU9iai5vY3RhdmUsIG92ZXJyaWRlcy5ub3RlKVxyXG5cclxuICAgICAgZmFjdG9yID0gb2xkZnJlcSAvIG5ld2ZyZXFcclxuICAgICAgIyBAbG9nLnZlcmJvc2UgXCJvbGQ6ICN7b2xkZnJlcX0sIG5ldzogI3tuZXdmcmVxfSwgZmFjdG9yOiAje2ZhY3Rvcn1cIlxyXG5cclxuICAgICAgIyBUT0RPOiBQcm9wZXJseSByZXNhbXBsZSBoZXJlIHdpdGggc29tZXRoaW5nIG90aGVyIHRoYW4gXCJuZWFyZXN0IG5laWdoYm9yXCJcclxuICAgICAgcmVsZW5ndGggPSBNYXRoLmZsb29yKHNhbXBsZXMubGVuZ3RoICogZmFjdG9yKVxyXG4gICAgICByZXNhbXBsZXMgPSBBcnJheShyZWxlbmd0aClcclxuICAgICAgZm9yIGkgaW4gWzAuLi5yZWxlbmd0aF1cclxuICAgICAgICByZXNhbXBsZXNbaV0gPSAwXHJcbiAgICAgIGZvciBpIGluIFswLi4ucmVsZW5ndGhdXHJcbiAgICAgICAgcmVzYW1wbGVzW2ldID0gc2FtcGxlc1tNYXRoLmZsb29yKGkgLyBmYWN0b3IpXVxyXG5cclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzYW1wbGVzOiByZXNhbXBsZXNcclxuICAgICAgICBsZW5ndGg6IHJlc2FtcGxlcy5sZW5ndGhcclxuICAgICAgfVxyXG4gICAgZWxzZVxyXG4gICAgICByZXR1cm4ge1xyXG4gICAgICAgIHNhbXBsZXM6IHNhbXBsZXNcclxuICAgICAgICBsZW5ndGg6IHNhbXBsZXMubGVuZ3RoXHJcbiAgICAgIH1cclxuXHJcbiAgcmVuZGVyTG9vcDogKGxvb3BPYmopIC0+XHJcbiAgICBiZWF0Q291bnQgPSAwXHJcbiAgICBmb3IgcGF0dGVybiBpbiBsb29wT2JqLl9wYXR0ZXJuc1xyXG4gICAgICBpZiBiZWF0Q291bnQgPCBwYXR0ZXJuLmxlbmd0aFxyXG4gICAgICAgIGJlYXRDb3VudCA9IHBhdHRlcm4ubGVuZ3RoXHJcblxyXG4gICAgc2FtcGxlc1BlckJlYXQgPSBAc2FtcGxlUmF0ZSAvIChsb29wT2JqLmJwbSAvIDYwKSAvIGxvb3BPYmouYmVhdHNcclxuICAgIHRvdGFsTGVuZ3RoID0gc2FtcGxlc1BlckJlYXQgKiBiZWF0Q291bnRcclxuICAgIG92ZXJmbG93TGVuZ3RoID0gdG90YWxMZW5ndGhcclxuXHJcbiAgICBmb3IgcGF0dGVybiBpbiBsb29wT2JqLl9wYXR0ZXJuc1xyXG4gICAgICBzZWN0aW9uQ291bnQgPSBwYXR0ZXJuLmxlbmd0aCAvIDE2XHJcbiAgICAgIG9mZnNldExlbmd0aCA9IE1hdGguZmxvb3IodG90YWxMZW5ndGggLyAxNiAvIHNlY3Rpb25Db3VudClcclxuICAgICAgZm9yIHNvdW5kIGluIHBhdHRlcm4uc291bmRzXHJcbiAgICAgICAgb3ZlcnJpZGVzID0ge31cclxuICAgICAgICBpZiBzb3VuZC5sZW5ndGggPiAwXHJcbiAgICAgICAgICBvdmVycmlkZXMubGVuZ3RoID0gc291bmQubGVuZ3RoICogb2Zmc2V0TGVuZ3RoXHJcbiAgICAgICAgaWYgc291bmQubm90ZT9cclxuICAgICAgICAgIG92ZXJyaWRlcy5ub3RlID0gc291bmQubm90ZVxyXG4gICAgICAgIHNvdW5kLl9yZW5kZXIgPSBAcmVuZGVyKHBhdHRlcm4uc3JjLCBvdmVycmlkZXMpXHJcbiAgICAgICAgZW5kID0gKHNvdW5kLm9mZnNldCAqIG9mZnNldExlbmd0aCkgKyBzb3VuZC5fcmVuZGVyLnNhbXBsZXMubGVuZ3RoXHJcbiAgICAgICAgaWYgb3ZlcmZsb3dMZW5ndGggPCBlbmRcclxuICAgICAgICAgIG92ZXJmbG93TGVuZ3RoID0gZW5kXHJcblxyXG4gICAgc2FtcGxlcyA9IEFycmF5KG92ZXJmbG93TGVuZ3RoKVxyXG4gICAgZm9yIGkgaW4gWzAuLi5vdmVyZmxvd0xlbmd0aF1cclxuICAgICAgc2FtcGxlc1tpXSA9IDBcclxuXHJcbiAgICBmb3IgcGF0dGVybiBpbiBsb29wT2JqLl9wYXR0ZXJuc1xyXG4gICAgICBzZWN0aW9uQ291bnQgPSBwYXR0ZXJuLmxlbmd0aCAvIDE2XHJcbiAgICAgIG9mZnNldExlbmd0aCA9IE1hdGguZmxvb3IodG90YWxMZW5ndGggLyAxNiAvIHNlY3Rpb25Db3VudClcclxuXHJcbiAgICAgIHBhdHRlcm5TYW1wbGVzID0gQXJyYXkob3ZlcmZsb3dMZW5ndGgpXHJcbiAgICAgIGZvciBpIGluIFswLi4ub3ZlcmZsb3dMZW5ndGhdXHJcbiAgICAgICAgcGF0dGVyblNhbXBsZXNbaV0gPSAwXHJcblxyXG4gICAgICBmb3Igc291bmQgaW4gcGF0dGVybi5zb3VuZHNcclxuICAgICAgICBzcmNTb3VuZCA9IHNvdW5kLl9yZW5kZXJcclxuXHJcbiAgICAgICAgb2JqID0gQGdldE9iamVjdChwYXR0ZXJuLnNyYylcclxuICAgICAgICBvZmZzZXQgPSBzb3VuZC5vZmZzZXQgKiBvZmZzZXRMZW5ndGhcclxuICAgICAgICBjb3B5TGVuID0gc3JjU291bmQuc2FtcGxlcy5sZW5ndGhcclxuICAgICAgICBpZiAob2Zmc2V0ICsgY29weUxlbikgPiBvdmVyZmxvd0xlbmd0aFxyXG4gICAgICAgICAgY29weUxlbiA9IG92ZXJmbG93TGVuZ3RoIC0gb2Zmc2V0XHJcblxyXG4gICAgICAgIGlmIG9iai5jbGlwXHJcbiAgICAgICAgICBmYWRlQ2xpcCA9IDIwMCAjIGZhZGUgb3V0IG92ZXIgdGhpcyBtYW55IHNhbXBsZXMgcHJpb3IgdG8gYSBjbGlwIHRvIGF2b2lkIGEgcG9wXHJcbiAgICAgICAgICBpZiBvZmZzZXQgPiBmYWRlQ2xpcFxyXG4gICAgICAgICAgICBmb3IgaiBpbiBbMC4uLmZhZGVDbGlwXVxyXG4gICAgICAgICAgICAgIHYgPSBwYXR0ZXJuU2FtcGxlc1tvZmZzZXQgLSBmYWRlQ2xpcCArIGpdXHJcbiAgICAgICAgICAgICAgcGF0dGVyblNhbXBsZXNbb2Zmc2V0IC0gZmFkZUNsaXAgKyBqXSA9IE1hdGguZmxvb3IodiAqICgoZmFkZUNsaXAgLSBqKSAvIGZhZGVDbGlwKSlcclxuICAgICAgICAgIGZvciBqIGluIFtvZmZzZXQuLi5vdmVyZmxvd0xlbmd0aF1cclxuICAgICAgICAgICAgIyBjbGVhbiBvdXQgdGhlIHJlc3Qgb2YgdGhlIHNvdW5kIHRvIGVuc3VyZSB0aGF0IHRoZSBwcmV2aW91cyBvbmUgKHdoaWNoIGNvdWxkIGJlIGxvbmdlcikgd2FzIGZ1bGx5IGNsaXBwZWRcclxuICAgICAgICAgICAgcGF0dGVyblNhbXBsZXNbal0gPSAwXHJcbiAgICAgICAgICBmb3IgaiBpbiBbMC4uLmNvcHlMZW5dXHJcbiAgICAgICAgICAgIHBhdHRlcm5TYW1wbGVzW29mZnNldCArIGpdID0gc3JjU291bmQuc2FtcGxlc1tqXVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgIGZvciBqIGluIFswLi4uY29weUxlbl1cclxuICAgICAgICAgICAgcGF0dGVyblNhbXBsZXNbb2Zmc2V0ICsgal0gKz0gc3JjU291bmQuc2FtcGxlc1tqXVxyXG5cclxuICAgICAgIyBOb3cgY29weSB0aGUgY2xpcHBlZCBwYXR0ZXJuIGludG8gdGhlIGZpbmFsIGxvb3BcclxuICAgICAgZm9yIGogaW4gWzAuLi5vdmVyZmxvd0xlbmd0aF1cclxuICAgICAgICBzYW1wbGVzW2pdICs9IHBhdHRlcm5TYW1wbGVzW2pdXHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc2FtcGxlczogc2FtcGxlc1xyXG4gICAgICBsZW5ndGg6IHRvdGFsTGVuZ3RoXHJcbiAgICB9XHJcblxyXG4gIHJlbmRlclRyYWNrOiAodHJhY2tPYmopIC0+XHJcbiAgICBwaWVjZUNvdW50ID0gMFxyXG4gICAgZm9yIHBhdHRlcm4gaW4gdHJhY2tPYmouX3BhdHRlcm5zXHJcbiAgICAgIGlmIHBpZWNlQ291bnQgPCBwYXR0ZXJuLnBhdHRlcm4ubGVuZ3RoXHJcbiAgICAgICAgcGllY2VDb3VudCA9IHBhdHRlcm4ucGF0dGVybi5sZW5ndGhcclxuXHJcbiAgICB0b3RhbExlbmd0aCA9IDBcclxuICAgIG92ZXJmbG93TGVuZ3RoID0gMFxyXG4gICAgcGllY2VUb3RhbExlbmd0aCA9IEFycmF5KHBpZWNlQ291bnQpXHJcbiAgICBwaWVjZU92ZXJmbG93TGVuZ3RoID0gQXJyYXkocGllY2VDb3VudClcclxuICAgIGZvciBwaWVjZUluZGV4IGluIFswLi4ucGllY2VDb3VudF1cclxuICAgICAgcGllY2VUb3RhbExlbmd0aFtwaWVjZUluZGV4XSA9IDBcclxuICAgICAgcGllY2VPdmVyZmxvd0xlbmd0aFtwaWVjZUluZGV4XSA9IDBcclxuICAgICAgZm9yIHBhdHRlcm4gaW4gdHJhY2tPYmouX3BhdHRlcm5zXHJcbiAgICAgICAgaWYgKHBpZWNlSW5kZXggPCBwYXR0ZXJuLnBhdHRlcm4ubGVuZ3RoKSBhbmQgKHBhdHRlcm4ucGF0dGVybltwaWVjZUluZGV4XSAhPSAnLicpXHJcbiAgICAgICAgICBzcmNTb3VuZCA9IEByZW5kZXIocGF0dGVybi5zcmMpXHJcbiAgICAgICAgICBpZiBwaWVjZVRvdGFsTGVuZ3RoW3BpZWNlSW5kZXhdIDwgc3JjU291bmQubGVuZ3RoXHJcbiAgICAgICAgICAgIHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF0gPSBzcmNTb3VuZC5sZW5ndGhcclxuICAgICAgICAgIGlmIHBpZWNlT3ZlcmZsb3dMZW5ndGhbcGllY2VJbmRleF0gPCBzcmNTb3VuZC5zYW1wbGVzLmxlbmd0aFxyXG4gICAgICAgICAgICBwaWVjZU92ZXJmbG93TGVuZ3RoW3BpZWNlSW5kZXhdID0gc3JjU291bmQuc2FtcGxlcy5sZW5ndGhcclxuICAgICAgcG9zc2libGVNYXhMZW5ndGggPSB0b3RhbExlbmd0aCArIHBpZWNlT3ZlcmZsb3dMZW5ndGhbcGllY2VJbmRleF1cclxuICAgICAgaWYgb3ZlcmZsb3dMZW5ndGggPCBwb3NzaWJsZU1heExlbmd0aFxyXG4gICAgICAgIG92ZXJmbG93TGVuZ3RoID0gcG9zc2libGVNYXhMZW5ndGhcclxuICAgICAgdG90YWxMZW5ndGggKz0gcGllY2VUb3RhbExlbmd0aFtwaWVjZUluZGV4XVxyXG5cclxuICAgIHNhbXBsZXMgPSBBcnJheShvdmVyZmxvd0xlbmd0aClcclxuICAgIGZvciBpIGluIFswLi4ub3ZlcmZsb3dMZW5ndGhdXHJcbiAgICAgIHNhbXBsZXNbaV0gPSAwXHJcblxyXG4gICAgZm9yIHBhdHRlcm4gaW4gdHJhY2tPYmouX3BhdHRlcm5zXHJcbiAgICAgIHRyYWNrT2Zmc2V0ID0gMFxyXG4gICAgICBzcmNTb3VuZCA9IEByZW5kZXIocGF0dGVybi5zcmMsIHt9KVxyXG4gICAgICBmb3IgcGllY2VJbmRleCBpbiBbMC4uLnBpZWNlQ291bnRdXHJcbiAgICAgICAgaWYgKHBpZWNlSW5kZXggPCBwYXR0ZXJuLnBhdHRlcm4ubGVuZ3RoKSBhbmQgKHBhdHRlcm4ucGF0dGVybltwaWVjZUluZGV4XSAhPSAnLicpXHJcbiAgICAgICAgICBjb3B5TGVuID0gc3JjU291bmQuc2FtcGxlcy5sZW5ndGhcclxuICAgICAgICAgIGlmICh0cmFja09mZnNldCArIGNvcHlMZW4pID4gb3ZlcmZsb3dMZW5ndGhcclxuICAgICAgICAgICAgY29weUxlbiA9IG92ZXJmbG93TGVuZ3RoIC0gdHJhY2tPZmZzZXRcclxuICAgICAgICAgIGZvciBqIGluIFswLi4uY29weUxlbl1cclxuICAgICAgICAgICAgc2FtcGxlc1t0cmFja09mZnNldCArIGpdICs9IHNyY1NvdW5kLnNhbXBsZXNbal1cclxuXHJcbiAgICAgICAgdHJhY2tPZmZzZXQgKz0gcGllY2VUb3RhbExlbmd0aFtwaWVjZUluZGV4XVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHNhbXBsZXM6IHNhbXBsZXNcclxuICAgICAgbGVuZ3RoOiB0b3RhbExlbmd0aFxyXG4gICAgfVxyXG5cclxuICBjYWxjQ2FjaGVOYW1lOiAodHlwZSwgd2hpY2gsIG92ZXJyaWRlcykgLT5cclxuICAgIGlmICh0eXBlICE9ICd0b25lJykgYW5kICh0eXBlICE9ICdzYW1wbGUnKVxyXG4gICAgICByZXR1cm4gd2hpY2hcclxuXHJcbiAgICBuYW1lID0gd2hpY2hcclxuICAgIGlmIG92ZXJyaWRlcy5ub3RlXHJcbiAgICAgIG5hbWUgKz0gXCIvTiN7b3ZlcnJpZGVzLm5vdGV9XCJcclxuICAgIGlmIG92ZXJyaWRlcy5sZW5ndGhcclxuICAgICAgbmFtZSArPSBcIi9MI3tvdmVycmlkZXMubGVuZ3RofVwiXHJcblxyXG4gICAgcmV0dXJuIG5hbWVcclxuXHJcbiAgZ2V0T2JqZWN0OiAod2hpY2gpIC0+XHJcbiAgICBvYmplY3QgPSBAb2JqZWN0c1t3aGljaF1cclxuICAgIGlmIG5vdCBvYmplY3RcclxuICAgICAgQGVycm9yIFwibm8gc3VjaCBvYmplY3QgI3t3aGljaH1cIlxyXG4gICAgICByZXR1cm4gbnVsbFxyXG4gICAgcmV0dXJuIG9iamVjdFxyXG5cclxuICByZW5kZXI6ICh3aGljaCwgb3ZlcnJpZGVzKSAtPlxyXG4gICAgb2JqZWN0ID0gQGdldE9iamVjdCh3aGljaClcclxuICAgIGlmIG5vdCBvYmplY3RcclxuICAgICAgcmV0dXJuIG51bGxcclxuXHJcbiAgICBjYWNoZU5hbWUgPSBAY2FsY0NhY2hlTmFtZShvYmplY3QuX3R5cGUsIHdoaWNoLCBvdmVycmlkZXMpXHJcbiAgICBpZiBAc291bmRDYWNoZVtjYWNoZU5hbWVdXHJcbiAgICAgIHJldHVybiBAc291bmRDYWNoZVtjYWNoZU5hbWVdXHJcblxyXG4gICAgc291bmQgPSBzd2l0Y2ggb2JqZWN0Ll90eXBlXHJcbiAgICAgIHdoZW4gJ3RvbmUnIHRoZW4gQHJlbmRlclRvbmUob2JqZWN0LCBvdmVycmlkZXMpXHJcbiAgICAgIHdoZW4gJ3NhbXBsZScgdGhlbiBAcmVuZGVyU2FtcGxlKG9iamVjdCwgb3ZlcnJpZGVzKVxyXG4gICAgICB3aGVuICdsb29wJyB0aGVuIEByZW5kZXJMb29wKG9iamVjdClcclxuICAgICAgd2hlbiAndHJhY2snIHRoZW4gQHJlbmRlclRyYWNrKG9iamVjdClcclxuICAgICAgZWxzZVxyXG4gICAgICAgIEBlcnJvciBcInVua25vd24gdHlwZSAje29iamVjdC5fdHlwZX1cIlxyXG4gICAgICAgIG51bGxcclxuXHJcbiAgICAjIFZvbHVtZVxyXG4gICAgaWYgb2JqZWN0LnZvbHVtZT8gYW5kIChvYmplY3Qudm9sdW1lICE9IDEuMClcclxuICAgICAgZm9yIGkgaW4gWzAuLi5zb3VuZC5zYW1wbGVzLmxlbmd0aF1cclxuICAgICAgICBzb3VuZC5zYW1wbGVzW2ldICo9IG9iamVjdC52b2x1bWVcclxuXHJcbiAgICAjIFJldmVyYlxyXG4gICAgaWYgb2JqZWN0LnJldmVyYj8gYW5kIChvYmplY3QucmV2ZXJiLmRlbGF5ID4gMClcclxuICAgICAgZGVsYXlTYW1wbGVzID0gTWF0aC5mbG9vcihvYmplY3QucmV2ZXJiLmRlbGF5ICogQHNhbXBsZVJhdGUgLyAxMDAwKVxyXG4gICAgICBpZiBzb3VuZC5zYW1wbGVzLmxlbmd0aCA+IGRlbGF5U2FtcGxlc1xyXG4gICAgICAgIHRvdGFsTGVuZ3RoID0gc291bmQuc2FtcGxlcy5sZW5ndGggKyAoZGVsYXlTYW1wbGVzICogOCkgIyB0aGlzICo4IGlzIHRvdGFsbHkgd3JvbmcuIE5lZWRzIG1vcmUgdGhvdWdodC5cclxuICAgICAgICAjIEBsb2cudmVyYm9zZSBcInJldmVyYmluZyAje2NhY2hlTmFtZX06ICN7ZGVsYXlTYW1wbGVzfS4gbGVuZ3RoIHVwZGF0ZSAje3NvdW5kLnNhbXBsZXMubGVuZ3RofSAtPiAje3RvdGFsTGVuZ3RofVwiXHJcbiAgICAgICAgc2FtcGxlcyA9IEFycmF5KHRvdGFsTGVuZ3RoKVxyXG4gICAgICAgIGZvciBpIGluIFswLi4uc291bmQuc2FtcGxlcy5sZW5ndGhdXHJcbiAgICAgICAgICBzYW1wbGVzW2ldID0gc291bmQuc2FtcGxlc1tpXVxyXG4gICAgICAgIGZvciBpIGluIFtzb3VuZC5zYW1wbGVzLmxlbmd0aC4uLnRvdGFsTGVuZ3RoXVxyXG4gICAgICAgICAgc2FtcGxlc1tpXSA9IDBcclxuICAgICAgICBmb3IgaSBpbiBbMC4uLih0b3RhbExlbmd0aCAtIGRlbGF5U2FtcGxlcyldXHJcbiAgICAgICAgICBzYW1wbGVzW2kgKyBkZWxheVNhbXBsZXNdICs9IE1hdGguZmxvb3Ioc2FtcGxlc1tpXSAqIG9iamVjdC5yZXZlcmIuZGVjYXkpXHJcbiAgICAgICAgc291bmQuc2FtcGxlcyA9IHNhbXBsZXNcclxuXHJcbiAgICBAbG9nLnZlcmJvc2UgXCJSZW5kZXJlZCAje2NhY2hlTmFtZX0uXCJcclxuICAgIEBzb3VuZENhY2hlW2NhY2hlTmFtZV0gPSBzb3VuZFxyXG4gICAgcmV0dXJuIHNvdW5kXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBFeHBvcnRzXHJcblxyXG5yZW5kZXJMb29wU2NyaXB0ID0gKGFyZ3MpIC0+XHJcbiAgbG9nT2JqID0gYXJncy5sb2dcclxuICBsb2dPYmoudmVyYm9zZSBcIlBhcnNpbmcuLi5cIlxyXG4gIHBhcnNlciA9IG5ldyBQYXJzZXIobG9nT2JqKVxyXG4gIHBhcnNlci5wYXJzZSBhcmdzLnNjcmlwdFxyXG5cclxuICB3aGljaCA9IGFyZ3Mud2hpY2hcclxuICB3aGljaCA/PSBwYXJzZXIubGFzdE9iamVjdFxyXG5cclxuICBpZiB3aGljaFxyXG4gICAgc2FtcGxlUmF0ZSA9IDQ0MTAwXHJcbiAgICBsb2dPYmoudmVyYm9zZSBcIlJlbmRlcmluZy4uLlwiXHJcbiAgICByZW5kZXJlciA9IG5ldyBSZW5kZXJlcihsb2dPYmosIHNhbXBsZVJhdGUsIGFyZ3MucmVhZExvY2FsRmlsZXMsIHBhcnNlci5vYmplY3RzKVxyXG4gICAgb3V0cHV0U291bmQgPSByZW5kZXJlci5yZW5kZXIod2hpY2gsIHt9KVxyXG4gICAgaWYgYXJncy5vdXRwdXRGaWxlbmFtZVxyXG4gICAgICByZXR1cm4gcmlmZndhdmUud3JpdGVXQVYgYXJncy5vdXRwdXRGaWxlbmFtZSwgc2FtcGxlUmF0ZSwgb3V0cHV0U291bmQuc2FtcGxlc1xyXG4gICAgcmV0dXJuIHJpZmZ3YXZlLm1ha2VCbG9iVXJsKHNhbXBsZVJhdGUsIG91dHB1dFNvdW5kLnNhbXBsZXMpXHJcblxyXG4gIHJldHVybiBudWxsXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9XHJcbiAgcmVuZGVyOiByZW5kZXJMb29wU2NyaXB0XHJcbiIsImZzID0gcmVxdWlyZSBcImZzXCJcclxuXHJcbmNsYXNzIEZhc3RCYXNlNjRcclxuXHJcbiAgY29uc3RydWN0b3I6IC0+XHJcbiAgICBAY2hhcnMgPSBcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky89XCJcclxuICAgIEBlbmNMb29rdXAgPSBbXVxyXG4gICAgZm9yIGkgaW4gWzAuLi40MDk2XVxyXG4gICAgICBAZW5jTG9va3VwW2ldID0gQGNoYXJzW2kgPj4gNl0gKyBAY2hhcnNbaSAmIDB4M0ZdXHJcblxyXG4gIGVuY29kZTogKHNyYykgLT5cclxuICAgIGxlbiA9IHNyYy5sZW5ndGhcclxuICAgIGRzdCA9ICcnXHJcbiAgICBpID0gMFxyXG4gICAgd2hpbGUgKGxlbiA+IDIpXHJcbiAgICAgIG4gPSAoc3JjW2ldIDw8IDE2KSB8IChzcmNbaSsxXTw8OCkgfCBzcmNbaSsyXVxyXG4gICAgICBkc3QrPSB0aGlzLmVuY0xvb2t1cFtuID4+IDEyXSArIHRoaXMuZW5jTG9va3VwW24gJiAweEZGRl1cclxuICAgICAgbGVuLT0gM1xyXG4gICAgICBpKz0gM1xyXG4gICAgaWYgKGxlbiA+IDApXHJcbiAgICAgIG4xPSAoc3JjW2ldICYgMHhGQykgPj4gMlxyXG4gICAgICBuMj0gKHNyY1tpXSAmIDB4MDMpIDw8IDRcclxuICAgICAgaWYgKGxlbiA+IDEpXHJcbiAgICAgICAgbjIgfD0gKHNyY1srK2ldICYgMHhGMCkgPj4gNFxyXG4gICAgICBkc3QrPSB0aGlzLmNoYXJzW24xXVxyXG4gICAgICBkc3QrPSB0aGlzLmNoYXJzW24yXVxyXG4gICAgICBpZiAobGVuID09IDIpXHJcbiAgICAgICAgbjM9IChzcmNbaSsrXSAmIDB4MEYpIDw8IDJcclxuICAgICAgICBuMyB8PSAoc3JjW2ldICYgMHhDMCkgPj4gNlxyXG4gICAgICAgIGRzdCs9IHRoaXMuY2hhcnNbbjNdXHJcbiAgICAgIGlmIChsZW4gPT0gMSlcclxuICAgICAgICBkc3QrPSAnPSdcclxuICAgICAgZHN0Kz0gJz0nXHJcblxyXG4gICAgcmV0dXJuIGRzdFxyXG5cclxuY2xhc3MgUklGRldBVkVcclxuICBjb25zdHJ1Y3RvcjogKEBzYW1wbGVSYXRlLCBAZGF0YSkgLT5cclxuICAgIEB3YXYgPSBbXSAgICAgIyBBcnJheSBjb250YWluaW5nIHRoZSBnZW5lcmF0ZWQgd2F2ZSBmaWxlXHJcbiAgICBAaGVhZGVyID0gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIyBPRkZTIFNJWkUgTk9URVNcclxuICAgICAgY2h1bmtJZCAgICAgIDogWzB4NTIsMHg0OSwweDQ2LDB4NDZdLCAjIDAgICAgNCAgXCJSSUZGXCIgPSAweDUyNDk0NjQ2XHJcbiAgICAgIGNodW5rU2l6ZSAgICA6IDAsICAgICAgICAgICAgICAgICAgICAgIyA0ICAgIDQgIDM2K1N1YkNodW5rMlNpemUgPSA0Kyg4K1N1YkNodW5rMVNpemUpKyg4K1N1YkNodW5rMlNpemUpXHJcbiAgICAgIGZvcm1hdCAgICAgICA6IFsweDU3LDB4NDEsMHg1NiwweDQ1XSwgIyA4ICAgIDQgIFwiV0FWRVwiID0gMHg1NzQxNTY0NVxyXG4gICAgICBzdWJDaHVuazFJZCAgOiBbMHg2NiwweDZkLDB4NzQsMHgyMF0sICMgMTIgICA0ICBcImZtdCBcIiA9IDB4NjY2ZDc0MjBcclxuICAgICAgc3ViQ2h1bmsxU2l6ZTogMTYsICAgICAgICAgICAgICAgICAgICAjIDE2ICAgNCAgMTYgZm9yIFBDTVxyXG4gICAgICBhdWRpb0Zvcm1hdCAgOiAxLCAgICAgICAgICAgICAgICAgICAgICMgMjAgICAyICBQQ00gPSAxXHJcbiAgICAgIG51bUNoYW5uZWxzICA6IDEsICAgICAgICAgICAgICAgICAgICAgIyAyMiAgIDIgIE1vbm8gPSAxLCBTdGVyZW8gPSAyLi4uXHJcbiAgICAgIHNhbXBsZVJhdGUgICA6IEBzYW1wbGVSYXRlLCAgICAgICAgICAgIyAyNCAgIDQgIDgwMDAsIDQ0MTAwLi4uXHJcbiAgICAgIGJ5dGVSYXRlICAgICA6IDAsICAgICAgICAgICAgICAgICAgICAgIyAyOCAgIDQgIFNhbXBsZVJhdGUqTnVtQ2hhbm5lbHMqQml0c1BlclNhbXBsZS84XHJcbiAgICAgIGJsb2NrQWxpZ24gICA6IDAsICAgICAgICAgICAgICAgICAgICAgIyAzMiAgIDIgIE51bUNoYW5uZWxzKkJpdHNQZXJTYW1wbGUvOFxyXG4gICAgICBiaXRzUGVyU2FtcGxlOiAxNiwgICAgICAgICAgICAgICAgICAgICMgMzQgICAyICA4IGJpdHMgPSA4LCAxNiBiaXRzID0gMTZcclxuICAgICAgc3ViQ2h1bmsySWQgIDogWzB4NjQsMHg2MSwweDc0LDB4NjFdLCAjIDM2ICAgNCAgXCJkYXRhXCIgPSAweDY0NjE3NDYxXHJcbiAgICAgIHN1YkNodW5rMlNpemU6IDAgICAgICAgICAgICAgICAgICAgICAgIyA0MCAgIDQgIGRhdGEgc2l6ZSA9IE51bVNhbXBsZXMqTnVtQ2hhbm5lbHMqQml0c1BlclNhbXBsZS84XHJcblxyXG4gICAgQGdlbmVyYXRlKClcclxuXHJcbiAgdTMyVG9BcnJheTogKGkpIC0+XHJcbiAgICByZXR1cm4gW2kmMHhGRiwgKGk+PjgpJjB4RkYsIChpPj4xNikmMHhGRiwgKGk+PjI0KSYweEZGXVxyXG5cclxuICB1MTZUb0FycmF5OiAoaSkgLT5cclxuICAgIHJldHVybiBbaSYweEZGLCAoaT4+OCkmMHhGRl1cclxuXHJcbiAgc3BsaXQxNmJpdEFycmF5OiAoZGF0YSkgLT5cclxuICAgIHIgPSBbXVxyXG4gICAgaiA9IDBcclxuICAgIGxlbiA9IGRhdGEubGVuZ3RoXHJcbiAgICBmb3IgaSBpbiBbMC4uLmxlbl1cclxuICAgICAgcltqKytdID0gZGF0YVtpXSAmIDB4RkZcclxuICAgICAgcltqKytdID0gKGRhdGFbaV0+PjgpICYgMHhGRlxyXG5cclxuICAgIHJldHVybiByXHJcblxyXG4gIGdlbmVyYXRlOiAtPlxyXG4gICAgQGhlYWRlci5ibG9ja0FsaWduID0gKEBoZWFkZXIubnVtQ2hhbm5lbHMgKiBAaGVhZGVyLmJpdHNQZXJTYW1wbGUpID4+IDNcclxuICAgIEBoZWFkZXIuYnl0ZVJhdGUgPSBAaGVhZGVyLmJsb2NrQWxpZ24gKiBAc2FtcGxlUmF0ZVxyXG4gICAgQGhlYWRlci5zdWJDaHVuazJTaXplID0gQGRhdGEubGVuZ3RoICogKEBoZWFkZXIuYml0c1BlclNhbXBsZSA+PiAzKVxyXG4gICAgQGhlYWRlci5jaHVua1NpemUgPSAzNiArIEBoZWFkZXIuc3ViQ2h1bmsyU2l6ZVxyXG5cclxuICAgIGlmIEBoZWFkZXIuYml0c1BlclNhbXBsZSA9PSAxNlxyXG4gICAgICBAZGF0YSA9IEBzcGxpdDE2Yml0QXJyYXkoQGRhdGEpXHJcblxyXG4gICAgQHdhdiA9IEBoZWFkZXIuY2h1bmtJZC5jb25jYXQoXHJcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuY2h1bmtTaXplKSxcclxuICAgICAgQGhlYWRlci5mb3JtYXQsXHJcbiAgICAgIEBoZWFkZXIuc3ViQ2h1bmsxSWQsXHJcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuc3ViQ2h1bmsxU2l6ZSksXHJcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIuYXVkaW9Gb3JtYXQpLFxyXG4gICAgICBAdTE2VG9BcnJheShAaGVhZGVyLm51bUNoYW5uZWxzKSxcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5zYW1wbGVSYXRlKSxcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5ieXRlUmF0ZSksXHJcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIuYmxvY2tBbGlnbiksXHJcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIuYml0c1BlclNhbXBsZSksXHJcbiAgICAgIEBoZWFkZXIuc3ViQ2h1bmsySWQsXHJcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuc3ViQ2h1bmsyU2l6ZSksXHJcbiAgICAgIEBkYXRhXHJcbiAgICApXHJcbiAgICBmYiA9IG5ldyBGYXN0QmFzZTY0XHJcbiAgICBAYmFzZTY0RGF0YSA9IGZiLmVuY29kZShAd2F2KVxyXG4gICAgQGRhdGFVUkkgPSAnZGF0YTphdWRpby93YXY7YmFzZTY0LCcgKyBAYmFzZTY0RGF0YVxyXG5cclxuICByYXc6IC0+XHJcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihAYmFzZTY0RGF0YSwgXCJiYXNlNjRcIilcclxuXHJcbndyaXRlV0FWID0gKGZpbGVuYW1lLCBzYW1wbGVSYXRlLCBzYW1wbGVzKSAtPlxyXG4gIHdhdmUgPSBuZXcgUklGRldBVkUgc2FtcGxlUmF0ZSwgc2FtcGxlc1xyXG4gIGZzLndyaXRlRmlsZVN5bmMoZmlsZW5hbWUsIHdhdmUucmF3KCkpXHJcbiAgcmV0dXJuIHRydWVcclxuXHJcbm1ha2VEYXRhVVJJID0gKHNhbXBsZVJhdGUsIHNhbXBsZXMpIC0+XHJcbiAgd2F2ZSA9IG5ldyBSSUZGV0FWRSBzYW1wbGVSYXRlLCBzYW1wbGVzXHJcbiAgcmV0dXJuIHdhdmUuZGF0YVVSSVxyXG5cclxuYjY0dG9CbG9iID0gKGI2NERhdGEsIGNvbnRlbnRUeXBlLCBzbGljZVNpemUpIC0+XHJcbiAgY29udGVudFR5cGUgPSBjb250ZW50VHlwZSB8fCAnJ1xyXG4gIHNsaWNlU2l6ZSA9IHNsaWNlU2l6ZSB8fCA1MTJcclxuXHJcbiAgYnl0ZUNoYXJhY3RlcnMgPSBhdG9iKGI2NERhdGEpXHJcbiAgYnl0ZUFycmF5cyA9IFtdXHJcblxyXG4gIGZvciBvZmZzZXQgaW4gWzAuLi5ieXRlQ2hhcmFjdGVycy5sZW5ndGhdIGJ5IHNsaWNlU2l6ZVxyXG4gICAgc2xpY2UgPSBieXRlQ2hhcmFjdGVycy5zbGljZShvZmZzZXQsIG9mZnNldCArIHNsaWNlU2l6ZSlcclxuXHJcbiAgICBieXRlTnVtYmVycyA9IG5ldyBBcnJheShzbGljZS5sZW5ndGgpXHJcbiAgICBmb3IgaSBpbiBbMC4uLnNsaWNlLmxlbmd0aF1cclxuICAgICAgYnl0ZU51bWJlcnNbaV0gPSBzbGljZS5jaGFyQ29kZUF0KGkpXHJcblxyXG4gICAgYnl0ZUFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnl0ZU51bWJlcnMpXHJcblxyXG4gICAgYnl0ZUFycmF5cy5wdXNoKGJ5dGVBcnJheSlcclxuXHJcbiAgYmxvYiA9IG5ldyBCbG9iKGJ5dGVBcnJheXMsIHt0eXBlOiBjb250ZW50VHlwZX0pXHJcbiAgcmV0dXJuIGJsb2JcclxuXHJcbm1ha2VCbG9iVXJsID0gKHNhbXBsZVJhdGUsIHNhbXBsZXMpIC0+XHJcbiAgd2F2ZSA9IG5ldyBSSUZGV0FWRSBzYW1wbGVSYXRlLCBzYW1wbGVzXHJcbiAgYmxvYiA9IGI2NHRvQmxvYih3YXZlLmJhc2U2NERhdGEsIFwiYXVkaW8vd2F2XCIpXHJcbiAgcmV0dXJuIFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYilcclxuXHJcbm1vZHVsZS5leHBvcnRzID1cclxuICBSSUZGV0FWRTogUklGRldBVkVcclxuICB3cml0ZVdBVjogd3JpdGVXQVZcclxuICBtYWtlRGF0YVVSSTogbWFrZURhdGFVUklcclxuICBtYWtlQmxvYlVybDogbWFrZUJsb2JVcmxcclxuIl19
