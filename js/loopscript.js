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
  motto: "# ------------------------------------------------------------\n# An approximation of the beat from Drake's \"The Motto\"\n\nbpm 100\nsection # to share ADSR\n  adsr 0.005 0.05 0.7 0.05\n  tone bass1 -> octave 1\n  tone bass2 -> octave 2\n\nsample clap  -> src samples/clap.wav\nsample snare -> src samples/snare.wav\nsample hihat -> src samples/hihat.wav\n\nloop loop1\n  pattern hihat ..x.......x.......x.......x.....\n  pattern clap  ....x.......x.......x.......x...\n  pattern snare ......x...x...x.x...............\n  pattern bass1 Bbbbbb..........................\n  pattern bass2 ......HhhhhhDddddd....HhhhJj.Jj.\n\ntrack song\n  pattern loop1 xxxx\n",
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
var Parser, Renderer, clone, countIndent, findFreq, fs, jDataView, logDebug, parseBool, renderLoopScript, riffwave,
  __slice = [].slice;

findFreq = require('./freq').findFreq;

riffwave = require("./riffwave");

jDataView = require('../js/jdataview');

fs = require('fs');

logDebug = function() {
  var args;
  args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
};

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
        bpm: 'int'
      },
      track: {}
    };
    this.stateStack = [];
    this.reset('default', 0);
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

  Parser.prototype.reset = function(name, indent) {
    var newState;
    if (name == null) {
      name = 'default';
    }
    if (indent == null) {
      indent = 0;
    }
    if (!this.namedStates[name]) {
      this.error("invalid reset name: " + name);
      return false;
    }
    newState = clone(this.namedStates[name]);
    newState._indent = indent;
    this.stateStack.push(newState);
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
    var data, i, indent, _i, _ref;
    indent = arguments[0], data = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    this.object = {
      _indent: indent
    };
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
      this.lastObject = this.object._name;
      return logDebug("createObject[" + indent + "]: ", this.lastObject);
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
      logDebug("finishObject: ", this.object);
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

  Parser.prototype.updateFakeIndents = function(indent) {
    var i, prevIndent, _results;
    if (indent >= 1000) {
      return;
    }
    i = this.stateStack.length - 1;
    _results = [];
    while (i > 0) {
      prevIndent = this.stateStack[i - 1]._indent;
      if ((this.stateStack[i]._indent > 1000) && (prevIndent < indent)) {
        logDebug("updateFakeIndents: changing stack indent " + i + " from " + this.stateStack[i]._indent + " to " + indent);
        this.stateStack[i]._indent = indent;
      }
      _results.push(i--);
    }
    return _results;
  };

  Parser.prototype.pushState = function(indent) {
    if (indent == null) {
      indent = 0;
    }
    logDebug("pushState(" + indent + ")");
    this.updateFakeIndents(indent);
    this.stateStack.push({
      _indent: indent
    });
    return true;
  };

  Parser.prototype.popState = function(indent) {
    var topIndent;
    logDebug("popState(" + indent + ")");
    if (this.object != null) {
      if (indent <= this.object._indent) {
        this.finishObject();
      }
    }
    this.updateFakeIndents(indent);
    while (true) {
      topIndent = this.getTopIndent();
      logDebug("popState(" + indent + ") top indent " + topIndent);
      if (indent === topIndent) {
        break;
      }
      if (this.stateStack.length < 2) {
        return false;
      }
      logDebug("popState(" + indent + ") popping indent " + topIndent);
      this.stateStack.pop();
    }
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

  Parser.prototype.getTopIndent = function() {
    return this.stateStack[this.stateStack.length - 1]._indent;
  };

  Parser.prototype.processTokens = function(tokens, indent) {
    var cmd, pattern;
    cmd = tokens[0].toLowerCase();
    if (cmd === 'reset') {
      if (!this.reset(tokens[1], indent)) {
        return false;
      }
    } else if (cmd === 'section') {
      this.objectScopeReady = true;
    } else if (this.isObjectType(cmd)) {
      this.createObject(indent, '_type', cmd, '_name', tokens[1]);
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
        logDebug("handling indent: " + JSON.stringify(obj));
        topIndent = this.getTopIndent();
        if (obj.indent > topIndent) {
          this.pushState(obj.indent);
        } else {
          if (!this.popState(obj.indent)) {
            this.log.error("unexpected outdent");
            return false;
          }
        }
        logDebug("processing: " + JSON.stringify(obj));
        if (!this.processTokens(obj.line.split(/\s+/), obj.indent)) {
          return false;
        }
      }
    }
    this.popState(0);
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
    samplesPerBeat = this.sampleRate / (loopObj.bpm / 60) / 4;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCJqZGF0YXZpZXcuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxsaWJcXF9lbXB0eS5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcbmF0aXZlLWJ1ZmZlci1icm93c2VyaWZ5XFxpbmRleC5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcbmF0aXZlLWJ1ZmZlci1icm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJhc2U2NC1qc1xcbGliXFxiNjQuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXG5hdGl2ZS1idWZmZXItYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxpZWVlNzU0XFxpbmRleC5qcyIsIi4uXFxzcmNcXGV4YW1wbGVzLmNvZmZlZSIsIi4uXFxzcmNcXGZyZXEuY29mZmVlIiwiLi5cXHNyY1xcbG9vcHNjcmlwdC5jb2ZmZWUiLCIuLlxcc3JjXFxyaWZmd2F2ZS5jb2ZmZWUiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNXZCQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoaUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQSxNQUFNLENBQUMsT0FBUCxHQUVFO0FBQUEsRUFBQSxLQUFBLEVBQU8sd1RBQVA7QUFBQSxFQW9CQSxLQUFBLEVBQU8sZ2ZBcEJQO0FBQUEsRUFrREEsS0FBQSxFQUFPLG1wQkFsRFA7QUFBQSxFQTRFQSxNQUFBLEVBQVEsOHJCQTVFUjtBQUFBLEVBd0dBLE9BQUEsRUFBUyx1ZEF4R1Q7Q0FGRixDQUFBOzs7Ozs7OztBQ0FBLElBQUEsbUNBQUE7O0FBQUEsU0FBQSxHQUFZO0VBQ1Y7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7R0FEVSxFQVFWO0FBQUEsSUFDRSxHQUFBLEVBQUssT0FEUDtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtBQUFBLElBS0UsR0FBQSxFQUFLLE9BTFA7QUFBQSxJQU1FLEdBQUEsRUFBSyxPQU5QO0FBQUEsSUFPRSxHQUFBLEVBQUssT0FQUDtBQUFBLElBUUUsR0FBQSxFQUFLLE9BUlA7QUFBQSxJQVNFLEdBQUEsRUFBSyxPQVRQO0FBQUEsSUFVRSxHQUFBLEVBQUssT0FWUDtBQUFBLElBV0UsR0FBQSxFQUFLLE9BWFA7QUFBQSxJQVlFLEdBQUEsRUFBSyxPQVpQO0dBUlUsRUF1QlY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0F2QlUsRUFzQ1Y7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0F0Q1UsRUFxRFY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0FyRFUsRUFvRVY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFB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SUFFQSxXQUFBLEdBQWtCLElBQUEsS0FBQSxDQUFNLEtBQUssQ0FBQyxNQUFaLENBRmxCLENBQUE7QUFHQSxTQUFTLG9HQUFULEdBQUE7QUFDRSxNQUFBLFdBQVksQ0FBQSxDQUFBLENBQVosR0FBaUIsS0FBSyxDQUFDLFVBQU4sQ0FBaUIsQ0FBakIsQ0FBakIsQ0FERjtBQUFBLEtBSEE7QUFBQSxJQU1BLFNBQUEsR0FBZ0IsSUFBQSxVQUFBLENBQVcsV0FBWCxDQU5oQixDQUFBO0FBQUEsSUFRQSxVQUFVLENBQUMsSUFBWCxDQUFnQixTQUFoQixDQVJBLENBREY7QUFBQSxHQU5BO0FBQUEsRUFpQkEsSUFBQSxHQUFXLElBQUEsSUFBQSxDQUFLLFVBQUwsRUFBaUI7QUFBQSxJQUFDLElBQUEsRUFBTSxXQUFQO0dBQWpCLENBakJYLENBQUE7QUFrQkEsU0FBTyxJQUFQLENBbkJVO0FBQUEsQ0FoSFosQ0FBQTs7QUFBQSxXQXFJQSxHQUFjLFNBQUMsVUFBRCxFQUFhLE9BQWIsR0FBQTtBQUNaLE1BQUEsVUFBQTtBQUFBLEVBQUEsSUFBQSxHQUFXLElBQUEsUUFBQSxDQUFTLFVBQVQsRUFBcUIsT0FBckIsQ0FBWCxDQUFBO0FBQUEsRUFDQSxJQUFBLEdBQU8sU0FBQSxDQUFVLElBQUksQ0FBQyxVQUFmLEVBQTJCLFdBQTNCLENBRFAsQ0FBQTtBQUVBLFNBQU8sR0FBRyxDQUFDLGVBQUosQ0FBb0IsSUFBcEIsQ0FBUCxDQUhZO0FBQUEsQ0FySWQsQ0FBQTs7QUFBQSxNQTBJTSxDQUFDLE9BQVAsR0FDRTtBQUFBLEVBQUEsUUFBQSxFQUFVLFFBQVY7QUFBQSxFQUNBLFFBQUEsRUFBVSxRQURWO0FBQUEsRUFFQSxXQUFBLEVBQWEsV0FGYjtBQUFBLEVBR0EsV0FBQSxFQUFhLFdBSGI7Q0EzSUYsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uIChCdWZmZXIpe1xuLy9cbi8vIGpEYXRhVmlldyBieSBWamV1eCA8dmpldXh4QGdtYWlsLmNvbT4gLSBKYW4gMjAxMFxuLy8gQ29udGludWVkIGJ5IFJSZXZlcnNlciA8bWVAcnJldmVyc2VyLmNvbT4gLSBGZWIgMjAxM1xuLy9cbi8vIEEgdW5pcXVlIHdheSB0byB3b3JrIHdpdGggYSBiaW5hcnkgZmlsZSBpbiB0aGUgYnJvd3NlclxuLy8gaHR0cDovL2dpdGh1Yi5jb20vakRhdGFWaWV3L2pEYXRhVmlld1xuLy8gaHR0cDovL2pEYXRhVmlldy5naXRodWIuaW8vXG5cbihmdW5jdGlvbiAoZ2xvYmFsKSB7XG5cbid1c2Ugc3RyaWN0JztcblxudmFyIGNvbXBhdGliaWxpdHkgPSB7XG5cdC8vIE5vZGVKUyBCdWZmZXIgaW4gdjAuNS41IGFuZCBuZXdlclxuXHROb2RlQnVmZmVyOiAnQnVmZmVyJyBpbiBnbG9iYWwgJiYgJ3JlYWRJbnQxNkxFJyBpbiBCdWZmZXIucHJvdG90eXBlLFxuXHREYXRhVmlldzogJ0RhdGFWaWV3JyBpbiBnbG9iYWwgJiYgKFxuXHRcdCdnZXRGbG9hdDY0JyBpbiBEYXRhVmlldy5wcm90b3R5cGUgfHwgICAgICAgICAgICAvLyBDaHJvbWVcblx0XHQnZ2V0RmxvYXQ2NCcgaW4gbmV3IERhdGFWaWV3KG5ldyBBcnJheUJ1ZmZlcigxKSkgLy8gTm9kZVxuXHQpLFxuXHRBcnJheUJ1ZmZlcjogJ0FycmF5QnVmZmVyJyBpbiBnbG9iYWwsXG5cdFBpeGVsRGF0YTogJ0NhbnZhc1BpeGVsQXJyYXknIGluIGdsb2JhbCAmJiAnSW1hZ2VEYXRhJyBpbiBnbG9iYWwgJiYgJ2RvY3VtZW50JyBpbiBnbG9iYWxcbn07XG5cbi8vIHdlIGRvbid0IHdhbnQgdG8gYm90aGVyIHdpdGggb2xkIEJ1ZmZlciBpbXBsZW1lbnRhdGlvblxuaWYgKGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlcikge1xuXHQoZnVuY3Rpb24gKGJ1ZmZlcikge1xuXHRcdHRyeSB7XG5cdFx0XHRidWZmZXIud3JpdGVGbG9hdExFKEluZmluaXR5LCAwKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIgPSBmYWxzZTtcblx0XHR9XG5cdH0pKG5ldyBCdWZmZXIoNCkpO1xufVxuXG5pZiAoY29tcGF0aWJpbGl0eS5QaXhlbERhdGEpIHtcblx0dmFyIGNyZWF0ZVBpeGVsRGF0YSA9IGZ1bmN0aW9uIChieXRlTGVuZ3RoLCBidWZmZXIpIHtcblx0XHR2YXIgZGF0YSA9IGNyZWF0ZVBpeGVsRGF0YS5jb250ZXh0MmQuY3JlYXRlSW1hZ2VEYXRhKChieXRlTGVuZ3RoICsgMykgLyA0LCAxKS5kYXRhO1xuXHRcdGRhdGEuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGg7XG5cdFx0aWYgKGJ1ZmZlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVMZW5ndGg7IGkrKykge1xuXHRcdFx0XHRkYXRhW2ldID0gYnVmZmVyW2ldO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZGF0YTtcblx0fTtcblx0Y3JlYXRlUGl4ZWxEYXRhLmNvbnRleHQyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpLmdldENvbnRleHQoJzJkJyk7XG59XG5cbnZhciBkYXRhVHlwZXMgPSB7XG5cdCdJbnQ4JzogMSxcblx0J0ludDE2JzogMixcblx0J0ludDMyJzogNCxcblx0J1VpbnQ4JzogMSxcblx0J1VpbnQxNic6IDIsXG5cdCdVaW50MzInOiA0LFxuXHQnRmxvYXQzMic6IDQsXG5cdCdGbG9hdDY0JzogOFxufTtcblxudmFyIG5vZGVOYW1pbmcgPSB7XG5cdCdJbnQ4JzogJ0ludDgnLFxuXHQnSW50MTYnOiAnSW50MTYnLFxuXHQnSW50MzInOiAnSW50MzInLFxuXHQnVWludDgnOiAnVUludDgnLFxuXHQnVWludDE2JzogJ1VJbnQxNicsXG5cdCdVaW50MzInOiAnVUludDMyJyxcblx0J0Zsb2F0MzInOiAnRmxvYXQnLFxuXHQnRmxvYXQ2NCc6ICdEb3VibGUnXG59O1xuXG5mdW5jdGlvbiBhcnJheUZyb20oYXJyYXlMaWtlLCBmb3JjZUNvcHkpIHtcblx0cmV0dXJuICghZm9yY2VDb3B5ICYmIChhcnJheUxpa2UgaW5zdGFuY2VvZiBBcnJheSkpID8gYXJyYXlMaWtlIDogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJyYXlMaWtlKTtcbn1cblxuZnVuY3Rpb24gZGVmaW5lZCh2YWx1ZSwgZGVmYXVsdFZhbHVlKSB7XG5cdHJldHVybiB2YWx1ZSAhPT0gdW5kZWZpbmVkID8gdmFsdWUgOiBkZWZhdWx0VmFsdWU7XG59XG5cbmZ1bmN0aW9uIGpEYXRhVmlldyhidWZmZXIsIGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgsIGxpdHRsZUVuZGlhbikge1xuXHQvKiBqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cblxuXHRpZiAoYnVmZmVyIGluc3RhbmNlb2YgakRhdGFWaWV3KSB7XG5cdFx0dmFyIHJlc3VsdCA9IGJ1ZmZlci5zbGljZShieXRlT2Zmc2V0LCBieXRlT2Zmc2V0ICsgYnl0ZUxlbmd0aCk7XG5cdFx0cmVzdWx0Ll9saXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgcmVzdWx0Ll9saXR0bGVFbmRpYW4pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRpZiAoISh0aGlzIGluc3RhbmNlb2YgakRhdGFWaWV3KSkge1xuXHRcdHJldHVybiBuZXcgakRhdGFWaWV3KGJ1ZmZlciwgYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCwgbGl0dGxlRW5kaWFuKTtcblx0fVxuXG5cdHRoaXMuYnVmZmVyID0gYnVmZmVyID0gakRhdGFWaWV3LndyYXBCdWZmZXIoYnVmZmVyKTtcblxuXHQvLyBDaGVjayBwYXJhbWV0ZXJzIGFuZCBleGlzdGluZyBmdW5jdGlvbm5hbGl0aWVzXG5cdHRoaXMuX2lzQXJyYXlCdWZmZXIgPSBjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyICYmIGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyO1xuXHR0aGlzLl9pc1BpeGVsRGF0YSA9IGNvbXBhdGliaWxpdHkuUGl4ZWxEYXRhICYmIGJ1ZmZlciBpbnN0YW5jZW9mIENhbnZhc1BpeGVsQXJyYXk7XG5cdHRoaXMuX2lzRGF0YVZpZXcgPSBjb21wYXRpYmlsaXR5LkRhdGFWaWV3ICYmIHRoaXMuX2lzQXJyYXlCdWZmZXI7XG5cdHRoaXMuX2lzTm9kZUJ1ZmZlciA9IGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlciAmJiBidWZmZXIgaW5zdGFuY2VvZiBCdWZmZXI7XG5cblx0Ly8gSGFuZGxlIFR5cGUgRXJyb3JzXG5cdGlmICghdGhpcy5faXNOb2RlQnVmZmVyICYmICF0aGlzLl9pc0FycmF5QnVmZmVyICYmICF0aGlzLl9pc1BpeGVsRGF0YSAmJiAhKGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5KSkge1xuXHRcdHRocm93IG5ldyBUeXBlRXJyb3IoJ2pEYXRhVmlldyBidWZmZXIgaGFzIGFuIGluY29tcGF0aWJsZSB0eXBlJyk7XG5cdH1cblxuXHQvLyBEZWZhdWx0IFZhbHVlc1xuXHR0aGlzLl9saXR0bGVFbmRpYW4gPSAhIWxpdHRsZUVuZGlhbjtcblxuXHR2YXIgYnVmZmVyTGVuZ3RoID0gJ2J5dGVMZW5ndGgnIGluIGJ1ZmZlciA/IGJ1ZmZlci5ieXRlTGVuZ3RoIDogYnVmZmVyLmxlbmd0aDtcblx0dGhpcy5ieXRlT2Zmc2V0ID0gYnl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgMCk7XG5cdHRoaXMuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggPSBkZWZpbmVkKGJ5dGVMZW5ndGgsIGJ1ZmZlckxlbmd0aCAtIGJ5dGVPZmZzZXQpO1xuXG5cdGlmICghdGhpcy5faXNEYXRhVmlldykge1xuXHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgsIGJ1ZmZlckxlbmd0aCk7XG5cdH0gZWxzZSB7XG5cdFx0dGhpcy5fdmlldyA9IG5ldyBEYXRhVmlldyhidWZmZXIsIGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgpO1xuXHR9XG5cblx0Ly8gQ3JlYXRlIHVuaWZvcm0gbWV0aG9kcyAoYWN0aW9uIHdyYXBwZXJzKSBmb3IgdGhlIGZvbGxvd2luZyBkYXRhIHR5cGVzXG5cblx0dGhpcy5fZW5naW5lQWN0aW9uID1cblx0XHR0aGlzLl9pc0RhdGFWaWV3XG5cdFx0XHQ/IHRoaXMuX2RhdGFWaWV3QWN0aW9uXG5cdFx0OiB0aGlzLl9pc05vZGVCdWZmZXJcblx0XHRcdD8gdGhpcy5fbm9kZUJ1ZmZlckFjdGlvblxuXHRcdDogdGhpcy5faXNBcnJheUJ1ZmZlclxuXHRcdFx0PyB0aGlzLl9hcnJheUJ1ZmZlckFjdGlvblxuXHRcdDogdGhpcy5fYXJyYXlBY3Rpb247XG59XG5cbmZ1bmN0aW9uIGdldENoYXJDb2RlcyhzdHJpbmcpIHtcblx0aWYgKGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlcikge1xuXHRcdHJldHVybiBuZXcgQnVmZmVyKHN0cmluZywgJ2JpbmFyeScpO1xuXHR9XG5cblx0dmFyIFR5cGUgPSBjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyID8gVWludDhBcnJheSA6IEFycmF5LFxuXHRcdGNvZGVzID0gbmV3IFR5cGUoc3RyaW5nLmxlbmd0aCk7XG5cblx0Zm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IHN0cmluZy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdGNvZGVzW2ldID0gc3RyaW5nLmNoYXJDb2RlQXQoaSkgJiAweGZmO1xuXHR9XG5cdHJldHVybiBjb2Rlcztcbn1cblxuLy8gbW9zdGx5IGludGVybmFsIGZ1bmN0aW9uIGZvciB3cmFwcGluZyBhbnkgc3VwcG9ydGVkIGlucHV0IChTdHJpbmcgb3IgQXJyYXktbGlrZSkgdG8gYmVzdCBzdWl0YWJsZSBidWZmZXIgZm9ybWF0XG5qRGF0YVZpZXcud3JhcEJ1ZmZlciA9IGZ1bmN0aW9uIChidWZmZXIpIHtcblx0c3dpdGNoICh0eXBlb2YgYnVmZmVyKSB7XG5cdFx0Y2FzZSAnbnVtYmVyJzpcblx0XHRcdGlmIChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIpIHtcblx0XHRcdFx0YnVmZmVyID0gbmV3IEJ1ZmZlcihidWZmZXIpO1xuXHRcdFx0XHRidWZmZXIuZmlsbCgwKTtcblx0XHRcdH0gZWxzZVxuXHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuQXJyYXlCdWZmZXIpIHtcblx0XHRcdFx0YnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKS5idWZmZXI7XG5cdFx0XHR9IGVsc2Vcblx0XHRcdGlmIChjb21wYXRpYmlsaXR5LlBpeGVsRGF0YSkge1xuXHRcdFx0XHRidWZmZXIgPSBjcmVhdGVQaXhlbERhdGEoYnVmZmVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJ1ZmZlciA9IG5ldyBBcnJheShidWZmZXIpO1xuXHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGJ1ZmZlci5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGJ1ZmZlcltpXSA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBidWZmZXI7XG5cblx0XHRjYXNlICdzdHJpbmcnOlxuXHRcdFx0YnVmZmVyID0gZ2V0Q2hhckNvZGVzKGJ1ZmZlcik7XG5cdFx0XHQvKiBmYWxscyB0aHJvdWdoICovXG5cdFx0ZGVmYXVsdDpcblx0XHRcdGlmICgnbGVuZ3RoJyBpbiBidWZmZXIgJiYgISgoY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyICYmIGJ1ZmZlciBpbnN0YW5jZW9mIEJ1ZmZlcikgfHwgKGNvbXBhdGliaWxpdHkuQXJyYXlCdWZmZXIgJiYgYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHx8IChjb21wYXRpYmlsaXR5LlBpeGVsRGF0YSAmJiBidWZmZXIgaW5zdGFuY2VvZiBDYW52YXNQaXhlbEFycmF5KSkpIHtcblx0XHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlcikge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IG5ldyBCdWZmZXIoYnVmZmVyKTtcblx0XHRcdFx0fSBlbHNlXG5cdFx0XHRcdGlmIChjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyKSB7XG5cdFx0XHRcdFx0aWYgKCEoYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpKSB7XG5cdFx0XHRcdFx0XHRidWZmZXIgPSBuZXcgVWludDhBcnJheShidWZmZXIpLmJ1ZmZlcjtcblx0XHRcdFx0XHRcdC8vIGJ1ZyBpbiBOb2RlLmpzIDw9IDAuODpcblx0XHRcdFx0XHRcdGlmICghKGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSkge1xuXHRcdFx0XHRcdFx0XHRidWZmZXIgPSBuZXcgVWludDhBcnJheShhcnJheUZyb20oYnVmZmVyLCB0cnVlKSkuYnVmZmVyO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlXG5cdFx0XHRcdGlmIChjb21wYXRpYmlsaXR5LlBpeGVsRGF0YSkge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IGNyZWF0ZVBpeGVsRGF0YShidWZmZXIubGVuZ3RoLCBidWZmZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IGFycmF5RnJvbShidWZmZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYnVmZmVyO1xuXHR9XG59O1xuXG5mdW5jdGlvbiBwb3cyKG4pIHtcblx0cmV0dXJuIChuID49IDAgJiYgbiA8IDMxKSA/ICgxIDw8IG4pIDogKHBvdzJbbl0gfHwgKHBvdzJbbl0gPSBNYXRoLnBvdygyLCBuKSkpO1xufVxuXG4vLyBsZWZ0IGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG5qRGF0YVZpZXcuY3JlYXRlQnVmZmVyID0gZnVuY3Rpb24gKCkge1xuXHRyZXR1cm4gakRhdGFWaWV3LndyYXBCdWZmZXIoYXJndW1lbnRzKTtcbn07XG5cbmZ1bmN0aW9uIFVpbnQ2NChsbywgaGkpIHtcblx0dGhpcy5sbyA9IGxvO1xuXHR0aGlzLmhpID0gaGk7XG59XG5cbmpEYXRhVmlldy5VaW50NjQgPSBVaW50NjQ7XG5cblVpbnQ2NC5wcm90b3R5cGUgPSB7XG5cdHZhbHVlT2Y6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcy5sbyArIHBvdzIoMzIpICogdGhpcy5oaTtcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBOdW1iZXIucHJvdG90eXBlLnRvU3RyaW5nLmFwcGx5KHRoaXMudmFsdWVPZigpLCBhcmd1bWVudHMpO1xuXHR9XG59O1xuXG5VaW50NjQuZnJvbU51bWJlciA9IGZ1bmN0aW9uIChudW1iZXIpIHtcblx0dmFyIGhpID0gTWF0aC5mbG9vcihudW1iZXIgLyBwb3cyKDMyKSksXG5cdFx0bG8gPSBudW1iZXIgLSBoaSAqIHBvdzIoMzIpO1xuXG5cdHJldHVybiBuZXcgVWludDY0KGxvLCBoaSk7XG59O1xuXG5mdW5jdGlvbiBJbnQ2NChsbywgaGkpIHtcblx0VWludDY0LmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG59XG5cbmpEYXRhVmlldy5JbnQ2NCA9IEludDY0O1xuXG5JbnQ2NC5wcm90b3R5cGUgPSAnY3JlYXRlJyBpbiBPYmplY3QgPyBPYmplY3QuY3JlYXRlKFVpbnQ2NC5wcm90b3R5cGUpIDogbmV3IFVpbnQ2NCgpO1xuXG5JbnQ2NC5wcm90b3R5cGUudmFsdWVPZiA9IGZ1bmN0aW9uICgpIHtcblx0aWYgKHRoaXMuaGkgPCBwb3cyKDMxKSkge1xuXHRcdHJldHVybiBVaW50NjQucHJvdG90eXBlLnZhbHVlT2YuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0fVxuXHRyZXR1cm4gLSgocG93MigzMikgLSB0aGlzLmxvKSArIHBvdzIoMzIpICogKHBvdzIoMzIpIC0gMSAtIHRoaXMuaGkpKTtcbn07XG5cbkludDY0LmZyb21OdW1iZXIgPSBmdW5jdGlvbiAobnVtYmVyKSB7XG5cdHZhciBsbywgaGk7XG5cdGlmIChudW1iZXIgPj0gMCkge1xuXHRcdHZhciB1bnNpZ25lZCA9IFVpbnQ2NC5mcm9tTnVtYmVyKG51bWJlcik7XG5cdFx0bG8gPSB1bnNpZ25lZC5sbztcblx0XHRoaSA9IHVuc2lnbmVkLmhpO1xuXHR9IGVsc2Uge1xuXHRcdGhpID0gTWF0aC5mbG9vcihudW1iZXIgLyBwb3cyKDMyKSk7XG5cdFx0bG8gPSBudW1iZXIgLSBoaSAqIHBvdzIoMzIpO1xuXHRcdGhpICs9IHBvdzIoMzIpO1xuXHR9XG5cdHJldHVybiBuZXcgSW50NjQobG8sIGhpKTtcbn07XG5cbmpEYXRhVmlldy5wcm90b3R5cGUgPSB7XG5cdF9vZmZzZXQ6IDAsXG5cdF9iaXRPZmZzZXQ6IDAsXG5cblx0Y29tcGF0aWJpbGl0eTogY29tcGF0aWJpbGl0eSxcblxuXHRfY2hlY2tCb3VuZHM6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBieXRlTGVuZ3RoLCBtYXhMZW5ndGgpIHtcblx0XHQvLyBEbyBhZGRpdGlvbmFsIGNoZWNrcyB0byBzaW11bGF0ZSBEYXRhVmlld1xuXHRcdGlmICh0eXBlb2YgYnl0ZU9mZnNldCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBUeXBlRXJyb3IoJ09mZnNldCBpcyBub3QgYSBudW1iZXIuJyk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYnl0ZUxlbmd0aCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBUeXBlRXJyb3IoJ1NpemUgaXMgbm90IGEgbnVtYmVyLicpO1xuXHRcdH1cblx0XHRpZiAoYnl0ZUxlbmd0aCA8IDApIHtcblx0XHRcdHRocm93IG5ldyBSYW5nZUVycm9yKCdMZW5ndGggaXMgbmVnYXRpdmUuJyk7XG5cdFx0fVxuXHRcdGlmIChieXRlT2Zmc2V0IDwgMCB8fCBieXRlT2Zmc2V0ICsgYnl0ZUxlbmd0aCA+IGRlZmluZWQobWF4TGVuZ3RoLCB0aGlzLmJ5dGVMZW5ndGgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgUmFuZ2VFcnJvcignT2Zmc2V0cyBhcmUgb3V0IG9mIGJvdW5kcy4nKTtcblx0XHR9XG5cdH0sXG5cblx0X2FjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdHJldHVybiB0aGlzLl9lbmdpbmVBY3Rpb24oXG5cdFx0XHR0eXBlLFxuXHRcdFx0aXNSZWFkQWN0aW9uLFxuXHRcdFx0ZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpLFxuXHRcdFx0ZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbiksXG5cdFx0XHR2YWx1ZVxuXHRcdCk7XG5cdH0sXG5cblx0X2RhdGFWaWV3QWN0aW9uOiBmdW5jdGlvbiAodHlwZSwgaXNSZWFkQWN0aW9uLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKSB7XG5cdFx0Ly8gTW92ZSB0aGUgaW50ZXJuYWwgb2Zmc2V0IGZvcndhcmRcblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgZGF0YVR5cGVzW3R5cGVdO1xuXHRcdHJldHVybiBpc1JlYWRBY3Rpb24gPyB0aGlzLl92aWV3WydnZXQnICsgdHlwZV0oYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSA6IHRoaXMuX3ZpZXdbJ3NldCcgKyB0eXBlXShieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfbm9kZUJ1ZmZlckFjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdC8vIE1vdmUgdGhlIGludGVybmFsIG9mZnNldCBmb3J3YXJkXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIGRhdGFUeXBlc1t0eXBlXTtcblx0XHR2YXIgbm9kZU5hbWUgPSBub2RlTmFtaW5nW3R5cGVdICsgKCh0eXBlID09PSAnSW50OCcgfHwgdHlwZSA9PT0gJ1VpbnQ4JykgPyAnJyA6IGxpdHRsZUVuZGlhbiA/ICdMRScgOiAnQkUnKTtcblx0XHRieXRlT2Zmc2V0ICs9IHRoaXMuYnl0ZU9mZnNldDtcblx0XHRyZXR1cm4gaXNSZWFkQWN0aW9uID8gdGhpcy5idWZmZXJbJ3JlYWQnICsgbm9kZU5hbWVdKGJ5dGVPZmZzZXQpIDogdGhpcy5idWZmZXJbJ3dyaXRlJyArIG5vZGVOYW1lXSh2YWx1ZSwgYnl0ZU9mZnNldCk7XG5cdH0sXG5cblx0X2FycmF5QnVmZmVyQWN0aW9uOiBmdW5jdGlvbiAodHlwZSwgaXNSZWFkQWN0aW9uLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKSB7XG5cdFx0dmFyIHNpemUgPSBkYXRhVHlwZXNbdHlwZV0sIFR5cGVkQXJyYXkgPSBnbG9iYWxbdHlwZSArICdBcnJheSddLCB0eXBlZEFycmF5O1xuXG5cdFx0bGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cblx0XHQvLyBBcnJheUJ1ZmZlcjogd2UgdXNlIGEgdHlwZWQgYXJyYXkgb2Ygc2l6ZSAxIGZyb20gb3JpZ2luYWwgYnVmZmVyIGlmIGFsaWdubWVudCBpcyBnb29kIGFuZCBmcm9tIHNsaWNlIHdoZW4gaXQncyBub3Rcblx0XHRpZiAoc2l6ZSA9PT0gMSB8fCAoKHRoaXMuYnl0ZU9mZnNldCArIGJ5dGVPZmZzZXQpICUgc2l6ZSA9PT0gMCAmJiBsaXR0bGVFbmRpYW4pKSB7XG5cdFx0XHR0eXBlZEFycmF5ID0gbmV3IFR5cGVkQXJyYXkodGhpcy5idWZmZXIsIHRoaXMuYnl0ZU9mZnNldCArIGJ5dGVPZmZzZXQsIDEpO1xuXHRcdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIHNpemU7XG5cdFx0XHRyZXR1cm4gaXNSZWFkQWN0aW9uID8gdHlwZWRBcnJheVswXSA6ICh0eXBlZEFycmF5WzBdID0gdmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YXIgYnl0ZXMgPSBuZXcgVWludDhBcnJheShpc1JlYWRBY3Rpb24gPyB0aGlzLmdldEJ5dGVzKHNpemUsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSkgOiBzaXplKTtcblx0XHRcdHR5cGVkQXJyYXkgPSBuZXcgVHlwZWRBcnJheShieXRlcy5idWZmZXIsIDAsIDEpO1xuXG5cdFx0XHRpZiAoaXNSZWFkQWN0aW9uKSB7XG5cdFx0XHRcdHJldHVybiB0eXBlZEFycmF5WzBdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHlwZWRBcnJheVswXSA9IHZhbHVlO1xuXHRcdFx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBieXRlcywgbGl0dGxlRW5kaWFuKTtcblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cblx0X2FycmF5QWN0aW9uOiBmdW5jdGlvbiAodHlwZSwgaXNSZWFkQWN0aW9uLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKSB7XG5cdFx0cmV0dXJuIGlzUmVhZEFjdGlvbiA/IHRoaXNbJ19nZXQnICsgdHlwZV0oYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSA6IHRoaXNbJ19zZXQnICsgdHlwZV0oYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0Ly8gSGVscGVyc1xuXG5cdF9nZXRCeXRlczogZnVuY3Rpb24gKGxlbmd0aCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0bGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblx0XHRsZW5ndGggPSBkZWZpbmVkKGxlbmd0aCwgdGhpcy5ieXRlTGVuZ3RoIC0gYnl0ZU9mZnNldCk7XG5cblx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBsZW5ndGgpO1xuXG5cdFx0Ynl0ZU9mZnNldCArPSB0aGlzLmJ5dGVPZmZzZXQ7XG5cblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0IC0gdGhpcy5ieXRlT2Zmc2V0ICsgbGVuZ3RoO1xuXG5cdFx0dmFyIHJlc3VsdCA9IHRoaXMuX2lzQXJyYXlCdWZmZXJcblx0XHRcdFx0XHQgPyBuZXcgVWludDhBcnJheSh0aGlzLmJ1ZmZlciwgYnl0ZU9mZnNldCwgbGVuZ3RoKVxuXHRcdFx0XHRcdCA6ICh0aGlzLmJ1ZmZlci5zbGljZSB8fCBBcnJheS5wcm90b3R5cGUuc2xpY2UpLmNhbGwodGhpcy5idWZmZXIsIGJ5dGVPZmZzZXQsIGJ5dGVPZmZzZXQgKyBsZW5ndGgpO1xuXG5cdFx0cmV0dXJuIGxpdHRsZUVuZGlhbiB8fCBsZW5ndGggPD0gMSA/IHJlc3VsdCA6IGFycmF5RnJvbShyZXN1bHQpLnJldmVyc2UoKTtcblx0fSxcblxuXHQvLyB3cmFwcGVyIGZvciBleHRlcm5hbCBjYWxscyAoZG8gbm90IHJldHVybiBpbm5lciBidWZmZXIgZGlyZWN0bHkgdG8gcHJldmVudCBpdCdzIG1vZGlmeWluZylcblx0Z2V0Qnl0ZXM6IGZ1bmN0aW9uIChsZW5ndGgsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdG9BcnJheSkge1xuXHRcdHZhciByZXN1bHQgPSB0aGlzLl9nZXRCeXRlcyhsZW5ndGgsIGJ5dGVPZmZzZXQsIGRlZmluZWQobGl0dGxlRW5kaWFuLCB0cnVlKSk7XG5cdFx0cmV0dXJuIHRvQXJyYXkgPyBhcnJheUZyb20ocmVzdWx0KSA6IHJlc3VsdDtcblx0fSxcblxuXHRfc2V0Qnl0ZXM6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBieXRlcywgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGxlbmd0aCA9IGJ5dGVzLmxlbmd0aDtcblxuXHRcdC8vIG5lZWRlZCBmb3IgT3BlcmFcblx0XHRpZiAobGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblxuXHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIGxlbmd0aCk7XG5cblx0XHRpZiAoIWxpdHRsZUVuZGlhbiAmJiBsZW5ndGggPiAxKSB7XG5cdFx0XHRieXRlcyA9IGFycmF5RnJvbShieXRlcywgdHJ1ZSkucmV2ZXJzZSgpO1xuXHRcdH1cblxuXHRcdGJ5dGVPZmZzZXQgKz0gdGhpcy5ieXRlT2Zmc2V0O1xuXG5cdFx0aWYgKHRoaXMuX2lzQXJyYXlCdWZmZXIpIHtcblx0XHRcdG5ldyBVaW50OEFycmF5KHRoaXMuYnVmZmVyLCBieXRlT2Zmc2V0LCBsZW5ndGgpLnNldChieXRlcyk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuX2lzTm9kZUJ1ZmZlcikge1xuXHRcdFx0XHRuZXcgQnVmZmVyKGJ5dGVzKS5jb3B5KHRoaXMuYnVmZmVyLCBieXRlT2Zmc2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHR0aGlzLmJ1ZmZlcltieXRlT2Zmc2V0ICsgaV0gPSBieXRlc1tpXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgLSB0aGlzLmJ5dGVPZmZzZXQgKyBsZW5ndGg7XG5cdH0sXG5cblx0c2V0Qnl0ZXM6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBieXRlcywgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgYnl0ZXMsIGRlZmluZWQobGl0dGxlRW5kaWFuLCB0cnVlKSk7XG5cdH0sXG5cblx0Z2V0U3RyaW5nOiBmdW5jdGlvbiAoYnl0ZUxlbmd0aCwgYnl0ZU9mZnNldCwgZW5jb2RpbmcpIHtcblx0XHRpZiAodGhpcy5faXNOb2RlQnVmZmVyKSB7XG5cdFx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXHRcdFx0Ynl0ZUxlbmd0aCA9IGRlZmluZWQoYnl0ZUxlbmd0aCwgdGhpcy5ieXRlTGVuZ3RoIC0gYnl0ZU9mZnNldCk7XG5cblx0XHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgpO1xuXG5cdFx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgYnl0ZUxlbmd0aDtcblx0XHRcdHJldHVybiB0aGlzLmJ1ZmZlci50b1N0cmluZyhlbmNvZGluZyB8fCAnYmluYXJ5JywgdGhpcy5ieXRlT2Zmc2V0ICsgYnl0ZU9mZnNldCwgdGhpcy5ieXRlT2Zmc2V0ICsgdGhpcy5fb2Zmc2V0KTtcblx0XHR9XG5cdFx0dmFyIGJ5dGVzID0gdGhpcy5fZ2V0Qnl0ZXMoYnl0ZUxlbmd0aCwgYnl0ZU9mZnNldCwgdHJ1ZSksIHN0cmluZyA9ICcnO1xuXHRcdGJ5dGVMZW5ndGggPSBieXRlcy5sZW5ndGg7XG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBieXRlTGVuZ3RoOyBpKyspIHtcblx0XHRcdHN0cmluZyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldKTtcblx0XHR9XG5cdFx0aWYgKGVuY29kaW5nID09PSAndXRmOCcpIHtcblx0XHRcdHN0cmluZyA9IGRlY29kZVVSSUNvbXBvbmVudChlc2NhcGUoc3RyaW5nKSk7XG5cdFx0fVxuXHRcdHJldHVybiBzdHJpbmc7XG5cdH0sXG5cblx0c2V0U3RyaW5nOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgc3ViU3RyaW5nLCBlbmNvZGluZykge1xuXHRcdGlmICh0aGlzLl9pc05vZGVCdWZmZXIpIHtcblx0XHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cdFx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBzdWJTdHJpbmcubGVuZ3RoKTtcblx0XHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyB0aGlzLmJ1ZmZlci53cml0ZShzdWJTdHJpbmcsIHRoaXMuYnl0ZU9mZnNldCArIGJ5dGVPZmZzZXQsIGVuY29kaW5nIHx8ICdiaW5hcnknKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGVuY29kaW5nID09PSAndXRmOCcpIHtcblx0XHRcdHN1YlN0cmluZyA9IHVuZXNjYXBlKGVuY29kZVVSSUNvbXBvbmVudChzdWJTdHJpbmcpKTtcblx0XHR9XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgZ2V0Q2hhckNvZGVzKHN1YlN0cmluZyksIHRydWUpO1xuXHR9LFxuXG5cdGdldENoYXI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0KSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RyaW5nKDEsIGJ5dGVPZmZzZXQpO1xuXHR9LFxuXG5cdHNldENoYXI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBjaGFyYWN0ZXIpIHtcblx0XHR0aGlzLnNldFN0cmluZyhieXRlT2Zmc2V0LCBjaGFyYWN0ZXIpO1xuXHR9LFxuXG5cdHRlbGw6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcy5fb2Zmc2V0O1xuXHR9LFxuXG5cdHNlZWs6IGZ1bmN0aW9uIChieXRlT2Zmc2V0KSB7XG5cdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgMCk7XG5cdFx0LyoganNoaW50IGJvc3M6IHRydWUgKi9cblx0XHRyZXR1cm4gdGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldDtcblx0fSxcblxuXHRza2lwOiBmdW5jdGlvbiAoYnl0ZUxlbmd0aCkge1xuXHRcdHJldHVybiB0aGlzLnNlZWsodGhpcy5fb2Zmc2V0ICsgYnl0ZUxlbmd0aCk7XG5cdH0sXG5cblx0c2xpY2U6IGZ1bmN0aW9uIChzdGFydCwgZW5kLCBmb3JjZUNvcHkpIHtcblx0XHRmdW5jdGlvbiBub3JtYWxpemVPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gb2Zmc2V0IDwgMCA/IG9mZnNldCArIGJ5dGVMZW5ndGggOiBvZmZzZXQ7XG5cdFx0fVxuXG5cdFx0c3RhcnQgPSBub3JtYWxpemVPZmZzZXQoc3RhcnQsIHRoaXMuYnl0ZUxlbmd0aCk7XG5cdFx0ZW5kID0gbm9ybWFsaXplT2Zmc2V0KGRlZmluZWQoZW5kLCB0aGlzLmJ5dGVMZW5ndGgpLCB0aGlzLmJ5dGVMZW5ndGgpO1xuXG5cdFx0cmV0dXJuIGZvcmNlQ29weVxuXHRcdFx0ICAgPyBuZXcgakRhdGFWaWV3KHRoaXMuZ2V0Qnl0ZXMoZW5kIC0gc3RhcnQsIHN0YXJ0LCB0cnVlLCB0cnVlKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMuX2xpdHRsZUVuZGlhbilcblx0XHRcdCAgIDogbmV3IGpEYXRhVmlldyh0aGlzLmJ1ZmZlciwgdGhpcy5ieXRlT2Zmc2V0ICsgc3RhcnQsIGVuZCAtIHN0YXJ0LCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdGFsaWduQnk6IGZ1bmN0aW9uIChieXRlQ291bnQpIHtcblx0XHR0aGlzLl9iaXRPZmZzZXQgPSAwO1xuXHRcdGlmIChkZWZpbmVkKGJ5dGVDb3VudCwgMSkgIT09IDEpIHtcblx0XHRcdHJldHVybiB0aGlzLnNraXAoYnl0ZUNvdW50IC0gKHRoaXMuX29mZnNldCAlIGJ5dGVDb3VudCB8fCBieXRlQ291bnQpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX29mZnNldDtcblx0XHR9XG5cdH0sXG5cblx0Ly8gQ29tcGF0aWJpbGl0eSBmdW5jdGlvbnNcblxuXHRfZ2V0RmxvYXQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBiID0gdGhpcy5fZ2V0Qnl0ZXMoOCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSxcblxuXHRcdFx0c2lnbiA9IDEgLSAoMiAqIChiWzddID4+IDcpKSxcblx0XHRcdGV4cG9uZW50ID0gKCgoKGJbN10gPDwgMSkgJiAweGZmKSA8PCAzKSB8IChiWzZdID4+IDQpKSAtICgoMSA8PCAxMCkgLSAxKSxcblxuXHRcdC8vIEJpbmFyeSBvcGVyYXRvcnMgc3VjaCBhcyB8IGFuZCA8PCBvcGVyYXRlIG9uIDMyIGJpdCB2YWx1ZXMsIHVzaW5nICsgYW5kIE1hdGgucG93KDIpIGluc3RlYWRcblx0XHRcdG1hbnRpc3NhID0gKChiWzZdICYgMHgwZikgKiBwb3cyKDQ4KSkgKyAoYls1XSAqIHBvdzIoNDApKSArIChiWzRdICogcG93MigzMikpICtcblx0XHRcdFx0XHRcdChiWzNdICogcG93MigyNCkpICsgKGJbMl0gKiBwb3cyKDE2KSkgKyAoYlsxXSAqIHBvdzIoOCkpICsgYlswXTtcblxuXHRcdGlmIChleHBvbmVudCA9PT0gMTAyNCkge1xuXHRcdFx0aWYgKG1hbnRpc3NhICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiBOYU47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gc2lnbiAqIEluZmluaXR5O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleHBvbmVudCA9PT0gLTEwMjMpIHsgLy8gRGVub3JtYWxpemVkXG5cdFx0XHRyZXR1cm4gc2lnbiAqIG1hbnRpc3NhICogcG93MigtMTAyMiAtIDUyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc2lnbiAqICgxICsgbWFudGlzc2EgKiBwb3cyKC01MikpICogcG93MihleHBvbmVudCk7XG5cdH0sXG5cblx0X2dldEZsb2F0MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgYiA9IHRoaXMuX2dldEJ5dGVzKDQsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiksXG5cblx0XHRcdHNpZ24gPSAxIC0gKDIgKiAoYlszXSA+PiA3KSksXG5cdFx0XHRleHBvbmVudCA9ICgoKGJbM10gPDwgMSkgJiAweGZmKSB8IChiWzJdID4+IDcpKSAtIDEyNyxcblx0XHRcdG1hbnRpc3NhID0gKChiWzJdICYgMHg3ZikgPDwgMTYpIHwgKGJbMV0gPDwgOCkgfCBiWzBdO1xuXG5cdFx0aWYgKGV4cG9uZW50ID09PSAxMjgpIHtcblx0XHRcdGlmIChtYW50aXNzYSAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gTmFOO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHNpZ24gKiBJbmZpbml0eTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXhwb25lbnQgPT09IC0xMjcpIHsgLy8gRGVub3JtYWxpemVkXG5cdFx0XHRyZXR1cm4gc2lnbiAqIG1hbnRpc3NhICogcG93MigtMTI2IC0gMjMpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzaWduICogKDEgKyBtYW50aXNzYSAqIHBvdzIoLTIzKSkgKiBwb3cyKGV4cG9uZW50KTtcblx0fSxcblxuXHRfZ2V0NjQ6IGZ1bmN0aW9uIChUeXBlLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRsaXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXG5cdFx0dmFyIHBhcnRzID0gbGl0dGxlRW5kaWFuID8gWzAsIDRdIDogWzQsIDBdO1xuXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCAyOyBpKyspIHtcblx0XHRcdHBhcnRzW2ldID0gdGhpcy5nZXRVaW50MzIoYnl0ZU9mZnNldCArIHBhcnRzW2ldLCBsaXR0bGVFbmRpYW4pO1xuXHRcdH1cblxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyA4O1xuXG5cdFx0cmV0dXJuIG5ldyBUeXBlKHBhcnRzWzBdLCBwYXJ0c1sxXSk7XG5cdH0sXG5cblx0Z2V0SW50NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0NjQoSW50NjQsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0Z2V0VWludDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldDY0KFVpbnQ2NCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfZ2V0SW50MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgYiA9IHRoaXMuX2dldEJ5dGVzKDQsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdFx0cmV0dXJuIChiWzNdIDw8IDI0KSB8IChiWzJdIDw8IDE2KSB8IChiWzFdIDw8IDgpIHwgYlswXTtcblx0fSxcblxuXHRfZ2V0VWludDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEludDMyKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikgPj4+IDA7XG5cdH0sXG5cblx0X2dldEludDE2OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0cmV0dXJuICh0aGlzLl9nZXRVaW50MTYoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSA8PCAxNikgPj4gMTY7XG5cdH0sXG5cblx0X2dldFVpbnQxNjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBiID0gdGhpcy5fZ2V0Qnl0ZXMoMiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKTtcblx0XHRyZXR1cm4gKGJbMV0gPDwgOCkgfCBiWzBdO1xuXHR9LFxuXG5cdF9nZXRJbnQ4OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCkge1xuXHRcdHJldHVybiAodGhpcy5fZ2V0VWludDgoYnl0ZU9mZnNldCkgPDwgMjQpID4+IDI0O1xuXHR9LFxuXG5cdF9nZXRVaW50ODogZnVuY3Rpb24gKGJ5dGVPZmZzZXQpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Qnl0ZXMoMSwgYnl0ZU9mZnNldClbMF07XG5cdH0sXG5cblx0X2dldEJpdFJhbmdlRGF0YTogZnVuY3Rpb24gKGJpdExlbmd0aCwgYnl0ZU9mZnNldCkge1xuXHRcdHZhciBzdGFydEJpdCA9IChkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCkgPDwgMykgKyB0aGlzLl9iaXRPZmZzZXQsXG5cdFx0XHRlbmRCaXQgPSBzdGFydEJpdCArIGJpdExlbmd0aCxcblx0XHRcdHN0YXJ0ID0gc3RhcnRCaXQgPj4+IDMsXG5cdFx0XHRlbmQgPSAoZW5kQml0ICsgNykgPj4+IDMsXG5cdFx0XHRiID0gdGhpcy5fZ2V0Qnl0ZXMoZW5kIC0gc3RhcnQsIHN0YXJ0LCB0cnVlKSxcblx0XHRcdHdpZGVWYWx1ZSA9IDA7XG5cblx0XHQvKiBqc2hpbnQgYm9zczogdHJ1ZSAqL1xuXHRcdGlmICh0aGlzLl9iaXRPZmZzZXQgPSBlbmRCaXQgJiA3KSB7XG5cdFx0XHR0aGlzLl9iaXRPZmZzZXQgLT0gODtcblx0XHR9XG5cblx0XHRmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gYi5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0d2lkZVZhbHVlID0gKHdpZGVWYWx1ZSA8PCA4KSB8IGJbaV07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0OiBzdGFydCxcblx0XHRcdGJ5dGVzOiBiLFxuXHRcdFx0d2lkZVZhbHVlOiB3aWRlVmFsdWVcblx0XHR9O1xuXHR9LFxuXG5cdGdldFNpZ25lZDogZnVuY3Rpb24gKGJpdExlbmd0aCwgYnl0ZU9mZnNldCkge1xuXHRcdHZhciBzaGlmdCA9IDMyIC0gYml0TGVuZ3RoO1xuXHRcdHJldHVybiAodGhpcy5nZXRVbnNpZ25lZChiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpIDw8IHNoaWZ0KSA+PiBzaGlmdDtcblx0fSxcblxuXHRnZXRVbnNpZ25lZDogZnVuY3Rpb24gKGJpdExlbmd0aCwgYnl0ZU9mZnNldCkge1xuXHRcdHZhciB2YWx1ZSA9IHRoaXMuX2dldEJpdFJhbmdlRGF0YShiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpLndpZGVWYWx1ZSA+Pj4gLXRoaXMuX2JpdE9mZnNldDtcblx0XHRyZXR1cm4gYml0TGVuZ3RoIDwgMzIgPyAodmFsdWUgJiB+KC0xIDw8IGJpdExlbmd0aCkpIDogdmFsdWU7XG5cdH0sXG5cblx0X3NldEJpbmFyeUZsb2F0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIG1hbnRTaXplLCBleHBTaXplLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgc2lnbkJpdCA9IHZhbHVlIDwgMCA/IDEgOiAwLFxuXHRcdFx0ZXhwb25lbnQsXG5cdFx0XHRtYW50aXNzYSxcblx0XHRcdGVNYXggPSB+KC0xIDw8IChleHBTaXplIC0gMSkpLFxuXHRcdFx0ZU1pbiA9IDEgLSBlTWF4O1xuXG5cdFx0aWYgKHZhbHVlIDwgMCkge1xuXHRcdFx0dmFsdWUgPSAtdmFsdWU7XG5cdFx0fVxuXG5cdFx0aWYgKHZhbHVlID09PSAwKSB7XG5cdFx0XHRleHBvbmVudCA9IDA7XG5cdFx0XHRtYW50aXNzYSA9IDA7XG5cdFx0fSBlbHNlIGlmIChpc05hTih2YWx1ZSkpIHtcblx0XHRcdGV4cG9uZW50ID0gMiAqIGVNYXggKyAxO1xuXHRcdFx0bWFudGlzc2EgPSAxO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IEluZmluaXR5KSB7XG5cdFx0XHRleHBvbmVudCA9IDIgKiBlTWF4ICsgMTtcblx0XHRcdG1hbnRpc3NhID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXhwb25lbnQgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKTtcblx0XHRcdGlmIChleHBvbmVudCA+PSBlTWluICYmIGV4cG9uZW50IDw9IGVNYXgpIHtcblx0XHRcdFx0bWFudGlzc2EgPSBNYXRoLmZsb29yKCh2YWx1ZSAqIHBvdzIoLWV4cG9uZW50KSAtIDEpICogcG93MihtYW50U2l6ZSkpO1xuXHRcdFx0XHRleHBvbmVudCArPSBlTWF4O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWFudGlzc2EgPSBNYXRoLmZsb29yKHZhbHVlIC8gcG93MihlTWluIC0gbWFudFNpemUpKTtcblx0XHRcdFx0ZXhwb25lbnQgPSAwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHZhciBiID0gW107XG5cdFx0d2hpbGUgKG1hbnRTaXplID49IDgpIHtcblx0XHRcdGIucHVzaChtYW50aXNzYSAlIDI1Nik7XG5cdFx0XHRtYW50aXNzYSA9IE1hdGguZmxvb3IobWFudGlzc2EgLyAyNTYpO1xuXHRcdFx0bWFudFNpemUgLT0gODtcblx0XHR9XG5cdFx0ZXhwb25lbnQgPSAoZXhwb25lbnQgPDwgbWFudFNpemUpIHwgbWFudGlzc2E7XG5cdFx0ZXhwU2l6ZSArPSBtYW50U2l6ZTtcblx0XHR3aGlsZSAoZXhwU2l6ZSA+PSA4KSB7XG5cdFx0XHRiLnB1c2goZXhwb25lbnQgJiAweGZmKTtcblx0XHRcdGV4cG9uZW50ID4+Pj0gODtcblx0XHRcdGV4cFNpemUgLT0gODtcblx0XHR9XG5cdFx0Yi5wdXNoKChzaWduQml0IDw8IGV4cFNpemUpIHwgZXhwb25lbnQpO1xuXG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgYiwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0RmxvYXQzMjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXRCaW5hcnlGbG9hdChieXRlT2Zmc2V0LCB2YWx1ZSwgMjMsIDgsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldEZsb2F0NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0QmluYXJ5RmxvYXQoYnl0ZU9mZnNldCwgdmFsdWUsIDUyLCAxMSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0NjQ6IGZ1bmN0aW9uIChUeXBlLCBieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0aWYgKCEodmFsdWUgaW5zdGFuY2VvZiBUeXBlKSkge1xuXHRcdFx0dmFsdWUgPSBUeXBlLmZyb21OdW1iZXIodmFsdWUpO1xuXHRcdH1cblxuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cblx0XHR2YXIgcGFydHMgPSBsaXR0bGVFbmRpYW4gPyB7bG86IDAsIGhpOiA0fSA6IHtsbzogNCwgaGk6IDB9O1xuXG5cdFx0Zm9yICh2YXIgcGFydE5hbWUgaW4gcGFydHMpIHtcblx0XHRcdHRoaXMuc2V0VWludDMyKGJ5dGVPZmZzZXQgKyBwYXJ0c1twYXJ0TmFtZV0sIHZhbHVlW3BhcnROYW1lXSwgbGl0dGxlRW5kaWFuKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgODtcblx0fSxcblxuXHRzZXRJbnQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXQ2NChJbnQ2NCwgYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0c2V0VWludDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldDY0KFVpbnQ2NCwgYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldFVpbnQzMjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBbXG5cdFx0XHR2YWx1ZSAmIDB4ZmYsXG5cdFx0XHQodmFsdWUgPj4+IDgpICYgMHhmZixcblx0XHRcdCh2YWx1ZSA+Pj4gMTYpICYgMHhmZixcblx0XHRcdHZhbHVlID4+PiAyNFxuXHRcdF0sIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldFVpbnQxNjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBbXG5cdFx0XHR2YWx1ZSAmIDB4ZmYsXG5cdFx0XHQodmFsdWUgPj4+IDgpICYgMHhmZlxuXHRcdF0sIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldFVpbnQ4OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUpIHtcblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBbdmFsdWUgJiAweGZmXSk7XG5cdH0sXG5cblx0c2V0VW5zaWduZWQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgYml0TGVuZ3RoKSB7XG5cdFx0dmFyIGRhdGEgPSB0aGlzLl9nZXRCaXRSYW5nZURhdGEoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KSxcblx0XHRcdHdpZGVWYWx1ZSA9IGRhdGEud2lkZVZhbHVlLFxuXHRcdFx0YiA9IGRhdGEuYnl0ZXM7XG5cblx0XHR3aWRlVmFsdWUgJj0gfih+KC0xIDw8IGJpdExlbmd0aCkgPDwgLXRoaXMuX2JpdE9mZnNldCk7IC8vIGNsZWFyaW5nIGJpdCByYW5nZSBiZWZvcmUgYmluYXJ5IFwib3JcIlxuXHRcdHdpZGVWYWx1ZSB8PSAoYml0TGVuZ3RoIDwgMzIgPyAodmFsdWUgJiB+KC0xIDw8IGJpdExlbmd0aCkpIDogdmFsdWUpIDw8IC10aGlzLl9iaXRPZmZzZXQ7IC8vIHNldHRpbmcgYml0c1xuXG5cdFx0Zm9yICh2YXIgaSA9IGIubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGJbaV0gPSB3aWRlVmFsdWUgJiAweGZmO1xuXHRcdFx0d2lkZVZhbHVlID4+Pj0gODtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXRCeXRlcyhkYXRhLnN0YXJ0LCBiLCB0cnVlKTtcblx0fVxufTtcblxudmFyIHByb3RvID0gakRhdGFWaWV3LnByb3RvdHlwZTtcblxuZm9yICh2YXIgdHlwZSBpbiBkYXRhVHlwZXMpIHtcblx0KGZ1bmN0aW9uICh0eXBlKSB7XG5cdFx0cHJvdG9bJ2dldCcgKyB0eXBlXSA9IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY3Rpb24odHlwZSwgdHJ1ZSwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKTtcblx0XHR9O1xuXHRcdHByb3RvWydzZXQnICsgdHlwZV0gPSBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdFx0dGhpcy5fYWN0aW9uKHR5cGUsIGZhbHNlLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKTtcblx0XHR9O1xuXHR9KSh0eXBlKTtcbn1cblxucHJvdG8uX3NldEludDMyID0gcHJvdG8uX3NldFVpbnQzMjtcbnByb3RvLl9zZXRJbnQxNiA9IHByb3RvLl9zZXRVaW50MTY7XG5wcm90by5fc2V0SW50OCA9IHByb3RvLl9zZXRVaW50ODtcbnByb3RvLnNldFNpZ25lZCA9IHByb3RvLnNldFVuc2lnbmVkO1xuXG5mb3IgKHZhciBtZXRob2QgaW4gcHJvdG8pIHtcblx0aWYgKG1ldGhvZC5zbGljZSgwLCAzKSA9PT0gJ3NldCcpIHtcblx0XHQoZnVuY3Rpb24gKHR5cGUpIHtcblx0XHRcdHByb3RvWyd3cml0ZScgKyB0eXBlXSA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0QXJyYXkucHJvdG90eXBlLnVuc2hpZnQuY2FsbChhcmd1bWVudHMsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXNbJ3NldCcgKyB0eXBlXS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdFx0fTtcblx0XHR9KShtZXRob2Quc2xpY2UoMykpO1xuXHR9XG59XG5cbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG5cdG1vZHVsZS5leHBvcnRzID0gakRhdGFWaWV3O1xufSBlbHNlXG5pZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG5cdGRlZmluZShbXSwgZnVuY3Rpb24gKCkgeyByZXR1cm4gakRhdGFWaWV3IH0pO1xufSBlbHNlIHtcblx0dmFyIG9sZEdsb2JhbCA9IGdsb2JhbC5qRGF0YVZpZXc7XG5cdChnbG9iYWwuakRhdGFWaWV3ID0gakRhdGFWaWV3KS5ub0NvbmZsaWN0ID0gZnVuY3Rpb24gKCkge1xuXHRcdGdsb2JhbC5qRGF0YVZpZXcgPSBvbGRHbG9iYWw7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH07XG59XG5cbn0pKChmdW5jdGlvbiAoKSB7IC8qIGpzaGludCBzdHJpY3Q6IGZhbHNlICovIHJldHVybiB0aGlzIH0pKCkpO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyKSIsbnVsbCwidmFyIGJhc2U2NCA9IHJlcXVpcmUoJ2Jhc2U2NC1qcycpXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKVxuXG5leHBvcnRzLkJ1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5TbG93QnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTID0gNTBcbkJ1ZmZlci5wb29sU2l6ZSA9IDgxOTJcblxuLyoqXG4gKiBJZiBgQnVmZmVyLl91c2VUeXBlZEFycmF5c2A6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChjb21wYXRpYmxlIGRvd24gdG8gSUU2KVxuICovXG5CdWZmZXIuX3VzZVR5cGVkQXJyYXlzID0gKGZ1bmN0aW9uICgpIHtcbiAgIC8vIERldGVjdCBpZiBicm93c2VyIHN1cHBvcnRzIFR5cGVkIEFycmF5cy4gU3VwcG9ydGVkIGJyb3dzZXJzIGFyZSBJRSAxMCssXG4gICAvLyBGaXJlZm94IDQrLCBDaHJvbWUgNyssIFNhZmFyaSA1LjErLCBPcGVyYSAxMS42KywgaU9TIDQuMisuXG4gICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgPT09ICd1bmRlZmluZWQnIHx8IHR5cGVvZiBBcnJheUJ1ZmZlciA9PT0gJ3VuZGVmaW5lZCcpXG4gICAgICByZXR1cm4gZmFsc2VcblxuICAvLyBEb2VzIHRoZSBicm93c2VyIHN1cHBvcnQgYWRkaW5nIHByb3BlcnRpZXMgdG8gYFVpbnQ4QXJyYXlgIGluc3RhbmNlcz8gSWZcbiAgLy8gbm90LCB0aGVuIHRoYXQncyB0aGUgc2FtZSBhcyBubyBgVWludDhBcnJheWAgc3VwcG9ydC4gV2UgbmVlZCB0byBiZSBhYmxlIHRvXG4gIC8vIGFkZCBhbGwgdGhlIG5vZGUgQnVmZmVyIEFQSSBtZXRob2RzLlxuICAvLyBSZWxldmFudCBGaXJlZm94IGJ1ZzogaHR0cHM6Ly9idWd6aWxsYS5tb3ppbGxhLm9yZy9zaG93X2J1Zy5jZ2k/aWQ9Njk1NDM4XG4gIHRyeSB7XG4gICAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KDApXG4gICAgYXJyLmZvbyA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIDQyIH1cbiAgICByZXR1cm4gNDIgPT09IGFyci5mb28oKSAmJlxuICAgICAgICB0eXBlb2YgYXJyLnN1YmFycmF5ID09PSAnZnVuY3Rpb24nIC8vIENocm9tZSA5LTEwIGxhY2sgYHN1YmFycmF5YFxuICB9IGNhdGNoIChlKSB7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cbn0pKClcblxuLyoqXG4gKiBDbGFzczogQnVmZmVyXG4gKiA9PT09PT09PT09PT09XG4gKlxuICogVGhlIEJ1ZmZlciBjb25zdHJ1Y3RvciByZXR1cm5zIGluc3RhbmNlcyBvZiBgVWludDhBcnJheWAgdGhhdCBhcmUgYXVnbWVudGVkXG4gKiB3aXRoIGZ1bmN0aW9uIHByb3BlcnRpZXMgZm9yIGFsbCB0aGUgbm9kZSBgQnVmZmVyYCBBUEkgZnVuY3Rpb25zLiBXZSB1c2VcbiAqIGBVaW50OEFycmF5YCBzbyB0aGF0IHNxdWFyZSBicmFja2V0IG5vdGF0aW9uIHdvcmtzIGFzIGV4cGVjdGVkIC0tIGl0IHJldHVybnNcbiAqIGEgc2luZ2xlIG9jdGV0LlxuICpcbiAqIEJ5IGF1Z21lbnRpbmcgdGhlIGluc3RhbmNlcywgd2UgY2FuIGF2b2lkIG1vZGlmeWluZyB0aGUgYFVpbnQ4QXJyYXlgXG4gKiBwcm90b3R5cGUuXG4gKi9cbmZ1bmN0aW9uIEJ1ZmZlciAoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybykge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQnVmZmVyKSlcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKVxuXG4gIHZhciB0eXBlID0gdHlwZW9mIHN1YmplY3RcblxuICAvLyBXb3JrYXJvdW5kOiBub2RlJ3MgYmFzZTY0IGltcGxlbWVudGF0aW9uIGFsbG93cyBmb3Igbm9uLXBhZGRlZCBzdHJpbmdzXG4gIC8vIHdoaWxlIGJhc2U2NC1qcyBkb2VzIG5vdC5cbiAgaWYgKGVuY29kaW5nID09PSAnYmFzZTY0JyAmJiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHN1YmplY3QgPSBzdHJpbmd0cmltKHN1YmplY3QpXG4gICAgd2hpbGUgKHN1YmplY3QubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgICAgc3ViamVjdCA9IHN1YmplY3QgKyAnPSdcbiAgICB9XG4gIH1cblxuICAvLyBGaW5kIHRoZSBsZW5ndGhcbiAgdmFyIGxlbmd0aFxuICBpZiAodHlwZSA9PT0gJ251bWJlcicpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKVxuICAgIGxlbmd0aCA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHN1YmplY3QsIGVuY29kaW5nKVxuICBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0JylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdC5sZW5ndGgpIC8vIEFzc3VtZSBvYmplY3QgaXMgYW4gYXJyYXlcbiAgZWxzZVxuICAgIHRocm93IG5ldyBFcnJvcignRmlyc3QgYXJndW1lbnQgbmVlZHMgdG8gYmUgYSBudW1iZXIsIGFycmF5IG9yIHN0cmluZy4nKVxuXG4gIHZhciBidWZcbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAvLyBQcmVmZXJyZWQ6IFJldHVybiBhbiBhdWdtZW50ZWQgYFVpbnQ4QXJyYXlgIGluc3RhbmNlIGZvciBiZXN0IHBlcmZvcm1hbmNlXG4gICAgYnVmID0gYXVnbWVudChuZXcgVWludDhBcnJheShsZW5ndGgpKVxuICB9IGVsc2Uge1xuICAgIC8vIEZhbGxiYWNrOiBSZXR1cm4gVEhJUyBpbnN0YW5jZSBvZiBCdWZmZXIgKGNyZWF0ZWQgYnkgYG5ld2ApXG4gICAgYnVmID0gdGhpc1xuICAgIGJ1Zi5sZW5ndGggPSBsZW5ndGhcbiAgICBidWYuX2lzQnVmZmVyID0gdHJ1ZVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgdHlwZW9mIFVpbnQ4QXJyYXkgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgIHN1YmplY3QgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgLy8gU3BlZWQgb3B0aW1pemF0aW9uIC0tIHVzZSBzZXQgaWYgd2UncmUgY29weWluZyBmcm9tIGEgVWludDhBcnJheVxuICAgIGJ1Zi5fc2V0KHN1YmplY3QpXG4gIH0gZWxzZSBpZiAoaXNBcnJheWlzaChzdWJqZWN0KSkge1xuICAgIC8vIFRyZWF0IGFycmF5LWlzaCBvYmplY3RzIGFzIGEgYnl0ZSBhcnJheVxuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSlcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdC5yZWFkVUludDgoaSlcbiAgICAgIGVsc2VcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdFtpXVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xuICAgIGJ1Zi53cml0ZShzdWJqZWN0LCAwLCBlbmNvZGluZylcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJyAmJiAhQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiAhbm9aZXJvKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBidWZbaV0gPSAwXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBTVEFUSUMgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT1cblxuQnVmZmVyLmlzRW5jb2RpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiB0cnVlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5pc0J1ZmZlciA9IGZ1bmN0aW9uIChiKSB7XG4gIHJldHVybiAhIShiICE9PSBudWxsICYmIGIgIT09IHVuZGVmaW5lZCAmJiBiLl9pc0J1ZmZlcilcbn1cblxuQnVmZmVyLmJ5dGVMZW5ndGggPSBmdW5jdGlvbiAoc3RyLCBlbmNvZGluZykge1xuICB2YXIgcmV0XG4gIHN0ciA9IHN0ciArICcnXG4gIHN3aXRjaCAoZW5jb2RpbmcgfHwgJ3V0ZjgnKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggLyAyXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IHV0ZjhUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBiYXNlNjRUb0J5dGVzKHN0cikubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoICogMlxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5jb25jYXQgPSBmdW5jdGlvbiAobGlzdCwgdG90YWxMZW5ndGgpIHtcbiAgYXNzZXJ0KGlzQXJyYXkobGlzdCksICdVc2FnZTogQnVmZmVyLmNvbmNhdChsaXN0LCBbdG90YWxMZW5ndGhdKVxcbicgK1xuICAgICAgJ2xpc3Qgc2hvdWxkIGJlIGFuIEFycmF5LicpXG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfSBlbHNlIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBsaXN0WzBdXG4gIH1cblxuICB2YXIgaVxuICBpZiAodHlwZW9mIHRvdGFsTGVuZ3RoICE9PSAnbnVtYmVyJykge1xuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB0b3RhbExlbmd0aCArPSBsaXN0W2ldLmxlbmd0aFxuICAgIH1cbiAgfVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHRvdGFsTGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbi8vIEJVRkZFUiBJTlNUQU5DRSBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBfaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBhc3NlcnQoc3RyTGVuICUgMiA9PT0gMCwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG5cbiAgaWYgKGxlbmd0aCA+IHN0ckxlbiAvIDIpIHtcbiAgICBsZW5ndGggPSBzdHJMZW4gLyAyXG4gIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIHZhciBieXRlID0gcGFyc2VJbnQoc3RyaW5nLnN1YnN0cihpICogMiwgMiksIDE2KVxuICAgIGFzc2VydCghaXNOYU4oYnl0ZSksICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuICAgIGJ1ZltvZmZzZXQgKyBpXSA9IGJ5dGVcbiAgfVxuICBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9IGkgKiAyXG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIF91dGY4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYXNjaWlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihhc2NpaVRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gX2FzY2lpV3JpdGUoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBfYmFzZTY0V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbiAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpIHtcbiAgLy8gU3VwcG9ydCBib3RoIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZylcbiAgLy8gYW5kIHRoZSBsZWdhY3kgKHN0cmluZywgZW5jb2RpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICBpZiAoaXNGaW5pdGUob2Zmc2V0KSkge1xuICAgIGlmICghaXNGaW5pdGUobGVuZ3RoKSkge1xuICAgICAgZW5jb2RpbmcgPSBsZW5ndGhcbiAgICAgIGxlbmd0aCA9IHVuZGVmaW5lZFxuICAgIH1cbiAgfSBlbHNlIHsgIC8vIGxlZ2FjeVxuICAgIHZhciBzd2FwID0gZW5jb2RpbmdcbiAgICBlbmNvZGluZyA9IG9mZnNldFxuICAgIG9mZnNldCA9IGxlbmd0aFxuICAgIGxlbmd0aCA9IHN3YXBcbiAgfVxuXG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IHRoaXMubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG5cbiAgc3dpdGNoIChlbmNvZGluZykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXR1cm4gX2hleFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ3VjczInOiAvLyBUT0RPOiBObyBzdXBwb3J0IGZvciB1Y3MyIG9yIHV0ZjE2bGUgZW5jb2RpbmdzIHlldFxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXR1cm4gX3V0ZjhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldHVybiBfYXNjaWlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXR1cm4gX2JpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldHVybiBfYmFzZTY0V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuXG4gIGVuY29kaW5nID0gU3RyaW5nKGVuY29kaW5nIHx8ICd1dGY4JykudG9Mb3dlckNhc2UoKVxuICBzdGFydCA9IE51bWJlcihzdGFydCkgfHwgMFxuICBlbmQgPSAoZW5kICE9PSB1bmRlZmluZWQpXG4gICAgPyBOdW1iZXIoZW5kKVxuICAgIDogZW5kID0gc2VsZi5sZW5ndGhcblxuICAvLyBGYXN0cGF0aCBlbXB0eSBzdHJpbmdzXG4gIGlmIChlbmQgPT09IHN0YXJ0KVxuICAgIHJldHVybiAnJ1xuXG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0dXJuIF9oZXhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICd1Y3MyJzogLy8gVE9ETzogTm8gc3VwcG9ydCBmb3IgdWNzMiBvciB1dGYxNmxlIGVuY29kaW5ncyB5ZXRcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIF91dGY4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXR1cm4gX2FzY2lpU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICBjYXNlICdiaW5hcnknOlxuICAgICAgcmV0dXJuIF9iaW5hcnlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXR1cm4gX2Jhc2U2NFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogJ0J1ZmZlcicsXG4gICAgZGF0YTogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5fYXJyIHx8IHRoaXMsIDApXG4gIH1cbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKHRhcmdldCwgdGFyZ2V0X3N0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIHZhciBzb3VyY2UgPSB0aGlzXG5cbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKCF0YXJnZXRfc3RhcnQpIHRhcmdldF9zdGFydCA9IDBcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdzb3VyY2VFbmQgPCBzb3VyY2VTdGFydCcpXG4gIGFzc2VydCh0YXJnZXRfc3RhcnQgPj0gMCAmJiB0YXJnZXRfc3RhcnQgPCB0YXJnZXQubGVuZ3RoLFxuICAgICAgJ3RhcmdldFN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSBzb3VyY2UubGVuZ3RoLCAnc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aClcbiAgICBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCA8IGVuZCAtIHN0YXJ0KVxuICAgIGVuZCA9IHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgKyBzdGFydFxuXG4gIC8vIGNvcHkhXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZW5kIC0gc3RhcnQ7IGkrKylcbiAgICB0YXJnZXRbaSArIHRhcmdldF9zdGFydF0gPSB0aGlzW2kgKyBzdGFydF1cbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKHN0YXJ0ID09PSAwICYmIGVuZCA9PT0gYnVmLmxlbmd0aCkge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1Zi5zbGljZShzdGFydCwgZW5kKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBfdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKylcbiAgICByZXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gX2JpbmFyeVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgcmV0dXJuIF9hc2NpaVNsaWNlKGJ1Ziwgc3RhcnQsIGVuZClcbn1cblxuZnVuY3Rpb24gX2hleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuLy8gaHR0cDovL25vZGVqcy5vcmcvYXBpL2J1ZmZlci5odG1sI2J1ZmZlcl9idWZfc2xpY2Vfc3RhcnRfZW5kXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gY2xhbXAoc3RhcnQsIGxlbiwgMClcbiAgZW5kID0gY2xhbXAoZW5kLCBsZW4sIGxlbilcblxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIHJldHVybiBhdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG4vLyBgZ2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gIH0gZWxzZSB7XG4gICAgdmFsID0gYnVmW29mZnNldF0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMl0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICAgIHZhbCB8PSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXQgKyAzXSA8PCAyNCA+Pj4gMClcbiAgfSBlbHNlIHtcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAxXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAyXSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDNdXG4gICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXRdIDw8IDI0ID4+PiAwKVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCxcbiAgICAgICAgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHZhciBuZWcgPSB0aGlzW29mZnNldF0gJiAweDgwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDE2KGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQzMihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwMDAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRGbG9hdCAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdExFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZERvdWJsZSAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmYpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKSByZXR1cm5cblxuICB0aGlzW29mZnNldF0gPSB2YWx1ZVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDIpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlICYgKDB4ZmYgPDwgKDggKiAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSkpKSA+Pj5cbiAgICAgICAgICAgIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpICogOFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZiwgLTB4ODApXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIHRoaXMud3JpdGVVSW50OCh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydClcbiAgZWxzZVxuICAgIHRoaXMud3JpdGVVSW50OCgweGZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmYsIC0weDgwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MTYoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgMHhmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZmZmZmYsIC0weDgwMDAwMDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQzMihidWYsIDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMy40MDI4MjM0NjYzODUyODg2ZSszOCwgLTMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLFxuICAgICAgICAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbi8vIGZpbGwodmFsdWUsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5maWxsID0gZnVuY3Rpb24gKHZhbHVlLCBzdGFydCwgZW5kKSB7XG4gIGlmICghdmFsdWUpIHZhbHVlID0gMFxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQpIGVuZCA9IHRoaXMubGVuZ3RoXG5cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YWx1ZSA9IHZhbHVlLmNoYXJDb2RlQXQoMClcbiAgfVxuXG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmICFpc05hTih2YWx1ZSksICd2YWx1ZSBpcyBub3QgYSBudW1iZXInKVxuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCB0aGlzLmxlbmd0aCwgJ3N0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHRoaXMubGVuZ3RoLCAnZW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgdGhpc1tpXSA9IHZhbHVlXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgb3V0ID0gW11cbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBvdXRbaV0gPSB0b0hleCh0aGlzW2ldKVxuICAgIGlmIChpID09PSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTKSB7XG4gICAgICBvdXRbaSArIDFdID0gJy4uLidcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIHJldHVybiAnPEJ1ZmZlciAnICsgb3V0LmpvaW4oJyAnKSArICc+J1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEFycmF5QnVmZmVyYCB3aXRoIHRoZSAqY29waWVkKiBtZW1vcnkgb2YgdGhlIGJ1ZmZlciBpbnN0YW5jZS5cbiAqIEFkZGVkIGluIE5vZGUgMC4xMi4gT25seSBhdmFpbGFibGUgaW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEFycmF5QnVmZmVyLlxuICovXG5CdWZmZXIucHJvdG90eXBlLnRvQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgVWludDhBcnJheSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKVxuICAgICAgICBidWZbaV0gPSB0aGlzW2ldXG4gICAgICByZXR1cm4gYnVmLmJ1ZmZlclxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHN0cmluZ3RyaW0gKHN0cikge1xuICBpZiAoc3RyLnRyaW0pIHJldHVybiBzdHIudHJpbSgpXG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpXG59XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IHRoZSBVaW50OEFycmF5ICppbnN0YW5jZSogKG5vdCB0aGUgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbmZ1bmN0aW9uIGF1Z21lbnQgKGFycikge1xuICBhcnIuX2lzQnVmZmVyID0gdHJ1ZVxuXG4gIC8vIHNhdmUgcmVmZXJlbmNlIHRvIG9yaWdpbmFsIFVpbnQ4QXJyYXkgZ2V0L3NldCBtZXRob2RzIGJlZm9yZSBvdmVyd3JpdGluZ1xuICBhcnIuX2dldCA9IGFyci5nZXRcbiAgYXJyLl9zZXQgPSBhcnIuc2V0XG5cbiAgLy8gZGVwcmVjYXRlZCwgd2lsbCBiZSByZW1vdmVkIGluIG5vZGUgMC4xMytcbiAgYXJyLmdldCA9IEJQLmdldFxuICBhcnIuc2V0ID0gQlAuc2V0XG5cbiAgYXJyLndyaXRlID0gQlAud3JpdGVcbiAgYXJyLnRvU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvTG9jYWxlU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvSlNPTiA9IEJQLnRvSlNPTlxuICBhcnIuY29weSA9IEJQLmNvcHlcbiAgYXJyLnNsaWNlID0gQlAuc2xpY2VcbiAgYXJyLnJlYWRVSW50OCA9IEJQLnJlYWRVSW50OFxuICBhcnIucmVhZFVJbnQxNkxFID0gQlAucmVhZFVJbnQxNkxFXG4gIGFyci5yZWFkVUludDE2QkUgPSBCUC5yZWFkVUludDE2QkVcbiAgYXJyLnJlYWRVSW50MzJMRSA9IEJQLnJlYWRVSW50MzJMRVxuICBhcnIucmVhZFVJbnQzMkJFID0gQlAucmVhZFVJbnQzMkJFXG4gIGFyci5yZWFkSW50OCA9IEJQLnJlYWRJbnQ4XG4gIGFyci5yZWFkSW50MTZMRSA9IEJQLnJlYWRJbnQxNkxFXG4gIGFyci5yZWFkSW50MTZCRSA9IEJQLnJlYWRJbnQxNkJFXG4gIGFyci5yZWFkSW50MzJMRSA9IEJQLnJlYWRJbnQzMkxFXG4gIGFyci5yZWFkSW50MzJCRSA9IEJQLnJlYWRJbnQzMkJFXG4gIGFyci5yZWFkRmxvYXRMRSA9IEJQLnJlYWRGbG9hdExFXG4gIGFyci5yZWFkRmxvYXRCRSA9IEJQLnJlYWRGbG9hdEJFXG4gIGFyci5yZWFkRG91YmxlTEUgPSBCUC5yZWFkRG91YmxlTEVcbiAgYXJyLnJlYWREb3VibGVCRSA9IEJQLnJlYWREb3VibGVCRVxuICBhcnIud3JpdGVVSW50OCA9IEJQLndyaXRlVUludDhcbiAgYXJyLndyaXRlVUludDE2TEUgPSBCUC53cml0ZVVJbnQxNkxFXG4gIGFyci53cml0ZVVJbnQxNkJFID0gQlAud3JpdGVVSW50MTZCRVxuICBhcnIud3JpdGVVSW50MzJMRSA9IEJQLndyaXRlVUludDMyTEVcbiAgYXJyLndyaXRlVUludDMyQkUgPSBCUC53cml0ZVVJbnQzMkJFXG4gIGFyci53cml0ZUludDggPSBCUC53cml0ZUludDhcbiAgYXJyLndyaXRlSW50MTZMRSA9IEJQLndyaXRlSW50MTZMRVxuICBhcnIud3JpdGVJbnQxNkJFID0gQlAud3JpdGVJbnQxNkJFXG4gIGFyci53cml0ZUludDMyTEUgPSBCUC53cml0ZUludDMyTEVcbiAgYXJyLndyaXRlSW50MzJCRSA9IEJQLndyaXRlSW50MzJCRVxuICBhcnIud3JpdGVGbG9hdExFID0gQlAud3JpdGVGbG9hdExFXG4gIGFyci53cml0ZUZsb2F0QkUgPSBCUC53cml0ZUZsb2F0QkVcbiAgYXJyLndyaXRlRG91YmxlTEUgPSBCUC53cml0ZURvdWJsZUxFXG4gIGFyci53cml0ZURvdWJsZUJFID0gQlAud3JpdGVEb3VibGVCRVxuICBhcnIuZmlsbCA9IEJQLmZpbGxcbiAgYXJyLmluc3BlY3QgPSBCUC5pbnNwZWN0XG4gIGFyci50b0FycmF5QnVmZmVyID0gQlAudG9BcnJheUJ1ZmZlclxuXG4gIHJldHVybiBhcnJcbn1cblxuLy8gc2xpY2Uoc3RhcnQsIGVuZClcbmZ1bmN0aW9uIGNsYW1wIChpbmRleCwgbGVuLCBkZWZhdWx0VmFsdWUpIHtcbiAgaWYgKHR5cGVvZiBpbmRleCAhPT0gJ251bWJlcicpIHJldHVybiBkZWZhdWx0VmFsdWVcbiAgaW5kZXggPSB+fmluZGV4OyAgLy8gQ29lcmNlIHRvIGludGVnZXIuXG4gIGlmIChpbmRleCA+PSBsZW4pIHJldHVybiBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICBpbmRleCArPSBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBjb2VyY2UgKGxlbmd0aCkge1xuICAvLyBDb2VyY2UgbGVuZ3RoIHRvIGEgbnVtYmVyIChwb3NzaWJseSBOYU4pLCByb3VuZCB1cFxuICAvLyBpbiBjYXNlIGl0J3MgZnJhY3Rpb25hbCAoZS5nLiAxMjMuNDU2KSB0aGVuIGRvIGFcbiAgLy8gZG91YmxlIG5lZ2F0ZSB0byBjb2VyY2UgYSBOYU4gdG8gMC4gRWFzeSwgcmlnaHQ/XG4gIGxlbmd0aCA9IH5+TWF0aC5jZWlsKCtsZW5ndGgpXG4gIHJldHVybiBsZW5ndGggPCAwID8gMCA6IGxlbmd0aFxufVxuXG5mdW5jdGlvbiBpc0FycmF5IChzdWJqZWN0KSB7XG4gIHJldHVybiAoQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoc3ViamVjdCkge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc3ViamVjdCkgPT09ICdbb2JqZWN0IEFycmF5XSdcbiAgfSkoc3ViamVjdClcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYiA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaWYgKGIgPD0gMHg3RilcbiAgICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpKVxuICAgIGVsc2Uge1xuICAgICAgdmFyIHN0YXJ0ID0gaVxuICAgICAgaWYgKGIgPj0gMHhEODAwICYmIGIgPD0gMHhERkZGKSBpKytcbiAgICAgIHZhciBoID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0ci5zbGljZShzdGFydCwgaSsxKSkuc3Vic3RyKDEpLnNwbGl0KCclJylcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaC5sZW5ndGg7IGorKylcbiAgICAgICAgYnl0ZUFycmF5LnB1c2gocGFyc2VJbnQoaFtqXSwgMTYpKVxuICAgIH1cbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGFzY2lpVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIC8vIE5vZGUncyBjb2RlIHNlZW1zIHRvIGJlIGRvaW5nIHRoaXMgYW5kIG5vdCAmIDB4N0YuLlxuICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRilcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBwb3NcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSlcbiAgICAgIGJyZWFrXG4gICAgZHN0W2kgKyBvZmZzZXRdID0gc3JjW2ldXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gZGVjb2RlVXRmOENoYXIgKHN0cikge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgweEZGRkQpIC8vIFVURiA4IGludmFsaWQgY2hhclxuICB9XG59XG5cbi8qXG4gKiBXZSBoYXZlIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSB2YWx1ZSBpcyBhIHZhbGlkIGludGVnZXIuIFRoaXMgbWVhbnMgdGhhdCBpdFxuICogaXMgbm9uLW5lZ2F0aXZlLiBJdCBoYXMgbm8gZnJhY3Rpb25hbCBjb21wb25lbnQgYW5kIHRoYXQgaXQgZG9lcyBub3RcbiAqIGV4Y2VlZCB0aGUgbWF4aW11bSBhbGxvd2VkIHZhbHVlLlxuICovXG5mdW5jdGlvbiB2ZXJpZnVpbnQgKHZhbHVlLCBtYXgpIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPj0gMCxcbiAgICAgICdzcGVjaWZpZWQgYSBuZWdhdGl2ZSB2YWx1ZSBmb3Igd3JpdGluZyBhbiB1bnNpZ25lZCB2YWx1ZScpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBpcyBsYXJnZXIgdGhhbiBtYXhpbXVtIHZhbHVlIGZvciB0eXBlJylcbiAgYXNzZXJ0KE1hdGguZmxvb3IodmFsdWUpID09PSB2YWx1ZSwgJ3ZhbHVlIGhhcyBhIGZyYWN0aW9uYWwgY29tcG9uZW50Jylcbn1cblxuZnVuY3Rpb24gdmVyaWZzaW50KHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmSUVFRTc1NCh2YWx1ZSwgbWF4LCBtaW4pIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxufVxuXG5mdW5jdGlvbiBhc3NlcnQgKHRlc3QsIG1lc3NhZ2UpIHtcbiAgaWYgKCF0ZXN0KSB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSB8fCAnRmFpbGVkIGFzc2VydGlvbicpXG59XG4iLCJ2YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG47KGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuICB2YXIgQXJyID0gKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJylcbiAgICA/IFVpbnQ4QXJyYXlcbiAgICA6IEFycmF5XG5cblx0dmFyIFpFUk8gICA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBQTFVTICAgPSAnKycuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0ggID0gJy8nLmNoYXJDb2RlQXQoMClcblx0dmFyIE5VTUJFUiA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBMT1dFUiAgPSAnYScuY2hhckNvZGVBdCgwKVxuXHR2YXIgVVBQRVIgID0gJ0EnLmNoYXJDb2RlQXQoMClcblxuXHRmdW5jdGlvbiBkZWNvZGUgKGVsdCkge1xuXHRcdHZhciBjb2RlID0gZWx0LmNoYXJDb2RlQXQoMClcblx0XHRpZiAoY29kZSA9PT0gUExVUylcblx0XHRcdHJldHVybiA2MiAvLyAnKydcblx0XHRpZiAoY29kZSA9PT0gU0xBU0gpXG5cdFx0XHRyZXR1cm4gNjMgLy8gJy8nXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIpXG5cdFx0XHRyZXR1cm4gLTEgLy9ubyBtYXRjaFxuXHRcdGlmIChjb2RlIDwgTlVNQkVSICsgMTApXG5cdFx0XHRyZXR1cm4gY29kZSAtIE5VTUJFUiArIDI2ICsgMjZcblx0XHRpZiAoY29kZSA8IFVQUEVSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIFVQUEVSXG5cdFx0aWYgKGNvZGUgPCBMT1dFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBMT1dFUiArIDI2XG5cdH1cblxuXHRmdW5jdGlvbiBiNjRUb0J5dGVBcnJheSAoYjY0KSB7XG5cdFx0dmFyIGksIGosIGwsIHRtcCwgcGxhY2VIb2xkZXJzLCBhcnJcblxuXHRcdGlmIChiNjQubGVuZ3RoICUgNCA+IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzdHJpbmcuIExlbmd0aCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNCcpXG5cdFx0fVxuXG5cdFx0Ly8gdGhlIG51bWJlciBvZiBlcXVhbCBzaWducyAocGxhY2UgaG9sZGVycylcblx0XHQvLyBpZiB0aGVyZSBhcmUgdHdvIHBsYWNlaG9sZGVycywgdGhhbiB0aGUgdHdvIGNoYXJhY3RlcnMgYmVmb3JlIGl0XG5cdFx0Ly8gcmVwcmVzZW50IG9uZSBieXRlXG5cdFx0Ly8gaWYgdGhlcmUgaXMgb25seSBvbmUsIHRoZW4gdGhlIHRocmVlIGNoYXJhY3RlcnMgYmVmb3JlIGl0IHJlcHJlc2VudCAyIGJ5dGVzXG5cdFx0Ly8gdGhpcyBpcyBqdXN0IGEgY2hlYXAgaGFjayB0byBub3QgZG8gaW5kZXhPZiB0d2ljZVxuXHRcdHZhciBsZW4gPSBiNjQubGVuZ3RoXG5cdFx0cGxhY2VIb2xkZXJzID0gJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDIpID8gMiA6ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAxKSA/IDEgOiAwXG5cblx0XHQvLyBiYXNlNjQgaXMgNC8zICsgdXAgdG8gdHdvIGNoYXJhY3RlcnMgb2YgdGhlIG9yaWdpbmFsIGRhdGFcblx0XHRhcnIgPSBuZXcgQXJyKGI2NC5sZW5ndGggKiAzIC8gNCAtIHBsYWNlSG9sZGVycylcblxuXHRcdC8vIGlmIHRoZXJlIGFyZSBwbGFjZWhvbGRlcnMsIG9ubHkgZ2V0IHVwIHRvIHRoZSBsYXN0IGNvbXBsZXRlIDQgY2hhcnNcblx0XHRsID0gcGxhY2VIb2xkZXJzID4gMCA/IGI2NC5sZW5ndGggLSA0IDogYjY0Lmxlbmd0aFxuXG5cdFx0dmFyIEwgPSAwXG5cblx0XHRmdW5jdGlvbiBwdXNoICh2KSB7XG5cdFx0XHRhcnJbTCsrXSA9IHZcblx0XHR9XG5cblx0XHRmb3IgKGkgPSAwLCBqID0gMDsgaSA8IGw7IGkgKz0gNCwgaiArPSAzKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDE4KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDEyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpIDw8IDYpIHwgZGVjb2RlKGI2NC5jaGFyQXQoaSArIDMpKVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwMDApID4+IDE2KVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwKSA+PiA4KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdGlmIChwbGFjZUhvbGRlcnMgPT09IDIpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA+PiA0KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH0gZWxzZSBpZiAocGxhY2VIb2xkZXJzID09PSAxKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDEwKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDQpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPj4gMilcblx0XHRcdHB1c2goKHRtcCA+PiA4KSAmIDB4RkYpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyclxuXHR9XG5cblx0ZnVuY3Rpb24gdWludDhUb0Jhc2U2NCAodWludDgpIHtcblx0XHR2YXIgaSxcblx0XHRcdGV4dHJhQnl0ZXMgPSB1aW50OC5sZW5ndGggJSAzLCAvLyBpZiB3ZSBoYXZlIDEgYnl0ZSBsZWZ0LCBwYWQgMiBieXRlc1xuXHRcdFx0b3V0cHV0ID0gXCJcIixcblx0XHRcdHRlbXAsIGxlbmd0aFxuXG5cdFx0ZnVuY3Rpb24gZW5jb2RlIChudW0pIHtcblx0XHRcdHJldHVybiBsb29rdXAuY2hhckF0KG51bSlcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0cmlwbGV0VG9CYXNlNjQgKG51bSkge1xuXHRcdFx0cmV0dXJuIGVuY29kZShudW0gPj4gMTggJiAweDNGKSArIGVuY29kZShudW0gPj4gMTIgJiAweDNGKSArIGVuY29kZShudW0gPj4gNiAmIDB4M0YpICsgZW5jb2RlKG51bSAmIDB4M0YpXG5cdFx0fVxuXG5cdFx0Ly8gZ28gdGhyb3VnaCB0aGUgYXJyYXkgZXZlcnkgdGhyZWUgYnl0ZXMsIHdlJ2xsIGRlYWwgd2l0aCB0cmFpbGluZyBzdHVmZiBsYXRlclxuXHRcdGZvciAoaSA9IDAsIGxlbmd0aCA9IHVpbnQ4Lmxlbmd0aCAtIGV4dHJhQnl0ZXM7IGkgPCBsZW5ndGg7IGkgKz0gMykge1xuXHRcdFx0dGVtcCA9ICh1aW50OFtpXSA8PCAxNikgKyAodWludDhbaSArIDFdIDw8IDgpICsgKHVpbnQ4W2kgKyAyXSlcblx0XHRcdG91dHB1dCArPSB0cmlwbGV0VG9CYXNlNjQodGVtcClcblx0XHR9XG5cblx0XHQvLyBwYWQgdGhlIGVuZCB3aXRoIHplcm9zLCBidXQgbWFrZSBzdXJlIHRvIG5vdCBmb3JnZXQgdGhlIGV4dHJhIGJ5dGVzXG5cdFx0c3dpdGNoIChleHRyYUJ5dGVzKSB7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHRlbXAgPSB1aW50OFt1aW50OC5sZW5ndGggLSAxXVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPT0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdHRlbXAgPSAodWludDhbdWludDgubGVuZ3RoIC0gMl0gPDwgOCkgKyAodWludDhbdWludDgubGVuZ3RoIC0gMV0pXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAxMClcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA+PiA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgMikgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dFxuXHR9XG5cblx0bW9kdWxlLmV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRtb2R1bGUuZXhwb3J0cy5mcm9tQnl0ZUFycmF5ID0gdWludDhUb0Jhc2U2NFxufSgpKVxuIiwiZXhwb3J0cy5yZWFkID0gZnVuY3Rpb24oYnVmZmVyLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBuQml0cyA9IC03LFxuICAgICAgaSA9IGlzTEUgPyAobkJ5dGVzIC0gMSkgOiAwLFxuICAgICAgZCA9IGlzTEUgPyAtMSA6IDEsXG4gICAgICBzID0gYnVmZmVyW29mZnNldCArIGldO1xuXG4gIGkgKz0gZDtcblxuICBlID0gcyAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgcyA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IGVMZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IGUgPSBlICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIG0gPSBlICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBlID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gbUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgbSA9IG0gKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgaWYgKGUgPT09IDApIHtcbiAgICBlID0gMSAtIGVCaWFzO1xuICB9IGVsc2UgaWYgKGUgPT09IGVNYXgpIHtcbiAgICByZXR1cm4gbSA/IE5hTiA6ICgocyA/IC0xIDogMSkgKiBJbmZpbml0eSk7XG4gIH0gZWxzZSB7XG4gICAgbSA9IG0gKyBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICBlID0gZSAtIGVCaWFzO1xuICB9XG4gIHJldHVybiAocyA/IC0xIDogMSkgKiBtICogTWF0aC5wb3coMiwgZSAtIG1MZW4pO1xufTtcblxuZXhwb3J0cy53cml0ZSA9IGZ1bmN0aW9uKGJ1ZmZlciwgdmFsdWUsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLCBjLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIHJ0ID0gKG1MZW4gPT09IDIzID8gTWF0aC5wb3coMiwgLTI0KSAtIE1hdGgucG93KDIsIC03NykgOiAwKSxcbiAgICAgIGkgPSBpc0xFID8gMCA6IChuQnl0ZXMgLSAxKSxcbiAgICAgIGQgPSBpc0xFID8gMSA6IC0xLFxuICAgICAgcyA9IHZhbHVlIDwgMCB8fCAodmFsdWUgPT09IDAgJiYgMSAvIHZhbHVlIDwgMCkgPyAxIDogMDtcblxuICB2YWx1ZSA9IE1hdGguYWJzKHZhbHVlKTtcblxuICBpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlID09PSBJbmZpbml0eSkge1xuICAgIG0gPSBpc05hTih2YWx1ZSkgPyAxIDogMDtcbiAgICBlID0gZU1heDtcbiAgfSBlbHNlIHtcbiAgICBlID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMik7XG4gICAgaWYgKHZhbHVlICogKGMgPSBNYXRoLnBvdygyLCAtZSkpIDwgMSkge1xuICAgICAgZS0tO1xuICAgICAgYyAqPSAyO1xuICAgIH1cbiAgICBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIHZhbHVlICs9IHJ0IC8gYztcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgKz0gcnQgKiBNYXRoLnBvdygyLCAxIC0gZUJpYXMpO1xuICAgIH1cbiAgICBpZiAodmFsdWUgKiBjID49IDIpIHtcbiAgICAgIGUrKztcbiAgICAgIGMgLz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZSArIGVCaWFzID49IGVNYXgpIHtcbiAgICAgIG0gPSAwO1xuICAgICAgZSA9IGVNYXg7XG4gICAgfSBlbHNlIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgbSA9ICh2YWx1ZSAqIGMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IGUgKyBlQmlhcztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IHZhbHVlICogTWF0aC5wb3coMiwgZUJpYXMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IDA7XG4gICAgfVxuICB9XG5cbiAgZm9yICg7IG1MZW4gPj0gODsgYnVmZmVyW29mZnNldCArIGldID0gbSAmIDB4ZmYsIGkgKz0gZCwgbSAvPSAyNTYsIG1MZW4gLT0gOCk7XG5cbiAgZSA9IChlIDw8IG1MZW4pIHwgbTtcbiAgZUxlbiArPSBtTGVuO1xuICBmb3IgKDsgZUxlbiA+IDA7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IGUgJiAweGZmLCBpICs9IGQsIGUgLz0gMjU2LCBlTGVuIC09IDgpO1xuXG4gIGJ1ZmZlcltvZmZzZXQgKyBpIC0gZF0gfD0gcyAqIDEyODtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9XHJcblxyXG4gIGZpcnN0OiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBZb3VyIGZpcnN0IExvb3BTY3JpcHQuIENsaWNrIFwiQ29tcGlsZVwiIGJlbG93IHRvIHN0YXJ0IVxyXG5cclxudG9uZSBub3RlMVxyXG4gIGR1cmF0aW9uIDI1MFxyXG4gIG9jdGF2ZSA0XHJcbiAgbm90ZSBDXHJcblxyXG50b25lIGJhc3MxXHJcbiAgZHVyYXRpb24gMjUwXHJcbiAgb2N0YXZlIDFcclxuICBub3RlIEJcclxuXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIG5vdGUxIHguLi4uLi4ueC4uLi4uLi5cclxuICBwYXR0ZXJuIGJhc3MxIC4uLi54Li4uLi4uLnguLi5cclxuXHJcblwiXCJcIlxyXG5cclxuICBub3RlczogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgTm90ZSBvdmVycmlkZXMhXHJcblxyXG4jIEgtTCBhcmUgdGhlIGJsYWNrIGtleXM6XHJcbiMgICAgIEggSSAgIEogSyBMXHJcbiMgICAgQyBEIEUgRiBHIEEgQlxyXG5cclxuIyBUcnkgc2V0dGluZyB0aGUgZHVyYXRpb24gdG8gMTAwXHJcbnRvbmUgbm90ZTFcclxuICBhZHNyIDAuMDA1IDAuMDUgMC43IDAuMDVcclxuICBkdXJhdGlvbiAyNTBcclxuXHJcbiMgU2FtcGxlcyBjYW4gaGF2ZSB0aGVpciBub3RlcyBvdmVycmlkZGVuIHRvbyFcclxuc2FtcGxlIGRpbmdcclxuICBzcmMgc2FtcGxlcy9kaW5nX2Uud2F2XHJcbiAgc3Jjbm90ZSBlXHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBub3RlMSBiLmEuZy5hLmIuYi5iLi4uXHJcblxyXG5sb29wIGxvb3AyXHJcbiAgcGF0dGVybiBkaW5nIGIuYS5nLmEuYi5iLmIuLi5cclxuXHJcbnRyYWNrIHNvbmdcclxuICBwYXR0ZXJuIGxvb3AxIHhcclxuICBwYXR0ZXJuIGxvb3AyIC54XHJcblxyXG5cIlwiXCJcclxuXHJcbiAgbW90dG86IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFuIGFwcHJveGltYXRpb24gb2YgdGhlIGJlYXQgZnJvbSBEcmFrZSdzIFwiVGhlIE1vdHRvXCJcclxuXHJcbmJwbSAxMDBcclxuc2VjdGlvbiAjIHRvIHNoYXJlIEFEU1JcclxuICBhZHNyIDAuMDA1IDAuMDUgMC43IDAuMDVcclxuICB0b25lIGJhc3MxIC0+IG9jdGF2ZSAxXHJcbiAgdG9uZSBiYXNzMiAtPiBvY3RhdmUgMlxyXG5cclxuc2FtcGxlIGNsYXAgIC0+IHNyYyBzYW1wbGVzL2NsYXAud2F2XHJcbnNhbXBsZSBzbmFyZSAtPiBzcmMgc2FtcGxlcy9zbmFyZS53YXZcclxuc2FtcGxlIGhpaGF0IC0+IHNyYyBzYW1wbGVzL2hpaGF0LndhdlxyXG5cclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gaGloYXQgLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uLi54Li4uLi5cclxuICBwYXR0ZXJuIGNsYXAgIC4uLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uLi54Li4uXHJcbiAgcGF0dGVybiBzbmFyZSAuLi4uLi54Li4ueC4uLngueC4uLi4uLi4uLi4uLi4uLlxyXG4gIHBhdHRlcm4gYmFzczEgQmJiYmJiLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuICBwYXR0ZXJuIGJhc3MyIC4uLi4uLkhoaGhoaERkZGRkZC4uLi5IaGhoSmouSmouXHJcblxyXG50cmFjayBzb25nXHJcbiAgcGF0dGVybiBsb29wMSB4eHh4XHJcblxyXG5cIlwiXCJcclxuXHJcbiAgbGVuZ3RoOiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBTaG93aW5nIG9mZiB2YXJpb3VzIG5vdGUgbGVuZ3RocyB1c2luZyBjYXBzIGFuZCBsb3dlcmNhc2VcclxuIyBBbHNvIHNob3dzIHdoYXQgQURTUiBjYW4gZG8hXHJcblxyXG50b25lIG5vdGUxXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcblxyXG50b25lIG5vdGUyXHJcbiAgIyBOb3RlOiBPbmx5IHRoZSBmaXJzdCB0b25lIGhhcyBBRFNSXHJcblxyXG4jIElmIHlvdSB1c2UgYW55IGxldHRlcnMgb3RoZXIgdGhhbiBcInhcIiBvbiBhIHRvbmUgcGF0dGVybiwgeW91IG92ZXJyaWRlIGl0c1xyXG4jIG5vdGUgd2l0aCB0aGUgbm90ZSBsaXN0ZWQuIEFsc28sIGlmIHlvdSB1c2UgYW55IGNhcGl0YWwgbGV0dGVycyBpbiBhIHBhdHRlcm4sXHJcbiMgeW91IG92ZXJyaWRlIHRoZSBsZW5ndGggb2YgdGhhdCBub3RlIHdpdGggdGhlIG51bWJlciBvZiBtYXRjaGluZyBsb3dlcmNhc2VcclxuIyBsZXR0ZXJzIGZvbGxvd2luZyBpdC5cclxuXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIG5vdGUxIEdnZ2dnZ2dnRmZmZmZmLi5BYWFhQmJiLkNjLi5ELi4uXHJcblxyXG5sb29wIGxvb3AyXHJcbiAgcGF0dGVybiBub3RlMiBHZ2dnZ2dnZ0ZmZmZmZi4uQWFhYUJiYi5DYy4uRC4uLlxyXG5cclxudHJhY2sgc29uZ1xyXG4gIHBhdHRlcm4gbG9vcDEgeC5cclxuICBwYXR0ZXJuIGxvb3AyIC54XHJcblxyXG5cIlwiXCJcclxuXHJcbiAgY2hvY29ibzogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgVGhlIENob2NvYm8gVGhlbWUgKGZpcnN0IHBhcnQgb25seSlcclxuXHJcbmJwbSAxMjVcclxuXHJcbnNlY3Rpb24gVG9uZSAoaW4gYSBzZWN0aW9uIHRvIHNoYXJlIEFEU1IpXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgdG9uZSBjaG9jb2JvMVxyXG4gICAgb2N0YXZlIDVcclxuICB0b25lIGNob2NvYm8yXHJcbiAgICBvY3RhdmUgNFxyXG5cclxubG9vcCBsb29wMVxyXG4gcGF0dGVybiBjaG9jb2JvMSBEZGRkLi4uLi4uRGQuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5ELkUuRmZmZmZmLi4uXHJcbiBwYXR0ZXJuIGNob2NvYm8yIC4uLi5CYkdnRWUuLkJiR2dCYi4uR2cuLkJiYmJiYi5BYUdnR0FHLkYuR2dnZ2dnLkYuR2dHQi4uLi4uLi4uLi4uLi5cclxuXHJcbnRyYWNrIHNvbmdcclxuICBwYXR0ZXJuIGxvb3AxIHh4XHJcblwiXCJcIiIsImZyZXFUYWJsZSA9IFtcclxuICB7ICMgT2N0YXZlIDBcclxuXHJcbiAgICBcImFcIjogMjcuNTAwMFxyXG4gICAgXCJsXCI6IDI5LjEzNTNcclxuICAgIFwiYlwiOiAzMC44Njc3XHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDFcclxuICAgIFwiY1wiOiAzMi43MDMyXHJcbiAgICBcImhcIjogMzQuNjQ3OVxyXG4gICAgXCJkXCI6IDM2LjcwODFcclxuICAgIFwiaVwiOiAzOC44OTA5XHJcbiAgICBcImVcIjogNDEuMjAzNVxyXG4gICAgXCJmXCI6IDQzLjY1MzZcclxuICAgIFwialwiOiA0Ni4yNDkzXHJcbiAgICBcImdcIjogNDguOTk5NVxyXG4gICAgXCJrXCI6IDUxLjkxMzBcclxuICAgIFwiYVwiOiA1NS4wMDAwXHJcbiAgICBcImxcIjogNTguMjcwNVxyXG4gICAgXCJiXCI6IDYxLjczNTRcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgMlxyXG4gICAgXCJjXCI6IDY1LjQwNjRcclxuICAgIFwiaFwiOiA2OS4yOTU3XHJcbiAgICBcImRcIjogNzMuNDE2MlxyXG4gICAgXCJpXCI6IDc3Ljc4MTdcclxuICAgIFwiZVwiOiA4Mi40MDY5XHJcbiAgICBcImZcIjogODcuMzA3MVxyXG4gICAgXCJqXCI6IDkyLjQ5ODZcclxuICAgIFwiZ1wiOiA5Ny45OTg5XHJcbiAgICBcImtcIjogMTAzLjgyNlxyXG4gICAgXCJhXCI6IDExMC4wMDBcclxuICAgIFwibFwiOiAxMTYuNTQxXHJcbiAgICBcImJcIjogMTIzLjQ3MVxyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSAzXHJcbiAgICBcImNcIjogMTMwLjgxM1xyXG4gICAgXCJoXCI6IDEzOC41OTFcclxuICAgIFwiZFwiOiAxNDYuODMyXHJcbiAgICBcImlcIjogMTU1LjU2M1xyXG4gICAgXCJlXCI6IDE2NC44MTRcclxuICAgIFwiZlwiOiAxNzQuNjE0XHJcbiAgICBcImpcIjogMTg0Ljk5N1xyXG4gICAgXCJnXCI6IDE5NS45OThcclxuICAgIFwia1wiOiAyMDcuNjUyXHJcbiAgICBcImFcIjogMjIwLjAwMFxyXG4gICAgXCJsXCI6IDIzMy4wODJcclxuICAgIFwiYlwiOiAyNDYuOTQyXHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDRcclxuICAgIFwiY1wiOiAyNjEuNjI2XHJcbiAgICBcImhcIjogMjc3LjE4M1xyXG4gICAgXCJkXCI6IDI5My42NjVcclxuICAgIFwiaVwiOiAzMTEuMTI3XHJcbiAgICBcImVcIjogMzI5LjYyOFxyXG4gICAgXCJmXCI6IDM0OS4yMjhcclxuICAgIFwialwiOiAzNjkuOTk0XHJcbiAgICBcImdcIjogMzkxLjk5NVxyXG4gICAgXCJrXCI6IDQxNS4zMDVcclxuICAgIFwiYVwiOiA0NDAuMDAwXHJcbiAgICBcImxcIjogNDY2LjE2NFxyXG4gICAgXCJiXCI6IDQ5My44ODNcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgNVxyXG4gICAgXCJjXCI6IDUyMy4yNTFcclxuICAgIFwiaFwiOiA1NTQuMzY1XHJcbiAgICBcImRcIjogNTg3LjMzMFxyXG4gICAgXCJpXCI6IDYyMi4yNTRcclxuICAgIFwiZVwiOiA2NTkuMjU1XHJcbiAgICBcImZcIjogNjk4LjQ1NlxyXG4gICAgXCJqXCI6IDczOS45ODlcclxuICAgIFwiZ1wiOiA3ODMuOTkxXHJcbiAgICBcImtcIjogODMwLjYwOVxyXG4gICAgXCJhXCI6IDg4MC4wMDBcclxuICAgIFwibFwiOiA5MzIuMzI4XHJcbiAgICBcImJcIjogOTg3Ljc2N1xyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSA2XHJcbiAgICBcImNcIjogMTA0Ni41MFxyXG4gICAgXCJoXCI6IDExMDguNzNcclxuICAgIFwiZFwiOiAxMTc0LjY2XHJcbiAgICBcImlcIjogMTI0NC41MVxyXG4gICAgXCJlXCI6IDEzMTguNTFcclxuICAgIFwiZlwiOiAxMzk2LjkxXHJcbiAgICBcImpcIjogMTQ3OS45OFxyXG4gICAgXCJnXCI6IDE1NjcuOThcclxuICAgIFwia1wiOiAxNjYxLjIyXHJcbiAgICBcImFcIjogMTc2MC4wMFxyXG4gICAgXCJsXCI6IDE4NjQuNjZcclxuICAgIFwiYlwiOiAxOTc1LjUzXHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDdcclxuICAgIFwiY1wiOiAyMDkzLjAwXHJcbiAgICBcImhcIjogMjIxNy40NlxyXG4gICAgXCJkXCI6IDIzNDkuMzJcclxuICAgIFwiaVwiOiAyNDg5LjAyXHJcbiAgICBcImVcIjogMjYzNy4wMlxyXG4gICAgXCJmXCI6IDI3OTMuODNcclxuICAgIFwialwiOiAyOTU5Ljk2XHJcbiAgICBcImdcIjogMzEzNS45NlxyXG4gICAgXCJrXCI6IDMzMjIuNDRcclxuICAgIFwiYVwiOiAzNTIwLjAwXHJcbiAgICBcImxcIjogMzcyOS4zMVxyXG4gICAgXCJiXCI6IDM5NTEuMDdcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgOFxyXG4gICAgXCJjXCI6IDQxODYuMDFcclxuICB9XHJcbl1cclxuXHJcbmxlZ2FsTm90ZVJlZ2V4ID0gL1thLWxdL1xyXG5cclxuZmluZEZyZXEgPSAob2N0YXZlLCBub3RlKSAtPlxyXG4gIG5vdGUgPSBub3RlLnRvTG93ZXJDYXNlKClcclxuICBpZiAob2N0YXZlID49IDApIGFuZCAob2N0YXZlIDwgZnJlcVRhYmxlLmxlbmd0aCkgYW5kIGxlZ2FsTm90ZVJlZ2V4LnRlc3Qobm90ZSlcclxuICAgIG9jdGF2ZVRhYmxlID0gZnJlcVRhYmxlW29jdGF2ZV1cclxuICAgIGlmIG9jdGF2ZVRhYmxlPyBhbmQgb2N0YXZlVGFibGVbbm90ZV0/XHJcbiAgICAgIHJldHVybiBvY3RhdmVUYWJsZVtub3RlXVxyXG4gIHJldHVybiA0NDAuMFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPVxyXG4gIGZyZXFUYWJsZTogZnJlcVRhYmxlXHJcbiAgZmluZEZyZXE6IGZpbmRGcmVxXHJcbiIsIiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEltcG9ydHNcclxuXHJcbntmaW5kRnJlcX0gPSByZXF1aXJlICcuL2ZyZXEnXHJcbnJpZmZ3YXZlICAgPSByZXF1aXJlIFwiLi9yaWZmd2F2ZVwiXHJcbmpEYXRhVmlldyAgPSByZXF1aXJlICcuLi9qcy9qZGF0YXZpZXcnXHJcbmZzICAgICAgICAgPSByZXF1aXJlICdmcydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEhlbHBlciBmdW5jdGlvbnNcclxuXHJcbmxvZ0RlYnVnID0gKGFyZ3MuLi4pIC0+XHJcbiAgIyBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmdzKVxyXG5cclxuY2xvbmUgPSAob2JqKSAtPlxyXG4gIGlmIG5vdCBvYmo/IG9yIHR5cGVvZiBvYmogaXNudCAnb2JqZWN0J1xyXG4gICAgcmV0dXJuIG9ialxyXG5cclxuICBpZiBvYmogaW5zdGFuY2VvZiBEYXRlXHJcbiAgICByZXR1cm4gbmV3IERhdGUob2JqLmdldFRpbWUoKSlcclxuXHJcbiAgaWYgb2JqIGluc3RhbmNlb2YgUmVnRXhwXHJcbiAgICBmbGFncyA9ICcnXHJcbiAgICBmbGFncyArPSAnZycgaWYgb2JqLmdsb2JhbD9cclxuICAgIGZsYWdzICs9ICdpJyBpZiBvYmouaWdub3JlQ2FzZT9cclxuICAgIGZsYWdzICs9ICdtJyBpZiBvYmoubXVsdGlsaW5lP1xyXG4gICAgZmxhZ3MgKz0gJ3knIGlmIG9iai5zdGlja3k/XHJcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChvYmouc291cmNlLCBmbGFncylcclxuXHJcbiAgbmV3SW5zdGFuY2UgPSBuZXcgb2JqLmNvbnN0cnVjdG9yKClcclxuXHJcbiAgZm9yIGtleSBvZiBvYmpcclxuICAgIG5ld0luc3RhbmNlW2tleV0gPSBjbG9uZSBvYmpba2V5XVxyXG5cclxuICByZXR1cm4gbmV3SW5zdGFuY2VcclxuXHJcbnBhcnNlQm9vbCA9ICh2KSAtPlxyXG4gIHN3aXRjaCBTdHJpbmcodilcclxuICAgIHdoZW4gXCJ0cnVlXCIgdGhlbiB0cnVlXHJcbiAgICB3aGVuIFwieWVzXCIgdGhlbiB0cnVlXHJcbiAgICB3aGVuIFwib25cIiB0aGVuIHRydWVcclxuICAgIHdoZW4gXCIxXCIgdGhlbiB0cnVlXHJcbiAgICBlbHNlIGZhbHNlXHJcblxyXG5jb3VudEluZGVudCA9ICh0ZXh0KSAtPlxyXG4gIGluZGVudCA9IDBcclxuICBmb3IgaSBpbiBbMC4uLnRleHQubGVuZ3RoXVxyXG4gICAgaWYgdGV4dFtpXSA9PSAnXFx0J1xyXG4gICAgICBpbmRlbnQgKz0gOFxyXG4gICAgZWxzZVxyXG4gICAgICBpbmRlbnQrK1xyXG4gIHJldHVybiBpbmRlbnRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFBhcnNlclxyXG5cclxuY2xhc3MgUGFyc2VyXHJcbiAgY29uc3RydWN0b3I6IChAbG9nKSAtPlxyXG4gICAgQGNvbW1lbnRSZWdleCA9IC9eKFteI10qPykoXFxzKiMuKik/JC9cclxuICAgIEBvbmx5V2hpdGVzcGFjZVJlZ2V4ID0gL15cXHMqJC9cclxuICAgIEBpbmRlbnRSZWdleCA9IC9eKFxccyopKFxcUy4qKSQvXHJcbiAgICBAbGVhZGluZ1VuZGVyc2NvcmVSZWdleCA9IC9eXy9cclxuICAgIEBoYXNDYXBpdGFsTGV0dGVyc1JlZ2V4ID0gL1tBLVpdL1xyXG4gICAgQGlzTm90ZVJlZ2V4ID0gL1tBLUxhLWxdL1xyXG5cclxuICAgICMgSC1MIGFyZSB0aGUgYmxhY2sga2V5czpcclxuICAgICMgIEggSSAgIEogSyBMXHJcbiAgICAjIEMgRCBFIEYgRyBBIEJcclxuXHJcbiAgICBAbmFtZWRTdGF0ZXMgPVxyXG4gICAgICBkZWZhdWx0OlxyXG4gICAgICAgIHNyY29jdGF2ZTogNFxyXG4gICAgICAgIHNyY25vdGU6ICdhJ1xyXG4gICAgICAgIG9jdGF2ZTogNFxyXG4gICAgICAgIG5vdGU6ICdhJ1xyXG4gICAgICAgIHdhdmU6ICdzaW5lJ1xyXG4gICAgICAgIGJwbTogMTIwXHJcbiAgICAgICAgZHVyYXRpb246IDIwMFxyXG4gICAgICAgIHZvbHVtZTogMS4wXHJcbiAgICAgICAgY2xpcDogdHJ1ZVxyXG4gICAgICAgIHJldmVyYjpcclxuICAgICAgICAgIGRlbGF5OiAwXHJcbiAgICAgICAgICBkZWNheTogMFxyXG4gICAgICAgIGFkc3I6ICMgbm8tb3AgQURTUiAoZnVsbCAxLjAgc3VzdGFpbilcclxuICAgICAgICAgIGE6IDBcclxuICAgICAgICAgIGQ6IDBcclxuICAgICAgICAgIHM6IDFcclxuICAgICAgICAgIHI6IDFcclxuXHJcbiAgICAjIGlmIGEga2V5IGlzIHByZXNlbnQgaW4gdGhpcyBtYXAsIHRoYXQgbmFtZSBpcyBjb25zaWRlcmVkIGFuIFwib2JqZWN0XCJcclxuICAgIEBvYmplY3RLZXlzID1cclxuICAgICAgdG9uZTpcclxuICAgICAgICB3YXZlOiAnc3RyaW5nJ1xyXG4gICAgICAgIGZyZXE6ICdmbG9hdCdcclxuICAgICAgICBkdXJhdGlvbjogJ2Zsb2F0J1xyXG4gICAgICAgIGFkc3I6ICdhZHNyJ1xyXG4gICAgICAgIG9jdGF2ZTogJ2ludCdcclxuICAgICAgICBub3RlOiAnc3RyaW5nJ1xyXG4gICAgICAgIHZvbHVtZTogJ2Zsb2F0J1xyXG4gICAgICAgIGNsaXA6ICdib29sJ1xyXG4gICAgICAgIHJldmVyYjogJ3JldmVyYidcclxuXHJcbiAgICAgIHNhbXBsZTpcclxuICAgICAgICBzcmM6ICdzdHJpbmcnXHJcbiAgICAgICAgdm9sdW1lOiAnZmxvYXQnXHJcbiAgICAgICAgY2xpcDogJ2Jvb2wnXHJcbiAgICAgICAgcmV2ZXJiOiAncmV2ZXJiJ1xyXG4gICAgICAgIHNyY29jdGF2ZTogJ2ludCdcclxuICAgICAgICBzcmNub3RlOiAnc3RyaW5nJ1xyXG4gICAgICAgIG9jdGF2ZTogJ2ludCdcclxuICAgICAgICBub3RlOiAnc3RyaW5nJ1xyXG5cclxuICAgICAgbG9vcDpcclxuICAgICAgICBicG06ICdpbnQnXHJcblxyXG4gICAgICB0cmFjazoge31cclxuXHJcbiAgICBAc3RhdGVTdGFjayA9IFtdXHJcbiAgICBAcmVzZXQgJ2RlZmF1bHQnLCAwXHJcbiAgICBAb2JqZWN0cyA9IHt9XHJcbiAgICBAb2JqZWN0ID0gbnVsbFxyXG4gICAgQG9iamVjdFNjb3BlUmVhZHkgPSBmYWxzZVxyXG5cclxuICBpc09iamVjdFR5cGU6ICh0eXBlKSAtPlxyXG4gICAgcmV0dXJuIEBvYmplY3RLZXlzW3R5cGVdP1xyXG5cclxuICBlcnJvcjogKHRleHQpIC0+XHJcbiAgICBAbG9nLmVycm9yIFwiUEFSU0UgRVJST1IsIGxpbmUgI3tAbGluZU5vfTogI3t0ZXh0fVwiXHJcblxyXG4gIHJlc2V0OiAobmFtZSwgaW5kZW50KSAtPlxyXG4gICAgbmFtZSA/PSAnZGVmYXVsdCdcclxuICAgIGluZGVudCA/PSAwXHJcbiAgICBpZiBub3QgQG5hbWVkU3RhdGVzW25hbWVdXHJcbiAgICAgIEBlcnJvciBcImludmFsaWQgcmVzZXQgbmFtZTogI3tuYW1lfVwiXHJcbiAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgbmV3U3RhdGUgPSBjbG9uZShAbmFtZWRTdGF0ZXNbbmFtZV0pXHJcbiAgICBuZXdTdGF0ZS5faW5kZW50ID0gaW5kZW50XHJcbiAgICBAc3RhdGVTdGFjay5wdXNoIG5ld1N0YXRlXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuICBmbGF0dGVuOiAoKSAtPlxyXG4gICAgZmxhdHRlbmVkU3RhdGUgPSB7fVxyXG4gICAgZm9yIHN0YXRlIGluIEBzdGF0ZVN0YWNrXHJcbiAgICAgIGZvciBrZXkgb2Ygc3RhdGVcclxuICAgICAgICBmbGF0dGVuZWRTdGF0ZVtrZXldID0gc3RhdGVba2V5XVxyXG4gICAgcmV0dXJuIGZsYXR0ZW5lZFN0YXRlXHJcblxyXG4gIHRyYWNlOiAocHJlZml4KSAtPlxyXG4gICAgcHJlZml4ID89ICcnXHJcbiAgICBAbG9nLnZlcmJvc2UgXCJ0cmFjZTogI3twcmVmaXh9IFwiICsgSlNPTi5zdHJpbmdpZnkoQGZsYXR0ZW4oKSlcclxuXHJcbiAgY3JlYXRlT2JqZWN0OiAoaW5kZW50LCBkYXRhLi4uKSAtPlxyXG4gICAgICBAb2JqZWN0ID0geyBfaW5kZW50OiBpbmRlbnQgfVxyXG4gICAgICBmb3IgaSBpbiBbMC4uLmRhdGEubGVuZ3RoXSBieSAyXHJcbiAgICAgICAgQG9iamVjdFtkYXRhW2ldXSA9IGRhdGFbaSsxXVxyXG4gICAgICBAb2JqZWN0U2NvcGVSZWFkeSA9IHRydWVcclxuXHJcbiAgICAgIGlmIEBvYmplY3QuX3R5cGUgPT0gJ2xvb3AnXHJcbiAgICAgICAgQG9iamVjdC5fcGF0dGVybnMgPSBbXVxyXG5cclxuICAgICAgaWYgQG9iamVjdC5fdHlwZSA9PSAndHJhY2snXHJcbiAgICAgICAgQG9iamVjdC5fcGF0dGVybnMgPSBbXVxyXG5cclxuICAgICAgaWYgQG9iamVjdC5fbmFtZVxyXG4gICAgICAgIEBsYXN0T2JqZWN0ID0gQG9iamVjdC5fbmFtZVxyXG4gICAgICAgIGxvZ0RlYnVnIFwiY3JlYXRlT2JqZWN0WyN7aW5kZW50fV06IFwiLCBAbGFzdE9iamVjdFxyXG5cclxuICBmaW5pc2hPYmplY3Q6IC0+XHJcbiAgICBpZiBAb2JqZWN0XHJcbiAgICAgIHN0YXRlID0gQGZsYXR0ZW4oKVxyXG4gICAgICBmb3Iga2V5IG9mIEBvYmplY3RLZXlzW0BvYmplY3QuX3R5cGVdXHJcbiAgICAgICAgZXhwZWN0ZWRUeXBlID0gQG9iamVjdEtleXNbQG9iamVjdC5fdHlwZV1ba2V5XVxyXG4gICAgICAgIGlmIHN0YXRlW2tleV0/XHJcbiAgICAgICAgICB2ID0gc3RhdGVba2V5XVxyXG4gICAgICAgICAgQG9iamVjdFtrZXldID0gc3dpdGNoIGV4cGVjdGVkVHlwZVxyXG4gICAgICAgICAgICB3aGVuICdpbnQnIHRoZW4gcGFyc2VJbnQodilcclxuICAgICAgICAgICAgd2hlbiAnZmxvYXQnIHRoZW4gcGFyc2VGbG9hdCh2KVxyXG4gICAgICAgICAgICB3aGVuICdib29sJyB0aGVuIHBhcnNlQm9vbCh2KVxyXG4gICAgICAgICAgICBlbHNlIHZcclxuXHJcbiAgICAgIGxvZ0RlYnVnIFwiZmluaXNoT2JqZWN0OiBcIiwgQG9iamVjdFxyXG4gICAgICBAb2JqZWN0c1tAb2JqZWN0Ll9uYW1lXSA9IEBvYmplY3RcclxuICAgIEBvYmplY3QgPSBudWxsXHJcblxyXG4gIGNyZWF0aW5nT2JqZWN0VHlwZTogKHR5cGUpIC0+XHJcbiAgICByZXR1cm4gZmFsc2UgaWYgbm90IEBvYmplY3RcclxuICAgIHJldHVybiBmYWxzZSBpZiBub3QgQG9iamVjdC5fdHlwZSA9PSB0eXBlXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuICB1cGRhdGVGYWtlSW5kZW50czogKGluZGVudCkgLT5cclxuICAgIHJldHVybiBpZiBpbmRlbnQgPj0gMTAwMFxyXG4gICAgaSA9IEBzdGF0ZVN0YWNrLmxlbmd0aCAtIDFcclxuICAgIHdoaWxlIGkgPiAwXHJcbiAgICAgIHByZXZJbmRlbnQgPSBAc3RhdGVTdGFja1tpIC0gMV0uX2luZGVudFxyXG4gICAgICBpZiAoQHN0YXRlU3RhY2tbaV0uX2luZGVudCA+IDEwMDApIGFuZCAocHJldkluZGVudCA8IGluZGVudClcclxuICAgICAgICBsb2dEZWJ1ZyBcInVwZGF0ZUZha2VJbmRlbnRzOiBjaGFuZ2luZyBzdGFjayBpbmRlbnQgI3tpfSBmcm9tICN7QHN0YXRlU3RhY2tbaV0uX2luZGVudH0gdG8gI3tpbmRlbnR9XCJcclxuICAgICAgICBAc3RhdGVTdGFja1tpXS5faW5kZW50ID0gaW5kZW50XHJcbiAgICAgIGktLVxyXG5cclxuICBwdXNoU3RhdGU6IChpbmRlbnQpIC0+XHJcbiAgICBpbmRlbnQgPz0gMFxyXG4gICAgbG9nRGVidWcgXCJwdXNoU3RhdGUoI3tpbmRlbnR9KVwiXHJcbiAgICBAdXBkYXRlRmFrZUluZGVudHMgaW5kZW50XHJcbiAgICBAc3RhdGVTdGFjay5wdXNoIHsgX2luZGVudDogaW5kZW50IH1cclxuICAgIHJldHVybiB0cnVlXHJcblxyXG4gIHBvcFN0YXRlOiAoaW5kZW50KSAtPlxyXG4gICAgbG9nRGVidWcgXCJwb3BTdGF0ZSgje2luZGVudH0pXCJcclxuICAgIGlmIEBvYmplY3Q/XHJcbiAgICAgIGlmIGluZGVudCA8PSBAb2JqZWN0Ll9pbmRlbnRcclxuICAgICAgICBAZmluaXNoT2JqZWN0KClcclxuXHJcbiAgICBAdXBkYXRlRmFrZUluZGVudHMgaW5kZW50XHJcblxyXG4gICAgbG9vcFxyXG4gICAgICB0b3BJbmRlbnQgPSBAZ2V0VG9wSW5kZW50KClcclxuICAgICAgbG9nRGVidWcgXCJwb3BTdGF0ZSgje2luZGVudH0pIHRvcCBpbmRlbnQgI3t0b3BJbmRlbnR9XCJcclxuICAgICAgYnJlYWsgaWYgaW5kZW50ID09IHRvcEluZGVudFxyXG4gICAgICBpZiBAc3RhdGVTdGFjay5sZW5ndGggPCAyXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgIGxvZ0RlYnVnIFwicG9wU3RhdGUoI3tpbmRlbnR9KSBwb3BwaW5nIGluZGVudCAje3RvcEluZGVudH1cIlxyXG4gICAgICBAc3RhdGVTdGFjay5wb3AoKVxyXG4gICAgcmV0dXJuIHRydWVcclxuXHJcbiAgcGFyc2VQYXR0ZXJuOiAocGF0dGVybikgLT5cclxuICAgIG92ZXJyaWRlTGVuZ3RoID0gQGhhc0NhcGl0YWxMZXR0ZXJzUmVnZXgudGVzdChwYXR0ZXJuKVxyXG4gICAgaSA9IDBcclxuICAgIHNvdW5kcyA9IFtdXHJcbiAgICB3aGlsZSBpIDwgcGF0dGVybi5sZW5ndGhcclxuICAgICAgYyA9IHBhdHRlcm5baV1cclxuICAgICAgaWYgYyAhPSAnLidcclxuICAgICAgICBzeW1ib2wgPSBjLnRvTG93ZXJDYXNlKClcclxuICAgICAgICBzb3VuZCA9IHsgb2Zmc2V0OiBpIH1cclxuICAgICAgICBpZiBAaXNOb3RlUmVnZXgudGVzdChjKVxyXG4gICAgICAgICAgc291bmQubm90ZSA9IHN5bWJvbFxyXG4gICAgICAgIGlmIG92ZXJyaWRlTGVuZ3RoXHJcbiAgICAgICAgICBsZW5ndGggPSAxXHJcbiAgICAgICAgICBsb29wXHJcbiAgICAgICAgICAgIG5leHQgPSBwYXR0ZXJuW2krMV1cclxuICAgICAgICAgICAgaWYgbmV4dCA9PSBzeW1ib2xcclxuICAgICAgICAgICAgICBsZW5ndGgrK1xyXG4gICAgICAgICAgICAgIGkrK1xyXG4gICAgICAgICAgICAgIGlmIGkgPT0gcGF0dGVybi5sZW5ndGhcclxuICAgICAgICAgICAgICAgIGJyZWFrXHJcbiAgICAgICAgICAgIGVsc2VcclxuICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgc291bmQubGVuZ3RoID0gbGVuZ3RoXHJcbiAgICAgICAgc291bmRzLnB1c2ggc291bmRcclxuICAgICAgaSsrXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBwYXR0ZXJuOiBwYXR0ZXJuXHJcbiAgICAgIGxlbmd0aDogcGF0dGVybi5sZW5ndGhcclxuICAgICAgc291bmRzOiBzb3VuZHNcclxuICAgIH1cclxuXHJcbiAgZ2V0VG9wSW5kZW50OiAtPlxyXG4gICAgcmV0dXJuIEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdLl9pbmRlbnRcclxuXHJcbiAgcHJvY2Vzc1Rva2VuczogKHRva2VucywgaW5kZW50KSAtPlxyXG4gICAgY21kID0gdG9rZW5zWzBdLnRvTG93ZXJDYXNlKClcclxuICAgIGlmIGNtZCA9PSAncmVzZXQnXHJcbiAgICAgIGlmIG5vdCBAcmVzZXQodG9rZW5zWzFdLCBpbmRlbnQpXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICBlbHNlIGlmIGNtZCA9PSAnc2VjdGlvbidcclxuICAgICAgQG9iamVjdFNjb3BlUmVhZHkgPSB0cnVlXHJcbiAgICBlbHNlIGlmIEBpc09iamVjdFR5cGUoY21kKVxyXG4gICAgICBAY3JlYXRlT2JqZWN0IGluZGVudCwgJ190eXBlJywgY21kLCAnX25hbWUnLCB0b2tlbnNbMV1cclxuICAgIGVsc2UgaWYgY21kID09ICdwYXR0ZXJuJ1xyXG4gICAgICBpZiBub3QgKEBjcmVhdGluZ09iamVjdFR5cGUoJ2xvb3AnKSBvciBAY3JlYXRpbmdPYmplY3RUeXBlKCd0cmFjaycpKVxyXG4gICAgICAgIEBlcnJvciBcInVuZXhwZWN0ZWQgcGF0dGVybiBjb21tYW5kXCJcclxuICAgICAgICByZXR1cm4gZmFsc2VcclxuXHJcbiAgICAgIHBhdHRlcm4gPSBAcGFyc2VQYXR0ZXJuKHRva2Vuc1syXSlcclxuICAgICAgcGF0dGVybi5zcmMgPSB0b2tlbnNbMV1cclxuICAgICAgQG9iamVjdC5fcGF0dGVybnMucHVzaCBwYXR0ZXJuXHJcbiAgICBlbHNlIGlmIGNtZCA9PSAnYWRzcidcclxuICAgICAgQHN0YXRlU3RhY2tbQHN0YXRlU3RhY2subGVuZ3RoIC0gMV1bY21kXSA9XHJcbiAgICAgICAgYTogcGFyc2VGbG9hdCh0b2tlbnNbMV0pXHJcbiAgICAgICAgZDogcGFyc2VGbG9hdCh0b2tlbnNbMl0pXHJcbiAgICAgICAgczogcGFyc2VGbG9hdCh0b2tlbnNbM10pXHJcbiAgICAgICAgcjogcGFyc2VGbG9hdCh0b2tlbnNbNF0pXHJcbiAgICBlbHNlIGlmIGNtZCA9PSAncmV2ZXJiJ1xyXG4gICAgICBAc3RhdGVTdGFja1tAc3RhdGVTdGFjay5sZW5ndGggLSAxXVtjbWRdID1cclxuICAgICAgICBkZWxheTogcGFyc2VJbnQodG9rZW5zWzFdKVxyXG4gICAgICAgIGRlY2F5OiBwYXJzZUZsb2F0KHRva2Vuc1syXSlcclxuICAgIGVsc2VcclxuICAgICAgIyBUaGUgYm9yaW5nIHJlZ3VsYXIgY2FzZTogc3Rhc2ggb2ZmIHRoaXMgdmFsdWVcclxuICAgICAgaWYgQGxlYWRpbmdVbmRlcnNjb3JlUmVnZXgudGVzdChjbWQpXHJcbiAgICAgICAgQGVycm9yIFwiY2Fubm90IHNldCBpbnRlcm5hbCBuYW1lcyAodW5kZXJzY29yZSBwcmVmaXgpXCJcclxuICAgICAgICByZXR1cm4gZmFsc2VcclxuICAgICAgQHN0YXRlU3RhY2tbQHN0YXRlU3RhY2subGVuZ3RoIC0gMV1bY21kXSA9IHRva2Vuc1sxXVxyXG5cclxuICAgIHJldHVybiB0cnVlXHJcblxyXG4gIHBhcnNlOiAodGV4dCkgLT5cclxuICAgIGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJylcclxuICAgIEBsaW5lTm8gPSAwXHJcbiAgICBmb3IgbGluZSBpbiBsaW5lc1xyXG4gICAgICBAbGluZU5vKytcclxuICAgICAgbGluZSA9IGxpbmUucmVwbGFjZSgvKFxcclxcbnxcXG58XFxyKS9nbSxcIlwiKSAjIHN0cmlwIG5ld2xpbmVzXHJcbiAgICAgIGxpbmUgPSBAY29tbWVudFJlZ2V4LmV4ZWMobGluZSlbMV0gICAgICAgIyBzdHJpcCBjb21tZW50cyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZVxyXG4gICAgICBjb250aW51ZSBpZiBAb25seVdoaXRlc3BhY2VSZWdleC50ZXN0KGxpbmUpXHJcbiAgICAgIFtfLCBpbmRlbnRUZXh0LCBsaW5lXSA9IEBpbmRlbnRSZWdleC5leGVjIGxpbmVcclxuICAgICAgaW5kZW50ID0gY291bnRJbmRlbnQgaW5kZW50VGV4dFxyXG4gICAgICBsaW5lT2JqcyA9IFtdXHJcblxyXG4gICAgICBhcnJvd1NlY3Rpb25zID0gbGluZS5zcGxpdCgvXFxzKi0+XFxzKi8pXHJcbiAgICAgIGZvciBhcnJvd1NlY3Rpb24gaW4gYXJyb3dTZWN0aW9uc1xyXG4gICAgICAgIHNlbWlTZWN0aW9ucyA9IGFycm93U2VjdGlvbi5zcGxpdCgvXFxzKjtcXHMqLylcclxuICAgICAgICBmb3Igc2VtaVNlY3Rpb24gaW4gc2VtaVNlY3Rpb25zXHJcbiAgICAgICAgICBsaW5lT2Jqcy5wdXNoIHtcclxuICAgICAgICAgICAgICBpbmRlbnQ6IGluZGVudFxyXG4gICAgICAgICAgICAgIGxpbmU6IHNlbWlTZWN0aW9uXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICBpbmRlbnQgKz0gMTAwMFxyXG5cclxuICAgICAgZm9yIG9iaiBpbiBsaW5lT2Jqc1xyXG4gICAgICAgIGxvZ0RlYnVnIFwiaGFuZGxpbmcgaW5kZW50OiBcIiArIEpTT04uc3RyaW5naWZ5KG9iailcclxuICAgICAgICB0b3BJbmRlbnQgPSBAZ2V0VG9wSW5kZW50KClcclxuICAgICAgICBpZiBvYmouaW5kZW50ID4gdG9wSW5kZW50XHJcbiAgICAgICAgICBAcHVzaFN0YXRlKG9iai5pbmRlbnQpXHJcbiAgICAgICAgZWxzZVxyXG4gICAgICAgICAgaWYgbm90IEBwb3BTdGF0ZShvYmouaW5kZW50KVxyXG4gICAgICAgICAgICBAbG9nLmVycm9yIFwidW5leHBlY3RlZCBvdXRkZW50XCJcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlXHJcblxyXG4gICAgICAgIGxvZ0RlYnVnIFwicHJvY2Vzc2luZzogXCIgKyBKU09OLnN0cmluZ2lmeShvYmopXHJcbiAgICAgICAgaWYgbm90IEBwcm9jZXNzVG9rZW5zKG9iai5saW5lLnNwbGl0KC9cXHMrLyksIG9iai5pbmRlbnQpXHJcbiAgICAgICAgICByZXR1cm4gZmFsc2VcclxuXHJcbiAgICBAcG9wU3RhdGUoMClcclxuICAgIHJldHVybiB0cnVlXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBSZW5kZXJlclxyXG5cclxuIyBJbiBhbGwgY2FzZXMgd2hlcmUgYSByZW5kZXJlZCBzb3VuZCBpcyBnZW5lcmF0ZWQsIHRoZXJlIGFyZSBhY3R1YWxseSB0d28gbGVuZ3Roc1xyXG4jIGFzc29jaWF0ZWQgd2l0aCB0aGUgc291bmQuIFwic291bmQubGVuZ3RoXCIgaXMgdGhlIFwiZXhwZWN0ZWRcIiBsZW5ndGgsIHdpdGggcmVnYXJkc1xyXG4jIHRvIHRoZSB0eXBlZC1pbiBkdXJhdGlvbiBmb3IgaXQgb3IgZm9yIGRldGVybWluaW5nIGxvb3Agb2ZmZXRzLiBUaGUgb3RoZXIgbGVuZ3RoXHJcbiMgaXMgdGhlIHNvdW5kLnNhbXBsZXMubGVuZ3RoIChhbHNvIGtub3duIGFzIHRoZSBcIm92ZXJmbG93IGxlbmd0aFwiKSwgd2hpY2ggaXMgdGhlXHJcbiMgbGVuZ3RoIHRoYXQgYWNjb3VudHMgZm9yIHRoaW5ncyBsaWtlIHJldmVyYiBvciBhbnl0aGluZyBlbHNlIHRoYXQgd291bGQgY2F1c2UgdGhlXHJcbiMgc291bmQgdG8gc3BpbGwgaW50byB0aGUgbmV4dCBsb29wL3RyYWNrLiBUaGlzIGFsbG93cyBmb3Igc2VhbWxlc3MgbG9vcHMgdGhhdCBjYW5cclxuIyBwbGF5IGEgbG9uZyBzb3VuZCBhcyB0aGUgZW5kIG9mIGEgcGF0dGVybiwgYW5kIGl0J2xsIGNsZWFubHkgbWl4IGludG8gdGhlIGJlZ2lubmluZ1xyXG4jIG9mIHRoZSBuZXh0IHBhdHRlcm4uXHJcblxyXG5jbGFzcyBSZW5kZXJlclxyXG4gIGNvbnN0cnVjdG9yOiAoQGxvZywgQHNhbXBsZVJhdGUsIEByZWFkTG9jYWxGaWxlcywgQG9iamVjdHMpIC0+XHJcbiAgICBAc291bmRDYWNoZSA9IHt9XHJcblxyXG4gIGVycm9yOiAodGV4dCkgLT5cclxuICAgIEBsb2cuZXJyb3IgXCJSRU5ERVIgRVJST1I6ICN7dGV4dH1cIlxyXG5cclxuICBnZW5lcmF0ZUVudmVsb3BlOiAoYWRzciwgbGVuZ3RoKSAtPlxyXG4gICAgZW52ZWxvcGUgPSBBcnJheShsZW5ndGgpXHJcbiAgICBBdG9EID0gTWF0aC5mbG9vcihhZHNyLmEgKiBsZW5ndGgpXHJcbiAgICBEdG9TID0gTWF0aC5mbG9vcihhZHNyLmQgKiBsZW5ndGgpXHJcbiAgICBTdG9SID0gTWF0aC5mbG9vcihhZHNyLnIgKiBsZW5ndGgpXHJcbiAgICBhdHRhY2tMZW4gPSBBdG9EXHJcbiAgICBkZWNheUxlbiA9IER0b1MgLSBBdG9EXHJcbiAgICBzdXN0YWluTGVuID0gU3RvUiAtIER0b1NcclxuICAgIHJlbGVhc2VMZW4gPSBsZW5ndGggLSBTdG9SXHJcbiAgICBzdXN0YWluID0gYWRzci5zXHJcbiAgICBwZWFrU3VzdGFpbkRlbHRhID0gMS4wIC0gc3VzdGFpblxyXG4gICAgZm9yIGkgaW4gWzAuLi5hdHRhY2tMZW5dXHJcbiAgICAgICMgQXR0YWNrXHJcbiAgICAgIGVudmVsb3BlW2ldID0gaSAvIGF0dGFja0xlblxyXG4gICAgZm9yIGkgaW4gWzAuLi5kZWNheUxlbl1cclxuICAgICAgIyBEZWNheVxyXG4gICAgICBlbnZlbG9wZVtBdG9EICsgaV0gPSAxLjAgLSAocGVha1N1c3RhaW5EZWx0YSAqIChpIC8gZGVjYXlMZW4pKVxyXG4gICAgZm9yIGkgaW4gWzAuLi5zdXN0YWluTGVuXVxyXG4gICAgICAjIFN1c3RhaW5cclxuICAgICAgZW52ZWxvcGVbRHRvUyArIGldID0gc3VzdGFpblxyXG4gICAgZm9yIGkgaW4gWzAuLi5yZWxlYXNlTGVuXVxyXG4gICAgICAjIFJlbGVhc2VcclxuICAgICAgZW52ZWxvcGVbU3RvUiArIGldID0gc3VzdGFpbiAtIChzdXN0YWluICogKGkgLyByZWxlYXNlTGVuKSlcclxuICAgIHJldHVybiBlbnZlbG9wZVxyXG5cclxuICByZW5kZXJUb25lOiAodG9uZU9iaiwgb3ZlcnJpZGVzKSAtPlxyXG4gICAgb2Zmc2V0ID0gMFxyXG4gICAgYW1wbGl0dWRlID0gMTAwMDBcclxuICAgIGlmIG92ZXJyaWRlcy5sZW5ndGggPiAwXHJcbiAgICAgIGxlbmd0aCA9IG92ZXJyaWRlcy5sZW5ndGhcclxuICAgIGVsc2VcclxuICAgICAgbGVuZ3RoID0gTWF0aC5mbG9vcih0b25lT2JqLmR1cmF0aW9uICogQHNhbXBsZVJhdGUgLyAxMDAwKVxyXG4gICAgc2FtcGxlcyA9IEFycmF5KGxlbmd0aClcclxuICAgIEEgPSAyMDBcclxuICAgIEIgPSAwLjVcclxuICAgIGlmIG92ZXJyaWRlcy5ub3RlP1xyXG4gICAgICBmcmVxID0gZmluZEZyZXEodG9uZU9iai5vY3RhdmUsIG92ZXJyaWRlcy5ub3RlKVxyXG4gICAgZWxzZSBpZiB0b25lT2JqLmZyZXE/XHJcbiAgICAgIGZyZXEgPSB0b25lT2JqLmZyZXFcclxuICAgIGVsc2VcclxuICAgICAgZnJlcSA9IGZpbmRGcmVxKHRvbmVPYmoub2N0YXZlLCB0b25lT2JqLm5vdGUpXHJcbiAgICBlbnZlbG9wZSA9IEBnZW5lcmF0ZUVudmVsb3BlKHRvbmVPYmouYWRzciwgbGVuZ3RoKVxyXG4gICAgZm9yIGkgaW4gWzAuLi5sZW5ndGhdXHJcbiAgICAgIHBlcmlvZCA9IEBzYW1wbGVSYXRlIC8gZnJlcVxyXG4gICAgICBzaW5lID0gTWF0aC5zaW4ob2Zmc2V0ICsgaSAvIHBlcmlvZCAqIDIgKiBNYXRoLlBJKVxyXG4gICAgICAjIGlmKHRvbmVPYmoud2F2ID09IFwic3F1YXJlXCIpXHJcbiAgICAgICMgICBzaW5lID0gKHNpbmUgPiAwKSA/IDEgOiAtMVxyXG4gICAgICBzYW1wbGVzW2ldID0gc2luZSAqIGFtcGxpdHVkZSAqIGVudmVsb3BlW2ldXHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc2FtcGxlczogc2FtcGxlc1xyXG4gICAgICBsZW5ndGg6IHNhbXBsZXMubGVuZ3RoXHJcbiAgICB9XHJcblxyXG4gIHJlbmRlclNhbXBsZTogKHNhbXBsZU9iaiwgb3ZlcnJpZGVzKSAtPlxyXG4gICAgdmlldyA9IG51bGxcclxuXHJcbiAgICBpZiBAcmVhZExvY2FsRmlsZXNcclxuICAgICAgZGF0YSA9IGZzLnJlYWRGaWxlU3luYyBzYW1wbGVPYmouc3JjXHJcbiAgICAgIHZpZXcgPSBuZXcgakRhdGFWaWV3KGRhdGEsIDAsIGRhdGEubGVuZ3RoLCB0cnVlKVxyXG4gICAgZWxzZVxyXG4gICAgICAkLmFqYXgge1xyXG4gICAgICAgIHVybDogc2FtcGxlT2JqLnNyY1xyXG4gICAgICAgIG1pbWVUeXBlOiAndGV4dC9wbGFpbjsgY2hhcnNldD14LXVzZXItZGVmaW5lZCdcclxuICAgICAgICBzdWNjZXNzOiAoZGF0YSkgLT5cclxuICAgICAgICAgIHZpZXcgPSBuZXcgakRhdGFWaWV3KGRhdGEsIDAsIGRhdGEubGVuZ3RoLCB0cnVlKVxyXG4gICAgICAgIGFzeW5jOiBmYWxzZVxyXG4gICAgICB9XHJcblxyXG4gICAgaWYgbm90IHZpZXdcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzYW1wbGVzOiBbXVxyXG4gICAgICAgIGxlbmd0aDogMFxyXG4gICAgICB9XHJcblxyXG4gICAgIyBza2lwIHRoZSBmaXJzdCA0MCBieXRlc1xyXG4gICAgdmlldy5zZWVrKDQwKVxyXG4gICAgc3ViY2h1bmsyU2l6ZSA9IHZpZXcuZ2V0SW50MzIoKVxyXG4gICAgc2FtcGxlcyA9IFtdXHJcbiAgICB3aGlsZSB2aWV3LnRlbGwoKSsxIDwgdmlldy5ieXRlTGVuZ3RoXHJcbiAgICAgIHNhbXBsZXMucHVzaCB2aWV3LmdldEludDE2KClcclxuXHJcbiAgICBvdmVycmlkZU5vdGUgPSBpZiBvdmVycmlkZXMubm90ZSB0aGVuIG92ZXJyaWRlcy5ub3RlIGVsc2Ugc2FtcGxlT2JqLm5vdGVcclxuICAgIGlmIChvdmVycmlkZU5vdGUgIT0gc2FtcGxlT2JqLnNyY25vdGUpIG9yIChzYW1wbGVPYmoub2N0YXZlICE9IHNhbXBsZU9iai5zcmNvY3RhdmUpXHJcbiAgICAgIG9sZGZyZXEgPSBmaW5kRnJlcShzYW1wbGVPYmouc3Jjb2N0YXZlLCBzYW1wbGVPYmouc3Jjbm90ZSlcclxuICAgICAgbmV3ZnJlcSA9IGZpbmRGcmVxKHNhbXBsZU9iai5vY3RhdmUsIG92ZXJyaWRlTm90ZSlcclxuXHJcbiAgICAgIGZhY3RvciA9IG9sZGZyZXEgLyBuZXdmcmVxXHJcbiAgICAgICMgQGxvZy52ZXJib3NlIFwib2xkOiAje29sZGZyZXF9LCBuZXc6ICN7bmV3ZnJlcX0sIGZhY3RvcjogI3tmYWN0b3J9XCJcclxuXHJcbiAgICAgICMgVE9ETzogUHJvcGVybHkgcmVzYW1wbGUgaGVyZSB3aXRoIHNvbWV0aGluZyBvdGhlciB0aGFuIFwibmVhcmVzdCBuZWlnaGJvclwiXHJcbiAgICAgIHJlbGVuZ3RoID0gTWF0aC5mbG9vcihzYW1wbGVzLmxlbmd0aCAqIGZhY3RvcilcclxuICAgICAgcmVzYW1wbGVzID0gQXJyYXkocmVsZW5ndGgpXHJcbiAgICAgIGZvciBpIGluIFswLi4ucmVsZW5ndGhdXHJcbiAgICAgICAgcmVzYW1wbGVzW2ldID0gMFxyXG4gICAgICBmb3IgaSBpbiBbMC4uLnJlbGVuZ3RoXVxyXG4gICAgICAgIHJlc2FtcGxlc1tpXSA9IHNhbXBsZXNbTWF0aC5mbG9vcihpIC8gZmFjdG9yKV1cclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc2FtcGxlczogcmVzYW1wbGVzXHJcbiAgICAgICAgbGVuZ3RoOiByZXNhbXBsZXMubGVuZ3RoXHJcbiAgICAgIH1cclxuICAgIGVsc2VcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzYW1wbGVzOiBzYW1wbGVzXHJcbiAgICAgICAgbGVuZ3RoOiBzYW1wbGVzLmxlbmd0aFxyXG4gICAgICB9XHJcblxyXG4gIHJlbmRlckxvb3A6IChsb29wT2JqKSAtPlxyXG4gICAgYmVhdENvdW50ID0gMFxyXG4gICAgZm9yIHBhdHRlcm4gaW4gbG9vcE9iai5fcGF0dGVybnNcclxuICAgICAgaWYgYmVhdENvdW50IDwgcGF0dGVybi5sZW5ndGhcclxuICAgICAgICBiZWF0Q291bnQgPSBwYXR0ZXJuLmxlbmd0aFxyXG5cclxuICAgIHNhbXBsZXNQZXJCZWF0ID0gQHNhbXBsZVJhdGUgLyAobG9vcE9iai5icG0gLyA2MCkgLyA0XHJcbiAgICB0b3RhbExlbmd0aCA9IHNhbXBsZXNQZXJCZWF0ICogYmVhdENvdW50XHJcbiAgICBvdmVyZmxvd0xlbmd0aCA9IHRvdGFsTGVuZ3RoXHJcblxyXG4gICAgZm9yIHBhdHRlcm4gaW4gbG9vcE9iai5fcGF0dGVybnNcclxuICAgICAgc2VjdGlvbkNvdW50ID0gcGF0dGVybi5sZW5ndGggLyAxNlxyXG4gICAgICBvZmZzZXRMZW5ndGggPSBNYXRoLmZsb29yKHRvdGFsTGVuZ3RoIC8gMTYgLyBzZWN0aW9uQ291bnQpXHJcbiAgICAgIGZvciBzb3VuZCBpbiBwYXR0ZXJuLnNvdW5kc1xyXG4gICAgICAgIG92ZXJyaWRlcyA9IHt9XHJcbiAgICAgICAgaWYgc291bmQubGVuZ3RoID4gMFxyXG4gICAgICAgICAgb3ZlcnJpZGVzLmxlbmd0aCA9IHNvdW5kLmxlbmd0aCAqIG9mZnNldExlbmd0aFxyXG4gICAgICAgIGlmIHNvdW5kLm5vdGU/XHJcbiAgICAgICAgICBvdmVycmlkZXMubm90ZSA9IHNvdW5kLm5vdGVcclxuICAgICAgICBzb3VuZC5fcmVuZGVyID0gQHJlbmRlcihwYXR0ZXJuLnNyYywgb3ZlcnJpZGVzKVxyXG4gICAgICAgIGVuZCA9IChzb3VuZC5vZmZzZXQgKiBvZmZzZXRMZW5ndGgpICsgc291bmQuX3JlbmRlci5zYW1wbGVzLmxlbmd0aFxyXG4gICAgICAgIGlmIG92ZXJmbG93TGVuZ3RoIDwgZW5kXHJcbiAgICAgICAgICBvdmVyZmxvd0xlbmd0aCA9IGVuZFxyXG5cclxuICAgIHNhbXBsZXMgPSBBcnJheShvdmVyZmxvd0xlbmd0aClcclxuICAgIGZvciBpIGluIFswLi4ub3ZlcmZsb3dMZW5ndGhdXHJcbiAgICAgIHNhbXBsZXNbaV0gPSAwXHJcblxyXG4gICAgZm9yIHBhdHRlcm4gaW4gbG9vcE9iai5fcGF0dGVybnNcclxuICAgICAgc2VjdGlvbkNvdW50ID0gcGF0dGVybi5sZW5ndGggLyAxNlxyXG4gICAgICBvZmZzZXRMZW5ndGggPSBNYXRoLmZsb29yKHRvdGFsTGVuZ3RoIC8gMTYgLyBzZWN0aW9uQ291bnQpXHJcblxyXG4gICAgICBwYXR0ZXJuU2FtcGxlcyA9IEFycmF5KG92ZXJmbG93TGVuZ3RoKVxyXG4gICAgICBmb3IgaSBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxyXG4gICAgICAgIHBhdHRlcm5TYW1wbGVzW2ldID0gMFxyXG5cclxuICAgICAgZm9yIHNvdW5kIGluIHBhdHRlcm4uc291bmRzXHJcbiAgICAgICAgc3JjU291bmQgPSBzb3VuZC5fcmVuZGVyXHJcblxyXG4gICAgICAgIG9iaiA9IEBnZXRPYmplY3QocGF0dGVybi5zcmMpXHJcbiAgICAgICAgb2Zmc2V0ID0gc291bmQub2Zmc2V0ICogb2Zmc2V0TGVuZ3RoXHJcbiAgICAgICAgY29weUxlbiA9IHNyY1NvdW5kLnNhbXBsZXMubGVuZ3RoXHJcbiAgICAgICAgaWYgKG9mZnNldCArIGNvcHlMZW4pID4gb3ZlcmZsb3dMZW5ndGhcclxuICAgICAgICAgIGNvcHlMZW4gPSBvdmVyZmxvd0xlbmd0aCAtIG9mZnNldFxyXG5cclxuICAgICAgICBpZiBvYmouY2xpcFxyXG4gICAgICAgICAgZmFkZUNsaXAgPSAyMDAgIyBmYWRlIG91dCBvdmVyIHRoaXMgbWFueSBzYW1wbGVzIHByaW9yIHRvIGEgY2xpcCB0byBhdm9pZCBhIHBvcFxyXG4gICAgICAgICAgaWYgb2Zmc2V0ID4gZmFkZUNsaXBcclxuICAgICAgICAgICAgZm9yIGogaW4gWzAuLi5mYWRlQ2xpcF1cclxuICAgICAgICAgICAgICB2ID0gcGF0dGVyblNhbXBsZXNbb2Zmc2V0IC0gZmFkZUNsaXAgKyBqXVxyXG4gICAgICAgICAgICAgIHBhdHRlcm5TYW1wbGVzW29mZnNldCAtIGZhZGVDbGlwICsgal0gPSBNYXRoLmZsb29yKHYgKiAoKGZhZGVDbGlwIC0gaikgLyBmYWRlQ2xpcCkpXHJcbiAgICAgICAgICBmb3IgaiBpbiBbb2Zmc2V0Li4ub3ZlcmZsb3dMZW5ndGhdXHJcbiAgICAgICAgICAgICMgY2xlYW4gb3V0IHRoZSByZXN0IG9mIHRoZSBzb3VuZCB0byBlbnN1cmUgdGhhdCB0aGUgcHJldmlvdXMgb25lICh3aGljaCBjb3VsZCBiZSBsb25nZXIpIHdhcyBmdWxseSBjbGlwcGVkXHJcbiAgICAgICAgICAgIHBhdHRlcm5TYW1wbGVzW2pdID0gMFxyXG4gICAgICAgICAgZm9yIGogaW4gWzAuLi5jb3B5TGVuXVxyXG4gICAgICAgICAgICBwYXR0ZXJuU2FtcGxlc1tvZmZzZXQgKyBqXSA9IHNyY1NvdW5kLnNhbXBsZXNbal1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICBmb3IgaiBpbiBbMC4uLmNvcHlMZW5dXHJcbiAgICAgICAgICAgIHBhdHRlcm5TYW1wbGVzW29mZnNldCArIGpdICs9IHNyY1NvdW5kLnNhbXBsZXNbal1cclxuXHJcbiAgICAgICMgTm93IGNvcHkgdGhlIGNsaXBwZWQgcGF0dGVybiBpbnRvIHRoZSBmaW5hbCBsb29wXHJcbiAgICAgIGZvciBqIGluIFswLi4ub3ZlcmZsb3dMZW5ndGhdXHJcbiAgICAgICAgc2FtcGxlc1tqXSArPSBwYXR0ZXJuU2FtcGxlc1tqXVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHNhbXBsZXM6IHNhbXBsZXNcclxuICAgICAgbGVuZ3RoOiB0b3RhbExlbmd0aFxyXG4gICAgfVxyXG5cclxuICByZW5kZXJUcmFjazogKHRyYWNrT2JqKSAtPlxyXG4gICAgcGllY2VDb3VudCA9IDBcclxuICAgIGZvciBwYXR0ZXJuIGluIHRyYWNrT2JqLl9wYXR0ZXJuc1xyXG4gICAgICBpZiBwaWVjZUNvdW50IDwgcGF0dGVybi5wYXR0ZXJuLmxlbmd0aFxyXG4gICAgICAgIHBpZWNlQ291bnQgPSBwYXR0ZXJuLnBhdHRlcm4ubGVuZ3RoXHJcblxyXG4gICAgdG90YWxMZW5ndGggPSAwXHJcbiAgICBvdmVyZmxvd0xlbmd0aCA9IDBcclxuICAgIHBpZWNlVG90YWxMZW5ndGggPSBBcnJheShwaWVjZUNvdW50KVxyXG4gICAgcGllY2VPdmVyZmxvd0xlbmd0aCA9IEFycmF5KHBpZWNlQ291bnQpXHJcbiAgICBmb3IgcGllY2VJbmRleCBpbiBbMC4uLnBpZWNlQ291bnRdXHJcbiAgICAgIHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF0gPSAwXHJcbiAgICAgIHBpZWNlT3ZlcmZsb3dMZW5ndGhbcGllY2VJbmRleF0gPSAwXHJcbiAgICAgIGZvciBwYXR0ZXJuIGluIHRyYWNrT2JqLl9wYXR0ZXJuc1xyXG4gICAgICAgIGlmIChwaWVjZUluZGV4IDwgcGF0dGVybi5wYXR0ZXJuLmxlbmd0aCkgYW5kIChwYXR0ZXJuLnBhdHRlcm5bcGllY2VJbmRleF0gIT0gJy4nKVxyXG4gICAgICAgICAgc3JjU291bmQgPSBAcmVuZGVyKHBhdHRlcm4uc3JjKVxyXG4gICAgICAgICAgaWYgcGllY2VUb3RhbExlbmd0aFtwaWVjZUluZGV4XSA8IHNyY1NvdW5kLmxlbmd0aFxyXG4gICAgICAgICAgICBwaWVjZVRvdGFsTGVuZ3RoW3BpZWNlSW5kZXhdID0gc3JjU291bmQubGVuZ3RoXHJcbiAgICAgICAgICBpZiBwaWVjZU92ZXJmbG93TGVuZ3RoW3BpZWNlSW5kZXhdIDwgc3JjU291bmQuc2FtcGxlcy5sZW5ndGhcclxuICAgICAgICAgICAgcGllY2VPdmVyZmxvd0xlbmd0aFtwaWVjZUluZGV4XSA9IHNyY1NvdW5kLnNhbXBsZXMubGVuZ3RoXHJcbiAgICAgIHBvc3NpYmxlTWF4TGVuZ3RoID0gdG90YWxMZW5ndGggKyBwaWVjZU92ZXJmbG93TGVuZ3RoW3BpZWNlSW5kZXhdXHJcbiAgICAgIGlmIG92ZXJmbG93TGVuZ3RoIDwgcG9zc2libGVNYXhMZW5ndGhcclxuICAgICAgICBvdmVyZmxvd0xlbmd0aCA9IHBvc3NpYmxlTWF4TGVuZ3RoXHJcbiAgICAgIHRvdGFsTGVuZ3RoICs9IHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF1cclxuXHJcbiAgICBzYW1wbGVzID0gQXJyYXkob3ZlcmZsb3dMZW5ndGgpXHJcbiAgICBmb3IgaSBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxyXG4gICAgICBzYW1wbGVzW2ldID0gMFxyXG5cclxuICAgIGZvciBwYXR0ZXJuIGluIHRyYWNrT2JqLl9wYXR0ZXJuc1xyXG4gICAgICB0cmFja09mZnNldCA9IDBcclxuICAgICAgc3JjU291bmQgPSBAcmVuZGVyKHBhdHRlcm4uc3JjLCB7fSlcclxuICAgICAgZm9yIHBpZWNlSW5kZXggaW4gWzAuLi5waWVjZUNvdW50XVxyXG4gICAgICAgIGlmIChwaWVjZUluZGV4IDwgcGF0dGVybi5wYXR0ZXJuLmxlbmd0aCkgYW5kIChwYXR0ZXJuLnBhdHRlcm5bcGllY2VJbmRleF0gIT0gJy4nKVxyXG4gICAgICAgICAgY29weUxlbiA9IHNyY1NvdW5kLnNhbXBsZXMubGVuZ3RoXHJcbiAgICAgICAgICBpZiAodHJhY2tPZmZzZXQgKyBjb3B5TGVuKSA+IG92ZXJmbG93TGVuZ3RoXHJcbiAgICAgICAgICAgIGNvcHlMZW4gPSBvdmVyZmxvd0xlbmd0aCAtIHRyYWNrT2Zmc2V0XHJcbiAgICAgICAgICBmb3IgaiBpbiBbMC4uLmNvcHlMZW5dXHJcbiAgICAgICAgICAgIHNhbXBsZXNbdHJhY2tPZmZzZXQgKyBqXSArPSBzcmNTb3VuZC5zYW1wbGVzW2pdXHJcblxyXG4gICAgICAgIHRyYWNrT2Zmc2V0ICs9IHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzYW1wbGVzOiBzYW1wbGVzXHJcbiAgICAgIGxlbmd0aDogdG90YWxMZW5ndGhcclxuICAgIH1cclxuXHJcbiAgY2FsY0NhY2hlTmFtZTogKHR5cGUsIHdoaWNoLCBvdmVycmlkZXMpIC0+XHJcbiAgICBpZiAodHlwZSAhPSAndG9uZScpIGFuZCAodHlwZSAhPSAnc2FtcGxlJylcclxuICAgICAgcmV0dXJuIHdoaWNoXHJcblxyXG4gICAgbmFtZSA9IHdoaWNoXHJcbiAgICBpZiBvdmVycmlkZXMubm90ZVxyXG4gICAgICBuYW1lICs9IFwiL04je292ZXJyaWRlcy5ub3RlfVwiXHJcbiAgICBpZiBvdmVycmlkZXMubGVuZ3RoXHJcbiAgICAgIG5hbWUgKz0gXCIvTCN7b3ZlcnJpZGVzLmxlbmd0aH1cIlxyXG5cclxuICAgIHJldHVybiBuYW1lXHJcblxyXG4gIGdldE9iamVjdDogKHdoaWNoKSAtPlxyXG4gICAgb2JqZWN0ID0gQG9iamVjdHNbd2hpY2hdXHJcbiAgICBpZiBub3Qgb2JqZWN0XHJcbiAgICAgIEBlcnJvciBcIm5vIHN1Y2ggb2JqZWN0ICN7d2hpY2h9XCJcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIHJldHVybiBvYmplY3RcclxuXHJcbiAgcmVuZGVyOiAod2hpY2gsIG92ZXJyaWRlcykgLT5cclxuICAgIG9iamVjdCA9IEBnZXRPYmplY3Qod2hpY2gpXHJcbiAgICBpZiBub3Qgb2JqZWN0XHJcbiAgICAgIHJldHVybiBudWxsXHJcblxyXG4gICAgY2FjaGVOYW1lID0gQGNhbGNDYWNoZU5hbWUob2JqZWN0Ll90eXBlLCB3aGljaCwgb3ZlcnJpZGVzKVxyXG4gICAgaWYgQHNvdW5kQ2FjaGVbY2FjaGVOYW1lXVxyXG4gICAgICByZXR1cm4gQHNvdW5kQ2FjaGVbY2FjaGVOYW1lXVxyXG5cclxuICAgIHNvdW5kID0gc3dpdGNoIG9iamVjdC5fdHlwZVxyXG4gICAgICB3aGVuICd0b25lJyB0aGVuIEByZW5kZXJUb25lKG9iamVjdCwgb3ZlcnJpZGVzKVxyXG4gICAgICB3aGVuICdzYW1wbGUnIHRoZW4gQHJlbmRlclNhbXBsZShvYmplY3QsIG92ZXJyaWRlcylcclxuICAgICAgd2hlbiAnbG9vcCcgdGhlbiBAcmVuZGVyTG9vcChvYmplY3QpXHJcbiAgICAgIHdoZW4gJ3RyYWNrJyB0aGVuIEByZW5kZXJUcmFjayhvYmplY3QpXHJcbiAgICAgIGVsc2VcclxuICAgICAgICBAZXJyb3IgXCJ1bmtub3duIHR5cGUgI3tvYmplY3QuX3R5cGV9XCJcclxuICAgICAgICBudWxsXHJcblxyXG4gICAgIyBWb2x1bWVcclxuICAgIGlmIG9iamVjdC52b2x1bWU/IGFuZCAob2JqZWN0LnZvbHVtZSAhPSAxLjApXHJcbiAgICAgIGZvciBpIGluIFswLi4uc291bmQuc2FtcGxlcy5sZW5ndGhdXHJcbiAgICAgICAgc291bmQuc2FtcGxlc1tpXSAqPSBvYmplY3Qudm9sdW1lXHJcblxyXG4gICAgIyBSZXZlcmJcclxuICAgIGlmIG9iamVjdC5yZXZlcmI/IGFuZCAob2JqZWN0LnJldmVyYi5kZWxheSA+IDApXHJcbiAgICAgIGRlbGF5U2FtcGxlcyA9IE1hdGguZmxvb3Iob2JqZWN0LnJldmVyYi5kZWxheSAqIEBzYW1wbGVSYXRlIC8gMTAwMClcclxuICAgICAgaWYgc291bmQuc2FtcGxlcy5sZW5ndGggPiBkZWxheVNhbXBsZXNcclxuICAgICAgICB0b3RhbExlbmd0aCA9IHNvdW5kLnNhbXBsZXMubGVuZ3RoICsgKGRlbGF5U2FtcGxlcyAqIDgpICMgdGhpcyAqOCBpcyB0b3RhbGx5IHdyb25nLiBOZWVkcyBtb3JlIHRob3VnaHQuXHJcbiAgICAgICAgIyBAbG9nLnZlcmJvc2UgXCJyZXZlcmJpbmcgI3tjYWNoZU5hbWV9OiAje2RlbGF5U2FtcGxlc30uIGxlbmd0aCB1cGRhdGUgI3tzb3VuZC5zYW1wbGVzLmxlbmd0aH0gLT4gI3t0b3RhbExlbmd0aH1cIlxyXG4gICAgICAgIHNhbXBsZXMgPSBBcnJheSh0b3RhbExlbmd0aClcclxuICAgICAgICBmb3IgaSBpbiBbMC4uLnNvdW5kLnNhbXBsZXMubGVuZ3RoXVxyXG4gICAgICAgICAgc2FtcGxlc1tpXSA9IHNvdW5kLnNhbXBsZXNbaV1cclxuICAgICAgICBmb3IgaSBpbiBbc291bmQuc2FtcGxlcy5sZW5ndGguLi50b3RhbExlbmd0aF1cclxuICAgICAgICAgIHNhbXBsZXNbaV0gPSAwXHJcbiAgICAgICAgZm9yIGkgaW4gWzAuLi4odG90YWxMZW5ndGggLSBkZWxheVNhbXBsZXMpXVxyXG4gICAgICAgICAgc2FtcGxlc1tpICsgZGVsYXlTYW1wbGVzXSArPSBNYXRoLmZsb29yKHNhbXBsZXNbaV0gKiBvYmplY3QucmV2ZXJiLmRlY2F5KVxyXG4gICAgICAgIHNvdW5kLnNhbXBsZXMgPSBzYW1wbGVzXHJcblxyXG4gICAgQGxvZy52ZXJib3NlIFwiUmVuZGVyZWQgI3tjYWNoZU5hbWV9LlwiXHJcbiAgICBAc291bmRDYWNoZVtjYWNoZU5hbWVdID0gc291bmRcclxuICAgIHJldHVybiBzb3VuZFxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgRXhwb3J0c1xyXG5cclxucmVuZGVyTG9vcFNjcmlwdCA9IChhcmdzKSAtPlxyXG4gIGxvZ09iaiA9IGFyZ3MubG9nXHJcbiAgbG9nT2JqLnZlcmJvc2UgXCJQYXJzaW5nLi4uXCJcclxuICBwYXJzZXIgPSBuZXcgUGFyc2VyKGxvZ09iailcclxuICBwYXJzZXIucGFyc2UgYXJncy5zY3JpcHRcclxuXHJcbiAgd2hpY2ggPSBhcmdzLndoaWNoXHJcbiAgd2hpY2ggPz0gcGFyc2VyLmxhc3RPYmplY3RcclxuXHJcbiAgaWYgd2hpY2hcclxuICAgIHNhbXBsZVJhdGUgPSA0NDEwMFxyXG4gICAgbG9nT2JqLnZlcmJvc2UgXCJSZW5kZXJpbmcuLi5cIlxyXG4gICAgcmVuZGVyZXIgPSBuZXcgUmVuZGVyZXIobG9nT2JqLCBzYW1wbGVSYXRlLCBhcmdzLnJlYWRMb2NhbEZpbGVzLCBwYXJzZXIub2JqZWN0cylcclxuICAgIG91dHB1dFNvdW5kID0gcmVuZGVyZXIucmVuZGVyKHdoaWNoLCB7fSlcclxuICAgIGlmIGFyZ3Mub3V0cHV0RmlsZW5hbWVcclxuICAgICAgcmV0dXJuIHJpZmZ3YXZlLndyaXRlV0FWIGFyZ3Mub3V0cHV0RmlsZW5hbWUsIHNhbXBsZVJhdGUsIG91dHB1dFNvdW5kLnNhbXBsZXNcclxuICAgIHJldHVybiByaWZmd2F2ZS5tYWtlQmxvYlVybChzYW1wbGVSYXRlLCBvdXRwdXRTb3VuZC5zYW1wbGVzKVxyXG5cclxuICByZXR1cm4gbnVsbFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPVxyXG4gIHJlbmRlcjogcmVuZGVyTG9vcFNjcmlwdFxyXG4iLCJmcyA9IHJlcXVpcmUgXCJmc1wiXHJcblxyXG5jbGFzcyBGYXN0QmFzZTY0XHJcblxyXG4gIGNvbnN0cnVjdG9yOiAtPlxyXG4gICAgQGNoYXJzID0gXCJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvPVwiXHJcbiAgICBAZW5jTG9va3VwID0gW11cclxuICAgIGZvciBpIGluIFswLi4uNDA5Nl1cclxuICAgICAgQGVuY0xvb2t1cFtpXSA9IEBjaGFyc1tpID4+IDZdICsgQGNoYXJzW2kgJiAweDNGXVxyXG5cclxuICBlbmNvZGU6IChzcmMpIC0+XHJcbiAgICBsZW4gPSBzcmMubGVuZ3RoXHJcbiAgICBkc3QgPSAnJ1xyXG4gICAgaSA9IDBcclxuICAgIHdoaWxlIChsZW4gPiAyKVxyXG4gICAgICBuID0gKHNyY1tpXSA8PCAxNikgfCAoc3JjW2krMV08PDgpIHwgc3JjW2krMl1cclxuICAgICAgZHN0Kz0gdGhpcy5lbmNMb29rdXBbbiA+PiAxMl0gKyB0aGlzLmVuY0xvb2t1cFtuICYgMHhGRkZdXHJcbiAgICAgIGxlbi09IDNcclxuICAgICAgaSs9IDNcclxuICAgIGlmIChsZW4gPiAwKVxyXG4gICAgICBuMT0gKHNyY1tpXSAmIDB4RkMpID4+IDJcclxuICAgICAgbjI9IChzcmNbaV0gJiAweDAzKSA8PCA0XHJcbiAgICAgIGlmIChsZW4gPiAxKVxyXG4gICAgICAgIG4yIHw9IChzcmNbKytpXSAmIDB4RjApID4+IDRcclxuICAgICAgZHN0Kz0gdGhpcy5jaGFyc1tuMV1cclxuICAgICAgZHN0Kz0gdGhpcy5jaGFyc1tuMl1cclxuICAgICAgaWYgKGxlbiA9PSAyKVxyXG4gICAgICAgIG4zPSAoc3JjW2krK10gJiAweDBGKSA8PCAyXHJcbiAgICAgICAgbjMgfD0gKHNyY1tpXSAmIDB4QzApID4+IDZcclxuICAgICAgICBkc3QrPSB0aGlzLmNoYXJzW24zXVxyXG4gICAgICBpZiAobGVuID09IDEpXHJcbiAgICAgICAgZHN0Kz0gJz0nXHJcbiAgICAgIGRzdCs9ICc9J1xyXG5cclxuICAgIHJldHVybiBkc3RcclxuXHJcbmNsYXNzIFJJRkZXQVZFXHJcbiAgY29uc3RydWN0b3I6IChAc2FtcGxlUmF0ZSwgQGRhdGEpIC0+XHJcbiAgICBAd2F2ID0gW10gICAgICMgQXJyYXkgY29udGFpbmluZyB0aGUgZ2VuZXJhdGVkIHdhdmUgZmlsZVxyXG4gICAgQGhlYWRlciA9ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICMgT0ZGUyBTSVpFIE5PVEVTXHJcbiAgICAgIGNodW5rSWQgICAgICA6IFsweDUyLDB4NDksMHg0NiwweDQ2XSwgIyAwICAgIDQgIFwiUklGRlwiID0gMHg1MjQ5NDY0NlxyXG4gICAgICBjaHVua1NpemUgICAgOiAwLCAgICAgICAgICAgICAgICAgICAgICMgNCAgICA0ICAzNitTdWJDaHVuazJTaXplID0gNCsoOCtTdWJDaHVuazFTaXplKSsoOCtTdWJDaHVuazJTaXplKVxyXG4gICAgICBmb3JtYXQgICAgICAgOiBbMHg1NywweDQxLDB4NTYsMHg0NV0sICMgOCAgICA0ICBcIldBVkVcIiA9IDB4NTc0MTU2NDVcclxuICAgICAgc3ViQ2h1bmsxSWQgIDogWzB4NjYsMHg2ZCwweDc0LDB4MjBdLCAjIDEyICAgNCAgXCJmbXQgXCIgPSAweDY2NmQ3NDIwXHJcbiAgICAgIHN1YkNodW5rMVNpemU6IDE2LCAgICAgICAgICAgICAgICAgICAgIyAxNiAgIDQgIDE2IGZvciBQQ01cclxuICAgICAgYXVkaW9Gb3JtYXQgIDogMSwgICAgICAgICAgICAgICAgICAgICAjIDIwICAgMiAgUENNID0gMVxyXG4gICAgICBudW1DaGFubmVscyAgOiAxLCAgICAgICAgICAgICAgICAgICAgICMgMjIgICAyICBNb25vID0gMSwgU3RlcmVvID0gMi4uLlxyXG4gICAgICBzYW1wbGVSYXRlICAgOiBAc2FtcGxlUmF0ZSwgICAgICAgICAgICMgMjQgICA0ICA4MDAwLCA0NDEwMC4uLlxyXG4gICAgICBieXRlUmF0ZSAgICAgOiAwLCAgICAgICAgICAgICAgICAgICAgICMgMjggICA0ICBTYW1wbGVSYXRlKk51bUNoYW5uZWxzKkJpdHNQZXJTYW1wbGUvOFxyXG4gICAgICBibG9ja0FsaWduICAgOiAwLCAgICAgICAgICAgICAgICAgICAgICMgMzIgICAyICBOdW1DaGFubmVscypCaXRzUGVyU2FtcGxlLzhcclxuICAgICAgYml0c1BlclNhbXBsZTogMTYsICAgICAgICAgICAgICAgICAgICAjIDM0ICAgMiAgOCBiaXRzID0gOCwgMTYgYml0cyA9IDE2XHJcbiAgICAgIHN1YkNodW5rMklkICA6IFsweDY0LDB4NjEsMHg3NCwweDYxXSwgIyAzNiAgIDQgIFwiZGF0YVwiID0gMHg2NDYxNzQ2MVxyXG4gICAgICBzdWJDaHVuazJTaXplOiAwICAgICAgICAgICAgICAgICAgICAgICMgNDAgICA0ICBkYXRhIHNpemUgPSBOdW1TYW1wbGVzKk51bUNoYW5uZWxzKkJpdHNQZXJTYW1wbGUvOFxyXG5cclxuICAgIEBnZW5lcmF0ZSgpXHJcblxyXG4gIHUzMlRvQXJyYXk6IChpKSAtPlxyXG4gICAgcmV0dXJuIFtpJjB4RkYsIChpPj44KSYweEZGLCAoaT4+MTYpJjB4RkYsIChpPj4yNCkmMHhGRl1cclxuXHJcbiAgdTE2VG9BcnJheTogKGkpIC0+XHJcbiAgICByZXR1cm4gW2kmMHhGRiwgKGk+PjgpJjB4RkZdXHJcblxyXG4gIHNwbGl0MTZiaXRBcnJheTogKGRhdGEpIC0+XHJcbiAgICByID0gW11cclxuICAgIGogPSAwXHJcbiAgICBsZW4gPSBkYXRhLmxlbmd0aFxyXG4gICAgZm9yIGkgaW4gWzAuLi5sZW5dXHJcbiAgICAgIHJbaisrXSA9IGRhdGFbaV0gJiAweEZGXHJcbiAgICAgIHJbaisrXSA9IChkYXRhW2ldPj44KSAmIDB4RkZcclxuXHJcbiAgICByZXR1cm4gclxyXG5cclxuICBnZW5lcmF0ZTogLT5cclxuICAgIEBoZWFkZXIuYmxvY2tBbGlnbiA9IChAaGVhZGVyLm51bUNoYW5uZWxzICogQGhlYWRlci5iaXRzUGVyU2FtcGxlKSA+PiAzXHJcbiAgICBAaGVhZGVyLmJ5dGVSYXRlID0gQGhlYWRlci5ibG9ja0FsaWduICogQHNhbXBsZVJhdGVcclxuICAgIEBoZWFkZXIuc3ViQ2h1bmsyU2l6ZSA9IEBkYXRhLmxlbmd0aCAqIChAaGVhZGVyLmJpdHNQZXJTYW1wbGUgPj4gMylcclxuICAgIEBoZWFkZXIuY2h1bmtTaXplID0gMzYgKyBAaGVhZGVyLnN1YkNodW5rMlNpemVcclxuXHJcbiAgICBpZiBAaGVhZGVyLmJpdHNQZXJTYW1wbGUgPT0gMTZcclxuICAgICAgQGRhdGEgPSBAc3BsaXQxNmJpdEFycmF5KEBkYXRhKVxyXG5cclxuICAgIEB3YXYgPSBAaGVhZGVyLmNodW5rSWQuY29uY2F0KFxyXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLmNodW5rU2l6ZSksXHJcbiAgICAgIEBoZWFkZXIuZm9ybWF0LFxyXG4gICAgICBAaGVhZGVyLnN1YkNodW5rMUlkLFxyXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLnN1YkNodW5rMVNpemUpLFxyXG4gICAgICBAdTE2VG9BcnJheShAaGVhZGVyLmF1ZGlvRm9ybWF0KSxcclxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5udW1DaGFubmVscyksXHJcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuc2FtcGxlUmF0ZSksXHJcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuYnl0ZVJhdGUpLFxyXG4gICAgICBAdTE2VG9BcnJheShAaGVhZGVyLmJsb2NrQWxpZ24pLFxyXG4gICAgICBAdTE2VG9BcnJheShAaGVhZGVyLmJpdHNQZXJTYW1wbGUpLFxyXG4gICAgICBAaGVhZGVyLnN1YkNodW5rMklkLFxyXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLnN1YkNodW5rMlNpemUpLFxyXG4gICAgICBAZGF0YVxyXG4gICAgKVxyXG4gICAgZmIgPSBuZXcgRmFzdEJhc2U2NFxyXG4gICAgQGJhc2U2NERhdGEgPSBmYi5lbmNvZGUoQHdhdilcclxuICAgIEBkYXRhVVJJID0gJ2RhdGE6YXVkaW8vd2F2O2Jhc2U2NCwnICsgQGJhc2U2NERhdGFcclxuXHJcbiAgcmF3OiAtPlxyXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoQGJhc2U2NERhdGEsIFwiYmFzZTY0XCIpXHJcblxyXG53cml0ZVdBViA9IChmaWxlbmFtZSwgc2FtcGxlUmF0ZSwgc2FtcGxlcykgLT5cclxuICB3YXZlID0gbmV3IFJJRkZXQVZFIHNhbXBsZVJhdGUsIHNhbXBsZXNcclxuICBmcy53cml0ZUZpbGVTeW5jKGZpbGVuYW1lLCB3YXZlLnJhdygpKVxyXG4gIHJldHVybiB0cnVlXHJcblxyXG5tYWtlRGF0YVVSSSA9IChzYW1wbGVSYXRlLCBzYW1wbGVzKSAtPlxyXG4gIHdhdmUgPSBuZXcgUklGRldBVkUgc2FtcGxlUmF0ZSwgc2FtcGxlc1xyXG4gIHJldHVybiB3YXZlLmRhdGFVUklcclxuXHJcbmI2NHRvQmxvYiA9IChiNjREYXRhLCBjb250ZW50VHlwZSwgc2xpY2VTaXplKSAtPlxyXG4gIGNvbnRlbnRUeXBlID0gY29udGVudFR5cGUgfHwgJydcclxuICBzbGljZVNpemUgPSBzbGljZVNpemUgfHwgNTEyXHJcblxyXG4gIGJ5dGVDaGFyYWN0ZXJzID0gYXRvYihiNjREYXRhKVxyXG4gIGJ5dGVBcnJheXMgPSBbXVxyXG5cclxuICBmb3Igb2Zmc2V0IGluIFswLi4uYnl0ZUNoYXJhY3RlcnMubGVuZ3RoXSBieSBzbGljZVNpemVcclxuICAgIHNsaWNlID0gYnl0ZUNoYXJhY3RlcnMuc2xpY2Uob2Zmc2V0LCBvZmZzZXQgKyBzbGljZVNpemUpXHJcblxyXG4gICAgYnl0ZU51bWJlcnMgPSBuZXcgQXJyYXkoc2xpY2UubGVuZ3RoKVxyXG4gICAgZm9yIGkgaW4gWzAuLi5zbGljZS5sZW5ndGhdXHJcbiAgICAgIGJ5dGVOdW1iZXJzW2ldID0gc2xpY2UuY2hhckNvZGVBdChpKVxyXG5cclxuICAgIGJ5dGVBcnJheSA9IG5ldyBVaW50OEFycmF5KGJ5dGVOdW1iZXJzKVxyXG5cclxuICAgIGJ5dGVBcnJheXMucHVzaChieXRlQXJyYXkpXHJcblxyXG4gIGJsb2IgPSBuZXcgQmxvYihieXRlQXJyYXlzLCB7dHlwZTogY29udGVudFR5cGV9KVxyXG4gIHJldHVybiBibG9iXHJcblxyXG5tYWtlQmxvYlVybCA9IChzYW1wbGVSYXRlLCBzYW1wbGVzKSAtPlxyXG4gIHdhdmUgPSBuZXcgUklGRldBVkUgc2FtcGxlUmF0ZSwgc2FtcGxlc1xyXG4gIGJsb2IgPSBiNjR0b0Jsb2Iod2F2ZS5iYXNlNjREYXRhLCBcImF1ZGlvL3dhdlwiKVxyXG4gIHJldHVybiBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpXHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9XHJcbiAgUklGRldBVkU6IFJJRkZXQVZFXHJcbiAgd3JpdGVXQVY6IHdyaXRlV0FWXHJcbiAgbWFrZURhdGFVUkk6IG1ha2VEYXRhVVJJXHJcbiAgbWFrZUJsb2JVcmw6IG1ha2VCbG9iVXJsXHJcbiJdfQ==
