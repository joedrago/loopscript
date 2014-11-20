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

},{"base64-js":4,"ieee754":5,"is-array":6}],4:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){

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

},{}],"./beatmaker":[function(require,module,exports){
module.exports=require('+lAcbR');
},{}],"+lAcbR":[function(require,module,exports){
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



},{}],"./examples":[function(require,module,exports){
module.exports=require('J6p0lP');
},{}],"J6p0lP":[function(require,module,exports){
module.exports = {
  first: "# ------------------------------------------------------------\n# Your first LoopScript. Click \"Compile\" below to start!\n\ntone note1\n  duration 250\n  octave 4\n  note C\n\ntone bass1\n  duration 250\n  octave 1\n  note B\n\nloop loop1\n  pattern note1 x.......x.......\n  pattern bass1 ....x.......x...\n",
  notes: "# ------------------------------------------------------------\n# Note overrides!\n\n# H-L are the black keys:\n#     H I   J K L\n#    C D E F G A B\n\n# Try setting the duration to 100\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  duration 250\n\n# Samples can have their notes overridden too!\nsample ding\n  src samples/ding_e.wav\n  srcnote e\n\nloop loop1\n  pattern note1 b.a.g.a.b.b.b...\n\nloop loop2\n  pattern ding b.a.g.a.b.b.b...\n\ntrack song\n  pattern loop1 x\n  pattern loop2 .x\n",
  motto: "# ------------------------------------------------------------\n# An approximation of the beat from Drake's \"The Motto\"\n\nbpm 100\nsection # to share ADSR\n  adsr 0.005 0.05 0.7 0.05\n  tone bass1 -> octave 1\n  tone bass2 -> octave 2\n\nsample clap  -> src samples/clap.wav\nsample snare -> src samples/snare.wav\nsample hihat -> src samples/hihat.wav\n\nloop loop1\n  pattern hihat ..x.......x.......x.......x.....\n  pattern clap  ....x.......x.......x.......x...\n  pattern snare ......x...x...x.x...............\n  pattern bass1 Bbbbbb..........................\n  pattern bass2 ......HhhhhhDddddd....HhhhJj.Jj.\n\ntrack song\n  pattern loop1 xxxx\n",
  length: "# ------------------------------------------------------------\n# Showing off various note lengths using caps and lowercase\n# Also shows what ADSR can do!\n\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n\ntone note2\n  # Note: Only the first tone has ADSR\n\n# If you use any letters other than \"x\" on a tone pattern, you override its\n# note with the note listed. Also, if you use any capital letters in a pattern,\n# you override the length of that note with the number of matching lowercase\n# letters following it.\n\nloop loop1\n  pattern note1 GgggggggFfffff..AaaaBbb.Cc..D...\n\nloop loop2\n  pattern note2 GgggggggFfffff..AaaaBbb.Cc..D...\n\ntrack song\n  pattern loop1 x.\n  pattern loop2 .x\n",
  chocobo: "# ------------------------------------------------------------\n# The Chocobo Theme (first part only)\n\nbpm 125\n\nsection Tone (in a section to share ADSR)\n  adsr 0.005 0.05 0.7 0.05\n  tone chocobo1\n    octave 5\n  tone chocobo2\n    octave 4\n\nloop loop1\n pattern chocobo1 Dddd......Dd..........................................D.E.Ffffff...\n pattern chocobo2 ....BbGgEe..BbGgBb..Gg..Bbbbbb.AaGgGAG.F.Gggggg.F.GgGB.............\n\ntrack song\n  pattern loop1 xx",
  kick: "# ------------------------------------------------------------\n# Bass kick (mixing a simple kick with a sustained bass sine)\n# Try changing 'freq' to anywhere in 55-80, and/or 'duration'\n\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  freq 60\n  duration 1500\n\nsample kick\n  src samples/kick3.wav\n\ntrack BassKick\n  pattern note1 x\n  pattern kick  x\n",
  kickpattern: "# ------------------------------------------------------------\n# Simple kick pattern\n\nbpm 90\n\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  octave 1\n  duration 1500\n\nsample kick\n  src samples/kick3.wav\n\nsample clap\n  src samples/clap.wav\n\nloop loop1\n  pattern clap  ....x.......x...\n  pattern note1 b.b...b.b.b.....\n  pattern kick  x.x...x.x.x.....\n\ntrack derp\n  pattern loop1 xxxx\n",
  wiggle: "# ------------------------------------------------------------\n# A silly approximation of Jason Derulo's Wiggle\n\nbpm 82\n\ntone bass\n  adsr 0.005 0.05 0.7 0.05\n  duration 1500\n  octave 2\n\nsample kick\n  src samples/kick3.wav\n\nsample snap\n  volume 0.5\n  src samples/snap.wav\n\nloop loop1\n  pattern snap ....x.......x...\n  pattern kick x..x..x.........\n  pattern bass a..f..e.........\n\ntrack wiggle\n  pattern loop1 xxxx",
  beatmaker: "# ------------------------------------------------------------\n# BeatMaker Test Bed\n\nsample K -> src samples/kick3.wav\nsample C -> src samples/clap.wav\n\n# ------------------------------------------------------------\n# Update the pattern lines and BPM here with BeatMaker data.\n\nbpm 90\n\nloop loop1\n  pattern C ....x.......x...\n  pattern K x.x...x.x.x.....\n\n# ------------------------------------------------------------\n\ntrack derp\n  pattern loop1 xxxx\n"
};



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



},{}],"./freq":[function(require,module,exports){
module.exports=require('SwjZMG');
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
},{}]},{},[])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnJvd3Nlci1wYWNrXFxfcHJlbHVkZS5qcyIsImpkYXRhdmlldy5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXGxpYlxcX2VtcHR5LmpzIiwiLi5cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxidWZmZXJcXGluZGV4LmpzIiwiLi5cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxidWZmZXJcXG5vZGVfbW9kdWxlc1xcYmFzZTY0LWpzXFxsaWJcXGI2NC5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnVmZmVyXFxub2RlX21vZHVsZXNcXGllZWU3NTRcXGluZGV4LmpzIiwiLi5cXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxidWZmZXJcXG5vZGVfbW9kdWxlc1xcaXMtYXJyYXlcXGluZGV4LmpzIiwiLi5cXHNyY1xcYmVhdG1ha2VyLmNvZmZlZSIsIi4uXFxzcmNcXGV4YW1wbGVzLmNvZmZlZSIsIi4uXFxzcmNcXGZyZXEuY29mZmVlIiwiLi5cXHNyY1xcbG9vcHNjcmlwdC5jb2ZmZWUiLCIuLlxcc3JjXFxyaWZmd2F2ZS5jb2ZmZWUiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNXZCQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtB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dUJWO0FBQUEsSUFDRSxHQUFBLEVBQUssT0FEUDtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtBQUFBLElBS0UsR0FBQSxFQUFLLE9BTFA7QUFBQSxJQU1FLEdBQUEsRUFBSyxPQU5QO0FBQUEsSUFPRSxHQUFBLEVBQUssT0FQUDtBQUFBLElBUUUsR0FBQSxFQUFLLE9BUlA7QUFBQSxJQVNFLEdBQUEsRUFBSyxPQVRQO0FBQUEsSUFVRSxHQUFBLEVBQUssT0FWUDtBQUFBLElBV0UsR0FBQSxFQUFLLE9BWFA7QUFBQSxJQVlFLEdBQUEsRUFBSyxPQVpQO0dBdkJVLEVBc0NWO0FBQUEsSUFDRSxHQUFBLEVBQUssT0FEUDtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtBQUFBLElBS0UsR0FBQSxFQUFLLE9BTFA7QUFBQSxJQU1FLEdBQUEsRUFBSyxPQU5QO0FBQUEsSUFPRSxHQUFBLEVBQUssT0FQUDtBQUFBLElBUUUsR0FBQSxFQUFLLE9BUlA7QUFBQSxJQVNFLEdBQUEsRUFBSyxPQVRQO0FBQUEsSUFVRSxHQUFBLEVBQUssT0FWUDtBQUFBLElBV0UsR0FBQSxFQUFLLE9BWFA7QUFBQSxJQVlFLEdBQUEsRUFBSyxPQVpQO0dBdENVLEVBcURWO0FBQUEsSUFDRSxHQUFBLEVBQUssT0FEUDtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtBQUFBLElBS0UsR0FBQSxFQUFLLE9BTFA7QUFBQSxJQU1FLEdBQUEsRUFBSyxPQU5QO0FBQUEsSUFPRSxHQUFBLEVBQUssT0FQUDtBQUFBLElBUUUsR0FBQSxFQUFLLE9BUlA7QUFBQSxJQVNFLEdBQUEsRUFBSyxPQVRQO0FBQUEsSUFVRSxHQUFBLEVBQUssT0FWUDtBQUFBLElBV0UsR0FBQSxFQUFLLE9BWFA7QUFBQSxJQVlFLEdBQUEsRUFBSyxPQVpQO0dBckRVLEVBb0VWO0FBQUEsSUFDRSxHQUFBLEVBQUssT0FEUDtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtBQUFBLElBS0UsR0FBQSxFQUFLLE9BTFA7QUFBQSxJQU1FLEdBQUEsRUFBSyxPQU5QO0FBQUEsSUFPRSxHQUFBLEVBQUssT0FQUDtBQUFBLElBUUUsR0FBQSxFQUFLLE9BUlA7QUFBQSxJQVNFLEdBQUEsRUFBSyxPQVRQO0FBQUEsSUFVRSxHQUFBLEVBQUssT0FWUDtBQUFBLElBV0UsR0FBQSxFQUFLLE9BWFA7QUFBQSxJQVlFLEdBQUEsRUFBSyxPQVpQO0dBcEVVLEVBbUZWO0FBQUEsSUFDRSxHQUFBLEVBQUssT0FEUDtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtBQUFBLElBS0UsR0FBQSxFQUFLLE9BTFA7QUFBQSxJQU1FLEdBQUEsRUFBSyxPQU5QO0FBQUEsSUFPRSxHQUFBLEVBQUssT0FQUDtBQUFBLElBUUUsR0FBQSxFQUFLLE9BUlA7QUFBQSxJQVNFLEdBQUEsRUFBSyxPQVRQO0FBQUEsSUFVRSxHQUFBLEVBQUssT0FWUDtBQUFBLElBV0UsR0FBQSxFQUFLLE9BWFA7QUFBQSxJQVlFLEdBQUEsRUFBSyxPQVpQO0dBbkZVLEVBa0dWO0FBQUEsSUFDRSxHQUFBLEVBQUssT0FEUDtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtBQUFBLElBS0UsR0FBQSxFQUFLLE9BTFA7QUFBQSxJQU1FLEdBQUEsRUFBSyxPQU5QO0FBQUEsSUFPRSxHQUFBLEVBQUssT0FQUDtBQUFBLElBUUUsR0FBQSxFQUFLLE9BUlA7QUFBQSxJQVNFLEdBQUEsRUFBSyxPQVRQO0FBQUEsSUFVRSxH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cmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIoZnVuY3Rpb24gKEJ1ZmZlcil7XG4vL1xuLy8gakRhdGFWaWV3IGJ5IFZqZXV4IDx2amV1eHhAZ21haWwuY29tPiAtIEphbiAyMDEwXG4vLyBDb250aW51ZWQgYnkgUlJldmVyc2VyIDxtZUBycmV2ZXJzZXIuY29tPiAtIEZlYiAyMDEzXG4vL1xuLy8gQSB1bmlxdWUgd2F5IHRvIHdvcmsgd2l0aCBhIGJpbmFyeSBmaWxlIGluIHRoZSBicm93c2VyXG4vLyBodHRwOi8vZ2l0aHViLmNvbS9qRGF0YVZpZXcvakRhdGFWaWV3XG4vLyBodHRwOi8vakRhdGFWaWV3LmdpdGh1Yi5pby9cblxuKGZ1bmN0aW9uIChnbG9iYWwpIHtcblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgY29tcGF0aWJpbGl0eSA9IHtcblx0Ly8gTm9kZUpTIEJ1ZmZlciBpbiB2MC41LjUgYW5kIG5ld2VyXG5cdE5vZGVCdWZmZXI6ICdCdWZmZXInIGluIGdsb2JhbCAmJiAncmVhZEludDE2TEUnIGluIEJ1ZmZlci5wcm90b3R5cGUsXG5cdERhdGFWaWV3OiAnRGF0YVZpZXcnIGluIGdsb2JhbCAmJiAoXG5cdFx0J2dldEZsb2F0NjQnIGluIERhdGFWaWV3LnByb3RvdHlwZSB8fCAgICAgICAgICAgIC8vIENocm9tZVxuXHRcdCdnZXRGbG9hdDY0JyBpbiBuZXcgRGF0YVZpZXcobmV3IEFycmF5QnVmZmVyKDEpKSAvLyBOb2RlXG5cdCksXG5cdEFycmF5QnVmZmVyOiAnQXJyYXlCdWZmZXInIGluIGdsb2JhbCxcblx0UGl4ZWxEYXRhOiAnQ2FudmFzUGl4ZWxBcnJheScgaW4gZ2xvYmFsICYmICdJbWFnZURhdGEnIGluIGdsb2JhbCAmJiAnZG9jdW1lbnQnIGluIGdsb2JhbFxufTtcblxuLy8gd2UgZG9uJ3Qgd2FudCB0byBib3RoZXIgd2l0aCBvbGQgQnVmZmVyIGltcGxlbWVudGF0aW9uXG5pZiAoY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyKSB7XG5cdChmdW5jdGlvbiAoYnVmZmVyKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGJ1ZmZlci53cml0ZUZsb2F0TEUoSW5maW5pdHksIDApO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlciA9IGZhbHNlO1xuXHRcdH1cblx0fSkobmV3IEJ1ZmZlcig0KSk7XG59XG5cbmlmIChjb21wYXRpYmlsaXR5LlBpeGVsRGF0YSkge1xuXHR2YXIgY3JlYXRlUGl4ZWxEYXRhID0gZnVuY3Rpb24gKGJ5dGVMZW5ndGgsIGJ1ZmZlcikge1xuXHRcdHZhciBkYXRhID0gY3JlYXRlUGl4ZWxEYXRhLmNvbnRleHQyZC5jcmVhdGVJbWFnZURhdGEoKGJ5dGVMZW5ndGggKyAzKSAvIDQsIDEpLmRhdGE7XG5cdFx0ZGF0YS5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aDtcblx0XHRpZiAoYnVmZmVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZUxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGRhdGFbaV0gPSBidWZmZXJbaV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBkYXRhO1xuXHR9O1xuXHRjcmVhdGVQaXhlbERhdGEuY29udGV4dDJkID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJykuZ2V0Q29udGV4dCgnMmQnKTtcbn1cblxudmFyIGRhdGFUeXBlcyA9IHtcblx0J0ludDgnOiAxLFxuXHQnSW50MTYnOiAyLFxuXHQnSW50MzInOiA0LFxuXHQnVWludDgnOiAxLFxuXHQnVWludDE2JzogMixcblx0J1VpbnQzMic6IDQsXG5cdCdGbG9hdDMyJzogNCxcblx0J0Zsb2F0NjQnOiA4XG59O1xuXG52YXIgbm9kZU5hbWluZyA9IHtcblx0J0ludDgnOiAnSW50OCcsXG5cdCdJbnQxNic6ICdJbnQxNicsXG5cdCdJbnQzMic6ICdJbnQzMicsXG5cdCdVaW50OCc6ICdVSW50OCcsXG5cdCdVaW50MTYnOiAnVUludDE2Jyxcblx0J1VpbnQzMic6ICdVSW50MzInLFxuXHQnRmxvYXQzMic6ICdGbG9hdCcsXG5cdCdGbG9hdDY0JzogJ0RvdWJsZSdcbn07XG5cbmZ1bmN0aW9uIGFycmF5RnJvbShhcnJheUxpa2UsIGZvcmNlQ29weSkge1xuXHRyZXR1cm4gKCFmb3JjZUNvcHkgJiYgKGFycmF5TGlrZSBpbnN0YW5jZW9mIEFycmF5KSkgPyBhcnJheUxpa2UgOiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcnJheUxpa2UpO1xufVxuXG5mdW5jdGlvbiBkZWZpbmVkKHZhbHVlLCBkZWZhdWx0VmFsdWUpIHtcblx0cmV0dXJuIHZhbHVlICE9PSB1bmRlZmluZWQgPyB2YWx1ZSA6IGRlZmF1bHRWYWx1ZTtcbn1cblxuZnVuY3Rpb24gakRhdGFWaWV3KGJ1ZmZlciwgYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCwgbGl0dGxlRW5kaWFuKSB7XG5cdC8qIGpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuXG5cdGlmIChidWZmZXIgaW5zdGFuY2VvZiBqRGF0YVZpZXcpIHtcblx0XHR2YXIgcmVzdWx0ID0gYnVmZmVyLnNsaWNlKGJ5dGVPZmZzZXQsIGJ5dGVPZmZzZXQgKyBieXRlTGVuZ3RoKTtcblx0XHRyZXN1bHQuX2xpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCByZXN1bHQuX2xpdHRsZUVuZGlhbik7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlmICghKHRoaXMgaW5zdGFuY2VvZiBqRGF0YVZpZXcpKSB7XG5cdFx0cmV0dXJuIG5ldyBqRGF0YVZpZXcoYnVmZmVyLCBieXRlT2Zmc2V0LCBieXRlTGVuZ3RoLCBsaXR0bGVFbmRpYW4pO1xuXHR9XG5cblx0dGhpcy5idWZmZXIgPSBidWZmZXIgPSBqRGF0YVZpZXcud3JhcEJ1ZmZlcihidWZmZXIpO1xuXG5cdC8vIENoZWNrIHBhcmFtZXRlcnMgYW5kIGV4aXN0aW5nIGZ1bmN0aW9ubmFsaXRpZXNcblx0dGhpcy5faXNBcnJheUJ1ZmZlciA9IGNvbXBhdGliaWxpdHkuQXJyYXlCdWZmZXIgJiYgYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXI7XG5cdHRoaXMuX2lzUGl4ZWxEYXRhID0gY29tcGF0aWJpbGl0eS5QaXhlbERhdGEgJiYgYnVmZmVyIGluc3RhbmNlb2YgQ2FudmFzUGl4ZWxBcnJheTtcblx0dGhpcy5faXNEYXRhVmlldyA9IGNvbXBhdGliaWxpdHkuRGF0YVZpZXcgJiYgdGhpcy5faXNBcnJheUJ1ZmZlcjtcblx0dGhpcy5faXNOb2RlQnVmZmVyID0gY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyICYmIGJ1ZmZlciBpbnN0YW5jZW9mIEJ1ZmZlcjtcblxuXHQvLyBIYW5kbGUgVHlwZSBFcnJvcnNcblx0aWYgKCF0aGlzLl9pc05vZGVCdWZmZXIgJiYgIXRoaXMuX2lzQXJyYXlCdWZmZXIgJiYgIXRoaXMuX2lzUGl4ZWxEYXRhICYmICEoYnVmZmVyIGluc3RhbmNlb2YgQXJyYXkpKSB7XG5cdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignakRhdGFWaWV3IGJ1ZmZlciBoYXMgYW4gaW5jb21wYXRpYmxlIHR5cGUnKTtcblx0fVxuXG5cdC8vIERlZmF1bHQgVmFsdWVzXG5cdHRoaXMuX2xpdHRsZUVuZGlhbiA9ICEhbGl0dGxlRW5kaWFuO1xuXG5cdHZhciBidWZmZXJMZW5ndGggPSAnYnl0ZUxlbmd0aCcgaW4gYnVmZmVyID8gYnVmZmVyLmJ5dGVMZW5ndGggOiBidWZmZXIubGVuZ3RoO1xuXHR0aGlzLmJ5dGVPZmZzZXQgPSBieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCAwKTtcblx0dGhpcy5ieXRlTGVuZ3RoID0gYnl0ZUxlbmd0aCA9IGRlZmluZWQoYnl0ZUxlbmd0aCwgYnVmZmVyTGVuZ3RoIC0gYnl0ZU9mZnNldCk7XG5cblx0aWYgKCF0aGlzLl9pc0RhdGFWaWV3KSB7XG5cdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCwgYnVmZmVyTGVuZ3RoKTtcblx0fSBlbHNlIHtcblx0XHR0aGlzLl92aWV3ID0gbmV3IERhdGFWaWV3KGJ1ZmZlciwgYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCk7XG5cdH1cblxuXHQvLyBDcmVhdGUgdW5pZm9ybSBtZXRob2RzIChhY3Rpb24gd3JhcHBlcnMpIGZvciB0aGUgZm9sbG93aW5nIGRhdGEgdHlwZXNcblxuXHR0aGlzLl9lbmdpbmVBY3Rpb24gPVxuXHRcdHRoaXMuX2lzRGF0YVZpZXdcblx0XHRcdD8gdGhpcy5fZGF0YVZpZXdBY3Rpb25cblx0XHQ6IHRoaXMuX2lzTm9kZUJ1ZmZlclxuXHRcdFx0PyB0aGlzLl9ub2RlQnVmZmVyQWN0aW9uXG5cdFx0OiB0aGlzLl9pc0FycmF5QnVmZmVyXG5cdFx0XHQ/IHRoaXMuX2FycmF5QnVmZmVyQWN0aW9uXG5cdFx0OiB0aGlzLl9hcnJheUFjdGlvbjtcbn1cblxuZnVuY3Rpb24gZ2V0Q2hhckNvZGVzKHN0cmluZykge1xuXHRpZiAoY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyKSB7XG5cdFx0cmV0dXJuIG5ldyBCdWZmZXIoc3RyaW5nLCAnYmluYXJ5Jyk7XG5cdH1cblxuXHR2YXIgVHlwZSA9IGNvbXBhdGliaWxpdHkuQXJyYXlCdWZmZXIgPyBVaW50OEFycmF5IDogQXJyYXksXG5cdFx0Y29kZXMgPSBuZXcgVHlwZShzdHJpbmcubGVuZ3RoKTtcblxuXHRmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gc3RyaW5nLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0Y29kZXNbaV0gPSBzdHJpbmcuY2hhckNvZGVBdChpKSAmIDB4ZmY7XG5cdH1cblx0cmV0dXJuIGNvZGVzO1xufVxuXG4vLyBtb3N0bHkgaW50ZXJuYWwgZnVuY3Rpb24gZm9yIHdyYXBwaW5nIGFueSBzdXBwb3J0ZWQgaW5wdXQgKFN0cmluZyBvciBBcnJheS1saWtlKSB0byBiZXN0IHN1aXRhYmxlIGJ1ZmZlciBmb3JtYXRcbmpEYXRhVmlldy53cmFwQnVmZmVyID0gZnVuY3Rpb24gKGJ1ZmZlcikge1xuXHRzd2l0Y2ggKHR5cGVvZiBidWZmZXIpIHtcblx0XHRjYXNlICdudW1iZXInOlxuXHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlcikge1xuXHRcdFx0XHRidWZmZXIgPSBuZXcgQnVmZmVyKGJ1ZmZlcik7XG5cdFx0XHRcdGJ1ZmZlci5maWxsKDApO1xuXHRcdFx0fSBlbHNlXG5cdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlcikge1xuXHRcdFx0XHRidWZmZXIgPSBuZXcgVWludDhBcnJheShidWZmZXIpLmJ1ZmZlcjtcblx0XHRcdH0gZWxzZVxuXHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuUGl4ZWxEYXRhKSB7XG5cdFx0XHRcdGJ1ZmZlciA9IGNyZWF0ZVBpeGVsRGF0YShidWZmZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnVmZmVyID0gbmV3IEFycmF5KGJ1ZmZlcik7XG5cdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgYnVmZmVyLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0YnVmZmVyW2ldID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJ1ZmZlcjtcblxuXHRcdGNhc2UgJ3N0cmluZyc6XG5cdFx0XHRidWZmZXIgPSBnZXRDaGFyQ29kZXMoYnVmZmVyKTtcblx0XHRcdC8qIGZhbGxzIHRocm91Z2ggKi9cblx0XHRkZWZhdWx0OlxuXHRcdFx0aWYgKCdsZW5ndGgnIGluIGJ1ZmZlciAmJiAhKChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIgJiYgYnVmZmVyIGluc3RhbmNlb2YgQnVmZmVyKSB8fCAoY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlciAmJiBidWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikgfHwgKGNvbXBhdGliaWxpdHkuUGl4ZWxEYXRhICYmIGJ1ZmZlciBpbnN0YW5jZW9mIENhbnZhc1BpeGVsQXJyYXkpKSkge1xuXHRcdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyKSB7XG5cdFx0XHRcdFx0YnVmZmVyID0gbmV3IEJ1ZmZlcihidWZmZXIpO1xuXHRcdFx0XHR9IGVsc2Vcblx0XHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuQXJyYXlCdWZmZXIpIHtcblx0XHRcdFx0XHRpZiAoIShidWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikpIHtcblx0XHRcdFx0XHRcdGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcikuYnVmZmVyO1xuXHRcdFx0XHRcdFx0Ly8gYnVnIGluIE5vZGUuanMgPD0gMC44OlxuXHRcdFx0XHRcdFx0aWYgKCEoYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpKSB7XG5cdFx0XHRcdFx0XHRcdGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KGFycmF5RnJvbShidWZmZXIsIHRydWUpKS5idWZmZXI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Vcblx0XHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuUGl4ZWxEYXRhKSB7XG5cdFx0XHRcdFx0YnVmZmVyID0gY3JlYXRlUGl4ZWxEYXRhKGJ1ZmZlci5sZW5ndGgsIGJ1ZmZlcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YnVmZmVyID0gYXJyYXlGcm9tKGJ1ZmZlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBidWZmZXI7XG5cdH1cbn07XG5cbmZ1bmN0aW9uIHBvdzIobikge1xuXHRyZXR1cm4gKG4gPj0gMCAmJiBuIDwgMzEpID8gKDEgPDwgbikgOiAocG93MltuXSB8fCAocG93MltuXSA9IE1hdGgucG93KDIsIG4pKSk7XG59XG5cbi8vIGxlZnQgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHlcbmpEYXRhVmlldy5jcmVhdGVCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG5cdHJldHVybiBqRGF0YVZpZXcud3JhcEJ1ZmZlcihhcmd1bWVudHMpO1xufTtcblxuZnVuY3Rpb24gVWludDY0KGxvLCBoaSkge1xuXHR0aGlzLmxvID0gbG87XG5cdHRoaXMuaGkgPSBoaTtcbn1cblxuakRhdGFWaWV3LlVpbnQ2NCA9IFVpbnQ2NDtcblxuVWludDY0LnByb3RvdHlwZSA9IHtcblx0dmFsdWVPZjogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzLmxvICsgcG93MigzMikgKiB0aGlzLmhpO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIE51bWJlci5wcm90b3R5cGUudG9TdHJpbmcuYXBwbHkodGhpcy52YWx1ZU9mKCksIGFyZ3VtZW50cyk7XG5cdH1cbn07XG5cblVpbnQ2NC5mcm9tTnVtYmVyID0gZnVuY3Rpb24gKG51bWJlcikge1xuXHR2YXIgaGkgPSBNYXRoLmZsb29yKG51bWJlciAvIHBvdzIoMzIpKSxcblx0XHRsbyA9IG51bWJlciAtIGhpICogcG93MigzMik7XG5cblx0cmV0dXJuIG5ldyBVaW50NjQobG8sIGhpKTtcbn07XG5cbmZ1bmN0aW9uIEludDY0KGxvLCBoaSkge1xuXHRVaW50NjQuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbn1cblxuakRhdGFWaWV3LkludDY0ID0gSW50NjQ7XG5cbkludDY0LnByb3RvdHlwZSA9ICdjcmVhdGUnIGluIE9iamVjdCA/IE9iamVjdC5jcmVhdGUoVWludDY0LnByb3RvdHlwZSkgOiBuZXcgVWludDY0KCk7XG5cbkludDY0LnByb3RvdHlwZS52YWx1ZU9mID0gZnVuY3Rpb24gKCkge1xuXHRpZiAodGhpcy5oaSA8IHBvdzIoMzEpKSB7XG5cdFx0cmV0dXJuIFVpbnQ2NC5wcm90b3R5cGUudmFsdWVPZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHR9XG5cdHJldHVybiAtKChwb3cyKDMyKSAtIHRoaXMubG8pICsgcG93MigzMikgKiAocG93MigzMikgLSAxIC0gdGhpcy5oaSkpO1xufTtcblxuSW50NjQuZnJvbU51bWJlciA9IGZ1bmN0aW9uIChudW1iZXIpIHtcblx0dmFyIGxvLCBoaTtcblx0aWYgKG51bWJlciA+PSAwKSB7XG5cdFx0dmFyIHVuc2lnbmVkID0gVWludDY0LmZyb21OdW1iZXIobnVtYmVyKTtcblx0XHRsbyA9IHVuc2lnbmVkLmxvO1xuXHRcdGhpID0gdW5zaWduZWQuaGk7XG5cdH0gZWxzZSB7XG5cdFx0aGkgPSBNYXRoLmZsb29yKG51bWJlciAvIHBvdzIoMzIpKTtcblx0XHRsbyA9IG51bWJlciAtIGhpICogcG93MigzMik7XG5cdFx0aGkgKz0gcG93MigzMik7XG5cdH1cblx0cmV0dXJuIG5ldyBJbnQ2NChsbywgaGkpO1xufTtcblxuakRhdGFWaWV3LnByb3RvdHlwZSA9IHtcblx0X29mZnNldDogMCxcblx0X2JpdE9mZnNldDogMCxcblxuXHRjb21wYXRpYmlsaXR5OiBjb21wYXRpYmlsaXR5LFxuXG5cdF9jaGVja0JvdW5kczogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgsIG1heExlbmd0aCkge1xuXHRcdC8vIERvIGFkZGl0aW9uYWwgY2hlY2tzIHRvIHNpbXVsYXRlIERhdGFWaWV3XG5cdFx0aWYgKHR5cGVvZiBieXRlT2Zmc2V0ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignT2Zmc2V0IGlzIG5vdCBhIG51bWJlci4nKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBieXRlTGVuZ3RoICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignU2l6ZSBpcyBub3QgYSBudW1iZXIuJyk7XG5cdFx0fVxuXHRcdGlmIChieXRlTGVuZ3RoIDwgMCkge1xuXHRcdFx0dGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0xlbmd0aCBpcyBuZWdhdGl2ZS4nKTtcblx0XHR9XG5cdFx0aWYgKGJ5dGVPZmZzZXQgPCAwIHx8IGJ5dGVPZmZzZXQgKyBieXRlTGVuZ3RoID4gZGVmaW5lZChtYXhMZW5ndGgsIHRoaXMuYnl0ZUxlbmd0aCkpIHtcblx0XHRcdHRocm93IG5ldyBSYW5nZUVycm9yKCdPZmZzZXRzIGFyZSBvdXQgb2YgYm91bmRzLicpO1xuXHRcdH1cblx0fSxcblxuXHRfYWN0aW9uOiBmdW5jdGlvbiAodHlwZSwgaXNSZWFkQWN0aW9uLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VuZ2luZUFjdGlvbihcblx0XHRcdHR5cGUsXG5cdFx0XHRpc1JlYWRBY3Rpb24sXG5cdFx0XHRkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCksXG5cdFx0XHRkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKSxcblx0XHRcdHZhbHVlXG5cdFx0KTtcblx0fSxcblxuXHRfZGF0YVZpZXdBY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHQvLyBNb3ZlIHRoZSBpbnRlcm5hbCBvZmZzZXQgZm9yd2FyZFxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyBkYXRhVHlwZXNbdHlwZV07XG5cdFx0cmV0dXJuIGlzUmVhZEFjdGlvbiA/IHRoaXMuX3ZpZXdbJ2dldCcgKyB0eXBlXShieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIDogdGhpcy5fdmlld1snc2V0JyArIHR5cGVdKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9ub2RlQnVmZmVyQWN0aW9uOiBmdW5jdGlvbiAodHlwZSwgaXNSZWFkQWN0aW9uLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKSB7XG5cdFx0Ly8gTW92ZSB0aGUgaW50ZXJuYWwgb2Zmc2V0IGZvcndhcmRcblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgZGF0YVR5cGVzW3R5cGVdO1xuXHRcdHZhciBub2RlTmFtZSA9IG5vZGVOYW1pbmdbdHlwZV0gKyAoKHR5cGUgPT09ICdJbnQ4JyB8fCB0eXBlID09PSAnVWludDgnKSA/ICcnIDogbGl0dGxlRW5kaWFuID8gJ0xFJyA6ICdCRScpO1xuXHRcdGJ5dGVPZmZzZXQgKz0gdGhpcy5ieXRlT2Zmc2V0O1xuXHRcdHJldHVybiBpc1JlYWRBY3Rpb24gPyB0aGlzLmJ1ZmZlclsncmVhZCcgKyBub2RlTmFtZV0oYnl0ZU9mZnNldCkgOiB0aGlzLmJ1ZmZlclsnd3JpdGUnICsgbm9kZU5hbWVdKHZhbHVlLCBieXRlT2Zmc2V0KTtcblx0fSxcblxuXHRfYXJyYXlCdWZmZXJBY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHR2YXIgc2l6ZSA9IGRhdGFUeXBlc1t0eXBlXSwgVHlwZWRBcnJheSA9IGdsb2JhbFt0eXBlICsgJ0FycmF5J10sIHR5cGVkQXJyYXk7XG5cblx0XHRsaXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblxuXHRcdC8vIEFycmF5QnVmZmVyOiB3ZSB1c2UgYSB0eXBlZCBhcnJheSBvZiBzaXplIDEgZnJvbSBvcmlnaW5hbCBidWZmZXIgaWYgYWxpZ25tZW50IGlzIGdvb2QgYW5kIGZyb20gc2xpY2Ugd2hlbiBpdCdzIG5vdFxuXHRcdGlmIChzaXplID09PSAxIHx8ICgodGhpcy5ieXRlT2Zmc2V0ICsgYnl0ZU9mZnNldCkgJSBzaXplID09PSAwICYmIGxpdHRsZUVuZGlhbikpIHtcblx0XHRcdHR5cGVkQXJyYXkgPSBuZXcgVHlwZWRBcnJheSh0aGlzLmJ1ZmZlciwgdGhpcy5ieXRlT2Zmc2V0ICsgYnl0ZU9mZnNldCwgMSk7XG5cdFx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgc2l6ZTtcblx0XHRcdHJldHVybiBpc1JlYWRBY3Rpb24gPyB0eXBlZEFycmF5WzBdIDogKHR5cGVkQXJyYXlbMF0gPSB2YWx1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBieXRlcyA9IG5ldyBVaW50OEFycmF5KGlzUmVhZEFjdGlvbiA/IHRoaXMuZ2V0Qnl0ZXMoc2l6ZSwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKSA6IHNpemUpO1xuXHRcdFx0dHlwZWRBcnJheSA9IG5ldyBUeXBlZEFycmF5KGJ5dGVzLmJ1ZmZlciwgMCwgMSk7XG5cblx0XHRcdGlmIChpc1JlYWRBY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuIHR5cGVkQXJyYXlbMF07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0eXBlZEFycmF5WzBdID0gdmFsdWU7XG5cdFx0XHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIGJ5dGVzLCBsaXR0bGVFbmRpYW4pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblxuXHRfYXJyYXlBY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHRyZXR1cm4gaXNSZWFkQWN0aW9uID8gdGhpc1snX2dldCcgKyB0eXBlXShieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIDogdGhpc1snX3NldCcgKyB0eXBlXShieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHQvLyBIZWxwZXJzXG5cblx0X2dldEJ5dGVzOiBmdW5jdGlvbiAobGVuZ3RoLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRsaXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXHRcdGxlbmd0aCA9IGRlZmluZWQobGVuZ3RoLCB0aGlzLmJ5dGVMZW5ndGggLSBieXRlT2Zmc2V0KTtcblxuXHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIGxlbmd0aCk7XG5cblx0XHRieXRlT2Zmc2V0ICs9IHRoaXMuYnl0ZU9mZnNldDtcblxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgLSB0aGlzLmJ5dGVPZmZzZXQgKyBsZW5ndGg7XG5cblx0XHR2YXIgcmVzdWx0ID0gdGhpcy5faXNBcnJheUJ1ZmZlclxuXHRcdFx0XHRcdCA/IG5ldyBVaW50OEFycmF5KHRoaXMuYnVmZmVyLCBieXRlT2Zmc2V0LCBsZW5ndGgpXG5cdFx0XHRcdFx0IDogKHRoaXMuYnVmZmVyLnNsaWNlIHx8IEFycmF5LnByb3RvdHlwZS5zbGljZSkuY2FsbCh0aGlzLmJ1ZmZlciwgYnl0ZU9mZnNldCwgYnl0ZU9mZnNldCArIGxlbmd0aCk7XG5cblx0XHRyZXR1cm4gbGl0dGxlRW5kaWFuIHx8IGxlbmd0aCA8PSAxID8gcmVzdWx0IDogYXJyYXlGcm9tKHJlc3VsdCkucmV2ZXJzZSgpO1xuXHR9LFxuXG5cdC8vIHdyYXBwZXIgZm9yIGV4dGVybmFsIGNhbGxzIChkbyBub3QgcmV0dXJuIGlubmVyIGJ1ZmZlciBkaXJlY3RseSB0byBwcmV2ZW50IGl0J3MgbW9kaWZ5aW5nKVxuXHRnZXRCeXRlczogZnVuY3Rpb24gKGxlbmd0aCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB0b0FycmF5KSB7XG5cdFx0dmFyIHJlc3VsdCA9IHRoaXMuX2dldEJ5dGVzKGxlbmd0aCwgYnl0ZU9mZnNldCwgZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRydWUpKTtcblx0XHRyZXR1cm4gdG9BcnJheSA/IGFycmF5RnJvbShyZXN1bHQpIDogcmVzdWx0O1xuXHR9LFxuXG5cdF9zZXRCeXRlczogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGJ5dGVzLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgbGVuZ3RoID0gYnl0ZXMubGVuZ3RoO1xuXG5cdFx0Ly8gbmVlZGVkIGZvciBPcGVyYVxuXHRcdGlmIChsZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsaXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXG5cdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgbGVuZ3RoKTtcblxuXHRcdGlmICghbGl0dGxlRW5kaWFuICYmIGxlbmd0aCA+IDEpIHtcblx0XHRcdGJ5dGVzID0gYXJyYXlGcm9tKGJ5dGVzLCB0cnVlKS5yZXZlcnNlKCk7XG5cdFx0fVxuXG5cdFx0Ynl0ZU9mZnNldCArPSB0aGlzLmJ5dGVPZmZzZXQ7XG5cblx0XHRpZiAodGhpcy5faXNBcnJheUJ1ZmZlcikge1xuXHRcdFx0bmV3IFVpbnQ4QXJyYXkodGhpcy5idWZmZXIsIGJ5dGVPZmZzZXQsIGxlbmd0aCkuc2V0KGJ5dGVzKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5faXNOb2RlQnVmZmVyKSB7XG5cdFx0XHRcdG5ldyBCdWZmZXIoYnl0ZXMpLmNvcHkodGhpcy5idWZmZXIsIGJ5dGVPZmZzZXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHRoaXMuYnVmZmVyW2J5dGVPZmZzZXQgKyBpXSA9IGJ5dGVzW2ldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCAtIHRoaXMuYnl0ZU9mZnNldCArIGxlbmd0aDtcblx0fSxcblxuXHRzZXRCeXRlczogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGJ5dGVzLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBieXRlcywgZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRydWUpKTtcblx0fSxcblxuXHRnZXRTdHJpbmc6IGZ1bmN0aW9uIChieXRlTGVuZ3RoLCBieXRlT2Zmc2V0LCBlbmNvZGluZykge1xuXHRcdGlmICh0aGlzLl9pc05vZGVCdWZmZXIpIHtcblx0XHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cdFx0XHRieXRlTGVuZ3RoID0gZGVmaW5lZChieXRlTGVuZ3RoLCB0aGlzLmJ5dGVMZW5ndGggLSBieXRlT2Zmc2V0KTtcblxuXHRcdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCk7XG5cblx0XHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyBieXRlTGVuZ3RoO1xuXHRcdFx0cmV0dXJuIHRoaXMuYnVmZmVyLnRvU3RyaW5nKGVuY29kaW5nIHx8ICdiaW5hcnknLCB0aGlzLmJ5dGVPZmZzZXQgKyBieXRlT2Zmc2V0LCB0aGlzLmJ5dGVPZmZzZXQgKyB0aGlzLl9vZmZzZXQpO1xuXHRcdH1cblx0XHR2YXIgYnl0ZXMgPSB0aGlzLl9nZXRCeXRlcyhieXRlTGVuZ3RoLCBieXRlT2Zmc2V0LCB0cnVlKSwgc3RyaW5nID0gJyc7XG5cdFx0Ynl0ZUxlbmd0aCA9IGJ5dGVzLmxlbmd0aDtcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVMZW5ndGg7IGkrKykge1xuXHRcdFx0c3RyaW5nICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnl0ZXNbaV0pO1xuXHRcdH1cblx0XHRpZiAoZW5jb2RpbmcgPT09ICd1dGY4Jykge1xuXHRcdFx0c3RyaW5nID0gZGVjb2RlVVJJQ29tcG9uZW50KGVzY2FwZShzdHJpbmcpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0cmluZztcblx0fSxcblxuXHRzZXRTdHJpbmc6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBzdWJTdHJpbmcsIGVuY29kaW5nKSB7XG5cdFx0aWYgKHRoaXMuX2lzTm9kZUJ1ZmZlcikge1xuXHRcdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblx0XHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIHN1YlN0cmluZy5sZW5ndGgpO1xuXHRcdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIHRoaXMuYnVmZmVyLndyaXRlKHN1YlN0cmluZywgdGhpcy5ieXRlT2Zmc2V0ICsgYnl0ZU9mZnNldCwgZW5jb2RpbmcgfHwgJ2JpbmFyeScpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZW5jb2RpbmcgPT09ICd1dGY4Jykge1xuXHRcdFx0c3ViU3RyaW5nID0gdW5lc2NhcGUoZW5jb2RlVVJJQ29tcG9uZW50KHN1YlN0cmluZykpO1xuXHRcdH1cblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBnZXRDaGFyQ29kZXMoc3ViU3RyaW5nKSwgdHJ1ZSk7XG5cdH0sXG5cblx0Z2V0Q2hhcjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTdHJpbmcoMSwgYnl0ZU9mZnNldCk7XG5cdH0sXG5cblx0c2V0Q2hhcjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGNoYXJhY3Rlcikge1xuXHRcdHRoaXMuc2V0U3RyaW5nKGJ5dGVPZmZzZXQsIGNoYXJhY3Rlcik7XG5cdH0sXG5cblx0dGVsbDogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0aGlzLl9vZmZzZXQ7XG5cdH0sXG5cblx0c2VlazogZnVuY3Rpb24gKGJ5dGVPZmZzZXQpIHtcblx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCAwKTtcblx0XHQvKiBqc2hpbnQgYm9zczogdHJ1ZSAqL1xuXHRcdHJldHVybiB0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0O1xuXHR9LFxuXG5cdHNraXA6IGZ1bmN0aW9uIChieXRlTGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vlayh0aGlzLl9vZmZzZXQgKyBieXRlTGVuZ3RoKTtcblx0fSxcblxuXHRzbGljZTogZnVuY3Rpb24gKHN0YXJ0LCBlbmQsIGZvcmNlQ29weSkge1xuXHRcdGZ1bmN0aW9uIG5vcm1hbGl6ZU9mZnNldChvZmZzZXQsIGJ5dGVMZW5ndGgpIHtcblx0XHRcdHJldHVybiBvZmZzZXQgPCAwID8gb2Zmc2V0ICsgYnl0ZUxlbmd0aCA6IG9mZnNldDtcblx0XHR9XG5cblx0XHRzdGFydCA9IG5vcm1hbGl6ZU9mZnNldChzdGFydCwgdGhpcy5ieXRlTGVuZ3RoKTtcblx0XHRlbmQgPSBub3JtYWxpemVPZmZzZXQoZGVmaW5lZChlbmQsIHRoaXMuYnl0ZUxlbmd0aCksIHRoaXMuYnl0ZUxlbmd0aCk7XG5cblx0XHRyZXR1cm4gZm9yY2VDb3B5XG5cdFx0XHQgICA/IG5ldyBqRGF0YVZpZXcodGhpcy5nZXRCeXRlcyhlbmQgLSBzdGFydCwgc3RhcnQsIHRydWUsIHRydWUpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5fbGl0dGxlRW5kaWFuKVxuXHRcdFx0ICAgOiBuZXcgakRhdGFWaWV3KHRoaXMuYnVmZmVyLCB0aGlzLmJ5dGVPZmZzZXQgKyBzdGFydCwgZW5kIC0gc3RhcnQsIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0YWxpZ25CeTogZnVuY3Rpb24gKGJ5dGVDb3VudCkge1xuXHRcdHRoaXMuX2JpdE9mZnNldCA9IDA7XG5cdFx0aWYgKGRlZmluZWQoYnl0ZUNvdW50LCAxKSAhPT0gMSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2tpcChieXRlQ291bnQgLSAodGhpcy5fb2Zmc2V0ICUgYnl0ZUNvdW50IHx8IGJ5dGVDb3VudCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb2Zmc2V0O1xuXHRcdH1cblx0fSxcblxuXHQvLyBDb21wYXRpYmlsaXR5IGZ1bmN0aW9uc1xuXG5cdF9nZXRGbG9hdDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGIgPSB0aGlzLl9nZXRCeXRlcyg4LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pLFxuXG5cdFx0XHRzaWduID0gMSAtICgyICogKGJbN10gPj4gNykpLFxuXHRcdFx0ZXhwb25lbnQgPSAoKCgoYls3XSA8PCAxKSAmIDB4ZmYpIDw8IDMpIHwgKGJbNl0gPj4gNCkpIC0gKCgxIDw8IDEwKSAtIDEpLFxuXG5cdFx0Ly8gQmluYXJ5IG9wZXJhdG9ycyBzdWNoIGFzIHwgYW5kIDw8IG9wZXJhdGUgb24gMzIgYml0IHZhbHVlcywgdXNpbmcgKyBhbmQgTWF0aC5wb3coMikgaW5zdGVhZFxuXHRcdFx0bWFudGlzc2EgPSAoKGJbNl0gJiAweDBmKSAqIHBvdzIoNDgpKSArIChiWzVdICogcG93Mig0MCkpICsgKGJbNF0gKiBwb3cyKDMyKSkgK1xuXHRcdFx0XHRcdFx0KGJbM10gKiBwb3cyKDI0KSkgKyAoYlsyXSAqIHBvdzIoMTYpKSArIChiWzFdICogcG93Mig4KSkgKyBiWzBdO1xuXG5cdFx0aWYgKGV4cG9uZW50ID09PSAxMDI0KSB7XG5cdFx0XHRpZiAobWFudGlzc2EgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIE5hTjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBzaWduICogSW5maW5pdHk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGV4cG9uZW50ID09PSAtMTAyMykgeyAvLyBEZW5vcm1hbGl6ZWRcblx0XHRcdHJldHVybiBzaWduICogbWFudGlzc2EgKiBwb3cyKC0xMDIyIC0gNTIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzaWduICogKDEgKyBtYW50aXNzYSAqIHBvdzIoLTUyKSkgKiBwb3cyKGV4cG9uZW50KTtcblx0fSxcblxuXHRfZ2V0RmxvYXQzMjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBiID0gdGhpcy5fZ2V0Qnl0ZXMoNCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSxcblxuXHRcdFx0c2lnbiA9IDEgLSAoMiAqIChiWzNdID4+IDcpKSxcblx0XHRcdGV4cG9uZW50ID0gKCgoYlszXSA8PCAxKSAmIDB4ZmYpIHwgKGJbMl0gPj4gNykpIC0gMTI3LFxuXHRcdFx0bWFudGlzc2EgPSAoKGJbMl0gJiAweDdmKSA8PCAxNikgfCAoYlsxXSA8PCA4KSB8IGJbMF07XG5cblx0XHRpZiAoZXhwb25lbnQgPT09IDEyOCkge1xuXHRcdFx0aWYgKG1hbnRpc3NhICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiBOYU47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gc2lnbiAqIEluZmluaXR5O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleHBvbmVudCA9PT0gLTEyNykgeyAvLyBEZW5vcm1hbGl6ZWRcblx0XHRcdHJldHVybiBzaWduICogbWFudGlzc2EgKiBwb3cyKC0xMjYgLSAyMyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNpZ24gKiAoMSArIG1hbnRpc3NhICogcG93MigtMjMpKSAqIHBvdzIoZXhwb25lbnQpO1xuXHR9LFxuXG5cdF9nZXQ2NDogZnVuY3Rpb24gKFR5cGUsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cblx0XHR2YXIgcGFydHMgPSBsaXR0bGVFbmRpYW4gPyBbMCwgNF0gOiBbNCwgMF07XG5cblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IDI7IGkrKykge1xuXHRcdFx0cGFydHNbaV0gPSB0aGlzLmdldFVpbnQzMihieXRlT2Zmc2V0ICsgcGFydHNbaV0sIGxpdHRsZUVuZGlhbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIDg7XG5cblx0XHRyZXR1cm4gbmV3IFR5cGUocGFydHNbMF0sIHBhcnRzWzFdKTtcblx0fSxcblxuXHRnZXRJbnQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHJldHVybiB0aGlzLl9nZXQ2NChJbnQ2NCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRnZXRVaW50NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0NjQoVWludDY0LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9nZXRJbnQzMjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBiID0gdGhpcy5fZ2V0Qnl0ZXMoNCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKTtcblx0XHRyZXR1cm4gKGJbM10gPDwgMjQpIHwgKGJbMl0gPDwgMTYpIHwgKGJbMV0gPDwgOCkgfCBiWzBdO1xuXHR9LFxuXG5cdF9nZXRVaW50MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0SW50MzIoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSA+Pj4gMDtcblx0fSxcblxuXHRfZ2V0SW50MTY6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRyZXR1cm4gKHRoaXMuX2dldFVpbnQxNihieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIDw8IDE2KSA+PiAxNjtcblx0fSxcblxuXHRfZ2V0VWludDE2OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGIgPSB0aGlzLl9nZXRCeXRlcygyLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHRcdHJldHVybiAoYlsxXSA8PCA4KSB8IGJbMF07XG5cdH0sXG5cblx0X2dldEludDg6IGZ1bmN0aW9uIChieXRlT2Zmc2V0KSB7XG5cdFx0cmV0dXJuICh0aGlzLl9nZXRVaW50OChieXRlT2Zmc2V0KSA8PCAyNCkgPj4gMjQ7XG5cdH0sXG5cblx0X2dldFVpbnQ4OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCkge1xuXHRcdHJldHVybiB0aGlzLl9nZXRCeXRlcygxLCBieXRlT2Zmc2V0KVswXTtcblx0fSxcblxuXHRfZ2V0Qml0UmFuZ2VEYXRhOiBmdW5jdGlvbiAoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KSB7XG5cdFx0dmFyIHN0YXJ0Qml0ID0gKGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KSA8PCAzKSArIHRoaXMuX2JpdE9mZnNldCxcblx0XHRcdGVuZEJpdCA9IHN0YXJ0Qml0ICsgYml0TGVuZ3RoLFxuXHRcdFx0c3RhcnQgPSBzdGFydEJpdCA+Pj4gMyxcblx0XHRcdGVuZCA9IChlbmRCaXQgKyA3KSA+Pj4gMyxcblx0XHRcdGIgPSB0aGlzLl9nZXRCeXRlcyhlbmQgLSBzdGFydCwgc3RhcnQsIHRydWUpLFxuXHRcdFx0d2lkZVZhbHVlID0gMDtcblxuXHRcdC8qIGpzaGludCBib3NzOiB0cnVlICovXG5cdFx0aWYgKHRoaXMuX2JpdE9mZnNldCA9IGVuZEJpdCAmIDcpIHtcblx0XHRcdHRoaXMuX2JpdE9mZnNldCAtPSA4O1xuXHRcdH1cblxuXHRcdGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBiLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHR3aWRlVmFsdWUgPSAod2lkZVZhbHVlIDw8IDgpIHwgYltpXTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnQ6IHN0YXJ0LFxuXHRcdFx0Ynl0ZXM6IGIsXG5cdFx0XHR3aWRlVmFsdWU6IHdpZGVWYWx1ZVxuXHRcdH07XG5cdH0sXG5cblx0Z2V0U2lnbmVkOiBmdW5jdGlvbiAoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KSB7XG5cdFx0dmFyIHNoaWZ0ID0gMzIgLSBiaXRMZW5ndGg7XG5cdFx0cmV0dXJuICh0aGlzLmdldFVuc2lnbmVkKGJpdExlbmd0aCwgYnl0ZU9mZnNldCkgPDwgc2hpZnQpID4+IHNoaWZ0O1xuXHR9LFxuXG5cdGdldFVuc2lnbmVkOiBmdW5jdGlvbiAoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KSB7XG5cdFx0dmFyIHZhbHVlID0gdGhpcy5fZ2V0Qml0UmFuZ2VEYXRhKGJpdExlbmd0aCwgYnl0ZU9mZnNldCkud2lkZVZhbHVlID4+PiAtdGhpcy5fYml0T2Zmc2V0O1xuXHRcdHJldHVybiBiaXRMZW5ndGggPCAzMiA/ICh2YWx1ZSAmIH4oLTEgPDwgYml0TGVuZ3RoKSkgOiB2YWx1ZTtcblx0fSxcblxuXHRfc2V0QmluYXJ5RmxvYXQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbWFudFNpemUsIGV4cFNpemUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBzaWduQml0ID0gdmFsdWUgPCAwID8gMSA6IDAsXG5cdFx0XHRleHBvbmVudCxcblx0XHRcdG1hbnRpc3NhLFxuXHRcdFx0ZU1heCA9IH4oLTEgPDwgKGV4cFNpemUgLSAxKSksXG5cdFx0XHRlTWluID0gMSAtIGVNYXg7XG5cblx0XHRpZiAodmFsdWUgPCAwKSB7XG5cdFx0XHR2YWx1ZSA9IC12YWx1ZTtcblx0XHR9XG5cblx0XHRpZiAodmFsdWUgPT09IDApIHtcblx0XHRcdGV4cG9uZW50ID0gMDtcblx0XHRcdG1hbnRpc3NhID0gMDtcblx0XHR9IGVsc2UgaWYgKGlzTmFOKHZhbHVlKSkge1xuXHRcdFx0ZXhwb25lbnQgPSAyICogZU1heCArIDE7XG5cdFx0XHRtYW50aXNzYSA9IDE7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gSW5maW5pdHkpIHtcblx0XHRcdGV4cG9uZW50ID0gMiAqIGVNYXggKyAxO1xuXHRcdFx0bWFudGlzc2EgPSAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRleHBvbmVudCA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuXHRcdFx0aWYgKGV4cG9uZW50ID49IGVNaW4gJiYgZXhwb25lbnQgPD0gZU1heCkge1xuXHRcdFx0XHRtYW50aXNzYSA9IE1hdGguZmxvb3IoKHZhbHVlICogcG93MigtZXhwb25lbnQpIC0gMSkgKiBwb3cyKG1hbnRTaXplKSk7XG5cdFx0XHRcdGV4cG9uZW50ICs9IGVNYXg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtYW50aXNzYSA9IE1hdGguZmxvb3IodmFsdWUgLyBwb3cyKGVNaW4gLSBtYW50U2l6ZSkpO1xuXHRcdFx0XHRleHBvbmVudCA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dmFyIGIgPSBbXTtcblx0XHR3aGlsZSAobWFudFNpemUgPj0gOCkge1xuXHRcdFx0Yi5wdXNoKG1hbnRpc3NhICUgMjU2KTtcblx0XHRcdG1hbnRpc3NhID0gTWF0aC5mbG9vcihtYW50aXNzYSAvIDI1Nik7XG5cdFx0XHRtYW50U2l6ZSAtPSA4O1xuXHRcdH1cblx0XHRleHBvbmVudCA9IChleHBvbmVudCA8PCBtYW50U2l6ZSkgfCBtYW50aXNzYTtcblx0XHRleHBTaXplICs9IG1hbnRTaXplO1xuXHRcdHdoaWxlIChleHBTaXplID49IDgpIHtcblx0XHRcdGIucHVzaChleHBvbmVudCAmIDB4ZmYpO1xuXHRcdFx0ZXhwb25lbnQgPj4+PSA4O1xuXHRcdFx0ZXhwU2l6ZSAtPSA4O1xuXHRcdH1cblx0XHRiLnB1c2goKHNpZ25CaXQgPDwgZXhwU2l6ZSkgfCBleHBvbmVudCk7XG5cblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBiLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRGbG9hdDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJpbmFyeUZsb2F0KGJ5dGVPZmZzZXQsIHZhbHVlLCAyMywgOCwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0RmxvYXQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXRCaW5hcnlGbG9hdChieXRlT2Zmc2V0LCB2YWx1ZSwgNTIsIDExLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXQ2NDogZnVuY3Rpb24gKFR5cGUsIGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHRpZiAoISh2YWx1ZSBpbnN0YW5jZW9mIFR5cGUpKSB7XG5cdFx0XHR2YWx1ZSA9IFR5cGUuZnJvbU51bWJlcih2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0bGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblxuXHRcdHZhciBwYXJ0cyA9IGxpdHRsZUVuZGlhbiA/IHtsbzogMCwgaGk6IDR9IDoge2xvOiA0LCBoaTogMH07XG5cblx0XHRmb3IgKHZhciBwYXJ0TmFtZSBpbiBwYXJ0cykge1xuXHRcdFx0dGhpcy5zZXRVaW50MzIoYnl0ZU9mZnNldCArIHBhcnRzW3BhcnROYW1lXSwgdmFsdWVbcGFydE5hbWVdLCBsaXR0bGVFbmRpYW4pO1xuXHRcdH1cblxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyA4O1xuXHR9LFxuXG5cdHNldEludDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldDY0KEludDY0LCBieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRzZXRVaW50NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0NjQoVWludDY0LCBieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0VWludDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIFtcblx0XHRcdHZhbHVlICYgMHhmZixcblx0XHRcdCh2YWx1ZSA+Pj4gOCkgJiAweGZmLFxuXHRcdFx0KHZhbHVlID4+PiAxNikgJiAweGZmLFxuXHRcdFx0dmFsdWUgPj4+IDI0XG5cdFx0XSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0VWludDE2OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIFtcblx0XHRcdHZhbHVlICYgMHhmZixcblx0XHRcdCh2YWx1ZSA+Pj4gOCkgJiAweGZmXG5cdFx0XSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0VWludDg6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSkge1xuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIFt2YWx1ZSAmIDB4ZmZdKTtcblx0fSxcblxuXHRzZXRVbnNpZ25lZDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBiaXRMZW5ndGgpIHtcblx0XHR2YXIgZGF0YSA9IHRoaXMuX2dldEJpdFJhbmdlRGF0YShiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpLFxuXHRcdFx0d2lkZVZhbHVlID0gZGF0YS53aWRlVmFsdWUsXG5cdFx0XHRiID0gZGF0YS5ieXRlcztcblxuXHRcdHdpZGVWYWx1ZSAmPSB+KH4oLTEgPDwgYml0TGVuZ3RoKSA8PCAtdGhpcy5fYml0T2Zmc2V0KTsgLy8gY2xlYXJpbmcgYml0IHJhbmdlIGJlZm9yZSBiaW5hcnkgXCJvclwiXG5cdFx0d2lkZVZhbHVlIHw9IChiaXRMZW5ndGggPCAzMiA/ICh2YWx1ZSAmIH4oLTEgPDwgYml0TGVuZ3RoKSkgOiB2YWx1ZSkgPDwgLXRoaXMuX2JpdE9mZnNldDsgLy8gc2V0dGluZyBiaXRzXG5cblx0XHRmb3IgKHZhciBpID0gYi5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0YltpXSA9IHdpZGVWYWx1ZSAmIDB4ZmY7XG5cdFx0XHR3aWRlVmFsdWUgPj4+PSA4O1xuXHRcdH1cblxuXHRcdHRoaXMuX3NldEJ5dGVzKGRhdGEuc3RhcnQsIGIsIHRydWUpO1xuXHR9XG59O1xuXG52YXIgcHJvdG8gPSBqRGF0YVZpZXcucHJvdG90eXBlO1xuXG5mb3IgKHZhciB0eXBlIGluIGRhdGFUeXBlcykge1xuXHQoZnVuY3Rpb24gKHR5cGUpIHtcblx0XHRwcm90b1snZ2V0JyArIHR5cGVdID0gZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdGlvbih0eXBlLCB0cnVlLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHRcdH07XG5cdFx0cHJvdG9bJ3NldCcgKyB0eXBlXSA9IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0XHR0aGlzLl9hY3Rpb24odHlwZSwgZmFsc2UsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpO1xuXHRcdH07XG5cdH0pKHR5cGUpO1xufVxuXG5wcm90by5fc2V0SW50MzIgPSBwcm90by5fc2V0VWludDMyO1xucHJvdG8uX3NldEludDE2ID0gcHJvdG8uX3NldFVpbnQxNjtcbnByb3RvLl9zZXRJbnQ4ID0gcHJvdG8uX3NldFVpbnQ4O1xucHJvdG8uc2V0U2lnbmVkID0gcHJvdG8uc2V0VW5zaWduZWQ7XG5cbmZvciAodmFyIG1ldGhvZCBpbiBwcm90bykge1xuXHRpZiAobWV0aG9kLnNsaWNlKDAsIDMpID09PSAnc2V0Jykge1xuXHRcdChmdW5jdGlvbiAodHlwZSkge1xuXHRcdFx0cHJvdG9bJ3dyaXRlJyArIHR5cGVdID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRBcnJheS5wcm90b3R5cGUudW5zaGlmdC5jYWxsKGFyZ3VtZW50cywgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpc1snc2V0JyArIHR5cGVdLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0XHR9O1xuXHRcdH0pKG1ldGhvZC5zbGljZSgzKSk7XG5cdH1cbn1cblxuaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBtb2R1bGUuZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcblx0bW9kdWxlLmV4cG9ydHMgPSBqRGF0YVZpZXc7XG59IGVsc2VcbmlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcblx0ZGVmaW5lKFtdLCBmdW5jdGlvbiAoKSB7IHJldHVybiBqRGF0YVZpZXcgfSk7XG59IGVsc2Uge1xuXHR2YXIgb2xkR2xvYmFsID0gZ2xvYmFsLmpEYXRhVmlldztcblx0KGdsb2JhbC5qRGF0YVZpZXcgPSBqRGF0YVZpZXcpLm5vQ29uZmxpY3QgPSBmdW5jdGlvbiAoKSB7XG5cdFx0Z2xvYmFsLmpEYXRhVmlldyA9IG9sZEdsb2JhbDtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcbn1cblxufSkoKGZ1bmN0aW9uICgpIHsgLyoganNoaW50IHN0cmljdDogZmFsc2UgKi8gcmV0dXJuIHRoaXMgfSkoKSk7XG59KS5jYWxsKHRoaXMscmVxdWlyZShcImJ1ZmZlclwiKS5CdWZmZXIpIixudWxsLCIvKiFcbiAqIFRoZSBidWZmZXIgbW9kdWxlIGZyb20gbm9kZS5qcywgZm9yIHRoZSBicm93c2VyLlxuICpcbiAqIEBhdXRob3IgICBGZXJvc3MgQWJvdWtoYWRpamVoIDxmZXJvc3NAZmVyb3NzLm9yZz4gPGh0dHA6Ly9mZXJvc3Mub3JnPlxuICogQGxpY2Vuc2UgIE1JVFxuICovXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcbnZhciBpc0FycmF5ID0gcmVxdWlyZSgnaXMtYXJyYXknKVxuXG5leHBvcnRzLkJ1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5TbG93QnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTID0gNTBcbkJ1ZmZlci5wb29sU2l6ZSA9IDgxOTIgLy8gbm90IHVzZWQgYnkgdGhpcyBpbXBsZW1lbnRhdGlvblxuXG52YXIga01heExlbmd0aCA9IDB4M2ZmZmZmZmZcblxuLyoqXG4gKiBJZiBgQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlRgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAobW9zdCBjb21wYXRpYmxlLCBldmVuIElFNilcbiAqXG4gKiBCcm93c2VycyB0aGF0IHN1cHBvcnQgdHlwZWQgYXJyYXlzIGFyZSBJRSAxMCssIEZpcmVmb3ggNCssIENocm9tZSA3KywgU2FmYXJpIDUuMSssXG4gKiBPcGVyYSAxMS42KywgaU9TIDQuMisuXG4gKlxuICogTm90ZTpcbiAqXG4gKiAtIEltcGxlbWVudGF0aW9uIG11c3Qgc3VwcG9ydCBhZGRpbmcgbmV3IHByb3BlcnRpZXMgdG8gYFVpbnQ4QXJyYXlgIGluc3RhbmNlcy5cbiAqICAgRmlyZWZveCA0LTI5IGxhY2tlZCBzdXBwb3J0LCBmaXhlZCBpbiBGaXJlZm94IDMwKy5cbiAqICAgU2VlOiBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTU0MzguXG4gKlxuICogIC0gQ2hyb21lIDktMTAgaXMgbWlzc2luZyB0aGUgYFR5cGVkQXJyYXkucHJvdG90eXBlLnN1YmFycmF5YCBmdW5jdGlvbi5cbiAqXG4gKiAgLSBJRTEwIGhhcyBhIGJyb2tlbiBgVHlwZWRBcnJheS5wcm90b3R5cGUuc3ViYXJyYXlgIGZ1bmN0aW9uIHdoaWNoIHJldHVybnMgYXJyYXlzIG9mXG4gKiAgICBpbmNvcnJlY3QgbGVuZ3RoIGluIHNvbWUgc2l0dWF0aW9ucy5cbiAqXG4gKiBXZSBkZXRlY3QgdGhlc2UgYnVnZ3kgYnJvd3NlcnMgYW5kIHNldCBgQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlRgIHRvIGBmYWxzZWAgc28gdGhleSB3aWxsXG4gKiBnZXQgdGhlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiwgd2hpY2ggaXMgc2xvd2VyIGJ1dCB3aWxsIHdvcmsgY29ycmVjdGx5LlxuICovXG5CdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCA9IChmdW5jdGlvbiAoKSB7XG4gIHRyeSB7XG4gICAgdmFyIGJ1ZiA9IG5ldyBBcnJheUJ1ZmZlcigwKVxuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheShidWYpXG4gICAgYXJyLmZvbyA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIDQyIH1cbiAgICByZXR1cm4gNDIgPT09IGFyci5mb28oKSAmJiAvLyB0eXBlZCBhcnJheSBpbnN0YW5jZXMgY2FuIGJlIGF1Z21lbnRlZFxuICAgICAgICB0eXBlb2YgYXJyLnN1YmFycmF5ID09PSAnZnVuY3Rpb24nICYmIC8vIGNocm9tZSA5LTEwIGxhY2sgYHN1YmFycmF5YFxuICAgICAgICBuZXcgVWludDhBcnJheSgxKS5zdWJhcnJheSgxLCAxKS5ieXRlTGVuZ3RoID09PSAwIC8vIGllMTAgaGFzIGJyb2tlbiBgc3ViYXJyYXlgXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSkoKVxuXG4vKipcbiAqIENsYXNzOiBCdWZmZXJcbiAqID09PT09PT09PT09PT1cbiAqXG4gKiBUaGUgQnVmZmVyIGNvbnN0cnVjdG9yIHJldHVybnMgaW5zdGFuY2VzIG9mIGBVaW50OEFycmF5YCB0aGF0IGFyZSBhdWdtZW50ZWRcbiAqIHdpdGggZnVuY3Rpb24gcHJvcGVydGllcyBmb3IgYWxsIHRoZSBub2RlIGBCdWZmZXJgIEFQSSBmdW5jdGlvbnMuIFdlIHVzZVxuICogYFVpbnQ4QXJyYXlgIHNvIHRoYXQgc3F1YXJlIGJyYWNrZXQgbm90YXRpb24gd29ya3MgYXMgZXhwZWN0ZWQgLS0gaXQgcmV0dXJuc1xuICogYSBzaW5nbGUgb2N0ZXQuXG4gKlxuICogQnkgYXVnbWVudGluZyB0aGUgaW5zdGFuY2VzLCB3ZSBjYW4gYXZvaWQgbW9kaWZ5aW5nIHRoZSBgVWludDhBcnJheWBcbiAqIHByb3RvdHlwZS5cbiAqL1xuZnVuY3Rpb24gQnVmZmVyIChzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBCdWZmZXIpKVxuICAgIHJldHVybiBuZXcgQnVmZmVyKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pXG5cbiAgdmFyIHR5cGUgPSB0eXBlb2Ygc3ViamVjdFxuXG4gIC8vIEZpbmQgdGhlIGxlbmd0aFxuICB2YXIgbGVuZ3RoXG4gIGlmICh0eXBlID09PSAnbnVtYmVyJylcbiAgICBsZW5ndGggPSBzdWJqZWN0ID4gMCA/IHN1YmplY3QgPj4+IDAgOiAwXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgaWYgKGVuY29kaW5nID09PSAnYmFzZTY0JylcbiAgICAgIHN1YmplY3QgPSBiYXNlNjRjbGVhbihzdWJqZWN0KVxuICAgIGxlbmd0aCA9IEJ1ZmZlci5ieXRlTGVuZ3RoKHN1YmplY3QsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnICYmIHN1YmplY3QgIT09IG51bGwpIHsgLy8gYXNzdW1lIG9iamVjdCBpcyBhcnJheS1saWtlXG4gICAgaWYgKHN1YmplY3QudHlwZSA9PT0gJ0J1ZmZlcicgJiYgaXNBcnJheShzdWJqZWN0LmRhdGEpKVxuICAgICAgc3ViamVjdCA9IHN1YmplY3QuZGF0YVxuICAgIGxlbmd0aCA9ICtzdWJqZWN0Lmxlbmd0aCA+IDAgPyBNYXRoLmZsb29yKCtzdWJqZWN0Lmxlbmd0aCkgOiAwXG4gIH0gZWxzZVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ211c3Qgc3RhcnQgd2l0aCBudW1iZXIsIGJ1ZmZlciwgYXJyYXkgb3Igc3RyaW5nJylcblxuICBpZiAodGhpcy5sZW5ndGggPiBrTWF4TGVuZ3RoKVxuICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdBdHRlbXB0IHRvIGFsbG9jYXRlIEJ1ZmZlciBsYXJnZXIgdGhhbiBtYXhpbXVtICcgK1xuICAgICAgJ3NpemU6IDB4JyArIGtNYXhMZW5ndGgudG9TdHJpbmcoMTYpICsgJyBieXRlcycpXG5cbiAgdmFyIGJ1ZlxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICAvLyBQcmVmZXJyZWQ6IFJldHVybiBhbiBhdWdtZW50ZWQgYFVpbnQ4QXJyYXlgIGluc3RhbmNlIGZvciBiZXN0IHBlcmZvcm1hbmNlXG4gICAgYnVmID0gQnVmZmVyLl9hdWdtZW50KG5ldyBVaW50OEFycmF5KGxlbmd0aCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gRmFsbGJhY2s6IFJldHVybiBUSElTIGluc3RhbmNlIG9mIEJ1ZmZlciAoY3JlYXRlZCBieSBgbmV3YClcbiAgICBidWYgPSB0aGlzXG4gICAgYnVmLmxlbmd0aCA9IGxlbmd0aFxuICAgIGJ1Zi5faXNCdWZmZXIgPSB0cnVlXG4gIH1cblxuICB2YXIgaVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQgJiYgdHlwZW9mIHN1YmplY3QuYnl0ZUxlbmd0aCA9PT0gJ251bWJlcicpIHtcbiAgICAvLyBTcGVlZCBvcHRpbWl6YXRpb24gLS0gdXNlIHNldCBpZiB3ZSdyZSBjb3B5aW5nIGZyb20gYSB0eXBlZCBhcnJheVxuICAgIGJ1Zi5fc2V0KHN1YmplY3QpXG4gIH0gZWxzZSBpZiAoaXNBcnJheWlzaChzdWJqZWN0KSkge1xuICAgIC8vIFRyZWF0IGFycmF5LWlzaCBvYmplY3RzIGFzIGEgYnl0ZSBhcnJheVxuICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkpIHtcbiAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKylcbiAgICAgICAgYnVmW2ldID0gc3ViamVjdC5yZWFkVUludDgoaSlcbiAgICB9IGVsc2Uge1xuICAgICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKVxuICAgICAgICBidWZbaV0gPSAoKHN1YmplY3RbaV0gJSAyNTYpICsgMjU2KSAlIDI1NlxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJykge1xuICAgIGJ1Zi53cml0ZShzdWJqZWN0LCAwLCBlbmNvZGluZylcbiAgfSBlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJyAmJiAhQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQgJiYgIW5vWmVybykge1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgYnVmW2ldID0gMFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBidWZcbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gKGIpIHtcbiAgcmV0dXJuICEhKGIgIT0gbnVsbCAmJiBiLl9pc0J1ZmZlcilcbn1cblxuQnVmZmVyLmNvbXBhcmUgPSBmdW5jdGlvbiAoYSwgYikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihhKSB8fCAhQnVmZmVyLmlzQnVmZmVyKGIpKVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyBtdXN0IGJlIEJ1ZmZlcnMnKVxuXG4gIHZhciB4ID0gYS5sZW5ndGhcbiAgdmFyIHkgPSBiLmxlbmd0aFxuICBmb3IgKHZhciBpID0gMCwgbGVuID0gTWF0aC5taW4oeCwgeSk7IGkgPCBsZW4gJiYgYVtpXSA9PT0gYltpXTsgaSsrKSB7fVxuICBpZiAoaSAhPT0gbGVuKSB7XG4gICAgeCA9IGFbaV1cbiAgICB5ID0gYltpXVxuICB9XG4gIGlmICh4IDwgeSkgcmV0dXJuIC0xXG4gIGlmICh5IDwgeCkgcmV0dXJuIDFcbiAgcmV0dXJuIDBcbn1cblxuQnVmZmVyLmlzRW5jb2RpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcpIHtcbiAgc3dpdGNoIChTdHJpbmcoZW5jb2RpbmcpLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgIGNhc2UgJ3Jhdyc6XG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldHVybiB0cnVlXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbkJ1ZmZlci5jb25jYXQgPSBmdW5jdGlvbiAobGlzdCwgdG90YWxMZW5ndGgpIHtcbiAgaWYgKCFpc0FycmF5KGxpc3QpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdVc2FnZTogQnVmZmVyLmNvbmNhdChsaXN0WywgbGVuZ3RoXSknKVxuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKDApXG4gIH0gZWxzZSBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gbGlzdFswXVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKHRvdGFsTGVuZ3RoID09PSB1bmRlZmluZWQpIHtcbiAgICB0b3RhbExlbmd0aCA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgdG90YWxMZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcih0b3RhbExlbmd0aClcbiAgdmFyIHBvcyA9IDBcbiAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgaXRlbSA9IGxpc3RbaV1cbiAgICBpdGVtLmNvcHkoYnVmLCBwb3MpXG4gICAgcG9zICs9IGl0ZW0ubGVuZ3RoXG4gIH1cbiAgcmV0dXJuIGJ1ZlxufVxuXG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGZ1bmN0aW9uIChzdHIsIGVuY29kaW5nKSB7XG4gIHZhciByZXRcbiAgc3RyID0gc3RyICsgJydcbiAgc3dpdGNoIChlbmNvZGluZyB8fCAndXRmOCcpIHtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdyYXcnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAqIDJcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggPj4+IDFcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IGJhc2U2NFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGhcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbi8vIHByZS1zZXQgZm9yIHZhbHVlcyB0aGF0IG1heSBleGlzdCBpbiB0aGUgZnV0dXJlXG5CdWZmZXIucHJvdG90eXBlLmxlbmd0aCA9IHVuZGVmaW5lZFxuQnVmZmVyLnByb3RvdHlwZS5wYXJlbnQgPSB1bmRlZmluZWRcblxuLy8gdG9TdHJpbmcoZW5jb2RpbmcsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgbG93ZXJlZENhc2UgPSBmYWxzZVxuXG4gIHN0YXJ0ID0gc3RhcnQgPj4+IDBcbiAgZW5kID0gZW5kID09PSB1bmRlZmluZWQgfHwgZW5kID09PSBJbmZpbml0eSA/IHRoaXMubGVuZ3RoIDogZW5kID4+PiAwXG5cbiAgaWYgKCFlbmNvZGluZykgZW5jb2RpbmcgPSAndXRmOCdcbiAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKGVuZCA8PSBzdGFydCkgcmV0dXJuICcnXG5cbiAgd2hpbGUgKHRydWUpIHtcbiAgICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgICBjYXNlICdoZXgnOlxuICAgICAgICByZXR1cm4gaGV4U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAndXRmOCc6XG4gICAgICBjYXNlICd1dGYtOCc6XG4gICAgICAgIHJldHVybiB1dGY4U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYXNjaWknOlxuICAgICAgICByZXR1cm4gYXNjaWlTbGljZSh0aGlzLCBzdGFydCwgZW5kKVxuXG4gICAgICBjYXNlICdiaW5hcnknOlxuICAgICAgICByZXR1cm4gYmluYXJ5U2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgICAgcmV0dXJuIGJhc2U2NFNsaWNlKHRoaXMsIHN0YXJ0LCBlbmQpXG5cbiAgICAgIGNhc2UgJ3VjczInOlxuICAgICAgY2FzZSAndWNzLTInOlxuICAgICAgY2FzZSAndXRmMTZsZSc6XG4gICAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICAgIHJldHVybiB1dGYxNmxlU2xpY2UodGhpcywgc3RhcnQsIGVuZClcblxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYgKGxvd2VyZWRDYXNlKVxuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1Vua25vd24gZW5jb2Rpbmc6ICcgKyBlbmNvZGluZylcbiAgICAgICAgZW5jb2RpbmcgPSAoZW5jb2RpbmcgKyAnJykudG9Mb3dlckNhc2UoKVxuICAgICAgICBsb3dlcmVkQ2FzZSA9IHRydWVcbiAgICB9XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5lcXVhbHMgPSBmdW5jdGlvbiAoYikge1xuICBpZighQnVmZmVyLmlzQnVmZmVyKGIpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudCBtdXN0IGJlIGEgQnVmZmVyJylcbiAgcmV0dXJuIEJ1ZmZlci5jb21wYXJlKHRoaXMsIGIpID09PSAwXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHN0ciA9ICcnXG4gIHZhciBtYXggPSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTXG4gIGlmICh0aGlzLmxlbmd0aCA+IDApIHtcbiAgICBzdHIgPSB0aGlzLnRvU3RyaW5nKCdoZXgnLCAwLCBtYXgpLm1hdGNoKC8uezJ9L2cpLmpvaW4oJyAnKVxuICAgIGlmICh0aGlzLmxlbmd0aCA+IG1heClcbiAgICAgIHN0ciArPSAnIC4uLiAnXG4gIH1cbiAgcmV0dXJuICc8QnVmZmVyICcgKyBzdHIgKyAnPidcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5jb21wYXJlID0gZnVuY3Rpb24gKGIpIHtcbiAgaWYgKCFCdWZmZXIuaXNCdWZmZXIoYikpIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50IG11c3QgYmUgYSBCdWZmZXInKVxuICByZXR1cm4gQnVmZmVyLmNvbXBhcmUodGhpcywgYilcbn1cblxuLy8gYGdldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLmdldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMucmVhZFVJbnQ4KG9mZnNldClcbn1cblxuLy8gYHNldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKHYsIG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLnNldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMud3JpdGVVSW50OCh2LCBvZmZzZXQpXG59XG5cbmZ1bmN0aW9uIGhleFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gYnVmLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG5cbiAgLy8gbXVzdCBiZSBhbiBldmVuIG51bWJlciBvZiBkaWdpdHNcbiAgdmFyIHN0ckxlbiA9IHN0cmluZy5sZW5ndGhcbiAgaWYgKHN0ckxlbiAlIDIgIT09IDApIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBoZXggc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGJ5dGUgPSBwYXJzZUludChzdHJpbmcuc3Vic3RyKGkgKiAyLCAyKSwgMTYpXG4gICAgaWYgKGlzTmFOKGJ5dGUpKSB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaGV4IHN0cmluZycpXG4gICAgYnVmW29mZnNldCArIGldID0gYnl0ZVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIHV0ZjhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBibGl0QnVmZmVyKHV0ZjhUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gYXNjaWlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBibGl0QnVmZmVyKGFzY2lpVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIGJpbmFyeVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIGFzY2lpV3JpdGUoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBiYXNlNjRXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBibGl0QnVmZmVyKGJhc2U2NFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiB1dGYxNmxlV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gYmxpdEJ1ZmZlcih1dGYxNmxlVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbiAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpIHtcbiAgLy8gU3VwcG9ydCBib3RoIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZylcbiAgLy8gYW5kIHRoZSBsZWdhY3kgKHN0cmluZywgZW5jb2RpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICBpZiAoaXNGaW5pdGUob2Zmc2V0KSkge1xuICAgIGlmICghaXNGaW5pdGUobGVuZ3RoKSkge1xuICAgICAgZW5jb2RpbmcgPSBsZW5ndGhcbiAgICAgIGxlbmd0aCA9IHVuZGVmaW5lZFxuICAgIH1cbiAgfSBlbHNlIHsgIC8vIGxlZ2FjeVxuICAgIHZhciBzd2FwID0gZW5jb2RpbmdcbiAgICBlbmNvZGluZyA9IG9mZnNldFxuICAgIG9mZnNldCA9IGxlbmd0aFxuICAgIGxlbmd0aCA9IHN3YXBcbiAgfVxuXG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IHRoaXMubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IGhleFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IHV0ZjhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgICByZXQgPSBhc2NpaVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBiaW5hcnlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IHV0ZjE2bGVXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignVW5rbm93biBlbmNvZGluZzogJyArIGVuY29kaW5nKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogJ0J1ZmZlcicsXG4gICAgZGF0YTogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5fYXJyIHx8IHRoaXMsIDApXG4gIH1cbn1cblxuZnVuY3Rpb24gYmFzZTY0U2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICBpZiAoc3RhcnQgPT09IDAgJiYgZW5kID09PSBidWYubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1ZilcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmLnNsaWNlKHN0YXJ0LCBlbmQpKVxuICB9XG59XG5cbmZ1bmN0aW9uIHV0ZjhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXMgPSAnJ1xuICB2YXIgdG1wID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgaWYgKGJ1ZltpXSA8PSAweDdGKSB7XG4gICAgICByZXMgKz0gZGVjb2RlVXRmOENoYXIodG1wKSArIFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICAgICAgdG1wID0gJydcbiAgICB9IGVsc2Uge1xuICAgICAgdG1wICs9ICclJyArIGJ1ZltpXS50b1N0cmluZygxNilcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzICsgZGVjb2RlVXRmOENoYXIodG1wKVxufVxuXG5mdW5jdGlvbiBhc2NpaVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHJldCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIGJpbmFyeVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgcmV0dXJuIGFzY2lpU2xpY2UoYnVmLCBzdGFydCwgZW5kKVxufVxuXG5mdW5jdGlvbiBoZXhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG5cbiAgaWYgKCFzdGFydCB8fCBzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCB8fCBlbmQgPCAwIHx8IGVuZCA+IGxlbikgZW5kID0gbGVuXG5cbiAgdmFyIG91dCA9ICcnXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgb3V0ICs9IHRvSGV4KGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBieXRlcyA9IGJ1Zi5zbGljZShzdGFydCwgZW5kKVxuICB2YXIgcmVzID0gJydcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkgKz0gMikge1xuICAgIHJlcyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldICsgYnl0ZXNbaSArIDFdICogMjU2KVxuICB9XG4gIHJldHVybiByZXNcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5zbGljZSA9IGZ1bmN0aW9uIChzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBzdGFydCA9IH5+c3RhcnRcbiAgZW5kID0gZW5kID09PSB1bmRlZmluZWQgPyBsZW4gOiB+fmVuZFxuXG4gIGlmIChzdGFydCA8IDApIHtcbiAgICBzdGFydCArPSBsZW47XG4gICAgaWYgKHN0YXJ0IDwgMClcbiAgICAgIHN0YXJ0ID0gMFxuICB9IGVsc2UgaWYgKHN0YXJ0ID4gbGVuKSB7XG4gICAgc3RhcnQgPSBsZW5cbiAgfVxuXG4gIGlmIChlbmQgPCAwKSB7XG4gICAgZW5kICs9IGxlblxuICAgIGlmIChlbmQgPCAwKVxuICAgICAgZW5kID0gMFxuICB9IGVsc2UgaWYgKGVuZCA+IGxlbikge1xuICAgIGVuZCA9IGxlblxuICB9XG5cbiAgaWYgKGVuZCA8IHN0YXJ0KVxuICAgIGVuZCA9IHN0YXJ0XG5cbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgcmV0dXJuIEJ1ZmZlci5fYXVnbWVudCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBlbmQpKVxuICB9IGVsc2Uge1xuICAgIHZhciBzbGljZUxlbiA9IGVuZCAtIHN0YXJ0XG4gICAgdmFyIG5ld0J1ZiA9IG5ldyBCdWZmZXIoc2xpY2VMZW4sIHVuZGVmaW5lZCwgdHJ1ZSlcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNsaWNlTGVuOyBpKyspIHtcbiAgICAgIG5ld0J1ZltpXSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgICByZXR1cm4gbmV3QnVmXG4gIH1cbn1cblxuLypcbiAqIE5lZWQgdG8gbWFrZSBzdXJlIHRoYXQgYnVmZmVyIGlzbid0IHRyeWluZyB0byB3cml0ZSBvdXQgb2YgYm91bmRzLlxuICovXG5mdW5jdGlvbiBjaGVja09mZnNldCAob2Zmc2V0LCBleHQsIGxlbmd0aCkge1xuICBpZiAoKG9mZnNldCAlIDEpICE9PSAwIHx8IG9mZnNldCA8IDApXG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ29mZnNldCBpcyBub3QgdWludCcpXG4gIGlmIChvZmZzZXQgKyBleHQgPiBsZW5ndGgpXG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ1RyeWluZyB0byBhY2Nlc3MgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAxLCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCAyLCB0aGlzLmxlbmd0aClcbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XSB8ICh0aGlzW29mZnNldCArIDFdIDw8IDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDIsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSA8PCA4KSB8IHRoaXNbb2Zmc2V0ICsgMV1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG5cbiAgcmV0dXJuICgodGhpc1tvZmZzZXRdKSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAxXSA8PCA4KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCAxNikpICtcbiAgICAgICh0aGlzW29mZnNldCArIDNdICogMHgxMDAwMDAwKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSAqIDB4MTAwMDAwMCkgK1xuICAgICAgKCh0aGlzW29mZnNldCArIDFdIDw8IDE2KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAyXSA8PCA4KSB8XG4gICAgICB0aGlzW29mZnNldCArIDNdKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDEsIHRoaXMubGVuZ3RoKVxuICBpZiAoISh0aGlzW29mZnNldF0gJiAweDgwKSlcbiAgICByZXR1cm4gKHRoaXNbb2Zmc2V0XSlcbiAgcmV0dXJuICgoMHhmZiAtIHRoaXNbb2Zmc2V0XSArIDEpICogLTEpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldF0gfCAodGhpc1tvZmZzZXQgKyAxXSA8PCA4KVxuICByZXR1cm4gKHZhbCAmIDB4ODAwMCkgPyB2YWwgfCAweEZGRkYwMDAwIDogdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgMiwgdGhpcy5sZW5ndGgpXG4gIHZhciB2YWwgPSB0aGlzW29mZnNldCArIDFdIHwgKHRoaXNbb2Zmc2V0XSA8PCA4KVxuICByZXR1cm4gKHZhbCAmIDB4ODAwMCkgPyB2YWwgfCAweEZGRkYwMDAwIDogdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG5cbiAgcmV0dXJuICh0aGlzW29mZnNldF0pIHxcbiAgICAgICh0aGlzW29mZnNldCArIDFdIDw8IDgpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDJdIDw8IDE2KSB8XG4gICAgICAodGhpc1tvZmZzZXQgKyAzXSA8PCAyNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tPZmZzZXQob2Zmc2V0LCA0LCB0aGlzLmxlbmd0aClcblxuICByZXR1cm4gKHRoaXNbb2Zmc2V0XSA8PCAyNCkgfFxuICAgICAgKHRoaXNbb2Zmc2V0ICsgMV0gPDwgMTYpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDJdIDw8IDgpIHxcbiAgICAgICh0aGlzW29mZnNldCArIDNdKVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdExFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDQsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgdHJ1ZSwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrT2Zmc2V0KG9mZnNldCwgNCwgdGhpcy5sZW5ndGgpXG4gIHJldHVybiBpZWVlNzU0LnJlYWQodGhpcywgb2Zmc2V0LCBmYWxzZSwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDgsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgdHJ1ZSwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja09mZnNldChvZmZzZXQsIDgsIHRoaXMubGVuZ3RoKVxuICByZXR1cm4gaWVlZTc1NC5yZWFkKHRoaXMsIG9mZnNldCwgZmFsc2UsIDUyLCA4KVxufVxuXG5mdW5jdGlvbiBjaGVja0ludCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBleHQsIG1heCwgbWluKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGJ1ZikpIHRocm93IG5ldyBUeXBlRXJyb3IoJ2J1ZmZlciBtdXN0IGJlIGEgQnVmZmVyIGluc3RhbmNlJylcbiAgaWYgKHZhbHVlID4gbWF4IHx8IHZhbHVlIDwgbWluKSB0aHJvdyBuZXcgVHlwZUVycm9yKCd2YWx1ZSBpcyBvdXQgb2YgYm91bmRzJylcbiAgaWYgKG9mZnNldCArIGV4dCA+IGJ1Zi5sZW5ndGgpIHRocm93IG5ldyBUeXBlRXJyb3IoJ2luZGV4IG91dCBvZiByYW5nZScpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAxLCAweGZmLCAwKVxuICBpZiAoIUJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB2YWx1ZSA9IE1hdGguZmxvb3IodmFsdWUpXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gIHJldHVybiBvZmZzZXQgKyAxXG59XG5cbmZ1bmN0aW9uIG9iamVjdFdyaXRlVUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmZmZiArIHZhbHVlICsgMVxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGJ1Zi5sZW5ndGggLSBvZmZzZXQsIDIpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID0gKHZhbHVlICYgKDB4ZmYgPDwgKDggKiAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSkpKSA+Pj5cbiAgICAgIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpICogOFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweGZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUpXG4gIHJldHVybiBvZmZzZXQgKyAyXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCAyLCAweGZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDFdID0gdmFsdWVcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlKVxuICByZXR1cm4gb2Zmc2V0ICsgMlxufVxuXG5mdW5jdGlvbiBvYmplY3RXcml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcbiAgaWYgKHZhbHVlIDwgMCkgdmFsdWUgPSAweGZmZmZmZmZmICsgdmFsdWUgKyAxXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4oYnVmLmxlbmd0aCAtIG9mZnNldCwgNCk7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSAodmFsdWUgPj4+IChsaXR0bGVFbmRpYW4gPyBpIDogMyAtIGkpICogOCkgJiAweGZmXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4ZmZmZmZmZmYsIDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUpXG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICB2YWx1ZSA9ICt2YWx1ZVxuICBvZmZzZXQgPSBvZmZzZXQgPj4+IDBcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0ludCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCA0LCAweGZmZmZmZmZmLCAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDI0KVxuICAgIHRoaXNbb2Zmc2V0ICsgMV0gPSAodmFsdWUgPj4+IDE2KVxuICAgIHRoaXNbb2Zmc2V0ICsgMl0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAzXSA9IHZhbHVlXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgcmV0dXJuIG9mZnNldCArIDRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMSwgMHg3ZiwgLTB4ODApXG4gIGlmICghQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHZhbHVlID0gTWF0aC5mbG9vcih2YWx1ZSlcbiAgaWYgKHZhbHVlIDwgMCkgdmFsdWUgPSAweGZmICsgdmFsdWUgKyAxXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gIHJldHVybiBvZmZzZXQgKyAxXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDIsIDB4N2ZmZiwgLTB4ODAwMClcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiA4KVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSlcbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgMiwgMHg3ZmZmLCAtMHg4MDAwKVxuICBpZiAoQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICB0aGlzW29mZnNldF0gPSAodmFsdWUgPj4+IDgpXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9IHZhbHVlXG4gIH0gZWxzZSBvYmplY3RXcml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSlcbiAgcmV0dXJuIG9mZnNldCArIDJcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgdmFsdWUgPSArdmFsdWVcbiAgb2Zmc2V0ID0gb2Zmc2V0ID4+PiAwXG4gIGlmICghbm9Bc3NlcnQpXG4gICAgY2hlY2tJbnQodGhpcywgdmFsdWUsIG9mZnNldCwgNCwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG4gICAgdGhpc1tvZmZzZXQgKyAxXSA9ICh2YWx1ZSA+Pj4gOClcbiAgICB0aGlzW29mZnNldCArIDJdID0gKHZhbHVlID4+PiAxNilcbiAgICB0aGlzW29mZnNldCArIDNdID0gKHZhbHVlID4+PiAyNClcbiAgfSBlbHNlIG9iamVjdFdyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUpXG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHZhbHVlID0gK3ZhbHVlXG4gIG9mZnNldCA9IG9mZnNldCA+Pj4gMFxuICBpZiAoIW5vQXNzZXJ0KVxuICAgIGNoZWNrSW50KHRoaXMsIHZhbHVlLCBvZmZzZXQsIDQsIDB4N2ZmZmZmZmYsIC0weDgwMDAwMDAwKVxuICBpZiAodmFsdWUgPCAwKSB2YWx1ZSA9IDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDFcbiAgaWYgKEJ1ZmZlci5UWVBFRF9BUlJBWV9TVVBQT1JUKSB7XG4gICAgdGhpc1tvZmZzZXRdID0gKHZhbHVlID4+PiAyNClcbiAgICB0aGlzW29mZnNldCArIDFdID0gKHZhbHVlID4+PiAxNilcbiAgICB0aGlzW29mZnNldCArIDJdID0gKHZhbHVlID4+PiA4KVxuICAgIHRoaXNbb2Zmc2V0ICsgM10gPSB2YWx1ZVxuICB9IGVsc2Ugb2JqZWN0V3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UpXG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbmZ1bmN0aW9uIGNoZWNrSUVFRTc1NCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBleHQsIG1heCwgbWluKSB7XG4gIGlmICh2YWx1ZSA+IG1heCB8fCB2YWx1ZSA8IG1pbikgdGhyb3cgbmV3IFR5cGVFcnJvcigndmFsdWUgaXMgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChvZmZzZXQgKyBleHQgPiBidWYubGVuZ3RoKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdpbmRleCBvdXQgb2YgcmFuZ2UnKVxufVxuXG5mdW5jdGlvbiB3cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0lFRUU3NTQoYnVmLCB2YWx1ZSwgb2Zmc2V0LCA0LCAzLjQwMjgyMzQ2NjM4NTI4ODZlKzM4LCAtMy40MDI4MjM0NjYzODUyODg2ZSszOClcbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG4gIHJldHVybiBvZmZzZXQgKyA0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdExFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIHdyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydClcbiAgICBjaGVja0lFRUU3NTQoYnVmLCB2YWx1ZSwgb2Zmc2V0LCA4LCAxLjc5NzY5MzEzNDg2MjMxNTdFKzMwOCwgLTEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4KVxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbiAgcmV0dXJuIG9mZnNldCArIDhcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiB3cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbi8vIGNvcHkodGFyZ2V0QnVmZmVyLCB0YXJnZXRTdGFydD0wLCBzb3VyY2VTdGFydD0wLCBzb3VyY2VFbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uICh0YXJnZXQsIHRhcmdldF9zdGFydCwgc3RhcnQsIGVuZCkge1xuICB2YXIgc291cmNlID0gdGhpc1xuXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICghdGFyZ2V0X3N0YXJ0KSB0YXJnZXRfc3RhcnQgPSAwXG5cbiAgLy8gQ29weSAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRhcmdldC5sZW5ndGggPT09IDAgfHwgc291cmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgLy8gRmF0YWwgZXJyb3IgY29uZGl0aW9uc1xuICBpZiAoZW5kIDwgc3RhcnQpIHRocm93IG5ldyBUeXBlRXJyb3IoJ3NvdXJjZUVuZCA8IHNvdXJjZVN0YXJ0JylcbiAgaWYgKHRhcmdldF9zdGFydCA8IDAgfHwgdGFyZ2V0X3N0YXJ0ID49IHRhcmdldC5sZW5ndGgpXG4gICAgdGhyb3cgbmV3IFR5cGVFcnJvcigndGFyZ2V0U3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChzdGFydCA8IDAgfHwgc3RhcnQgPj0gc291cmNlLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignc291cmNlU3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGlmIChlbmQgPCAwIHx8IGVuZCA+IHNvdXJjZS5sZW5ndGgpIHRocm93IG5ldyBUeXBlRXJyb3IoJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpXG4gICAgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgPCBlbmQgLSBzdGFydClcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0ICsgc3RhcnRcblxuICB2YXIgbGVuID0gZW5kIC0gc3RhcnRcblxuICBpZiAobGVuIDwgMTAwMCB8fCAhQnVmZmVyLlRZUEVEX0FSUkFZX1NVUFBPUlQpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICB0YXJnZXRbaSArIHRhcmdldF9zdGFydF0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGFyZ2V0Ll9zZXQodGhpcy5zdWJhcnJheShzdGFydCwgc3RhcnQgKyBsZW4pLCB0YXJnZXRfc3RhcnQpXG4gIH1cbn1cblxuLy8gZmlsbCh2YWx1ZSwgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiAodmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCF2YWx1ZSkgdmFsdWUgPSAwXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCkgZW5kID0gdGhpcy5sZW5ndGhcblxuICBpZiAoZW5kIDwgc3RhcnQpIHRocm93IG5ldyBUeXBlRXJyb3IoJ2VuZCA8IHN0YXJ0JylcblxuICAvLyBGaWxsIDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGhpcy5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIGlmIChzdGFydCA8IDAgfHwgc3RhcnQgPj0gdGhpcy5sZW5ndGgpIHRocm93IG5ldyBUeXBlRXJyb3IoJ3N0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBpZiAoZW5kIDwgMCB8fCBlbmQgPiB0aGlzLmxlbmd0aCkgdGhyb3cgbmV3IFR5cGVFcnJvcignZW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIHZhciBpXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgZm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgICAgdGhpc1tpXSA9IHZhbHVlXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHZhciBieXRlcyA9IHV0ZjhUb0J5dGVzKHZhbHVlLnRvU3RyaW5nKCkpXG4gICAgdmFyIGxlbiA9IGJ5dGVzLmxlbmd0aFxuICAgIGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICAgIHRoaXNbaV0gPSBieXRlc1tpICUgbGVuXVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgQXJyYXlCdWZmZXJgIHdpdGggdGhlICpjb3BpZWQqIG1lbW9yeSBvZiB0aGUgYnVmZmVyIGluc3RhbmNlLlxuICogQWRkZWQgaW4gTm9kZSAwLjEyLiBPbmx5IGF2YWlsYWJsZSBpbiBicm93c2VycyB0aGF0IHN1cHBvcnQgQXJyYXlCdWZmZXIuXG4gKi9cbkJ1ZmZlci5wcm90b3R5cGUudG9BcnJheUJ1ZmZlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmIChCdWZmZXIuVFlQRURfQVJSQVlfU1VQUE9SVCkge1xuICAgICAgcmV0dXJuIChuZXcgQnVmZmVyKHRoaXMpKS5idWZmZXJcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJ1ZiA9IG5ldyBVaW50OEFycmF5KHRoaXMubGVuZ3RoKVxuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGJ1Zi5sZW5ndGg7IGkgPCBsZW47IGkgKz0gMSkge1xuICAgICAgICBidWZbaV0gPSB0aGlzW2ldXG4gICAgICB9XG4gICAgICByZXR1cm4gYnVmLmJ1ZmZlclxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdCdWZmZXIudG9BcnJheUJ1ZmZlciBub3Qgc3VwcG9ydGVkIGluIHRoaXMgYnJvd3NlcicpXG4gIH1cbn1cblxuLy8gSEVMUEVSIEZVTkNUSU9OU1xuLy8gPT09PT09PT09PT09PT09PVxuXG52YXIgQlAgPSBCdWZmZXIucHJvdG90eXBlXG5cbi8qKlxuICogQXVnbWVudCBhIFVpbnQ4QXJyYXkgKmluc3RhbmNlKiAobm90IHRoZSBVaW50OEFycmF5IGNsYXNzISkgd2l0aCBCdWZmZXIgbWV0aG9kc1xuICovXG5CdWZmZXIuX2F1Z21lbnQgPSBmdW5jdGlvbiAoYXJyKSB7XG4gIGFyci5jb25zdHJ1Y3RvciA9IEJ1ZmZlclxuICBhcnIuX2lzQnVmZmVyID0gdHJ1ZVxuXG4gIC8vIHNhdmUgcmVmZXJlbmNlIHRvIG9yaWdpbmFsIFVpbnQ4QXJyYXkgZ2V0L3NldCBtZXRob2RzIGJlZm9yZSBvdmVyd3JpdGluZ1xuICBhcnIuX2dldCA9IGFyci5nZXRcbiAgYXJyLl9zZXQgPSBhcnIuc2V0XG5cbiAgLy8gZGVwcmVjYXRlZCwgd2lsbCBiZSByZW1vdmVkIGluIG5vZGUgMC4xMytcbiAgYXJyLmdldCA9IEJQLmdldFxuICBhcnIuc2V0ID0gQlAuc2V0XG5cbiAgYXJyLndyaXRlID0gQlAud3JpdGVcbiAgYXJyLnRvU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvTG9jYWxlU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvSlNPTiA9IEJQLnRvSlNPTlxuICBhcnIuZXF1YWxzID0gQlAuZXF1YWxzXG4gIGFyci5jb21wYXJlID0gQlAuY29tcGFyZVxuICBhcnIuY29weSA9IEJQLmNvcHlcbiAgYXJyLnNsaWNlID0gQlAuc2xpY2VcbiAgYXJyLnJlYWRVSW50OCA9IEJQLnJlYWRVSW50OFxuICBhcnIucmVhZFVJbnQxNkxFID0gQlAucmVhZFVJbnQxNkxFXG4gIGFyci5yZWFkVUludDE2QkUgPSBCUC5yZWFkVUludDE2QkVcbiAgYXJyLnJlYWRVSW50MzJMRSA9IEJQLnJlYWRVSW50MzJMRVxuICBhcnIucmVhZFVJbnQzMkJFID0gQlAucmVhZFVJbnQzMkJFXG4gIGFyci5yZWFkSW50OCA9IEJQLnJlYWRJbnQ4XG4gIGFyci5yZWFkSW50MTZMRSA9IEJQLnJlYWRJbnQxNkxFXG4gIGFyci5yZWFkSW50MTZCRSA9IEJQLnJlYWRJbnQxNkJFXG4gIGFyci5yZWFkSW50MzJMRSA9IEJQLnJlYWRJbnQzMkxFXG4gIGFyci5yZWFkSW50MzJCRSA9IEJQLnJlYWRJbnQzMkJFXG4gIGFyci5yZWFkRmxvYXRMRSA9IEJQLnJlYWRGbG9hdExFXG4gIGFyci5yZWFkRmxvYXRCRSA9IEJQLnJlYWRGbG9hdEJFXG4gIGFyci5yZWFkRG91YmxlTEUgPSBCUC5yZWFkRG91YmxlTEVcbiAgYXJyLnJlYWREb3VibGVCRSA9IEJQLnJlYWREb3VibGVCRVxuICBhcnIud3JpdGVVSW50OCA9IEJQLndyaXRlVUludDhcbiAgYXJyLndyaXRlVUludDE2TEUgPSBCUC53cml0ZVVJbnQxNkxFXG4gIGFyci53cml0ZVVJbnQxNkJFID0gQlAud3JpdGVVSW50MTZCRVxuICBhcnIud3JpdGVVSW50MzJMRSA9IEJQLndyaXRlVUludDMyTEVcbiAgYXJyLndyaXRlVUludDMyQkUgPSBCUC53cml0ZVVJbnQzMkJFXG4gIGFyci53cml0ZUludDggPSBCUC53cml0ZUludDhcbiAgYXJyLndyaXRlSW50MTZMRSA9IEJQLndyaXRlSW50MTZMRVxuICBhcnIud3JpdGVJbnQxNkJFID0gQlAud3JpdGVJbnQxNkJFXG4gIGFyci53cml0ZUludDMyTEUgPSBCUC53cml0ZUludDMyTEVcbiAgYXJyLndyaXRlSW50MzJCRSA9IEJQLndyaXRlSW50MzJCRVxuICBhcnIud3JpdGVGbG9hdExFID0gQlAud3JpdGVGbG9hdExFXG4gIGFyci53cml0ZUZsb2F0QkUgPSBCUC53cml0ZUZsb2F0QkVcbiAgYXJyLndyaXRlRG91YmxlTEUgPSBCUC53cml0ZURvdWJsZUxFXG4gIGFyci53cml0ZURvdWJsZUJFID0gQlAud3JpdGVEb3VibGVCRVxuICBhcnIuZmlsbCA9IEJQLmZpbGxcbiAgYXJyLmluc3BlY3QgPSBCUC5pbnNwZWN0XG4gIGFyci50b0FycmF5QnVmZmVyID0gQlAudG9BcnJheUJ1ZmZlclxuXG4gIHJldHVybiBhcnJcbn1cblxudmFyIElOVkFMSURfQkFTRTY0X1JFID0gL1teK1xcLzAtOUEtel0vZ1xuXG5mdW5jdGlvbiBiYXNlNjRjbGVhbiAoc3RyKSB7XG4gIC8vIE5vZGUgc3RyaXBzIG91dCBpbnZhbGlkIGNoYXJhY3RlcnMgbGlrZSBcXG4gYW5kIFxcdCBmcm9tIHRoZSBzdHJpbmcsIGJhc2U2NC1qcyBkb2VzIG5vdFxuICBzdHIgPSBzdHJpbmd0cmltKHN0cikucmVwbGFjZShJTlZBTElEX0JBU0U2NF9SRSwgJycpXG4gIC8vIE5vZGUgYWxsb3dzIGZvciBub24tcGFkZGVkIGJhc2U2NCBzdHJpbmdzIChtaXNzaW5nIHRyYWlsaW5nID09PSksIGJhc2U2NC1qcyBkb2VzIG5vdFxuICB3aGlsZSAoc3RyLmxlbmd0aCAlIDQgIT09IDApIHtcbiAgICBzdHIgPSBzdHIgKyAnPSdcbiAgfVxuICByZXR1cm4gc3RyXG59XG5cbmZ1bmN0aW9uIHN0cmluZ3RyaW0gKHN0cikge1xuICBpZiAoc3RyLnRyaW0pIHJldHVybiBzdHIudHJpbSgpXG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlpc2ggKHN1YmplY3QpIHtcbiAgcmV0dXJuIGlzQXJyYXkoc3ViamVjdCkgfHwgQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpIHx8XG4gICAgICBzdWJqZWN0ICYmIHR5cGVvZiBzdWJqZWN0ID09PSAnb2JqZWN0JyAmJlxuICAgICAgdHlwZW9mIHN1YmplY3QubGVuZ3RoID09PSAnbnVtYmVyJ1xufVxuXG5mdW5jdGlvbiB0b0hleCAobikge1xuICBpZiAobiA8IDE2KSByZXR1cm4gJzAnICsgbi50b1N0cmluZygxNilcbiAgcmV0dXJuIG4udG9TdHJpbmcoMTYpXG59XG5cbmZ1bmN0aW9uIHV0ZjhUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGIgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGlmIChiIDw9IDB4N0YpIHtcbiAgICAgIGJ5dGVBcnJheS5wdXNoKGIpXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBzdGFydCA9IGlcbiAgICAgIGlmIChiID49IDB4RDgwMCAmJiBiIDw9IDB4REZGRikgaSsrXG4gICAgICB2YXIgaCA9IGVuY29kZVVSSUNvbXBvbmVudChzdHIuc2xpY2Uoc3RhcnQsIGkrMSkpLnN1YnN0cigxKS5zcGxpdCgnJScpXG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGgubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgYnl0ZUFycmF5LnB1c2gocGFyc2VJbnQoaFtqXSwgMTYpKVxuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGFzY2lpVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIC8vIE5vZGUncyBjb2RlIHNlZW1zIHRvIGJlIGRvaW5nIHRoaXMgYW5kIG5vdCAmIDB4N0YuLlxuICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRilcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGMsIGhpLCBsb1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICBjID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBoaSA9IGMgPj4gOFxuICAgIGxvID0gYyAlIDI1NlxuICAgIGJ5dGVBcnJheS5wdXNoKGxvKVxuICAgIGJ5dGVBcnJheS5wdXNoKGhpKVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBiYXNlNjRUb0J5dGVzIChzdHIpIHtcbiAgcmV0dXJuIGJhc2U2NC50b0J5dGVBcnJheShzdHIpXG59XG5cbmZ1bmN0aW9uIGJsaXRCdWZmZXIgKHNyYywgZHN0LCBvZmZzZXQsIGxlbmd0aCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChpICsgb2Zmc2V0ID49IGRzdC5sZW5ndGgpIHx8IChpID49IHNyYy5sZW5ndGgpKVxuICAgICAgYnJlYWtcbiAgICBkc3RbaSArIG9mZnNldF0gPSBzcmNbaV1cbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBkZWNvZGVVdGY4Q2hhciAoc3RyKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzdHIpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKDB4RkZGRCkgLy8gVVRGIDggaW52YWxpZCBjaGFyXG4gIH1cbn1cbiIsInZhciBsb29rdXAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG5cbjsoZnVuY3Rpb24gKGV4cG9ydHMpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG4gIHZhciBBcnIgPSAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKVxuICAgID8gVWludDhBcnJheVxuICAgIDogQXJyYXlcblxuXHR2YXIgUExVUyAgID0gJysnLmNoYXJDb2RlQXQoMClcblx0dmFyIFNMQVNIICA9ICcvJy5jaGFyQ29kZUF0KDApXG5cdHZhciBOVU1CRVIgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgTE9XRVIgID0gJ2EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFVQUEVSICA9ICdBJy5jaGFyQ29kZUF0KDApXG5cblx0ZnVuY3Rpb24gZGVjb2RlIChlbHQpIHtcblx0XHR2YXIgY29kZSA9IGVsdC5jaGFyQ29kZUF0KDApXG5cdFx0aWYgKGNvZGUgPT09IFBMVVMpXG5cdFx0XHRyZXR1cm4gNjIgLy8gJysnXG5cdFx0aWYgKGNvZGUgPT09IFNMQVNIKVxuXHRcdFx0cmV0dXJuIDYzIC8vICcvJ1xuXHRcdGlmIChjb2RlIDwgTlVNQkVSKVxuXHRcdFx0cmV0dXJuIC0xIC8vbm8gbWF0Y2hcblx0XHRpZiAoY29kZSA8IE5VTUJFUiArIDEwKVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBOVU1CRVIgKyAyNiArIDI2XG5cdFx0aWYgKGNvZGUgPCBVUFBFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBVUFBFUlxuXHRcdGlmIChjb2RlIDwgTE9XRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gTE9XRVIgKyAyNlxuXHR9XG5cblx0ZnVuY3Rpb24gYjY0VG9CeXRlQXJyYXkgKGI2NCkge1xuXHRcdHZhciBpLCBqLCBsLCB0bXAsIHBsYWNlSG9sZGVycywgYXJyXG5cblx0XHRpZiAoYjY0Lmxlbmd0aCAlIDQgPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgc3RyaW5nLiBMZW5ndGggbXVzdCBiZSBhIG11bHRpcGxlIG9mIDQnKVxuXHRcdH1cblxuXHRcdC8vIHRoZSBudW1iZXIgb2YgZXF1YWwgc2lnbnMgKHBsYWNlIGhvbGRlcnMpXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHR3byBwbGFjZWhvbGRlcnMsIHRoYW4gdGhlIHR3byBjaGFyYWN0ZXJzIGJlZm9yZSBpdFxuXHRcdC8vIHJlcHJlc2VudCBvbmUgYnl0ZVxuXHRcdC8vIGlmIHRoZXJlIGlzIG9ubHkgb25lLCB0aGVuIHRoZSB0aHJlZSBjaGFyYWN0ZXJzIGJlZm9yZSBpdCByZXByZXNlbnQgMiBieXRlc1xuXHRcdC8vIHRoaXMgaXMganVzdCBhIGNoZWFwIGhhY2sgdG8gbm90IGRvIGluZGV4T2YgdHdpY2Vcblx0XHR2YXIgbGVuID0gYjY0Lmxlbmd0aFxuXHRcdHBsYWNlSG9sZGVycyA9ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAyKSA/IDIgOiAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMSkgPyAxIDogMFxuXG5cdFx0Ly8gYmFzZTY0IGlzIDQvMyArIHVwIHRvIHR3byBjaGFyYWN0ZXJzIG9mIHRoZSBvcmlnaW5hbCBkYXRhXG5cdFx0YXJyID0gbmV3IEFycihiNjQubGVuZ3RoICogMyAvIDQgLSBwbGFjZUhvbGRlcnMpXG5cblx0XHQvLyBpZiB0aGVyZSBhcmUgcGxhY2Vob2xkZXJzLCBvbmx5IGdldCB1cCB0byB0aGUgbGFzdCBjb21wbGV0ZSA0IGNoYXJzXG5cdFx0bCA9IHBsYWNlSG9sZGVycyA+IDAgPyBiNjQubGVuZ3RoIC0gNCA6IGI2NC5sZW5ndGhcblxuXHRcdHZhciBMID0gMFxuXG5cdFx0ZnVuY3Rpb24gcHVzaCAodikge1xuXHRcdFx0YXJyW0wrK10gPSB2XG5cdFx0fVxuXG5cdFx0Zm9yIChpID0gMCwgaiA9IDA7IGkgPCBsOyBpICs9IDQsIGogKz0gMykge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxOCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCAxMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA8PCA2KSB8IGRlY29kZShiNjQuY2hhckF0KGkgKyAzKSlcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMDAwKSA+PiAxNilcblx0XHRcdHB1c2goKHRtcCAmIDB4RkYwMCkgPj4gOClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRpZiAocGxhY2VIb2xkZXJzID09PSAyKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPj4gNClcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9IGVsc2UgaWYgKHBsYWNlSG9sZGVycyA9PT0gMSkge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAxMCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA8PCA0KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpID4+IDIpXG5cdFx0XHRwdXNoKCh0bXAgPj4gOCkgJiAweEZGKVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdHJldHVybiBhcnJcblx0fVxuXG5cdGZ1bmN0aW9uIHVpbnQ4VG9CYXNlNjQgKHVpbnQ4KSB7XG5cdFx0dmFyIGksXG5cdFx0XHRleHRyYUJ5dGVzID0gdWludDgubGVuZ3RoICUgMywgLy8gaWYgd2UgaGF2ZSAxIGJ5dGUgbGVmdCwgcGFkIDIgYnl0ZXNcblx0XHRcdG91dHB1dCA9IFwiXCIsXG5cdFx0XHR0ZW1wLCBsZW5ndGhcblxuXHRcdGZ1bmN0aW9uIGVuY29kZSAobnVtKSB7XG5cdFx0XHRyZXR1cm4gbG9va3VwLmNoYXJBdChudW0pXG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdHJpcGxldFRvQmFzZTY0IChudW0pIHtcblx0XHRcdHJldHVybiBlbmNvZGUobnVtID4+IDE4ICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDEyICYgMHgzRikgKyBlbmNvZGUobnVtID4+IDYgJiAweDNGKSArIGVuY29kZShudW0gJiAweDNGKVxuXHRcdH1cblxuXHRcdC8vIGdvIHRocm91Z2ggdGhlIGFycmF5IGV2ZXJ5IHRocmVlIGJ5dGVzLCB3ZSdsbCBkZWFsIHdpdGggdHJhaWxpbmcgc3R1ZmYgbGF0ZXJcblx0XHRmb3IgKGkgPSAwLCBsZW5ndGggPSB1aW50OC5sZW5ndGggLSBleHRyYUJ5dGVzOyBpIDwgbGVuZ3RoOyBpICs9IDMpIHtcblx0XHRcdHRlbXAgPSAodWludDhbaV0gPDwgMTYpICsgKHVpbnQ4W2kgKyAxXSA8PCA4KSArICh1aW50OFtpICsgMl0pXG5cdFx0XHRvdXRwdXQgKz0gdHJpcGxldFRvQmFzZTY0KHRlbXApXG5cdFx0fVxuXG5cdFx0Ly8gcGFkIHRoZSBlbmQgd2l0aCB6ZXJvcywgYnV0IG1ha2Ugc3VyZSB0byBub3QgZm9yZ2V0IHRoZSBleHRyYSBieXRlc1xuXHRcdHN3aXRjaCAoZXh0cmFCeXRlcykge1xuXHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHR0ZW1wID0gdWludDhbdWludDgubGVuZ3RoIC0gMV1cblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDIpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz09J1xuXHRcdFx0XHRicmVha1xuXHRcdFx0Y2FzZSAyOlxuXHRcdFx0XHR0ZW1wID0gKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDJdIDw8IDgpICsgKHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMTApXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPj4gNCkgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDIpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9J1xuXHRcdFx0XHRicmVha1xuXHRcdH1cblxuXHRcdHJldHVybiBvdXRwdXRcblx0fVxuXG5cdGV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRleHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KHR5cGVvZiBleHBvcnRzID09PSAndW5kZWZpbmVkJyA/ICh0aGlzLmJhc2U2NGpzID0ge30pIDogZXhwb3J0cykpXG4iLCJleHBvcnRzLnJlYWQgPSBmdW5jdGlvbihidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIG5CaXRzID0gLTcsXG4gICAgICBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDAsXG4gICAgICBkID0gaXNMRSA/IC0xIDogMSxcbiAgICAgIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV07XG5cbiAgaSArPSBkO1xuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBzID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gZUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIGUgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBtTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBpZiAoZSA9PT0gMCkge1xuICAgIGUgPSAxIC0gZUJpYXM7XG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KTtcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pO1xuICAgIGUgPSBlIC0gZUJpYXM7XG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbik7XG59O1xuXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGMsXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApLFxuICAgICAgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpLFxuICAgICAgZCA9IGlzTEUgPyAxIDogLTEsXG4gICAgICBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwO1xuXG4gIHZhbHVlID0gTWF0aC5hYnModmFsdWUpO1xuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwO1xuICAgIGUgPSBlTWF4O1xuICB9IGVsc2Uge1xuICAgIGUgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKTtcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS07XG4gICAgICBjICo9IDI7XG4gICAgfVxuICAgIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgdmFsdWUgKz0gcnQgLyBjO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcyk7XG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrO1xuICAgICAgYyAvPSAyO1xuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDA7XG4gICAgICBlID0gZU1heDtcbiAgICB9IGVsc2UgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICBtID0gKHZhbHVlICogYyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gZSArIGVCaWFzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gMDtcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KTtcblxuICBlID0gKGUgPDwgbUxlbikgfCBtO1xuICBlTGVuICs9IG1MZW47XG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCk7XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4O1xufTtcbiIsIlxuLyoqXG4gKiBpc0FycmF5XG4gKi9cblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5O1xuXG4vKipcbiAqIHRvU3RyaW5nXG4gKi9cblxudmFyIHN0ciA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8qKlxuICogV2hldGhlciBvciBub3QgdGhlIGdpdmVuIGB2YWxgXG4gKiBpcyBhbiBhcnJheS5cbiAqXG4gKiBleGFtcGxlOlxuICpcbiAqICAgICAgICBpc0FycmF5KFtdKTtcbiAqICAgICAgICAvLyA+IHRydWVcbiAqICAgICAgICBpc0FycmF5KGFyZ3VtZW50cyk7XG4gKiAgICAgICAgLy8gPiBmYWxzZVxuICogICAgICAgIGlzQXJyYXkoJycpO1xuICogICAgICAgIC8vID4gZmFsc2VcbiAqXG4gKiBAcGFyYW0ge21peGVkfSB2YWxcbiAqIEByZXR1cm4ge2Jvb2x9XG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBpc0FycmF5IHx8IGZ1bmN0aW9uICh2YWwpIHtcbiAgcmV0dXJuICEhIHZhbCAmJiAnW29iamVjdCBBcnJheV0nID09IHN0ci5jYWxsKHZhbCk7XG59O1xuIiwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIHBvbHlmaWxsIGZvciB3aW5kb3cucGVyZm9ybWFuY2Uubm93KCkgZnJvbSBodHRwczovL2dpc3QuZ2l0aHViLmNvbS9wYXVsaXJpc2gvNTQzODY1MFxyXG5kbyAtPlxyXG4gICMgcHJlcGFyZSBiYXNlIHBlcmYgb2JqZWN0XHJcbiAgaWYgdHlwZW9mIHdpbmRvdy5wZXJmb3JtYW5jZT09J3VuZGVmaW5lZCdcclxuICAgIHdpbmRvdy5wZXJmb3JtYW5jZSA9IHt9XHJcbiAgaWYgbm90IHdpbmRvdy5wZXJmb3JtYW5jZS5ub3dcclxuICAgICMgY29uc29sZS5sb2cgXCJwb2x5ZmlsbGluZyB3aW5kb3cucGVyZm9ybWFuY2Uubm93KClcIlxyXG4gICAgbm93T2Zmc2V0ID0gK25ldyBEYXRlKClcclxuICAgIGlmIHBlcmZvcm1hbmNlLnRpbWluZyBhbmQgcGVyZm9ybWFuY2UudGltaW5nXHJcbiAgICAgIG5vd09mZnNldCA9IHBlcmZvcm1hbmNlLnRpbWluZy5uYXZpZ2F0aW9uU3RhcnRcclxuICAgIHdpbmRvdy5wZXJmb3JtYW5jZS5ub3cgPSAtPlxyXG4gICAgICBub3cgPSArbmV3IERhdGUoKVxyXG4gICAgICByZXR1cm4gbm93IC0gbm93T2Zmc2V0XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBCZWF0TWFrZXJcclxuXHJcbmNsYXNzIEJlYXRNYWtlclxyXG4gIGNvbnN0cnVjdG9yOiAtPlxyXG4gICAgQHJlc2V0KClcclxuXHJcbiAgc2V0SW5wdXRUZXh0OiAodGV4dCkgLT5cclxuICAgICQoXCIjYmVhdGlucHV0XCIpLnZhbCh0ZXh0KVxyXG5cclxuICBzZXRPdXRwdXRUZXh0OiAodGV4dCkgLT5cclxuICAgICQoXCIjYmVhdG91dHB1dFwiKS5odG1sKHRleHQpXHJcblxyXG4gIGVycm9yOiAodGV4dCkgLT5cclxuICAgIEBzZXRJbnB1dFRleHQoXCIgRVJST1I6ICN7dGV4dH1cIilcclxuXHJcbiAgcmVzZXQ6IChub3RlKSAtPlxyXG4gICAgQGtleURvd25Db3VudCA9IDBcclxuICAgIEBrZXlEb3duVGltZSA9IHt9XHJcbiAgICBAcmVjb3JkaW5nID0gZmFsc2VcclxuICAgIEBub3RlcyA9IFtdXHJcbiAgICBub3RlID89IFwiXCJcclxuICAgIEBzZXRJbnB1dFRleHQoXCIje25vdGV9IENsaWNrIGhlcmUgYW5kIGhpdCB1c2UgQS1aIGtleXMgdG8gbWFrZSBhIG5ldyBiZWF0IChwbGVhc2UgbG9vcCB0aGUgZnVsbCBwYXR0ZXJuIGV4YWN0bHkgdHdpY2UpXCIpXHJcblxyXG4gIHVwZGF0ZVJlY29yZGluZzogLT5cclxuICAgIHJldHVybiBpZiBub3QgQHJlY29yZGluZ1xyXG4gICAgbm93ID0gd2luZG93LnBlcmZvcm1hbmNlLm5vdygpXHJcbiAgICBpZiBub3cgPiAoQGxhc3RLZXlFdmVudCArIDIwMDApXHJcbiAgICAgICQoXCIjYmVhdGlucHV0XCIpLnZhbChcIiBSZWNvcmRpbmcgKCN7TWF0aC5mbG9vcig0MDAwIC0gKG5vdyAtIEBsYXN0S2V5RXZlbnQpKX0gbXMgbGVmdC4uLikuLi5cIilcclxuICAgIGVsc2VcclxuICAgICAgJChcIiNiZWF0aW5wdXRcIikudmFsKFwiIFJlY29yZGluZy4uLlwiKVxyXG5cclxuICBzdGFydFJlY29yZGluZzogLT5cclxuICAgIEByZWNvcmRpbmcgPSB0cnVlXHJcbiAgICBAdXBkYXRlUmVjb3JkaW5nKClcclxuXHJcbiAgc3RvcFJlY29yZGluZzogLT5cclxuICAgIHJlY29yZGVkTm90ZXMgPSBAbm90ZXNcclxuICAgIEByZXNldChcIiBSZWNvcmRpbmcgZmluaXNoZWQuXCIpXHJcbiAgICBAZ2VuZXJhdGUocmVjb3JkZWROb3RlcylcclxuXHJcbiAga2V5RG93bjogKGtleSwgdHMpIC0+XHJcbiAgICByZXR1cm4gaWYgQGtleURvd25UaW1lLmhhc093blByb3BlcnR5KGtleSlcclxuICAgIEBsYXN0S2V5RXZlbnQgPSB3aW5kb3cucGVyZm9ybWFuY2Uubm93KClcclxuICAgIGlmIG5vdCBAcmVjb3JkaW5nXHJcbiAgICAgIEBzdGFydFJlY29yZGluZygpXHJcblxyXG4gICAgIyBjb25zb2xlLmxvZyhcIkRPV046ICN7a2V5fSAoI3t0c30pXCIpXHJcbiAgICBAa2V5RG93blRpbWVba2V5XSA9IHRzXHJcbiAgICBAa2V5RG93bkNvdW50KytcclxuXHJcbiAga2V5VXA6IChrZXksIHRzKSAtPlxyXG4gICAgcmV0dXJuIGlmIG5vdCBAcmVjb3JkaW5nXHJcbiAgICBAbGFzdEtleUV2ZW50ID0gd2luZG93LnBlcmZvcm1hbmNlLm5vdygpXHJcbiAgICAjIGNvbnNvbGUubG9nKFwiVVAgIDogI3trZXl9ICgje3RzfSlcIilcclxuICAgIEBub3Rlcy5wdXNoIHtcclxuICAgICAga2V5OiBrZXlcclxuICAgICAgc3RhcnQ6IEBrZXlEb3duVGltZVtrZXldXHJcbiAgICAgIGVuZDogdHNcclxuICAgIH1cclxuICAgIGRlbGV0ZSBAa2V5RG93blRpbWVba2V5XVxyXG4gICAgQGtleURvd25Db3VudC0tXHJcblxyXG4gIHRpY2s6IC0+XHJcbiAgICByZXR1cm4gaWYgbm90IEByZWNvcmRpbmdcclxuICAgIEB1cGRhdGVSZWNvcmRpbmcoKVxyXG4gICAgcmV0dXJuIGlmIEBrZXlEb3duQ291bnQgPiAwXHJcbiAgICBub3cgPSB3aW5kb3cucGVyZm9ybWFuY2Uubm93KClcclxuICAgIGlmIG5vdyA+IChAbGFzdEtleUV2ZW50ICsgNDAwMClcclxuICAgICAgQHN0b3BSZWNvcmRpbmcoKVxyXG5cclxuICBnZW5lcmF0ZTogKG5vdGVzKSAtPlxyXG5cclxuICAgIG5vdGVzLnNvcnQgKGEsIGIpIC0+XHJcbiAgICAgIGEuc3RhcnQgLSBiLnN0YXJ0XHJcblxyXG4gICAgaWYgKG5vdGVzLmxlbmd0aCAlIDIpICE9IDBcclxuICAgICAgQGVycm9yIFwiT2RkIGNvdW50IG9mIG5vdGVzISBQbGVhc2UgbG9vcCB5b3VyIGJlYXQgZXhhY3RseSB0d2ljZS5cIlxyXG4gICAgICByZXR1cm5cclxuXHJcbiAgICBiZWF0ID0gXCJcIlxyXG5cclxuICAgIGJlYXRTdGFydCA9IG5vdGVzWzBdLnN0YXJ0XHJcbiAgICBub3RlQ291bnQgPSBub3Rlcy5sZW5ndGggPj4gMVxyXG4gICAgYmVhdFRpbWUgPSBub3Rlc1tub3RlQ291bnRdLnN0YXJ0IC0gYmVhdFN0YXJ0XHJcbiAgICBiZWF0ICs9IFwiIyAje25vdGVDb3VudH0gbm90ZXMsIHRvdGFsIHRpbWUgI3tiZWF0VGltZX0gc2Vjb25kc1xcblwiXHJcblxyXG4gICAgYmFzZUJQTSA9IE1hdGguZmxvb3IoMTIwMDAwIC8gYmVhdFRpbWUpXHJcbiAgICB3aGlsZSAoYmFzZUJQTSA+IDYwKVxyXG4gICAgICBiYXNlQlBNID4+PSAxXHJcbiAgICBiZWF0ICs9IFwiIyBCUE0gZ3Vlc3NlczogI3tiYXNlQlBNfSwgI3tiYXNlQlBNICogMn0sICN7YmFzZUJQTSAqIDR9XFxuXCJcclxuXHJcbiAgICBiZWF0ICs9IFwiXFxuIyBIZXJlIGlzIHlvdXIgYmVhdCBhdCB2YXJpb3VzIGxldmVscyBvZiBncmFudWxhcml0eTpcXG5cIlxyXG5cclxuICAgIGtleU5vdGVzID0ge31cclxuICAgIGZvciBub3RlSW5kZXggaW4gWzAuLi5ub3RlQ291bnRdXHJcbiAgICAgIG5vdGUgPSBub3Rlc1tub3RlSW5kZXhdXHJcbiAgICAgIGlmIG5vdCBrZXlOb3Rlcy5oYXNPd25Qcm9wZXJ0eShub3RlLmtleSlcclxuICAgICAgICBrZXlOb3Rlc1tub3RlLmtleV0gPSBbXVxyXG4gICAgICBrZXlOb3Rlc1tub3RlLmtleV0ucHVzaCB7XHJcbiAgICAgICAgc3RhcnQ6IG5vdGUuc3RhcnQgLSBiZWF0U3RhcnRcclxuICAgICAgICBsZW5ndGg6IG5vdGUuZW5kIC0gbm90ZS5zdGFydFxyXG4gICAgICB9XHJcblxyXG4gICAgcGllY2VDb3VudCA9IDhcclxuICAgIHBpZWNlVGltZSA9IDBcclxuICAgIGZvciBsb29wQ291bnQgaW4gWzAuLi4zXVxyXG4gICAgICBwaWVjZUNvdW50IDw8PSAxXHJcbiAgICAgIGNvbnNvbGUubG9nIFwidHJ5aW5nIHRvIGZpdCBpbiAje3BpZWNlQ291bnR9IHBpZWNlc1wiXHJcblxyXG4gICAgICBiZWF0ICs9IFwiXFxubG9vcCBwYXR0ZXJuI3twaWVjZUNvdW50fVxcblwiXHJcblxyXG4gICAgICBwaWVjZVRpbWUgPSBiZWF0VGltZSAvIHBpZWNlQ291bnRcclxuICAgICAgZm9yIGtleSwgbm90ZXMgb2Yga2V5Tm90ZXNcclxuICAgICAgICBjb25zb2xlLmxvZyBcIiogZml0dGluZyBrZXkgI3trZXl9XCJcclxuICAgICAgICBwaWVjZVNlZW4gPSBbXVxyXG4gICAgICAgIGZvciBpIGluIFswLi4ucGllY2VDb3VudF1cclxuICAgICAgICAgIHBpZWNlU2VlbltpXSA9IGZhbHNlXHJcblxyXG4gICAgICAgIGZvciBub3RlIGluIG5vdGVzXHJcbiAgICAgICAgICBwaWVjZUluZGV4ID0gTWF0aC5mbG9vcigobm90ZS5zdGFydCArIChwaWVjZVRpbWUgLyAyKSkgLyBwaWVjZVRpbWUpXHJcbiAgICAgICAgICBjb25zb2xlLmxvZyBcInBpZWNlIGluZGV4IGZvciAje25vdGUuc3RhcnR9IGlzICN7cGllY2VJbmRleH1cIlxyXG4gICAgICAgICAgaWYgcGllY2VTZWVuW3BpZWNlSW5kZXhdXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nIFwiYWxyZWFkeSBzYXcgaW5kZXggI3twaWVjZUluZGV4fSBmb3Iga2V5ICN7a2V5fSwgZG91YmxpbmcgcGllY2VDb3VudFwiXHJcbiAgICAgICAgICAgIGxvb3BDb3VudCA9IDBcclxuICAgICAgICAgICAgY29udGludWVcclxuXHJcbiAgICAgIGZvciBrZXksIG5vdGVzIG9mIGtleU5vdGVzXHJcbiAgICAgICAgY29uc29sZS5sb2cgXCIqIHJlbmRlcmluZyBrZXkgI3trZXl9XCJcclxuICAgICAgICBwaWVjZXMgPSBbXVxyXG4gICAgICAgIGZvciBpIGluIFswLi4ucGllY2VDb3VudF1cclxuICAgICAgICAgIHBpZWNlc1tpXSA9IFwiLlwiXHJcblxyXG4gICAgICAgIGZvciBub3RlIGluIG5vdGVzXHJcbiAgICAgICAgICBwaWVjZUluZGV4ID0gTWF0aC5mbG9vcigobm90ZS5zdGFydCArIChwaWVjZVRpbWUgLyAyKSkgLyBwaWVjZVRpbWUpXHJcbiAgICAgICAgICBjb25zb2xlLmxvZyBcInBpZWNlIGluZGV4IGZvciAje25vdGUuc3RhcnR9IGlzICN7cGllY2VJbmRleH1cIlxyXG4gICAgICAgICAgcGllY2VzW3BpZWNlSW5kZXhdID0gXCJ4XCJcclxuXHJcbiAgICAgICAgYmVhdCArPSBcIiAgcGF0dGVybiAje2tleX0gXCIgKyBwaWVjZXMuam9pbihcIlwiKSArIFwiXFxuXCJcclxuXHJcbiAgICBjb25zb2xlLmxvZyBrZXlOb3Rlc1xyXG5cclxuICAgIEBzZXRPdXRwdXRUZXh0KGJlYXQpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBtYWluXHJcblxyXG5tYWluID0gLT5cclxuICBiZWF0bWFrZXIgPSBuZXcgQmVhdE1ha2VyXHJcblxyXG4gICQoJyNiZWF0aW5wdXQnKS5rZXlkb3duIChldmVudCkgLT5cclxuICAgIGtleUNvZGUgPSBwYXJzZUludChldmVudC5rZXlDb2RlKVxyXG4gICAgaWYgKGtleUNvZGUgPCA2NSkgb3IgKGtleUNvZGUgPiA5MClcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAga2V5ID0gU3RyaW5nLmZyb21DaGFyQ29kZShldmVudC5rZXlDb2RlKVxyXG4gICAgbm93ID0gd2luZG93LnBlcmZvcm1hbmNlLm5vdygpXHJcbiAgICBiZWF0bWFrZXIua2V5RG93bihrZXksIG5vdylcclxuXHJcbiAgJCgnI2JlYXRpbnB1dCcpLmtleXVwIChldmVudCkgLT5cclxuICAgIGtleUNvZGUgPSBwYXJzZUludChldmVudC5rZXlDb2RlKVxyXG4gICAgaWYgKGtleUNvZGUgPCA2NSkgb3IgKGtleUNvZGUgPiA5MClcclxuICAgICAgcmV0dXJuXHJcblxyXG4gICAga2V5ID0gU3RyaW5nLmZyb21DaGFyQ29kZShldmVudC5rZXlDb2RlKVxyXG4gICAgbm93ID0gd2luZG93LnBlcmZvcm1hbmNlLm5vdygpXHJcbiAgICBiZWF0bWFrZXIua2V5VXAoa2V5LCBub3cpXHJcblxyXG4gIHNldEludGVydmFsKCAtPlxyXG4gICAgYmVhdG1ha2VyLnRpY2soKVxyXG4gICwgMjUwKTtcclxuXHJcbm1haW4oKVxyXG5tb2R1bGUuZXhwb3J0cyA9XHJcbiAgbGVsOiBcInBsYXl6XCJcclxuIiwibW9kdWxlLmV4cG9ydHMgPVxyXG5cclxuICBmaXJzdDogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgWW91ciBmaXJzdCBMb29wU2NyaXB0LiBDbGljayBcIkNvbXBpbGVcIiBiZWxvdyB0byBzdGFydCFcclxuXHJcbnRvbmUgbm90ZTFcclxuICBkdXJhdGlvbiAyNTBcclxuICBvY3RhdmUgNFxyXG4gIG5vdGUgQ1xyXG5cclxudG9uZSBiYXNzMVxyXG4gIGR1cmF0aW9uIDI1MFxyXG4gIG9jdGF2ZSAxXHJcbiAgbm90ZSBCXHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBub3RlMSB4Li4uLi4uLnguLi4uLi4uXHJcbiAgcGF0dGVybiBiYXNzMSAuLi4ueC4uLi4uLi54Li4uXHJcblxyXG5cIlwiXCJcclxuXHJcbiAgbm90ZXM6IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIE5vdGUgb3ZlcnJpZGVzIVxyXG5cclxuIyBILUwgYXJlIHRoZSBibGFjayBrZXlzOlxyXG4jICAgICBIIEkgICBKIEsgTFxyXG4jICAgIEMgRCBFIEYgRyBBIEJcclxuXHJcbiMgVHJ5IHNldHRpbmcgdGhlIGR1cmF0aW9uIHRvIDEwMFxyXG50b25lIG5vdGUxXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgZHVyYXRpb24gMjUwXHJcblxyXG4jIFNhbXBsZXMgY2FuIGhhdmUgdGhlaXIgbm90ZXMgb3ZlcnJpZGRlbiB0b28hXHJcbnNhbXBsZSBkaW5nXHJcbiAgc3JjIHNhbXBsZXMvZGluZ19lLndhdlxyXG4gIHNyY25vdGUgZVxyXG5cclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gbm90ZTEgYi5hLmcuYS5iLmIuYi4uLlxyXG5cclxubG9vcCBsb29wMlxyXG4gIHBhdHRlcm4gZGluZyBiLmEuZy5hLmIuYi5iLi4uXHJcblxyXG50cmFjayBzb25nXHJcbiAgcGF0dGVybiBsb29wMSB4XHJcbiAgcGF0dGVybiBsb29wMiAueFxyXG5cclxuXCJcIlwiXHJcblxyXG4gIG1vdHRvOiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBBbiBhcHByb3hpbWF0aW9uIG9mIHRoZSBiZWF0IGZyb20gRHJha2UncyBcIlRoZSBNb3R0b1wiXHJcblxyXG5icG0gMTAwXHJcbnNlY3Rpb24gIyB0byBzaGFyZSBBRFNSXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgdG9uZSBiYXNzMSAtPiBvY3RhdmUgMVxyXG4gIHRvbmUgYmFzczIgLT4gb2N0YXZlIDJcclxuXHJcbnNhbXBsZSBjbGFwICAtPiBzcmMgc2FtcGxlcy9jbGFwLndhdlxyXG5zYW1wbGUgc25hcmUgLT4gc3JjIHNhbXBsZXMvc25hcmUud2F2XHJcbnNhbXBsZSBoaWhhdCAtPiBzcmMgc2FtcGxlcy9oaWhhdC53YXZcclxuXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIGhpaGF0IC4ueC4uLi4uLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uXHJcbiAgcGF0dGVybiBjbGFwICAuLi4ueC4uLi4uLi54Li4uLi4uLnguLi4uLi4ueC4uLlxyXG4gIHBhdHRlcm4gc25hcmUgLi4uLi4ueC4uLnguLi54LnguLi4uLi4uLi4uLi4uLi5cclxuICBwYXR0ZXJuIGJhc3MxIEJiYmJiYi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uXHJcbiAgcGF0dGVybiBiYXNzMiAuLi4uLi5IaGhoaGhEZGRkZGQuLi4uSGhoaEpqLkpqLlxyXG5cclxudHJhY2sgc29uZ1xyXG4gIHBhdHRlcm4gbG9vcDEgeHh4eFxyXG5cclxuXCJcIlwiXHJcblxyXG4gIGxlbmd0aDogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgU2hvd2luZyBvZmYgdmFyaW91cyBub3RlIGxlbmd0aHMgdXNpbmcgY2FwcyBhbmQgbG93ZXJjYXNlXHJcbiMgQWxzbyBzaG93cyB3aGF0IEFEU1IgY2FuIGRvIVxyXG5cclxudG9uZSBub3RlMVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG5cclxudG9uZSBub3RlMlxyXG4gICMgTm90ZTogT25seSB0aGUgZmlyc3QgdG9uZSBoYXMgQURTUlxyXG5cclxuIyBJZiB5b3UgdXNlIGFueSBsZXR0ZXJzIG90aGVyIHRoYW4gXCJ4XCIgb24gYSB0b25lIHBhdHRlcm4sIHlvdSBvdmVycmlkZSBpdHNcclxuIyBub3RlIHdpdGggdGhlIG5vdGUgbGlzdGVkLiBBbHNvLCBpZiB5b3UgdXNlIGFueSBjYXBpdGFsIGxldHRlcnMgaW4gYSBwYXR0ZXJuLFxyXG4jIHlvdSBvdmVycmlkZSB0aGUgbGVuZ3RoIG9mIHRoYXQgbm90ZSB3aXRoIHRoZSBudW1iZXIgb2YgbWF0Y2hpbmcgbG93ZXJjYXNlXHJcbiMgbGV0dGVycyBmb2xsb3dpbmcgaXQuXHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBub3RlMSBHZ2dnZ2dnZ0ZmZmZmZi4uQWFhYUJiYi5DYy4uRC4uLlxyXG5cclxubG9vcCBsb29wMlxyXG4gIHBhdHRlcm4gbm90ZTIgR2dnZ2dnZ2dGZmZmZmYuLkFhYWFCYmIuQ2MuLkQuLi5cclxuXHJcbnRyYWNrIHNvbmdcclxuICBwYXR0ZXJuIGxvb3AxIHguXHJcbiAgcGF0dGVybiBsb29wMiAueFxyXG5cclxuXCJcIlwiXHJcblxyXG4gIGNob2NvYm86IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFRoZSBDaG9jb2JvIFRoZW1lIChmaXJzdCBwYXJ0IG9ubHkpXHJcblxyXG5icG0gMTI1XHJcblxyXG5zZWN0aW9uIFRvbmUgKGluIGEgc2VjdGlvbiB0byBzaGFyZSBBRFNSKVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG4gIHRvbmUgY2hvY29ibzFcclxuICAgIG9jdGF2ZSA1XHJcbiAgdG9uZSBjaG9jb2JvMlxyXG4gICAgb2N0YXZlIDRcclxuXHJcbmxvb3AgbG9vcDFcclxuIHBhdHRlcm4gY2hvY29ibzEgRGRkZC4uLi4uLkRkLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uRC5FLkZmZmZmZi4uLlxyXG4gcGF0dGVybiBjaG9jb2JvMiAuLi4uQmJHZ0VlLi5CYkdnQmIuLkdnLi5CYmJiYmIuQWFHZ0dBRy5GLkdnZ2dnZy5GLkdnR0IuLi4uLi4uLi4uLi4uXHJcblxyXG50cmFjayBzb25nXHJcbiAgcGF0dGVybiBsb29wMSB4eFxyXG5cIlwiXCJcclxuXHJcbiAga2ljazogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQmFzcyBraWNrIChtaXhpbmcgYSBzaW1wbGUga2ljayB3aXRoIGEgc3VzdGFpbmVkIGJhc3Mgc2luZSlcclxuIyBUcnkgY2hhbmdpbmcgJ2ZyZXEnIHRvIGFueXdoZXJlIGluIDU1LTgwLCBhbmQvb3IgJ2R1cmF0aW9uJ1xyXG5cclxudG9uZSBub3RlMVxyXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxyXG4gIGZyZXEgNjBcclxuICBkdXJhdGlvbiAxNTAwXHJcblxyXG5zYW1wbGUga2lja1xyXG4gIHNyYyBzYW1wbGVzL2tpY2szLndhdlxyXG5cclxudHJhY2sgQmFzc0tpY2tcclxuICBwYXR0ZXJuIG5vdGUxIHhcclxuICBwYXR0ZXJuIGtpY2sgIHhcclxuXHJcblwiXCJcIlxyXG5cclxuICBraWNrcGF0dGVybjogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgU2ltcGxlIGtpY2sgcGF0dGVyblxyXG5cclxuYnBtIDkwXHJcblxyXG50b25lIG5vdGUxXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgb2N0YXZlIDFcclxuICBkdXJhdGlvbiAxNTAwXHJcblxyXG5zYW1wbGUga2lja1xyXG4gIHNyYyBzYW1wbGVzL2tpY2szLndhdlxyXG5cclxuc2FtcGxlIGNsYXBcclxuICBzcmMgc2FtcGxlcy9jbGFwLndhdlxyXG5cclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gY2xhcCAgLi4uLnguLi4uLi4ueC4uLlxyXG4gIHBhdHRlcm4gbm90ZTEgYi5iLi4uYi5iLmIuLi4uLlxyXG4gIHBhdHRlcm4ga2ljayAgeC54Li4ueC54LnguLi4uLlxyXG5cclxudHJhY2sgZGVycFxyXG4gIHBhdHRlcm4gbG9vcDEgeHh4eFxyXG5cclxuXCJcIlwiXHJcblxyXG4gIHdpZ2dsZTogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgQSBzaWxseSBhcHByb3hpbWF0aW9uIG9mIEphc29uIERlcnVsbydzIFdpZ2dsZVxyXG5cclxuYnBtIDgyXHJcblxyXG50b25lIGJhc3NcclxuICBhZHNyIDAuMDA1IDAuMDUgMC43IDAuMDVcclxuICBkdXJhdGlvbiAxNTAwXHJcbiAgb2N0YXZlIDJcclxuXHJcbnNhbXBsZSBraWNrXHJcbiAgc3JjIHNhbXBsZXMva2ljazMud2F2XHJcblxyXG5zYW1wbGUgc25hcFxyXG4gIHZvbHVtZSAwLjVcclxuICBzcmMgc2FtcGxlcy9zbmFwLndhdlxyXG5cclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gc25hcCAuLi4ueC4uLi4uLi54Li4uXHJcbiAgcGF0dGVybiBraWNrIHguLnguLnguLi4uLi4uLi5cclxuICBwYXR0ZXJuIGJhc3MgYS4uZi4uZS4uLi4uLi4uLlxyXG5cclxudHJhY2sgd2lnZ2xlXHJcbiAgcGF0dGVybiBsb29wMSB4eHh4XHJcblwiXCJcIlxyXG5cclxuICBiZWF0bWFrZXI6IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEJlYXRNYWtlciBUZXN0IEJlZFxyXG5cclxuc2FtcGxlIEsgLT4gc3JjIHNhbXBsZXMva2ljazMud2F2XHJcbnNhbXBsZSBDIC0+IHNyYyBzYW1wbGVzL2NsYXAud2F2XHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIFVwZGF0ZSB0aGUgcGF0dGVybiBsaW5lcyBhbmQgQlBNIGhlcmUgd2l0aCBCZWF0TWFrZXIgZGF0YS5cclxuXHJcbmJwbSA5MFxyXG5cclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gQyAuLi4ueC4uLi4uLi54Li4uXHJcbiAgcGF0dGVybiBLIHgueC4uLngueC54Li4uLi5cclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG50cmFjayBkZXJwXHJcbiAgcGF0dGVybiBsb29wMSB4eHh4XHJcblxyXG5cIlwiXCIiLCJmcmVxVGFibGUgPSBbXG4gIHsgIyBPY3RhdmUgMFxuXG4gICAgXCJhXCI6IDI3LjUwMDBcbiAgICBcImxcIjogMjkuMTM1M1xuICAgIFwiYlwiOiAzMC44Njc3XG4gIH1cblxuICB7ICMgT2N0YXZlIDFcbiAgICBcImNcIjogMzIuNzAzMlxuICAgIFwiaFwiOiAzNC42NDc5XG4gICAgXCJkXCI6IDM2LjcwODFcbiAgICBcImlcIjogMzguODkwOVxuICAgIFwiZVwiOiA0MS4yMDM1XG4gICAgXCJmXCI6IDQzLjY1MzZcbiAgICBcImpcIjogNDYuMjQ5M1xuICAgIFwiZ1wiOiA0OC45OTk1XG4gICAgXCJrXCI6IDUxLjkxMzBcbiAgICBcImFcIjogNTUuMDAwMFxuICAgIFwibFwiOiA1OC4yNzA1XG4gICAgXCJiXCI6IDYxLjczNTRcbiAgfVxuXG4gIHsgIyBPY3RhdmUgMlxuICAgIFwiY1wiOiA2NS40MDY0XG4gICAgXCJoXCI6IDY5LjI5NTdcbiAgICBcImRcIjogNzMuNDE2MlxuICAgIFwiaVwiOiA3Ny43ODE3XG4gICAgXCJlXCI6IDgyLjQwNjlcbiAgICBcImZcIjogODcuMzA3MVxuICAgIFwialwiOiA5Mi40OTg2XG4gICAgXCJnXCI6IDk3Ljk5ODlcbiAgICBcImtcIjogMTAzLjgyNlxuICAgIFwiYVwiOiAxMTAuMDAwXG4gICAgXCJsXCI6IDExNi41NDFcbiAgICBcImJcIjogMTIzLjQ3MVxuICB9XG5cbiAgeyAjIE9jdGF2ZSAzXG4gICAgXCJjXCI6IDEzMC44MTNcbiAgICBcImhcIjogMTM4LjU5MVxuICAgIFwiZFwiOiAxNDYuODMyXG4gICAgXCJpXCI6IDE1NS41NjNcbiAgICBcImVcIjogMTY0LjgxNFxuICAgIFwiZlwiOiAxNzQuNjE0XG4gICAgXCJqXCI6IDE4NC45OTdcbiAgICBcImdcIjogMTk1Ljk5OFxuICAgIFwia1wiOiAyMDcuNjUyXG4gICAgXCJhXCI6IDIyMC4wMDBcbiAgICBcImxcIjogMjMzLjA4MlxuICAgIFwiYlwiOiAyNDYuOTQyXG4gIH1cblxuICB7ICMgT2N0YXZlIDRcbiAgICBcImNcIjogMjYxLjYyNlxuICAgIFwiaFwiOiAyNzcuMTgzXG4gICAgXCJkXCI6IDI5My42NjVcbiAgICBcImlcIjogMzExLjEyN1xuICAgIFwiZVwiOiAzMjkuNjI4XG4gICAgXCJmXCI6IDM0OS4yMjhcbiAgICBcImpcIjogMzY5Ljk5NFxuICAgIFwiZ1wiOiAzOTEuOTk1XG4gICAgXCJrXCI6IDQxNS4zMDVcbiAgICBcImFcIjogNDQwLjAwMFxuICAgIFwibFwiOiA0NjYuMTY0XG4gICAgXCJiXCI6IDQ5My44ODNcbiAgfVxuXG4gIHsgIyBPY3RhdmUgNVxuICAgIFwiY1wiOiA1MjMuMjUxXG4gICAgXCJoXCI6IDU1NC4zNjVcbiAgICBcImRcIjogNTg3LjMzMFxuICAgIFwiaVwiOiA2MjIuMjU0XG4gICAgXCJlXCI6IDY1OS4yNTVcbiAgICBcImZcIjogNjk4LjQ1NlxuICAgIFwialwiOiA3MzkuOTg5XG4gICAgXCJnXCI6IDc4My45OTFcbiAgICBcImtcIjogODMwLjYwOVxuICAgIFwiYVwiOiA4ODAuMDAwXG4gICAgXCJsXCI6IDkzMi4zMjhcbiAgICBcImJcIjogOTg3Ljc2N1xuICB9XG5cbiAgeyAjIE9jdGF2ZSA2XG4gICAgXCJjXCI6IDEwNDYuNTBcbiAgICBcImhcIjogMTEwOC43M1xuICAgIFwiZFwiOiAxMTc0LjY2XG4gICAgXCJpXCI6IDEyNDQuNTFcbiAgICBcImVcIjogMTMxOC41MVxuICAgIFwiZlwiOiAxMzk2LjkxXG4gICAgXCJqXCI6IDE0NzkuOThcbiAgICBcImdcIjogMTU2Ny45OFxuICAgIFwia1wiOiAxNjYxLjIyXG4gICAgXCJhXCI6IDE3NjAuMDBcbiAgICBcImxcIjogMTg2NC42NlxuICAgIFwiYlwiOiAxOTc1LjUzXG4gIH1cblxuICB7ICMgT2N0YXZlIDdcbiAgICBcImNcIjogMjA5My4wMFxuICAgIFwiaFwiOiAyMjE3LjQ2XG4gICAgXCJkXCI6IDIzNDkuMzJcbiAgICBcImlcIjogMjQ4OS4wMlxuICAgIFwiZVwiOiAyNjM3LjAyXG4gICAgXCJmXCI6IDI3OTMuODNcbiAgICBcImpcIjogMjk1OS45NlxuICAgIFwiZ1wiOiAzMTM1Ljk2XG4gICAgXCJrXCI6IDMzMjIuNDRcbiAgICBcImFcIjogMzUyMC4wMFxuICAgIFwibFwiOiAzNzI5LjMxXG4gICAgXCJiXCI6IDM5NTEuMDdcbiAgfVxuXG4gIHsgIyBPY3RhdmUgOFxuICAgIFwiY1wiOiA0MTg2LjAxXG4gIH1cbl1cblxubGVnYWxOb3RlUmVnZXggPSAvW2EtbF0vXG5cbmZpbmRGcmVxID0gKG9jdGF2ZSwgbm90ZSkgLT5cbiAgbm90ZSA9IG5vdGUudG9Mb3dlckNhc2UoKVxuICBpZiAob2N0YXZlID49IDApIGFuZCAob2N0YXZlIDwgZnJlcVRhYmxlLmxlbmd0aCkgYW5kIGxlZ2FsTm90ZVJlZ2V4LnRlc3Qobm90ZSlcbiAgICBvY3RhdmVUYWJsZSA9IGZyZXFUYWJsZVtvY3RhdmVdXG4gICAgaWYgb2N0YXZlVGFibGU/IGFuZCBvY3RhdmVUYWJsZVtub3RlXT9cbiAgICAgIHJldHVybiBvY3RhdmVUYWJsZVtub3RlXVxuICByZXR1cm4gNDQwLjBcblxubW9kdWxlLmV4cG9ydHMgPVxuICBmcmVxVGFibGU6IGZyZXFUYWJsZVxuICBmaW5kRnJlcTogZmluZEZyZXFcbiIsIiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBJbXBvcnRzXG5cbntmaW5kRnJlcX0gPSByZXF1aXJlICcuL2ZyZXEnXG5yaWZmd2F2ZSAgID0gcmVxdWlyZSBcIi4vcmlmZndhdmVcIlxuakRhdGFWaWV3ICA9IHJlcXVpcmUgJy4uL2pzL2pkYXRhdmlldydcbmZzICAgICAgICAgPSByZXF1aXJlICdmcydcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIEhlbHBlciBmdW5jdGlvbnNcblxubG9nRGVidWcgPSAoYXJncy4uLikgLT5cbiAgIyBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmdzKVxuXG5jbG9uZSA9IChvYmopIC0+XG4gIGlmIG5vdCBvYmo/IG9yIHR5cGVvZiBvYmogaXNudCAnb2JqZWN0J1xuICAgIHJldHVybiBvYmpcblxuICBpZiBvYmogaW5zdGFuY2VvZiBEYXRlXG4gICAgcmV0dXJuIG5ldyBEYXRlKG9iai5nZXRUaW1lKCkpXG5cbiAgaWYgb2JqIGluc3RhbmNlb2YgUmVnRXhwXG4gICAgZmxhZ3MgPSAnJ1xuICAgIGZsYWdzICs9ICdnJyBpZiBvYmouZ2xvYmFsP1xuICAgIGZsYWdzICs9ICdpJyBpZiBvYmouaWdub3JlQ2FzZT9cbiAgICBmbGFncyArPSAnbScgaWYgb2JqLm11bHRpbGluZT9cbiAgICBmbGFncyArPSAneScgaWYgb2JqLnN0aWNreT9cbiAgICByZXR1cm4gbmV3IFJlZ0V4cChvYmouc291cmNlLCBmbGFncylcblxuICBuZXdJbnN0YW5jZSA9IG5ldyBvYmouY29uc3RydWN0b3IoKVxuXG4gIGZvciBrZXkgb2Ygb2JqXG4gICAgbmV3SW5zdGFuY2Vba2V5XSA9IGNsb25lIG9ialtrZXldXG5cbiAgcmV0dXJuIG5ld0luc3RhbmNlXG5cbnBhcnNlQm9vbCA9ICh2KSAtPlxuICBzd2l0Y2ggU3RyaW5nKHYpXG4gICAgd2hlbiBcInRydWVcIiB0aGVuIHRydWVcbiAgICB3aGVuIFwieWVzXCIgdGhlbiB0cnVlXG4gICAgd2hlbiBcIm9uXCIgdGhlbiB0cnVlXG4gICAgd2hlbiBcIjFcIiB0aGVuIHRydWVcbiAgICBlbHNlIGZhbHNlXG5cbmNvdW50SW5kZW50ID0gKHRleHQpIC0+XG4gIGluZGVudCA9IDBcbiAgZm9yIGkgaW4gWzAuLi50ZXh0Lmxlbmd0aF1cbiAgICBpZiB0ZXh0W2ldID09ICdcXHQnXG4gICAgICBpbmRlbnQgKz0gOFxuICAgIGVsc2VcbiAgICAgIGluZGVudCsrXG4gIHJldHVybiBpbmRlbnRcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIEJpdG1hcCBjb2RlIG9yaWdpbmFsbHkgZnJvbSBodHRwOi8vbXJjb2xlcy5jb20vbG93LXJlcy1wYWludC8gKE1JVCBsaWNlbnNlZClcblxuX2FzTGl0dGxlRW5kaWFuSGV4ID0gKHZhbHVlLCBieXRlcykgLT5cbiAgIyBDb252ZXJ0IHZhbHVlIGludG8gbGl0dGxlIGVuZGlhbiBoZXggYnl0ZXNcbiAgIyB2YWx1ZSAtIHRoZSBudW1iZXIgYXMgYSBkZWNpbWFsIGludGVnZXIgKHJlcHJlc2VudGluZyBieXRlcylcbiAgIyBieXRlcyAtIHRoZSBudW1iZXIgb2YgYnl0ZXMgdGhhdCB0aGlzIHZhbHVlIHRha2VzIHVwIGluIGEgc3RyaW5nXG5cbiAgIyBFeGFtcGxlOlxuICAjIF9hc0xpdHRsZUVuZGlhbkhleCgyODM1LCA0KVxuICAjID4gJ1xceDEzXFx4MGJcXHgwMFxceDAwJ1xuXG4gIHJlc3VsdCA9IFtdXG5cbiAgd2hpbGUgYnl0ZXMgPiAwXG4gICAgcmVzdWx0LnB1c2goU3RyaW5nLmZyb21DaGFyQ29kZSh2YWx1ZSAmIDI1NSkpXG4gICAgdmFsdWUgPj49IDhcbiAgICBieXRlcy0tXG5cbiAgcmV0dXJuIHJlc3VsdC5qb2luKCcnKVxuXG5fY29sbGFwc2VEYXRhID0gKHJvd3MsIHJvd19wYWRkaW5nKSAtPlxuICAjIENvbnZlcnQgcm93cyBvZiBSR0IgYXJyYXlzIGludG8gQk1QIGRhdGFcbiAgcm93c19sZW4gPSByb3dzLmxlbmd0aFxuICBwaXhlbHNfbGVuID0gaWYgcm93c19sZW4gdGhlbiByb3dzWzBdLmxlbmd0aCBlbHNlIDBcbiAgcGFkZGluZyA9ICcnXG4gIHJlc3VsdCA9IFtdXG5cbiAgd2hpbGUgcm93X3BhZGRpbmcgPiAwXG4gICAgcGFkZGluZyArPSAnXFx4MDAnXG4gICAgcm93X3BhZGRpbmctLVxuXG4gIGZvciBpIGluIFswLi4ucm93c19sZW5dXG4gICAgZm9yIGogaW4gWzAuLi5waXhlbHNfbGVuXVxuICAgICAgcGl4ZWwgPSByb3dzW2ldW2pdXG4gICAgICByZXN1bHQucHVzaChTdHJpbmcuZnJvbUNoYXJDb2RlKHBpeGVsWzJdKSArXG4gICAgICAgICAgICAgICAgICBTdHJpbmcuZnJvbUNoYXJDb2RlKHBpeGVsWzFdKSArXG4gICAgICAgICAgICAgICAgICBTdHJpbmcuZnJvbUNoYXJDb2RlKHBpeGVsWzBdKSlcblxuICAgIHJlc3VsdC5wdXNoKHBhZGRpbmcpXG5cbiAgcmV0dXJuIHJlc3VsdC5qb2luKCcnKVxuXG5fc2NhbGVSb3dzID0gKHJvd3MsIHNjYWxlKSAtPlxuICAjIFNpbXBsZXN0IHNjYWxpbmcgcG9zc2libGVcbiAgcmVhbF93ID0gcm93cy5sZW5ndGhcbiAgc2NhbGVkX3cgPSBwYXJzZUludChyZWFsX3cgKiBzY2FsZSlcbiAgcmVhbF9oID0gaWYgcmVhbF93IHRoZW4gcm93c1swXS5sZW5ndGggZWxzZSAwXG4gIHNjYWxlZF9oID0gcGFyc2VJbnQocmVhbF9oICogc2NhbGUpXG4gIG5ld19yb3dzID0gW11cblxuICBmb3IgeSBpbiBbMC4uLnNjYWxlZF9oXVxuICAgIG5ld19yb3dzLnB1c2gobmV3X3JvdyA9IFtdKVxuICAgIGZvciB4IGluIFswLi4uc2NhbGVkX3ddXG4gICAgICBuZXdfcm93LnB1c2gocm93c1twYXJzZUludCh5L3NjYWxlKV1bcGFyc2VJbnQoeC9zY2FsZSldKVxuXG4gIHJldHVybiBuZXdfcm93c1xuXG5nZW5lcmF0ZUJpdG1hcERhdGFVUkwgPSAocm93cywgc2NhbGUpIC0+XG4gICMgRXhwZWN0cyByb3dzIHN0YXJ0aW5nIGluIGJvdHRvbSBsZWZ0XG4gICMgZm9ybWF0dGVkIGxpa2UgdGhpczogW1tbMjU1LCAwLCAwXSwgWzI1NSwgMjU1LCAwXSwgLi4uXSwgLi4uXVxuICAjIHdoaWNoIHJlcHJlc2VudHM6IFtbcmVkLCB5ZWxsb3csIC4uLl0sIC4uLl1cblxuICBpZiAhYnRvYVxuICAgIHJldHVybiBmYWxzZVxuXG4gIHNjYWxlID0gc2NhbGUgfHwgMVxuICBpZiAoc2NhbGUgIT0gMSlcbiAgICByb3dzID0gX3NjYWxlUm93cyhyb3dzLCBzY2FsZSlcblxuICBoZWlnaHQgPSByb3dzLmxlbmd0aCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIyB0aGUgbnVtYmVyIG9mIHJvd3NcbiAgd2lkdGggPSBpZiBoZWlnaHQgdGhlbiByb3dzWzBdLmxlbmd0aCBlbHNlIDAgICAgICAgICMgdGhlIG51bWJlciBvZiBjb2x1bW5zIHBlciByb3dcbiAgcm93X3BhZGRpbmcgPSAoNCAtICh3aWR0aCAqIDMpICUgNCkgJSA0ICAgICAgICAgICAgICMgcGFkIGVhY2ggcm93IHRvIGEgbXVsdGlwbGUgb2YgNCBieXRlc1xuICBudW1fZGF0YV9ieXRlcyA9ICh3aWR0aCAqIDMgKyByb3dfcGFkZGluZykgKiBoZWlnaHQgIyBzaXplIGluIGJ5dGVzIG9mIEJNUCBkYXRhXG4gIG51bV9maWxlX2J5dGVzID0gNTQgKyBudW1fZGF0YV9ieXRlcyAgICAgICAgICAgICAgICAjIGZ1bGwgaGVhZGVyIHNpemUgKG9mZnNldCkgKyBzaXplIG9mIGRhdGFcblxuICBoZWlnaHQgPSBfYXNMaXR0bGVFbmRpYW5IZXgoaGVpZ2h0LCA0KVxuICB3aWR0aCA9IF9hc0xpdHRsZUVuZGlhbkhleCh3aWR0aCwgNClcbiAgbnVtX2RhdGFfYnl0ZXMgPSBfYXNMaXR0bGVFbmRpYW5IZXgobnVtX2RhdGFfYnl0ZXMsIDQpXG4gIG51bV9maWxlX2J5dGVzID0gX2FzTGl0dGxlRW5kaWFuSGV4KG51bV9maWxlX2J5dGVzLCA0KVxuXG4gICMgdGhlc2UgYXJlIHRoZSBhY3R1YWwgYnl0ZXMgb2YgdGhlIGZpbGUuLi5cblxuICBmaWxlID0gJ0JNJyArICAgICAgICAgICAgICAgICMgXCJNYWdpYyBOdW1iZXJcIlxuICAgICAgICAgIG51bV9maWxlX2J5dGVzICsgICAgICMgc2l6ZSBvZiB0aGUgZmlsZSAoYnl0ZXMpKlxuICAgICAgICAgICdcXHgwMFxceDAwJyArICAgICAgICAgIyByZXNlcnZlZFxuICAgICAgICAgICdcXHgwMFxceDAwJyArICAgICAgICAgIyByZXNlcnZlZFxuICAgICAgICAgICdcXHgzNlxceDAwXFx4MDBcXHgwMCcgKyAjIG9mZnNldCBvZiB3aGVyZSBCTVAgZGF0YSBsaXZlcyAoNTQgYnl0ZXMpXG4gICAgICAgICAgJ1xceDI4XFx4MDBcXHgwMFxceDAwJyArICMgbnVtYmVyIG9mIHJlbWFpbmluZyBieXRlcyBpbiBoZWFkZXIgZnJvbSBoZXJlICg0MCBieXRlcylcbiAgICAgICAgICB3aWR0aCArICAgICAgICAgICAgICAjIHRoZSB3aWR0aCBvZiB0aGUgYml0bWFwIGluIHBpeGVscypcbiAgICAgICAgICBoZWlnaHQgKyAgICAgICAgICAgICAjIHRoZSBoZWlnaHQgb2YgdGhlIGJpdG1hcCBpbiBwaXhlbHMqXG4gICAgICAgICAgJ1xceDAxXFx4MDAnICsgICAgICAgICAjIHRoZSBudW1iZXIgb2YgY29sb3IgcGxhbmVzICgxKVxuICAgICAgICAgICdcXHgxOFxceDAwJyArICAgICAgICAgIyAyNCBiaXRzIC8gcGl4ZWxcbiAgICAgICAgICAnXFx4MDBcXHgwMFxceDAwXFx4MDAnICsgIyBObyBjb21wcmVzc2lvbiAoMClcbiAgICAgICAgICBudW1fZGF0YV9ieXRlcyArICAgICAjIHNpemUgb2YgdGhlIEJNUCBkYXRhIChieXRlcykqXG4gICAgICAgICAgJ1xceDEzXFx4MEJcXHgwMFxceDAwJyArICMgMjgzNSBwaXhlbHMvbWV0ZXIgLSBob3Jpem9udGFsIHJlc29sdXRpb25cbiAgICAgICAgICAnXFx4MTNcXHgwQlxceDAwXFx4MDAnICsgIyAyODM1IHBpeGVscy9tZXRlciAtIHRoZSB2ZXJ0aWNhbCByZXNvbHV0aW9uXG4gICAgICAgICAgJ1xceDAwXFx4MDBcXHgwMFxceDAwJyArICMgTnVtYmVyIG9mIGNvbG9ycyBpbiB0aGUgcGFsZXR0ZSAoa2VlcCAwIGZvciAyNC1iaXQpXG4gICAgICAgICAgJ1xceDAwXFx4MDBcXHgwMFxceDAwJyArICMgMCBpbXBvcnRhbnQgY29sb3JzIChtZWFucyBhbGwgY29sb3JzIGFyZSBpbXBvcnRhbnQpXG4gICAgICAgICAgX2NvbGxhcHNlRGF0YShyb3dzLCByb3dfcGFkZGluZylcblxuICByZXR1cm4gJ2RhdGE6aW1hZ2UvYm1wO2Jhc2U2NCwnICsgYnRvYShmaWxlKVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgUGFyc2VyXG5cbmNsYXNzIFBhcnNlclxuICBjb25zdHJ1Y3RvcjogKEBsb2cpIC0+XG4gICAgQGNvbW1lbnRSZWdleCA9IC9eKFteI10qPykoXFxzKiMuKik/JC9cbiAgICBAb25seVdoaXRlc3BhY2VSZWdleCA9IC9eXFxzKiQvXG4gICAgQGluZGVudFJlZ2V4ID0gL14oXFxzKikoXFxTLiopJC9cbiAgICBAbGVhZGluZ1VuZGVyc2NvcmVSZWdleCA9IC9eXy9cbiAgICBAaGFzQ2FwaXRhbExldHRlcnNSZWdleCA9IC9bQS1aXS9cbiAgICBAaXNOb3RlUmVnZXggPSAvW0EtTGEtbF0vXG5cbiAgICAjIEgtTCBhcmUgdGhlIGJsYWNrIGtleXM6XG4gICAgIyAgSCBJICAgSiBLIExcbiAgICAjIEMgRCBFIEYgRyBBIEJcblxuICAgIEBuYW1lZFN0YXRlcyA9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBzcmNvY3RhdmU6IDRcbiAgICAgICAgc3Jjbm90ZTogJ2EnXG4gICAgICAgIG9jdGF2ZTogNFxuICAgICAgICBub3RlOiAnYSdcbiAgICAgICAgd2F2ZTogJ3NpbmUnXG4gICAgICAgIGJwbTogMTIwXG4gICAgICAgIGR1cmF0aW9uOiAyMDBcbiAgICAgICAgdm9sdW1lOiAxLjBcbiAgICAgICAgY2xpcDogdHJ1ZVxuICAgICAgICByZXZlcmI6XG4gICAgICAgICAgZGVsYXk6IDBcbiAgICAgICAgICBkZWNheTogMFxuICAgICAgICBhZHNyOiAjIG5vLW9wIEFEU1IgKGZ1bGwgMS4wIHN1c3RhaW4pXG4gICAgICAgICAgYTogMFxuICAgICAgICAgIGQ6IDBcbiAgICAgICAgICBzOiAxXG4gICAgICAgICAgcjogMVxuXG4gICAgIyBpZiBhIGtleSBpcyBwcmVzZW50IGluIHRoaXMgbWFwLCB0aGF0IG5hbWUgaXMgY29uc2lkZXJlZCBhbiBcIm9iamVjdFwiXG4gICAgQG9iamVjdEtleXMgPVxuICAgICAgdG9uZTpcbiAgICAgICAgd2F2ZTogJ3N0cmluZydcbiAgICAgICAgZnJlcTogJ2Zsb2F0J1xuICAgICAgICBkdXJhdGlvbjogJ2Zsb2F0J1xuICAgICAgICBhZHNyOiAnYWRzcidcbiAgICAgICAgb2N0YXZlOiAnaW50J1xuICAgICAgICBub3RlOiAnc3RyaW5nJ1xuICAgICAgICB2b2x1bWU6ICdmbG9hdCdcbiAgICAgICAgY2xpcDogJ2Jvb2wnXG4gICAgICAgIHJldmVyYjogJ3JldmVyYidcblxuICAgICAgc2FtcGxlOlxuICAgICAgICBzcmM6ICdzdHJpbmcnXG4gICAgICAgIHZvbHVtZTogJ2Zsb2F0J1xuICAgICAgICBjbGlwOiAnYm9vbCdcbiAgICAgICAgcmV2ZXJiOiAncmV2ZXJiJ1xuICAgICAgICBzcmNvY3RhdmU6ICdpbnQnXG4gICAgICAgIHNyY25vdGU6ICdzdHJpbmcnXG4gICAgICAgIG9jdGF2ZTogJ2ludCdcbiAgICAgICAgbm90ZTogJ3N0cmluZydcblxuICAgICAgbG9vcDpcbiAgICAgICAgYnBtOiAnaW50J1xuXG4gICAgICB0cmFjazoge31cblxuICAgIEBzdGF0ZVN0YWNrID0gW11cbiAgICBAcmVzZXQgJ2RlZmF1bHQnLCAwXG4gICAgQG9iamVjdHMgPSB7fVxuICAgIEBvYmplY3QgPSBudWxsXG4gICAgQG9iamVjdFNjb3BlUmVhZHkgPSBmYWxzZVxuXG4gIGlzT2JqZWN0VHlwZTogKHR5cGUpIC0+XG4gICAgcmV0dXJuIEBvYmplY3RLZXlzW3R5cGVdP1xuXG4gIGVycm9yOiAodGV4dCkgLT5cbiAgICBAbG9nLmVycm9yIFwiUEFSU0UgRVJST1IsIGxpbmUgI3tAbGluZU5vfTogI3t0ZXh0fVwiXG5cbiAgcmVzZXQ6IChuYW1lLCBpbmRlbnQpIC0+XG4gICAgbmFtZSA/PSAnZGVmYXVsdCdcbiAgICBpbmRlbnQgPz0gMFxuICAgIGlmIG5vdCBAbmFtZWRTdGF0ZXNbbmFtZV1cbiAgICAgIEBlcnJvciBcImludmFsaWQgcmVzZXQgbmFtZTogI3tuYW1lfVwiXG4gICAgICByZXR1cm4gZmFsc2VcbiAgICBuZXdTdGF0ZSA9IGNsb25lKEBuYW1lZFN0YXRlc1tuYW1lXSlcbiAgICBuZXdTdGF0ZS5faW5kZW50ID0gaW5kZW50XG4gICAgQHN0YXRlU3RhY2sucHVzaCBuZXdTdGF0ZVxuICAgIHJldHVybiB0cnVlXG5cbiAgZmxhdHRlbjogKCkgLT5cbiAgICBmbGF0dGVuZWRTdGF0ZSA9IHt9XG4gICAgZm9yIHN0YXRlIGluIEBzdGF0ZVN0YWNrXG4gICAgICBmb3Iga2V5IG9mIHN0YXRlXG4gICAgICAgIGZsYXR0ZW5lZFN0YXRlW2tleV0gPSBzdGF0ZVtrZXldXG4gICAgcmV0dXJuIGZsYXR0ZW5lZFN0YXRlXG5cbiAgdHJhY2U6IChwcmVmaXgpIC0+XG4gICAgcHJlZml4ID89ICcnXG4gICAgQGxvZy52ZXJib3NlIFwidHJhY2U6ICN7cHJlZml4fSBcIiArIEpTT04uc3RyaW5naWZ5KEBmbGF0dGVuKCkpXG5cbiAgY3JlYXRlT2JqZWN0OiAoaW5kZW50LCBkYXRhLi4uKSAtPlxuICAgICAgQG9iamVjdCA9IHsgX2luZGVudDogaW5kZW50IH1cbiAgICAgIGZvciBpIGluIFswLi4uZGF0YS5sZW5ndGhdIGJ5IDJcbiAgICAgICAgQG9iamVjdFtkYXRhW2ldXSA9IGRhdGFbaSsxXVxuICAgICAgQG9iamVjdFNjb3BlUmVhZHkgPSB0cnVlXG5cbiAgICAgIGlmIEBvYmplY3QuX3R5cGUgPT0gJ2xvb3AnXG4gICAgICAgIEBvYmplY3QuX3BhdHRlcm5zID0gW11cblxuICAgICAgaWYgQG9iamVjdC5fdHlwZSA9PSAndHJhY2snXG4gICAgICAgIEBvYmplY3QuX3BhdHRlcm5zID0gW11cblxuICAgICAgaWYgQG9iamVjdC5fbmFtZVxuICAgICAgICBAbGFzdE9iamVjdCA9IEBvYmplY3QuX25hbWVcbiAgICAgICAgbG9nRGVidWcgXCJjcmVhdGVPYmplY3RbI3tpbmRlbnR9XTogXCIsIEBsYXN0T2JqZWN0XG5cbiAgZmluaXNoT2JqZWN0OiAtPlxuICAgIGlmIEBvYmplY3RcbiAgICAgIHN0YXRlID0gQGZsYXR0ZW4oKVxuICAgICAgZm9yIGtleSBvZiBAb2JqZWN0S2V5c1tAb2JqZWN0Ll90eXBlXVxuICAgICAgICBleHBlY3RlZFR5cGUgPSBAb2JqZWN0S2V5c1tAb2JqZWN0Ll90eXBlXVtrZXldXG4gICAgICAgIGlmIHN0YXRlW2tleV0/XG4gICAgICAgICAgdiA9IHN0YXRlW2tleV1cbiAgICAgICAgICBAb2JqZWN0W2tleV0gPSBzd2l0Y2ggZXhwZWN0ZWRUeXBlXG4gICAgICAgICAgICB3aGVuICdpbnQnIHRoZW4gcGFyc2VJbnQodilcbiAgICAgICAgICAgIHdoZW4gJ2Zsb2F0JyB0aGVuIHBhcnNlRmxvYXQodilcbiAgICAgICAgICAgIHdoZW4gJ2Jvb2wnIHRoZW4gcGFyc2VCb29sKHYpXG4gICAgICAgICAgICBlbHNlIHZcblxuICAgICAgbG9nRGVidWcgXCJmaW5pc2hPYmplY3Q6IFwiLCBAb2JqZWN0XG4gICAgICBAb2JqZWN0c1tAb2JqZWN0Ll9uYW1lXSA9IEBvYmplY3RcbiAgICBAb2JqZWN0ID0gbnVsbFxuXG4gIGNyZWF0aW5nT2JqZWN0VHlwZTogKHR5cGUpIC0+XG4gICAgcmV0dXJuIGZhbHNlIGlmIG5vdCBAb2JqZWN0XG4gICAgcmV0dXJuIGZhbHNlIGlmIG5vdCBAb2JqZWN0Ll90eXBlID09IHR5cGVcbiAgICByZXR1cm4gdHJ1ZVxuXG4gIHVwZGF0ZUZha2VJbmRlbnRzOiAoaW5kZW50KSAtPlxuICAgIHJldHVybiBpZiBpbmRlbnQgPj0gMTAwMFxuICAgIGkgPSBAc3RhdGVTdGFjay5sZW5ndGggLSAxXG4gICAgd2hpbGUgaSA+IDBcbiAgICAgIHByZXZJbmRlbnQgPSBAc3RhdGVTdGFja1tpIC0gMV0uX2luZGVudFxuICAgICAgaWYgKEBzdGF0ZVN0YWNrW2ldLl9pbmRlbnQgPiAxMDAwKSBhbmQgKHByZXZJbmRlbnQgPCBpbmRlbnQpXG4gICAgICAgIGxvZ0RlYnVnIFwidXBkYXRlRmFrZUluZGVudHM6IGNoYW5naW5nIHN0YWNrIGluZGVudCAje2l9IGZyb20gI3tAc3RhdGVTdGFja1tpXS5faW5kZW50fSB0byAje2luZGVudH1cIlxuICAgICAgICBAc3RhdGVTdGFja1tpXS5faW5kZW50ID0gaW5kZW50XG4gICAgICBpLS1cblxuICBwdXNoU3RhdGU6IChpbmRlbnQpIC0+XG4gICAgaW5kZW50ID89IDBcbiAgICBsb2dEZWJ1ZyBcInB1c2hTdGF0ZSgje2luZGVudH0pXCJcbiAgICBAdXBkYXRlRmFrZUluZGVudHMgaW5kZW50XG4gICAgQHN0YXRlU3RhY2sucHVzaCB7IF9pbmRlbnQ6IGluZGVudCB9XG4gICAgcmV0dXJuIHRydWVcblxuICBwb3BTdGF0ZTogKGluZGVudCkgLT5cbiAgICBsb2dEZWJ1ZyBcInBvcFN0YXRlKCN7aW5kZW50fSlcIlxuICAgIGlmIEBvYmplY3Q/XG4gICAgICBpZiBpbmRlbnQgPD0gQG9iamVjdC5faW5kZW50XG4gICAgICAgIEBmaW5pc2hPYmplY3QoKVxuXG4gICAgQHVwZGF0ZUZha2VJbmRlbnRzIGluZGVudFxuXG4gICAgbG9vcFxuICAgICAgdG9wSW5kZW50ID0gQGdldFRvcEluZGVudCgpXG4gICAgICBsb2dEZWJ1ZyBcInBvcFN0YXRlKCN7aW5kZW50fSkgdG9wIGluZGVudCAje3RvcEluZGVudH1cIlxuICAgICAgYnJlYWsgaWYgaW5kZW50ID09IHRvcEluZGVudFxuICAgICAgaWYgQHN0YXRlU3RhY2subGVuZ3RoIDwgMlxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIGxvZ0RlYnVnIFwicG9wU3RhdGUoI3tpbmRlbnR9KSBwb3BwaW5nIGluZGVudCAje3RvcEluZGVudH1cIlxuICAgICAgQHN0YXRlU3RhY2sucG9wKClcbiAgICByZXR1cm4gdHJ1ZVxuXG4gIHBhcnNlUGF0dGVybjogKHBhdHRlcm4pIC0+XG4gICAgb3ZlcnJpZGVMZW5ndGggPSBAaGFzQ2FwaXRhbExldHRlcnNSZWdleC50ZXN0KHBhdHRlcm4pXG4gICAgaSA9IDBcbiAgICBzb3VuZHMgPSBbXVxuICAgIHdoaWxlIGkgPCBwYXR0ZXJuLmxlbmd0aFxuICAgICAgYyA9IHBhdHRlcm5baV1cbiAgICAgIGlmIGMgIT0gJy4nXG4gICAgICAgIHN5bWJvbCA9IGMudG9Mb3dlckNhc2UoKVxuICAgICAgICBzb3VuZCA9IHsgb2Zmc2V0OiBpIH1cbiAgICAgICAgaWYgQGlzTm90ZVJlZ2V4LnRlc3QoYylcbiAgICAgICAgICBzb3VuZC5ub3RlID0gc3ltYm9sXG4gICAgICAgIGlmIG92ZXJyaWRlTGVuZ3RoXG4gICAgICAgICAgbGVuZ3RoID0gMVxuICAgICAgICAgIGxvb3BcbiAgICAgICAgICAgIG5leHQgPSBwYXR0ZXJuW2krMV1cbiAgICAgICAgICAgIGlmIG5leHQgPT0gc3ltYm9sXG4gICAgICAgICAgICAgIGxlbmd0aCsrXG4gICAgICAgICAgICAgIGkrK1xuICAgICAgICAgICAgICBpZiBpID09IHBhdHRlcm4ubGVuZ3RoXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBzb3VuZC5sZW5ndGggPSBsZW5ndGhcbiAgICAgICAgc291bmRzLnB1c2ggc291bmRcbiAgICAgIGkrK1xuICAgIHJldHVybiB7XG4gICAgICBwYXR0ZXJuOiBwYXR0ZXJuXG4gICAgICBsZW5ndGg6IHBhdHRlcm4ubGVuZ3RoXG4gICAgICBzb3VuZHM6IHNvdW5kc1xuICAgIH1cblxuICBnZXRUb3BJbmRlbnQ6IC0+XG4gICAgcmV0dXJuIEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdLl9pbmRlbnRcblxuICBwcm9jZXNzVG9rZW5zOiAodG9rZW5zLCBpbmRlbnQpIC0+XG4gICAgY21kID0gdG9rZW5zWzBdLnRvTG93ZXJDYXNlKClcbiAgICBpZiBjbWQgPT0gJ3Jlc2V0J1xuICAgICAgaWYgbm90IEByZXNldCh0b2tlbnNbMV0sIGluZGVudClcbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgZWxzZSBpZiBjbWQgPT0gJ3NlY3Rpb24nXG4gICAgICBAb2JqZWN0U2NvcGVSZWFkeSA9IHRydWVcbiAgICBlbHNlIGlmIEBpc09iamVjdFR5cGUoY21kKVxuICAgICAgQGNyZWF0ZU9iamVjdCBpbmRlbnQsICdfdHlwZScsIGNtZCwgJ19uYW1lJywgdG9rZW5zWzFdXG4gICAgZWxzZSBpZiBjbWQgPT0gJ3BhdHRlcm4nXG4gICAgICBpZiBub3QgKEBjcmVhdGluZ09iamVjdFR5cGUoJ2xvb3AnKSBvciBAY3JlYXRpbmdPYmplY3RUeXBlKCd0cmFjaycpKVxuICAgICAgICBAZXJyb3IgXCJ1bmV4cGVjdGVkIHBhdHRlcm4gY29tbWFuZFwiXG4gICAgICAgIHJldHVybiBmYWxzZVxuXG4gICAgICBwYXR0ZXJuID0gQHBhcnNlUGF0dGVybih0b2tlbnNbMl0pXG4gICAgICBwYXR0ZXJuLnNyYyA9IHRva2Vuc1sxXVxuICAgICAgQG9iamVjdC5fcGF0dGVybnMucHVzaCBwYXR0ZXJuXG4gICAgZWxzZSBpZiBjbWQgPT0gJ2Fkc3InXG4gICAgICBAc3RhdGVTdGFja1tAc3RhdGVTdGFjay5sZW5ndGggLSAxXVtjbWRdID1cbiAgICAgICAgYTogcGFyc2VGbG9hdCh0b2tlbnNbMV0pXG4gICAgICAgIGQ6IHBhcnNlRmxvYXQodG9rZW5zWzJdKVxuICAgICAgICBzOiBwYXJzZUZsb2F0KHRva2Vuc1szXSlcbiAgICAgICAgcjogcGFyc2VGbG9hdCh0b2tlbnNbNF0pXG4gICAgZWxzZSBpZiBjbWQgPT0gJ3JldmVyYidcbiAgICAgIEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdW2NtZF0gPVxuICAgICAgICBkZWxheTogcGFyc2VJbnQodG9rZW5zWzFdKVxuICAgICAgICBkZWNheTogcGFyc2VGbG9hdCh0b2tlbnNbMl0pXG4gICAgZWxzZVxuICAgICAgIyBUaGUgYm9yaW5nIHJlZ3VsYXIgY2FzZTogc3Rhc2ggb2ZmIHRoaXMgdmFsdWVcbiAgICAgIGlmIEBsZWFkaW5nVW5kZXJzY29yZVJlZ2V4LnRlc3QoY21kKVxuICAgICAgICBAZXJyb3IgXCJjYW5ub3Qgc2V0IGludGVybmFsIG5hbWVzICh1bmRlcnNjb3JlIHByZWZpeClcIlxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdW2NtZF0gPSB0b2tlbnNbMV1cblxuICAgIHJldHVybiB0cnVlXG5cbiAgcGFyc2U6ICh0ZXh0KSAtPlxuICAgIGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJylcbiAgICBAbGluZU5vID0gMFxuICAgIGZvciBsaW5lIGluIGxpbmVzXG4gICAgICBAbGluZU5vKytcbiAgICAgIGxpbmUgPSBsaW5lLnJlcGxhY2UoLyhcXHJcXG58XFxufFxccikvZ20sXCJcIikgIyBzdHJpcCBuZXdsaW5lc1xuICAgICAgbGluZSA9IEBjb21tZW50UmVnZXguZXhlYyhsaW5lKVsxXSAgICAgICAjIHN0cmlwIGNvbW1lbnRzIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlXG4gICAgICBjb250aW51ZSBpZiBAb25seVdoaXRlc3BhY2VSZWdleC50ZXN0KGxpbmUpXG4gICAgICBbXywgaW5kZW50VGV4dCwgbGluZV0gPSBAaW5kZW50UmVnZXguZXhlYyBsaW5lXG4gICAgICBpbmRlbnQgPSBjb3VudEluZGVudCBpbmRlbnRUZXh0XG4gICAgICBsaW5lT2JqcyA9IFtdXG5cbiAgICAgIGFycm93U2VjdGlvbnMgPSBsaW5lLnNwbGl0KC9cXHMqLT5cXHMqLylcbiAgICAgIGZvciBhcnJvd1NlY3Rpb24gaW4gYXJyb3dTZWN0aW9uc1xuICAgICAgICBzZW1pU2VjdGlvbnMgPSBhcnJvd1NlY3Rpb24uc3BsaXQoL1xccyo7XFxzKi8pXG4gICAgICAgIGZvciBzZW1pU2VjdGlvbiBpbiBzZW1pU2VjdGlvbnNcbiAgICAgICAgICBsaW5lT2Jqcy5wdXNoIHtcbiAgICAgICAgICAgICAgaW5kZW50OiBpbmRlbnRcbiAgICAgICAgICAgICAgbGluZTogc2VtaVNlY3Rpb25cbiAgICAgICAgICAgIH1cbiAgICAgICAgaW5kZW50ICs9IDEwMDBcblxuICAgICAgZm9yIG9iaiBpbiBsaW5lT2Jqc1xuICAgICAgICBsb2dEZWJ1ZyBcImhhbmRsaW5nIGluZGVudDogXCIgKyBKU09OLnN0cmluZ2lmeShvYmopXG4gICAgICAgIHRvcEluZGVudCA9IEBnZXRUb3BJbmRlbnQoKVxuICAgICAgICBpZiBvYmouaW5kZW50ID4gdG9wSW5kZW50XG4gICAgICAgICAgQHB1c2hTdGF0ZShvYmouaW5kZW50KVxuICAgICAgICBlbHNlXG4gICAgICAgICAgaWYgbm90IEBwb3BTdGF0ZShvYmouaW5kZW50KVxuICAgICAgICAgICAgQGxvZy5lcnJvciBcInVuZXhwZWN0ZWQgb3V0ZGVudFwiXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcblxuICAgICAgICBsb2dEZWJ1ZyBcInByb2Nlc3Npbmc6IFwiICsgSlNPTi5zdHJpbmdpZnkob2JqKVxuICAgICAgICBpZiBub3QgQHByb2Nlc3NUb2tlbnMob2JqLmxpbmUuc3BsaXQoL1xccysvKSwgb2JqLmluZGVudClcbiAgICAgICAgICByZXR1cm4gZmFsc2VcblxuICAgIEBwb3BTdGF0ZSgwKVxuICAgIHJldHVybiB0cnVlXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBSZW5kZXJlclxuXG4jIEluIGFsbCBjYXNlcyB3aGVyZSBhIHJlbmRlcmVkIHNvdW5kIGlzIGdlbmVyYXRlZCwgdGhlcmUgYXJlIGFjdHVhbGx5IHR3byBsZW5ndGhzXG4jIGFzc29jaWF0ZWQgd2l0aCB0aGUgc291bmQuIFwic291bmQubGVuZ3RoXCIgaXMgdGhlIFwiZXhwZWN0ZWRcIiBsZW5ndGgsIHdpdGggcmVnYXJkc1xuIyB0byB0aGUgdHlwZWQtaW4gZHVyYXRpb24gZm9yIGl0IG9yIGZvciBkZXRlcm1pbmluZyBsb29wIG9mZmV0cy4gVGhlIG90aGVyIGxlbmd0aFxuIyBpcyB0aGUgc291bmQuc2FtcGxlcy5sZW5ndGggKGFsc28ga25vd24gYXMgdGhlIFwib3ZlcmZsb3cgbGVuZ3RoXCIpLCB3aGljaCBpcyB0aGVcbiMgbGVuZ3RoIHRoYXQgYWNjb3VudHMgZm9yIHRoaW5ncyBsaWtlIHJldmVyYiBvciBhbnl0aGluZyBlbHNlIHRoYXQgd291bGQgY2F1c2UgdGhlXG4jIHNvdW5kIHRvIHNwaWxsIGludG8gdGhlIG5leHQgbG9vcC90cmFjay4gVGhpcyBhbGxvd3MgZm9yIHNlYW1sZXNzIGxvb3BzIHRoYXQgY2FuXG4jIHBsYXkgYSBsb25nIHNvdW5kIGFzIHRoZSBlbmQgb2YgYSBwYXR0ZXJuLCBhbmQgaXQnbGwgY2xlYW5seSBtaXggaW50byB0aGUgYmVnaW5uaW5nXG4jIG9mIHRoZSBuZXh0IHBhdHRlcm4uXG5cbmNsYXNzIFJlbmRlcmVyXG4gIGNvbnN0cnVjdG9yOiAoQGxvZywgQHNhbXBsZVJhdGUsIEByZWFkTG9jYWxGaWxlcywgQG9iamVjdHMpIC0+XG4gICAgQHNvdW5kQ2FjaGUgPSB7fVxuXG4gIGVycm9yOiAodGV4dCkgLT5cbiAgICBAbG9nLmVycm9yIFwiUkVOREVSIEVSUk9SOiAje3RleHR9XCJcblxuICBnZW5lcmF0ZUVudmVsb3BlOiAoYWRzciwgbGVuZ3RoKSAtPlxuICAgIGVudmVsb3BlID0gQXJyYXkobGVuZ3RoKVxuICAgIEF0b0QgPSBNYXRoLmZsb29yKGFkc3IuYSAqIGxlbmd0aClcbiAgICBEdG9TID0gTWF0aC5mbG9vcihhZHNyLmQgKiBsZW5ndGgpXG4gICAgU3RvUiA9IE1hdGguZmxvb3IoYWRzci5yICogbGVuZ3RoKVxuICAgIGF0dGFja0xlbiA9IEF0b0RcbiAgICBkZWNheUxlbiA9IER0b1MgLSBBdG9EXG4gICAgc3VzdGFpbkxlbiA9IFN0b1IgLSBEdG9TXG4gICAgcmVsZWFzZUxlbiA9IGxlbmd0aCAtIFN0b1JcbiAgICBzdXN0YWluID0gYWRzci5zXG4gICAgcGVha1N1c3RhaW5EZWx0YSA9IDEuMCAtIHN1c3RhaW5cbiAgICBmb3IgaSBpbiBbMC4uLmF0dGFja0xlbl1cbiAgICAgICMgQXR0YWNrXG4gICAgICBlbnZlbG9wZVtpXSA9IGkgLyBhdHRhY2tMZW5cbiAgICBmb3IgaSBpbiBbMC4uLmRlY2F5TGVuXVxuICAgICAgIyBEZWNheVxuICAgICAgZW52ZWxvcGVbQXRvRCArIGldID0gMS4wIC0gKHBlYWtTdXN0YWluRGVsdGEgKiAoaSAvIGRlY2F5TGVuKSlcbiAgICBmb3IgaSBpbiBbMC4uLnN1c3RhaW5MZW5dXG4gICAgICAjIFN1c3RhaW5cbiAgICAgIGVudmVsb3BlW0R0b1MgKyBpXSA9IHN1c3RhaW5cbiAgICBmb3IgaSBpbiBbMC4uLnJlbGVhc2VMZW5dXG4gICAgICAjIFJlbGVhc2VcbiAgICAgIGVudmVsb3BlW1N0b1IgKyBpXSA9IHN1c3RhaW4gLSAoc3VzdGFpbiAqIChpIC8gcmVsZWFzZUxlbikpXG4gICAgcmV0dXJuIGVudmVsb3BlXG5cbiAgcmVuZGVyVG9uZTogKHRvbmVPYmosIG92ZXJyaWRlcykgLT5cbiAgICBhbXBsaXR1ZGUgPSAxMDAwMFxuICAgIGlmIG92ZXJyaWRlcy5sZW5ndGggPiAwXG4gICAgICBsZW5ndGggPSBvdmVycmlkZXMubGVuZ3RoXG4gICAgZWxzZVxuICAgICAgbGVuZ3RoID0gTWF0aC5mbG9vcih0b25lT2JqLmR1cmF0aW9uICogQHNhbXBsZVJhdGUgLyAxMDAwKVxuICAgIHNhbXBsZXMgPSBBcnJheShsZW5ndGgpXG4gICAgQSA9IDIwMFxuICAgIEIgPSAwLjVcbiAgICBpZiBvdmVycmlkZXMubm90ZT9cbiAgICAgIGZyZXEgPSBmaW5kRnJlcSh0b25lT2JqLm9jdGF2ZSwgb3ZlcnJpZGVzLm5vdGUpXG4gICAgZWxzZSBpZiB0b25lT2JqLmZyZXE/XG4gICAgICBmcmVxID0gdG9uZU9iai5mcmVxXG4gICAgZWxzZVxuICAgICAgZnJlcSA9IGZpbmRGcmVxKHRvbmVPYmoub2N0YXZlLCB0b25lT2JqLm5vdGUpXG4gICAgZW52ZWxvcGUgPSBAZ2VuZXJhdGVFbnZlbG9wZSh0b25lT2JqLmFkc3IsIGxlbmd0aClcbiAgICBwZXJpb2QgPSBAc2FtcGxlUmF0ZSAvIGZyZXFcbiAgICBmb3IgaSBpbiBbMC4uLmxlbmd0aF1cbiAgICAgIGlmIHRvbmVPYmoud2F2ZSA9PSBcInNhd3Rvb3RoXCJcbiAgICAgICAgc2FtcGxlID0gKChpICUgcGVyaW9kKSAvIHBlcmlvZCkgLSAwLjVcbiAgICAgIGVsc2VcbiAgICAgICAgc2FtcGxlID0gTWF0aC5zaW4oaSAvIHBlcmlvZCAqIDIgKiBNYXRoLlBJKVxuICAgICAgICBpZiB0b25lT2JqLndhdmUgPT0gXCJzcXVhcmVcIlxuICAgICAgICAgIHNhbXBsZSA9IGlmIChzYW1wbGUgPiAwKSB0aGVuIDEgZWxzZSAtMVxuICAgICAgc2FtcGxlc1tpXSA9IHNhbXBsZSAqIGFtcGxpdHVkZSAqIGVudmVsb3BlW2ldXG5cbiAgICByZXR1cm4ge1xuICAgICAgc2FtcGxlczogc2FtcGxlc1xuICAgICAgbGVuZ3RoOiBzYW1wbGVzLmxlbmd0aFxuICAgIH1cblxuICByZW5kZXJTYW1wbGU6IChzYW1wbGVPYmosIG92ZXJyaWRlcykgLT5cbiAgICB2aWV3ID0gbnVsbFxuXG4gICAgaWYgQHJlYWRMb2NhbEZpbGVzXG4gICAgICBkYXRhID0gZnMucmVhZEZpbGVTeW5jIHNhbXBsZU9iai5zcmNcbiAgICAgIHZpZXcgPSBuZXcgakRhdGFWaWV3KGRhdGEsIDAsIGRhdGEubGVuZ3RoLCB0cnVlKVxuICAgIGVsc2VcbiAgICAgICQuYWpheCB7XG4gICAgICAgIHVybDogc2FtcGxlT2JqLnNyY1xuICAgICAgICBtaW1lVHlwZTogJ3RleHQvcGxhaW47IGNoYXJzZXQ9eC11c2VyLWRlZmluZWQnXG4gICAgICAgIHN1Y2Nlc3M6IChkYXRhKSAtPlxuICAgICAgICAgIHZpZXcgPSBuZXcgakRhdGFWaWV3KGRhdGEsIDAsIGRhdGEubGVuZ3RoLCB0cnVlKVxuICAgICAgICBhc3luYzogZmFsc2VcbiAgICAgIH1cblxuICAgIGlmIG5vdCB2aWV3XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzYW1wbGVzOiBbXVxuICAgICAgICBsZW5ndGg6IDBcbiAgICAgIH1cblxuICAgICMgc2tpcCB0aGUgZmlyc3QgNDAgYnl0ZXNcbiAgICB2aWV3LnNlZWsoNDApXG4gICAgc3ViY2h1bmsyU2l6ZSA9IHZpZXcuZ2V0SW50MzIoKVxuICAgIHNhbXBsZXMgPSBbXVxuICAgIHdoaWxlIHZpZXcudGVsbCgpKzEgPCB2aWV3LmJ5dGVMZW5ndGhcbiAgICAgIHNhbXBsZXMucHVzaCB2aWV3LmdldEludDE2KClcblxuICAgIG92ZXJyaWRlTm90ZSA9IGlmIG92ZXJyaWRlcy5ub3RlIHRoZW4gb3ZlcnJpZGVzLm5vdGUgZWxzZSBzYW1wbGVPYmoubm90ZVxuICAgIGlmIChvdmVycmlkZU5vdGUgIT0gc2FtcGxlT2JqLnNyY25vdGUpIG9yIChzYW1wbGVPYmoub2N0YXZlICE9IHNhbXBsZU9iai5zcmNvY3RhdmUpXG4gICAgICBvbGRmcmVxID0gZmluZEZyZXEoc2FtcGxlT2JqLnNyY29jdGF2ZSwgc2FtcGxlT2JqLnNyY25vdGUpXG4gICAgICBuZXdmcmVxID0gZmluZEZyZXEoc2FtcGxlT2JqLm9jdGF2ZSwgb3ZlcnJpZGVOb3RlKVxuXG4gICAgICBmYWN0b3IgPSBvbGRmcmVxIC8gbmV3ZnJlcVxuICAgICAgIyBAbG9nLnZlcmJvc2UgXCJvbGQ6ICN7b2xkZnJlcX0sIG5ldzogI3tuZXdmcmVxfSwgZmFjdG9yOiAje2ZhY3Rvcn1cIlxuXG4gICAgICAjIFRPRE86IFByb3Blcmx5IHJlc2FtcGxlIGhlcmUgd2l0aCBzb21ldGhpbmcgb3RoZXIgdGhhbiBcIm5lYXJlc3QgbmVpZ2hib3JcIlxuICAgICAgcmVsZW5ndGggPSBNYXRoLmZsb29yKHNhbXBsZXMubGVuZ3RoICogZmFjdG9yKVxuICAgICAgcmVzYW1wbGVzID0gQXJyYXkocmVsZW5ndGgpXG4gICAgICBmb3IgaSBpbiBbMC4uLnJlbGVuZ3RoXVxuICAgICAgICByZXNhbXBsZXNbaV0gPSAwXG4gICAgICBmb3IgaSBpbiBbMC4uLnJlbGVuZ3RoXVxuICAgICAgICByZXNhbXBsZXNbaV0gPSBzYW1wbGVzW01hdGguZmxvb3IoaSAvIGZhY3RvcildXG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNhbXBsZXM6IHJlc2FtcGxlc1xuICAgICAgICBsZW5ndGg6IHJlc2FtcGxlcy5sZW5ndGhcbiAgICAgIH1cbiAgICBlbHNlXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzYW1wbGVzOiBzYW1wbGVzXG4gICAgICAgIGxlbmd0aDogc2FtcGxlcy5sZW5ndGhcbiAgICAgIH1cblxuICByZW5kZXJMb29wOiAobG9vcE9iaikgLT5cbiAgICBiZWF0Q291bnQgPSAwXG4gICAgZm9yIHBhdHRlcm4gaW4gbG9vcE9iai5fcGF0dGVybnNcbiAgICAgIGlmIGJlYXRDb3VudCA8IHBhdHRlcm4ubGVuZ3RoXG4gICAgICAgIGJlYXRDb3VudCA9IHBhdHRlcm4ubGVuZ3RoXG5cbiAgICBzYW1wbGVzUGVyQmVhdCA9IEBzYW1wbGVSYXRlIC8gKGxvb3BPYmouYnBtIC8gNjApIC8gNFxuICAgIHRvdGFsTGVuZ3RoID0gTWF0aC5mbG9vcihzYW1wbGVzUGVyQmVhdCAqIGJlYXRDb3VudClcbiAgICBvdmVyZmxvd0xlbmd0aCA9IHRvdGFsTGVuZ3RoXG5cbiAgICBmb3IgcGF0dGVybiBpbiBsb29wT2JqLl9wYXR0ZXJuc1xuICAgICAgc2VjdGlvbkNvdW50ID0gcGF0dGVybi5sZW5ndGggLyAxNlxuICAgICAgb2Zmc2V0TGVuZ3RoID0gTWF0aC5mbG9vcih0b3RhbExlbmd0aCAvIDE2IC8gc2VjdGlvbkNvdW50KVxuICAgICAgZm9yIHNvdW5kIGluIHBhdHRlcm4uc291bmRzXG4gICAgICAgIG92ZXJyaWRlcyA9IHt9XG4gICAgICAgIGlmIHNvdW5kLmxlbmd0aCA+IDBcbiAgICAgICAgICBvdmVycmlkZXMubGVuZ3RoID0gc291bmQubGVuZ3RoICogb2Zmc2V0TGVuZ3RoXG4gICAgICAgIGlmIHNvdW5kLm5vdGU/XG4gICAgICAgICAgb3ZlcnJpZGVzLm5vdGUgPSBzb3VuZC5ub3RlXG4gICAgICAgIHNvdW5kLl9yZW5kZXIgPSBAcmVuZGVyKHBhdHRlcm4uc3JjLCBvdmVycmlkZXMpXG4gICAgICAgIGVuZCA9IChzb3VuZC5vZmZzZXQgKiBvZmZzZXRMZW5ndGgpICsgc291bmQuX3JlbmRlci5zYW1wbGVzLmxlbmd0aFxuICAgICAgICBpZiBvdmVyZmxvd0xlbmd0aCA8IGVuZFxuICAgICAgICAgIG92ZXJmbG93TGVuZ3RoID0gZW5kXG5cbiAgICBzYW1wbGVzID0gQXJyYXkob3ZlcmZsb3dMZW5ndGgpXG4gICAgZm9yIGkgaW4gWzAuLi5vdmVyZmxvd0xlbmd0aF1cbiAgICAgIHNhbXBsZXNbaV0gPSAwXG5cbiAgICBmb3IgcGF0dGVybiBpbiBsb29wT2JqLl9wYXR0ZXJuc1xuICAgICAgc2VjdGlvbkNvdW50ID0gcGF0dGVybi5sZW5ndGggLyAxNlxuICAgICAgb2Zmc2V0TGVuZ3RoID0gTWF0aC5mbG9vcih0b3RhbExlbmd0aCAvIDE2IC8gc2VjdGlvbkNvdW50KVxuXG4gICAgICBwYXR0ZXJuU2FtcGxlcyA9IEFycmF5KG92ZXJmbG93TGVuZ3RoKVxuICAgICAgZm9yIGkgaW4gWzAuLi5vdmVyZmxvd0xlbmd0aF1cbiAgICAgICAgcGF0dGVyblNhbXBsZXNbaV0gPSAwXG5cbiAgICAgIGZvciBzb3VuZCBpbiBwYXR0ZXJuLnNvdW5kc1xuICAgICAgICBzcmNTb3VuZCA9IHNvdW5kLl9yZW5kZXJcblxuICAgICAgICBvYmogPSBAZ2V0T2JqZWN0KHBhdHRlcm4uc3JjKVxuICAgICAgICBvZmZzZXQgPSBzb3VuZC5vZmZzZXQgKiBvZmZzZXRMZW5ndGhcbiAgICAgICAgY29weUxlbiA9IHNyY1NvdW5kLnNhbXBsZXMubGVuZ3RoXG4gICAgICAgIGlmIChvZmZzZXQgKyBjb3B5TGVuKSA+IG92ZXJmbG93TGVuZ3RoXG4gICAgICAgICAgY29weUxlbiA9IG92ZXJmbG93TGVuZ3RoIC0gb2Zmc2V0XG5cbiAgICAgICAgaWYgb2JqLmNsaXBcbiAgICAgICAgICBmYWRlQ2xpcCA9IDIwMCAjIGZhZGUgb3V0IG92ZXIgdGhpcyBtYW55IHNhbXBsZXMgcHJpb3IgdG8gYSBjbGlwIHRvIGF2b2lkIGEgcG9wXG4gICAgICAgICAgaWYgb2Zmc2V0ID4gZmFkZUNsaXBcbiAgICAgICAgICAgIGZvciBqIGluIFswLi4uZmFkZUNsaXBdXG4gICAgICAgICAgICAgIHYgPSBwYXR0ZXJuU2FtcGxlc1tvZmZzZXQgLSBmYWRlQ2xpcCArIGpdXG4gICAgICAgICAgICAgIHBhdHRlcm5TYW1wbGVzW29mZnNldCAtIGZhZGVDbGlwICsgal0gPSBNYXRoLmZsb29yKHYgKiAoKGZhZGVDbGlwIC0gaikgLyBmYWRlQ2xpcCkpXG4gICAgICAgICAgZm9yIGogaW4gW29mZnNldC4uLm92ZXJmbG93TGVuZ3RoXVxuICAgICAgICAgICAgIyBjbGVhbiBvdXQgdGhlIHJlc3Qgb2YgdGhlIHNvdW5kIHRvIGVuc3VyZSB0aGF0IHRoZSBwcmV2aW91cyBvbmUgKHdoaWNoIGNvdWxkIGJlIGxvbmdlcikgd2FzIGZ1bGx5IGNsaXBwZWRcbiAgICAgICAgICAgIHBhdHRlcm5TYW1wbGVzW2pdID0gMFxuICAgICAgICAgIGZvciBqIGluIFswLi4uY29weUxlbl1cbiAgICAgICAgICAgIHBhdHRlcm5TYW1wbGVzW29mZnNldCArIGpdID0gc3JjU291bmQuc2FtcGxlc1tqXVxuICAgICAgICBlbHNlXG4gICAgICAgICAgZm9yIGogaW4gWzAuLi5jb3B5TGVuXVxuICAgICAgICAgICAgcGF0dGVyblNhbXBsZXNbb2Zmc2V0ICsgal0gKz0gc3JjU291bmQuc2FtcGxlc1tqXVxuXG4gICAgICAjIE5vdyBjb3B5IHRoZSBjbGlwcGVkIHBhdHRlcm4gaW50byB0aGUgZmluYWwgbG9vcFxuICAgICAgZm9yIGogaW4gWzAuLi5vdmVyZmxvd0xlbmd0aF1cbiAgICAgICAgc2FtcGxlc1tqXSArPSBwYXR0ZXJuU2FtcGxlc1tqXVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNhbXBsZXM6IHNhbXBsZXNcbiAgICAgIGxlbmd0aDogdG90YWxMZW5ndGhcbiAgICB9XG5cbiAgcmVuZGVyVHJhY2s6ICh0cmFja09iaikgLT5cbiAgICBwaWVjZUNvdW50ID0gMFxuICAgIGZvciBwYXR0ZXJuIGluIHRyYWNrT2JqLl9wYXR0ZXJuc1xuICAgICAgaWYgcGllY2VDb3VudCA8IHBhdHRlcm4ucGF0dGVybi5sZW5ndGhcbiAgICAgICAgcGllY2VDb3VudCA9IHBhdHRlcm4ucGF0dGVybi5sZW5ndGhcblxuICAgIHRvdGFsTGVuZ3RoID0gMFxuICAgIG92ZXJmbG93TGVuZ3RoID0gMFxuICAgIHBpZWNlVG90YWxMZW5ndGggPSBBcnJheShwaWVjZUNvdW50KVxuICAgIHBpZWNlT3ZlcmZsb3dMZW5ndGggPSBBcnJheShwaWVjZUNvdW50KVxuICAgIGZvciBwaWVjZUluZGV4IGluIFswLi4ucGllY2VDb3VudF1cbiAgICAgIHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF0gPSAwXG4gICAgICBwaWVjZU92ZXJmbG93TGVuZ3RoW3BpZWNlSW5kZXhdID0gMFxuICAgICAgZm9yIHBhdHRlcm4gaW4gdHJhY2tPYmouX3BhdHRlcm5zXG4gICAgICAgIGlmIChwaWVjZUluZGV4IDwgcGF0dGVybi5wYXR0ZXJuLmxlbmd0aCkgYW5kIChwYXR0ZXJuLnBhdHRlcm5bcGllY2VJbmRleF0gIT0gJy4nKVxuICAgICAgICAgIHNyY1NvdW5kID0gQHJlbmRlcihwYXR0ZXJuLnNyYylcbiAgICAgICAgICBpZiBwaWVjZVRvdGFsTGVuZ3RoW3BpZWNlSW5kZXhdIDwgc3JjU291bmQubGVuZ3RoXG4gICAgICAgICAgICBwaWVjZVRvdGFsTGVuZ3RoW3BpZWNlSW5kZXhdID0gc3JjU291bmQubGVuZ3RoXG4gICAgICAgICAgaWYgcGllY2VPdmVyZmxvd0xlbmd0aFtwaWVjZUluZGV4XSA8IHNyY1NvdW5kLnNhbXBsZXMubGVuZ3RoXG4gICAgICAgICAgICBwaWVjZU92ZXJmbG93TGVuZ3RoW3BpZWNlSW5kZXhdID0gc3JjU291bmQuc2FtcGxlcy5sZW5ndGhcbiAgICAgIHBvc3NpYmxlTWF4TGVuZ3RoID0gdG90YWxMZW5ndGggKyBwaWVjZU92ZXJmbG93TGVuZ3RoW3BpZWNlSW5kZXhdXG4gICAgICBpZiBvdmVyZmxvd0xlbmd0aCA8IHBvc3NpYmxlTWF4TGVuZ3RoXG4gICAgICAgIG92ZXJmbG93TGVuZ3RoID0gcG9zc2libGVNYXhMZW5ndGhcbiAgICAgIHRvdGFsTGVuZ3RoICs9IHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF1cblxuICAgIHNhbXBsZXMgPSBBcnJheShvdmVyZmxvd0xlbmd0aClcbiAgICBmb3IgaSBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxuICAgICAgc2FtcGxlc1tpXSA9IDBcblxuICAgIGZvciBwYXR0ZXJuIGluIHRyYWNrT2JqLl9wYXR0ZXJuc1xuICAgICAgdHJhY2tPZmZzZXQgPSAwXG4gICAgICBzcmNTb3VuZCA9IEByZW5kZXIocGF0dGVybi5zcmMsIHt9KVxuICAgICAgZm9yIHBpZWNlSW5kZXggaW4gWzAuLi5waWVjZUNvdW50XVxuICAgICAgICBpZiAocGllY2VJbmRleCA8IHBhdHRlcm4ucGF0dGVybi5sZW5ndGgpIGFuZCAocGF0dGVybi5wYXR0ZXJuW3BpZWNlSW5kZXhdICE9ICcuJylcbiAgICAgICAgICBjb3B5TGVuID0gc3JjU291bmQuc2FtcGxlcy5sZW5ndGhcbiAgICAgICAgICBpZiAodHJhY2tPZmZzZXQgKyBjb3B5TGVuKSA+IG92ZXJmbG93TGVuZ3RoXG4gICAgICAgICAgICBjb3B5TGVuID0gb3ZlcmZsb3dMZW5ndGggLSB0cmFja09mZnNldFxuICAgICAgICAgIGZvciBqIGluIFswLi4uY29weUxlbl1cbiAgICAgICAgICAgIHNhbXBsZXNbdHJhY2tPZmZzZXQgKyBqXSArPSBzcmNTb3VuZC5zYW1wbGVzW2pdXG5cbiAgICAgICAgdHJhY2tPZmZzZXQgKz0gcGllY2VUb3RhbExlbmd0aFtwaWVjZUluZGV4XVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHNhbXBsZXM6IHNhbXBsZXNcbiAgICAgIGxlbmd0aDogdG90YWxMZW5ndGhcbiAgICB9XG5cbiAgY2FsY0NhY2hlTmFtZTogKHR5cGUsIHdoaWNoLCBvdmVycmlkZXMpIC0+XG4gICAgaWYgKHR5cGUgIT0gJ3RvbmUnKSBhbmQgKHR5cGUgIT0gJ3NhbXBsZScpXG4gICAgICByZXR1cm4gd2hpY2hcblxuICAgIG5hbWUgPSB3aGljaFxuICAgIGlmIG92ZXJyaWRlcy5ub3RlXG4gICAgICBuYW1lICs9IFwiL04je292ZXJyaWRlcy5ub3RlfVwiXG4gICAgaWYgb3ZlcnJpZGVzLmxlbmd0aFxuICAgICAgbmFtZSArPSBcIi9MI3tvdmVycmlkZXMubGVuZ3RofVwiXG5cbiAgICByZXR1cm4gbmFtZVxuXG4gIGdldE9iamVjdDogKHdoaWNoKSAtPlxuICAgIG9iamVjdCA9IEBvYmplY3RzW3doaWNoXVxuICAgIGlmIG5vdCBvYmplY3RcbiAgICAgIEBlcnJvciBcIm5vIHN1Y2ggb2JqZWN0ICN7d2hpY2h9XCJcbiAgICAgIHJldHVybiBudWxsXG4gICAgcmV0dXJuIG9iamVjdFxuXG4gIHJlbmRlcjogKHdoaWNoLCBvdmVycmlkZXMpIC0+XG4gICAgb2JqZWN0ID0gQGdldE9iamVjdCh3aGljaClcbiAgICBpZiBub3Qgb2JqZWN0XG4gICAgICByZXR1cm4gbnVsbFxuXG4gICAgb3ZlcnJpZGVzID89IHt9XG5cbiAgICBjYWNoZU5hbWUgPSBAY2FsY0NhY2hlTmFtZShvYmplY3QuX3R5cGUsIHdoaWNoLCBvdmVycmlkZXMpXG4gICAgaWYgQHNvdW5kQ2FjaGVbY2FjaGVOYW1lXVxuICAgICAgcmV0dXJuIEBzb3VuZENhY2hlW2NhY2hlTmFtZV1cblxuICAgIHNvdW5kID0gc3dpdGNoIG9iamVjdC5fdHlwZVxuICAgICAgd2hlbiAndG9uZScgdGhlbiBAcmVuZGVyVG9uZShvYmplY3QsIG92ZXJyaWRlcylcbiAgICAgIHdoZW4gJ3NhbXBsZScgdGhlbiBAcmVuZGVyU2FtcGxlKG9iamVjdCwgb3ZlcnJpZGVzKVxuICAgICAgd2hlbiAnbG9vcCcgdGhlbiBAcmVuZGVyTG9vcChvYmplY3QpXG4gICAgICB3aGVuICd0cmFjaycgdGhlbiBAcmVuZGVyVHJhY2sob2JqZWN0KVxuICAgICAgZWxzZVxuICAgICAgICBAZXJyb3IgXCJ1bmtub3duIHR5cGUgI3tvYmplY3QuX3R5cGV9XCJcbiAgICAgICAgbnVsbFxuXG4gICAgaWYgb2JqZWN0Ll90eXBlICE9ICd0b25lJ1xuICAgICAgb3ZlcnJpZGVOb3RlID0gaWYgb3ZlcnJpZGVzLm5vdGUgdGhlbiBvdmVycmlkZXMubm90ZSBlbHNlIG9iamVjdC5ub3RlXG4gICAgICBpZiAob3ZlcnJpZGVOb3RlICE9IG9iamVjdC5zcmNub3RlKSBvciAob2JqZWN0Lm9jdGF2ZSAhPSBvYmplY3Quc3Jjb2N0YXZlKVxuICAgICAgICBvbGRmcmVxID0gZmluZEZyZXEob2JqZWN0LnNyY29jdGF2ZSwgb2JqZWN0LnNyY25vdGUpXG4gICAgICAgIG5ld2ZyZXEgPSBmaW5kRnJlcShvYmplY3Qub2N0YXZlLCBvdmVycmlkZU5vdGUpXG5cbiAgICAgICAgZmFjdG9yID0gb2xkZnJlcSAvIG5ld2ZyZXFcbiAgICAgICAgIyBAbG9nLnZlcmJvc2UgXCJvbGQ6ICN7b2xkZnJlcX0sIG5ldzogI3tuZXdmcmVxfSwgZmFjdG9yOiAje2ZhY3Rvcn1cIlxuXG4gICAgICAgICMgVE9ETzogUHJvcGVybHkgcmVzYW1wbGUgaGVyZSB3aXRoIHNvbWV0aGluZyBvdGhlciB0aGFuIFwibmVhcmVzdCBuZWlnaGJvclwiXG4gICAgICAgIHJlbGVuZ3RoID0gTWF0aC5mbG9vcihzb3VuZC5zYW1wbGVzLmxlbmd0aCAqIGZhY3RvcilcbiAgICAgICAgcmVzYW1wbGVzID0gQXJyYXkocmVsZW5ndGgpXG4gICAgICAgIGZvciBpIGluIFswLi4ucmVsZW5ndGhdXG4gICAgICAgICAgcmVzYW1wbGVzW2ldID0gMFxuICAgICAgICBmb3IgaSBpbiBbMC4uLnJlbGVuZ3RoXVxuICAgICAgICAgIHJlc2FtcGxlc1tpXSA9IHNvdW5kLnNhbXBsZXNbTWF0aC5mbG9vcihpIC8gZmFjdG9yKV1cblxuICAgICAgICBzb3VuZC5zYW1wbGVzID0gcmVzYW1wbGVzXG4gICAgICAgIHNvdW5kLmxlbmd0aCA9IHJlc2FtcGxlcy5sZW5ndGhcblxuICAgICMgVm9sdW1lXG4gICAgaWYgb2JqZWN0LnZvbHVtZT8gYW5kIChvYmplY3Qudm9sdW1lICE9IDEuMClcbiAgICAgIGZvciBpIGluIFswLi4uc291bmQuc2FtcGxlcy5sZW5ndGhdXG4gICAgICAgIHNvdW5kLnNhbXBsZXNbaV0gKj0gb2JqZWN0LnZvbHVtZVxuXG4gICAgIyBSZXZlcmJcbiAgICBpZiBvYmplY3QucmV2ZXJiPyBhbmQgKG9iamVjdC5yZXZlcmIuZGVsYXkgPiAwKVxuICAgICAgZGVsYXlTYW1wbGVzID0gTWF0aC5mbG9vcihvYmplY3QucmV2ZXJiLmRlbGF5ICogQHNhbXBsZVJhdGUgLyAxMDAwKVxuICAgICAgaWYgc291bmQuc2FtcGxlcy5sZW5ndGggPiBkZWxheVNhbXBsZXNcbiAgICAgICAgdG90YWxMZW5ndGggPSBzb3VuZC5zYW1wbGVzLmxlbmd0aCArIChkZWxheVNhbXBsZXMgKiA4KSAjIHRoaXMgKjggaXMgdG90YWxseSB3cm9uZy4gTmVlZHMgbW9yZSB0aG91Z2h0LlxuICAgICAgICAjIEBsb2cudmVyYm9zZSBcInJldmVyYmluZyAje2NhY2hlTmFtZX06ICN7ZGVsYXlTYW1wbGVzfS4gbGVuZ3RoIHVwZGF0ZSAje3NvdW5kLnNhbXBsZXMubGVuZ3RofSAtPiAje3RvdGFsTGVuZ3RofVwiXG4gICAgICAgIHNhbXBsZXMgPSBBcnJheSh0b3RhbExlbmd0aClcbiAgICAgICAgZm9yIGkgaW4gWzAuLi5zb3VuZC5zYW1wbGVzLmxlbmd0aF1cbiAgICAgICAgICBzYW1wbGVzW2ldID0gc291bmQuc2FtcGxlc1tpXVxuICAgICAgICBmb3IgaSBpbiBbc291bmQuc2FtcGxlcy5sZW5ndGguLi50b3RhbExlbmd0aF1cbiAgICAgICAgICBzYW1wbGVzW2ldID0gMFxuICAgICAgICBmb3IgaSBpbiBbMC4uLih0b3RhbExlbmd0aCAtIGRlbGF5U2FtcGxlcyldXG4gICAgICAgICAgc2FtcGxlc1tpICsgZGVsYXlTYW1wbGVzXSArPSBNYXRoLmZsb29yKHNhbXBsZXNbaV0gKiBvYmplY3QucmV2ZXJiLmRlY2F5KVxuICAgICAgICBzb3VuZC5zYW1wbGVzID0gc2FtcGxlc1xuXG4gICAgQGxvZy52ZXJib3NlIFwiUmVuZGVyZWQgI3tjYWNoZU5hbWV9LlwiXG4gICAgQHNvdW5kQ2FjaGVbY2FjaGVOYW1lXSA9IHNvdW5kXG4gICAgcmV0dXJuIHNvdW5kXG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBXYXZlZm9ybSBJbWFnZSBSZW5kZXJlclxuXG5yZW5kZXJXYXZlZm9ybUltYWdlID0gKHNhbXBsZXMsIHdpZHRoLCBoZWlnaHQsIGJhY2tncm91bmRDb2xvciwgd2F2ZWZvcm1Db2xvcikgLT5cbiAgYmFja2dyb3VuZENvbG9yID89IFsyNTUsIDI1NSwgMjU1XVxuICB3YXZlZm9ybUNvbG9yID89IFsyNTUsIDAsIDBdXG4gIHJvd3MgPSBbXVxuICBmb3IgaiBpbiBbMC4uLmhlaWdodF1cbiAgICByb3cgPSBbXVxuICAgIGZvciBpIGluIFswLi4ud2lkdGhdXG4gICAgICByb3cucHVzaCBiYWNrZ3JvdW5kQ29sb3JcbiAgICByb3dzLnB1c2ggcm93XG5cbiAgc2FtcGxlc1BlckNvbCA9IE1hdGguZmxvb3Ioc2FtcGxlcy5sZW5ndGggLyB3aWR0aClcblxuICBwZWFrID0gMFxuICBmb3Igc2FtcGxlIGluIHNhbXBsZXNcbiAgICBhID0gTWF0aC5hYnMoc2FtcGxlKVxuICAgIGlmIHBlYWsgPCBhXG4gICAgICBwZWFrID0gYVxuXG4gIHBlYWsgPSBNYXRoLmZsb29yKHBlYWsgKiAxLjEpICMgR2l2ZSBhIGJpdCBvZiBtYXJnaW4gb24gdG9wL2JvdHRvbVxuXG4gIGlmIHBlYWsgPT0gMFxuICAgIHJvdyA9IHJvd3NbIE1hdGguZmxvb3IoaGVpZ2h0IC8gMikgXVxuICAgIGZvciBpIGluIFswLi4ud2lkdGhdXG4gICAgICByb3dbaV0gPSB3YXZlZm9ybUNvbG9yXG4gIGVsc2VcbiAgICBmb3IgaSBpbiBbMC4uLndpZHRoXVxuICAgICAgc2FtcGxlT2Zmc2V0ID0gTWF0aC5mbG9vcigoaSAvIHdpZHRoKSAqIHNhbXBsZXMubGVuZ3RoKVxuICAgICAgc2FtcGxlU3VtID0gMFxuICAgICAgc2FtcGxlTWF4ID0gMFxuICAgICAgZm9yIHNhbXBsZUluZGV4IGluIFtzYW1wbGVPZmZzZXQuLi4oc2FtcGxlT2Zmc2V0K3NhbXBsZXNQZXJDb2wpXVxuICAgICAgICBhID0gTWF0aC5hYnMoc2FtcGxlc1tzYW1wbGVJbmRleF0pXG4gICAgICAgIHNhbXBsZVN1bSArPSBhXG4gICAgICAgIGlmIHNhbXBsZU1heCA8IGFcbiAgICAgICAgICBzYW1wbGVNYXggPSBhXG4gICAgICBzYW1wbGVBdmcgPSBNYXRoLmZsb29yKHNhbXBsZVN1bSAvIHNhbXBsZXNQZXJDb2wpXG4gICAgICBsaW5lSGVpZ2h0ID0gTWF0aC5mbG9vcihzYW1wbGVNYXggLyBwZWFrICogaGVpZ2h0KVxuICAgICAgbGluZU9mZnNldCA9IChoZWlnaHQgLSBsaW5lSGVpZ2h0KSA+PiAxXG4gICAgICBpZiBsaW5lSGVpZ2h0ID09IDBcbiAgICAgICAgbGluZUhlaWdodCA9IDFcbiAgICAgIGZvciBqIGluIFswLi4ubGluZUhlaWdodF1cbiAgICAgICAgcm93ID0gcm93c1tqICsgbGluZU9mZnNldF1cbiAgICAgICAgcm93W2ldID0gd2F2ZWZvcm1Db2xvclxuXG4gIHJldHVybiBnZW5lcmF0ZUJpdG1hcERhdGFVUkwgcm93c1xuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgRXhwb3J0c1xuXG5yZW5kZXJMb29wU2NyaXB0ID0gKGFyZ3MpIC0+XG4gIGxvZ09iaiA9IGFyZ3MubG9nXG4gIGxvZ09iai52ZXJib3NlIFwiUGFyc2luZy4uLlwiXG4gIHBhcnNlciA9IG5ldyBQYXJzZXIobG9nT2JqKVxuICBwYXJzZXIucGFyc2UgYXJncy5zY3JpcHRcblxuICB3aGljaCA9IGFyZ3Mud2hpY2hcbiAgd2hpY2ggPz0gcGFyc2VyLmxhc3RPYmplY3RcblxuICBpZiB3aGljaFxuICAgIHNhbXBsZVJhdGUgPSA0NDEwMFxuICAgIGxvZ09iai52ZXJib3NlIFwiUmVuZGVyaW5nLi4uXCJcbiAgICByZW5kZXJlciA9IG5ldyBSZW5kZXJlcihsb2dPYmosIHNhbXBsZVJhdGUsIGFyZ3MucmVhZExvY2FsRmlsZXMsIHBhcnNlci5vYmplY3RzKVxuICAgIG91dHB1dFNvdW5kID0gcmVuZGVyZXIucmVuZGVyKHdoaWNoLCB7fSlcbiAgICByZXQgPSB7fVxuICAgIGlmIGFyZ3Mud2F2RmlsZW5hbWVcbiAgICAgIHJpZmZ3YXZlLndyaXRlV0FWIGFyZ3Mud2F2RmlsZW5hbWUsIHNhbXBsZVJhdGUsIG91dHB1dFNvdW5kLnNhbXBsZXNcbiAgICBlbHNlXG4gICAgICByZXQud2F2VXJsID0gcmlmZndhdmUubWFrZUJsb2JVcmwoc2FtcGxlUmF0ZSwgb3V0cHV0U291bmQuc2FtcGxlcylcbiAgICBpZiBhcmdzLmltYWdlV2lkdGg/IGFuZCBhcmdzLmltYWdlSGVpZ2h0PyBhbmQgKGFyZ3MuaW1hZ2VXaWR0aCA+IDApIGFuZCAoYXJncy5pbWFnZUhlaWdodCA+IDApXG4gICAgICByZXQuaW1hZ2VVcmwgPSByZW5kZXJXYXZlZm9ybUltYWdlKG91dHB1dFNvdW5kLnNhbXBsZXMsIGFyZ3MuaW1hZ2VXaWR0aCwgYXJncy5pbWFnZUhlaWdodCwgYXJncy5pbWFnZUJhY2tncm91bmRDb2xvciwgYXJncy5pbWFnZVdhdmVmb3JtQ29sb3IpXG4gICAgcmV0dXJuIHJldFxuXG4gIHJldHVybiBudWxsXG5cbm1vZHVsZS5leHBvcnRzID1cbiAgcmVuZGVyOiByZW5kZXJMb29wU2NyaXB0XG4iLCJmcyA9IHJlcXVpcmUgXCJmc1wiXG5cbmNsYXNzIEZhc3RCYXNlNjRcblxuICBjb25zdHJ1Y3RvcjogLT5cbiAgICBAY2hhcnMgPSBcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky89XCJcbiAgICBAZW5jTG9va3VwID0gW11cbiAgICBmb3IgaSBpbiBbMC4uLjQwOTZdXG4gICAgICBAZW5jTG9va3VwW2ldID0gQGNoYXJzW2kgPj4gNl0gKyBAY2hhcnNbaSAmIDB4M0ZdXG5cbiAgZW5jb2RlOiAoc3JjKSAtPlxuICAgIGxlbiA9IHNyYy5sZW5ndGhcbiAgICBkc3QgPSAnJ1xuICAgIGkgPSAwXG4gICAgd2hpbGUgKGxlbiA+IDIpXG4gICAgICBuID0gKHNyY1tpXSA8PCAxNikgfCAoc3JjW2krMV08PDgpIHwgc3JjW2krMl1cbiAgICAgIGRzdCs9IHRoaXMuZW5jTG9va3VwW24gPj4gMTJdICsgdGhpcy5lbmNMb29rdXBbbiAmIDB4RkZGXVxuICAgICAgbGVuLT0gM1xuICAgICAgaSs9IDNcbiAgICBpZiAobGVuID4gMClcbiAgICAgIG4xPSAoc3JjW2ldICYgMHhGQykgPj4gMlxuICAgICAgbjI9IChzcmNbaV0gJiAweDAzKSA8PCA0XG4gICAgICBpZiAobGVuID4gMSlcbiAgICAgICAgbjIgfD0gKHNyY1srK2ldICYgMHhGMCkgPj4gNFxuICAgICAgZHN0Kz0gdGhpcy5jaGFyc1tuMV1cbiAgICAgIGRzdCs9IHRoaXMuY2hhcnNbbjJdXG4gICAgICBpZiAobGVuID09IDIpXG4gICAgICAgIG4zPSAoc3JjW2krK10gJiAweDBGKSA8PCAyXG4gICAgICAgIG4zIHw9IChzcmNbaV0gJiAweEMwKSA+PiA2XG4gICAgICAgIGRzdCs9IHRoaXMuY2hhcnNbbjNdXG4gICAgICBpZiAobGVuID09IDEpXG4gICAgICAgIGRzdCs9ICc9J1xuICAgICAgZHN0Kz0gJz0nXG5cbiAgICByZXR1cm4gZHN0XG5cbmNsYXNzIFJJRkZXQVZFXG4gIGNvbnN0cnVjdG9yOiAoQHNhbXBsZVJhdGUsIEBkYXRhKSAtPlxuICAgIEB3YXYgPSBbXSAgICAgIyBBcnJheSBjb250YWluaW5nIHRoZSBnZW5lcmF0ZWQgd2F2ZSBmaWxlXG4gICAgQGhlYWRlciA9ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICMgT0ZGUyBTSVpFIE5PVEVTXG4gICAgICBjaHVua0lkICAgICAgOiBbMHg1MiwweDQ5LDB4NDYsMHg0Nl0sICMgMCAgICA0ICBcIlJJRkZcIiA9IDB4NTI0OTQ2NDZcbiAgICAgIGNodW5rU2l6ZSAgICA6IDAsICAgICAgICAgICAgICAgICAgICAgIyA0ICAgIDQgIDM2K1N1YkNodW5rMlNpemUgPSA0Kyg4K1N1YkNodW5rMVNpemUpKyg4K1N1YkNodW5rMlNpemUpXG4gICAgICBmb3JtYXQgICAgICAgOiBbMHg1NywweDQxLDB4NTYsMHg0NV0sICMgOCAgICA0ICBcIldBVkVcIiA9IDB4NTc0MTU2NDVcbiAgICAgIHN1YkNodW5rMUlkICA6IFsweDY2LDB4NmQsMHg3NCwweDIwXSwgIyAxMiAgIDQgIFwiZm10IFwiID0gMHg2NjZkNzQyMFxuICAgICAgc3ViQ2h1bmsxU2l6ZTogMTYsICAgICAgICAgICAgICAgICAgICAjIDE2ICAgNCAgMTYgZm9yIFBDTVxuICAgICAgYXVkaW9Gb3JtYXQgIDogMSwgICAgICAgICAgICAgICAgICAgICAjIDIwICAgMiAgUENNID0gMVxuICAgICAgbnVtQ2hhbm5lbHMgIDogMSwgICAgICAgICAgICAgICAgICAgICAjIDIyICAgMiAgTW9ubyA9IDEsIFN0ZXJlbyA9IDIuLi5cbiAgICAgIHNhbXBsZVJhdGUgICA6IEBzYW1wbGVSYXRlLCAgICAgICAgICAgIyAyNCAgIDQgIDgwMDAsIDQ0MTAwLi4uXG4gICAgICBieXRlUmF0ZSAgICAgOiAwLCAgICAgICAgICAgICAgICAgICAgICMgMjggICA0ICBTYW1wbGVSYXRlKk51bUNoYW5uZWxzKkJpdHNQZXJTYW1wbGUvOFxuICAgICAgYmxvY2tBbGlnbiAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDMyICAgMiAgTnVtQ2hhbm5lbHMqQml0c1BlclNhbXBsZS84XG4gICAgICBiaXRzUGVyU2FtcGxlOiAxNiwgICAgICAgICAgICAgICAgICAgICMgMzQgICAyICA4IGJpdHMgPSA4LCAxNiBiaXRzID0gMTZcbiAgICAgIHN1YkNodW5rMklkICA6IFsweDY0LDB4NjEsMHg3NCwweDYxXSwgIyAzNiAgIDQgIFwiZGF0YVwiID0gMHg2NDYxNzQ2MVxuICAgICAgc3ViQ2h1bmsyU2l6ZTogMCAgICAgICAgICAgICAgICAgICAgICAjIDQwICAgNCAgZGF0YSBzaXplID0gTnVtU2FtcGxlcypOdW1DaGFubmVscypCaXRzUGVyU2FtcGxlLzhcblxuICAgIEBnZW5lcmF0ZSgpXG5cbiAgdTMyVG9BcnJheTogKGkpIC0+XG4gICAgcmV0dXJuIFtpJjB4RkYsIChpPj44KSYweEZGLCAoaT4+MTYpJjB4RkYsIChpPj4yNCkmMHhGRl1cblxuICB1MTZUb0FycmF5OiAoaSkgLT5cbiAgICByZXR1cm4gW2kmMHhGRiwgKGk+PjgpJjB4RkZdXG5cbiAgc3BsaXQxNmJpdEFycmF5OiAoZGF0YSkgLT5cbiAgICByID0gW11cbiAgICBqID0gMFxuICAgIGxlbiA9IGRhdGEubGVuZ3RoXG4gICAgZm9yIGkgaW4gWzAuLi5sZW5dXG4gICAgICByW2orK10gPSBkYXRhW2ldICYgMHhGRlxuICAgICAgcltqKytdID0gKGRhdGFbaV0+PjgpICYgMHhGRlxuXG4gICAgcmV0dXJuIHJcblxuICBnZW5lcmF0ZTogLT5cbiAgICBAaGVhZGVyLmJsb2NrQWxpZ24gPSAoQGhlYWRlci5udW1DaGFubmVscyAqIEBoZWFkZXIuYml0c1BlclNhbXBsZSkgPj4gM1xuICAgIEBoZWFkZXIuYnl0ZVJhdGUgPSBAaGVhZGVyLmJsb2NrQWxpZ24gKiBAc2FtcGxlUmF0ZVxuICAgIEBoZWFkZXIuc3ViQ2h1bmsyU2l6ZSA9IEBkYXRhLmxlbmd0aCAqIChAaGVhZGVyLmJpdHNQZXJTYW1wbGUgPj4gMylcbiAgICBAaGVhZGVyLmNodW5rU2l6ZSA9IDM2ICsgQGhlYWRlci5zdWJDaHVuazJTaXplXG5cbiAgICBpZiBAaGVhZGVyLmJpdHNQZXJTYW1wbGUgPT0gMTZcbiAgICAgIEBkYXRhID0gQHNwbGl0MTZiaXRBcnJheShAZGF0YSlcblxuICAgIEB3YXYgPSBAaGVhZGVyLmNodW5rSWQuY29uY2F0KFxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5jaHVua1NpemUpLFxuICAgICAgQGhlYWRlci5mb3JtYXQsXG4gICAgICBAaGVhZGVyLnN1YkNodW5rMUlkLFxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5zdWJDaHVuazFTaXplKSxcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIuYXVkaW9Gb3JtYXQpLFxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5udW1DaGFubmVscyksXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLnNhbXBsZVJhdGUpLFxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5ieXRlUmF0ZSksXG4gICAgICBAdTE2VG9BcnJheShAaGVhZGVyLmJsb2NrQWxpZ24pLFxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5iaXRzUGVyU2FtcGxlKSxcbiAgICAgIEBoZWFkZXIuc3ViQ2h1bmsySWQsXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLnN1YkNodW5rMlNpemUpLFxuICAgICAgQGRhdGFcbiAgICApXG4gICAgZmIgPSBuZXcgRmFzdEJhc2U2NFxuICAgIEBiYXNlNjREYXRhID0gZmIuZW5jb2RlKEB3YXYpXG4gICAgQGRhdGFVUkkgPSAnZGF0YTphdWRpby93YXY7YmFzZTY0LCcgKyBAYmFzZTY0RGF0YVxuXG4gIHJhdzogLT5cbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihAYmFzZTY0RGF0YSwgXCJiYXNlNjRcIilcblxud3JpdGVXQVYgPSAoZmlsZW5hbWUsIHNhbXBsZVJhdGUsIHNhbXBsZXMpIC0+XG4gIHdhdmUgPSBuZXcgUklGRldBVkUgc2FtcGxlUmF0ZSwgc2FtcGxlc1xuICBmcy53cml0ZUZpbGVTeW5jKGZpbGVuYW1lLCB3YXZlLnJhdygpKVxuICByZXR1cm4gdHJ1ZVxuXG5tYWtlRGF0YVVSSSA9IChzYW1wbGVSYXRlLCBzYW1wbGVzKSAtPlxuICB3YXZlID0gbmV3IFJJRkZXQVZFIHNhbXBsZVJhdGUsIHNhbXBsZXNcbiAgcmV0dXJuIHdhdmUuZGF0YVVSSVxuXG5iNjR0b0Jsb2IgPSAoYjY0RGF0YSwgY29udGVudFR5cGUsIHNsaWNlU2l6ZSkgLT5cbiAgY29udGVudFR5cGUgPSBjb250ZW50VHlwZSB8fCAnJ1xuICBzbGljZVNpemUgPSBzbGljZVNpemUgfHwgNTEyXG5cbiAgYnl0ZUNoYXJhY3RlcnMgPSBhdG9iKGI2NERhdGEpXG4gIGJ5dGVBcnJheXMgPSBbXVxuXG4gIGZvciBvZmZzZXQgaW4gWzAuLi5ieXRlQ2hhcmFjdGVycy5sZW5ndGhdIGJ5IHNsaWNlU2l6ZVxuICAgIHNsaWNlID0gYnl0ZUNoYXJhY3RlcnMuc2xpY2Uob2Zmc2V0LCBvZmZzZXQgKyBzbGljZVNpemUpXG5cbiAgICBieXRlTnVtYmVycyA9IG5ldyBBcnJheShzbGljZS5sZW5ndGgpXG4gICAgZm9yIGkgaW4gWzAuLi5zbGljZS5sZW5ndGhdXG4gICAgICBieXRlTnVtYmVyc1tpXSA9IHNsaWNlLmNoYXJDb2RlQXQoaSlcblxuICAgIGJ5dGVBcnJheSA9IG5ldyBVaW50OEFycmF5KGJ5dGVOdW1iZXJzKVxuXG4gICAgYnl0ZUFycmF5cy5wdXNoKGJ5dGVBcnJheSlcblxuICBibG9iID0gbmV3IEJsb2IoYnl0ZUFycmF5cywge3R5cGU6IGNvbnRlbnRUeXBlfSlcbiAgcmV0dXJuIGJsb2JcblxubWFrZUJsb2JVcmwgPSAoc2FtcGxlUmF0ZSwgc2FtcGxlcykgLT5cbiAgd2F2ZSA9IG5ldyBSSUZGV0FWRSBzYW1wbGVSYXRlLCBzYW1wbGVzXG4gIGJsb2IgPSBiNjR0b0Jsb2Iod2F2ZS5iYXNlNjREYXRhLCBcImF1ZGlvL3dhdlwiKVxuICByZXR1cm4gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKVxuXG5tb2R1bGUuZXhwb3J0cyA9XG4gIFJJRkZXQVZFOiBSSUZGV0FWRVxuICB3cml0ZVdBVjogd3JpdGVXQVZcbiAgbWFrZURhdGFVUkk6IG1ha2VEYXRhVVJJXG4gIG1ha2VCbG9iVXJsOiBtYWtlQmxvYlVybFxuIl19
