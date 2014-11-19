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
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var kMaxLength = 0x3fffffff

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
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

  // Find the length
  var length
  if (type === 'number')
    length = subject > 0 ? subject >>> 0 : 0
  else if (type === 'string') {
    if (encoding === 'base64')
      subject = base64clean(subject)
    length = Buffer.byteLength(subject, encoding)
  } else if (type === 'object' && subject !== null) { // assume object is array-like
    if (subject.type === 'Buffer' && isArray(subject.data))
      subject = subject.data
    length = +subject.length > 0 ? Math.floor(+subject.length) : 0
  } else
    throw new TypeError('must start with number, buffer, array or string')

  if (this.length > kMaxLength)
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
      'size: 0x' + kMaxLength.toString(16) + ' bytes')

  var buf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer.TYPED_ARRAY_SUPPORT && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    if (Buffer.isBuffer(subject)) {
      for (i = 0; i < length; i++)
        buf[i] = subject.readUInt8(i)
    } else {
      for (i = 0; i < length; i++)
        buf[i] = ((subject[i] % 256) + 256) % 256
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer.TYPED_ARRAY_SUPPORT && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

Buffer.isBuffer = function (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b))
    throw new TypeError('Arguments must be Buffers')

  var x = a.length
  var y = b.length
  for (var i = 0, len = Math.min(x, y); i < len && a[i] === b[i]; i++) {}
  if (i !== len) {
    x = a[i]
    y = b[i]
  }
  if (x < y) return -1
  if (y < x) return 1
  return 0
}

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

Buffer.concat = function (list, totalLength) {
  if (!isArray(list)) throw new TypeError('Usage: Buffer.concat(list[, length])')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (totalLength === undefined) {
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

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    case 'hex':
      ret = str.length >>> 1
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    default:
      ret = str.length
  }
  return ret
}

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function (encoding, start, end) {
  var loweredCase = false

  start = start >>> 0
  end = end === undefined || end === Infinity ? this.length : end >>> 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase)
          throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.equals = function (b) {
  if(!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max)
      str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  return Buffer.compare(this, b)
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

function hexWrite (buf, string, offset, length) {
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
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(byte)) throw new Error('Invalid hex string')
    buf[offset + i] = byte
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function asciiWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  var charsWritten = blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function utf16leWrite (buf, string, offset, length) {
  var charsWritten = blitBuffer(utf16leToBytes(string), buf, offset, length)
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

  var ret
  switch (encoding) {
    case 'hex':
      ret = hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = utf16leWrite(this, string, offset, length)
      break
    default:
      throw new TypeError('Unknown encoding: ' + encoding)
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
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

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function binarySlice (buf, start, end) {
  return asciiSlice(buf, start, end)
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len;
    if (start < 0)
      start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0)
      end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start)
    end = start

  if (Buffer.TYPED_ARRAY_SUPPORT) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0)
    throw new RangeError('offset is not uint')
  if (offset + ext > length)
    throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
      ((this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      this[offset + 3])
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80))
    return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16) |
      (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
      (this[offset + 1] << 16) |
      (this[offset + 2] << 8) |
      (this[offset + 3])
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  if (!noAssert)
    checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new TypeError('value is out of bounds')
  if (offset + ext > buf.length) throw new TypeError('index out of range')
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else objectWriteUInt16(this, value, offset, true)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else objectWriteUInt16(this, value, offset, false)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else objectWriteUInt32(this, value, offset, true)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert)
    checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else objectWriteUInt32(this, value, offset, false)
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new TypeError('value is out of bounds')
  if (offset + ext > buf.length) throw new TypeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert)
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
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
  if (end < start) throw new TypeError('sourceEnd < sourceStart')
  if (target_start < 0 || target_start >= target.length)
    throw new TypeError('targetStart out of bounds')
  if (start < 0 || start >= source.length) throw new TypeError('sourceStart out of bounds')
  if (end < 0 || end > source.length) throw new TypeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + target_start] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new TypeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new TypeError('start out of bounds')
  if (end < 0 || end > this.length) throw new TypeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr.constructor = Buffer
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
  arr.equals = BP.equals
  arr.compare = BP.compare
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

var INVALID_BASE64_RE = /[^+\/0-9A-z]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
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
    if (b <= 0x7F) {
      byteArray.push(b)
    } else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++) {
        byteArray.push(parseInt(h[j], 16))
      }
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

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
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

},{"base64-js":14,"ieee754":15,"is-array":16}],"+lAcbR":[function(require,module,exports){
var BeatMaker, main;

(function() {
  var nowOffset;
  if (typeof window.performance === 'undefined') {
    window.performance = {};
  }
  if (!window.performance.now) {
    nowOffset = +new Date();
    if (performance.timing && performance.timing) {
      nowOffset = performance.timing.navigationStart;
    }
    return window.performance.now = function() {
      var now;
      now = +new Date();
      return now - nowOffset;
    };
  }
})();

BeatMaker = (function() {
  function BeatMaker() {
    this.reset();
  }

  BeatMaker.prototype.setInputText = function(text) {
    return $("#beatinput").val(text);
  };

  BeatMaker.prototype.setOutputText = function(text) {
    return $("#beatoutput").html(text);
  };

  BeatMaker.prototype.error = function(text) {
    return this.setInputText(" ERROR: " + text);
  };

  BeatMaker.prototype.reset = function(note) {
    this.keyDownCount = 0;
    this.keyDownTime = {};
    this.recording = false;
    this.notes = [];
    if (note == null) {
      note = "";
    }
    return this.setInputText("" + note + " Click here and hit use A-Z keys to make a new beat (please loop the full pattern exactly twice)");
  };

  BeatMaker.prototype.updateRecording = function() {
    var now;
    if (!this.recording) {
      return;
    }
    now = window.performance.now();
    if (now > (this.lastKeyEvent + 2000)) {
      return $("#beatinput").val(" Recording (" + (Math.floor(4000 - (now - this.lastKeyEvent))) + " ms left...)...");
    } else {
      return $("#beatinput").val(" Recording...");
    }
  };

  BeatMaker.prototype.startRecording = function() {
    this.recording = true;
    return this.updateRecording();
  };

  BeatMaker.prototype.stopRecording = function() {
    var recordedNotes;
    recordedNotes = this.notes;
    this.reset(" Recording finished.");
    return this.generate(recordedNotes);
  };

  BeatMaker.prototype.keyDown = function(key, ts) {
    if (this.keyDownTime.hasOwnProperty(key)) {
      return;
    }
    this.lastKeyEvent = window.performance.now();
    if (!this.recording) {
      this.startRecording();
    }
    this.keyDownTime[key] = ts;
    return this.keyDownCount++;
  };

  BeatMaker.prototype.keyUp = function(key, ts) {
    if (!this.recording) {
      return;
    }
    this.lastKeyEvent = window.performance.now();
    this.notes.push({
      key: key,
      start: this.keyDownTime[key],
      end: ts
    });
    delete this.keyDownTime[key];
    return this.keyDownCount--;
  };

  BeatMaker.prototype.tick = function() {
    var now;
    if (!this.recording) {
      return;
    }
    this.updateRecording();
    if (this.keyDownCount > 0) {
      return;
    }
    now = window.performance.now();
    if (now > (this.lastKeyEvent + 4000)) {
      return this.stopRecording();
    }
  };

  BeatMaker.prototype.generate = function(notes) {
    var baseBPM, beat, beatStart, beatTime, i, key, keyNotes, loopCount, note, noteCount, noteIndex, pieceCount, pieceIndex, pieceSeen, pieceTime, pieces, _i, _j, _k, _l, _len, _len1, _m, _n;
    notes.sort(function(a, b) {
      return a.start - b.start;
    });
    if ((notes.length % 2) !== 0) {
      this.error("Odd count of notes! Please loop your beat exactly twice.");
      return;
    }
    beat = "";
    beatStart = notes[0].start;
    noteCount = notes.length >> 1;
    beatTime = notes[noteCount].start - beatStart;
    beat += "# " + noteCount + " notes, total time " + beatTime + " seconds\n";
    baseBPM = Math.floor(120000 / beatTime);
    while (baseBPM > 60) {
      baseBPM >>= 1;
    }
    beat += "# BPM guesses: " + baseBPM + ", " + (baseBPM * 2) + ", " + (baseBPM * 4) + "\n";
    beat += "\n# Here is your beat at various levels of granularity:\n";
    keyNotes = {};
    for (noteIndex = _i = 0; 0 <= noteCount ? _i < noteCount : _i > noteCount; noteIndex = 0 <= noteCount ? ++_i : --_i) {
      note = notes[noteIndex];
      if (!keyNotes.hasOwnProperty(note.key)) {
        keyNotes[note.key] = [];
      }
      keyNotes[note.key].push({
        start: note.start - beatStart,
        length: note.end - note.start
      });
    }
    pieceCount = 8;
    pieceTime = 0;
    for (loopCount = _j = 0; _j < 3; loopCount = ++_j) {
      pieceCount <<= 1;
      console.log("trying to fit in " + pieceCount + " pieces");
      beat += "\nloop pattern" + pieceCount + "\n";
      pieceTime = beatTime / pieceCount;
      for (key in keyNotes) {
        notes = keyNotes[key];
        console.log("* fitting key " + key);
        pieceSeen = [];
        for (i = _k = 0; 0 <= pieceCount ? _k < pieceCount : _k > pieceCount; i = 0 <= pieceCount ? ++_k : --_k) {
          pieceSeen[i] = false;
        }
        for (_l = 0, _len = notes.length; _l < _len; _l++) {
          note = notes[_l];
          pieceIndex = Math.floor((note.start + (pieceTime / 2)) / pieceTime);
          console.log("piece index for " + note.start + " is " + pieceIndex);
          if (pieceSeen[pieceIndex]) {
            console.log("already saw index " + pieceIndex + " for key " + key + ", doubling pieceCount");
            loopCount = 0;
            continue;
          }
        }
      }
      for (key in keyNotes) {
        notes = keyNotes[key];
        console.log("* rendering key " + key);
        pieces = [];
        for (i = _m = 0; 0 <= pieceCount ? _m < pieceCount : _m > pieceCount; i = 0 <= pieceCount ? ++_m : --_m) {
          pieces[i] = ".";
        }
        for (_n = 0, _len1 = notes.length; _n < _len1; _n++) {
          note = notes[_n];
          pieceIndex = Math.floor((note.start + (pieceTime / 2)) / pieceTime);
          console.log("piece index for " + note.start + " is " + pieceIndex);
          pieces[pieceIndex] = "x";
        }
        beat += ("  pattern " + key + " ") + pieces.join("") + "\n";
      }
    }
    console.log(keyNotes);
    return this.setOutputText(beat);
  };

  return BeatMaker;

})();

main = function() {
  var beatmaker;
  beatmaker = new BeatMaker;
  $('#beatinput').keydown(function(event) {
    var key, keyCode, now;
    keyCode = parseInt(event.keyCode);
    if ((keyCode < 65) || (keyCode > 90)) {
      return;
    }
    key = String.fromCharCode(event.keyCode);
    now = window.performance.now();
    return beatmaker.keyDown(key, now);
  });
  $('#beatinput').keyup(function(event) {
    var key, keyCode, now;
    keyCode = parseInt(event.keyCode);
    if ((keyCode < 65) || (keyCode > 90)) {
      return;
    }
    key = String.fromCharCode(event.keyCode);
    now = window.performance.now();
    return beatmaker.keyUp(key, now);
  });
  return setInterval(function() {
    return beatmaker.tick();
  }, 250);
};

main();

module.exports = {
  lel: "playz"
};



},{}],"./beatmaker":[function(require,module,exports){
module.exports=require('+lAcbR');
},{}],"./examples":[function(require,module,exports){
module.exports=require('J6p0lP');
},{}],"J6p0lP":[function(require,module,exports){
module.exports = {
  first: "# ------------------------------------------------------------\n# Your first LoopScript. Click \"Compile\" below to start!\n\ntone note1\n  duration 250\n  octave 4\n  note C\n\ntone bass1\n  duration 250\n  octave 1\n  note B\n\nloop loop1\n  pattern note1 x.......x.......\n  pattern bass1 ....x.......x...\n",
  notes: "# ------------------------------------------------------------\n# Note overrides!\n\n# H-L are the black keys:\n#     H I   J K L\n#    C D E F G A B\n\n# Try setting the duration to 100\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  duration 250\n\n# Samples can have their notes overridden too!\nsample ding\n  src samples/ding_e.wav\n  srcnote e\n\nloop loop1\n  pattern note1 b.a.g.a.b.b.b...\n\nloop loop2\n  pattern ding b.a.g.a.b.b.b...\n\ntrack song\n  pattern loop1 x\n  pattern loop2 .x\n",
  motto: "# ------------------------------------------------------------\n# An approximation of the beat from Drake's \"The Motto\"\n\nbpm 100\nsection # to share ADSR\n  adsr 0.005 0.05 0.7 0.05\n  tone bass1 -> octave 1\n  tone bass2 -> octave 2\n\nsample clap  -> src samples/clap.wav\nsample snare -> src samples/snare.wav\nsample hihat -> src samples/hihat.wav\n\nloop loop1\n  pattern hihat ..x.......x.......x.......x.....\n  pattern clap  ....x.......x.......x.......x...\n  pattern snare ......x...x...x.x...............\n  pattern bass1 Bbbbbb..........................\n  pattern bass2 ......HhhhhhDddddd....HhhhJj.Jj.\n\ntrack song\n  pattern loop1 xxxx\n",
  length: "# ------------------------------------------------------------\n# Showing off various note lengths using caps and lowercase\n# Also shows what ADSR can do!\n\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n\ntone note2\n  # Note: Only the first tone has ADSR\n\n# If you use any letters other than \"x\" on a tone pattern, you override its\n# note with the note listed. Also, if you use any capital letters in a pattern,\n# you override the length of that note with the number of matching lowercase\n# letters following it.\n\nloop loop1\n  pattern note1 GgggggggFfffff..AaaaBbb.Cc..D...\n\nloop loop2\n  pattern note2 GgggggggFfffff..AaaaBbb.Cc..D...\n\ntrack song\n  pattern loop1 x.\n  pattern loop2 .x\n",
  chocobo: "# ------------------------------------------------------------\n# The Chocobo Theme (first part only)\n\nbpm 125\n\nsection Tone (in a section to share ADSR)\n  adsr 0.005 0.05 0.7 0.05\n  tone chocobo1\n    octave 5\n  tone chocobo2\n    octave 4\n\nloop loop1\n pattern chocobo1 Dddd......Dd..........................................D.E.Ffffff...\n pattern chocobo2 ....BbGgEe..BbGgBb..Gg..Bbbbbb.AaGgGAG.F.Gggggg.F.GgGB.............\n\ntrack song\n  pattern loop1 xx",
  kick: "# ------------------------------------------------------------\n# Bass kick (mixing a simple kick with a sustained bass sine)\n# Try changing 'freq' to anywhere in 55-80, and/or 'duration'\n\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  freq 60\n  duration 1500\n\nsample kick\n  volume 0.7\n  src samples/kick3.wav\n\ntrack BassKick\n  pattern note1 x\n  pattern kick  x\n",
  kickpattern: "# ------------------------------------------------------------\n# Simple kick pattern\n\nbpm 90\n\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  octave 1\n  duration 1500\n\nsample kick\n  volume 0.7\n  src samples/kick3.wav\n\nsample clap\n  src samples/clap.wav\n\nloop loop1\n  pattern clap  ....x.......x...\n  pattern note1 b.b...b.b.b.....\n  pattern kick  x.x...x.x.x.....\n  \ntrack derp\n  pattern loop1 xxxx\n",
  wiggle: "# ------------------------------------------------------------\n# A silly approximation of Jason Derulo's Wiggle\n\nbpm 82\n\ntone bass\n  adsr 0.005 0.05 0.7 0.05\n  duration 1500\n  octave 2\n\nsample kick\n  volume 0.7\n  src samples/kick3.wav\n\nsample snap\n  volume 0.5\n  src samples/snap.wav\n\nloop loop1\n  pattern snap ....x.......x...\n  pattern kick x..x..x.........\n  pattern bass a..f..e.........\n\ntrack wiggle\n  pattern loop1 xxxx"
};



},{}],"./freq":[function(require,module,exports){
module.exports=require('SwjZMG');
},{}],"SwjZMG":[function(require,module,exports){
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
module.exports=require('q0pWe1');
},{}],"q0pWe1":[function(require,module,exports){
var Parser, Renderer, clone, countIndent, findFreq, fs, generateBitmapDataURL, jDataView, logDebug, parseBool, renderLoopScript, renderWaveformImage, riffwave, _asLittleEndianHex, _collapseData, _scaleRows,
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

_asLittleEndianHex = function(value, bytes) {
  var result;
  result = [];
  while (bytes > 0) {
    result.push(String.fromCharCode(value & 255));
    value >>= 8;
    bytes--;
  }
  return result.join('');
};

_collapseData = function(rows, row_padding) {
  var i, j, padding, pixel, pixels_len, result, rows_len, _i, _j;
  rows_len = rows.length;
  pixels_len = rows_len ? rows[0].length : 0;
  padding = '';
  result = [];
  while (row_padding > 0) {
    padding += '\x00';
    row_padding--;
  }
  for (i = _i = 0; 0 <= rows_len ? _i < rows_len : _i > rows_len; i = 0 <= rows_len ? ++_i : --_i) {
    for (j = _j = 0; 0 <= pixels_len ? _j < pixels_len : _j > pixels_len; j = 0 <= pixels_len ? ++_j : --_j) {
      pixel = rows[i][j];
      result.push(String.fromCharCode(pixel[2]) + String.fromCharCode(pixel[1]) + String.fromCharCode(pixel[0]));
    }
    result.push(padding);
  }
  return result.join('');
};

_scaleRows = function(rows, scale) {
  var new_row, new_rows, real_h, real_w, scaled_h, scaled_w, x, y, _i, _j;
  real_w = rows.length;
  scaled_w = parseInt(real_w * scale);
  real_h = real_w ? rows[0].length : 0;
  scaled_h = parseInt(real_h * scale);
  new_rows = [];
  for (y = _i = 0; 0 <= scaled_h ? _i < scaled_h : _i > scaled_h; y = 0 <= scaled_h ? ++_i : --_i) {
    new_rows.push(new_row = []);
    for (x = _j = 0; 0 <= scaled_w ? _j < scaled_w : _j > scaled_w; x = 0 <= scaled_w ? ++_j : --_j) {
      new_row.push(rows[parseInt(y / scale)][parseInt(x / scale)]);
    }
  }
  return new_rows;
};

generateBitmapDataURL = function(rows, scale) {
  var file, height, num_data_bytes, num_file_bytes, row_padding, width;
  if (!btoa) {
    return false;
  }
  scale = scale || 1;
  if (scale !== 1) {
    rows = _scaleRows(rows, scale);
  }
  height = rows.length;
  width = height ? rows[0].length : 0;
  row_padding = (4 - (width * 3) % 4) % 4;
  num_data_bytes = (width * 3 + row_padding) * height;
  num_file_bytes = 54 + num_data_bytes;
  height = _asLittleEndianHex(height, 4);
  width = _asLittleEndianHex(width, 4);
  num_data_bytes = _asLittleEndianHex(num_data_bytes, 4);
  num_file_bytes = _asLittleEndianHex(num_file_bytes, 4);
  file = 'BM' + num_file_bytes + '\x00\x00' + '\x00\x00' + '\x36\x00\x00\x00' + '\x28\x00\x00\x00' + width + height + '\x01\x00' + '\x18\x00' + '\x00\x00\x00\x00' + num_data_bytes + '\x13\x0B\x00\x00' + '\x13\x0B\x00\x00' + '\x00\x00\x00\x00' + '\x00\x00\x00\x00' + _collapseData(rows, row_padding);
  return 'data:image/bmp;base64,' + btoa(file);
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
    var A, B, amplitude, envelope, freq, i, length, period, sample, samples, _i;
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
    period = this.sampleRate / freq;
    for (i = _i = 0; 0 <= length ? _i < length : _i > length; i = 0 <= length ? ++_i : --_i) {
      if (toneObj.wave === "sawtooth") {
        sample = ((i % period) / period) - 0.5;
      } else {
        sample = Math.sin(i / period * 2 * Math.PI);
        if (toneObj.wave === "square") {
          sample = sample > 0 ? 1 : -1;
        }
      }
      samples[i] = sample * amplitude * envelope[i];
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
    totalLength = Math.floor(samplesPerBeat * beatCount);
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
    var cacheName, delaySamples, factor, i, newfreq, object, oldfreq, overrideNote, relength, resamples, samples, sound, totalLength, _i, _j, _k, _l, _m, _n, _ref, _ref1, _ref2, _ref3;
    object = this.getObject(which);
    if (!object) {
      return null;
    }
    if (overrides == null) {
      overrides = {};
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
    if (object._type !== 'tone') {
      overrideNote = overrides.note ? overrides.note : object.note;
      if ((overrideNote !== object.srcnote) || (object.octave !== object.srcoctave)) {
        oldfreq = findFreq(object.srcoctave, object.srcnote);
        newfreq = findFreq(object.octave, overrideNote);
        factor = oldfreq / newfreq;
        relength = Math.floor(sound.samples.length * factor);
        resamples = Array(relength);
        for (i = _i = 0; 0 <= relength ? _i < relength : _i > relength; i = 0 <= relength ? ++_i : --_i) {
          resamples[i] = 0;
        }
        for (i = _j = 0; 0 <= relength ? _j < relength : _j > relength; i = 0 <= relength ? ++_j : --_j) {
          resamples[i] = sound.samples[Math.floor(i / factor)];
        }
        sound.samples = resamples;
        sound.length = resamples.length;
      }
    }
    if ((object.volume != null) && (object.volume !== 1.0)) {
      for (i = _k = 0, _ref = sound.samples.length; 0 <= _ref ? _k < _ref : _k > _ref; i = 0 <= _ref ? ++_k : --_k) {
        sound.samples[i] *= object.volume;
      }
    }
    if ((object.reverb != null) && (object.reverb.delay > 0)) {
      delaySamples = Math.floor(object.reverb.delay * this.sampleRate / 1000);
      if (sound.samples.length > delaySamples) {
        totalLength = sound.samples.length + (delaySamples * 8);
        samples = Array(totalLength);
        for (i = _l = 0, _ref1 = sound.samples.length; 0 <= _ref1 ? _l < _ref1 : _l > _ref1; i = 0 <= _ref1 ? ++_l : --_l) {
          samples[i] = sound.samples[i];
        }
        for (i = _m = _ref2 = sound.samples.length; _ref2 <= totalLength ? _m < totalLength : _m > totalLength; i = _ref2 <= totalLength ? ++_m : --_m) {
          samples[i] = 0;
        }
        for (i = _n = 0, _ref3 = totalLength - delaySamples; 0 <= _ref3 ? _n < _ref3 : _n > _ref3; i = 0 <= _ref3 ? ++_n : --_n) {
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

renderWaveformImage = function(samples, width, height, backgroundColor, waveformColor) {
  var a, i, j, lineHeight, lineOffset, peak, row, rows, sample, sampleAvg, sampleIndex, sampleMax, sampleOffset, sampleSum, samplesPerCol, _i, _j, _k, _l, _len, _m, _n, _o, _ref;
  if (backgroundColor == null) {
    backgroundColor = [255, 255, 255];
  }
  if (waveformColor == null) {
    waveformColor = [255, 0, 0];
  }
  rows = [];
  for (j = _i = 0; 0 <= height ? _i < height : _i > height; j = 0 <= height ? ++_i : --_i) {
    row = [];
    for (i = _j = 0; 0 <= width ? _j < width : _j > width; i = 0 <= width ? ++_j : --_j) {
      row.push(backgroundColor);
    }
    rows.push(row);
  }
  samplesPerCol = Math.floor(samples.length / width);
  peak = 0;
  for (_k = 0, _len = samples.length; _k < _len; _k++) {
    sample = samples[_k];
    a = Math.abs(sample);
    if (peak < a) {
      peak = a;
    }
  }
  peak = Math.floor(peak * 1.1);
  if (peak === 0) {
    row = rows[Math.floor(height / 2)];
    for (i = _l = 0; 0 <= width ? _l < width : _l > width; i = 0 <= width ? ++_l : --_l) {
      row[i] = waveformColor;
    }
  } else {
    for (i = _m = 0; 0 <= width ? _m < width : _m > width; i = 0 <= width ? ++_m : --_m) {
      sampleOffset = Math.floor((i / width) * samples.length);
      sampleSum = 0;
      sampleMax = 0;
      for (sampleIndex = _n = sampleOffset, _ref = sampleOffset + samplesPerCol; sampleOffset <= _ref ? _n < _ref : _n > _ref; sampleIndex = sampleOffset <= _ref ? ++_n : --_n) {
        a = Math.abs(samples[sampleIndex]);
        sampleSum += a;
        if (sampleMax < a) {
          sampleMax = a;
        }
      }
      sampleAvg = Math.floor(sampleSum / samplesPerCol);
      lineHeight = Math.floor(sampleMax / peak * height);
      lineOffset = (height - lineHeight) >> 1;
      if (lineHeight === 0) {
        lineHeight = 1;
      }
      for (j = _o = 0; 0 <= lineHeight ? _o < lineHeight : _o > lineHeight; j = 0 <= lineHeight ? ++_o : --_o) {
        row = rows[j + lineOffset];
        row[i] = waveformColor;
      }
    }
  }
  return generateBitmapDataURL(rows);
};

renderLoopScript = function(args) {
  var logObj, outputSound, parser, renderer, ret, sampleRate, which;
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
    ret = {};
    if (args.wavFilename) {
      riffwave.writeWAV(args.wavFilename, sampleRate, outputSound.samples);
    } else {
      ret.wavUrl = riffwave.makeBlobUrl(sampleRate, outputSound.samples);
    }
    if ((args.imageWidth != null) && (args.imageHeight != null) && (args.imageWidth > 0) && (args.imageHeight > 0)) {
      ret.imageUrl = renderWaveformImage(outputSound.samples, args.imageWidth, args.imageHeight, args.imageBackgroundColor, args.imageWaveformColor);
    }
    return ret;
  }
  return null;
};

module.exports = {
  render: renderLoopScript
};



},{"../js/jdataview":1,"./freq":"SwjZMG","./riffwave":"XjRWhK","fs":2}],"XjRWhK":[function(require,module,exports){
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
},{"buffer":3,"fs":2}],"./riffwave":[function(require,module,exports){
module.exports=require('XjRWhK');
},{}],14:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

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

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}]},{},[])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnJvd3Nlci1wYWNrXFxfcHJlbHVkZS5qcyIsImpkYXRhdmlldy5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXGxpYlxcX2VtcHR5LmpzIiwiLi5cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxidWZmZXJcXGluZGV4LmpzIiwiLi5cXHNyY1xcYmVhdG1ha2VyLmNvZmZlZSIsIi4uXFxzcmNcXGV4YW1wbGVzLmNvZmZlZSIsIi4uXFxzcmNcXGZyZXEuY29mZmVlIiwiLi5cXHNyY1xcbG9vcHNjcmlwdC5jb2ZmZWUiLCIuLlxcc3JjXFxyaWZmd2F2ZS5jb2ZmZWUiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJ1ZmZlclxcbm9kZV9tb2R1bGVzXFxiYXNlNjQtanNcXGxpYlxcYjY0LmpzIiwiLi5cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxidWZmZXJcXG5vZGVfbW9kdWxlc1xcaWVlZTc1NFxcaW5kZXguanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJ1ZmZlclxcbm9kZV9tb2R1bGVzXFxpcy1hcnJheVxcaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNXZCQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hoQ0EsSUFBQSxlQUFBOztBQUFBLENBQUcsU0FBQSxHQUFBO0FBRUQsTUFBQSxTQUFBO0FBQUEsRUFBQSxJQUFHLE1BQUEsQ0FBQSxNQUFhLENBQUMsV0FBZCxLQUEyQixXQUE5QjtBQUNFLElBQUEsTUFBTSxDQUFDLFdBQVAsR0FBcUIsRUFBckIsQ0FERjtHQUFBO0FBRUEs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QUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXRDVSxFQXFEVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXJEVSxFQW9FVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVB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O0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIihmdW5jdGlvbiAoQnVmZmVyKXtcbi8vXG4vLyBqRGF0YVZpZXcgYnkgVmpldXggPHZqZXV4eEBnbWFpbC5jb20+IC0gSmFuIDIwMTBcbi8vIENvbnRpbnVlZCBieSBSUmV2ZXJzZXIgPG1lQHJyZXZlcnNlci5jb20+IC0gRmViIDIwMTNcbi8vXG4vLyBBIHVuaXF1ZSB3YXkgdG8gd29yayB3aXRoIGEgYmluYXJ5IGZpbGUgaW4gdGhlIGJyb3dzZXJcbi8vIGh0dHA6Ly9naXRodWIuY29tL2pEYXRhVmlldy9qRGF0YVZpZXdcbi8vIGh0dHA6Ly9qRGF0YVZpZXcuZ2l0aHViLmlvL1xuXG4oZnVuY3Rpb24gKGdsb2JhbCkge1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBjb21wYXRpYmlsaXR5ID0ge1xuXHQvLyBOb2RlSlMgQnVmZmVyIGluIHYwLjUuNSBhbmQgbmV3ZXJcblx0Tm9kZUJ1ZmZlcjogJ0J1ZmZlcicgaW4gZ2xvYmFsICYmICdyZWFkSW50MTZMRScgaW4gQnVmZmVyLnByb3RvdHlwZSxcblx0RGF0YVZpZXc6ICdEYXRhVmlldycgaW4gZ2xvYmFsICYmIChcblx0XHQnZ2V0RmxvYXQ2NCcgaW4gRGF0YVZpZXcucHJvdG90eXBlIHx8ICAgICAgICAgICAgLy8gQ2hyb21lXG5cdFx0J2dldEZsb2F0NjQnIGluIG5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIoMSkpIC8vIE5vZGVcblx0KSxcblx0QXJyYXlCdWZmZXI6ICdBcnJheUJ1ZmZlcicgaW4gZ2xvYmFsLFxuXHRQaXhlbERhdGE6ICdDYW52YXNQaXhlbEFycmF5JyBpbiBnbG9iYWwgJiYgJ0ltYWdlRGF0YScgaW4gZ2xvYmFsICYmICdkb2N1bWVudCcgaW4gZ2xvYmFsXG59O1xuXG4vLyB3ZSBkb24ndCB3YW50IHRvIGJvdGhlciB3aXRoIG9sZCBCdWZmZXIgaW1wbGVtZW50YXRpb25cbmlmIChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIpIHtcblx0KGZ1bmN0aW9uIChidWZmZXIpIHtcblx0XHR0cnkge1xuXHRcdFx0YnVmZmVyLndyaXRlRmxvYXRMRShJbmZpbml0eSwgMCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyID0gZmFsc2U7XG5cdFx0fVxuXHR9KShuZXcgQnVmZmVyKDQpKTtcbn1cblxuaWYgKGNvbXBhdGliaWxpdHkuUGl4ZWxEYXRhKSB7XG5cdHZhciBjcmVhdGVQaXhlbERhdGEgPSBmdW5jdGlvbiAoYnl0ZUxlbmd0aCwgYnVmZmVyKSB7XG5cdFx0dmFyIGRhdGEgPSBjcmVhdGVQaXhlbERhdGEuY29udGV4dDJkLmNyZWF0ZUltYWdlRGF0YSgoYnl0ZUxlbmd0aCArIDMpIC8gNCwgMSkuZGF0YTtcblx0XHRkYXRhLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoO1xuXHRcdGlmIChidWZmZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBieXRlTGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0ZGF0YVtpXSA9IGJ1ZmZlcltpXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH07XG5cdGNyZWF0ZVBpeGVsRGF0YS5jb250ZXh0MmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKS5nZXRDb250ZXh0KCcyZCcpO1xufVxuXG52YXIgZGF0YVR5cGVzID0ge1xuXHQnSW50OCc6IDEsXG5cdCdJbnQxNic6IDIsXG5cdCdJbnQzMic6IDQsXG5cdCdVaW50OCc6IDEsXG5cdCdVaW50MTYnOiAyLFxuXHQnVWludDMyJzogNCxcblx0J0Zsb2F0MzInOiA0LFxuXHQnRmxvYXQ2NCc6IDhcbn07XG5cbnZhciBub2RlTmFtaW5nID0ge1xuXHQnSW50OCc6ICdJbnQ4Jyxcblx0J0ludDE2JzogJ0ludDE2Jyxcblx0J0ludDMyJzogJ0ludDMyJyxcblx0J1VpbnQ4JzogJ1VJbnQ4Jyxcblx0J1VpbnQxNic6ICdVSW50MTYnLFxuXHQnVWludDMyJzogJ1VJbnQzMicsXG5cdCdGbG9hdDMyJzogJ0Zsb2F0Jyxcblx0J0Zsb2F0NjQnOiAnRG91YmxlJ1xufTtcblxuZnVuY3Rpb24gYXJyYXlGcm9tKGFycmF5TGlrZSwgZm9yY2VDb3B5KSB7XG5cdHJldHVybiAoIWZvcmNlQ29weSAmJiAoYXJyYXlMaWtlIGluc3RhbmNlb2YgQXJyYXkpKSA/IGFycmF5TGlrZSA6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFycmF5TGlrZSk7XG59XG5cbmZ1bmN0aW9uIGRlZmluZWQodmFsdWUsIGRlZmF1bHRWYWx1ZSkge1xuXHRyZXR1cm4gdmFsdWUgIT09IHVuZGVmaW5lZCA/IHZhbHVlIDogZGVmYXVsdFZhbHVlO1xufVxuXG5mdW5jdGlvbiBqRGF0YVZpZXcoYnVmZmVyLCBieXRlT2Zmc2V0LCBieXRlTGVuZ3RoLCBsaXR0bGVFbmRpYW4pIHtcblx0LyoganNoaW50IHZhbGlkdGhpczp0cnVlICovXG5cblx0aWYgKGJ1ZmZlciBpbnN0YW5jZW9mIGpEYXRhVmlldykge1xuXHRcdHZhciByZXN1bHQgPSBidWZmZXIuc2xpY2UoYnl0ZU9mZnNldCwgYnl0ZU9mZnNldCArIGJ5dGVMZW5ndGgpO1xuXHRcdHJlc3VsdC5fbGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHJlc3VsdC5fbGl0dGxlRW5kaWFuKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0aWYgKCEodGhpcyBpbnN0YW5jZW9mIGpEYXRhVmlldykpIHtcblx0XHRyZXR1cm4gbmV3IGpEYXRhVmlldyhidWZmZXIsIGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgsIGxpdHRsZUVuZGlhbik7XG5cdH1cblxuXHR0aGlzLmJ1ZmZlciA9IGJ1ZmZlciA9IGpEYXRhVmlldy53cmFwQnVmZmVyKGJ1ZmZlcik7XG5cblx0Ly8gQ2hlY2sgcGFyYW1ldGVycyBhbmQgZXhpc3RpbmcgZnVuY3Rpb25uYWxpdGllc1xuXHR0aGlzLl9pc0FycmF5QnVmZmVyID0gY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlciAmJiBidWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcjtcblx0dGhpcy5faXNQaXhlbERhdGEgPSBjb21wYXRpYmlsaXR5LlBpeGVsRGF0YSAmJiBidWZmZXIgaW5zdGFuY2VvZiBDYW52YXNQaXhlbEFycmF5O1xuXHR0aGlzLl9pc0RhdGFWaWV3ID0gY29tcGF0aWJpbGl0eS5EYXRhVmlldyAmJiB0aGlzLl9pc0FycmF5QnVmZmVyO1xuXHR0aGlzLl9pc05vZGVCdWZmZXIgPSBjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIgJiYgYnVmZmVyIGluc3RhbmNlb2YgQnVmZmVyO1xuXG5cdC8vIEhhbmRsZSBUeXBlIEVycm9yc1xuXHRpZiAoIXRoaXMuX2lzTm9kZUJ1ZmZlciAmJiAhdGhpcy5faXNBcnJheUJ1ZmZlciAmJiAhdGhpcy5faXNQaXhlbERhdGEgJiYgIShidWZmZXIgaW5zdGFuY2VvZiBBcnJheSkpIHtcblx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdqRGF0YVZpZXcgYnVmZmVyIGhhcyBhbiBpbmNvbXBhdGlibGUgdHlwZScpO1xuXHR9XG5cblx0Ly8gRGVmYXVsdCBWYWx1ZXNcblx0dGhpcy5fbGl0dGxlRW5kaWFuID0gISFsaXR0bGVFbmRpYW47XG5cblx0dmFyIGJ1ZmZlckxlbmd0aCA9ICdieXRlTGVuZ3RoJyBpbiBidWZmZXIgPyBidWZmZXIuYnl0ZUxlbmd0aCA6IGJ1ZmZlci5sZW5ndGg7XG5cdHRoaXMuYnl0ZU9mZnNldCA9IGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIDApO1xuXHR0aGlzLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoID0gZGVmaW5lZChieXRlTGVuZ3RoLCBidWZmZXJMZW5ndGggLSBieXRlT2Zmc2V0KTtcblxuXHRpZiAoIXRoaXMuX2lzRGF0YVZpZXcpIHtcblx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBieXRlTGVuZ3RoLCBidWZmZXJMZW5ndGgpO1xuXHR9IGVsc2Uge1xuXHRcdHRoaXMuX3ZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmZmVyLCBieXRlT2Zmc2V0LCBieXRlTGVuZ3RoKTtcblx0fVxuXG5cdC8vIENyZWF0ZSB1bmlmb3JtIG1ldGhvZHMgKGFjdGlvbiB3cmFwcGVycykgZm9yIHRoZSBmb2xsb3dpbmcgZGF0YSB0eXBlc1xuXG5cdHRoaXMuX2VuZ2luZUFjdGlvbiA9XG5cdFx0dGhpcy5faXNEYXRhVmlld1xuXHRcdFx0PyB0aGlzLl9kYXRhVmlld0FjdGlvblxuXHRcdDogdGhpcy5faXNOb2RlQnVmZmVyXG5cdFx0XHQ/IHRoaXMuX25vZGVCdWZmZXJBY3Rpb25cblx0XHQ6IHRoaXMuX2lzQXJyYXlCdWZmZXJcblx0XHRcdD8gdGhpcy5fYXJyYXlCdWZmZXJBY3Rpb25cblx0XHQ6IHRoaXMuX2FycmF5QWN0aW9uO1xufVxuXG5mdW5jdGlvbiBnZXRDaGFyQ29kZXMoc3RyaW5nKSB7XG5cdGlmIChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIpIHtcblx0XHRyZXR1cm4gbmV3IEJ1ZmZlcihzdHJpbmcsICdiaW5hcnknKTtcblx0fVxuXG5cdHZhciBUeXBlID0gY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlciA/IFVpbnQ4QXJyYXkgOiBBcnJheSxcblx0XHRjb2RlcyA9IG5ldyBUeXBlKHN0cmluZy5sZW5ndGgpO1xuXG5cdGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBzdHJpbmcubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRjb2Rlc1tpXSA9IHN0cmluZy5jaGFyQ29kZUF0KGkpICYgMHhmZjtcblx0fVxuXHRyZXR1cm4gY29kZXM7XG59XG5cbi8vIG1vc3RseSBpbnRlcm5hbCBmdW5jdGlvbiBmb3Igd3JhcHBpbmcgYW55IHN1cHBvcnRlZCBpbnB1dCAoU3RyaW5nIG9yIEFycmF5LWxpa2UpIHRvIGJlc3Qgc3VpdGFibGUgYnVmZmVyIGZvcm1hdFxuakRhdGFWaWV3LndyYXBCdWZmZXIgPSBmdW5jdGlvbiAoYnVmZmVyKSB7XG5cdHN3aXRjaCAodHlwZW9mIGJ1ZmZlcikge1xuXHRcdGNhc2UgJ251bWJlcic6XG5cdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyKSB7XG5cdFx0XHRcdGJ1ZmZlciA9IG5ldyBCdWZmZXIoYnVmZmVyKTtcblx0XHRcdFx0YnVmZmVyLmZpbGwoMCk7XG5cdFx0XHR9IGVsc2Vcblx0XHRcdGlmIChjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyKSB7XG5cdFx0XHRcdGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcikuYnVmZmVyO1xuXHRcdFx0fSBlbHNlXG5cdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5QaXhlbERhdGEpIHtcblx0XHRcdFx0YnVmZmVyID0gY3JlYXRlUGl4ZWxEYXRhKGJ1ZmZlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRidWZmZXIgPSBuZXcgQXJyYXkoYnVmZmVyKTtcblx0XHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBidWZmZXIubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRidWZmZXJbaV0gPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYnVmZmVyO1xuXG5cdFx0Y2FzZSAnc3RyaW5nJzpcblx0XHRcdGJ1ZmZlciA9IGdldENoYXJDb2RlcyhidWZmZXIpO1xuXHRcdFx0LyogZmFsbHMgdGhyb3VnaCAqL1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRpZiAoJ2xlbmd0aCcgaW4gYnVmZmVyICYmICEoKGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlciAmJiBidWZmZXIgaW5zdGFuY2VvZiBCdWZmZXIpIHx8IChjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyICYmIGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB8fCAoY29tcGF0aWJpbGl0eS5QaXhlbERhdGEgJiYgYnVmZmVyIGluc3RhbmNlb2YgQ2FudmFzUGl4ZWxBcnJheSkpKSB7XG5cdFx0XHRcdGlmIChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIpIHtcblx0XHRcdFx0XHRidWZmZXIgPSBuZXcgQnVmZmVyKGJ1ZmZlcik7XG5cdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlcikge1xuXHRcdFx0XHRcdGlmICghKGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSkge1xuXHRcdFx0XHRcdFx0YnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKS5idWZmZXI7XG5cdFx0XHRcdFx0XHQvLyBidWcgaW4gTm9kZS5qcyA8PSAwLjg6XG5cdFx0XHRcdFx0XHRpZiAoIShidWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikpIHtcblx0XHRcdFx0XHRcdFx0YnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXlGcm9tKGJ1ZmZlciwgdHJ1ZSkpLmJ1ZmZlcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5QaXhlbERhdGEpIHtcblx0XHRcdFx0XHRidWZmZXIgPSBjcmVhdGVQaXhlbERhdGEoYnVmZmVyLmxlbmd0aCwgYnVmZmVyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRidWZmZXIgPSBhcnJheUZyb20oYnVmZmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJ1ZmZlcjtcblx0fVxufTtcblxuZnVuY3Rpb24gcG93MihuKSB7XG5cdHJldHVybiAobiA+PSAwICYmIG4gPCAzMSkgPyAoMSA8PCBuKSA6IChwb3cyW25dIHx8IChwb3cyW25dID0gTWF0aC5wb3coMiwgbikpKTtcbn1cblxuLy8gbGVmdCBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuakRhdGFWaWV3LmNyZWF0ZUJ1ZmZlciA9IGZ1bmN0aW9uICgpIHtcblx0cmV0dXJuIGpEYXRhVmlldy53cmFwQnVmZmVyKGFyZ3VtZW50cyk7XG59O1xuXG5mdW5jdGlvbiBVaW50NjQobG8sIGhpKSB7XG5cdHRoaXMubG8gPSBsbztcblx0dGhpcy5oaSA9IGhpO1xufVxuXG5qRGF0YVZpZXcuVWludDY0ID0gVWludDY0O1xuXG5VaW50NjQucHJvdG90eXBlID0ge1xuXHR2YWx1ZU9mOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRoaXMubG8gKyBwb3cyKDMyKSAqIHRoaXMuaGk7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gTnVtYmVyLnByb3RvdHlwZS50b1N0cmluZy5hcHBseSh0aGlzLnZhbHVlT2YoKSwgYXJndW1lbnRzKTtcblx0fVxufTtcblxuVWludDY0LmZyb21OdW1iZXIgPSBmdW5jdGlvbiAobnVtYmVyKSB7XG5cdHZhciBoaSA9IE1hdGguZmxvb3IobnVtYmVyIC8gcG93MigzMikpLFxuXHRcdGxvID0gbnVtYmVyIC0gaGkgKiBwb3cyKDMyKTtcblxuXHRyZXR1cm4gbmV3IFVpbnQ2NChsbywgaGkpO1xufTtcblxuZnVuY3Rpb24gSW50NjQobG8sIGhpKSB7XG5cdFVpbnQ2NC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xufVxuXG5qRGF0YVZpZXcuSW50NjQgPSBJbnQ2NDtcblxuSW50NjQucHJvdG90eXBlID0gJ2NyZWF0ZScgaW4gT2JqZWN0ID8gT2JqZWN0LmNyZWF0ZShVaW50NjQucHJvdG90eXBlKSA6IG5ldyBVaW50NjQoKTtcblxuSW50NjQucHJvdG90eXBlLnZhbHVlT2YgPSBmdW5jdGlvbiAoKSB7XG5cdGlmICh0aGlzLmhpIDwgcG93MigzMSkpIHtcblx0XHRyZXR1cm4gVWludDY0LnByb3RvdHlwZS52YWx1ZU9mLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdH1cblx0cmV0dXJuIC0oKHBvdzIoMzIpIC0gdGhpcy5sbykgKyBwb3cyKDMyKSAqIChwb3cyKDMyKSAtIDEgLSB0aGlzLmhpKSk7XG59O1xuXG5JbnQ2NC5mcm9tTnVtYmVyID0gZnVuY3Rpb24gKG51bWJlcikge1xuXHR2YXIgbG8sIGhpO1xuXHRpZiAobnVtYmVyID49IDApIHtcblx0XHR2YXIgdW5zaWduZWQgPSBVaW50NjQuZnJvbU51bWJlcihudW1iZXIpO1xuXHRcdGxvID0gdW5zaWduZWQubG87XG5cdFx0aGkgPSB1bnNpZ25lZC5oaTtcblx0fSBlbHNlIHtcblx0XHRoaSA9IE1hdGguZmxvb3IobnVtYmVyIC8gcG93MigzMikpO1xuXHRcdGxvID0gbnVtYmVyIC0gaGkgKiBwb3cyKDMyKTtcblx0XHRoaSArPSBwb3cyKDMyKTtcblx0fVxuXHRyZXR1cm4gbmV3IEludDY0KGxvLCBoaSk7XG59O1xuXG5qRGF0YVZpZXcucHJvdG90eXBlID0ge1xuXHRfb2Zmc2V0OiAwLFxuXHRfYml0T2Zmc2V0OiAwLFxuXG5cdGNvbXBhdGliaWxpdHk6IGNvbXBhdGliaWxpdHksXG5cblx0X2NoZWNrQm91bmRzOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCwgbWF4TGVuZ3RoKSB7XG5cdFx0Ly8gRG8gYWRkaXRpb25hbCBjaGVja3MgdG8gc2ltdWxhdGUgRGF0YVZpZXdcblx0XHRpZiAodHlwZW9mIGJ5dGVPZmZzZXQgIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdPZmZzZXQgaXMgbm90IGEgbnVtYmVyLicpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGJ5dGVMZW5ndGggIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdTaXplIGlzIG5vdCBhIG51bWJlci4nKTtcblx0XHR9XG5cdFx0aWYgKGJ5dGVMZW5ndGggPCAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgUmFuZ2VFcnJvcignTGVuZ3RoIGlzIG5lZ2F0aXZlLicpO1xuXHRcdH1cblx0XHRpZiAoYnl0ZU9mZnNldCA8IDAgfHwgYnl0ZU9mZnNldCArIGJ5dGVMZW5ndGggPiBkZWZpbmVkKG1heExlbmd0aCwgdGhpcy5ieXRlTGVuZ3RoKSkge1xuXHRcdFx0dGhyb3cgbmV3IFJhbmdlRXJyb3IoJ09mZnNldHMgYXJlIG91dCBvZiBib3VuZHMuJyk7XG5cdFx0fVxuXHR9LFxuXG5cdF9hY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5naW5lQWN0aW9uKFxuXHRcdFx0dHlwZSxcblx0XHRcdGlzUmVhZEFjdGlvbixcblx0XHRcdGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KSxcblx0XHRcdGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pLFxuXHRcdFx0dmFsdWVcblx0XHQpO1xuXHR9LFxuXG5cdF9kYXRhVmlld0FjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdC8vIE1vdmUgdGhlIGludGVybmFsIG9mZnNldCBmb3J3YXJkXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIGRhdGFUeXBlc1t0eXBlXTtcblx0XHRyZXR1cm4gaXNSZWFkQWN0aW9uID8gdGhpcy5fdmlld1snZ2V0JyArIHR5cGVdKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikgOiB0aGlzLl92aWV3WydzZXQnICsgdHlwZV0oYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X25vZGVCdWZmZXJBY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHQvLyBNb3ZlIHRoZSBpbnRlcm5hbCBvZmZzZXQgZm9yd2FyZFxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyBkYXRhVHlwZXNbdHlwZV07XG5cdFx0dmFyIG5vZGVOYW1lID0gbm9kZU5hbWluZ1t0eXBlXSArICgodHlwZSA9PT0gJ0ludDgnIHx8IHR5cGUgPT09ICdVaW50OCcpID8gJycgOiBsaXR0bGVFbmRpYW4gPyAnTEUnIDogJ0JFJyk7XG5cdFx0Ynl0ZU9mZnNldCArPSB0aGlzLmJ5dGVPZmZzZXQ7XG5cdFx0cmV0dXJuIGlzUmVhZEFjdGlvbiA/IHRoaXMuYnVmZmVyWydyZWFkJyArIG5vZGVOYW1lXShieXRlT2Zmc2V0KSA6IHRoaXMuYnVmZmVyWyd3cml0ZScgKyBub2RlTmFtZV0odmFsdWUsIGJ5dGVPZmZzZXQpO1xuXHR9LFxuXG5cdF9hcnJheUJ1ZmZlckFjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdHZhciBzaXplID0gZGF0YVR5cGVzW3R5cGVdLCBUeXBlZEFycmF5ID0gZ2xvYmFsW3R5cGUgKyAnQXJyYXknXSwgdHlwZWRBcnJheTtcblxuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXG5cdFx0Ly8gQXJyYXlCdWZmZXI6IHdlIHVzZSBhIHR5cGVkIGFycmF5IG9mIHNpemUgMSBmcm9tIG9yaWdpbmFsIGJ1ZmZlciBpZiBhbGlnbm1lbnQgaXMgZ29vZCBhbmQgZnJvbSBzbGljZSB3aGVuIGl0J3Mgbm90XG5cdFx0aWYgKHNpemUgPT09IDEgfHwgKCh0aGlzLmJ5dGVPZmZzZXQgKyBieXRlT2Zmc2V0KSAlIHNpemUgPT09IDAgJiYgbGl0dGxlRW5kaWFuKSkge1xuXHRcdFx0dHlwZWRBcnJheSA9IG5ldyBUeXBlZEFycmF5KHRoaXMuYnVmZmVyLCB0aGlzLmJ5dGVPZmZzZXQgKyBieXRlT2Zmc2V0LCAxKTtcblx0XHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyBzaXplO1xuXHRcdFx0cmV0dXJuIGlzUmVhZEFjdGlvbiA/IHR5cGVkQXJyYXlbMF0gOiAodHlwZWRBcnJheVswXSA9IHZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoaXNSZWFkQWN0aW9uID8gdGhpcy5nZXRCeXRlcyhzaXplLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpIDogc2l6ZSk7XG5cdFx0XHR0eXBlZEFycmF5ID0gbmV3IFR5cGVkQXJyYXkoYnl0ZXMuYnVmZmVyLCAwLCAxKTtcblxuXHRcdFx0aWYgKGlzUmVhZEFjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdHlwZWRBcnJheVswXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHR5cGVkQXJyYXlbMF0gPSB2YWx1ZTtcblx0XHRcdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgYnl0ZXMsIGxpdHRsZUVuZGlhbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxuXG5cdF9hcnJheUFjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdHJldHVybiBpc1JlYWRBY3Rpb24gPyB0aGlzWydfZ2V0JyArIHR5cGVdKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikgOiB0aGlzWydfc2V0JyArIHR5cGVdKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdC8vIEhlbHBlcnNcblxuXHRfZ2V0Qnl0ZXM6IGZ1bmN0aW9uIChsZW5ndGgsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cdFx0bGVuZ3RoID0gZGVmaW5lZChsZW5ndGgsIHRoaXMuYnl0ZUxlbmd0aCAtIGJ5dGVPZmZzZXQpO1xuXG5cdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgbGVuZ3RoKTtcblxuXHRcdGJ5dGVPZmZzZXQgKz0gdGhpcy5ieXRlT2Zmc2V0O1xuXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCAtIHRoaXMuYnl0ZU9mZnNldCArIGxlbmd0aDtcblxuXHRcdHZhciByZXN1bHQgPSB0aGlzLl9pc0FycmF5QnVmZmVyXG5cdFx0XHRcdFx0ID8gbmV3IFVpbnQ4QXJyYXkodGhpcy5idWZmZXIsIGJ5dGVPZmZzZXQsIGxlbmd0aClcblx0XHRcdFx0XHQgOiAodGhpcy5idWZmZXIuc2xpY2UgfHwgQXJyYXkucHJvdG90eXBlLnNsaWNlKS5jYWxsKHRoaXMuYnVmZmVyLCBieXRlT2Zmc2V0LCBieXRlT2Zmc2V0ICsgbGVuZ3RoKTtcblxuXHRcdHJldHVybiBsaXR0bGVFbmRpYW4gfHwgbGVuZ3RoIDw9IDEgPyByZXN1bHQgOiBhcnJheUZyb20ocmVzdWx0KS5yZXZlcnNlKCk7XG5cdH0sXG5cblx0Ly8gd3JhcHBlciBmb3IgZXh0ZXJuYWwgY2FsbHMgKGRvIG5vdCByZXR1cm4gaW5uZXIgYnVmZmVyIGRpcmVjdGx5IHRvIHByZXZlbnQgaXQncyBtb2RpZnlpbmcpXG5cdGdldEJ5dGVzOiBmdW5jdGlvbiAobGVuZ3RoLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRvQXJyYXkpIHtcblx0XHR2YXIgcmVzdWx0ID0gdGhpcy5fZ2V0Qnl0ZXMobGVuZ3RoLCBieXRlT2Zmc2V0LCBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdHJ1ZSkpO1xuXHRcdHJldHVybiB0b0FycmF5ID8gYXJyYXlGcm9tKHJlc3VsdCkgOiByZXN1bHQ7XG5cdH0sXG5cblx0X3NldEJ5dGVzOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgYnl0ZXMsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBsZW5ndGggPSBieXRlcy5sZW5ndGg7XG5cblx0XHQvLyBuZWVkZWQgZm9yIE9wZXJhXG5cdFx0aWYgKGxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cblx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBsZW5ndGgpO1xuXG5cdFx0aWYgKCFsaXR0bGVFbmRpYW4gJiYgbGVuZ3RoID4gMSkge1xuXHRcdFx0Ynl0ZXMgPSBhcnJheUZyb20oYnl0ZXMsIHRydWUpLnJldmVyc2UoKTtcblx0XHR9XG5cblx0XHRieXRlT2Zmc2V0ICs9IHRoaXMuYnl0ZU9mZnNldDtcblxuXHRcdGlmICh0aGlzLl9pc0FycmF5QnVmZmVyKSB7XG5cdFx0XHRuZXcgVWludDhBcnJheSh0aGlzLmJ1ZmZlciwgYnl0ZU9mZnNldCwgbGVuZ3RoKS5zZXQoYnl0ZXMpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGlmICh0aGlzLl9pc05vZGVCdWZmZXIpIHtcblx0XHRcdFx0bmV3IEJ1ZmZlcihieXRlcykuY29weSh0aGlzLmJ1ZmZlciwgYnl0ZU9mZnNldCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0dGhpcy5idWZmZXJbYnl0ZU9mZnNldCArIGldID0gYnl0ZXNbaV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0IC0gdGhpcy5ieXRlT2Zmc2V0ICsgbGVuZ3RoO1xuXHR9LFxuXG5cdHNldEJ5dGVzOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgYnl0ZXMsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIGJ5dGVzLCBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdHJ1ZSkpO1xuXHR9LFxuXG5cdGdldFN0cmluZzogZnVuY3Rpb24gKGJ5dGVMZW5ndGgsIGJ5dGVPZmZzZXQsIGVuY29kaW5nKSB7XG5cdFx0aWYgKHRoaXMuX2lzTm9kZUJ1ZmZlcikge1xuXHRcdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblx0XHRcdGJ5dGVMZW5ndGggPSBkZWZpbmVkKGJ5dGVMZW5ndGgsIHRoaXMuYnl0ZUxlbmd0aCAtIGJ5dGVPZmZzZXQpO1xuXG5cdFx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBieXRlTGVuZ3RoKTtcblxuXHRcdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIGJ5dGVMZW5ndGg7XG5cdFx0XHRyZXR1cm4gdGhpcy5idWZmZXIudG9TdHJpbmcoZW5jb2RpbmcgfHwgJ2JpbmFyeScsIHRoaXMuYnl0ZU9mZnNldCArIGJ5dGVPZmZzZXQsIHRoaXMuYnl0ZU9mZnNldCArIHRoaXMuX29mZnNldCk7XG5cdFx0fVxuXHRcdHZhciBieXRlcyA9IHRoaXMuX2dldEJ5dGVzKGJ5dGVMZW5ndGgsIGJ5dGVPZmZzZXQsIHRydWUpLCBzdHJpbmcgPSAnJztcblx0XHRieXRlTGVuZ3RoID0gYnl0ZXMubGVuZ3RoO1xuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZUxlbmd0aDsgaSsrKSB7XG5cdFx0XHRzdHJpbmcgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSk7XG5cdFx0fVxuXHRcdGlmIChlbmNvZGluZyA9PT0gJ3V0ZjgnKSB7XG5cdFx0XHRzdHJpbmcgPSBkZWNvZGVVUklDb21wb25lbnQoZXNjYXBlKHN0cmluZykpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RyaW5nO1xuXHR9LFxuXG5cdHNldFN0cmluZzogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHN1YlN0cmluZywgZW5jb2RpbmcpIHtcblx0XHRpZiAodGhpcy5faXNOb2RlQnVmZmVyKSB7XG5cdFx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXHRcdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgc3ViU3RyaW5nLmxlbmd0aCk7XG5cdFx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgdGhpcy5idWZmZXIud3JpdGUoc3ViU3RyaW5nLCB0aGlzLmJ5dGVPZmZzZXQgKyBieXRlT2Zmc2V0LCBlbmNvZGluZyB8fCAnYmluYXJ5Jyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlbmNvZGluZyA9PT0gJ3V0ZjgnKSB7XG5cdFx0XHRzdWJTdHJpbmcgPSB1bmVzY2FwZShlbmNvZGVVUklDb21wb25lbnQoc3ViU3RyaW5nKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIGdldENoYXJDb2RlcyhzdWJTdHJpbmcpLCB0cnVlKTtcblx0fSxcblxuXHRnZXRDaGFyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCkge1xuXHRcdHJldHVybiB0aGlzLmdldFN0cmluZygxLCBieXRlT2Zmc2V0KTtcblx0fSxcblxuXHRzZXRDaGFyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgY2hhcmFjdGVyKSB7XG5cdFx0dGhpcy5zZXRTdHJpbmcoYnl0ZU9mZnNldCwgY2hhcmFjdGVyKTtcblx0fSxcblxuXHR0ZWxsOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX29mZnNldDtcblx0fSxcblxuXHRzZWVrOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCkge1xuXHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIDApO1xuXHRcdC8qIGpzaGludCBib3NzOiB0cnVlICovXG5cdFx0cmV0dXJuIHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQ7XG5cdH0sXG5cblx0c2tpcDogZnVuY3Rpb24gKGJ5dGVMZW5ndGgpIHtcblx0XHRyZXR1cm4gdGhpcy5zZWVrKHRoaXMuX29mZnNldCArIGJ5dGVMZW5ndGgpO1xuXHR9LFxuXG5cdHNsaWNlOiBmdW5jdGlvbiAoc3RhcnQsIGVuZCwgZm9yY2VDb3B5KSB7XG5cdFx0ZnVuY3Rpb24gbm9ybWFsaXplT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG9mZnNldCA8IDAgPyBvZmZzZXQgKyBieXRlTGVuZ3RoIDogb2Zmc2V0O1xuXHRcdH1cblxuXHRcdHN0YXJ0ID0gbm9ybWFsaXplT2Zmc2V0KHN0YXJ0LCB0aGlzLmJ5dGVMZW5ndGgpO1xuXHRcdGVuZCA9IG5vcm1hbGl6ZU9mZnNldChkZWZpbmVkKGVuZCwgdGhpcy5ieXRlTGVuZ3RoKSwgdGhpcy5ieXRlTGVuZ3RoKTtcblxuXHRcdHJldHVybiBmb3JjZUNvcHlcblx0XHRcdCAgID8gbmV3IGpEYXRhVmlldyh0aGlzLmdldEJ5dGVzKGVuZCAtIHN0YXJ0LCBzdGFydCwgdHJ1ZSwgdHJ1ZSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLl9saXR0bGVFbmRpYW4pXG5cdFx0XHQgICA6IG5ldyBqRGF0YVZpZXcodGhpcy5idWZmZXIsIHRoaXMuYnl0ZU9mZnNldCArIHN0YXJ0LCBlbmQgLSBzdGFydCwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRhbGlnbkJ5OiBmdW5jdGlvbiAoYnl0ZUNvdW50KSB7XG5cdFx0dGhpcy5fYml0T2Zmc2V0ID0gMDtcblx0XHRpZiAoZGVmaW5lZChieXRlQ291bnQsIDEpICE9PSAxKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5za2lwKGJ5dGVDb3VudCAtICh0aGlzLl9vZmZzZXQgJSBieXRlQ291bnQgfHwgYnl0ZUNvdW50KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9vZmZzZXQ7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIENvbXBhdGliaWxpdHkgZnVuY3Rpb25zXG5cblx0X2dldEZsb2F0NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgYiA9IHRoaXMuX2dldEJ5dGVzKDgsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiksXG5cblx0XHRcdHNpZ24gPSAxIC0gKDIgKiAoYls3XSA+PiA3KSksXG5cdFx0XHRleHBvbmVudCA9ICgoKChiWzddIDw8IDEpICYgMHhmZikgPDwgMykgfCAoYls2XSA+PiA0KSkgLSAoKDEgPDwgMTApIC0gMSksXG5cblx0XHQvLyBCaW5hcnkgb3BlcmF0b3JzIHN1Y2ggYXMgfCBhbmQgPDwgb3BlcmF0ZSBvbiAzMiBiaXQgdmFsdWVzLCB1c2luZyArIGFuZCBNYXRoLnBvdygyKSBpbnN0ZWFkXG5cdFx0XHRtYW50aXNzYSA9ICgoYls2XSAmIDB4MGYpICogcG93Mig0OCkpICsgKGJbNV0gKiBwb3cyKDQwKSkgKyAoYls0XSAqIHBvdzIoMzIpKSArXG5cdFx0XHRcdFx0XHQoYlszXSAqIHBvdzIoMjQpKSArIChiWzJdICogcG93MigxNikpICsgKGJbMV0gKiBwb3cyKDgpKSArIGJbMF07XG5cblx0XHRpZiAoZXhwb25lbnQgPT09IDEwMjQpIHtcblx0XHRcdGlmIChtYW50aXNzYSAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gTmFOO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHNpZ24gKiBJbmZpbml0eTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXhwb25lbnQgPT09IC0xMDIzKSB7IC8vIERlbm9ybWFsaXplZFxuXHRcdFx0cmV0dXJuIHNpZ24gKiBtYW50aXNzYSAqIHBvdzIoLTEwMjIgLSA1Mik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNpZ24gKiAoMSArIG1hbnRpc3NhICogcG93MigtNTIpKSAqIHBvdzIoZXhwb25lbnQpO1xuXHR9LFxuXG5cdF9nZXRGbG9hdDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGIgPSB0aGlzLl9nZXRCeXRlcyg0LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pLFxuXG5cdFx0XHRzaWduID0gMSAtICgyICogKGJbM10gPj4gNykpLFxuXHRcdFx0ZXhwb25lbnQgPSAoKChiWzNdIDw8IDEpICYgMHhmZikgfCAoYlsyXSA+PiA3KSkgLSAxMjcsXG5cdFx0XHRtYW50aXNzYSA9ICgoYlsyXSAmIDB4N2YpIDw8IDE2KSB8IChiWzFdIDw8IDgpIHwgYlswXTtcblxuXHRcdGlmIChleHBvbmVudCA9PT0gMTI4KSB7XG5cdFx0XHRpZiAobWFudGlzc2EgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIE5hTjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBzaWduICogSW5maW5pdHk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGV4cG9uZW50ID09PSAtMTI3KSB7IC8vIERlbm9ybWFsaXplZFxuXHRcdFx0cmV0dXJuIHNpZ24gKiBtYW50aXNzYSAqIHBvdzIoLTEyNiAtIDIzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc2lnbiAqICgxICsgbWFudGlzc2EgKiBwb3cyKC0yMykpICogcG93MihleHBvbmVudCk7XG5cdH0sXG5cblx0X2dldDY0OiBmdW5jdGlvbiAoVHlwZSwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0bGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblxuXHRcdHZhciBwYXJ0cyA9IGxpdHRsZUVuZGlhbiA/IFswLCA0XSA6IFs0LCAwXTtcblxuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgMjsgaSsrKSB7XG5cdFx0XHRwYXJ0c1tpXSA9IHRoaXMuZ2V0VWludDMyKGJ5dGVPZmZzZXQgKyBwYXJ0c1tpXSwgbGl0dGxlRW5kaWFuKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgODtcblxuXHRcdHJldHVybiBuZXcgVHlwZShwYXJ0c1swXSwgcGFydHNbMV0pO1xuXHR9LFxuXG5cdGdldEludDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldDY0KEludDY0LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdGdldFVpbnQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHJldHVybiB0aGlzLl9nZXQ2NChVaW50NjQsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X2dldEludDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGIgPSB0aGlzLl9nZXRCeXRlcyg0LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHRcdHJldHVybiAoYlszXSA8PCAyNCkgfCAoYlsyXSA8PCAxNikgfCAoYlsxXSA8PCA4KSB8IGJbMF07XG5cdH0sXG5cblx0X2dldFVpbnQzMjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHJldHVybiB0aGlzLl9nZXRJbnQzMihieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pID4+PiAwO1xuXHR9LFxuXG5cdF9nZXRJbnQxNjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHJldHVybiAodGhpcy5fZ2V0VWludDE2KGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikgPDwgMTYpID4+IDE2O1xuXHR9LFxuXG5cdF9nZXRVaW50MTY6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgYiA9IHRoaXMuX2dldEJ5dGVzKDIsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdFx0cmV0dXJuIChiWzFdIDw8IDgpIHwgYlswXTtcblx0fSxcblxuXHRfZ2V0SW50ODogZnVuY3Rpb24gKGJ5dGVPZmZzZXQpIHtcblx0XHRyZXR1cm4gKHRoaXMuX2dldFVpbnQ4KGJ5dGVPZmZzZXQpIDw8IDI0KSA+PiAyNDtcblx0fSxcblxuXHRfZ2V0VWludDg6IGZ1bmN0aW9uIChieXRlT2Zmc2V0KSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJ5dGVzKDEsIGJ5dGVPZmZzZXQpWzBdO1xuXHR9LFxuXG5cdF9nZXRCaXRSYW5nZURhdGE6IGZ1bmN0aW9uIChiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpIHtcblx0XHR2YXIgc3RhcnRCaXQgPSAoZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpIDw8IDMpICsgdGhpcy5fYml0T2Zmc2V0LFxuXHRcdFx0ZW5kQml0ID0gc3RhcnRCaXQgKyBiaXRMZW5ndGgsXG5cdFx0XHRzdGFydCA9IHN0YXJ0Qml0ID4+PiAzLFxuXHRcdFx0ZW5kID0gKGVuZEJpdCArIDcpID4+PiAzLFxuXHRcdFx0YiA9IHRoaXMuX2dldEJ5dGVzKGVuZCAtIHN0YXJ0LCBzdGFydCwgdHJ1ZSksXG5cdFx0XHR3aWRlVmFsdWUgPSAwO1xuXG5cdFx0LyoganNoaW50IGJvc3M6IHRydWUgKi9cblx0XHRpZiAodGhpcy5fYml0T2Zmc2V0ID0gZW5kQml0ICYgNykge1xuXHRcdFx0dGhpcy5fYml0T2Zmc2V0IC09IDg7XG5cdFx0fVxuXG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGIubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdHdpZGVWYWx1ZSA9ICh3aWRlVmFsdWUgPDwgOCkgfCBiW2ldO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydDogc3RhcnQsXG5cdFx0XHRieXRlczogYixcblx0XHRcdHdpZGVWYWx1ZTogd2lkZVZhbHVlXG5cdFx0fTtcblx0fSxcblxuXHRnZXRTaWduZWQ6IGZ1bmN0aW9uIChiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpIHtcblx0XHR2YXIgc2hpZnQgPSAzMiAtIGJpdExlbmd0aDtcblx0XHRyZXR1cm4gKHRoaXMuZ2V0VW5zaWduZWQoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KSA8PCBzaGlmdCkgPj4gc2hpZnQ7XG5cdH0sXG5cblx0Z2V0VW5zaWduZWQ6IGZ1bmN0aW9uIChiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpIHtcblx0XHR2YXIgdmFsdWUgPSB0aGlzLl9nZXRCaXRSYW5nZURhdGEoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KS53aWRlVmFsdWUgPj4+IC10aGlzLl9iaXRPZmZzZXQ7XG5cdFx0cmV0dXJuIGJpdExlbmd0aCA8IDMyID8gKHZhbHVlICYgfigtMSA8PCBiaXRMZW5ndGgpKSA6IHZhbHVlO1xuXHR9LFxuXG5cdF9zZXRCaW5hcnlGbG9hdDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBtYW50U2l6ZSwgZXhwU2l6ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIHNpZ25CaXQgPSB2YWx1ZSA8IDAgPyAxIDogMCxcblx0XHRcdGV4cG9uZW50LFxuXHRcdFx0bWFudGlzc2EsXG5cdFx0XHRlTWF4ID0gfigtMSA8PCAoZXhwU2l6ZSAtIDEpKSxcblx0XHRcdGVNaW4gPSAxIC0gZU1heDtcblxuXHRcdGlmICh2YWx1ZSA8IDApIHtcblx0XHRcdHZhbHVlID0gLXZhbHVlO1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZSA9PT0gMCkge1xuXHRcdFx0ZXhwb25lbnQgPSAwO1xuXHRcdFx0bWFudGlzc2EgPSAwO1xuXHRcdH0gZWxzZSBpZiAoaXNOYU4odmFsdWUpKSB7XG5cdFx0XHRleHBvbmVudCA9IDIgKiBlTWF4ICsgMTtcblx0XHRcdG1hbnRpc3NhID0gMTtcblx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSBJbmZpbml0eSkge1xuXHRcdFx0ZXhwb25lbnQgPSAyICogZU1heCArIDE7XG5cdFx0XHRtYW50aXNzYSA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGV4cG9uZW50ID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMik7XG5cdFx0XHRpZiAoZXhwb25lbnQgPj0gZU1pbiAmJiBleHBvbmVudCA8PSBlTWF4KSB7XG5cdFx0XHRcdG1hbnRpc3NhID0gTWF0aC5mbG9vcigodmFsdWUgKiBwb3cyKC1leHBvbmVudCkgLSAxKSAqIHBvdzIobWFudFNpemUpKTtcblx0XHRcdFx0ZXhwb25lbnQgKz0gZU1heDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1hbnRpc3NhID0gTWF0aC5mbG9vcih2YWx1ZSAvIHBvdzIoZU1pbiAtIG1hbnRTaXplKSk7XG5cdFx0XHRcdGV4cG9uZW50ID0gMDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR2YXIgYiA9IFtdO1xuXHRcdHdoaWxlIChtYW50U2l6ZSA+PSA4KSB7XG5cdFx0XHRiLnB1c2gobWFudGlzc2EgJSAyNTYpO1xuXHRcdFx0bWFudGlzc2EgPSBNYXRoLmZsb29yKG1hbnRpc3NhIC8gMjU2KTtcblx0XHRcdG1hbnRTaXplIC09IDg7XG5cdFx0fVxuXHRcdGV4cG9uZW50ID0gKGV4cG9uZW50IDw8IG1hbnRTaXplKSB8IG1hbnRpc3NhO1xuXHRcdGV4cFNpemUgKz0gbWFudFNpemU7XG5cdFx0d2hpbGUgKGV4cFNpemUgPj0gOCkge1xuXHRcdFx0Yi5wdXNoKGV4cG9uZW50ICYgMHhmZik7XG5cdFx0XHRleHBvbmVudCA+Pj49IDg7XG5cdFx0XHRleHBTaXplIC09IDg7XG5cdFx0fVxuXHRcdGIucHVzaCgoc2lnbkJpdCA8PCBleHBTaXplKSB8IGV4cG9uZW50KTtcblxuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIGIsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldEZsb2F0MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0QmluYXJ5RmxvYXQoYnl0ZU9mZnNldCwgdmFsdWUsIDIzLCA4LCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRGbG9hdDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJpbmFyeUZsb2F0KGJ5dGVPZmZzZXQsIHZhbHVlLCA1MiwgMTEsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldDY0OiBmdW5jdGlvbiAoVHlwZSwgYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdGlmICghKHZhbHVlIGluc3RhbmNlb2YgVHlwZSkpIHtcblx0XHRcdHZhbHVlID0gVHlwZS5mcm9tTnVtYmVyKHZhbHVlKTtcblx0XHR9XG5cblx0XHRsaXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXG5cdFx0dmFyIHBhcnRzID0gbGl0dGxlRW5kaWFuID8ge2xvOiAwLCBoaTogNH0gOiB7bG86IDQsIGhpOiAwfTtcblxuXHRcdGZvciAodmFyIHBhcnROYW1lIGluIHBhcnRzKSB7XG5cdFx0XHR0aGlzLnNldFVpbnQzMihieXRlT2Zmc2V0ICsgcGFydHNbcGFydE5hbWVdLCB2YWx1ZVtwYXJ0TmFtZV0sIGxpdHRsZUVuZGlhbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIDg7XG5cdH0sXG5cblx0c2V0SW50NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0NjQoSW50NjQsIGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdHNldFVpbnQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXQ2NChVaW50NjQsIGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRVaW50MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgW1xuXHRcdFx0dmFsdWUgJiAweGZmLFxuXHRcdFx0KHZhbHVlID4+PiA4KSAmIDB4ZmYsXG5cdFx0XHQodmFsdWUgPj4+IDE2KSAmIDB4ZmYsXG5cdFx0XHR2YWx1ZSA+Pj4gMjRcblx0XHRdLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRVaW50MTY6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgW1xuXHRcdFx0dmFsdWUgJiAweGZmLFxuXHRcdFx0KHZhbHVlID4+PiA4KSAmIDB4ZmZcblx0XHRdLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRVaW50ODogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlKSB7XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgW3ZhbHVlICYgMHhmZl0pO1xuXHR9LFxuXG5cdHNldFVuc2lnbmVkOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGJpdExlbmd0aCkge1xuXHRcdHZhciBkYXRhID0gdGhpcy5fZ2V0Qml0UmFuZ2VEYXRhKGJpdExlbmd0aCwgYnl0ZU9mZnNldCksXG5cdFx0XHR3aWRlVmFsdWUgPSBkYXRhLndpZGVWYWx1ZSxcblx0XHRcdGIgPSBkYXRhLmJ5dGVzO1xuXG5cdFx0d2lkZVZhbHVlICY9IH4ofigtMSA8PCBiaXRMZW5ndGgpIDw8IC10aGlzLl9iaXRPZmZzZXQpOyAvLyBjbGVhcmluZyBiaXQgcmFuZ2UgYmVmb3JlIGJpbmFyeSBcIm9yXCJcblx0XHR3aWRlVmFsdWUgfD0gKGJpdExlbmd0aCA8IDMyID8gKHZhbHVlICYgfigtMSA8PCBiaXRMZW5ndGgpKSA6IHZhbHVlKSA8PCAtdGhpcy5fYml0T2Zmc2V0OyAvLyBzZXR0aW5nIGJpdHNcblxuXHRcdGZvciAodmFyIGkgPSBiLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRiW2ldID0gd2lkZVZhbHVlICYgMHhmZjtcblx0XHRcdHdpZGVWYWx1ZSA+Pj49IDg7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2V0Qnl0ZXMoZGF0YS5zdGFydCwgYiwgdHJ1ZSk7XG5cdH1cbn07XG5cbnZhciBwcm90byA9IGpEYXRhVmlldy5wcm90b3R5cGU7XG5cbmZvciAodmFyIHR5cGUgaW4gZGF0YVR5cGVzKSB7XG5cdChmdW5jdGlvbiAodHlwZSkge1xuXHRcdHByb3RvWydnZXQnICsgdHlwZV0gPSBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uKHR5cGUsIHRydWUsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdFx0fTtcblx0XHRwcm90b1snc2V0JyArIHR5cGVdID0gZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHRcdHRoaXMuX2FjdGlvbih0eXBlLCBmYWxzZSwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSk7XG5cdFx0fTtcblx0fSkodHlwZSk7XG59XG5cbnByb3RvLl9zZXRJbnQzMiA9IHByb3RvLl9zZXRVaW50MzI7XG5wcm90by5fc2V0SW50MTYgPSBwcm90by5fc2V0VWludDE2O1xucHJvdG8uX3NldEludDggPSBwcm90by5fc2V0VWludDg7XG5wcm90by5zZXRTaWduZWQgPSBwcm90by5zZXRVbnNpZ25lZDtcblxuZm9yICh2YXIgbWV0aG9kIGluIHByb3RvKSB7XG5cdGlmIChtZXRob2Quc2xpY2UoMCwgMykgPT09ICdzZXQnKSB7XG5cdFx0KGZ1bmN0aW9uICh0eXBlKSB7XG5cdFx0XHRwcm90b1snd3JpdGUnICsgdHlwZV0gPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdEFycmF5LnByb3RvdHlwZS51bnNoaWZ0LmNhbGwoYXJndW1lbnRzLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzWydzZXQnICsgdHlwZV0uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRcdH07XG5cdFx0fSkobWV0aG9kLnNsaWNlKDMpKTtcblx0fVxufVxuXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzID09PSAnb2JqZWN0Jykge1xuXHRtb2R1bGUuZXhwb3J0cyA9IGpEYXRhVmlldztcbn0gZWxzZVxuaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuXHRkZWZpbmUoW10sIGZ1bmN0aW9uICgpIHsgcmV0dXJuIGpEYXRhVmlldyB9KTtcbn0gZWxzZSB7XG5cdHZhciBvbGRHbG9iYWwgPSBnbG9iYWwuakRhdGFWaWV3O1xuXHQoZ2xvYmFsLmpEYXRhVmlldyA9IGpEYXRhVmlldykubm9Db25mbGljdCA9IGZ1bmN0aW9uICgpIHtcblx0XHRnbG9iYWwuakRhdGFWaWV3ID0gb2xkR2xvYmFsO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xufVxuXG59KSgoZnVuY3Rpb24gKCkgeyAvKiBqc2hpbnQgc3RyaWN0OiBmYWxzZSAqLyByZXR1cm4gdGhpcyB9KSgpKTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcikiLG51bGwsIi8qIVxuICogVGhlIGJ1ZmZlciBtb2R1bGUgZnJvbSBub2RlLmpzLCBmb3IgdGhlIGJyb3dzZXIuXG4gKlxuICogQGF1dGhvciAgIEZlcm9zcyBBYm91a2hhZGlqZWggPGZlcm9zc0BmZXJvc3Mub3JnPiA8aHR0cDovL2Zlcm9zcy5vcmc+XG4gKiBAbGljZW5zZSAgTUlUXG4gKi9cblxudmFyIGJhc2U2NCA9IHJlcXVpcmUoJ2Jhc2U2NC1qcycpXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKVxudmFyIGlzQXJyYXkgPSByZXF1aXJlKCdpcy1hcnJheScpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MiAvLyBub3QgdXNlZCBieSB0aGlzIGltcGxlbWVudGF0aW9uXG5cbnZhciBrTWF4TGVuZ3RoID0gMHgzZmZmZmZmZlxuXG4vKipcbiAqIElmIGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGA6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChtb3N0IGNvbXBhdGlibGUsIGV2ZW4gSUU2KVxuICpcbiAqIEJyb3dzZXJzIHRoYXQgc3VwcG9ydCB0eXBlZCBhcnJheXMgYXJlIElFIDEwKywgRmlyZWZveCA0KywgQ2hyb21lIDcrLCBTYWZhcmkgNS4xKyxcbiAqIE9wZXJhIDExLjYrLCBpT1MgNC4yKy5cbiAqXG4gKiBOb3RlOlxuICpcbiAqIC0gSW1wbGVtZW50YXRpb24gbXVzdCBzdXBwb3J0IGFkZGluZyBuZXcgcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzLlxuICogICBGaXJlZm94IDQtMjkgbGFja2VkIHN1cHBvcnQsIGZpeGVkIGluIEZpcmVmb3ggMzArLlxuICogICBTZWU6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOC5cbiAqXG4gKiAgLSBDaHJvbWUgOS0xMCBpcyBtaXNzaW5nIHRoZSBgVHlwZWRBcnJheS5wcm90b3R5cGUuc3ViYXJyYXlgIGZ1bmN0aW9uLlxuICpcbiAqICAtIElFMTAgaGFzIGEgYnJva2VuIGBUeXBlZEFycmF5LnByb3RvdHlwZS5zdWJhcnJheWAgZnVuY3Rpb24gd2hpY2ggcmV0dXJucyBhcnJheXMgb2ZcbiAqICAgIGluY29ycmVjdCBsZW5ndGggaW4gc29tZSBzaXR1YXRpb25zLlxuICpcbiAqIFdlIGRldGVjdCB0aGVzZSBidWdneSBicm93c2VycyBhbmQgc2V0IGBCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVGAgdG8gYGZhbHNlYCBzbyB0aGV5IHdpbGxcbiAqIGdldCB0aGUgT2JqZWN0IGltcGxlbWVudGF0aW9uLCB3aGljaCBpcyBzbG93ZXIgYnV0IHdpbGwgd29yayBjb3JyZWN0bHkuXG4gKi9cbkJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUID0gKGZ1bmN0aW9uICgpIHtcbiAgdHJ5IHtcbiAgICB2YXIgYnVmID0gbmV3IEFycmF5QnVmZmVyKDApXG4gICAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KGJ1ZilcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpICYmIC8vIHR5cGVkIGFycmF5IGluc3RhbmNlcyBjYW4gYmUgYXVnbWVudGVkXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgJiYgLy8gY2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gICAgICAgIG5ldyBVaW50OEFycmF5KDEpLnN1YmFycmF5KDEsIDEpLmJ5dGVMZW5ndGggPT09IDAgLy8gaWUxMCBoYXMgYnJva2VuIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IHN1YmplY3QgPiAwID8gc3ViamVjdCA+Pj4gMCA6IDBcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBpZiAoZW5jb2RpbmcgPT09ICdiYXNlNjQnKVxuICAgICAgc3ViamVjdCA9IGJhc2U2NGNsZWFuKHN1YmplY3QpXG4gICAgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoc3ViamVjdCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcgJiYgc3ViamVjdCAhPT0gbnVsbCkgeyAvLyBhc3N1bWUgb2JqZWN0IGlzIGFycmF5LWxpa2VcbiAgICBpZiAoc3ViamVjdC50eXBlID09PSAnQnVmZmVyJyAmJiBpc0FycmF5KHN1YmplY3QuZGF0YSkpXG4gICAgICBzdWJqZWN0ID0gc3ViamVjdC5kYXRhXG4gICAgbGVuZ3RoID0gK3N1YmplY3QubGVuZ3RoID4gMCA/IE1hdGguZmxvb3IoK3N1YmplY3QubGVuZ3RoKSA6IDBcbiAgfSBlbHNlXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignbXVzdCBzdGFydCB3aXRoIG51bWJlciwgYnVmZmVyLCBhcnJheSBvciBzdHJpbmcnKVxuXG4gIGlmICh0aGlzLmxlbmd0aCA+IGtNYXhMZW5ndGgpXG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0F0dGVtcHQgdG8gYWxsb2NhdGUgQnVmZmVyIGxhcmdlciB0aGFuIG1heGltdW0gJyArXG4gICAgICAnc2l6ZTogMHgnICsga01heExlbmd0aC50b1N0cmluZygxNikgKyAnIGJ5dGVzJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBCdWZmZXIuX2F1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIFRISVMgaW5zdGFuY2Ugb2YgQnVmZmVyIChjcmVhdGVkIGJ5IGBuZXdgKVxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gICAgYnVmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCAmJiB0eXBlb2Ygc3ViamVjdC5ieXRlTGVuZ3RoID09PSAnbnVtYmVyJykge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIHR5cGVkIGFycmF5XG4gICAgYnVmLl9zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgaWYgKEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSkge1xuICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspXG4gICAgICAgIGJ1ZltpXSA9ICgoc3ViamVjdFtpXSAlIDI1NikgKyAyNTYpICUgMjU2XG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCAmJiAhbm9aZXJvKSB7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBidWZbaV0gPSAwXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGJ1ZlxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiAoYikge1xuICByZXR1cm4gISEoYiAhPSBudWxsICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuY29tcGFyZSA9IGZ1bmN0aW9uIChhLCBiKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGEpIHx8ICFCdWZmZXIuaXNCdWZmZXIoYikpXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIG11c3QgYmUgQnVmZmVycycpXG5cbiAgdmFyIHggPSBhLmxlbmd0aFxuICB2YXIgeSA9IGIubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwLCBsZW4gPSBNYXRoLm1pbih4LCB5KTsgaSA8IGxlbiAmJiBhW2ldID09PSBiW2ldOyBpKyspIHt9XG4gIGlmIChpICE9PSBsZW4pIHtcbiAgICB4ID0gYVtpXVxuICAgIHkgPSBiW2ldXG4gIH1cbiAgaWYgKHggPCB5KSByZXR1cm4gLTFcbiAgaWYgKHkgPCB4KSByZXR1cm4gMVxuICByZXR1cm4gMFxufVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBpZiAoIWlzQXJyYXkobGlzdCkpIHRocm93IG5ldyBUeXBlRXJyb3IoJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3RbLCBsZW5ndGhdKScpXG5cbiAgaWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoMClcbiAgfSBlbHNlIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBsaXN0WzBdXG4gIH1cblxuICB2YXIgaVxuICBpZiAodG90YWxMZW5ndGggPT09IHVuZGVmaW5lZCkge1xuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICB0b3RhbExlbmd0aCArPSBsaXN0W2ldLmxlbmd0aFxuICAgIH1cbiAgfVxuXG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHRvdGFsTGVuZ3RoKVxuICB2YXIgcG9zID0gMFxuICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBpdGVtID0gbGlzdFtpXVxuICAgIGl0ZW0uY29weShidWYsIHBvcylcbiAgICBwb3MgKz0gaXRlbS5sZW5ndGhcbiAgfVxuICByZXR1cm4gYnVmXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldFxuICBzdHIgPSBzdHIgKyAnJ1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoICogMlxuICAgICAgYnJlYWtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCA+Pj4gMVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICB9XG4gIHJldHVybiByZXRcbn1cblxuLy8gcHJlLXNldCBmb3IgdmFsdWVzIHRoYXQgbWF5IGV4aXN0IGluIHRoZSBmdXR1cmVcbkJ1ZmZlci5wcm90b3R5cGUubGVuZ3RoID0gdW5kZWZpbmVkXG5CdWZmZXIucHJvdG90eXBlLnBhcmVudCA9IHVuZGVmaW5lZFxuXG4vLyB0b1N0cmluZyhlbmNvZGluZywgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsb3dlcmVkQ2FzZSA9IGZhbHNlXG5cbiAgc3RhcnQgPSBzdGFydCA+Pj4gMFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCB8fCBlbmQgPT09IEluZmluaXR5ID8gdGhpcy5sZW5ndGggOiBlbmQgPj4+IDBcblxuICBpZiAoIWVuY29kaW5nKSBlbmNvZGluZyA9ICd1dGY4J1xuICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IDBcbiAgaWYgKGVuZCA+IHRoaXMubGVuZ3RoKSBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAoZW5kIDw9IHN0YXJ0KSByZXR1cm4gJydcblxuICB3aGlsZSAodHJ1ZSkge1xuICAgIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICAgIGNhc2UgJ2hleCc6XG4gICAgICAgIHJldHVybiBoZXhTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICd1dGY4JzpcbiAgICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgICAgcmV0dXJuIHV0ZjhTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdhc2NpaSc6XG4gICAgICAgIHJldHVybiBhc2NpaVNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICAgIHJldHVybiBiaW5hcnlTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgICByZXR1cm4gYmFzZTY0U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAndWNzMic6XG4gICAgICBjYXNlICd1Y3MtMic6XG4gICAgICBjYXNlICd1dGYxNmxlJzpcbiAgICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgICAgcmV0dXJuIHV0ZjE2bGVTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZiAobG93ZXJlZENhc2UpXG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKVxuICAgICAgICBlbmNvZGluZyA9IChlbmNvZGluZyArICcnKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgIGxvd2VyZWRDYXNlID0gdHJ1ZVxuICAgIH1cbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uIChiKSB7XG4gIGlmKCFCdWZmZXIuaXNCdWZmZXIoYikpIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50IG11c3QgYmUgYSBCdWZmZXInKVxuICByZXR1cm4gQnVmZmVyLmNvbXBhcmUodGhpcywgYikgPT09IDBcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc3RyID0gJydcbiAgdmFyIG1heCA9IGV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVNcbiAgaWYgKHRoaXMubGVuZ3RoID4gMCkge1xuICAgIHN0ciA9IHRoaXMudG9TdHJpbmcoJ2hleCcsIDAsIG1heCkubWF0Y2goLy57Mn0vZykuam9pbignICcpXG4gICAgaWYgKHRoaXMubGVuZ3RoID4gbWF4KVxuICAgICAgc3RyICs9ICcgLi4uICdcbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIHN0ciArICc+J1xufVxuXG5CdWZmZXIucHJvdG90eXBlLmNvbXBhcmUgPSBmdW5jdGlvbiAoYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihiKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnQgbXVzdCBiZSBhIEJ1ZmZlcicpXG4gIHJldHVybiBCdWZmZXIuY29tcGFyZSh0aGlzLCBiKVxufVxuXG4vLyBgZ2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuZnVuY3Rpb24gaGV4V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICBvZmZzZXQgPSBOdW1iZXIob2Zmc2V0KSB8fCAwXG4gIHZhciByZW1haW5pbmcgPSBidWYubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cblxuICAvLyBtdXN0IGJlIGFuIGV2ZW4gbnVtYmVyIG9mIGRpZ2l0c1xuICB2YXIgc3RyTGVuID0gc3RyaW5nLmxlbmd0aFxuICBpZiAoc3RyTGVuICUgMiAhPT0gMCkgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBpZiAoaXNOYU4oYnl0ZSkpIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIodXRmOFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBhc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gYmluYXJ5V3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICByZXR1cm4gYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGJhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IGJsaXRCdWZmZXIoYmFzZTY0VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBibGl0QnVmZmVyKHV0ZjE2bGVUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gaGV4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IGFzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IGJpbmFyeVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgICByZXQgPSBiYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gdXRmMTZsZVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdVbmtub3duIGVuY29kaW5nOiAnICsgZW5jb2RpbmcpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHtcbiAgICB0eXBlOiAnQnVmZmVyJyxcbiAgICBkYXRhOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9hcnIgfHwgdGhpcywgMClcbiAgfVxufVxuXG5mdW5jdGlvbiBiYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIGFzY2lpU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgcmV0ID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gYmluYXJ5U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICByZXR1cm4gYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIGhleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGJ5dGVzID0gYnVmLnNsaWNlKHN0YXJ0LCBlbmQpXG4gIHZhciByZXMgPSAnJ1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0gKyBieXRlc1tpICsgMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gfn5zdGFydFxuICBlbmQgPSBlbmQgPT09IHVuZGVmaW5lZCA/IGxlbiA6IH5+ZW5kXG5cbiAgaWYgKHN0YXJ0IDwgMCkge1xuICAgIHN0YXJ0ICs9IGxlbjtcbiAgICBpZiAoc3RhcnQgPCAwKVxuICAgICAgc3RhcnQgPSAwXG4gIH0gZWxzZSBpZiAoc3RhcnQgPiBsZW4pIHtcbiAgICBzdGFydCA9IGxlblxuICB9XG5cbiAgaWYgKGVuZCA8IDApIHtcbiAgICBlbmQgKz0gbGVuXG4gICAgaWYgKGVuZCA8IDApXG4gICAgICBlbmQgPSAwXG4gIH0gZWxzZSBpZiAoZW5kID4gbGVuKSB7XG4gICAgZW5kID0gbGVuXG4gIH1cblxuICBpZiAoZW5kIDwgc3RhcnQpXG4gICAgZW5kID0gc3RhcnRcblxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICByZXR1cm4gQnVmZmVyLl9hdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG4vKlxuICogTmVlZCB0byBtYWtlIHN1cmUgdGhhdCBidWZmZXIgaXNuJ3QgdHJ5aW5nIHRvIHdyaXRlIG91dCBvZiBib3VuZHMuXG4gKi9cbmZ1bmN0aW9uIGNoZWNrT2Zmc2V0IChvZmZzZXQsIGV4dCwgbGVuZ3RoKSB7XG4gIGlmICgob2Zmc2V0ICUgMSkgIT09IDAgfHwgb2Zmc2V0IDwgMClcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignb2Zmc2V0IGlzIG5vdCB1aW50JylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGxlbmd0aClcbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignVHJ5aW5nIHRvIGFjY2VzcyBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDEsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gdGhpc1tvZmZzZXRdIHwgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDgpIHwgdGhpc1tvZmZzZXQgKyAxXVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKCh0aGlzW29mZnNldF0pIHxcbiAgICAgICh0aGlzW29mZnNldCArIDFdIDw8IDgpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDJdIDw8IDE2KSkgK1xuICAgICAgKHRoaXNbb2Zmc2V0ICsgM10gKiAweDEwMDAwMDApXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdICogMHgxMDAwMDAwKSArXG4gICAgICAoKHRoaXNbb2Zmc2V0ICsgMV0gPDwgMTYpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDJdIDw8IDgpIHxcbiAgICAgIHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMSwgdGhpcy5sZW5ndGgpXG4gIGlmICghKHRoaXNbb2Zmc2V0XSAmIDB4ODApKVxuICAgIHJldHVybiAodGhpc1tvZmZzZXRdKVxuICByZXR1cm4gKCgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMSlcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0XSB8ICh0aGlzW29mZnNldCArIDFdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgdmFyIHZhbCA9IHRoaXNbb2Zmc2V0ICsgMV0gfCAodGhpc1tvZmZzZXRdIDw8IDgpXG4gIHJldHVybiAodmFsICYgMHg4MDAwKSA/IHZhbCB8IDB4RkZGRjAwMDAgOiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgOCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgMTYpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDNdIDw8IDI0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuXG4gIHJldHVybiAodGhpc1tvZmZzZXRdIDw8IDI0KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAxXSA8PCAxNikgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMl0gPDwgOCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgM10pXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCB0cnVlLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIGllZWU3NTQucmVhZCh0aGlzLCBvZmZzZXQsIGZhbHNlLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCB0cnVlLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgOCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCBmYWxzZSwgNTIsIDgpXG59XG5cbmZ1bmN0aW9uIGNoZWNrSW50IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYnVmKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignYnVmZmVyIG11c3QgYmUgYSBCdWZmZXIgaW5zdGFuY2UnKVxuICBpZiAodmFsdWUgPiBtYXggfHwgdmFsdWUgPCBtaW4pIHRocm93IG5ldyBUeXBlRXJyb3IoJ3ZhbHVlIGlzIG91dCBvZiBib3VuZHMnKVxuICBpZiAob2Zmc2V0ICsgZXh0ID4gYnVmLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignaW5kZXggb3V0IG9mIHJhbmdlJylcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDEsIDB4ZmYsIDApXG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHZhbHVlID0gTWF0aC5mbG9vcih2YWx1ZSlcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuZnVuY3Rpb24gb2JqZWN0V3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmICsgdmFsdWUgKyAxXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4oYnVmLmxlbmd0aCAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4ZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4ZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSB2YWx1ZVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbmZ1bmN0aW9uIG9iamVjdFdyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDFcbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihidWYubGVuZ3RoIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9ICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHhmZmZmZmZmZiwgMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4ZmZmZmZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gMjQpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gMTYpXG4gICAgdGhpc1tvZmZzZXQgKyAyXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDNdID0gdmFsdWVcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICByZXR1cm4gb2Zmc2V0ICsgNFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAxLCAweDdmLCAtMHg4MClcbiAgaWYgKCFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkgdmFsdWUgPSBNYXRoLmZsb29yKHZhbHVlKVxuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmYgKyB2YWx1ZSArIDFcbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgcmV0dXJuIG9mZnNldCArIDFcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHg3ZmZmLCAtMHg4MDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSB2YWx1ZVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweDdmZmYsIC0weDgwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gdmFsdWVcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSAodmFsdWUgPj4+IDI0KVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmICh2YWx1ZSA8IDApIHZhbHVlID0gMHhmZmZmZmZmZiArIHZhbHVlICsgMVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9IHZhbHVlXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuZnVuY3Rpb24gY2hlY2tJRUVFNzU0IChidWYsIHZhbHVlLCBvZmZzZXQsIGV4dCwgbWF4LCBtaW4pIHtcbiAgaWYgKHZhbHVlID4gbWF4IHx8IHZhbHVlIDwgbWluKSB0aHJvdyBuZXcgVHlwZUVycm9yKCd2YWx1ZSBpcyBvdXQgb2YgYm91bmRzJylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGJ1Zi5sZW5ndGgpIHRocm93IG5ldyBUeXBlRXJyb3IoJ2luZGV4IG91dCBvZiByYW5nZScpXG59XG5cbmZ1bmN0aW9uIHdyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDQsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSUVFRTc1NChidWYsIHZhbHVlLCBvZmZzZXQsIDgsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxuICByZXR1cm4gb2Zmc2V0ICsgOFxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIHdyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKHRhcmdldCwgdGFyZ2V0X3N0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIHZhciBzb3VyY2UgPSB0aGlzXG5cbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKCF0YXJnZXRfc3RhcnQpIHRhcmdldF9zdGFydCA9IDBcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGlmIChlbmQgPCBzdGFydCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBpZiAodGFyZ2V0X3N0YXJ0IDwgMCB8fCB0YXJnZXRfc3RhcnQgPj0gdGFyZ2V0Lmxlbmd0aClcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSBzb3VyY2UubGVuZ3RoKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgaWYgKGVuZCA8IDAgfHwgZW5kID4gc291cmNlLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aClcbiAgICBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCA8IGVuZCAtIHN0YXJ0KVxuICAgIGVuZCA9IHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgKyBzdGFydFxuXG4gIHZhciBsZW4gPSBlbmQgLSBzdGFydFxuXG4gIGlmIChsZW4gPCAxMDAwIHx8ICFCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0YXJnZXQuX3NldCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBzdGFydCArIGxlbiksIHRhcmdldF9zdGFydClcbiAgfVxufVxuXG4vLyBmaWxsKHZhbHVlLCBzdGFydD0wLCBlbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuZmlsbCA9IGZ1bmN0aW9uICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmIChlbmQgPCBzdGFydCkgdGhyb3cgbmV3IFR5cGVFcnJvcignZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgaWYgKHN0YXJ0IDwgMCB8fCBzdGFydCA+PSB0aGlzLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChlbmQgPCAwIHx8IGVuZCA+IHRoaXMubGVuZ3RoKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICBmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgICB0aGlzW2ldID0gdmFsdWVcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIGJ5dGVzID0gdXRmOFRvQnl0ZXModmFsdWUudG9TdHJpbmcoKSlcbiAgICB2YXIgbGVuID0gYnl0ZXMubGVuZ3RoXG4gICAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgdGhpc1tpXSA9IGJ5dGVzW2kgJSBsZW5dXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXNcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKSB7XG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIH1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IGEgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIFVpbnQ4QXJyYXkgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbkJ1ZmZlci5fYXVnbWVudCA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgYXJyLmNvbnN0cnVjdG9yID0gQnVmZmVyXG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5lcXVhbHMgPSBCUC5lcXVhbHNcbiAgYXJyLmNvbXBhcmUgPSBCUC5jb21wYXJlXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG52YXIgSU5WQUxJRF9CQVNFNjRfUkUgPSAvW14rXFwvMC05QS16XS9nXG5cbmZ1bmN0aW9uIGJhc2U2NGNsZWFuIChzdHIpIHtcbiAgLy8gTm9kZSBzdHJpcHMgb3V0IGludmFsaWQgY2hhcmFjdGVycyBsaWtlIFxcbiBhbmQgXFx0IGZyb20gdGhlIHN0cmluZywgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHN0ciA9IHN0cmluZ3RyaW0oc3RyKS5yZXBsYWNlKElOVkFMSURfQkFTRTY0X1JFLCAnJylcbiAgLy8gTm9kZSBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgYmFzZTY0IHN0cmluZ3MgKG1pc3NpbmcgdHJhaWxpbmcgPT09KSwgYmFzZTY0LWpzIGRvZXMgbm90XG4gIHdoaWxlIChzdHIubGVuZ3RoICUgNCAhPT0gMCkge1xuICAgIHN0ciA9IHN0ciArICc9J1xuICB9XG4gIHJldHVybiBzdHJcbn1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYiA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaWYgKGIgPD0gMHg3Rikge1xuICAgICAgYnl0ZUFycmF5LnB1c2goYilcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHN0YXJ0ID0gaVxuICAgICAgaWYgKGIgPj0gMHhEODAwICYmIGIgPD0gMHhERkZGKSBpKytcbiAgICAgIHZhciBoID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0ci5zbGljZShzdGFydCwgaSsxKSkuc3Vic3RyKDEpLnNwbGl0KCclJylcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaC5sZW5ndGg7IGorKykge1xuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYywgaGksIGxvXG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKGkgKyBvZmZzZXQgPj0gZHN0Lmxlbmd0aCkgfHwgKGkgPj0gc3JjLmxlbmd0aCkpXG4gICAgICBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIGRlY29kZVV0ZjhDaGFyIChzdHIpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHN0cilcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoMHhGRkZEKSAvLyBVVEYgOCBpbnZhbGlkIGNoYXJcbiAgfVxufVxuIiwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIHBvbHlmaWxsIGZvciB3aW5kb3cucGVyZm9ybWFuY2Uubm93KCkgZnJvbSBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9wYXVsaXJpc2gvNTQzODY1MFxyXG5kbyAtPlxyXG4gICMgcHJlcGFyZSBiYXNlIHBlcmYgb2JqZWN0XHJcbiAgaWYgdHlwZW9mIHdpbmRvdy5wZXJmb3JtYW5jZT09J3VuZGVmaW5lZCdcclxuICAgIHdpbmRvdy5wZXJmb3JtYW5jZSA9IHt9XHJcbiAgaWYgbm90IHdpbmRvdy5wZXJmb3JtYW5jZS5ub3dcclxuICAgICMgY29uc29sZS5sb2cgXCJwb2x5ZmlsbGluZyB3aW5kb3cucGVyZm9ybWFuY2Uubm93KClcIlxyXG4gICAgbm93T2Zmc2V0ID0gK25ldyBEYXRlKClcclxuICAgIGlmIHBlcmZvcm1hbmNlLnRpbWluZyBhbmQgcGVyZm9ybWFuY2UudGltaW5nXHJcbiAgICAgIG5vd09mZnNldCA9IHBlcmZvcm1hbmNlLnRpbWluZy5uYXZpZ2F0aW9uU3RhcnRcclxuICAgIHdpbmRvdy5wZXJmb3JtYW5jZS5ub3cgPSAtPlxyXG4gICAgICBub3cgPSArbmV3IERhdGUoKVxyXG4gICAgICByZXR1cm4gbm93IC0gbm93T2Zmc2V0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBCZWF0TWFrZXJcclxuXHJcbmNsYXNzIEJlYXRNYWtlclxyXG4gIGNvbnN0cnVjdG9yOiAtPlxyXG4gICAgQHJlc2V0KClcclxuXHJcbiAgc2V0SW5wdXRUZXh0OiAodGV4dCkgLT5cclxuICAgICQoXCIjYmVhdGlucHV0XCIpLnZhbCh0ZXh0KVxyXG5cclxuICBzZXRPdXRwdXRUZXh0OiAodGV4dCkgLT5cclxuICAgICQoXCIjYmVhdG91dHB1dFwiKS5odG1sKHRleHQpXHJcblxyXG4gIGVycm9yOiAodGV4dCkgLT5cclxuICAgIEBzZXRJbnB1dFRleHQoXCIgRVJST1I6ICN7dGV4dH1cIilcclxuXHJcbiAgcmVzZXQ6IChub3RlKSAtPlxyXG4gICAgQGtleURvd25Db3VudCA9IDBcclxuICAgIEBrZXlEb3duVGltZSA9IHt9XHJcbiAgICBAcmVjb3JkaW5nID0gZmFsc2VcclxuICAgIEBub3RlcyA9IFtdXHJcbiAgICBub3RlID89IFwiXCJcclxuICAgIEBzZXRJbnB1dFRleHQoXCIje25vdGV9IENsaWNrIGhlcmUgYW5kIGhpdCB1c2UgQS1aIGtleXMgdG8gbWFrZSBhIG5ldyBiZWF0IChwbGVhc2UgbG9vcCB0aGUgZnVsbCBwYXR0ZXJuIGV4YWN0bHkgdHdpY2UpXCIpXHJcblxyXG4gIHVwZGF0ZVJlY29yZGluZzogLT5cclxuICAgIHJldHVybiBpZiBub3QgQHJlY29yZGluZ1xyXG4gICAgbm93ID0gd2luZG93LnBlcmZvcm1hbmNlLm5vdygpXHJcbiAgICBpZiBub3cgPiAoQGxhc3RLZXlFdmVudCArIDIwMDApXHJcbiAgICAgICQoXCIjYmVhdGlucHV0XCIpLnZhbChcIiBSZWNvcmRpbmcgKCN7TWF0aC5mbG9vcig0MDAwIC0gKG5vdyAtIEBsYXN0S2V5RXZlbnQpKX0gbXMgbGVmdC4uLikuLi5cIilcclxuICAgIGVsc2VcclxuICAgICAgJChcIiNiZWF0aW5wdXRcIikudmFsKFwiIFJlY29yZGluZy4uLlwiKVxyXG5cclxuICBzdGFydFJlY29yZGluZzogLT5cclxuICAgIEByZWNvcmRpbmcgPSB0cnVlXHJcbiAgICBAdXBkYXRlUmVjb3JkaW5nKClcclxuXHJcbiAgc3RvcFJlY29yZGluZzogLT5cclxuICAgIHJlY29yZGVkTm90ZXMgPSBAbm90ZXNcclxuICAgIEByZXNldChcIiBSZWNvcmRpbmcgZmluaXNoZWQuXCIpXHJcbiAgICBAZ2VuZXJhdGUocmVjb3JkZWROb3RlcylcclxuXHJcbiAga2V5RG93bjogKGtleSwgdHMpIC0+XHJcbiAgICByZXR1cm4gaWYgQGtleURvd25UaW1lLmhhc093blByb3BlcnR5KGtleSlcclxuICAgIEBsYXN0S2V5RXZlbnQgPSB3aW5kb3cucGVyZm9ybWFuY2Uubm93KClcclxuICAgIGlmIG5vdCBAcmVjb3JkaW5nXHJcbiAgICAgIEBzdGFydFJlY29yZGluZygpXHJcblxyXG4gICAgIyBjb25zb2xlLmxvZyhcIkRPV046ICN7a2V5fSAoI3t0c30pXCIpXHJcbiAgICBAa2V5RG93blRpbWVba2V5XSA9IHRzXHJcbiAgICBAa2V5RG93bkNvdW50KytcclxuXHJcbiAga2V5VXA6IChrZXksIHRzKSAtPlxyXG4gICAgcmV0dXJuIGlmIG5vdCBAcmVjb3JkaW5nXHJcbiAgICBAbGFzdEtleUV2ZW50ID0gd2luZG93LnBlcmZvcm1hbmNlLm5vdygpXHJcbiAgICAjIGNvbnNvbGUubG9nKFwiVVAgIDogI3trZXl9ICgje3RzfSlcIilcclxuICAgIEBub3Rlcy5wdXNoIHtcclxuICAgICAga2V5OiBrZXlcclxuICAgICAgc3RhcnQ6IEBrZXlEb3duVGltZVtrZXldXHJcbiAgICAgIGVuZDogdHNcclxuICAgIH1cclxuICAgIGRlbGV0ZSBAa2V5RG93blRpbWVba2V5XVxyXG4gICAgQGtleURvd25Db3VudC0tXHJcblxyXG4gIHRpY2s6IC0+XHJcbiAgICByZXR1cm4gaWYgbm90IEByZWNvcmRpbmdcclxuICAgIEB1cGRhdGVSZWNvcmRpbmcoKVxyXG4gICAgcmV0dXJuIGlmIEBrZXlEb3duQ291bnQgPiAwXHJcbiAgICBub3cgPSB3aW5kb3cucGVyZm9ybWFuY2Uubm93KClcclxuICAgIGlmIG5vdyA+IChAbGFzdEtleUV2ZW50ICsgNDAwMClcclxuICAgICAgQHN0b3BSZWNvcmRpbmcoKVxyXG5cclxuICBnZW5lcmF0ZTogKG5vdGVzKSAtPlxyXG5cclxuICAgIG5vdGVzLnNvcnQgKGEsIGIpIC0+XHJcbiAgICAgIGEuc3RhcnQgLSBiLnN0YXJ0XHJcblxyXG4gICAgaWYgKG5vdGVzLmxlbmd0aCAlIDIpICE9IDBcclxuICAgICAgQGVycm9yIFwiT2RkIGNvdW50IG9mIG5vdGVzISBQbGVhc2UgbG9vcCB5b3VyIGJlYXQgZXhhY3RseSB0d2ljZS5cIlxyXG4gICAgICByZXR1cm5cclxuXHJcbiAgICBiZWF0ID0gXCJcIlxyXG5cclxuICAgIGJlYXRTdGFydCA9IG5vdGVzWzBdLnN0YXJ0XHJcbiAgICBub3RlQ291bnQgPSBub3Rlcy5sZW5ndGggPj4gMVxyXG4gICAgYmVhdFRpbWUgPSBub3Rlc1tub3RlQ291bnRdLnN0YXJ0IC0gYmVhdFN0YXJ0XHJcbiAgICBiZWF0ICs9IFwiIyAje25vdGVDb3VudH0gbm90ZXMsIHRvdGFsIHRpbWUgI3tiZWF0VGltZX0gc2Vjb25kc1xcblwiXHJcblxyXG4gICAgYmFzZUJQTSA9IE1hdGguZmxvb3IoMTIwMDAwIC8gYmVhdFRpbWUpXHJcbiAgICB3aGlsZSAoYmFzZUJQTSA+IDYwKVxyXG4gICAgICBiYXNlQlBNID4+PSAxXHJcbiAgICBiZWF0ICs9IFwiIyBCUE0gZ3Vlc3NlczogI3tiYXNlQlBNfSwgI3tiYXNlQlBNICogMn0sICN7YmFzZUJQTSAqIDR9XFxuXCJcclxuXHJcbiAgICBiZWF0ICs9IFwiXFxuIyBIZXJlIGlzIHlvdXIgYmVhdCBhdCB2YXJpb3VzIGxldmVscyBvZiBncmFudWxhcml0eTpcXG5cIlxyXG5cclxuICAgIGtleU5vdGVzID0ge31cclxuICAgIGZvciBub3RlSW5kZXggaW4gWzAuLi5ub3RlQ291bnRdXHJcbiAgICAgIG5vdGUgPSBub3Rlc1tub3RlSW5kZXhdXHJcbiAgICAgIGlmIG5vdCBrZXlOb3Rlcy5oYXNPd25Qcm9wZXJ0eShub3RlLmtleSlcclxuICAgICAgICBrZXlOb3Rlc1tub3RlLmtleV0gPSBbXVxyXG4gICAgICBrZXlOb3Rlc1tub3RlLmtleV0ucHVzaCB7XHJcbiAgICAgICAgc3RhcnQ6IG5vdGUuc3RhcnQgLSBiZWF0U3RhcnRcclxuICAgICAgICBsZW5ndGg6IG5vdGUuZW5kIC0gbm90ZS5zdGFydFxyXG4gICAgICB9XHJcblxyXG4gICAgcGllY2VDb3VudCA9IDhcclxuICAgIHBpZWNlVGltZSA9IDBcclxuICAgIGZvciBsb29wQ291bnQgaW4gWzAuLi4zXVxyXG4gICAgICBwaWVjZUNvdW50IDw8PSAxXHJcbiAgICAgIGNvbnNvbGUubG9nIFwidHJ5aW5nIHRvIGZpdCBpbiAje3BpZWNlQ291bnR9IHBpZWNlc1wiXHJcblxyXG4gICAgICBiZWF0ICs9IFwiXFxubG9vcCBwYXR0ZXJuI3twaWVjZUNvdW50fVxcblwiXHJcblxyXG4gICAgICBwaWVjZVRpbWUgPSBiZWF0VGltZSAvIHBpZWNlQ291bnRcclxuICAgICAgZm9yIGtleSwgbm90ZXMgb2Yga2V5Tm90ZXNcclxuICAgICAgICBjb25zb2xlLmxvZyBcIiogZml0dGluZyBrZXkgI3trZXl9XCJcclxuICAgICAgICBwaWVjZVNlZW4gPSBbXVxyXG4gICAgICAgIGZvciBpIGluIFswLi4ucGllY2VDb3VudF1cclxuICAgICAgICAgIHBpZWNlU2VlbltpXSA9IGZhbHNlXHJcblxyXG4gICAgICAgIGZvciBub3RlIGluIG5vdGVzXHJcbiAgICAgICAgICBwaWVjZUluZGV4ID0gTWF0aC5mbG9vcigobm90ZS5zdGFydCArIChwaWVjZVRpbWUgLyAyKSkgLyBwaWVjZVRpbWUpXHJcbiAgICAgICAgICBjb25zb2xlLmxvZyBcInBpZWNlIGluZGV4IGZvciAje25vdGUuc3RhcnR9IGlzICN7cGllY2VJbmRleH1cIlxyXG4gICAgICAgICAgaWYgcGllY2VTZWVuW3BpZWNlSW5kZXhdXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nIFwiYWxyZWFkeSBzYXcgaW5kZXggI3twaWVjZUluZGV4fSBmb3Iga2V5ICN7a2V5fSwgZG91YmxpbmcgcGllY2VDb3VudFwiXHJcbiAgICAgICAgICAgIGxvb3BDb3VudCA9IDBcclxuICAgICAgICAgICAgY29udGludWVcclxuXHJcbiAgICAgIGZvciBrZXksIG5vdGVzIG9mIGtleU5vdGVzXHJcbiAgICAgICAgY29uc29sZS5sb2cgXCIqIHJlbmRlcmluZyBrZXkgI3trZXl9XCJcclxuICAgICAgICBwaWVjZXMgPSBbXVxyXG4gICAgICAgIGZvciBpIGluIFswLi4ucGllY2VDb3VudF1cclxuICAgICAgICAgIHBpZWNlc1tpXSA9IFwiLlwiXHJcblxyXG4gICAgICAgIGZvciBub3RlIGluIG5vdGVzXHJcbiAgICAgICAgICBwaWVjZUluZGV4ID0gTWF0aC5mbG9vcigobm90ZS5zdGFydCArIChwaWVjZVRpbWUgLyAyKSkgLyBwaWVjZVRpbWUpXHJcbiAgICAgICAgICBjb25zb2xlLmxvZyBcInBpZWNlIGluZGV4IGZvciAje25vdGUuc3RhcnR9IGlzICN7cGllY2VJbmRleH1cIlxyXG4gICAgICAgICAgcGllY2VzW3BpZWNlSW5kZXhdID0gXCJ4XCJcclxuXHJcbiAgICAgICAgYmVhdCArPSBcIiAgcGF0dGVybiAje2tleX0gXCIgKyBwaWVjZXMuam9pbihcIlwiKSArIFwiXFxuXCJcclxuXHJcbiAgICBjb25zb2xlLmxvZyBrZXlOb3Rlc1xyXG5cclxuICAgIEBzZXRPdXRwdXRUZXh0KGJlYXQpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBtYWluXHJcblxyXG5tYWluID0gLT5cclxuICBiZWF0bWFrZXIgPSBuZXcgQmVhdE1ha2VyXHJcblxyXG4gICQoJyNiZWF0aW5wdXQnKS5rZXlkb3duIChldmVudCkgLT5cclxuICAgIGtleUNvZGUgPSBwYXJzZUludChldmVudC5rZXlDb2RlKVxyXG4gICAgaWYgKGtleUNvZGUgPCA2NSkgb3IgKGtleUNvZGUgPiA5MClcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAga2V5ID0gU3RyaW5nLmZyb21DaGFyQ29kZShldmVudC5rZXlDb2RlKVxyXG4gICAgbm93ID0gd2luZG93LnBlcmZvcm1hbmNlLm5vdygpXHJcbiAgICBiZWF0bWFrZXIua2V5RG93bihrZXksIG5vdylcclxuXHJcbiAgJCgnI2JlYXRpbnB1dCcpLmtleXVwIChldmVudCkgLT5cclxuICAgIGtleUNvZGUgPSBwYXJzZUludChldmVudC5rZXlDb2RlKVxyXG4gICAgaWYgKGtleUNvZGUgPCA2NSkgb3IgKGtleUNvZGUgPiA5MClcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAga2V5ID0gU3RyaW5nLmZyb21DaGFyQ29kZShldmVudC5rZXlDb2RlKVxyXG4gICAgbm93ID0gd2luZG93LnBlcmZvcm1hbmNlLm5vdygpXHJcbiAgICBiZWF0bWFrZXIua2V5VXAoa2V5LCBub3cpXHJcblxyXG4gIHNldEludGVydmFsKCAtPlxyXG4gICAgYmVhdG1ha2VyLnRpY2soKVxyXG4gICwgMjUwKTtcclxuXHJcbm1haW4oKVxyXG5tb2R1bGUuZXhwb3J0cyA9XHJcbiAgbGVsOiBcInBsYXl6XCJcclxuIiwibW9kdWxlLmV4cG9ydHMgPVxyXG5cclxuICBmaXJzdDogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgWW91ciBmaXJzdCBMb29wU2NyaXB0LiBDbGljayBcIkNvbXBpbGVcIiBiZWxvdyB0byBzdGFydCFcclxuXHJcbnRvbmUgbm90ZTFcclxuICBkdXJhdGlvbiAyNTBcclxuICBvY3RhdmUgNFxyXG4gIG5vdGUgQ1xyXG5cclxudG9uZSBiYXNzMVxyXG4gIGR1cmF0aW9uIDI1MFxyXG4gIG9jdGF2ZSAxXHJcbiAgbm90ZSBCXHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBub3RlMSB4Li4uLi4uLnguLi4uLi4uXHJcbiAgcGF0dGVybiBiYXNzMSAuLi4ueC4uLi4uLi54Li4uXHJcblxyXG5cIlwiXCJcclxuXHJcbiAgbm90ZXM6IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIE5vdGUgb3ZlcnJpZGVzIVxyXG5cclxuIyBILUwgYXJlIHRoZSBibGFjayBrZXlzOlxyXG4jICAgICBIIEkgICBKIEsgTFxyXG4jICAgIEMgRCBFIEYgRyBBIEJcclxuXHJcbiMgVHJ5IHNldHRpbmcgdGhlIGR1cmF0aW9uIHRvIDEwMFxyXG50b25lIG5vdGUxXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgZHVyYXRpb24gMjUwXHJcblxyXG4jIFNhbXBsZXMgY2FuIGhhdmUgdGhlaXIgbm90ZXMgb3ZlcnJpZGRlbiB0b28hXHJcbnNhbXBsZSBkaW5nXHJcbiAgc3JjIHNhbXBsZXMvZGluZ19lLndhdlxyXG4gIHNyY25vdGUgZVxyXG5cclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gbm90ZTEgYi5hLmcuYS5iLmIuYi4uLlxyXG5cclxubG9vcCBsb29wMlxyXG4gIHBhdHRlcm4gZGluZyBiLmEuZy5hLmIuYi5iLi4uXHJcblxyXG50cmFjayBzb25nXHJcbiAgcGF0dGVybiBsb29wMSB4XHJcbiAgcGF0dGVybiBsb29wMiAueFxyXG5cclxuXCJcIlwiXHJcblxyXG4gIG1vdHRvOiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBbiBhcHByb3hpbWF0aW9uIG9mIHRoZSBiZWF0IGZyb20gRHJha2UncyBcIlRoZSBNb3R0b1wiXHJcblxyXG5icG0gMTAwXHJcbnNlY3Rpb24gIyB0byBzaGFyZSBBRFNSXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgdG9uZSBiYXNzMSAtPiBvY3RhdmUgMVxyXG4gIHRvbmUgYmFzczIgLT4gb2N0YXZlIDJcclxuXHJcbnNhbXBsZSBjbGFwICAtPiBzcmMgc2FtcGxlcy9jbGFwLndhdlxyXG5zYW1wbGUgc25hcmUgLT4gc3JjIHNhbXBsZXMvc25hcmUud2F2XHJcbnNhbXBsZSBoaWhhdCAtPiBzcmMgc2FtcGxlcy9oaWhhdC53YXZcclxuXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIGhpaGF0IC4ueC4uLi4uLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uXHJcbiAgcGF0dGVybiBjbGFwICAuLi4ueC4uLi4uLi54Li4uLi4uLnguLi4uLi4ueC4uLlxyXG4gIHBhdHRlcm4gc25hcmUgLi4uLi4ueC4uLnguLi54LnguLi4uLi4uLi4uLi4uLi5cclxuICBwYXR0ZXJuIGJhc3MxIEJiYmJiYi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcbiAgcGF0dGVybiBiYXNzMiAuLi4uLi5IaGhoaGhEZGRkZGQuLi4uSGhoaEpqLkpqLlxyXG5cclxudHJhY2sgc29uZ1xyXG4gIHBhdHRlcm4gbG9vcDEgeHh4eFxyXG5cclxuXCJcIlwiXHJcblxyXG4gIGxlbmd0aDogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgU2hvd2luZyBvZmYgdmFyaW91cyBub3RlIGxlbmd0aHMgdXNpbmcgY2FwcyBhbmQgbG93ZXJjYXNlXHJcbiMgQWxzbyBzaG93cyB3aGF0IEFEU1IgY2FuIGRvIVxyXG5cclxudG9uZSBub3RlMVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG5cclxudG9uZSBub3RlMlxyXG4gICMgTm90ZTogT25seSB0aGUgZmlyc3QgdG9uZSBoYXMgQURTUlxyXG5cclxuIyBJZiB5b3UgdXNlIGFueSBsZXR0ZXJzIG90aGVyIHRoYW4gXCJ4XCIgb24gYSB0b25lIHBhdHRlcm4sIHlvdSBvdmVycmlkZSBpdHNcclxuIyBub3RlIHdpdGggdGhlIG5vdGUgbGlzdGVkLiBBbHNvLCBpZiB5b3UgdXNlIGFueSBjYXBpdGFsIGxldHRlcnMgaW4gYSBwYXR0ZXJuLFxyXG4jIHlvdSBvdmVycmlkZSB0aGUgbGVuZ3RoIG9mIHRoYXQgbm90ZSB3aXRoIHRoZSBudW1iZXIgb2YgbWF0Y2hpbmcgbG93ZXJjYXNlXHJcbiMgbGV0dGVycyBmb2xsb3dpbmcgaXQuXHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBub3RlMSBHZ2dnZ2dnZ0ZmZmZmZi4uQWFhYUJiYi5DYy4uRC4uLlxyXG5cclxubG9vcCBsb29wMlxyXG4gIHBhdHRlcm4gbm90ZTIgR2dnZ2dnZ2dGZmZmZmYuLkFhYWFCYmIuQ2MuLkQuLi5cclxuXHJcbnRyYWNrIHNvbmdcclxuICBwYXR0ZXJuIGxvb3AxIHguXHJcbiAgcGF0dGVybiBsb29wMiAueFxyXG5cclxuXCJcIlwiXHJcblxyXG4gIGNob2NvYm86IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFRoZSBDaG9jb2JvIFRoZW1lIChmaXJzdCBwYXJ0IG9ubHkpXHJcblxyXG5icG0gMTI1XHJcblxyXG5zZWN0aW9uIFRvbmUgKGluIGEgc2VjdGlvbiB0byBzaGFyZSBBRFNSKVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG4gIHRvbmUgY2hvY29ibzFcclxuICAgIG9jdGF2ZSA1XHJcbiAgdG9uZSBjaG9jb2JvMlxyXG4gICAgb2N0YXZlIDRcclxuXHJcbmxvb3AgbG9vcDFcclxuIHBhdHRlcm4gY2hvY29ibzEgRGRkZC4uLi4uLkRkLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uRC5FLkZmZmZmZi4uLlxyXG4gcGF0dGVybiBjaG9jb2JvMiAuLi4uQmJHZ0VlLi5CYkdnQmIuLkdnLi5CYmJiYmIuQWFHZ0dBRy5GLkdnZ2dnZy5GLkdnR0IuLi4uLi4uLi4uLi4uXHJcblxyXG50cmFjayBzb25nXHJcbiAgcGF0dGVybiBsb29wMSB4eFxyXG5cIlwiXCJcclxuXHJcbiAga2ljazogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQmFzcyBraWNrIChtaXhpbmcgYSBzaW1wbGUga2ljayB3aXRoIGEgc3VzdGFpbmVkIGJhc3Mgc2luZSlcclxuIyBUcnkgY2hhbmdpbmcgJ2ZyZXEnIHRvIGFueXdoZXJlIGluIDU1LTgwLCBhbmQvb3IgJ2R1cmF0aW9uJ1xyXG5cclxudG9uZSBub3RlMVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG4gIGZyZXEgNjBcclxuICBkdXJhdGlvbiAxNTAwXHJcblxyXG5zYW1wbGUga2lja1xyXG4gIHZvbHVtZSAwLjdcclxuICBzcmMgc2FtcGxlcy9raWNrMy53YXZcclxuXHJcbnRyYWNrIEJhc3NLaWNrXHJcbiAgcGF0dGVybiBub3RlMSB4XHJcbiAgcGF0dGVybiBraWNrICB4XHJcblxyXG5cIlwiXCJcclxuXHJcbiAga2lja3BhdHRlcm46IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFNpbXBsZSBraWNrIHBhdHRlcm5cclxuXHJcbmJwbSA5MFxyXG5cclxudG9uZSBub3RlMVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG4gIG9jdGF2ZSAxXHJcbiAgZHVyYXRpb24gMTUwMFxyXG5cclxuc2FtcGxlIGtpY2tcclxuICB2b2x1bWUgMC43XHJcbiAgc3JjIHNhbXBsZXMva2ljazMud2F2XHJcblxyXG5zYW1wbGUgY2xhcFxyXG4gIHNyYyBzYW1wbGVzL2NsYXAud2F2XHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBjbGFwICAuLi4ueC4uLi4uLi54Li4uXHJcbiAgcGF0dGVybiBub3RlMSBiLmIuLi5iLmIuYi4uLi4uXHJcbiAgcGF0dGVybiBraWNrICB4LnguLi54LngueC4uLi4uXHJcbiAgXHJcbnRyYWNrIGRlcnBcclxuICBwYXR0ZXJuIGxvb3AxIHh4eHhcclxuXHJcblwiXCJcIlxyXG5cclxuICB3aWdnbGU6IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEEgc2lsbHkgYXBwcm94aW1hdGlvbiBvZiBKYXNvbiBEZXJ1bG8ncyBXaWdnbGVcclxuXHJcbmJwbSA4MlxyXG5cclxudG9uZSBiYXNzXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgZHVyYXRpb24gMTUwMFxyXG4gIG9jdGF2ZSAyXHJcblxyXG5zYW1wbGUga2lja1xyXG4gIHZvbHVtZSAwLjdcclxuICBzcmMgc2FtcGxlcy9raWNrMy53YXZcclxuXHJcbnNhbXBsZSBzbmFwXHJcbiAgdm9sdW1lIDAuNVxyXG4gIHNyYyBzYW1wbGVzL3NuYXAud2F2XHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBzbmFwIC4uLi54Li4uLi4uLnguLi5cclxuICBwYXR0ZXJuIGtpY2sgeC4ueC4ueC4uLi4uLi4uLlxyXG4gIHBhdHRlcm4gYmFzcyBhLi5mLi5lLi4uLi4uLi4uXHJcblxyXG50cmFjayB3aWdnbGVcclxuICBwYXR0ZXJuIGxvb3AxIHh4eHhcclxuXCJcIlwiXHJcbiIsImZyZXFUYWJsZSA9IFtcbiAgeyAjIE9jdGF2ZSAwXG5cbiAgICBcImFcIjogMjcuNTAwMFxuICAgIFwibFwiOiAyOS4xMzUzXG4gICAgXCJiXCI6IDMwLjg2NzdcbiAgfVxuXG4gIHsgIyBPY3RhdmUgMVxuICAgIFwiY1wiOiAzMi43MDMyXG4gICAgXCJoXCI6IDM0LjY0NzlcbiAgICBcImRcIjogMzYuNzA4MVxuICAgIFwiaVwiOiAzOC44OTA5XG4gICAgXCJlXCI6IDQxLjIwMzVcbiAgICBcImZcIjogNDMuNjUzNlxuICAgIFwialwiOiA0Ni4yNDkzXG4gICAgXCJnXCI6IDQ4Ljk5OTVcbiAgICBcImtcIjogNTEuOTEzMFxuICAgIFwiYVwiOiA1NS4wMDAwXG4gICAgXCJsXCI6IDU4LjI3MDVcbiAgICBcImJcIjogNjEuNzM1NFxuICB9XG5cbiAgeyAjIE9jdGF2ZSAyXG4gICAgXCJjXCI6IDY1LjQwNjRcbiAgICBcImhcIjogNjkuMjk1N1xuICAgIFwiZFwiOiA3My40MTYyXG4gICAgXCJpXCI6IDc3Ljc4MTdcbiAgICBcImVcIjogODIuNDA2OVxuICAgIFwiZlwiOiA4Ny4zMDcxXG4gICAgXCJqXCI6IDkyLjQ5ODZcbiAgICBcImdcIjogOTcuOTk4OVxuICAgIFwia1wiOiAxMDMuODI2XG4gICAgXCJhXCI6IDExMC4wMDBcbiAgICBcImxcIjogMTE2LjU0MVxuICAgIFwiYlwiOiAxMjMuNDcxXG4gIH1cblxuICB7ICMgT2N0YXZlIDNcbiAgICBcImNcIjogMTMwLjgxM1xuICAgIFwiaFwiOiAxMzguNTkxXG4gICAgXCJkXCI6IDE0Ni44MzJcbiAgICBcImlcIjogMTU1LjU2M1xuICAgIFwiZVwiOiAxNjQuODE0XG4gICAgXCJmXCI6IDE3NC42MTRcbiAgICBcImpcIjogMTg0Ljk5N1xuICAgIFwiZ1wiOiAxOTUuOTk4XG4gICAgXCJrXCI6IDIwNy42NTJcbiAgICBcImFcIjogMjIwLjAwMFxuICAgIFwibFwiOiAyMzMuMDgyXG4gICAgXCJiXCI6IDI0Ni45NDJcbiAgfVxuXG4gIHsgIyBPY3RhdmUgNFxuICAgIFwiY1wiOiAyNjEuNjI2XG4gICAgXCJoXCI6IDI3Ny4xODNcbiAgICBcImRcIjogMjkzLjY2NVxuICAgIFwiaVwiOiAzMTEuMTI3XG4gICAgXCJlXCI6IDMyOS42MjhcbiAgICBcImZcIjogMzQ5LjIyOFxuICAgIFwialwiOiAzNjkuOTk0XG4gICAgXCJnXCI6IDM5MS45OTVcbiAgICBcImtcIjogNDE1LjMwNVxuICAgIFwiYVwiOiA0NDAuMDAwXG4gICAgXCJsXCI6IDQ2Ni4xNjRcbiAgICBcImJcIjogNDkzLjg4M1xuICB9XG5cbiAgeyAjIE9jdGF2ZSA1XG4gICAgXCJjXCI6IDUyMy4yNTFcbiAgICBcImhcIjogNTU0LjM2NVxuICAgIFwiZFwiOiA1ODcuMzMwXG4gICAgXCJpXCI6IDYyMi4yNTRcbiAgICBcImVcIjogNjU5LjI1NVxuICAgIFwiZlwiOiA2OTguNDU2XG4gICAgXCJqXCI6IDczOS45ODlcbiAgICBcImdcIjogNzgzLjk5MVxuICAgIFwia1wiOiA4MzAuNjA5XG4gICAgXCJhXCI6IDg4MC4wMDBcbiAgICBcImxcIjogOTMyLjMyOFxuICAgIFwiYlwiOiA5ODcuNzY3XG4gIH1cblxuICB7ICMgT2N0YXZlIDZcbiAgICBcImNcIjogMTA0Ni41MFxuICAgIFwiaFwiOiAxMTA4LjczXG4gICAgXCJkXCI6IDExNzQuNjZcbiAgICBcImlcIjogMTI0NC41MVxuICAgIFwiZVwiOiAxMzE4LjUxXG4gICAgXCJmXCI6IDEzOTYuOTFcbiAgICBcImpcIjogMTQ3OS45OFxuICAgIFwiZ1wiOiAxNTY3Ljk4XG4gICAgXCJrXCI6IDE2NjEuMjJcbiAgICBcImFcIjogMTc2MC4wMFxuICAgIFwibFwiOiAxODY0LjY2XG4gICAgXCJiXCI6IDE5NzUuNTNcbiAgfVxuXG4gIHsgIyBPY3RhdmUgN1xuICAgIFwiY1wiOiAyMDkzLjAwXG4gICAgXCJoXCI6IDIyMTcuNDZcbiAgICBcImRcIjogMjM0OS4zMlxuICAgIFwiaVwiOiAyNDg5LjAyXG4gICAgXCJlXCI6IDI2MzcuMDJcbiAgICBcImZcIjogMjc5My44M1xuICAgIFwialwiOiAyOTU5Ljk2XG4gICAgXCJnXCI6IDMxMzUuOTZcbiAgICBcImtcIjogMzMyMi40NFxuICAgIFwiYVwiOiAzNTIwLjAwXG4gICAgXCJsXCI6IDM3MjkuMzFcbiAgICBcImJcIjogMzk1MS4wN1xuICB9XG5cbiAgeyAjIE9jdGF2ZSA4XG4gICAgXCJjXCI6IDQxODYuMDFcbiAgfVxuXVxuXG5sZWdhbE5vdGVSZWdleCA9IC9bYS1sXS9cblxuZmluZEZyZXEgPSAob2N0YXZlLCBub3RlKSAtPlxuICBub3RlID0gbm90ZS50b0xvd2VyQ2FzZSgpXG4gIGlmIChvY3RhdmUgPj0gMCkgYW5kIChvY3RhdmUgPCBmcmVxVGFibGUubGVuZ3RoKSBhbmQgbGVnYWxOb3RlUmVnZXgudGVzdChub3RlKVxuICAgIG9jdGF2ZVRhYmxlID0gZnJlcVRhYmxlW29jdGF2ZV1cbiAgICBpZiBvY3RhdmVUYWJsZT8gYW5kIG9jdGF2ZVRhYmxlW25vdGVdP1xuICAgICAgcmV0dXJuIG9jdGF2ZVRhYmxlW25vdGVdXG4gIHJldHVybiA0NDAuMFxuXG5tb2R1bGUuZXhwb3J0cyA9XG4gIGZyZXFUYWJsZTogZnJlcVRhYmxlXG4gIGZpbmRGcmVxOiBmaW5kRnJlcVxuIiwiIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIEltcG9ydHNcblxue2ZpbmRGcmVxfSA9IHJlcXVpcmUgJy4vZnJlcSdcbnJpZmZ3YXZlICAgPSByZXF1aXJlIFwiLi9yaWZmd2F2ZVwiXG5qRGF0YVZpZXcgID0gcmVxdWlyZSAnLi4vanMvamRhdGF2aWV3J1xuZnMgICAgICAgICA9IHJlcXVpcmUgJ2ZzJ1xuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgSGVscGVyIGZ1bmN0aW9uc1xuXG5sb2dEZWJ1ZyA9IChhcmdzLi4uKSAtPlxuICAjIGNvbnNvbGUubG9nLmFwcGx5KGNvbnNvbGUsIGFyZ3MpXG5cbmNsb25lID0gKG9iaikgLT5cbiAgaWYgbm90IG9iaj8gb3IgdHlwZW9mIG9iaiBpc250ICdvYmplY3QnXG4gICAgcmV0dXJuIG9ialxuXG4gIGlmIG9iaiBpbnN0YW5jZW9mIERhdGVcbiAgICByZXR1cm4gbmV3IERhdGUob2JqLmdldFRpbWUoKSlcblxuICBpZiBvYmogaW5zdGFuY2VvZiBSZWdFeHBcbiAgICBmbGFncyA9ICcnXG4gICAgZmxhZ3MgKz0gJ2cnIGlmIG9iai5nbG9iYWw/XG4gICAgZmxhZ3MgKz0gJ2knIGlmIG9iai5pZ25vcmVDYXNlP1xuICAgIGZsYWdzICs9ICdtJyBpZiBvYmoubXVsdGlsaW5lP1xuICAgIGZsYWdzICs9ICd5JyBpZiBvYmouc3RpY2t5P1xuICAgIHJldHVybiBuZXcgUmVnRXhwKG9iai5zb3VyY2UsIGZsYWdzKVxuXG4gIG5ld0luc3RhbmNlID0gbmV3IG9iai5jb25zdHJ1Y3RvcigpXG5cbiAgZm9yIGtleSBvZiBvYmpcbiAgICBuZXdJbnN0YW5jZVtrZXldID0gY2xvbmUgb2JqW2tleV1cblxuICByZXR1cm4gbmV3SW5zdGFuY2VcblxucGFyc2VCb29sID0gKHYpIC0+XG4gIHN3aXRjaCBTdHJpbmcodilcbiAgICB3aGVuIFwidHJ1ZVwiIHRoZW4gdHJ1ZVxuICAgIHdoZW4gXCJ5ZXNcIiB0aGVuIHRydWVcbiAgICB3aGVuIFwib25cIiB0aGVuIHRydWVcbiAgICB3aGVuIFwiMVwiIHRoZW4gdHJ1ZVxuICAgIGVsc2UgZmFsc2VcblxuY291bnRJbmRlbnQgPSAodGV4dCkgLT5cbiAgaW5kZW50ID0gMFxuICBmb3IgaSBpbiBbMC4uLnRleHQubGVuZ3RoXVxuICAgIGlmIHRleHRbaV0gPT0gJ1xcdCdcbiAgICAgIGluZGVudCArPSA4XG4gICAgZWxzZVxuICAgICAgaW5kZW50KytcbiAgcmV0dXJuIGluZGVudFxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgQml0bWFwIGNvZGUgb3JpZ2luYWxseSBmcm9tIGh0dHA6Ly9tcmNvbGVzLmNvbS9sb3ctcmVzLXBhaW50LyAoTUlUIGxpY2Vuc2VkKVxuXG5fYXNMaXR0bGVFbmRpYW5IZXggPSAodmFsdWUsIGJ5dGVzKSAtPlxuICAjIENvbnZlcnQgdmFsdWUgaW50byBsaXR0bGUgZW5kaWFuIGhleCBieXRlc1xuICAjIHZhbHVlIC0gdGhlIG51bWJlciBhcyBhIGRlY2ltYWwgaW50ZWdlciAocmVwcmVzZW50aW5nIGJ5dGVzKVxuICAjIGJ5dGVzIC0gdGhlIG51bWJlciBvZiBieXRlcyB0aGF0IHRoaXMgdmFsdWUgdGFrZXMgdXAgaW4gYSBzdHJpbmdcblxuICAjIEV4YW1wbGU6XG4gICMgX2FzTGl0dGxlRW5kaWFuSGV4KDI4MzUsIDQpXG4gICMgPiAnXFx4MTNcXHgwYlxceDAwXFx4MDAnXG5cbiAgcmVzdWx0ID0gW11cblxuICB3aGlsZSBieXRlcyA+IDBcbiAgICByZXN1bHQucHVzaChTdHJpbmcuZnJvbUNoYXJDb2RlKHZhbHVlICYgMjU1KSlcbiAgICB2YWx1ZSA+Pj0gOFxuICAgIGJ5dGVzLS1cblxuICByZXR1cm4gcmVzdWx0LmpvaW4oJycpXG5cbl9jb2xsYXBzZURhdGEgPSAocm93cywgcm93X3BhZGRpbmcpIC0+XG4gICMgQ29udmVydCByb3dzIG9mIFJHQiBhcnJheXMgaW50byBCTVAgZGF0YVxuICByb3dzX2xlbiA9IHJvd3MubGVuZ3RoXG4gIHBpeGVsc19sZW4gPSBpZiByb3dzX2xlbiB0aGVuIHJvd3NbMF0ubGVuZ3RoIGVsc2UgMFxuICBwYWRkaW5nID0gJydcbiAgcmVzdWx0ID0gW11cblxuICB3aGlsZSByb3dfcGFkZGluZyA+IDBcbiAgICBwYWRkaW5nICs9ICdcXHgwMCdcbiAgICByb3dfcGFkZGluZy0tXG5cbiAgZm9yIGkgaW4gWzAuLi5yb3dzX2xlbl1cbiAgICBmb3IgaiBpbiBbMC4uLnBpeGVsc19sZW5dXG4gICAgICBwaXhlbCA9IHJvd3NbaV1bal1cbiAgICAgIHJlc3VsdC5wdXNoKFN0cmluZy5mcm9tQ2hhckNvZGUocGl4ZWxbMl0pICtcbiAgICAgICAgICAgICAgICAgIFN0cmluZy5mcm9tQ2hhckNvZGUocGl4ZWxbMV0pICtcbiAgICAgICAgICAgICAgICAgIFN0cmluZy5mcm9tQ2hhckNvZGUocGl4ZWxbMF0pKVxuXG4gICAgcmVzdWx0LnB1c2gocGFkZGluZylcblxuICByZXR1cm4gcmVzdWx0LmpvaW4oJycpXG5cbl9zY2FsZVJvd3MgPSAocm93cywgc2NhbGUpIC0+XG4gICMgU2ltcGxlc3Qgc2NhbGluZyBwb3NzaWJsZVxuICByZWFsX3cgPSByb3dzLmxlbmd0aFxuICBzY2FsZWRfdyA9IHBhcnNlSW50KHJlYWxfdyAqIHNjYWxlKVxuICByZWFsX2ggPSBpZiByZWFsX3cgdGhlbiByb3dzWzBdLmxlbmd0aCBlbHNlIDBcbiAgc2NhbGVkX2ggPSBwYXJzZUludChyZWFsX2ggKiBzY2FsZSlcbiAgbmV3X3Jvd3MgPSBbXVxuXG4gIGZvciB5IGluIFswLi4uc2NhbGVkX2hdXG4gICAgbmV3X3Jvd3MucHVzaChuZXdfcm93ID0gW10pXG4gICAgZm9yIHggaW4gWzAuLi5zY2FsZWRfd11cbiAgICAgIG5ld19yb3cucHVzaChyb3dzW3BhcnNlSW50KHkvc2NhbGUpXVtwYXJzZUludCh4L3NjYWxlKV0pXG5cbiAgcmV0dXJuIG5ld19yb3dzXG5cbmdlbmVyYXRlQml0bWFwRGF0YVVSTCA9IChyb3dzLCBzY2FsZSkgLT5cbiAgIyBFeHBlY3RzIHJvd3Mgc3RhcnRpbmcgaW4gYm90dG9tIGxlZnRcbiAgIyBmb3JtYXR0ZWQgbGlrZSB0aGlzOiBbW1syNTUsIDAsIDBdLCBbMjU1LCAyNTUsIDBdLCAuLi5dLCAuLi5dXG4gICMgd2hpY2ggcmVwcmVzZW50czogW1tyZWQsIHllbGxvdywgLi4uXSwgLi4uXVxuXG4gIGlmICFidG9hXG4gICAgcmV0dXJuIGZhbHNlXG5cbiAgc2NhbGUgPSBzY2FsZSB8fCAxXG4gIGlmIChzY2FsZSAhPSAxKVxuICAgIHJvd3MgPSBfc2NhbGVSb3dzKHJvd3MsIHNjYWxlKVxuXG4gIGhlaWdodCA9IHJvd3MubGVuZ3RoICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjIHRoZSBudW1iZXIgb2Ygcm93c1xuICB3aWR0aCA9IGlmIGhlaWdodCB0aGVuIHJvd3NbMF0ubGVuZ3RoIGVsc2UgMCAgICAgICAgIyB0aGUgbnVtYmVyIG9mIGNvbHVtbnMgcGVyIHJvd1xuICByb3dfcGFkZGluZyA9ICg0IC0gKHdpZHRoICogMykgJSA0KSAlIDQgICAgICAgICAgICAgIyBwYWQgZWFjaCByb3cgdG8gYSBtdWx0aXBsZSBvZiA0IGJ5dGVzXG4gIG51bV9kYXRhX2J5dGVzID0gKHdpZHRoICogMyArIHJvd19wYWRkaW5nKSAqIGhlaWdodCAjIHNpemUgaW4gYnl0ZXMgb2YgQk1QIGRhdGFcbiAgbnVtX2ZpbGVfYnl0ZXMgPSA1NCArIG51bV9kYXRhX2J5dGVzICAgICAgICAgICAgICAgICMgZnVsbCBoZWFkZXIgc2l6ZSAob2Zmc2V0KSArIHNpemUgb2YgZGF0YVxuXG4gIGhlaWdodCA9IF9hc0xpdHRsZUVuZGlhbkhleChoZWlnaHQsIDQpXG4gIHdpZHRoID0gX2FzTGl0dGxlRW5kaWFuSGV4KHdpZHRoLCA0KVxuICBudW1fZGF0YV9ieXRlcyA9IF9hc0xpdHRsZUVuZGlhbkhleChudW1fZGF0YV9ieXRlcywgNClcbiAgbnVtX2ZpbGVfYnl0ZXMgPSBfYXNMaXR0bGVFbmRpYW5IZXgobnVtX2ZpbGVfYnl0ZXMsIDQpXG5cbiAgIyB0aGVzZSBhcmUgdGhlIGFjdHVhbCBieXRlcyBvZiB0aGUgZmlsZS4uLlxuXG4gIGZpbGUgPSAnQk0nICsgICAgICAgICAgICAgICAgIyBcIk1hZ2ljIE51bWJlclwiXG4gICAgICAgICAgbnVtX2ZpbGVfYnl0ZXMgKyAgICAgIyBzaXplIG9mIHRoZSBmaWxlIChieXRlcykqXG4gICAgICAgICAgJ1xceDAwXFx4MDAnICsgICAgICAgICAjIHJlc2VydmVkXG4gICAgICAgICAgJ1xceDAwXFx4MDAnICsgICAgICAgICAjIHJlc2VydmVkXG4gICAgICAgICAgJ1xceDM2XFx4MDBcXHgwMFxceDAwJyArICMgb2Zmc2V0IG9mIHdoZXJlIEJNUCBkYXRhIGxpdmVzICg1NCBieXRlcylcbiAgICAgICAgICAnXFx4MjhcXHgwMFxceDAwXFx4MDAnICsgIyBudW1iZXIgb2YgcmVtYWluaW5nIGJ5dGVzIGluIGhlYWRlciBmcm9tIGhlcmUgKDQwIGJ5dGVzKVxuICAgICAgICAgIHdpZHRoICsgICAgICAgICAgICAgICMgdGhlIHdpZHRoIG9mIHRoZSBiaXRtYXAgaW4gcGl4ZWxzKlxuICAgICAgICAgIGhlaWdodCArICAgICAgICAgICAgICMgdGhlIGhlaWdodCBvZiB0aGUgYml0bWFwIGluIHBpeGVscypcbiAgICAgICAgICAnXFx4MDFcXHgwMCcgKyAgICAgICAgICMgdGhlIG51bWJlciBvZiBjb2xvciBwbGFuZXMgKDEpXG4gICAgICAgICAgJ1xceDE4XFx4MDAnICsgICAgICAgICAjIDI0IGJpdHMgLyBwaXhlbFxuICAgICAgICAgICdcXHgwMFxceDAwXFx4MDBcXHgwMCcgKyAjIE5vIGNvbXByZXNzaW9uICgwKVxuICAgICAgICAgIG51bV9kYXRhX2J5dGVzICsgICAgICMgc2l6ZSBvZiB0aGUgQk1QIGRhdGEgKGJ5dGVzKSpcbiAgICAgICAgICAnXFx4MTNcXHgwQlxceDAwXFx4MDAnICsgIyAyODM1IHBpeGVscy9tZXRlciAtIGhvcml6b250YWwgcmVzb2x1dGlvblxuICAgICAgICAgICdcXHgxM1xceDBCXFx4MDBcXHgwMCcgKyAjIDI4MzUgcGl4ZWxzL21ldGVyIC0gdGhlIHZlcnRpY2FsIHJlc29sdXRpb25cbiAgICAgICAgICAnXFx4MDBcXHgwMFxceDAwXFx4MDAnICsgIyBOdW1iZXIgb2YgY29sb3JzIGluIHRoZSBwYWxldHRlIChrZWVwIDAgZm9yIDI0LWJpdClcbiAgICAgICAgICAnXFx4MDBcXHgwMFxceDAwXFx4MDAnICsgIyAwIGltcG9ydGFudCBjb2xvcnMgKG1lYW5zIGFsbCBjb2xvcnMgYXJlIGltcG9ydGFudClcbiAgICAgICAgICBfY29sbGFwc2VEYXRhKHJvd3MsIHJvd19wYWRkaW5nKVxuXG4gIHJldHVybiAnZGF0YTppbWFnZS9ibXA7YmFzZTY0LCcgKyBidG9hKGZpbGUpXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBQYXJzZXJcblxuY2xhc3MgUGFyc2VyXG4gIGNvbnN0cnVjdG9yOiAoQGxvZykgLT5cbiAgICBAY29tbWVudFJlZ2V4ID0gL14oW14jXSo/KShcXHMqIy4qKT8kL1xuICAgIEBvbmx5V2hpdGVzcGFjZVJlZ2V4ID0gL15cXHMqJC9cbiAgICBAaW5kZW50UmVnZXggPSAvXihcXHMqKShcXFMuKikkL1xuICAgIEBsZWFkaW5nVW5kZXJzY29yZVJlZ2V4ID0gL15fL1xuICAgIEBoYXNDYXBpdGFsTGV0dGVyc1JlZ2V4ID0gL1tBLVpdL1xuICAgIEBpc05vdGVSZWdleCA9IC9bQS1MYS1sXS9cblxuICAgICMgSC1MIGFyZSB0aGUgYmxhY2sga2V5czpcbiAgICAjICBIIEkgICBKIEsgTFxuICAgICMgQyBEIEUgRiBHIEEgQlxuXG4gICAgQG5hbWVkU3RhdGVzID1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHNyY29jdGF2ZTogNFxuICAgICAgICBzcmNub3RlOiAnYSdcbiAgICAgICAgb2N0YXZlOiA0XG4gICAgICAgIG5vdGU6ICdhJ1xuICAgICAgICB3YXZlOiAnc2luZSdcbiAgICAgICAgYnBtOiAxMjBcbiAgICAgICAgZHVyYXRpb246IDIwMFxuICAgICAgICB2b2x1bWU6IDEuMFxuICAgICAgICBjbGlwOiB0cnVlXG4gICAgICAgIHJldmVyYjpcbiAgICAgICAgICBkZWxheTogMFxuICAgICAgICAgIGRlY2F5OiAwXG4gICAgICAgIGFkc3I6ICMgbm8tb3AgQURTUiAoZnVsbCAxLjAgc3VzdGFpbilcbiAgICAgICAgICBhOiAwXG4gICAgICAgICAgZDogMFxuICAgICAgICAgIHM6IDFcbiAgICAgICAgICByOiAxXG5cbiAgICAjIGlmIGEga2V5IGlzIHByZXNlbnQgaW4gdGhpcyBtYXAsIHRoYXQgbmFtZSBpcyBjb25zaWRlcmVkIGFuIFwib2JqZWN0XCJcbiAgICBAb2JqZWN0S2V5cyA9XG4gICAgICB0b25lOlxuICAgICAgICB3YXZlOiAnc3RyaW5nJ1xuICAgICAgICBmcmVxOiAnZmxvYXQnXG4gICAgICAgIGR1cmF0aW9uOiAnZmxvYXQnXG4gICAgICAgIGFkc3I6ICdhZHNyJ1xuICAgICAgICBvY3RhdmU6ICdpbnQnXG4gICAgICAgIG5vdGU6ICdzdHJpbmcnXG4gICAgICAgIHZvbHVtZTogJ2Zsb2F0J1xuICAgICAgICBjbGlwOiAnYm9vbCdcbiAgICAgICAgcmV2ZXJiOiAncmV2ZXJiJ1xuXG4gICAgICBzYW1wbGU6XG4gICAgICAgIHNyYzogJ3N0cmluZydcbiAgICAgICAgdm9sdW1lOiAnZmxvYXQnXG4gICAgICAgIGNsaXA6ICdib29sJ1xuICAgICAgICByZXZlcmI6ICdyZXZlcmInXG4gICAgICAgIHNyY29jdGF2ZTogJ2ludCdcbiAgICAgICAgc3Jjbm90ZTogJ3N0cmluZydcbiAgICAgICAgb2N0YXZlOiAnaW50J1xuICAgICAgICBub3RlOiAnc3RyaW5nJ1xuXG4gICAgICBsb29wOlxuICAgICAgICBicG06ICdpbnQnXG5cbiAgICAgIHRyYWNrOiB7fVxuXG4gICAgQHN0YXRlU3RhY2sgPSBbXVxuICAgIEByZXNldCAnZGVmYXVsdCcsIDBcbiAgICBAb2JqZWN0cyA9IHt9XG4gICAgQG9iamVjdCA9IG51bGxcbiAgICBAb2JqZWN0U2NvcGVSZWFkeSA9IGZhbHNlXG5cbiAgaXNPYmplY3RUeXBlOiAodHlwZSkgLT5cbiAgICByZXR1cm4gQG9iamVjdEtleXNbdHlwZV0/XG5cbiAgZXJyb3I6ICh0ZXh0KSAtPlxuICAgIEBsb2cuZXJyb3IgXCJQQVJTRSBFUlJPUiwgbGluZSAje0BsaW5lTm99OiAje3RleHR9XCJcblxuICByZXNldDogKG5hbWUsIGluZGVudCkgLT5cbiAgICBuYW1lID89ICdkZWZhdWx0J1xuICAgIGluZGVudCA/PSAwXG4gICAgaWYgbm90IEBuYW1lZFN0YXRlc1tuYW1lXVxuICAgICAgQGVycm9yIFwiaW52YWxpZCByZXNldCBuYW1lOiAje25hbWV9XCJcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIG5ld1N0YXRlID0gY2xvbmUoQG5hbWVkU3RhdGVzW25hbWVdKVxuICAgIG5ld1N0YXRlLl9pbmRlbnQgPSBpbmRlbnRcbiAgICBAc3RhdGVTdGFjay5wdXNoIG5ld1N0YXRlXG4gICAgcmV0dXJuIHRydWVcblxuICBmbGF0dGVuOiAoKSAtPlxuICAgIGZsYXR0ZW5lZFN0YXRlID0ge31cbiAgICBmb3Igc3RhdGUgaW4gQHN0YXRlU3RhY2tcbiAgICAgIGZvciBrZXkgb2Ygc3RhdGVcbiAgICAgICAgZmxhdHRlbmVkU3RhdGVba2V5XSA9IHN0YXRlW2tleV1cbiAgICByZXR1cm4gZmxhdHRlbmVkU3RhdGVcblxuICB0cmFjZTogKHByZWZpeCkgLT5cbiAgICBwcmVmaXggPz0gJydcbiAgICBAbG9nLnZlcmJvc2UgXCJ0cmFjZTogI3twcmVmaXh9IFwiICsgSlNPTi5zdHJpbmdpZnkoQGZsYXR0ZW4oKSlcblxuICBjcmVhdGVPYmplY3Q6IChpbmRlbnQsIGRhdGEuLi4pIC0+XG4gICAgICBAb2JqZWN0ID0geyBfaW5kZW50OiBpbmRlbnQgfVxuICAgICAgZm9yIGkgaW4gWzAuLi5kYXRhLmxlbmd0aF0gYnkgMlxuICAgICAgICBAb2JqZWN0W2RhdGFbaV1dID0gZGF0YVtpKzFdXG4gICAgICBAb2JqZWN0U2NvcGVSZWFkeSA9IHRydWVcblxuICAgICAgaWYgQG9iamVjdC5fdHlwZSA9PSAnbG9vcCdcbiAgICAgICAgQG9iamVjdC5fcGF0dGVybnMgPSBbXVxuXG4gICAgICBpZiBAb2JqZWN0Ll90eXBlID09ICd0cmFjaydcbiAgICAgICAgQG9iamVjdC5fcGF0dGVybnMgPSBbXVxuXG4gICAgICBpZiBAb2JqZWN0Ll9uYW1lXG4gICAgICAgIEBsYXN0T2JqZWN0ID0gQG9iamVjdC5fbmFtZVxuICAgICAgICBsb2dEZWJ1ZyBcImNyZWF0ZU9iamVjdFsje2luZGVudH1dOiBcIiwgQGxhc3RPYmplY3RcblxuICBmaW5pc2hPYmplY3Q6IC0+XG4gICAgaWYgQG9iamVjdFxuICAgICAgc3RhdGUgPSBAZmxhdHRlbigpXG4gICAgICBmb3Iga2V5IG9mIEBvYmplY3RLZXlzW0BvYmplY3QuX3R5cGVdXG4gICAgICAgIGV4cGVjdGVkVHlwZSA9IEBvYmplY3RLZXlzW0BvYmplY3QuX3R5cGVdW2tleV1cbiAgICAgICAgaWYgc3RhdGVba2V5XT9cbiAgICAgICAgICB2ID0gc3RhdGVba2V5XVxuICAgICAgICAgIEBvYmplY3Rba2V5XSA9IHN3aXRjaCBleHBlY3RlZFR5cGVcbiAgICAgICAgICAgIHdoZW4gJ2ludCcgdGhlbiBwYXJzZUludCh2KVxuICAgICAgICAgICAgd2hlbiAnZmxvYXQnIHRoZW4gcGFyc2VGbG9hdCh2KVxuICAgICAgICAgICAgd2hlbiAnYm9vbCcgdGhlbiBwYXJzZUJvb2wodilcbiAgICAgICAgICAgIGVsc2UgdlxuXG4gICAgICBsb2dEZWJ1ZyBcImZpbmlzaE9iamVjdDogXCIsIEBvYmplY3RcbiAgICAgIEBvYmplY3RzW0BvYmplY3QuX25hbWVdID0gQG9iamVjdFxuICAgIEBvYmplY3QgPSBudWxsXG5cbiAgY3JlYXRpbmdPYmplY3RUeXBlOiAodHlwZSkgLT5cbiAgICByZXR1cm4gZmFsc2UgaWYgbm90IEBvYmplY3RcbiAgICByZXR1cm4gZmFsc2UgaWYgbm90IEBvYmplY3QuX3R5cGUgPT0gdHlwZVxuICAgIHJldHVybiB0cnVlXG5cbiAgdXBkYXRlRmFrZUluZGVudHM6IChpbmRlbnQpIC0+XG4gICAgcmV0dXJuIGlmIGluZGVudCA+PSAxMDAwXG4gICAgaSA9IEBzdGF0ZVN0YWNrLmxlbmd0aCAtIDFcbiAgICB3aGlsZSBpID4gMFxuICAgICAgcHJldkluZGVudCA9IEBzdGF0ZVN0YWNrW2kgLSAxXS5faW5kZW50XG4gICAgICBpZiAoQHN0YXRlU3RhY2tbaV0uX2luZGVudCA+IDEwMDApIGFuZCAocHJldkluZGVudCA8IGluZGVudClcbiAgICAgICAgbG9nRGVidWcgXCJ1cGRhdGVGYWtlSW5kZW50czogY2hhbmdpbmcgc3RhY2sgaW5kZW50ICN7aX0gZnJvbSAje0BzdGF0ZVN0YWNrW2ldLl9pbmRlbnR9IHRvICN7aW5kZW50fVwiXG4gICAgICAgIEBzdGF0ZVN0YWNrW2ldLl9pbmRlbnQgPSBpbmRlbnRcbiAgICAgIGktLVxuXG4gIHB1c2hTdGF0ZTogKGluZGVudCkgLT5cbiAgICBpbmRlbnQgPz0gMFxuICAgIGxvZ0RlYnVnIFwicHVzaFN0YXRlKCN7aW5kZW50fSlcIlxuICAgIEB1cGRhdGVGYWtlSW5kZW50cyBpbmRlbnRcbiAgICBAc3RhdGVTdGFjay5wdXNoIHsgX2luZGVudDogaW5kZW50IH1cbiAgICByZXR1cm4gdHJ1ZVxuXG4gIHBvcFN0YXRlOiAoaW5kZW50KSAtPlxuICAgIGxvZ0RlYnVnIFwicG9wU3RhdGUoI3tpbmRlbnR9KVwiXG4gICAgaWYgQG9iamVjdD9cbiAgICAgIGlmIGluZGVudCA8PSBAb2JqZWN0Ll9pbmRlbnRcbiAgICAgICAgQGZpbmlzaE9iamVjdCgpXG5cbiAgICBAdXBkYXRlRmFrZUluZGVudHMgaW5kZW50XG5cbiAgICBsb29wXG4gICAgICB0b3BJbmRlbnQgPSBAZ2V0VG9wSW5kZW50KClcbiAgICAgIGxvZ0RlYnVnIFwicG9wU3RhdGUoI3tpbmRlbnR9KSB0b3AgaW5kZW50ICN7dG9wSW5kZW50fVwiXG4gICAgICBicmVhayBpZiBpbmRlbnQgPT0gdG9wSW5kZW50XG4gICAgICBpZiBAc3RhdGVTdGFjay5sZW5ndGggPCAyXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgbG9nRGVidWcgXCJwb3BTdGF0ZSgje2luZGVudH0pIHBvcHBpbmcgaW5kZW50ICN7dG9wSW5kZW50fVwiXG4gICAgICBAc3RhdGVTdGFjay5wb3AoKVxuICAgIHJldHVybiB0cnVlXG5cbiAgcGFyc2VQYXR0ZXJuOiAocGF0dGVybikgLT5cbiAgICBvdmVycmlkZUxlbmd0aCA9IEBoYXNDYXBpdGFsTGV0dGVyc1JlZ2V4LnRlc3QocGF0dGVybilcbiAgICBpID0gMFxuICAgIHNvdW5kcyA9IFtdXG4gICAgd2hpbGUgaSA8IHBhdHRlcm4ubGVuZ3RoXG4gICAgICBjID0gcGF0dGVybltpXVxuICAgICAgaWYgYyAhPSAnLidcbiAgICAgICAgc3ltYm9sID0gYy50b0xvd2VyQ2FzZSgpXG4gICAgICAgIHNvdW5kID0geyBvZmZzZXQ6IGkgfVxuICAgICAgICBpZiBAaXNOb3RlUmVnZXgudGVzdChjKVxuICAgICAgICAgIHNvdW5kLm5vdGUgPSBzeW1ib2xcbiAgICAgICAgaWYgb3ZlcnJpZGVMZW5ndGhcbiAgICAgICAgICBsZW5ndGggPSAxXG4gICAgICAgICAgbG9vcFxuICAgICAgICAgICAgbmV4dCA9IHBhdHRlcm5baSsxXVxuICAgICAgICAgICAgaWYgbmV4dCA9PSBzeW1ib2xcbiAgICAgICAgICAgICAgbGVuZ3RoKytcbiAgICAgICAgICAgICAgaSsrXG4gICAgICAgICAgICAgIGlmIGkgPT0gcGF0dGVybi5sZW5ndGhcbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgIHNvdW5kLmxlbmd0aCA9IGxlbmd0aFxuICAgICAgICBzb3VuZHMucHVzaCBzb3VuZFxuICAgICAgaSsrXG4gICAgcmV0dXJuIHtcbiAgICAgIHBhdHRlcm46IHBhdHRlcm5cbiAgICAgIGxlbmd0aDogcGF0dGVybi5sZW5ndGhcbiAgICAgIHNvdW5kczogc291bmRzXG4gICAgfVxuXG4gIGdldFRvcEluZGVudDogLT5cbiAgICByZXR1cm4gQHN0YXRlU3RhY2tbQHN0YXRlU3RhY2subGVuZ3RoIC0gMV0uX2luZGVudFxuXG4gIHByb2Nlc3NUb2tlbnM6ICh0b2tlbnMsIGluZGVudCkgLT5cbiAgICBjbWQgPSB0b2tlbnNbMF0udG9Mb3dlckNhc2UoKVxuICAgIGlmIGNtZCA9PSAncmVzZXQnXG4gICAgICBpZiBub3QgQHJlc2V0KHRva2Vuc1sxXSwgaW5kZW50KVxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICBlbHNlIGlmIGNtZCA9PSAnc2VjdGlvbidcbiAgICAgIEBvYmplY3RTY29wZVJlYWR5ID0gdHJ1ZVxuICAgIGVsc2UgaWYgQGlzT2JqZWN0VHlwZShjbWQpXG4gICAgICBAY3JlYXRlT2JqZWN0IGluZGVudCwgJ190eXBlJywgY21kLCAnX25hbWUnLCB0b2tlbnNbMV1cbiAgICBlbHNlIGlmIGNtZCA9PSAncGF0dGVybidcbiAgICAgIGlmIG5vdCAoQGNyZWF0aW5nT2JqZWN0VHlwZSgnbG9vcCcpIG9yIEBjcmVhdGluZ09iamVjdFR5cGUoJ3RyYWNrJykpXG4gICAgICAgIEBlcnJvciBcInVuZXhwZWN0ZWQgcGF0dGVybiBjb21tYW5kXCJcbiAgICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgICAgIHBhdHRlcm4gPSBAcGFyc2VQYXR0ZXJuKHRva2Vuc1syXSlcbiAgICAgIHBhdHRlcm4uc3JjID0gdG9rZW5zWzFdXG4gICAgICBAb2JqZWN0Ll9wYXR0ZXJucy5wdXNoIHBhdHRlcm5cbiAgICBlbHNlIGlmIGNtZCA9PSAnYWRzcidcbiAgICAgIEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdW2NtZF0gPVxuICAgICAgICBhOiBwYXJzZUZsb2F0KHRva2Vuc1sxXSlcbiAgICAgICAgZDogcGFyc2VGbG9hdCh0b2tlbnNbMl0pXG4gICAgICAgIHM6IHBhcnNlRmxvYXQodG9rZW5zWzNdKVxuICAgICAgICByOiBwYXJzZUZsb2F0KHRva2Vuc1s0XSlcbiAgICBlbHNlIGlmIGNtZCA9PSAncmV2ZXJiJ1xuICAgICAgQHN0YXRlU3RhY2tbQHN0YXRlU3RhY2subGVuZ3RoIC0gMV1bY21kXSA9XG4gICAgICAgIGRlbGF5OiBwYXJzZUludCh0b2tlbnNbMV0pXG4gICAgICAgIGRlY2F5OiBwYXJzZUZsb2F0KHRva2Vuc1syXSlcbiAgICBlbHNlXG4gICAgICAjIFRoZSBib3JpbmcgcmVndWxhciBjYXNlOiBzdGFzaCBvZmYgdGhpcyB2YWx1ZVxuICAgICAgaWYgQGxlYWRpbmdVbmRlcnNjb3JlUmVnZXgudGVzdChjbWQpXG4gICAgICAgIEBlcnJvciBcImNhbm5vdCBzZXQgaW50ZXJuYWwgbmFtZXMgKHVuZGVyc2NvcmUgcHJlZml4KVwiXG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgQHN0YXRlU3RhY2tbQHN0YXRlU3RhY2subGVuZ3RoIC0gMV1bY21kXSA9IHRva2Vuc1sxXVxuXG4gICAgcmV0dXJuIHRydWVcblxuICBwYXJzZTogKHRleHQpIC0+XG4gICAgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKVxuICAgIEBsaW5lTm8gPSAwXG4gICAgZm9yIGxpbmUgaW4gbGluZXNcbiAgICAgIEBsaW5lTm8rK1xuICAgICAgbGluZSA9IGxpbmUucmVwbGFjZSgvKFxcclxcbnxcXG58XFxyKS9nbSxcIlwiKSAjIHN0cmlwIG5ld2xpbmVzXG4gICAgICBsaW5lID0gQGNvbW1lbnRSZWdleC5leGVjKGxpbmUpWzFdICAgICAgICMgc3RyaXAgY29tbWVudHMgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2VcbiAgICAgIGNvbnRpbnVlIGlmIEBvbmx5V2hpdGVzcGFjZVJlZ2V4LnRlc3QobGluZSlcbiAgICAgIFtfLCBpbmRlbnRUZXh0LCBsaW5lXSA9IEBpbmRlbnRSZWdleC5leGVjIGxpbmVcbiAgICAgIGluZGVudCA9IGNvdW50SW5kZW50IGluZGVudFRleHRcbiAgICAgIGxpbmVPYmpzID0gW11cblxuICAgICAgYXJyb3dTZWN0aW9ucyA9IGxpbmUuc3BsaXQoL1xccyotPlxccyovKVxuICAgICAgZm9yIGFycm93U2VjdGlvbiBpbiBhcnJvd1NlY3Rpb25zXG4gICAgICAgIHNlbWlTZWN0aW9ucyA9IGFycm93U2VjdGlvbi5zcGxpdCgvXFxzKjtcXHMqLylcbiAgICAgICAgZm9yIHNlbWlTZWN0aW9uIGluIHNlbWlTZWN0aW9uc1xuICAgICAgICAgIGxpbmVPYmpzLnB1c2gge1xuICAgICAgICAgICAgICBpbmRlbnQ6IGluZGVudFxuICAgICAgICAgICAgICBsaW5lOiBzZW1pU2VjdGlvblxuICAgICAgICAgICAgfVxuICAgICAgICBpbmRlbnQgKz0gMTAwMFxuXG4gICAgICBmb3Igb2JqIGluIGxpbmVPYmpzXG4gICAgICAgIGxvZ0RlYnVnIFwiaGFuZGxpbmcgaW5kZW50OiBcIiArIEpTT04uc3RyaW5naWZ5KG9iailcbiAgICAgICAgdG9wSW5kZW50ID0gQGdldFRvcEluZGVudCgpXG4gICAgICAgIGlmIG9iai5pbmRlbnQgPiB0b3BJbmRlbnRcbiAgICAgICAgICBAcHVzaFN0YXRlKG9iai5pbmRlbnQpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICBpZiBub3QgQHBvcFN0YXRlKG9iai5pbmRlbnQpXG4gICAgICAgICAgICBAbG9nLmVycm9yIFwidW5leHBlY3RlZCBvdXRkZW50XCJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuXG4gICAgICAgIGxvZ0RlYnVnIFwicHJvY2Vzc2luZzogXCIgKyBKU09OLnN0cmluZ2lmeShvYmopXG4gICAgICAgIGlmIG5vdCBAcHJvY2Vzc1Rva2VucyhvYmoubGluZS5zcGxpdCgvXFxzKy8pLCBvYmouaW5kZW50KVxuICAgICAgICAgIHJldHVybiBmYWxzZVxuXG4gICAgQHBvcFN0YXRlKDApXG4gICAgcmV0dXJuIHRydWVcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIFJlbmRlcmVyXG5cbiMgSW4gYWxsIGNhc2VzIHdoZXJlIGEgcmVuZGVyZWQgc291bmQgaXMgZ2VuZXJhdGVkLCB0aGVyZSBhcmUgYWN0dWFsbHkgdHdvIGxlbmd0aHNcbiMgYXNzb2NpYXRlZCB3aXRoIHRoZSBzb3VuZC4gXCJzb3VuZC5sZW5ndGhcIiBpcyB0aGUgXCJleHBlY3RlZFwiIGxlbmd0aCwgd2l0aCByZWdhcmRzXG4jIHRvIHRoZSB0eXBlZC1pbiBkdXJhdGlvbiBmb3IgaXQgb3IgZm9yIGRldGVybWluaW5nIGxvb3Agb2ZmZXRzLiBUaGUgb3RoZXIgbGVuZ3RoXG4jIGlzIHRoZSBzb3VuZC5zYW1wbGVzLmxlbmd0aCAoYWxzbyBrbm93biBhcyB0aGUgXCJvdmVyZmxvdyBsZW5ndGhcIiksIHdoaWNoIGlzIHRoZVxuIyBsZW5ndGggdGhhdCBhY2NvdW50cyBmb3IgdGhpbmdzIGxpa2UgcmV2ZXJiIG9yIGFueXRoaW5nIGVsc2UgdGhhdCB3b3VsZCBjYXVzZSB0aGVcbiMgc291bmQgdG8gc3BpbGwgaW50byB0aGUgbmV4dCBsb29wL3RyYWNrLiBUaGlzIGFsbG93cyBmb3Igc2VhbWxlc3MgbG9vcHMgdGhhdCBjYW5cbiMgcGxheSBhIGxvbmcgc291bmQgYXMgdGhlIGVuZCBvZiBhIHBhdHRlcm4sIGFuZCBpdCdsbCBjbGVhbmx5IG1peCBpbnRvIHRoZSBiZWdpbm5pbmdcbiMgb2YgdGhlIG5leHQgcGF0dGVybi5cblxuY2xhc3MgUmVuZGVyZXJcbiAgY29uc3RydWN0b3I6IChAbG9nLCBAc2FtcGxlUmF0ZSwgQHJlYWRMb2NhbEZpbGVzLCBAb2JqZWN0cykgLT5cbiAgICBAc291bmRDYWNoZSA9IHt9XG5cbiAgZXJyb3I6ICh0ZXh0KSAtPlxuICAgIEBsb2cuZXJyb3IgXCJSRU5ERVIgRVJST1I6ICN7dGV4dH1cIlxuXG4gIGdlbmVyYXRlRW52ZWxvcGU6IChhZHNyLCBsZW5ndGgpIC0+XG4gICAgZW52ZWxvcGUgPSBBcnJheShsZW5ndGgpXG4gICAgQXRvRCA9IE1hdGguZmxvb3IoYWRzci5hICogbGVuZ3RoKVxuICAgIER0b1MgPSBNYXRoLmZsb29yKGFkc3IuZCAqIGxlbmd0aClcbiAgICBTdG9SID0gTWF0aC5mbG9vcihhZHNyLnIgKiBsZW5ndGgpXG4gICAgYXR0YWNrTGVuID0gQXRvRFxuICAgIGRlY2F5TGVuID0gRHRvUyAtIEF0b0RcbiAgICBzdXN0YWluTGVuID0gU3RvUiAtIER0b1NcbiAgICByZWxlYXNlTGVuID0gbGVuZ3RoIC0gU3RvUlxuICAgIHN1c3RhaW4gPSBhZHNyLnNcbiAgICBwZWFrU3VzdGFpbkRlbHRhID0gMS4wIC0gc3VzdGFpblxuICAgIGZvciBpIGluIFswLi4uYXR0YWNrTGVuXVxuICAgICAgIyBBdHRhY2tcbiAgICAgIGVudmVsb3BlW2ldID0gaSAvIGF0dGFja0xlblxuICAgIGZvciBpIGluIFswLi4uZGVjYXlMZW5dXG4gICAgICAjIERlY2F5XG4gICAgICBlbnZlbG9wZVtBdG9EICsgaV0gPSAxLjAgLSAocGVha1N1c3RhaW5EZWx0YSAqIChpIC8gZGVjYXlMZW4pKVxuICAgIGZvciBpIGluIFswLi4uc3VzdGFpbkxlbl1cbiAgICAgICMgU3VzdGFpblxuICAgICAgZW52ZWxvcGVbRHRvUyArIGldID0gc3VzdGFpblxuICAgIGZvciBpIGluIFswLi4ucmVsZWFzZUxlbl1cbiAgICAgICMgUmVsZWFzZVxuICAgICAgZW52ZWxvcGVbU3RvUiArIGldID0gc3VzdGFpbiAtIChzdXN0YWluICogKGkgLyByZWxlYXNlTGVuKSlcbiAgICByZXR1cm4gZW52ZWxvcGVcblxuICByZW5kZXJUb25lOiAodG9uZU9iaiwgb3ZlcnJpZGVzKSAtPlxuICAgIGFtcGxpdHVkZSA9IDEwMDAwXG4gICAgaWYgb3ZlcnJpZGVzLmxlbmd0aCA+IDBcbiAgICAgIGxlbmd0aCA9IG92ZXJyaWRlcy5sZW5ndGhcbiAgICBlbHNlXG4gICAgICBsZW5ndGggPSBNYXRoLmZsb29yKHRvbmVPYmouZHVyYXRpb24gKiBAc2FtcGxlUmF0ZSAvIDEwMDApXG4gICAgc2FtcGxlcyA9IEFycmF5KGxlbmd0aClcbiAgICBBID0gMjAwXG4gICAgQiA9IDAuNVxuICAgIGlmIG92ZXJyaWRlcy5ub3RlP1xuICAgICAgZnJlcSA9IGZpbmRGcmVxKHRvbmVPYmoub2N0YXZlLCBvdmVycmlkZXMubm90ZSlcbiAgICBlbHNlIGlmIHRvbmVPYmouZnJlcT9cbiAgICAgIGZyZXEgPSB0b25lT2JqLmZyZXFcbiAgICBlbHNlXG4gICAgICBmcmVxID0gZmluZEZyZXEodG9uZU9iai5vY3RhdmUsIHRvbmVPYmoubm90ZSlcbiAgICBlbnZlbG9wZSA9IEBnZW5lcmF0ZUVudmVsb3BlKHRvbmVPYmouYWRzciwgbGVuZ3RoKVxuICAgIHBlcmlvZCA9IEBzYW1wbGVSYXRlIC8gZnJlcVxuICAgIGZvciBpIGluIFswLi4ubGVuZ3RoXVxuICAgICAgaWYgdG9uZU9iai53YXZlID09IFwic2F3dG9vdGhcIlxuICAgICAgICBzYW1wbGUgPSAoKGkgJSBwZXJpb2QpIC8gcGVyaW9kKSAtIDAuNVxuICAgICAgZWxzZVxuICAgICAgICBzYW1wbGUgPSBNYXRoLnNpbihpIC8gcGVyaW9kICogMiAqIE1hdGguUEkpXG4gICAgICAgIGlmIHRvbmVPYmoud2F2ZSA9PSBcInNxdWFyZVwiXG4gICAgICAgICAgc2FtcGxlID0gaWYgKHNhbXBsZSA+IDApIHRoZW4gMSBlbHNlIC0xXG4gICAgICBzYW1wbGVzW2ldID0gc2FtcGxlICogYW1wbGl0dWRlICogZW52ZWxvcGVbaV1cblxuICAgIHJldHVybiB7XG4gICAgICBzYW1wbGVzOiBzYW1wbGVzXG4gICAgICBsZW5ndGg6IHNhbXBsZXMubGVuZ3RoXG4gICAgfVxuXG4gIHJlbmRlclNhbXBsZTogKHNhbXBsZU9iaiwgb3ZlcnJpZGVzKSAtPlxuICAgIHZpZXcgPSBudWxsXG5cbiAgICBpZiBAcmVhZExvY2FsRmlsZXNcbiAgICAgIGRhdGEgPSBmcy5yZWFkRmlsZVN5bmMgc2FtcGxlT2JqLnNyY1xuICAgICAgdmlldyA9IG5ldyBqRGF0YVZpZXcoZGF0YSwgMCwgZGF0YS5sZW5ndGgsIHRydWUpXG4gICAgZWxzZVxuICAgICAgJC5hamF4IHtcbiAgICAgICAgdXJsOiBzYW1wbGVPYmouc3JjXG4gICAgICAgIG1pbWVUeXBlOiAndGV4dC9wbGFpbjsgY2hhcnNldD14LXVzZXItZGVmaW5lZCdcbiAgICAgICAgc3VjY2VzczogKGRhdGEpIC0+XG4gICAgICAgICAgdmlldyA9IG5ldyBqRGF0YVZpZXcoZGF0YSwgMCwgZGF0YS5sZW5ndGgsIHRydWUpXG4gICAgICAgIGFzeW5jOiBmYWxzZVxuICAgICAgfVxuXG4gICAgaWYgbm90IHZpZXdcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNhbXBsZXM6IFtdXG4gICAgICAgIGxlbmd0aDogMFxuICAgICAgfVxuXG4gICAgIyBza2lwIHRoZSBmaXJzdCA0MCBieXRlc1xuICAgIHZpZXcuc2Vlayg0MClcbiAgICBzdWJjaHVuazJTaXplID0gdmlldy5nZXRJbnQzMigpXG4gICAgc2FtcGxlcyA9IFtdXG4gICAgd2hpbGUgdmlldy50ZWxsKCkrMSA8IHZpZXcuYnl0ZUxlbmd0aFxuICAgICAgc2FtcGxlcy5wdXNoIHZpZXcuZ2V0SW50MTYoKVxuXG4gICAgb3ZlcnJpZGVOb3RlID0gaWYgb3ZlcnJpZGVzLm5vdGUgdGhlbiBvdmVycmlkZXMubm90ZSBlbHNlIHNhbXBsZU9iai5ub3RlXG4gICAgaWYgKG92ZXJyaWRlTm90ZSAhPSBzYW1wbGVPYmouc3Jjbm90ZSkgb3IgKHNhbXBsZU9iai5vY3RhdmUgIT0gc2FtcGxlT2JqLnNyY29jdGF2ZSlcbiAgICAgIG9sZGZyZXEgPSBmaW5kRnJlcShzYW1wbGVPYmouc3Jjb2N0YXZlLCBzYW1wbGVPYmouc3Jjbm90ZSlcbiAgICAgIG5ld2ZyZXEgPSBmaW5kRnJlcShzYW1wbGVPYmoub2N0YXZlLCBvdmVycmlkZU5vdGUpXG5cbiAgICAgIGZhY3RvciA9IG9sZGZyZXEgLyBuZXdmcmVxXG4gICAgICAjIEBsb2cudmVyYm9zZSBcIm9sZDogI3tvbGRmcmVxfSwgbmV3OiAje25ld2ZyZXF9LCBmYWN0b3I6ICN7ZmFjdG9yfVwiXG5cbiAgICAgICMgVE9ETzogUHJvcGVybHkgcmVzYW1wbGUgaGVyZSB3aXRoIHNvbWV0aGluZyBvdGhlciB0aGFuIFwibmVhcmVzdCBuZWlnaGJvclwiXG4gICAgICByZWxlbmd0aCA9IE1hdGguZmxvb3Ioc2FtcGxlcy5sZW5ndGggKiBmYWN0b3IpXG4gICAgICByZXNhbXBsZXMgPSBBcnJheShyZWxlbmd0aClcbiAgICAgIGZvciBpIGluIFswLi4ucmVsZW5ndGhdXG4gICAgICAgIHJlc2FtcGxlc1tpXSA9IDBcbiAgICAgIGZvciBpIGluIFswLi4ucmVsZW5ndGhdXG4gICAgICAgIHJlc2FtcGxlc1tpXSA9IHNhbXBsZXNbTWF0aC5mbG9vcihpIC8gZmFjdG9yKV1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc2FtcGxlczogcmVzYW1wbGVzXG4gICAgICAgIGxlbmd0aDogcmVzYW1wbGVzLmxlbmd0aFxuICAgICAgfVxuICAgIGVsc2VcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNhbXBsZXM6IHNhbXBsZXNcbiAgICAgICAgbGVuZ3RoOiBzYW1wbGVzLmxlbmd0aFxuICAgICAgfVxuXG4gIHJlbmRlckxvb3A6IChsb29wT2JqKSAtPlxuICAgIGJlYXRDb3VudCA9IDBcbiAgICBmb3IgcGF0dGVybiBpbiBsb29wT2JqLl9wYXR0ZXJuc1xuICAgICAgaWYgYmVhdENvdW50IDwgcGF0dGVybi5sZW5ndGhcbiAgICAgICAgYmVhdENvdW50ID0gcGF0dGVybi5sZW5ndGhcblxuICAgIHNhbXBsZXNQZXJCZWF0ID0gQHNhbXBsZVJhdGUgLyAobG9vcE9iai5icG0gLyA2MCkgLyA0XG4gICAgdG90YWxMZW5ndGggPSBNYXRoLmZsb29yKHNhbXBsZXNQZXJCZWF0ICogYmVhdENvdW50KVxuICAgIG92ZXJmbG93TGVuZ3RoID0gdG90YWxMZW5ndGhcblxuICAgIGZvciBwYXR0ZXJuIGluIGxvb3BPYmouX3BhdHRlcm5zXG4gICAgICBzZWN0aW9uQ291bnQgPSBwYXR0ZXJuLmxlbmd0aCAvIDE2XG4gICAgICBvZmZzZXRMZW5ndGggPSBNYXRoLmZsb29yKHRvdGFsTGVuZ3RoIC8gMTYgLyBzZWN0aW9uQ291bnQpXG4gICAgICBmb3Igc291bmQgaW4gcGF0dGVybi5zb3VuZHNcbiAgICAgICAgb3ZlcnJpZGVzID0ge31cbiAgICAgICAgaWYgc291bmQubGVuZ3RoID4gMFxuICAgICAgICAgIG92ZXJyaWRlcy5sZW5ndGggPSBzb3VuZC5sZW5ndGggKiBvZmZzZXRMZW5ndGhcbiAgICAgICAgaWYgc291bmQubm90ZT9cbiAgICAgICAgICBvdmVycmlkZXMubm90ZSA9IHNvdW5kLm5vdGVcbiAgICAgICAgc291bmQuX3JlbmRlciA9IEByZW5kZXIocGF0dGVybi5zcmMsIG92ZXJyaWRlcylcbiAgICAgICAgZW5kID0gKHNvdW5kLm9mZnNldCAqIG9mZnNldExlbmd0aCkgKyBzb3VuZC5fcmVuZGVyLnNhbXBsZXMubGVuZ3RoXG4gICAgICAgIGlmIG92ZXJmbG93TGVuZ3RoIDwgZW5kXG4gICAgICAgICAgb3ZlcmZsb3dMZW5ndGggPSBlbmRcblxuICAgIHNhbXBsZXMgPSBBcnJheShvdmVyZmxvd0xlbmd0aClcbiAgICBmb3IgaSBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxuICAgICAgc2FtcGxlc1tpXSA9IDBcblxuICAgIGZvciBwYXR0ZXJuIGluIGxvb3BPYmouX3BhdHRlcm5zXG4gICAgICBzZWN0aW9uQ291bnQgPSBwYXR0ZXJuLmxlbmd0aCAvIDE2XG4gICAgICBvZmZzZXRMZW5ndGggPSBNYXRoLmZsb29yKHRvdGFsTGVuZ3RoIC8gMTYgLyBzZWN0aW9uQ291bnQpXG5cbiAgICAgIHBhdHRlcm5TYW1wbGVzID0gQXJyYXkob3ZlcmZsb3dMZW5ndGgpXG4gICAgICBmb3IgaSBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxuICAgICAgICBwYXR0ZXJuU2FtcGxlc1tpXSA9IDBcblxuICAgICAgZm9yIHNvdW5kIGluIHBhdHRlcm4uc291bmRzXG4gICAgICAgIHNyY1NvdW5kID0gc291bmQuX3JlbmRlclxuXG4gICAgICAgIG9iaiA9IEBnZXRPYmplY3QocGF0dGVybi5zcmMpXG4gICAgICAgIG9mZnNldCA9IHNvdW5kLm9mZnNldCAqIG9mZnNldExlbmd0aFxuICAgICAgICBjb3B5TGVuID0gc3JjU291bmQuc2FtcGxlcy5sZW5ndGhcbiAgICAgICAgaWYgKG9mZnNldCArIGNvcHlMZW4pID4gb3ZlcmZsb3dMZW5ndGhcbiAgICAgICAgICBjb3B5TGVuID0gb3ZlcmZsb3dMZW5ndGggLSBvZmZzZXRcblxuICAgICAgICBpZiBvYmouY2xpcFxuICAgICAgICAgIGZhZGVDbGlwID0gMjAwICMgZmFkZSBvdXQgb3ZlciB0aGlzIG1hbnkgc2FtcGxlcyBwcmlvciB0byBhIGNsaXAgdG8gYXZvaWQgYSBwb3BcbiAgICAgICAgICBpZiBvZmZzZXQgPiBmYWRlQ2xpcFxuICAgICAgICAgICAgZm9yIGogaW4gWzAuLi5mYWRlQ2xpcF1cbiAgICAgICAgICAgICAgdiA9IHBhdHRlcm5TYW1wbGVzW29mZnNldCAtIGZhZGVDbGlwICsgal1cbiAgICAgICAgICAgICAgcGF0dGVyblNhbXBsZXNbb2Zmc2V0IC0gZmFkZUNsaXAgKyBqXSA9IE1hdGguZmxvb3IodiAqICgoZmFkZUNsaXAgLSBqKSAvIGZhZGVDbGlwKSlcbiAgICAgICAgICBmb3IgaiBpbiBbb2Zmc2V0Li4ub3ZlcmZsb3dMZW5ndGhdXG4gICAgICAgICAgICAjIGNsZWFuIG91dCB0aGUgcmVzdCBvZiB0aGUgc291bmQgdG8gZW5zdXJlIHRoYXQgdGhlIHByZXZpb3VzIG9uZSAod2hpY2ggY291bGQgYmUgbG9uZ2VyKSB3YXMgZnVsbHkgY2xpcHBlZFxuICAgICAgICAgICAgcGF0dGVyblNhbXBsZXNbal0gPSAwXG4gICAgICAgICAgZm9yIGogaW4gWzAuLi5jb3B5TGVuXVxuICAgICAgICAgICAgcGF0dGVyblNhbXBsZXNbb2Zmc2V0ICsgal0gPSBzcmNTb3VuZC5zYW1wbGVzW2pdXG4gICAgICAgIGVsc2VcbiAgICAgICAgICBmb3IgaiBpbiBbMC4uLmNvcHlMZW5dXG4gICAgICAgICAgICBwYXR0ZXJuU2FtcGxlc1tvZmZzZXQgKyBqXSArPSBzcmNTb3VuZC5zYW1wbGVzW2pdXG5cbiAgICAgICMgTm93IGNvcHkgdGhlIGNsaXBwZWQgcGF0dGVybiBpbnRvIHRoZSBmaW5hbCBsb29wXG4gICAgICBmb3IgaiBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxuICAgICAgICBzYW1wbGVzW2pdICs9IHBhdHRlcm5TYW1wbGVzW2pdXG5cbiAgICByZXR1cm4ge1xuICAgICAgc2FtcGxlczogc2FtcGxlc1xuICAgICAgbGVuZ3RoOiB0b3RhbExlbmd0aFxuICAgIH1cblxuICByZW5kZXJUcmFjazogKHRyYWNrT2JqKSAtPlxuICAgIHBpZWNlQ291bnQgPSAwXG4gICAgZm9yIHBhdHRlcm4gaW4gdHJhY2tPYmouX3BhdHRlcm5zXG4gICAgICBpZiBwaWVjZUNvdW50IDwgcGF0dGVybi5wYXR0ZXJuLmxlbmd0aFxuICAgICAgICBwaWVjZUNvdW50ID0gcGF0dGVybi5wYXR0ZXJuLmxlbmd0aFxuXG4gICAgdG90YWxMZW5ndGggPSAwXG4gICAgb3ZlcmZsb3dMZW5ndGggPSAwXG4gICAgcGllY2VUb3RhbExlbmd0aCA9IEFycmF5KHBpZWNlQ291bnQpXG4gICAgcGllY2VPdmVyZmxvd0xlbmd0aCA9IEFycmF5KHBpZWNlQ291bnQpXG4gICAgZm9yIHBpZWNlSW5kZXggaW4gWzAuLi5waWVjZUNvdW50XVxuICAgICAgcGllY2VUb3RhbExlbmd0aFtwaWVjZUluZGV4XSA9IDBcbiAgICAgIHBpZWNlT3ZlcmZsb3dMZW5ndGhbcGllY2VJbmRleF0gPSAwXG4gICAgICBmb3IgcGF0dGVybiBpbiB0cmFja09iai5fcGF0dGVybnNcbiAgICAgICAgaWYgKHBpZWNlSW5kZXggPCBwYXR0ZXJuLnBhdHRlcm4ubGVuZ3RoKSBhbmQgKHBhdHRlcm4ucGF0dGVybltwaWVjZUluZGV4XSAhPSAnLicpXG4gICAgICAgICAgc3JjU291bmQgPSBAcmVuZGVyKHBhdHRlcm4uc3JjKVxuICAgICAgICAgIGlmIHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF0gPCBzcmNTb3VuZC5sZW5ndGhcbiAgICAgICAgICAgIHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF0gPSBzcmNTb3VuZC5sZW5ndGhcbiAgICAgICAgICBpZiBwaWVjZU92ZXJmbG93TGVuZ3RoW3BpZWNlSW5kZXhdIDwgc3JjU291bmQuc2FtcGxlcy5sZW5ndGhcbiAgICAgICAgICAgIHBpZWNlT3ZlcmZsb3dMZW5ndGhbcGllY2VJbmRleF0gPSBzcmNTb3VuZC5zYW1wbGVzLmxlbmd0aFxuICAgICAgcG9zc2libGVNYXhMZW5ndGggPSB0b3RhbExlbmd0aCArIHBpZWNlT3ZlcmZsb3dMZW5ndGhbcGllY2VJbmRleF1cbiAgICAgIGlmIG92ZXJmbG93TGVuZ3RoIDwgcG9zc2libGVNYXhMZW5ndGhcbiAgICAgICAgb3ZlcmZsb3dMZW5ndGggPSBwb3NzaWJsZU1heExlbmd0aFxuICAgICAgdG90YWxMZW5ndGggKz0gcGllY2VUb3RhbExlbmd0aFtwaWVjZUluZGV4XVxuXG4gICAgc2FtcGxlcyA9IEFycmF5KG92ZXJmbG93TGVuZ3RoKVxuICAgIGZvciBpIGluIFswLi4ub3ZlcmZsb3dMZW5ndGhdXG4gICAgICBzYW1wbGVzW2ldID0gMFxuXG4gICAgZm9yIHBhdHRlcm4gaW4gdHJhY2tPYmouX3BhdHRlcm5zXG4gICAgICB0cmFja09mZnNldCA9IDBcbiAgICAgIHNyY1NvdW5kID0gQHJlbmRlcihwYXR0ZXJuLnNyYywge30pXG4gICAgICBmb3IgcGllY2VJbmRleCBpbiBbMC4uLnBpZWNlQ291bnRdXG4gICAgICAgIGlmIChwaWVjZUluZGV4IDwgcGF0dGVybi5wYXR0ZXJuLmxlbmd0aCkgYW5kIChwYXR0ZXJuLnBhdHRlcm5bcGllY2VJbmRleF0gIT0gJy4nKVxuICAgICAgICAgIGNvcHlMZW4gPSBzcmNTb3VuZC5zYW1wbGVzLmxlbmd0aFxuICAgICAgICAgIGlmICh0cmFja09mZnNldCArIGNvcHlMZW4pID4gb3ZlcmZsb3dMZW5ndGhcbiAgICAgICAgICAgIGNvcHlMZW4gPSBvdmVyZmxvd0xlbmd0aCAtIHRyYWNrT2Zmc2V0XG4gICAgICAgICAgZm9yIGogaW4gWzAuLi5jb3B5TGVuXVxuICAgICAgICAgICAgc2FtcGxlc1t0cmFja09mZnNldCArIGpdICs9IHNyY1NvdW5kLnNhbXBsZXNbal1cblxuICAgICAgICB0cmFja09mZnNldCArPSBwaWVjZVRvdGFsTGVuZ3RoW3BpZWNlSW5kZXhdXG5cbiAgICByZXR1cm4ge1xuICAgICAgc2FtcGxlczogc2FtcGxlc1xuICAgICAgbGVuZ3RoOiB0b3RhbExlbmd0aFxuICAgIH1cblxuICBjYWxjQ2FjaGVOYW1lOiAodHlwZSwgd2hpY2gsIG92ZXJyaWRlcykgLT5cbiAgICBpZiAodHlwZSAhPSAndG9uZScpIGFuZCAodHlwZSAhPSAnc2FtcGxlJylcbiAgICAgIHJldHVybiB3aGljaFxuXG4gICAgbmFtZSA9IHdoaWNoXG4gICAgaWYgb3ZlcnJpZGVzLm5vdGVcbiAgICAgIG5hbWUgKz0gXCIvTiN7b3ZlcnJpZGVzLm5vdGV9XCJcbiAgICBpZiBvdmVycmlkZXMubGVuZ3RoXG4gICAgICBuYW1lICs9IFwiL0wje292ZXJyaWRlcy5sZW5ndGh9XCJcblxuICAgIHJldHVybiBuYW1lXG5cbiAgZ2V0T2JqZWN0OiAod2hpY2gpIC0+XG4gICAgb2JqZWN0ID0gQG9iamVjdHNbd2hpY2hdXG4gICAgaWYgbm90IG9iamVjdFxuICAgICAgQGVycm9yIFwibm8gc3VjaCBvYmplY3QgI3t3aGljaH1cIlxuICAgICAgcmV0dXJuIG51bGxcbiAgICByZXR1cm4gb2JqZWN0XG5cbiAgcmVuZGVyOiAod2hpY2gsIG92ZXJyaWRlcykgLT5cbiAgICBvYmplY3QgPSBAZ2V0T2JqZWN0KHdoaWNoKVxuICAgIGlmIG5vdCBvYmplY3RcbiAgICAgIHJldHVybiBudWxsXG5cbiAgICBvdmVycmlkZXMgPz0ge31cblxuICAgIGNhY2hlTmFtZSA9IEBjYWxjQ2FjaGVOYW1lKG9iamVjdC5fdHlwZSwgd2hpY2gsIG92ZXJyaWRlcylcbiAgICBpZiBAc291bmRDYWNoZVtjYWNoZU5hbWVdXG4gICAgICByZXR1cm4gQHNvdW5kQ2FjaGVbY2FjaGVOYW1lXVxuXG4gICAgc291bmQgPSBzd2l0Y2ggb2JqZWN0Ll90eXBlXG4gICAgICB3aGVuICd0b25lJyB0aGVuIEByZW5kZXJUb25lKG9iamVjdCwgb3ZlcnJpZGVzKVxuICAgICAgd2hlbiAnc2FtcGxlJyB0aGVuIEByZW5kZXJTYW1wbGUob2JqZWN0LCBvdmVycmlkZXMpXG4gICAgICB3aGVuICdsb29wJyB0aGVuIEByZW5kZXJMb29wKG9iamVjdClcbiAgICAgIHdoZW4gJ3RyYWNrJyB0aGVuIEByZW5kZXJUcmFjayhvYmplY3QpXG4gICAgICBlbHNlXG4gICAgICAgIEBlcnJvciBcInVua25vd24gdHlwZSAje29iamVjdC5fdHlwZX1cIlxuICAgICAgICBudWxsXG5cbiAgICBpZiBvYmplY3QuX3R5cGUgIT0gJ3RvbmUnXG4gICAgICBvdmVycmlkZU5vdGUgPSBpZiBvdmVycmlkZXMubm90ZSB0aGVuIG92ZXJyaWRlcy5ub3RlIGVsc2Ugb2JqZWN0Lm5vdGVcbiAgICAgIGlmIChvdmVycmlkZU5vdGUgIT0gb2JqZWN0LnNyY25vdGUpIG9yIChvYmplY3Qub2N0YXZlICE9IG9iamVjdC5zcmNvY3RhdmUpXG4gICAgICAgIG9sZGZyZXEgPSBmaW5kRnJlcShvYmplY3Quc3Jjb2N0YXZlLCBvYmplY3Quc3Jjbm90ZSlcbiAgICAgICAgbmV3ZnJlcSA9IGZpbmRGcmVxKG9iamVjdC5vY3RhdmUsIG92ZXJyaWRlTm90ZSlcblxuICAgICAgICBmYWN0b3IgPSBvbGRmcmVxIC8gbmV3ZnJlcVxuICAgICAgICAjIEBsb2cudmVyYm9zZSBcIm9sZDogI3tvbGRmcmVxfSwgbmV3OiAje25ld2ZyZXF9LCBmYWN0b3I6ICN7ZmFjdG9yfVwiXG5cbiAgICAgICAgIyBUT0RPOiBQcm9wZXJseSByZXNhbXBsZSBoZXJlIHdpdGggc29tZXRoaW5nIG90aGVyIHRoYW4gXCJuZWFyZXN0IG5laWdoYm9yXCJcbiAgICAgICAgcmVsZW5ndGggPSBNYXRoLmZsb29yKHNvdW5kLnNhbXBsZXMubGVuZ3RoICogZmFjdG9yKVxuICAgICAgICByZXNhbXBsZXMgPSBBcnJheShyZWxlbmd0aClcbiAgICAgICAgZm9yIGkgaW4gWzAuLi5yZWxlbmd0aF1cbiAgICAgICAgICByZXNhbXBsZXNbaV0gPSAwXG4gICAgICAgIGZvciBpIGluIFswLi4ucmVsZW5ndGhdXG4gICAgICAgICAgcmVzYW1wbGVzW2ldID0gc291bmQuc2FtcGxlc1tNYXRoLmZsb29yKGkgLyBmYWN0b3IpXVxuXG4gICAgICAgIHNvdW5kLnNhbXBsZXMgPSByZXNhbXBsZXNcbiAgICAgICAgc291bmQubGVuZ3RoID0gcmVzYW1wbGVzLmxlbmd0aFxuXG4gICAgIyBWb2x1bWVcbiAgICBpZiBvYmplY3Qudm9sdW1lPyBhbmQgKG9iamVjdC52b2x1bWUgIT0gMS4wKVxuICAgICAgZm9yIGkgaW4gWzAuLi5zb3VuZC5zYW1wbGVzLmxlbmd0aF1cbiAgICAgICAgc291bmQuc2FtcGxlc1tpXSAqPSBvYmplY3Qudm9sdW1lXG5cbiAgICAjIFJldmVyYlxuICAgIGlmIG9iamVjdC5yZXZlcmI/IGFuZCAob2JqZWN0LnJldmVyYi5kZWxheSA+IDApXG4gICAgICBkZWxheVNhbXBsZXMgPSBNYXRoLmZsb29yKG9iamVjdC5yZXZlcmIuZGVsYXkgKiBAc2FtcGxlUmF0ZSAvIDEwMDApXG4gICAgICBpZiBzb3VuZC5zYW1wbGVzLmxlbmd0aCA+IGRlbGF5U2FtcGxlc1xuICAgICAgICB0b3RhbExlbmd0aCA9IHNvdW5kLnNhbXBsZXMubGVuZ3RoICsgKGRlbGF5U2FtcGxlcyAqIDgpICMgdGhpcyAqOCBpcyB0b3RhbGx5IHdyb25nLiBOZWVkcyBtb3JlIHRob3VnaHQuXG4gICAgICAgICMgQGxvZy52ZXJib3NlIFwicmV2ZXJiaW5nICN7Y2FjaGVOYW1lfTogI3tkZWxheVNhbXBsZXN9LiBsZW5ndGggdXBkYXRlICN7c291bmQuc2FtcGxlcy5sZW5ndGh9IC0+ICN7dG90YWxMZW5ndGh9XCJcbiAgICAgICAgc2FtcGxlcyA9IEFycmF5KHRvdGFsTGVuZ3RoKVxuICAgICAgICBmb3IgaSBpbiBbMC4uLnNvdW5kLnNhbXBsZXMubGVuZ3RoXVxuICAgICAgICAgIHNhbXBsZXNbaV0gPSBzb3VuZC5zYW1wbGVzW2ldXG4gICAgICAgIGZvciBpIGluIFtzb3VuZC5zYW1wbGVzLmxlbmd0aC4uLnRvdGFsTGVuZ3RoXVxuICAgICAgICAgIHNhbXBsZXNbaV0gPSAwXG4gICAgICAgIGZvciBpIGluIFswLi4uKHRvdGFsTGVuZ3RoIC0gZGVsYXlTYW1wbGVzKV1cbiAgICAgICAgICBzYW1wbGVzW2kgKyBkZWxheVNhbXBsZXNdICs9IE1hdGguZmxvb3Ioc2FtcGxlc1tpXSAqIG9iamVjdC5yZXZlcmIuZGVjYXkpXG4gICAgICAgIHNvdW5kLnNhbXBsZXMgPSBzYW1wbGVzXG5cbiAgICBAbG9nLnZlcmJvc2UgXCJSZW5kZXJlZCAje2NhY2hlTmFtZX0uXCJcbiAgICBAc291bmRDYWNoZVtjYWNoZU5hbWVdID0gc291bmRcbiAgICByZXR1cm4gc291bmRcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIFdhdmVmb3JtIEltYWdlIFJlbmRlcmVyXG5cbnJlbmRlcldhdmVmb3JtSW1hZ2UgPSAoc2FtcGxlcywgd2lkdGgsIGhlaWdodCwgYmFja2dyb3VuZENvbG9yLCB3YXZlZm9ybUNvbG9yKSAtPlxuICBiYWNrZ3JvdW5kQ29sb3IgPz0gWzI1NSwgMjU1LCAyNTVdXG4gIHdhdmVmb3JtQ29sb3IgPz0gWzI1NSwgMCwgMF1cbiAgcm93cyA9IFtdXG4gIGZvciBqIGluIFswLi4uaGVpZ2h0XVxuICAgIHJvdyA9IFtdXG4gICAgZm9yIGkgaW4gWzAuLi53aWR0aF1cbiAgICAgIHJvdy5wdXNoIGJhY2tncm91bmRDb2xvclxuICAgIHJvd3MucHVzaCByb3dcblxuICBzYW1wbGVzUGVyQ29sID0gTWF0aC5mbG9vcihzYW1wbGVzLmxlbmd0aCAvIHdpZHRoKVxuXG4gIHBlYWsgPSAwXG4gIGZvciBzYW1wbGUgaW4gc2FtcGxlc1xuICAgIGEgPSBNYXRoLmFicyhzYW1wbGUpXG4gICAgaWYgcGVhayA8IGFcbiAgICAgIHBlYWsgPSBhXG5cbiAgcGVhayA9IE1hdGguZmxvb3IocGVhayAqIDEuMSkgIyBHaXZlIGEgYml0IG9mIG1hcmdpbiBvbiB0b3AvYm90dG9tXG5cbiAgaWYgcGVhayA9PSAwXG4gICAgcm93ID0gcm93c1sgTWF0aC5mbG9vcihoZWlnaHQgLyAyKSBdXG4gICAgZm9yIGkgaW4gWzAuLi53aWR0aF1cbiAgICAgIHJvd1tpXSA9IHdhdmVmb3JtQ29sb3JcbiAgZWxzZVxuICAgIGZvciBpIGluIFswLi4ud2lkdGhdXG4gICAgICBzYW1wbGVPZmZzZXQgPSBNYXRoLmZsb29yKChpIC8gd2lkdGgpICogc2FtcGxlcy5sZW5ndGgpXG4gICAgICBzYW1wbGVTdW0gPSAwXG4gICAgICBzYW1wbGVNYXggPSAwXG4gICAgICBmb3Igc2FtcGxlSW5kZXggaW4gW3NhbXBsZU9mZnNldC4uLihzYW1wbGVPZmZzZXQrc2FtcGxlc1BlckNvbCldXG4gICAgICAgIGEgPSBNYXRoLmFicyhzYW1wbGVzW3NhbXBsZUluZGV4XSlcbiAgICAgICAgc2FtcGxlU3VtICs9IGFcbiAgICAgICAgaWYgc2FtcGxlTWF4IDwgYVxuICAgICAgICAgIHNhbXBsZU1heCA9IGFcbiAgICAgIHNhbXBsZUF2ZyA9IE1hdGguZmxvb3Ioc2FtcGxlU3VtIC8gc2FtcGxlc1BlckNvbClcbiAgICAgIGxpbmVIZWlnaHQgPSBNYXRoLmZsb29yKHNhbXBsZU1heCAvIHBlYWsgKiBoZWlnaHQpXG4gICAgICBsaW5lT2Zmc2V0ID0gKGhlaWdodCAtIGxpbmVIZWlnaHQpID4+IDFcbiAgICAgIGlmIGxpbmVIZWlnaHQgPT0gMFxuICAgICAgICBsaW5lSGVpZ2h0ID0gMVxuICAgICAgZm9yIGogaW4gWzAuLi5saW5lSGVpZ2h0XVxuICAgICAgICByb3cgPSByb3dzW2ogKyBsaW5lT2Zmc2V0XVxuICAgICAgICByb3dbaV0gPSB3YXZlZm9ybUNvbG9yXG5cbiAgcmV0dXJuIGdlbmVyYXRlQml0bWFwRGF0YVVSTCByb3dzXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBFeHBvcnRzXG5cbnJlbmRlckxvb3BTY3JpcHQgPSAoYXJncykgLT5cbiAgbG9nT2JqID0gYXJncy5sb2dcbiAgbG9nT2JqLnZlcmJvc2UgXCJQYXJzaW5nLi4uXCJcbiAgcGFyc2VyID0gbmV3IFBhcnNlcihsb2dPYmopXG4gIHBhcnNlci5wYXJzZSBhcmdzLnNjcmlwdFxuXG4gIHdoaWNoID0gYXJncy53aGljaFxuICB3aGljaCA/PSBwYXJzZXIubGFzdE9iamVjdFxuXG4gIGlmIHdoaWNoXG4gICAgc2FtcGxlUmF0ZSA9IDQ0MTAwXG4gICAgbG9nT2JqLnZlcmJvc2UgXCJSZW5kZXJpbmcuLi5cIlxuICAgIHJlbmRlcmVyID0gbmV3IFJlbmRlcmVyKGxvZ09iaiwgc2FtcGxlUmF0ZSwgYXJncy5yZWFkTG9jYWxGaWxlcywgcGFyc2VyLm9iamVjdHMpXG4gICAgb3V0cHV0U291bmQgPSByZW5kZXJlci5yZW5kZXIod2hpY2gsIHt9KVxuICAgIHJldCA9IHt9XG4gICAgaWYgYXJncy53YXZGaWxlbmFtZVxuICAgICAgcmlmZndhdmUud3JpdGVXQVYgYXJncy53YXZGaWxlbmFtZSwgc2FtcGxlUmF0ZSwgb3V0cHV0U291bmQuc2FtcGxlc1xuICAgIGVsc2VcbiAgICAgIHJldC53YXZVcmwgPSByaWZmd2F2ZS5tYWtlQmxvYlVybChzYW1wbGVSYXRlLCBvdXRwdXRTb3VuZC5zYW1wbGVzKVxuICAgIGlmIGFyZ3MuaW1hZ2VXaWR0aD8gYW5kIGFyZ3MuaW1hZ2VIZWlnaHQ/IGFuZCAoYXJncy5pbWFnZVdpZHRoID4gMCkgYW5kIChhcmdzLmltYWdlSGVpZ2h0ID4gMClcbiAgICAgIHJldC5pbWFnZVVybCA9IHJlbmRlcldhdmVmb3JtSW1hZ2Uob3V0cHV0U291bmQuc2FtcGxlcywgYXJncy5pbWFnZVdpZHRoLCBhcmdzLmltYWdlSGVpZ2h0LCBhcmdzLmltYWdlQmFja2dyb3VuZENvbG9yLCBhcmdzLmltYWdlV2F2ZWZvcm1Db2xvcilcbiAgICByZXR1cm4gcmV0XG5cbiAgcmV0dXJuIG51bGxcblxubW9kdWxlLmV4cG9ydHMgPVxuICByZW5kZXI6IHJlbmRlckxvb3BTY3JpcHRcbiIsImZzID0gcmVxdWlyZSBcImZzXCJcblxuY2xhc3MgRmFzdEJhc2U2NFxuXG4gIGNvbnN0cnVjdG9yOiAtPlxuICAgIEBjaGFycyA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLz1cIlxuICAgIEBlbmNMb29rdXAgPSBbXVxuICAgIGZvciBpIGluIFswLi4uNDA5Nl1cbiAgICAgIEBlbmNMb29rdXBbaV0gPSBAY2hhcnNbaSA+PiA2XSArIEBjaGFyc1tpICYgMHgzRl1cblxuICBlbmNvZGU6IChzcmMpIC0+XG4gICAgbGVuID0gc3JjLmxlbmd0aFxuICAgIGRzdCA9ICcnXG4gICAgaSA9IDBcbiAgICB3aGlsZSAobGVuID4gMilcbiAgICAgIG4gPSAoc3JjW2ldIDw8IDE2KSB8IChzcmNbaSsxXTw8OCkgfCBzcmNbaSsyXVxuICAgICAgZHN0Kz0gdGhpcy5lbmNMb29rdXBbbiA+PiAxMl0gKyB0aGlzLmVuY0xvb2t1cFtuICYgMHhGRkZdXG4gICAgICBsZW4tPSAzXG4gICAgICBpKz0gM1xuICAgIGlmIChsZW4gPiAwKVxuICAgICAgbjE9IChzcmNbaV0gJiAweEZDKSA+PiAyXG4gICAgICBuMj0gKHNyY1tpXSAmIDB4MDMpIDw8IDRcbiAgICAgIGlmIChsZW4gPiAxKVxuICAgICAgICBuMiB8PSAoc3JjWysraV0gJiAweEYwKSA+PiA0XG4gICAgICBkc3QrPSB0aGlzLmNoYXJzW24xXVxuICAgICAgZHN0Kz0gdGhpcy5jaGFyc1tuMl1cbiAgICAgIGlmIChsZW4gPT0gMilcbiAgICAgICAgbjM9IChzcmNbaSsrXSAmIDB4MEYpIDw8IDJcbiAgICAgICAgbjMgfD0gKHNyY1tpXSAmIDB4QzApID4+IDZcbiAgICAgICAgZHN0Kz0gdGhpcy5jaGFyc1tuM11cbiAgICAgIGlmIChsZW4gPT0gMSlcbiAgICAgICAgZHN0Kz0gJz0nXG4gICAgICBkc3QrPSAnPSdcblxuICAgIHJldHVybiBkc3RcblxuY2xhc3MgUklGRldBVkVcbiAgY29uc3RydWN0b3I6IChAc2FtcGxlUmF0ZSwgQGRhdGEpIC0+XG4gICAgQHdhdiA9IFtdICAgICAjIEFycmF5IGNvbnRhaW5pbmcgdGhlIGdlbmVyYXRlZCB3YXZlIGZpbGVcbiAgICBAaGVhZGVyID0gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIyBPRkZTIFNJWkUgTk9URVNcbiAgICAgIGNodW5rSWQgICAgICA6IFsweDUyLDB4NDksMHg0NiwweDQ2XSwgIyAwICAgIDQgIFwiUklGRlwiID0gMHg1MjQ5NDY0NlxuICAgICAgY2h1bmtTaXplICAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDQgICAgNCAgMzYrU3ViQ2h1bmsyU2l6ZSA9IDQrKDgrU3ViQ2h1bmsxU2l6ZSkrKDgrU3ViQ2h1bmsyU2l6ZSlcbiAgICAgIGZvcm1hdCAgICAgICA6IFsweDU3LDB4NDEsMHg1NiwweDQ1XSwgIyA4ICAgIDQgIFwiV0FWRVwiID0gMHg1NzQxNTY0NVxuICAgICAgc3ViQ2h1bmsxSWQgIDogWzB4NjYsMHg2ZCwweDc0LDB4MjBdLCAjIDEyICAgNCAgXCJmbXQgXCIgPSAweDY2NmQ3NDIwXG4gICAgICBzdWJDaHVuazFTaXplOiAxNiwgICAgICAgICAgICAgICAgICAgICMgMTYgICA0ICAxNiBmb3IgUENNXG4gICAgICBhdWRpb0Zvcm1hdCAgOiAxLCAgICAgICAgICAgICAgICAgICAgICMgMjAgICAyICBQQ00gPSAxXG4gICAgICBudW1DaGFubmVscyAgOiAxLCAgICAgICAgICAgICAgICAgICAgICMgMjIgICAyICBNb25vID0gMSwgU3RlcmVvID0gMi4uLlxuICAgICAgc2FtcGxlUmF0ZSAgIDogQHNhbXBsZVJhdGUsICAgICAgICAgICAjIDI0ICAgNCAgODAwMCwgNDQxMDAuLi5cbiAgICAgIGJ5dGVSYXRlICAgICA6IDAsICAgICAgICAgICAgICAgICAgICAgIyAyOCAgIDQgIFNhbXBsZVJhdGUqTnVtQ2hhbm5lbHMqQml0c1BlclNhbXBsZS84XG4gICAgICBibG9ja0FsaWduICAgOiAwLCAgICAgICAgICAgICAgICAgICAgICMgMzIgICAyICBOdW1DaGFubmVscypCaXRzUGVyU2FtcGxlLzhcbiAgICAgIGJpdHNQZXJTYW1wbGU6IDE2LCAgICAgICAgICAgICAgICAgICAgIyAzNCAgIDIgIDggYml0cyA9IDgsIDE2IGJpdHMgPSAxNlxuICAgICAgc3ViQ2h1bmsySWQgIDogWzB4NjQsMHg2MSwweDc0LDB4NjFdLCAjIDM2ICAgNCAgXCJkYXRhXCIgPSAweDY0NjE3NDYxXG4gICAgICBzdWJDaHVuazJTaXplOiAwICAgICAgICAgICAgICAgICAgICAgICMgNDAgICA0ICBkYXRhIHNpemUgPSBOdW1TYW1wbGVzKk51bUNoYW5uZWxzKkJpdHNQZXJTYW1wbGUvOFxuXG4gICAgQGdlbmVyYXRlKClcblxuICB1MzJUb0FycmF5OiAoaSkgLT5cbiAgICByZXR1cm4gW2kmMHhGRiwgKGk+PjgpJjB4RkYsIChpPj4xNikmMHhGRiwgKGk+PjI0KSYweEZGXVxuXG4gIHUxNlRvQXJyYXk6IChpKSAtPlxuICAgIHJldHVybiBbaSYweEZGLCAoaT4+OCkmMHhGRl1cblxuICBzcGxpdDE2Yml0QXJyYXk6IChkYXRhKSAtPlxuICAgIHIgPSBbXVxuICAgIGogPSAwXG4gICAgbGVuID0gZGF0YS5sZW5ndGhcbiAgICBmb3IgaSBpbiBbMC4uLmxlbl1cbiAgICAgIHJbaisrXSA9IGRhdGFbaV0gJiAweEZGXG4gICAgICByW2orK10gPSAoZGF0YVtpXT4+OCkgJiAweEZGXG5cbiAgICByZXR1cm4gclxuXG4gIGdlbmVyYXRlOiAtPlxuICAgIEBoZWFkZXIuYmxvY2tBbGlnbiA9IChAaGVhZGVyLm51bUNoYW5uZWxzICogQGhlYWRlci5iaXRzUGVyU2FtcGxlKSA+PiAzXG4gICAgQGhlYWRlci5ieXRlUmF0ZSA9IEBoZWFkZXIuYmxvY2tBbGlnbiAqIEBzYW1wbGVSYXRlXG4gICAgQGhlYWRlci5zdWJDaHVuazJTaXplID0gQGRhdGEubGVuZ3RoICogKEBoZWFkZXIuYml0c1BlclNhbXBsZSA+PiAzKVxuICAgIEBoZWFkZXIuY2h1bmtTaXplID0gMzYgKyBAaGVhZGVyLnN1YkNodW5rMlNpemVcblxuICAgIGlmIEBoZWFkZXIuYml0c1BlclNhbXBsZSA9PSAxNlxuICAgICAgQGRhdGEgPSBAc3BsaXQxNmJpdEFycmF5KEBkYXRhKVxuXG4gICAgQHdhdiA9IEBoZWFkZXIuY2h1bmtJZC5jb25jYXQoXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLmNodW5rU2l6ZSksXG4gICAgICBAaGVhZGVyLmZvcm1hdCxcbiAgICAgIEBoZWFkZXIuc3ViQ2h1bmsxSWQsXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLnN1YkNodW5rMVNpemUpLFxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5hdWRpb0Zvcm1hdCksXG4gICAgICBAdTE2VG9BcnJheShAaGVhZGVyLm51bUNoYW5uZWxzKSxcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuc2FtcGxlUmF0ZSksXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLmJ5dGVSYXRlKSxcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIuYmxvY2tBbGlnbiksXG4gICAgICBAdTE2VG9BcnJheShAaGVhZGVyLmJpdHNQZXJTYW1wbGUpLFxuICAgICAgQGhlYWRlci5zdWJDaHVuazJJZCxcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuc3ViQ2h1bmsyU2l6ZSksXG4gICAgICBAZGF0YVxuICAgIClcbiAgICBmYiA9IG5ldyBGYXN0QmFzZTY0XG4gICAgQGJhc2U2NERhdGEgPSBmYi5lbmNvZGUoQHdhdilcbiAgICBAZGF0YVVSSSA9ICdkYXRhOmF1ZGlvL3dhdjtiYXNlNjQsJyArIEBiYXNlNjREYXRhXG5cbiAgcmF3OiAtPlxuICAgIHJldHVybiBuZXcgQnVmZmVyKEBiYXNlNjREYXRhLCBcImJhc2U2NFwiKVxuXG53cml0ZVdBViA9IChmaWxlbmFtZSwgc2FtcGxlUmF0ZSwgc2FtcGxlcykgLT5cbiAgd2F2ZSA9IG5ldyBSSUZGV0FWRSBzYW1wbGVSYXRlLCBzYW1wbGVzXG4gIGZzLndyaXRlRmlsZVN5bmMoZmlsZW5hbWUsIHdhdmUucmF3KCkpXG4gIHJldHVybiB0cnVlXG5cbm1ha2VEYXRhVVJJID0gKHNhbXBsZVJhdGUsIHNhbXBsZXMpIC0+XG4gIHdhdmUgPSBuZXcgUklGRldBVkUgc2FtcGxlUmF0ZSwgc2FtcGxlc1xuICByZXR1cm4gd2F2ZS5kYXRhVVJJXG5cbmI2NHRvQmxvYiA9IChiNjREYXRhLCBjb250ZW50VHlwZSwgc2xpY2VTaXplKSAtPlxuICBjb250ZW50VHlwZSA9IGNvbnRlbnRUeXBlIHx8ICcnXG4gIHNsaWNlU2l6ZSA9IHNsaWNlU2l6ZSB8fCA1MTJcblxuICBieXRlQ2hhcmFjdGVycyA9IGF0b2IoYjY0RGF0YSlcbiAgYnl0ZUFycmF5cyA9IFtdXG5cbiAgZm9yIG9mZnNldCBpbiBbMC4uLmJ5dGVDaGFyYWN0ZXJzLmxlbmd0aF0gYnkgc2xpY2VTaXplXG4gICAgc2xpY2UgPSBieXRlQ2hhcmFjdGVycy5zbGljZShvZmZzZXQsIG9mZnNldCArIHNsaWNlU2l6ZSlcblxuICAgIGJ5dGVOdW1iZXJzID0gbmV3IEFycmF5KHNsaWNlLmxlbmd0aClcbiAgICBmb3IgaSBpbiBbMC4uLnNsaWNlLmxlbmd0aF1cbiAgICAgIGJ5dGVOdW1iZXJzW2ldID0gc2xpY2UuY2hhckNvZGVBdChpKVxuXG4gICAgYnl0ZUFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoYnl0ZU51bWJlcnMpXG5cbiAgICBieXRlQXJyYXlzLnB1c2goYnl0ZUFycmF5KVxuXG4gIGJsb2IgPSBuZXcgQmxvYihieXRlQXJyYXlzLCB7dHlwZTogY29udGVudFR5cGV9KVxuICByZXR1cm4gYmxvYlxuXG5tYWtlQmxvYlVybCA9IChzYW1wbGVSYXRlLCBzYW1wbGVzKSAtPlxuICB3YXZlID0gbmV3IFJJRkZXQVZFIHNhbXBsZVJhdGUsIHNhbXBsZXNcbiAgYmxvYiA9IGI2NHRvQmxvYih3YXZlLmJhc2U2NERhdGEsIFwiYXVkaW8vd2F2XCIpXG4gIHJldHVybiBVUkwuY3JlYXRlT2JqZWN0VVJMKGJsb2IpXG5cbm1vZHVsZS5leHBvcnRzID1cbiAgUklGRldBVkU6IFJJRkZXQVZFXG4gIHdyaXRlV0FWOiB3cml0ZVdBVlxuICBtYWtlRGF0YVVSSTogbWFrZURhdGFVUklcbiAgbWFrZUJsb2JVcmw6IG1ha2VCbG9iVXJsXG4iLCJ2YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG47KGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuICB2YXIgQXJyID0gKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJylcbiAgICA/IFVpbnQ4QXJyYXlcbiAgICA6IEFycmF5XG5cblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTKVxuXHRcdFx0cmV0dXJuIDYyIC8vICcrJ1xuXHRcdGlmIChjb2RlID09PSBTTEFTSClcblx0XHRcdHJldHVybiA2MyAvLyAnLydcblx0XHRpZiAoY29kZSA8IE5VTUJFUilcblx0XHRcdHJldHVybiAtMSAvL25vIG1hdGNoXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIgKyAxMClcblx0XHRcdHJldHVybiBjb2RlIC0gTlVNQkVSICsgMjYgKyAyNlxuXHRcdGlmIChjb2RlIDwgVVBQRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gVVBQRVJcblx0XHRpZiAoY29kZSA8IExPV0VSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIExPV0VSICsgMjZcblx0fVxuXG5cdGZ1bmN0aW9uIGI2NFRvQnl0ZUFycmF5IChiNjQpIHtcblx0XHR2YXIgaSwgaiwgbCwgdG1wLCBwbGFjZUhvbGRlcnMsIGFyclxuXG5cdFx0aWYgKGI2NC5sZW5ndGggJSA0ID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0Jylcblx0XHR9XG5cblx0XHQvLyB0aGUgbnVtYmVyIG9mIGVxdWFsIHNpZ25zIChwbGFjZSBob2xkZXJzKVxuXHRcdC8vIGlmIHRoZXJlIGFyZSB0d28gcGxhY2Vob2xkZXJzLCB0aGFuIHRoZSB0d28gY2hhcmFjdGVycyBiZWZvcmUgaXRcblx0XHQvLyByZXByZXNlbnQgb25lIGJ5dGVcblx0XHQvLyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgdGhlbiB0aGUgdGhyZWUgY2hhcmFjdGVycyBiZWZvcmUgaXQgcmVwcmVzZW50IDIgYnl0ZXNcblx0XHQvLyB0aGlzIGlzIGp1c3QgYSBjaGVhcCBoYWNrIHRvIG5vdCBkbyBpbmRleE9mIHR3aWNlXG5cdFx0dmFyIGxlbiA9IGI2NC5sZW5ndGhcblx0XHRwbGFjZUhvbGRlcnMgPSAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMikgPyAyIDogJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDEpID8gMSA6IDBcblxuXHRcdC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuXHRcdGFyciA9IG5ldyBBcnIoYjY0Lmxlbmd0aCAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKVxuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHBsYWNlaG9sZGVycywgb25seSBnZXQgdXAgdG8gdGhlIGxhc3QgY29tcGxldGUgNCBjaGFyc1xuXHRcdGwgPSBwbGFjZUhvbGRlcnMgPiAwID8gYjY0Lmxlbmd0aCAtIDQgOiBiNjQubGVuZ3RoXG5cblx0XHR2YXIgTCA9IDBcblxuXHRcdGZ1bmN0aW9uIHB1c2ggKHYpIHtcblx0XHRcdGFycltMKytdID0gdlxuXHRcdH1cblxuXHRcdGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbDsgaSArPSA0LCBqICs9IDMpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTgpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgMTIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPDwgNikgfCBkZWNvZGUoYjY0LmNoYXJBdChpICsgMykpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDAwMCkgPj4gMTYpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDApID4+IDgpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpID4+IDQpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fSBlbHNlIGlmIChwbGFjZUhvbGRlcnMgPT09IDEpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTApIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgNCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA+PiAyKVxuXHRcdFx0cHVzaCgodG1wID4+IDgpICYgMHhGRilcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJyXG5cdH1cblxuXHRmdW5jdGlvbiB1aW50OFRvQmFzZTY0ICh1aW50OCkge1xuXHRcdHZhciBpLFxuXHRcdFx0ZXh0cmFCeXRlcyA9IHVpbnQ4Lmxlbmd0aCAlIDMsIC8vIGlmIHdlIGhhdmUgMSBieXRlIGxlZnQsIHBhZCAyIGJ5dGVzXG5cdFx0XHRvdXRwdXQgPSBcIlwiLFxuXHRcdFx0dGVtcCwgbGVuZ3RoXG5cblx0XHRmdW5jdGlvbiBlbmNvZGUgKG51bSkge1xuXHRcdFx0cmV0dXJuIGxvb2t1cC5jaGFyQXQobnVtKVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRyaXBsZXRUb0Jhc2U2NCAobnVtKSB7XG5cdFx0XHRyZXR1cm4gZW5jb2RlKG51bSA+PiAxOCAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiAxMiAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiA2ICYgMHgzRikgKyBlbmNvZGUobnVtICYgMHgzRilcblx0XHR9XG5cblx0XHQvLyBnbyB0aHJvdWdoIHRoZSBhcnJheSBldmVyeSB0aHJlZSBieXRlcywgd2UnbGwgZGVhbCB3aXRoIHRyYWlsaW5nIHN0dWZmIGxhdGVyXG5cdFx0Zm9yIChpID0gMCwgbGVuZ3RoID0gdWludDgubGVuZ3RoIC0gZXh0cmFCeXRlczsgaSA8IGxlbmd0aDsgaSArPSAzKSB7XG5cdFx0XHR0ZW1wID0gKHVpbnQ4W2ldIDw8IDE2KSArICh1aW50OFtpICsgMV0gPDwgOCkgKyAodWludDhbaSArIDJdKVxuXHRcdFx0b3V0cHV0ICs9IHRyaXBsZXRUb0Jhc2U2NCh0ZW1wKVxuXHRcdH1cblxuXHRcdC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcblx0XHRzd2l0Y2ggKGV4dHJhQnl0ZXMpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0dGVtcCA9IHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAyKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9PSdcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgMjpcblx0XHRcdFx0dGVtcCA9ICh1aW50OFt1aW50OC5sZW5ndGggLSAyXSA8PCA4KSArICh1aW50OFt1aW50OC5sZW5ndGggLSAxXSlcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDEwKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wID4+IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCAyKSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPSdcblx0XHRcdFx0YnJlYWtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0XG5cdH1cblxuXHRleHBvcnRzLnRvQnl0ZUFycmF5ID0gYjY0VG9CeXRlQXJyYXlcblx0ZXhwb3J0cy5mcm9tQnl0ZUFycmF5ID0gdWludDhUb0Jhc2U2NFxufSh0eXBlb2YgZXhwb3J0cyA9PT0gJ3VuZGVmaW5lZCcgPyAodGhpcy5iYXNlNjRqcyA9IHt9KSA6IGV4cG9ydHMpKVxuIiwiZXhwb3J0cy5yZWFkID0gZnVuY3Rpb24oYnVmZmVyLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBuQml0cyA9IC03LFxuICAgICAgaSA9IGlzTEUgPyAobkJ5dGVzIC0gMSkgOiAwLFxuICAgICAgZCA9IGlzTEUgPyAtMSA6IDEsXG4gICAgICBzID0gYnVmZmVyW29mZnNldCArIGldO1xuXG4gIGkgKz0gZDtcblxuICBlID0gcyAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgcyA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IGVMZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IGUgPSBlICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIG0gPSBlICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBlID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gbUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgbSA9IG0gKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgaWYgKGUgPT09IDApIHtcbiAgICBlID0gMSAtIGVCaWFzO1xuICB9IGVsc2UgaWYgKGUgPT09IGVNYXgpIHtcbiAgICByZXR1cm4gbSA/IE5hTiA6ICgocyA/IC0xIDogMSkgKiBJbmZpbml0eSk7XG4gIH0gZWxzZSB7XG4gICAgbSA9IG0gKyBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICBlID0gZSAtIGVCaWFzO1xuICB9XG4gIHJldHVybiAocyA/IC0xIDogMSkgKiBtICogTWF0aC5wb3coMiwgZSAtIG1MZW4pO1xufTtcblxuZXhwb3J0cy53cml0ZSA9IGZ1bmN0aW9uKGJ1ZmZlciwgdmFsdWUsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLCBjLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIHJ0ID0gKG1MZW4gPT09IDIzID8gTWF0aC5wb3coMiwgLTI0KSAtIE1hdGgucG93KDIsIC03NykgOiAwKSxcbiAgICAgIGkgPSBpc0xFID8gMCA6IChuQnl0ZXMgLSAxKSxcbiAgICAgIGQgPSBpc0xFID8gMSA6IC0xLFxuICAgICAgcyA9IHZhbHVlIDwgMCB8fCAodmFsdWUgPT09IDAgJiYgMSAvIHZhbHVlIDwgMCkgPyAxIDogMDtcblxuICB2YWx1ZSA9IE1hdGguYWJzKHZhbHVlKTtcblxuICBpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlID09PSBJbmZpbml0eSkge1xuICAgIG0gPSBpc05hTih2YWx1ZSkgPyAxIDogMDtcbiAgICBlID0gZU1heDtcbiAgfSBlbHNlIHtcbiAgICBlID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMik7XG4gICAgaWYgKHZhbHVlICogKGMgPSBNYXRoLnBvdygyLCAtZSkpIDwgMSkge1xuICAgICAgZS0tO1xuICAgICAgYyAqPSAyO1xuICAgIH1cbiAgICBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIHZhbHVlICs9IHJ0IC8gYztcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgKz0gcnQgKiBNYXRoLnBvdygyLCAxIC0gZUJpYXMpO1xuICAgIH1cbiAgICBpZiAodmFsdWUgKiBjID49IDIpIHtcbiAgICAgIGUrKztcbiAgICAgIGMgLz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZSArIGVCaWFzID49IGVNYXgpIHtcbiAgICAgIG0gPSAwO1xuICAgICAgZSA9IGVNYXg7XG4gICAgfSBlbHNlIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgbSA9ICh2YWx1ZSAqIGMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IGUgKyBlQmlhcztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IHZhbHVlICogTWF0aC5wb3coMiwgZUJpYXMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IDA7XG4gICAgfVxuICB9XG5cbiAgZm9yICg7IG1MZW4gPj0gODsgYnVmZmVyW29mZnNldCArIGldID0gbSAmIDB4ZmYsIGkgKz0gZCwgbSAvPSAyNTYsIG1MZW4gLT0gOCk7XG5cbiAgZSA9IChlIDw8IG1MZW4pIHwgbTtcbiAgZUxlbiArPSBtTGVuO1xuICBmb3IgKDsgZUxlbiA+IDA7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IGUgJiAweGZmLCBpICs9IGQsIGUgLz0gMjU2LCBlTGVuIC09IDgpO1xuXG4gIGJ1ZmZlcltvZmZzZXQgKyBpIC0gZF0gfD0gcyAqIDEyODtcbn07XG4iLCJcbi8qKlxuICogaXNBcnJheVxuICovXG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheTtcblxuLyoqXG4gKiB0b1N0cmluZ1xuICovXG5cbnZhciBzdHIgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nO1xuXG4vKipcbiAqIFdoZXRoZXIgb3Igbm90IHRoZSBnaXZlbiBgdmFsYFxuICogaXMgYW4gYXJyYXkuXG4gKlxuICogZXhhbXBsZTpcbiAqXG4gKiAgICAgICAgaXNBcnJheShbXSk7XG4gKiAgICAgICAgLy8gPiB0cnVlXG4gKiAgICAgICAgaXNBcnJheShhcmd1bWVudHMpO1xuICogICAgICAgIC8vID4gZmFsc2VcbiAqICAgICAgICBpc0FycmF5KCcnKTtcbiAqICAgICAgICAvLyA+IGZhbHNlXG4gKlxuICogQHBhcmFtIHttaXhlZH0gdmFsXG4gKiBAcmV0dXJuIHtib29sfVxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gaXNBcnJheSB8fCBmdW5jdGlvbiAodmFsKSB7XG4gIHJldHVybiAhISB2YWwgJiYgJ1tvYmplY3QgQXJyYXldJyA9PSBzdHIuY2FsbCh2YWwpO1xufTtcbiJdfQ==
