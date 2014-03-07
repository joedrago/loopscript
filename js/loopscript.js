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
/**
 * The buffer module from node.js, for the browser.
 *
 * Author:   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * License:  MIT
 *
 * `npm install buffer`
 */

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

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
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
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
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

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
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

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

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
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0,
      'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
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

},{}],"./examples":[function(require,module,exports){
module.exports=require('J6p0lP');
},{}],"J6p0lP":[function(require,module,exports){
module.exports = {
  first: "# ------------------------------------------------------------\n# Your first LoopScript. Click \"Compile\" below to start!\n\ntone note1\n  duration 250\n  octave 4\n  note C\n\ntone bass1\n  duration 250\n  octave 1\n  note B\n\nloop loop1\n  pattern note1 x.......x.......\n  pattern bass1 ....x.......x...\n",
  notes: "# ------------------------------------------------------------\n# Note overrides!\n\n# H-L are the black keys:\n#     H I   J K L\n#    C D E F G A B\n\n# Try setting the duration to 100\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  duration 250\n\n# Samples can have their notes overridden too!\nsample ding\n  src samples/ding_e.wav\n  srcnote e\n\nloop loop1\n  pattern note1 b.a.g.a.b.b.b...\n\nloop loop2\n  pattern ding b.a.g.a.b.b.b...\n\ntrack song\n  pattern loop1 x\n  pattern loop2 .x\n",
  motto: "# ------------------------------------------------------------\n# An approximation of the beat from Drake's \"The Motto\"\n\nbpm 100\nsection # to share ADSR\n  adsr 0.005 0.05 0.7 0.05\n  tone bass1 -> octave 1\n  tone bass2 -> octave 2\n\nsample clap  -> src samples/clap.wav\nsample snare -> src samples/snare.wav\nsample hihat -> src samples/hihat.wav\n\nloop loop1\n  pattern hihat ..x.......x.......x.......x.....\n  pattern clap  ....x.......x.......x.......x...\n  pattern snare ......x...x...x.x...............\n  pattern bass1 Bbbbbb..........................\n  pattern bass2 ......HhhhhhDddddd....HhhhJj.Jj.\n\ntrack song\n  pattern loop1 xxxx\n",
  length: "# ------------------------------------------------------------\n# Showing off various note lengths using caps and lowercase\n# Also shows what ADSR can do!\n\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n\ntone note2\n  # Note: Only the first tone has ADSR\n\n# If you use any letters other than \"x\" on a tone pattern, you override its\n# note with the note listed. Also, if you use any capital letters in a pattern,\n# you override the length of that note with the number of matching lowercase\n# letters following it.\n\nloop loop1\n  pattern note1 GgggggggFfffff..AaaaBbb.Cc..D...\n\nloop loop2\n  pattern note2 GgggggggFfffff..AaaaBbb.Cc..D...\n\ntrack song\n  pattern loop1 x.\n  pattern loop2 .x\n",
  chocobo: "# ------------------------------------------------------------\n# The Chocobo Theme (first part only)\n\nbpm 125\n\nsection Tone (in a section to share ADSR)\n  adsr 0.005 0.05 0.7 0.05\n  tone chocobo1\n    octave 5\n  tone chocobo2\n    octave 4\n\nloop loop1\n pattern chocobo1 Dddd......Dd..........................................D.E.Ffffff...\n pattern chocobo2 ....BbGgEe..BbGgBb..Gg..Bbbbbb.AaGgGAG.F.Gggggg.F.GgGB.............\n\ntrack song\n  pattern loop1 xx"
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


},{"../js/jdataview":1,"./freq":"SwjZMG","./riffwave":"XjRWhK","fs":2}],"./riffwave":[function(require,module,exports){
module.exports=require('XjRWhK');
},{}],"XjRWhK":[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCJqZGF0YXZpZXcuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxsaWJcXF9lbXB0eS5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnVmZmVyXFxpbmRleC5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnVmZmVyXFxub2RlX21vZHVsZXNcXGJhc2U2NC1qc1xcbGliXFxiNjQuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJ1ZmZlclxcbm9kZV9tb2R1bGVzXFxpZWVlNzU0XFxpbmRleC5qcyIsIi4uXFxzcmNcXGV4YW1wbGVzLmNvZmZlZSIsIi4uXFxzcmNcXGZyZXEuY29mZmVlIiwiLi5cXHNyY1xcbG9vcHNjcmlwdC5jb2ZmZWUiLCIuLlxcc3JjXFxyaWZmd2F2ZS5jb2ZmZWUiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNXZCQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNwRkEsTUFBTSxDQUFDLE9BQVAsR0FFRTtBQUFBLEVBQUEsS0FBQSxFQUFPLHdUQUFQO0FBQUEsRUFvQkEsS0FBQSxFQUFPLGdmQXBCUDtBQUFBLEVBa0RBLEtBQUEsRUFBTyxtcEJBbERQO0FBQUEsRUE0RUEsTUFBQSxFQUFRLDhyQkE1RVI7QUFBQSxFQXdHQSxPQUFBLEVBQVMsdWRBeEdUO0NBRkYsQ0FBQTs7Ozs7O0FDQUEsSUFBQSxtQ0FBQTs7QUFBQSxTQUFBLEdBQVk7RUFDVjtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtHQURVLEVBUVY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0FSVSxFQXVCVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXZCVSxFQXNDVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXRDVSxFQXFEVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXJEVSxFQW9FVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXBFVSxFQW1GVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQW5GVSxFQWtHVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQWxHVSxFQWlIVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9B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LElBRUEsV0FBQSxHQUFrQixJQUFBLEtBQUEsQ0FBTSxLQUFLLENBQUMsTUFBWixDQUZsQixDQUFBO0FBR0EsU0FBUyxvR0FBVCxHQUFBO0FBQ0UsTUFBQSxXQUFZLENBQUEsQ0FBQSxDQUFaLEdBQWlCLEtBQUssQ0FBQyxVQUFOLENBQWlCLENBQWpCLENBQWpCLENBREY7QUFBQSxLQUhBO0FBQUEsSUFNQSxTQUFBLEdBQWdCLElBQUEsVUFBQSxDQUFXLFdBQVgsQ0FOaEIsQ0FBQTtBQUFBLElBUUEsVUFBVSxDQUFDLElBQVgsQ0FBZ0IsU0FBaEIsQ0FSQSxDQURGO0FBQUEsR0FOQTtBQUFBLEVBaUJBLElBQUEsR0FBVyxJQUFBLElBQUEsQ0FBSyxVQUFMLEVBQWlCO0FBQUEsSUFBQyxJQUFBLEVBQU0sV0FBUDtHQUFqQixDQWpCWCxDQUFBO0FBa0JBLFNBQU8sSUFBUCxDQW5CVTtBQUFBLENBaEhaLENBQUE7O0FBQUEsV0FxSUEsR0FBYyxTQUFDLFVBQUQsRUFBYSxPQUFiLEdBQUE7QUFDWixNQUFBLFVBQUE7QUFBQSxFQUFBLElBQUEsR0FBVyxJQUFBLFFBQUEsQ0FBUyxVQUFULEVBQXFCLE9BQXJCLENBQVgsQ0FBQTtBQUFBLEVBQ0EsSUFBQSxHQUFPLFNBQUEsQ0FBVSxJQUFJLENBQUMsVUFBZixFQUEyQixXQUEzQixDQURQLENBQUE7QUFFQSxTQUFPLEdBQUcsQ0FBQyxlQUFKLENBQW9CLElBQXBCLENBQVAsQ0FIWTtBQUFBLENBcklkLENBQUE7O0FBQUEsTUEwSU0sQ0FBQyxPQUFQLEdBQ0U7QUFBQSxFQUFBLFFBQUEsRUFBVSxRQUFWO0FBQUEsRUFDQSxRQUFBLEVBQVUsUUFEVjtBQUFBLEVBRUEsV0FBQSxFQUFhLFdBRmI7QUFBQSxFQUdBLFdBQUEsRUFBYSxXQUhiO0NBM0lGLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIihmdW5jdGlvbiAoQnVmZmVyKXtcbi8vXG4vLyBqRGF0YVZpZXcgYnkgVmpldXggPHZqZXV4eEBnbWFpbC5jb20+IC0gSmFuIDIwMTBcbi8vIENvbnRpbnVlZCBieSBSUmV2ZXJzZXIgPG1lQHJyZXZlcnNlci5jb20+IC0gRmViIDIwMTNcbi8vXG4vLyBBIHVuaXF1ZSB3YXkgdG8gd29yayB3aXRoIGEgYmluYXJ5IGZpbGUgaW4gdGhlIGJyb3dzZXJcbi8vIGh0dHA6Ly9naXRodWIuY29tL2pEYXRhVmlldy9qRGF0YVZpZXdcbi8vIGh0dHA6Ly9qRGF0YVZpZXcuZ2l0aHViLmlvL1xuXG4oZnVuY3Rpb24gKGdsb2JhbCkge1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBjb21wYXRpYmlsaXR5ID0ge1xuXHQvLyBOb2RlSlMgQnVmZmVyIGluIHYwLjUuNSBhbmQgbmV3ZXJcblx0Tm9kZUJ1ZmZlcjogJ0J1ZmZlcicgaW4gZ2xvYmFsICYmICdyZWFkSW50MTZMRScgaW4gQnVmZmVyLnByb3RvdHlwZSxcblx0RGF0YVZpZXc6ICdEYXRhVmlldycgaW4gZ2xvYmFsICYmIChcblx0XHQnZ2V0RmxvYXQ2NCcgaW4gRGF0YVZpZXcucHJvdG90eXBlIHx8ICAgICAgICAgICAgLy8gQ2hyb21lXG5cdFx0J2dldEZsb2F0NjQnIGluIG5ldyBEYXRhVmlldyhuZXcgQXJyYXlCdWZmZXIoMSkpIC8vIE5vZGVcblx0KSxcblx0QXJyYXlCdWZmZXI6ICdBcnJheUJ1ZmZlcicgaW4gZ2xvYmFsLFxuXHRQaXhlbERhdGE6ICdDYW52YXNQaXhlbEFycmF5JyBpbiBnbG9iYWwgJiYgJ0ltYWdlRGF0YScgaW4gZ2xvYmFsICYmICdkb2N1bWVudCcgaW4gZ2xvYmFsXG59O1xuXG4vLyB3ZSBkb24ndCB3YW50IHRvIGJvdGhlciB3aXRoIG9sZCBCdWZmZXIgaW1wbGVtZW50YXRpb25cbmlmIChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIpIHtcblx0KGZ1bmN0aW9uIChidWZmZXIpIHtcblx0XHR0cnkge1xuXHRcdFx0YnVmZmVyLndyaXRlRmxvYXRMRShJbmZpbml0eSwgMCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyID0gZmFsc2U7XG5cdFx0fVxuXHR9KShuZXcgQnVmZmVyKDQpKTtcbn1cblxuaWYgKGNvbXBhdGliaWxpdHkuUGl4ZWxEYXRhKSB7XG5cdHZhciBjcmVhdGVQaXhlbERhdGEgPSBmdW5jdGlvbiAoYnl0ZUxlbmd0aCwgYnVmZmVyKSB7XG5cdFx0dmFyIGRhdGEgPSBjcmVhdGVQaXhlbERhdGEuY29udGV4dDJkLmNyZWF0ZUltYWdlRGF0YSgoYnl0ZUxlbmd0aCArIDMpIC8gNCwgMSkuZGF0YTtcblx0XHRkYXRhLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoO1xuXHRcdGlmIChidWZmZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBieXRlTGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0ZGF0YVtpXSA9IGJ1ZmZlcltpXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH07XG5cdGNyZWF0ZVBpeGVsRGF0YS5jb250ZXh0MmQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKS5nZXRDb250ZXh0KCcyZCcpO1xufVxuXG52YXIgZGF0YVR5cGVzID0ge1xuXHQnSW50OCc6IDEsXG5cdCdJbnQxNic6IDIsXG5cdCdJbnQzMic6IDQsXG5cdCdVaW50OCc6IDEsXG5cdCdVaW50MTYnOiAyLFxuXHQnVWludDMyJzogNCxcblx0J0Zsb2F0MzInOiA0LFxuXHQnRmxvYXQ2NCc6IDhcbn07XG5cbnZhciBub2RlTmFtaW5nID0ge1xuXHQnSW50OCc6ICdJbnQ4Jyxcblx0J0ludDE2JzogJ0ludDE2Jyxcblx0J0ludDMyJzogJ0ludDMyJyxcblx0J1VpbnQ4JzogJ1VJbnQ4Jyxcblx0J1VpbnQxNic6ICdVSW50MTYnLFxuXHQnVWludDMyJzogJ1VJbnQzMicsXG5cdCdGbG9hdDMyJzogJ0Zsb2F0Jyxcblx0J0Zsb2F0NjQnOiAnRG91YmxlJ1xufTtcblxuZnVuY3Rpb24gYXJyYXlGcm9tKGFycmF5TGlrZSwgZm9yY2VDb3B5KSB7XG5cdHJldHVybiAoIWZvcmNlQ29weSAmJiAoYXJyYXlMaWtlIGluc3RhbmNlb2YgQXJyYXkpKSA/IGFycmF5TGlrZSA6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFycmF5TGlrZSk7XG59XG5cbmZ1bmN0aW9uIGRlZmluZWQodmFsdWUsIGRlZmF1bHRWYWx1ZSkge1xuXHRyZXR1cm4gdmFsdWUgIT09IHVuZGVmaW5lZCA/IHZhbHVlIDogZGVmYXVsdFZhbHVlO1xufVxuXG5mdW5jdGlvbiBqRGF0YVZpZXcoYnVmZmVyLCBieXRlT2Zmc2V0LCBieXRlTGVuZ3RoLCBsaXR0bGVFbmRpYW4pIHtcblx0LyoganNoaW50IHZhbGlkdGhpczp0cnVlICovXG5cblx0aWYgKGJ1ZmZlciBpbnN0YW5jZW9mIGpEYXRhVmlldykge1xuXHRcdHZhciByZXN1bHQgPSBidWZmZXIuc2xpY2UoYnl0ZU9mZnNldCwgYnl0ZU9mZnNldCArIGJ5dGVMZW5ndGgpO1xuXHRcdHJlc3VsdC5fbGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHJlc3VsdC5fbGl0dGxlRW5kaWFuKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0aWYgKCEodGhpcyBpbnN0YW5jZW9mIGpEYXRhVmlldykpIHtcblx0XHRyZXR1cm4gbmV3IGpEYXRhVmlldyhidWZmZXIsIGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgsIGxpdHRsZUVuZGlhbik7XG5cdH1cblxuXHR0aGlzLmJ1ZmZlciA9IGJ1ZmZlciA9IGpEYXRhVmlldy53cmFwQnVmZmVyKGJ1ZmZlcik7XG5cblx0Ly8gQ2hlY2sgcGFyYW1ldGVycyBhbmQgZXhpc3RpbmcgZnVuY3Rpb25uYWxpdGllc1xuXHR0aGlzLl9pc0FycmF5QnVmZmVyID0gY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlciAmJiBidWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcjtcblx0dGhpcy5faXNQaXhlbERhdGEgPSBjb21wYXRpYmlsaXR5LlBpeGVsRGF0YSAmJiBidWZmZXIgaW5zdGFuY2VvZiBDYW52YXNQaXhlbEFycmF5O1xuXHR0aGlzLl9pc0RhdGFWaWV3ID0gY29tcGF0aWJpbGl0eS5EYXRhVmlldyAmJiB0aGlzLl9pc0FycmF5QnVmZmVyO1xuXHR0aGlzLl9pc05vZGVCdWZmZXIgPSBjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIgJiYgYnVmZmVyIGluc3RhbmNlb2YgQnVmZmVyO1xuXG5cdC8vIEhhbmRsZSBUeXBlIEVycm9yc1xuXHRpZiAoIXRoaXMuX2lzTm9kZUJ1ZmZlciAmJiAhdGhpcy5faXNBcnJheUJ1ZmZlciAmJiAhdGhpcy5faXNQaXhlbERhdGEgJiYgIShidWZmZXIgaW5zdGFuY2VvZiBBcnJheSkpIHtcblx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdqRGF0YVZpZXcgYnVmZmVyIGhhcyBhbiBpbmNvbXBhdGlibGUgdHlwZScpO1xuXHR9XG5cblx0Ly8gRGVmYXVsdCBWYWx1ZXNcblx0dGhpcy5fbGl0dGxlRW5kaWFuID0gISFsaXR0bGVFbmRpYW47XG5cblx0dmFyIGJ1ZmZlckxlbmd0aCA9ICdieXRlTGVuZ3RoJyBpbiBidWZmZXIgPyBidWZmZXIuYnl0ZUxlbmd0aCA6IGJ1ZmZlci5sZW5ndGg7XG5cdHRoaXMuYnl0ZU9mZnNldCA9IGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIDApO1xuXHR0aGlzLmJ5dGVMZW5ndGggPSBieXRlTGVuZ3RoID0gZGVmaW5lZChieXRlTGVuZ3RoLCBidWZmZXJMZW5ndGggLSBieXRlT2Zmc2V0KTtcblxuXHRpZiAoIXRoaXMuX2lzRGF0YVZpZXcpIHtcblx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBieXRlTGVuZ3RoLCBidWZmZXJMZW5ndGgpO1xuXHR9IGVsc2Uge1xuXHRcdHRoaXMuX3ZpZXcgPSBuZXcgRGF0YVZpZXcoYnVmZmVyLCBieXRlT2Zmc2V0LCBieXRlTGVuZ3RoKTtcblx0fVxuXG5cdC8vIENyZWF0ZSB1bmlmb3JtIG1ldGhvZHMgKGFjdGlvbiB3cmFwcGVycykgZm9yIHRoZSBmb2xsb3dpbmcgZGF0YSB0eXBlc1xuXG5cdHRoaXMuX2VuZ2luZUFjdGlvbiA9XG5cdFx0dGhpcy5faXNEYXRhVmlld1xuXHRcdFx0PyB0aGlzLl9kYXRhVmlld0FjdGlvblxuXHRcdDogdGhpcy5faXNOb2RlQnVmZmVyXG5cdFx0XHQ/IHRoaXMuX25vZGVCdWZmZXJBY3Rpb25cblx0XHQ6IHRoaXMuX2lzQXJyYXlCdWZmZXJcblx0XHRcdD8gdGhpcy5fYXJyYXlCdWZmZXJBY3Rpb25cblx0XHQ6IHRoaXMuX2FycmF5QWN0aW9uO1xufVxuXG5mdW5jdGlvbiBnZXRDaGFyQ29kZXMoc3RyaW5nKSB7XG5cdGlmIChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIpIHtcblx0XHRyZXR1cm4gbmV3IEJ1ZmZlcihzdHJpbmcsICdiaW5hcnknKTtcblx0fVxuXG5cdHZhciBUeXBlID0gY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlciA/IFVpbnQ4QXJyYXkgOiBBcnJheSxcblx0XHRjb2RlcyA9IG5ldyBUeXBlKHN0cmluZy5sZW5ndGgpO1xuXG5cdGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBzdHJpbmcubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRjb2Rlc1tpXSA9IHN0cmluZy5jaGFyQ29kZUF0KGkpICYgMHhmZjtcblx0fVxuXHRyZXR1cm4gY29kZXM7XG59XG5cbi8vIG1vc3RseSBpbnRlcm5hbCBmdW5jdGlvbiBmb3Igd3JhcHBpbmcgYW55IHN1cHBvcnRlZCBpbnB1dCAoU3RyaW5nIG9yIEFycmF5LWxpa2UpIHRvIGJlc3Qgc3VpdGFibGUgYnVmZmVyIGZvcm1hdFxuakRhdGFWaWV3LndyYXBCdWZmZXIgPSBmdW5jdGlvbiAoYnVmZmVyKSB7XG5cdHN3aXRjaCAodHlwZW9mIGJ1ZmZlcikge1xuXHRcdGNhc2UgJ251bWJlcic6XG5cdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyKSB7XG5cdFx0XHRcdGJ1ZmZlciA9IG5ldyBCdWZmZXIoYnVmZmVyKTtcblx0XHRcdFx0YnVmZmVyLmZpbGwoMCk7XG5cdFx0XHR9IGVsc2Vcblx0XHRcdGlmIChjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyKSB7XG5cdFx0XHRcdGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KGJ1ZmZlcikuYnVmZmVyO1xuXHRcdFx0fSBlbHNlXG5cdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5QaXhlbERhdGEpIHtcblx0XHRcdFx0YnVmZmVyID0gY3JlYXRlUGl4ZWxEYXRhKGJ1ZmZlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRidWZmZXIgPSBuZXcgQXJyYXkoYnVmZmVyKTtcblx0XHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBidWZmZXIubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRidWZmZXJbaV0gPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYnVmZmVyO1xuXG5cdFx0Y2FzZSAnc3RyaW5nJzpcblx0XHRcdGJ1ZmZlciA9IGdldENoYXJDb2RlcyhidWZmZXIpO1xuXHRcdFx0LyogZmFsbHMgdGhyb3VnaCAqL1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRpZiAoJ2xlbmd0aCcgaW4gYnVmZmVyICYmICEoKGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlciAmJiBidWZmZXIgaW5zdGFuY2VvZiBCdWZmZXIpIHx8IChjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyICYmIGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSB8fCAoY29tcGF0aWJpbGl0eS5QaXhlbERhdGEgJiYgYnVmZmVyIGluc3RhbmNlb2YgQ2FudmFzUGl4ZWxBcnJheSkpKSB7XG5cdFx0XHRcdGlmIChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIpIHtcblx0XHRcdFx0XHRidWZmZXIgPSBuZXcgQnVmZmVyKGJ1ZmZlcik7XG5cdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5BcnJheUJ1ZmZlcikge1xuXHRcdFx0XHRcdGlmICghKGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSkge1xuXHRcdFx0XHRcdFx0YnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKS5idWZmZXI7XG5cdFx0XHRcdFx0XHQvLyBidWcgaW4gTm9kZS5qcyA8PSAwLjg6XG5cdFx0XHRcdFx0XHRpZiAoIShidWZmZXIgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikpIHtcblx0XHRcdFx0XHRcdFx0YnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoYXJyYXlGcm9tKGJ1ZmZlciwgdHJ1ZSkpLmJ1ZmZlcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZVxuXHRcdFx0XHRpZiAoY29tcGF0aWJpbGl0eS5QaXhlbERhdGEpIHtcblx0XHRcdFx0XHRidWZmZXIgPSBjcmVhdGVQaXhlbERhdGEoYnVmZmVyLmxlbmd0aCwgYnVmZmVyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRidWZmZXIgPSBhcnJheUZyb20oYnVmZmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJ1ZmZlcjtcblx0fVxufTtcblxuZnVuY3Rpb24gcG93MihuKSB7XG5cdHJldHVybiAobiA+PSAwICYmIG4gPCAzMSkgPyAoMSA8PCBuKSA6IChwb3cyW25dIHx8IChwb3cyW25dID0gTWF0aC5wb3coMiwgbikpKTtcbn1cblxuLy8gbGVmdCBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuakRhdGFWaWV3LmNyZWF0ZUJ1ZmZlciA9IGZ1bmN0aW9uICgpIHtcblx0cmV0dXJuIGpEYXRhVmlldy53cmFwQnVmZmVyKGFyZ3VtZW50cyk7XG59O1xuXG5mdW5jdGlvbiBVaW50NjQobG8sIGhpKSB7XG5cdHRoaXMubG8gPSBsbztcblx0dGhpcy5oaSA9IGhpO1xufVxuXG5qRGF0YVZpZXcuVWludDY0ID0gVWludDY0O1xuXG5VaW50NjQucHJvdG90eXBlID0ge1xuXHR2YWx1ZU9mOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRoaXMubG8gKyBwb3cyKDMyKSAqIHRoaXMuaGk7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gTnVtYmVyLnByb3RvdHlwZS50b1N0cmluZy5hcHBseSh0aGlzLnZhbHVlT2YoKSwgYXJndW1lbnRzKTtcblx0fVxufTtcblxuVWludDY0LmZyb21OdW1iZXIgPSBmdW5jdGlvbiAobnVtYmVyKSB7XG5cdHZhciBoaSA9IE1hdGguZmxvb3IobnVtYmVyIC8gcG93MigzMikpLFxuXHRcdGxvID0gbnVtYmVyIC0gaGkgKiBwb3cyKDMyKTtcblxuXHRyZXR1cm4gbmV3IFVpbnQ2NChsbywgaGkpO1xufTtcblxuZnVuY3Rpb24gSW50NjQobG8sIGhpKSB7XG5cdFVpbnQ2NC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xufVxuXG5qRGF0YVZpZXcuSW50NjQgPSBJbnQ2NDtcblxuSW50NjQucHJvdG90eXBlID0gJ2NyZWF0ZScgaW4gT2JqZWN0ID8gT2JqZWN0LmNyZWF0ZShVaW50NjQucHJvdG90eXBlKSA6IG5ldyBVaW50NjQoKTtcblxuSW50NjQucHJvdG90eXBlLnZhbHVlT2YgPSBmdW5jdGlvbiAoKSB7XG5cdGlmICh0aGlzLmhpIDwgcG93MigzMSkpIHtcblx0XHRyZXR1cm4gVWludDY0LnByb3RvdHlwZS52YWx1ZU9mLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdH1cblx0cmV0dXJuIC0oKHBvdzIoMzIpIC0gdGhpcy5sbykgKyBwb3cyKDMyKSAqIChwb3cyKDMyKSAtIDEgLSB0aGlzLmhpKSk7XG59O1xuXG5JbnQ2NC5mcm9tTnVtYmVyID0gZnVuY3Rpb24gKG51bWJlcikge1xuXHR2YXIgbG8sIGhpO1xuXHRpZiAobnVtYmVyID49IDApIHtcblx0XHR2YXIgdW5zaWduZWQgPSBVaW50NjQuZnJvbU51bWJlcihudW1iZXIpO1xuXHRcdGxvID0gdW5zaWduZWQubG87XG5cdFx0aGkgPSB1bnNpZ25lZC5oaTtcblx0fSBlbHNlIHtcblx0XHRoaSA9IE1hdGguZmxvb3IobnVtYmVyIC8gcG93MigzMikpO1xuXHRcdGxvID0gbnVtYmVyIC0gaGkgKiBwb3cyKDMyKTtcblx0XHRoaSArPSBwb3cyKDMyKTtcblx0fVxuXHRyZXR1cm4gbmV3IEludDY0KGxvLCBoaSk7XG59O1xuXG5qRGF0YVZpZXcucHJvdG90eXBlID0ge1xuXHRfb2Zmc2V0OiAwLFxuXHRfYml0T2Zmc2V0OiAwLFxuXG5cdGNvbXBhdGliaWxpdHk6IGNvbXBhdGliaWxpdHksXG5cblx0X2NoZWNrQm91bmRzOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCwgbWF4TGVuZ3RoKSB7XG5cdFx0Ly8gRG8gYWRkaXRpb25hbCBjaGVja3MgdG8gc2ltdWxhdGUgRGF0YVZpZXdcblx0XHRpZiAodHlwZW9mIGJ5dGVPZmZzZXQgIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdPZmZzZXQgaXMgbm90IGEgbnVtYmVyLicpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGJ5dGVMZW5ndGggIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdTaXplIGlzIG5vdCBhIG51bWJlci4nKTtcblx0XHR9XG5cdFx0aWYgKGJ5dGVMZW5ndGggPCAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgUmFuZ2VFcnJvcignTGVuZ3RoIGlzIG5lZ2F0aXZlLicpO1xuXHRcdH1cblx0XHRpZiAoYnl0ZU9mZnNldCA8IDAgfHwgYnl0ZU9mZnNldCArIGJ5dGVMZW5ndGggPiBkZWZpbmVkKG1heExlbmd0aCwgdGhpcy5ieXRlTGVuZ3RoKSkge1xuXHRcdFx0dGhyb3cgbmV3IFJhbmdlRXJyb3IoJ09mZnNldHMgYXJlIG91dCBvZiBib3VuZHMuJyk7XG5cdFx0fVxuXHR9LFxuXG5cdF9hY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHRyZXR1cm4gdGhpcy5fZW5naW5lQWN0aW9uKFxuXHRcdFx0dHlwZSxcblx0XHRcdGlzUmVhZEFjdGlvbixcblx0XHRcdGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KSxcblx0XHRcdGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pLFxuXHRcdFx0dmFsdWVcblx0XHQpO1xuXHR9LFxuXG5cdF9kYXRhVmlld0FjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdC8vIE1vdmUgdGhlIGludGVybmFsIG9mZnNldCBmb3J3YXJkXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIGRhdGFUeXBlc1t0eXBlXTtcblx0XHRyZXR1cm4gaXNSZWFkQWN0aW9uID8gdGhpcy5fdmlld1snZ2V0JyArIHR5cGVdKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikgOiB0aGlzLl92aWV3WydzZXQnICsgdHlwZV0oYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X25vZGVCdWZmZXJBY3Rpb246IGZ1bmN0aW9uICh0eXBlLCBpc1JlYWRBY3Rpb24sIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdmFsdWUpIHtcblx0XHQvLyBNb3ZlIHRoZSBpbnRlcm5hbCBvZmZzZXQgZm9yd2FyZFxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyBkYXRhVHlwZXNbdHlwZV07XG5cdFx0dmFyIG5vZGVOYW1lID0gbm9kZU5hbWluZ1t0eXBlXSArICgodHlwZSA9PT0gJ0ludDgnIHx8IHR5cGUgPT09ICdVaW50OCcpID8gJycgOiBsaXR0bGVFbmRpYW4gPyAnTEUnIDogJ0JFJyk7XG5cdFx0Ynl0ZU9mZnNldCArPSB0aGlzLmJ5dGVPZmZzZXQ7XG5cdFx0cmV0dXJuIGlzUmVhZEFjdGlvbiA/IHRoaXMuYnVmZmVyWydyZWFkJyArIG5vZGVOYW1lXShieXRlT2Zmc2V0KSA6IHRoaXMuYnVmZmVyWyd3cml0ZScgKyBub2RlTmFtZV0odmFsdWUsIGJ5dGVPZmZzZXQpO1xuXHR9LFxuXG5cdF9hcnJheUJ1ZmZlckFjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdHZhciBzaXplID0gZGF0YVR5cGVzW3R5cGVdLCBUeXBlZEFycmF5ID0gZ2xvYmFsW3R5cGUgKyAnQXJyYXknXSwgdHlwZWRBcnJheTtcblxuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXG5cdFx0Ly8gQXJyYXlCdWZmZXI6IHdlIHVzZSBhIHR5cGVkIGFycmF5IG9mIHNpemUgMSBmcm9tIG9yaWdpbmFsIGJ1ZmZlciBpZiBhbGlnbm1lbnQgaXMgZ29vZCBhbmQgZnJvbSBzbGljZSB3aGVuIGl0J3Mgbm90XG5cdFx0aWYgKHNpemUgPT09IDEgfHwgKCh0aGlzLmJ5dGVPZmZzZXQgKyBieXRlT2Zmc2V0KSAlIHNpemUgPT09IDAgJiYgbGl0dGxlRW5kaWFuKSkge1xuXHRcdFx0dHlwZWRBcnJheSA9IG5ldyBUeXBlZEFycmF5KHRoaXMuYnVmZmVyLCB0aGlzLmJ5dGVPZmZzZXQgKyBieXRlT2Zmc2V0LCAxKTtcblx0XHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyBzaXplO1xuXHRcdFx0cmV0dXJuIGlzUmVhZEFjdGlvbiA/IHR5cGVkQXJyYXlbMF0gOiAodHlwZWRBcnJheVswXSA9IHZhbHVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoaXNSZWFkQWN0aW9uID8gdGhpcy5nZXRCeXRlcyhzaXplLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpIDogc2l6ZSk7XG5cdFx0XHR0eXBlZEFycmF5ID0gbmV3IFR5cGVkQXJyYXkoYnl0ZXMuYnVmZmVyLCAwLCAxKTtcblxuXHRcdFx0aWYgKGlzUmVhZEFjdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdHlwZWRBcnJheVswXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHR5cGVkQXJyYXlbMF0gPSB2YWx1ZTtcblx0XHRcdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgYnl0ZXMsIGxpdHRsZUVuZGlhbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxuXG5cdF9hcnJheUFjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdHJldHVybiBpc1JlYWRBY3Rpb24gPyB0aGlzWydfZ2V0JyArIHR5cGVdKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikgOiB0aGlzWydfc2V0JyArIHR5cGVdKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdC8vIEhlbHBlcnNcblxuXHRfZ2V0Qnl0ZXM6IGZ1bmN0aW9uIChsZW5ndGgsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cdFx0bGVuZ3RoID0gZGVmaW5lZChsZW5ndGgsIHRoaXMuYnl0ZUxlbmd0aCAtIGJ5dGVPZmZzZXQpO1xuXG5cdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgbGVuZ3RoKTtcblxuXHRcdGJ5dGVPZmZzZXQgKz0gdGhpcy5ieXRlT2Zmc2V0O1xuXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCAtIHRoaXMuYnl0ZU9mZnNldCArIGxlbmd0aDtcblxuXHRcdHZhciByZXN1bHQgPSB0aGlzLl9pc0FycmF5QnVmZmVyXG5cdFx0XHRcdFx0ID8gbmV3IFVpbnQ4QXJyYXkodGhpcy5idWZmZXIsIGJ5dGVPZmZzZXQsIGxlbmd0aClcblx0XHRcdFx0XHQgOiAodGhpcy5idWZmZXIuc2xpY2UgfHwgQXJyYXkucHJvdG90eXBlLnNsaWNlKS5jYWxsKHRoaXMuYnVmZmVyLCBieXRlT2Zmc2V0LCBieXRlT2Zmc2V0ICsgbGVuZ3RoKTtcblxuXHRcdHJldHVybiBsaXR0bGVFbmRpYW4gfHwgbGVuZ3RoIDw9IDEgPyByZXN1bHQgOiBhcnJheUZyb20ocmVzdWx0KS5yZXZlcnNlKCk7XG5cdH0sXG5cblx0Ly8gd3JhcHBlciBmb3IgZXh0ZXJuYWwgY2FsbHMgKGRvIG5vdCByZXR1cm4gaW5uZXIgYnVmZmVyIGRpcmVjdGx5IHRvIHByZXZlbnQgaXQncyBtb2RpZnlpbmcpXG5cdGdldEJ5dGVzOiBmdW5jdGlvbiAobGVuZ3RoLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRvQXJyYXkpIHtcblx0XHR2YXIgcmVzdWx0ID0gdGhpcy5fZ2V0Qnl0ZXMobGVuZ3RoLCBieXRlT2Zmc2V0LCBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdHJ1ZSkpO1xuXHRcdHJldHVybiB0b0FycmF5ID8gYXJyYXlGcm9tKHJlc3VsdCkgOiByZXN1bHQ7XG5cdH0sXG5cblx0X3NldEJ5dGVzOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgYnl0ZXMsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBsZW5ndGggPSBieXRlcy5sZW5ndGg7XG5cblx0XHQvLyBuZWVkZWQgZm9yIE9wZXJhXG5cdFx0aWYgKGxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cblx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBsZW5ndGgpO1xuXG5cdFx0aWYgKCFsaXR0bGVFbmRpYW4gJiYgbGVuZ3RoID4gMSkge1xuXHRcdFx0Ynl0ZXMgPSBhcnJheUZyb20oYnl0ZXMsIHRydWUpLnJldmVyc2UoKTtcblx0XHR9XG5cblx0XHRieXRlT2Zmc2V0ICs9IHRoaXMuYnl0ZU9mZnNldDtcblxuXHRcdGlmICh0aGlzLl9pc0FycmF5QnVmZmVyKSB7XG5cdFx0XHRuZXcgVWludDhBcnJheSh0aGlzLmJ1ZmZlciwgYnl0ZU9mZnNldCwgbGVuZ3RoKS5zZXQoYnl0ZXMpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGlmICh0aGlzLl9pc05vZGVCdWZmZXIpIHtcblx0XHRcdFx0bmV3IEJ1ZmZlcihieXRlcykuY29weSh0aGlzLmJ1ZmZlciwgYnl0ZU9mZnNldCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0dGhpcy5idWZmZXJbYnl0ZU9mZnNldCArIGldID0gYnl0ZXNbaV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0IC0gdGhpcy5ieXRlT2Zmc2V0ICsgbGVuZ3RoO1xuXHR9LFxuXG5cdHNldEJ5dGVzOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgYnl0ZXMsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIGJ5dGVzLCBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdHJ1ZSkpO1xuXHR9LFxuXG5cdGdldFN0cmluZzogZnVuY3Rpb24gKGJ5dGVMZW5ndGgsIGJ5dGVPZmZzZXQsIGVuY29kaW5nKSB7XG5cdFx0aWYgKHRoaXMuX2lzTm9kZUJ1ZmZlcikge1xuXHRcdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblx0XHRcdGJ5dGVMZW5ndGggPSBkZWZpbmVkKGJ5dGVMZW5ndGgsIHRoaXMuYnl0ZUxlbmd0aCAtIGJ5dGVPZmZzZXQpO1xuXG5cdFx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBieXRlTGVuZ3RoKTtcblxuXHRcdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIGJ5dGVMZW5ndGg7XG5cdFx0XHRyZXR1cm4gdGhpcy5idWZmZXIudG9TdHJpbmcoZW5jb2RpbmcgfHwgJ2JpbmFyeScsIHRoaXMuYnl0ZU9mZnNldCArIGJ5dGVPZmZzZXQsIHRoaXMuYnl0ZU9mZnNldCArIHRoaXMuX29mZnNldCk7XG5cdFx0fVxuXHRcdHZhciBieXRlcyA9IHRoaXMuX2dldEJ5dGVzKGJ5dGVMZW5ndGgsIGJ5dGVPZmZzZXQsIHRydWUpLCBzdHJpbmcgPSAnJztcblx0XHRieXRlTGVuZ3RoID0gYnl0ZXMubGVuZ3RoO1xuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZUxlbmd0aDsgaSsrKSB7XG5cdFx0XHRzdHJpbmcgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSk7XG5cdFx0fVxuXHRcdGlmIChlbmNvZGluZyA9PT0gJ3V0ZjgnKSB7XG5cdFx0XHRzdHJpbmcgPSBkZWNvZGVVUklDb21wb25lbnQoZXNjYXBlKHN0cmluZykpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RyaW5nO1xuXHR9LFxuXG5cdHNldFN0cmluZzogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHN1YlN0cmluZywgZW5jb2RpbmcpIHtcblx0XHRpZiAodGhpcy5faXNOb2RlQnVmZmVyKSB7XG5cdFx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXHRcdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgc3ViU3RyaW5nLmxlbmd0aCk7XG5cdFx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgdGhpcy5idWZmZXIud3JpdGUoc3ViU3RyaW5nLCB0aGlzLmJ5dGVPZmZzZXQgKyBieXRlT2Zmc2V0LCBlbmNvZGluZyB8fCAnYmluYXJ5Jyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlbmNvZGluZyA9PT0gJ3V0ZjgnKSB7XG5cdFx0XHRzdWJTdHJpbmcgPSB1bmVzY2FwZShlbmNvZGVVUklDb21wb25lbnQoc3ViU3RyaW5nKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIGdldENoYXJDb2RlcyhzdWJTdHJpbmcpLCB0cnVlKTtcblx0fSxcblxuXHRnZXRDaGFyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCkge1xuXHRcdHJldHVybiB0aGlzLmdldFN0cmluZygxLCBieXRlT2Zmc2V0KTtcblx0fSxcblxuXHRzZXRDaGFyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgY2hhcmFjdGVyKSB7XG5cdFx0dGhpcy5zZXRTdHJpbmcoYnl0ZU9mZnNldCwgY2hhcmFjdGVyKTtcblx0fSxcblxuXHR0ZWxsOiBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX29mZnNldDtcblx0fSxcblxuXHRzZWVrOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCkge1xuXHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIDApO1xuXHRcdC8qIGpzaGludCBib3NzOiB0cnVlICovXG5cdFx0cmV0dXJuIHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQ7XG5cdH0sXG5cblx0c2tpcDogZnVuY3Rpb24gKGJ5dGVMZW5ndGgpIHtcblx0XHRyZXR1cm4gdGhpcy5zZWVrKHRoaXMuX29mZnNldCArIGJ5dGVMZW5ndGgpO1xuXHR9LFxuXG5cdHNsaWNlOiBmdW5jdGlvbiAoc3RhcnQsIGVuZCwgZm9yY2VDb3B5KSB7XG5cdFx0ZnVuY3Rpb24gbm9ybWFsaXplT2Zmc2V0KG9mZnNldCwgYnl0ZUxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG9mZnNldCA8IDAgPyBvZmZzZXQgKyBieXRlTGVuZ3RoIDogb2Zmc2V0O1xuXHRcdH1cblxuXHRcdHN0YXJ0ID0gbm9ybWFsaXplT2Zmc2V0KHN0YXJ0LCB0aGlzLmJ5dGVMZW5ndGgpO1xuXHRcdGVuZCA9IG5vcm1hbGl6ZU9mZnNldChkZWZpbmVkKGVuZCwgdGhpcy5ieXRlTGVuZ3RoKSwgdGhpcy5ieXRlTGVuZ3RoKTtcblxuXHRcdHJldHVybiBmb3JjZUNvcHlcblx0XHRcdCAgID8gbmV3IGpEYXRhVmlldyh0aGlzLmdldEJ5dGVzKGVuZCAtIHN0YXJ0LCBzdGFydCwgdHJ1ZSwgdHJ1ZSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLl9saXR0bGVFbmRpYW4pXG5cdFx0XHQgICA6IG5ldyBqRGF0YVZpZXcodGhpcy5idWZmZXIsIHRoaXMuYnl0ZU9mZnNldCArIHN0YXJ0LCBlbmQgLSBzdGFydCwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRhbGlnbkJ5OiBmdW5jdGlvbiAoYnl0ZUNvdW50KSB7XG5cdFx0dGhpcy5fYml0T2Zmc2V0ID0gMDtcblx0XHRpZiAoZGVmaW5lZChieXRlQ291bnQsIDEpICE9PSAxKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5za2lwKGJ5dGVDb3VudCAtICh0aGlzLl9vZmZzZXQgJSBieXRlQ291bnQgfHwgYnl0ZUNvdW50KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9vZmZzZXQ7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIENvbXBhdGliaWxpdHkgZnVuY3Rpb25zXG5cblx0X2dldEZsb2F0NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgYiA9IHRoaXMuX2dldEJ5dGVzKDgsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiksXG5cblx0XHRcdHNpZ24gPSAxIC0gKDIgKiAoYls3XSA+PiA3KSksXG5cdFx0XHRleHBvbmVudCA9ICgoKChiWzddIDw8IDEpICYgMHhmZikgPDwgMykgfCAoYls2XSA+PiA0KSkgLSAoKDEgPDwgMTApIC0gMSksXG5cblx0XHQvLyBCaW5hcnkgb3BlcmF0b3JzIHN1Y2ggYXMgfCBhbmQgPDwgb3BlcmF0ZSBvbiAzMiBiaXQgdmFsdWVzLCB1c2luZyArIGFuZCBNYXRoLnBvdygyKSBpbnN0ZWFkXG5cdFx0XHRtYW50aXNzYSA9ICgoYls2XSAmIDB4MGYpICogcG93Mig0OCkpICsgKGJbNV0gKiBwb3cyKDQwKSkgKyAoYls0XSAqIHBvdzIoMzIpKSArXG5cdFx0XHRcdFx0XHQoYlszXSAqIHBvdzIoMjQpKSArIChiWzJdICogcG93MigxNikpICsgKGJbMV0gKiBwb3cyKDgpKSArIGJbMF07XG5cblx0XHRpZiAoZXhwb25lbnQgPT09IDEwMjQpIHtcblx0XHRcdGlmIChtYW50aXNzYSAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gTmFOO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHNpZ24gKiBJbmZpbml0eTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXhwb25lbnQgPT09IC0xMDIzKSB7IC8vIERlbm9ybWFsaXplZFxuXHRcdFx0cmV0dXJuIHNpZ24gKiBtYW50aXNzYSAqIHBvdzIoLTEwMjIgLSA1Mik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNpZ24gKiAoMSArIG1hbnRpc3NhICogcG93MigtNTIpKSAqIHBvdzIoZXhwb25lbnQpO1xuXHR9LFxuXG5cdF9nZXRGbG9hdDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGIgPSB0aGlzLl9nZXRCeXRlcyg0LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pLFxuXG5cdFx0XHRzaWduID0gMSAtICgyICogKGJbM10gPj4gNykpLFxuXHRcdFx0ZXhwb25lbnQgPSAoKChiWzNdIDw8IDEpICYgMHhmZikgfCAoYlsyXSA+PiA3KSkgLSAxMjcsXG5cdFx0XHRtYW50aXNzYSA9ICgoYlsyXSAmIDB4N2YpIDw8IDE2KSB8IChiWzFdIDw8IDgpIHwgYlswXTtcblxuXHRcdGlmIChleHBvbmVudCA9PT0gMTI4KSB7XG5cdFx0XHRpZiAobWFudGlzc2EgIT09IDApIHtcblx0XHRcdFx0cmV0dXJuIE5hTjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBzaWduICogSW5maW5pdHk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGV4cG9uZW50ID09PSAtMTI3KSB7IC8vIERlbm9ybWFsaXplZFxuXHRcdFx0cmV0dXJuIHNpZ24gKiBtYW50aXNzYSAqIHBvdzIoLTEyNiAtIDIzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc2lnbiAqICgxICsgbWFudGlzc2EgKiBwb3cyKC0yMykpICogcG93MihleHBvbmVudCk7XG5cdH0sXG5cblx0X2dldDY0OiBmdW5jdGlvbiAoVHlwZSwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0bGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblxuXHRcdHZhciBwYXJ0cyA9IGxpdHRsZUVuZGlhbiA/IFswLCA0XSA6IFs0LCAwXTtcblxuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgMjsgaSsrKSB7XG5cdFx0XHRwYXJ0c1tpXSA9IHRoaXMuZ2V0VWludDMyKGJ5dGVPZmZzZXQgKyBwYXJ0c1tpXSwgbGl0dGxlRW5kaWFuKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgODtcblxuXHRcdHJldHVybiBuZXcgVHlwZShwYXJ0c1swXSwgcGFydHNbMV0pO1xuXHR9LFxuXG5cdGdldEludDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldDY0KEludDY0LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdGdldFVpbnQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHJldHVybiB0aGlzLl9nZXQ2NChVaW50NjQsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X2dldEludDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGIgPSB0aGlzLl9nZXRCeXRlcyg0LCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pO1xuXHRcdHJldHVybiAoYlszXSA8PCAyNCkgfCAoYlsyXSA8PCAxNikgfCAoYlsxXSA8PCA4KSB8IGJbMF07XG5cdH0sXG5cblx0X2dldFVpbnQzMjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHJldHVybiB0aGlzLl9nZXRJbnQzMihieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pID4+PiAwO1xuXHR9LFxuXG5cdF9nZXRJbnQxNjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHJldHVybiAodGhpcy5fZ2V0VWludDE2KGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikgPDwgMTYpID4+IDE2O1xuXHR9LFxuXG5cdF9nZXRVaW50MTY6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgYiA9IHRoaXMuX2dldEJ5dGVzKDIsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdFx0cmV0dXJuIChiWzFdIDw8IDgpIHwgYlswXTtcblx0fSxcblxuXHRfZ2V0SW50ODogZnVuY3Rpb24gKGJ5dGVPZmZzZXQpIHtcblx0XHRyZXR1cm4gKHRoaXMuX2dldFVpbnQ4KGJ5dGVPZmZzZXQpIDw8IDI0KSA+PiAyNDtcblx0fSxcblxuXHRfZ2V0VWludDg6IGZ1bmN0aW9uIChieXRlT2Zmc2V0KSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEJ5dGVzKDEsIGJ5dGVPZmZzZXQpWzBdO1xuXHR9LFxuXG5cdF9nZXRCaXRSYW5nZURhdGE6IGZ1bmN0aW9uIChiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpIHtcblx0XHR2YXIgc3RhcnRCaXQgPSAoZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpIDw8IDMpICsgdGhpcy5fYml0T2Zmc2V0LFxuXHRcdFx0ZW5kQml0ID0gc3RhcnRCaXQgKyBiaXRMZW5ndGgsXG5cdFx0XHRzdGFydCA9IHN0YXJ0Qml0ID4+PiAzLFxuXHRcdFx0ZW5kID0gKGVuZEJpdCArIDcpID4+PiAzLFxuXHRcdFx0YiA9IHRoaXMuX2dldEJ5dGVzKGVuZCAtIHN0YXJ0LCBzdGFydCwgdHJ1ZSksXG5cdFx0XHR3aWRlVmFsdWUgPSAwO1xuXG5cdFx0LyoganNoaW50IGJvc3M6IHRydWUgKi9cblx0XHRpZiAodGhpcy5fYml0T2Zmc2V0ID0gZW5kQml0ICYgNykge1xuXHRcdFx0dGhpcy5fYml0T2Zmc2V0IC09IDg7XG5cdFx0fVxuXG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGIubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdHdpZGVWYWx1ZSA9ICh3aWRlVmFsdWUgPDwgOCkgfCBiW2ldO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydDogc3RhcnQsXG5cdFx0XHRieXRlczogYixcblx0XHRcdHdpZGVWYWx1ZTogd2lkZVZhbHVlXG5cdFx0fTtcblx0fSxcblxuXHRnZXRTaWduZWQ6IGZ1bmN0aW9uIChiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpIHtcblx0XHR2YXIgc2hpZnQgPSAzMiAtIGJpdExlbmd0aDtcblx0XHRyZXR1cm4gKHRoaXMuZ2V0VW5zaWduZWQoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KSA8PCBzaGlmdCkgPj4gc2hpZnQ7XG5cdH0sXG5cblx0Z2V0VW5zaWduZWQ6IGZ1bmN0aW9uIChiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpIHtcblx0XHR2YXIgdmFsdWUgPSB0aGlzLl9nZXRCaXRSYW5nZURhdGEoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KS53aWRlVmFsdWUgPj4+IC10aGlzLl9iaXRPZmZzZXQ7XG5cdFx0cmV0dXJuIGJpdExlbmd0aCA8IDMyID8gKHZhbHVlICYgfigtMSA8PCBiaXRMZW5ndGgpKSA6IHZhbHVlO1xuXHR9LFxuXG5cdF9zZXRCaW5hcnlGbG9hdDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBtYW50U2l6ZSwgZXhwU2l6ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIHNpZ25CaXQgPSB2YWx1ZSA8IDAgPyAxIDogMCxcblx0XHRcdGV4cG9uZW50LFxuXHRcdFx0bWFudGlzc2EsXG5cdFx0XHRlTWF4ID0gfigtMSA8PCAoZXhwU2l6ZSAtIDEpKSxcblx0XHRcdGVNaW4gPSAxIC0gZU1heDtcblxuXHRcdGlmICh2YWx1ZSA8IDApIHtcblx0XHRcdHZhbHVlID0gLXZhbHVlO1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZSA9PT0gMCkge1xuXHRcdFx0ZXhwb25lbnQgPSAwO1xuXHRcdFx0bWFudGlzc2EgPSAwO1xuXHRcdH0gZWxzZSBpZiAoaXNOYU4odmFsdWUpKSB7XG5cdFx0XHRleHBvbmVudCA9IDIgKiBlTWF4ICsgMTtcblx0XHRcdG1hbnRpc3NhID0gMTtcblx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSBJbmZpbml0eSkge1xuXHRcdFx0ZXhwb25lbnQgPSAyICogZU1heCArIDE7XG5cdFx0XHRtYW50aXNzYSA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGV4cG9uZW50ID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMik7XG5cdFx0XHRpZiAoZXhwb25lbnQgPj0gZU1pbiAmJiBleHBvbmVudCA8PSBlTWF4KSB7XG5cdFx0XHRcdG1hbnRpc3NhID0gTWF0aC5mbG9vcigodmFsdWUgKiBwb3cyKC1leHBvbmVudCkgLSAxKSAqIHBvdzIobWFudFNpemUpKTtcblx0XHRcdFx0ZXhwb25lbnQgKz0gZU1heDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1hbnRpc3NhID0gTWF0aC5mbG9vcih2YWx1ZSAvIHBvdzIoZU1pbiAtIG1hbnRTaXplKSk7XG5cdFx0XHRcdGV4cG9uZW50ID0gMDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR2YXIgYiA9IFtdO1xuXHRcdHdoaWxlIChtYW50U2l6ZSA+PSA4KSB7XG5cdFx0XHRiLnB1c2gobWFudGlzc2EgJSAyNTYpO1xuXHRcdFx0bWFudGlzc2EgPSBNYXRoLmZsb29yKG1hbnRpc3NhIC8gMjU2KTtcblx0XHRcdG1hbnRTaXplIC09IDg7XG5cdFx0fVxuXHRcdGV4cG9uZW50ID0gKGV4cG9uZW50IDw8IG1hbnRTaXplKSB8IG1hbnRpc3NhO1xuXHRcdGV4cFNpemUgKz0gbWFudFNpemU7XG5cdFx0d2hpbGUgKGV4cFNpemUgPj0gOCkge1xuXHRcdFx0Yi5wdXNoKGV4cG9uZW50ICYgMHhmZik7XG5cdFx0XHRleHBvbmVudCA+Pj49IDg7XG5cdFx0XHRleHBTaXplIC09IDg7XG5cdFx0fVxuXHRcdGIucHVzaCgoc2lnbkJpdCA8PCBleHBTaXplKSB8IGV4cG9uZW50KTtcblxuXHRcdHRoaXMuX3NldEJ5dGVzKGJ5dGVPZmZzZXQsIGIsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldEZsb2F0MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0QmluYXJ5RmxvYXQoYnl0ZU9mZnNldCwgdmFsdWUsIDIzLCA4LCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRGbG9hdDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldEJpbmFyeUZsb2F0KGJ5dGVPZmZzZXQsIHZhbHVlLCA1MiwgMTEsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldDY0OiBmdW5jdGlvbiAoVHlwZSwgYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdGlmICghKHZhbHVlIGluc3RhbmNlb2YgVHlwZSkpIHtcblx0XHRcdHZhbHVlID0gVHlwZS5mcm9tTnVtYmVyKHZhbHVlKTtcblx0XHR9XG5cblx0XHRsaXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXG5cdFx0dmFyIHBhcnRzID0gbGl0dGxlRW5kaWFuID8ge2xvOiAwLCBoaTogNH0gOiB7bG86IDQsIGhpOiAwfTtcblxuXHRcdGZvciAodmFyIHBhcnROYW1lIGluIHBhcnRzKSB7XG5cdFx0XHR0aGlzLnNldFVpbnQzMihieXRlT2Zmc2V0ICsgcGFydHNbcGFydE5hbWVdLCB2YWx1ZVtwYXJ0TmFtZV0sIGxpdHRsZUVuZGlhbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIDg7XG5cdH0sXG5cblx0c2V0SW50NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0NjQoSW50NjQsIGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdHNldFVpbnQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXQ2NChVaW50NjQsIGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRVaW50MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgW1xuXHRcdFx0dmFsdWUgJiAweGZmLFxuXHRcdFx0KHZhbHVlID4+PiA4KSAmIDB4ZmYsXG5cdFx0XHQodmFsdWUgPj4+IDE2KSAmIDB4ZmYsXG5cdFx0XHR2YWx1ZSA+Pj4gMjRcblx0XHRdLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRVaW50MTY6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgW1xuXHRcdFx0dmFsdWUgJiAweGZmLFxuXHRcdFx0KHZhbHVlID4+PiA4KSAmIDB4ZmZcblx0XHRdLCBsaXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdF9zZXRVaW50ODogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlKSB7XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgW3ZhbHVlICYgMHhmZl0pO1xuXHR9LFxuXG5cdHNldFVuc2lnbmVkOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGJpdExlbmd0aCkge1xuXHRcdHZhciBkYXRhID0gdGhpcy5fZ2V0Qml0UmFuZ2VEYXRhKGJpdExlbmd0aCwgYnl0ZU9mZnNldCksXG5cdFx0XHR3aWRlVmFsdWUgPSBkYXRhLndpZGVWYWx1ZSxcblx0XHRcdGIgPSBkYXRhLmJ5dGVzO1xuXG5cdFx0d2lkZVZhbHVlICY9IH4ofigtMSA8PCBiaXRMZW5ndGgpIDw8IC10aGlzLl9iaXRPZmZzZXQpOyAvLyBjbGVhcmluZyBiaXQgcmFuZ2UgYmVmb3JlIGJpbmFyeSBcIm9yXCJcblx0XHR3aWRlVmFsdWUgfD0gKGJpdExlbmd0aCA8IDMyID8gKHZhbHVlICYgfigtMSA8PCBiaXRMZW5ndGgpKSA6IHZhbHVlKSA8PCAtdGhpcy5fYml0T2Zmc2V0OyAvLyBzZXR0aW5nIGJpdHNcblxuXHRcdGZvciAodmFyIGkgPSBiLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRiW2ldID0gd2lkZVZhbHVlICYgMHhmZjtcblx0XHRcdHdpZGVWYWx1ZSA+Pj49IDg7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2V0Qnl0ZXMoZGF0YS5zdGFydCwgYiwgdHJ1ZSk7XG5cdH1cbn07XG5cbnZhciBwcm90byA9IGpEYXRhVmlldy5wcm90b3R5cGU7XG5cbmZvciAodmFyIHR5cGUgaW4gZGF0YVR5cGVzKSB7XG5cdChmdW5jdGlvbiAodHlwZSkge1xuXHRcdHByb3RvWydnZXQnICsgdHlwZV0gPSBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uKHR5cGUsIHRydWUsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdFx0fTtcblx0XHRwcm90b1snc2V0JyArIHR5cGVdID0gZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHRcdHRoaXMuX2FjdGlvbih0eXBlLCBmYWxzZSwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSk7XG5cdFx0fTtcblx0fSkodHlwZSk7XG59XG5cbnByb3RvLl9zZXRJbnQzMiA9IHByb3RvLl9zZXRVaW50MzI7XG5wcm90by5fc2V0SW50MTYgPSBwcm90by5fc2V0VWludDE2O1xucHJvdG8uX3NldEludDggPSBwcm90by5fc2V0VWludDg7XG5wcm90by5zZXRTaWduZWQgPSBwcm90by5zZXRVbnNpZ25lZDtcblxuZm9yICh2YXIgbWV0aG9kIGluIHByb3RvKSB7XG5cdGlmIChtZXRob2Quc2xpY2UoMCwgMykgPT09ICdzZXQnKSB7XG5cdFx0KGZ1bmN0aW9uICh0eXBlKSB7XG5cdFx0XHRwcm90b1snd3JpdGUnICsgdHlwZV0gPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdEFycmF5LnByb3RvdHlwZS51bnNoaWZ0LmNhbGwoYXJndW1lbnRzLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzWydzZXQnICsgdHlwZV0uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRcdH07XG5cdFx0fSkobWV0aG9kLnNsaWNlKDMpKTtcblx0fVxufVxuXG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzID09PSAnb2JqZWN0Jykge1xuXHRtb2R1bGUuZXhwb3J0cyA9IGpEYXRhVmlldztcbn0gZWxzZVxuaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuXHRkZWZpbmUoW10sIGZ1bmN0aW9uICgpIHsgcmV0dXJuIGpEYXRhVmlldyB9KTtcbn0gZWxzZSB7XG5cdHZhciBvbGRHbG9iYWwgPSBnbG9iYWwuakRhdGFWaWV3O1xuXHQoZ2xvYmFsLmpEYXRhVmlldyA9IGpEYXRhVmlldykubm9Db25mbGljdCA9IGZ1bmN0aW9uICgpIHtcblx0XHRnbG9iYWwuakRhdGFWaWV3ID0gb2xkR2xvYmFsO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xufVxuXG59KSgoZnVuY3Rpb24gKCkgeyAvKiBqc2hpbnQgc3RyaWN0OiBmYWxzZSAqLyByZXR1cm4gdGhpcyB9KSgpKTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiYnVmZmVyXCIpLkJ1ZmZlcikiLG51bGwsIi8qKlxuICogVGhlIGJ1ZmZlciBtb2R1bGUgZnJvbSBub2RlLmpzLCBmb3IgdGhlIGJyb3dzZXIuXG4gKlxuICogQXV0aG9yOiAgIEZlcm9zcyBBYm91a2hhZGlqZWggPGZlcm9zc0BmZXJvc3Mub3JnPiA8aHR0cDovL2Zlcm9zcy5vcmc+XG4gKiBMaWNlbnNlOiAgTUlUXG4gKlxuICogYG5wbSBpbnN0YWxsIGJ1ZmZlcmBcbiAqL1xuXG52YXIgYmFzZTY0ID0gcmVxdWlyZSgnYmFzZTY0LWpzJylcbnZhciBpZWVlNzU0ID0gcmVxdWlyZSgnaWVlZTc1NCcpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MlxuXG4vKipcbiAqIElmIGBCdWZmZXIuX3VzZVR5cGVkQXJyYXlzYDpcbiAqICAgPT09IHRydWUgICAgVXNlIFVpbnQ4QXJyYXkgaW1wbGVtZW50YXRpb24gKGZhc3Rlc3QpXG4gKiAgID09PSBmYWxzZSAgIFVzZSBPYmplY3QgaW1wbGVtZW50YXRpb24gKGNvbXBhdGlibGUgZG93biB0byBJRTYpXG4gKi9cbkJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgPSAoZnVuY3Rpb24gKCkge1xuICAgLy8gRGV0ZWN0IGlmIGJyb3dzZXIgc3VwcG9ydHMgVHlwZWQgQXJyYXlzLiBTdXBwb3J0ZWQgYnJvd3NlcnMgYXJlIElFIDEwKyxcbiAgIC8vIEZpcmVmb3ggNCssIENocm9tZSA3KywgU2FmYXJpIDUuMSssIE9wZXJhIDExLjYrLCBpT1MgNC4yKy5cbiAgaWYgKHR5cGVvZiBVaW50OEFycmF5ID09PSAndW5kZWZpbmVkJyB8fCB0eXBlb2YgQXJyYXlCdWZmZXIgPT09ICd1bmRlZmluZWQnKVxuICAgIHJldHVybiBmYWxzZVxuXG4gIC8vIERvZXMgdGhlIGJyb3dzZXIgc3VwcG9ydCBhZGRpbmcgcHJvcGVydGllcyB0byBgVWludDhBcnJheWAgaW5zdGFuY2VzPyBJZlxuICAvLyBub3QsIHRoZW4gdGhhdCdzIHRoZSBzYW1lIGFzIG5vIGBVaW50OEFycmF5YCBzdXBwb3J0LiBXZSBuZWVkIHRvIGJlIGFibGUgdG9cbiAgLy8gYWRkIGFsbCB0aGUgbm9kZSBCdWZmZXIgQVBJIG1ldGhvZHMuXG4gIC8vIFJlbGV2YW50IEZpcmVmb3ggYnVnOiBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTU0MzhcbiAgdHJ5IHtcbiAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoMClcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpICYmXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgLy8gQ2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSkoKVxuXG4vKipcbiAqIENsYXNzOiBCdWZmZXJcbiAqID09PT09PT09PT09PT1cbiAqXG4gKiBUaGUgQnVmZmVyIGNvbnN0cnVjdG9yIHJldHVybnMgaW5zdGFuY2VzIG9mIGBVaW50OEFycmF5YCB0aGF0IGFyZSBhdWdtZW50ZWRcbiAqIHdpdGggZnVuY3Rpb24gcHJvcGVydGllcyBmb3IgYWxsIHRoZSBub2RlIGBCdWZmZXJgIEFQSSBmdW5jdGlvbnMuIFdlIHVzZVxuICogYFVpbnQ4QXJyYXlgIHNvIHRoYXQgc3F1YXJlIGJyYWNrZXQgbm90YXRpb24gd29ya3MgYXMgZXhwZWN0ZWQgLS0gaXQgcmV0dXJuc1xuICogYSBzaW5nbGUgb2N0ZXQuXG4gKlxuICogQnkgYXVnbWVudGluZyB0aGUgaW5zdGFuY2VzLCB3ZSBjYW4gYXZvaWQgbW9kaWZ5aW5nIHRoZSBgVWludDhBcnJheWBcbiAqIHByb3RvdHlwZS5cbiAqL1xuZnVuY3Rpb24gQnVmZmVyIChzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBCdWZmZXIpKVxuICAgIHJldHVybiBuZXcgQnVmZmVyKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pXG5cbiAgdmFyIHR5cGUgPSB0eXBlb2Ygc3ViamVjdFxuXG4gIC8vIFdvcmthcm91bmQ6IG5vZGUncyBiYXNlNjQgaW1wbGVtZW50YXRpb24gYWxsb3dzIGZvciBub24tcGFkZGVkIHN0cmluZ3NcbiAgLy8gd2hpbGUgYmFzZTY0LWpzIGRvZXMgbm90LlxuICBpZiAoZW5jb2RpbmcgPT09ICdiYXNlNjQnICYmIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgc3ViamVjdCA9IHN0cmluZ3RyaW0oc3ViamVjdClcbiAgICB3aGlsZSAoc3ViamVjdC5sZW5ndGggJSA0ICE9PSAwKSB7XG4gICAgICBzdWJqZWN0ID0gc3ViamVjdCArICc9J1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpbmQgdGhlIGxlbmd0aFxuICB2YXIgbGVuZ3RoXG4gIGlmICh0eXBlID09PSAnbnVtYmVyJylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdClcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpXG4gICAgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoc3ViamVjdCwgZW5jb2RpbmcpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0Lmxlbmd0aCkgLy8gQXNzdW1lIG9iamVjdCBpcyBhbiBhcnJheVxuICBlbHNlXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGaXJzdCBhcmd1bWVudCBuZWVkcyB0byBiZSBhIG51bWJlciwgYXJyYXkgb3Igc3RyaW5nLicpXG5cbiAgdmFyIGJ1ZlxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBhdWdtZW50KG5ldyBVaW50OEFycmF5KGxlbmd0aCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gRmFsbGJhY2s6IFJldHVybiBUSElTIGluc3RhbmNlIG9mIEJ1ZmZlciAoY3JlYXRlZCBieSBgbmV3YClcbiAgICBidWYgPSB0aGlzXG4gICAgYnVmLmxlbmd0aCA9IGxlbmd0aFxuICAgIGJ1Zi5faXNCdWZmZXIgPSB0cnVlXG4gIH1cblxuICB2YXIgaVxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiB0eXBlb2YgVWludDhBcnJheSA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgc3ViamVjdCBpbnN0YW5jZW9mIFVpbnQ4QXJyYXkpIHtcbiAgICAvLyBTcGVlZCBvcHRpbWl6YXRpb24gLS0gdXNlIHNldCBpZiB3ZSdyZSBjb3B5aW5nIGZyb20gYSBVaW50OEFycmF5XG4gICAgYnVmLl9zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgICAgZWxzZVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0W2ldXG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmICFub1plcm8pIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGJ1ZltpXSA9IDBcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmXG59XG5cbi8vIFNUQVRJQyBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gKGIpIHtcbiAgcmV0dXJuICEhKGIgIT09IG51bGwgJiYgYiAhPT0gdW5kZWZpbmVkICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGZ1bmN0aW9uIChzdHIsIGVuY29kaW5nKSB7XG4gIHZhciByZXRcbiAgc3RyID0gc3RyICsgJydcbiAgc3dpdGNoIChlbmNvZGluZyB8fCAndXRmOCcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAvIDJcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAncmF3JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IGJhc2U2NFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggKiAyXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBhc3NlcnQoaXNBcnJheShsaXN0KSwgJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3QsIFt0b3RhbExlbmd0aF0pXFxuJyArXG4gICAgICAnbGlzdCBzaG91bGQgYmUgYW4gQXJyYXkuJylcblxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcigwKVxuICB9IGVsc2UgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGxpc3RbMF1cbiAgfVxuXG4gIHZhciBpXG4gIGlmICh0eXBlb2YgdG90YWxMZW5ndGggIT09ICdudW1iZXInKSB7XG4gICAgdG90YWxMZW5ndGggPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRvdGFsTGVuZ3RoICs9IGxpc3RbaV0ubGVuZ3RoXG4gICAgfVxuICB9XG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIodG90YWxMZW5ndGgpXG4gIHZhciBwb3MgPSAwXG4gIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBsaXN0W2ldXG4gICAgaXRlbS5jb3B5KGJ1ZiwgcG9zKVxuICAgIHBvcyArPSBpdGVtLmxlbmd0aFxuICB9XG4gIHJldHVybiBidWZcbn1cblxuLy8gQlVGRkVSIElOU1RBTkNFIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIF9oZXhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IGJ1Zi5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuXG4gIC8vIG11c3QgYmUgYW4gZXZlbiBudW1iZXIgb2YgZGlnaXRzXG4gIHZhciBzdHJMZW4gPSBzdHJpbmcubGVuZ3RoXG4gIGFzc2VydChzdHJMZW4gJSAyID09PSAwLCAnSW52YWxpZCBoZXggc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGJ5dGUgPSBwYXJzZUludChzdHJpbmcuc3Vic3RyKGkgKiAyLCAyKSwgMTYpXG4gICAgYXNzZXJ0KCFpc05hTihieXRlKSwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG4gICAgYnVmW29mZnNldCArIGldID0gYnl0ZVxuICB9XG4gIEJ1ZmZlci5fY2hhcnNXcml0dGVuID0gaSAqIDJcbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gX3V0ZjhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGY4VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGFzY2lpVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBfYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihiYXNlNjRUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX3V0ZjE2bGVXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGYxNmxlVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbiAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpIHtcbiAgLy8gU3VwcG9ydCBib3RoIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZylcbiAgLy8gYW5kIHRoZSBsZWdhY3kgKHN0cmluZywgZW5jb2RpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICBpZiAoaXNGaW5pdGUob2Zmc2V0KSkge1xuICAgIGlmICghaXNGaW5pdGUobGVuZ3RoKSkge1xuICAgICAgZW5jb2RpbmcgPSBsZW5ndGhcbiAgICAgIGxlbmd0aCA9IHVuZGVmaW5lZFxuICAgIH1cbiAgfSBlbHNlIHsgIC8vIGxlZ2FjeVxuICAgIHZhciBzd2FwID0gZW5jb2RpbmdcbiAgICBlbmNvZGluZyA9IG9mZnNldFxuICAgIG9mZnNldCA9IGxlbmd0aFxuICAgIGxlbmd0aCA9IHN3YXBcbiAgfVxuXG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IHRoaXMubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IF9oZXhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSBfdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IF9hc2NpaVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBfYmluYXJ5V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IF9iYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gX3V0ZjE2bGVXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG4gIHN0YXJ0ID0gTnVtYmVyKHN0YXJ0KSB8fCAwXG4gIGVuZCA9IChlbmQgIT09IHVuZGVmaW5lZClcbiAgICA/IE51bWJlcihlbmQpXG4gICAgOiBlbmQgPSBzZWxmLmxlbmd0aFxuXG4gIC8vIEZhc3RwYXRoIGVtcHR5IHN0cmluZ3NcbiAgaWYgKGVuZCA9PT0gc3RhcnQpXG4gICAgcmV0dXJuICcnXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IF9oZXhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSBfdXRmOFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IF9hc2NpaVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBfYmluYXJ5U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IF9iYXNlNjRTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gX3V0ZjE2bGVTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4ge1xuICAgIHR5cGU6ICdCdWZmZXInLFxuICAgIGRhdGE6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuX2FyciB8fCB0aGlzLCAwKVxuICB9XG59XG5cbi8vIGNvcHkodGFyZ2V0QnVmZmVyLCB0YXJnZXRTdGFydD0wLCBzb3VyY2VTdGFydD0wLCBzb3VyY2VFbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uICh0YXJnZXQsIHRhcmdldF9zdGFydCwgc3RhcnQsIGVuZCkge1xuICB2YXIgc291cmNlID0gdGhpc1xuXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICghdGFyZ2V0X3N0YXJ0KSB0YXJnZXRfc3RhcnQgPSAwXG5cbiAgLy8gQ29weSAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRhcmdldC5sZW5ndGggPT09IDAgfHwgc291cmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgLy8gRmF0YWwgZXJyb3IgY29uZGl0aW9uc1xuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBhc3NlcnQodGFyZ2V0X3N0YXJ0ID49IDAgJiYgdGFyZ2V0X3N0YXJ0IDwgdGFyZ2V0Lmxlbmd0aCxcbiAgICAgICd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCBzb3VyY2UubGVuZ3RoLCAnc291cmNlU3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gc291cmNlLmxlbmd0aCwgJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpXG4gICAgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgPCBlbmQgLSBzdGFydClcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0ICsgc3RhcnRcblxuICAvLyBjb3B5IVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGVuZCAtIHN0YXJ0OyBpKyspXG4gICAgdGFyZ2V0W2kgKyB0YXJnZXRfc3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gX3V0ZjhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXMgPSAnJ1xuICB2YXIgdG1wID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgaWYgKGJ1ZltpXSA8PSAweDdGKSB7XG4gICAgICByZXMgKz0gZGVjb2RlVXRmOENoYXIodG1wKSArIFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICAgICAgdG1wID0gJydcbiAgICB9IGVsc2Uge1xuICAgICAgdG1wICs9ICclJyArIGJ1ZltpXS50b1N0cmluZygxNilcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzICsgZGVjb2RlVXRmOENoYXIodG1wKVxufVxuXG5mdW5jdGlvbiBfYXNjaWlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXQgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspXG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHJldHVybiBfYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIF9oZXhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG5cbiAgaWYgKCFzdGFydCB8fCBzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCB8fCBlbmQgPCAwIHx8IGVuZCA+IGxlbikgZW5kID0gbGVuXG5cbiAgdmFyIG91dCA9ICcnXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgb3V0ICs9IHRvSGV4KGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbmZ1bmN0aW9uIF91dGYxNmxlU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgYnl0ZXMgPSBidWYuc2xpY2Uoc3RhcnQsIGVuZClcbiAgdmFyIHJlcyA9ICcnXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZXMubGVuZ3RoOyBpICs9IDIpIHtcbiAgICByZXMgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSArIGJ5dGVzW2krMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gY2xhbXAoc3RhcnQsIGxlbiwgMClcbiAgZW5kID0gY2xhbXAoZW5kLCBsZW4sIGxlbilcblxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIHJldHVybiBhdWdtZW50KHRoaXMuc3ViYXJyYXkoc3RhcnQsIGVuZCkpXG4gIH0gZWxzZSB7XG4gICAgdmFyIHNsaWNlTGVuID0gZW5kIC0gc3RhcnRcbiAgICB2YXIgbmV3QnVmID0gbmV3IEJ1ZmZlcihzbGljZUxlbiwgdW5kZWZpbmVkLCB0cnVlKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2xpY2VMZW47IGkrKykge1xuICAgICAgbmV3QnVmW2ldID0gdGhpc1tpICsgc3RhcnRdXG4gICAgfVxuICAgIHJldHVybiBuZXdCdWZcbiAgfVxufVxuXG4vLyBgZ2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAob2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuZ2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy5yZWFkVUludDgob2Zmc2V0KVxufVxuXG4vLyBgc2V0YCB3aWxsIGJlIHJlbW92ZWQgaW4gTm9kZSAwLjEzK1xuQnVmZmVyLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAodiwgb2Zmc2V0KSB7XG4gIGNvbnNvbGUubG9nKCcuc2V0KCkgaXMgZGVwcmVjYXRlZC4gQWNjZXNzIHVzaW5nIGFycmF5IGluZGV4ZXMgaW5zdGVhZC4nKVxuICByZXR1cm4gdGhpcy53cml0ZVVJbnQ4KHYsIG9mZnNldClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gIH0gZWxzZSB7XG4gICAgdmFsID0gYnVmW29mZnNldF0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMl0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICAgIHZhbCB8PSBidWZbb2Zmc2V0XVxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXQgKyAzXSA8PCAyNCA+Pj4gMClcbiAgfSBlbHNlIHtcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAxXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAyXSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDNdXG4gICAgdmFsID0gdmFsICsgKGJ1ZltvZmZzZXRdIDw8IDI0ID4+PiAwKVxuICB9XG4gIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkVUludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRVSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDggPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCxcbiAgICAgICAgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIHZhciBuZWcgPSB0aGlzW29mZnNldF0gJiAweDgwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmIC0gdGhpc1tvZmZzZXRdICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDE2KGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQzMihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwMDAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmZmZmZiAtIHZhbCArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB2YWxcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRGbG9hdCAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdExFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZERvdWJsZSAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICByZXR1cm4gaWVlZTc1NC5yZWFkKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWREb3VibGVCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZERvdWJsZSh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmYpXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKSByZXR1cm5cblxuICB0aGlzW29mZnNldF0gPSB2YWx1ZVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDIpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlICYgKDB4ZmYgPDwgKDggKiAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSkpKSA+Pj5cbiAgICAgICAgICAgIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpICogOFxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVVSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZmZmZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCA0KTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSA+Pj4gKGxpdHRsZUVuZGlhbiA/IGkgOiAzIC0gaSkgKiA4KSAmIDB4ZmZcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZiwgLTB4ODApXG4gIH1cblxuICBpZiAob2Zmc2V0ID49IHRoaXMubGVuZ3RoKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIHRoaXMud3JpdGVVSW50OCh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydClcbiAgZWxzZVxuICAgIHRoaXMud3JpdGVVSW50OCgweGZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmYsIC0weDgwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MTYoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgMHhmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZmZmZmYsIC0weDgwMDAwMDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQzMihidWYsIDB4ZmZmZmZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRmxvYXQgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMy40MDI4MjM0NjYzODUyODg2ZSszOCwgLTMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdEJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlRG91YmxlIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLFxuICAgICAgICAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4LCAtMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZWVlNzU0LndyaXRlKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZURvdWJsZUJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZURvdWJsZSh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbi8vIGZpbGwodmFsdWUsIHN0YXJ0PTAsIGVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5maWxsID0gZnVuY3Rpb24gKHZhbHVlLCBzdGFydCwgZW5kKSB7XG4gIGlmICghdmFsdWUpIHZhbHVlID0gMFxuICBpZiAoIXN0YXJ0KSBzdGFydCA9IDBcbiAgaWYgKCFlbmQpIGVuZCA9IHRoaXMubGVuZ3RoXG5cbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICB2YWx1ZSA9IHZhbHVlLmNoYXJDb2RlQXQoMClcbiAgfVxuXG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmICFpc05hTih2YWx1ZSksICd2YWx1ZSBpcyBub3QgYSBudW1iZXInKVxuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnZW5kIDwgc3RhcnQnKVxuXG4gIC8vIEZpbGwgMCBieXRlczsgd2UncmUgZG9uZVxuICBpZiAoZW5kID09PSBzdGFydCkgcmV0dXJuXG4gIGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCB0aGlzLmxlbmd0aCwgJ3N0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoZW5kID49IDAgJiYgZW5kIDw9IHRoaXMubGVuZ3RoLCAnZW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgdGhpc1tpXSA9IHZhbHVlXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS5pbnNwZWN0ID0gZnVuY3Rpb24gKCkge1xuICB2YXIgb3V0ID0gW11cbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICBvdXRbaV0gPSB0b0hleCh0aGlzW2ldKVxuICAgIGlmIChpID09PSBleHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTKSB7XG4gICAgICBvdXRbaSArIDFdID0gJy4uLidcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIHJldHVybiAnPEJ1ZmZlciAnICsgb3V0LmpvaW4oJyAnKSArICc+J1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgYEFycmF5QnVmZmVyYCB3aXRoIHRoZSAqY29waWVkKiBtZW1vcnkgb2YgdGhlIGJ1ZmZlciBpbnN0YW5jZS5cbiAqIEFkZGVkIGluIE5vZGUgMC4xMi4gT25seSBhdmFpbGFibGUgaW4gYnJvd3NlcnMgdGhhdCBzdXBwb3J0IEFycmF5QnVmZmVyLlxuICovXG5CdWZmZXIucHJvdG90eXBlLnRvQXJyYXlCdWZmZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0eXBlb2YgVWludDhBcnJheSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKVxuICAgICAgICBidWZbaV0gPSB0aGlzW2ldXG4gICAgICByZXR1cm4gYnVmLmJ1ZmZlclxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHN0cmluZ3RyaW0gKHN0cikge1xuICBpZiAoc3RyLnRyaW0pIHJldHVybiBzdHIudHJpbSgpXG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpXG59XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IHRoZSBVaW50OEFycmF5ICppbnN0YW5jZSogKG5vdCB0aGUgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbmZ1bmN0aW9uIGF1Z21lbnQgKGFycikge1xuICBhcnIuX2lzQnVmZmVyID0gdHJ1ZVxuXG4gIC8vIHNhdmUgcmVmZXJlbmNlIHRvIG9yaWdpbmFsIFVpbnQ4QXJyYXkgZ2V0L3NldCBtZXRob2RzIGJlZm9yZSBvdmVyd3JpdGluZ1xuICBhcnIuX2dldCA9IGFyci5nZXRcbiAgYXJyLl9zZXQgPSBhcnIuc2V0XG5cbiAgLy8gZGVwcmVjYXRlZCwgd2lsbCBiZSByZW1vdmVkIGluIG5vZGUgMC4xMytcbiAgYXJyLmdldCA9IEJQLmdldFxuICBhcnIuc2V0ID0gQlAuc2V0XG5cbiAgYXJyLndyaXRlID0gQlAud3JpdGVcbiAgYXJyLnRvU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvTG9jYWxlU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvSlNPTiA9IEJQLnRvSlNPTlxuICBhcnIuY29weSA9IEJQLmNvcHlcbiAgYXJyLnNsaWNlID0gQlAuc2xpY2VcbiAgYXJyLnJlYWRVSW50OCA9IEJQLnJlYWRVSW50OFxuICBhcnIucmVhZFVJbnQxNkxFID0gQlAucmVhZFVJbnQxNkxFXG4gIGFyci5yZWFkVUludDE2QkUgPSBCUC5yZWFkVUludDE2QkVcbiAgYXJyLnJlYWRVSW50MzJMRSA9IEJQLnJlYWRVSW50MzJMRVxuICBhcnIucmVhZFVJbnQzMkJFID0gQlAucmVhZFVJbnQzMkJFXG4gIGFyci5yZWFkSW50OCA9IEJQLnJlYWRJbnQ4XG4gIGFyci5yZWFkSW50MTZMRSA9IEJQLnJlYWRJbnQxNkxFXG4gIGFyci5yZWFkSW50MTZCRSA9IEJQLnJlYWRJbnQxNkJFXG4gIGFyci5yZWFkSW50MzJMRSA9IEJQLnJlYWRJbnQzMkxFXG4gIGFyci5yZWFkSW50MzJCRSA9IEJQLnJlYWRJbnQzMkJFXG4gIGFyci5yZWFkRmxvYXRMRSA9IEJQLnJlYWRGbG9hdExFXG4gIGFyci5yZWFkRmxvYXRCRSA9IEJQLnJlYWRGbG9hdEJFXG4gIGFyci5yZWFkRG91YmxlTEUgPSBCUC5yZWFkRG91YmxlTEVcbiAgYXJyLnJlYWREb3VibGVCRSA9IEJQLnJlYWREb3VibGVCRVxuICBhcnIud3JpdGVVSW50OCA9IEJQLndyaXRlVUludDhcbiAgYXJyLndyaXRlVUludDE2TEUgPSBCUC53cml0ZVVJbnQxNkxFXG4gIGFyci53cml0ZVVJbnQxNkJFID0gQlAud3JpdGVVSW50MTZCRVxuICBhcnIud3JpdGVVSW50MzJMRSA9IEJQLndyaXRlVUludDMyTEVcbiAgYXJyLndyaXRlVUludDMyQkUgPSBCUC53cml0ZVVJbnQzMkJFXG4gIGFyci53cml0ZUludDggPSBCUC53cml0ZUludDhcbiAgYXJyLndyaXRlSW50MTZMRSA9IEJQLndyaXRlSW50MTZMRVxuICBhcnIud3JpdGVJbnQxNkJFID0gQlAud3JpdGVJbnQxNkJFXG4gIGFyci53cml0ZUludDMyTEUgPSBCUC53cml0ZUludDMyTEVcbiAgYXJyLndyaXRlSW50MzJCRSA9IEJQLndyaXRlSW50MzJCRVxuICBhcnIud3JpdGVGbG9hdExFID0gQlAud3JpdGVGbG9hdExFXG4gIGFyci53cml0ZUZsb2F0QkUgPSBCUC53cml0ZUZsb2F0QkVcbiAgYXJyLndyaXRlRG91YmxlTEUgPSBCUC53cml0ZURvdWJsZUxFXG4gIGFyci53cml0ZURvdWJsZUJFID0gQlAud3JpdGVEb3VibGVCRVxuICBhcnIuZmlsbCA9IEJQLmZpbGxcbiAgYXJyLmluc3BlY3QgPSBCUC5pbnNwZWN0XG4gIGFyci50b0FycmF5QnVmZmVyID0gQlAudG9BcnJheUJ1ZmZlclxuXG4gIHJldHVybiBhcnJcbn1cblxuLy8gc2xpY2Uoc3RhcnQsIGVuZClcbmZ1bmN0aW9uIGNsYW1wIChpbmRleCwgbGVuLCBkZWZhdWx0VmFsdWUpIHtcbiAgaWYgKHR5cGVvZiBpbmRleCAhPT0gJ251bWJlcicpIHJldHVybiBkZWZhdWx0VmFsdWVcbiAgaW5kZXggPSB+fmluZGV4OyAgLy8gQ29lcmNlIHRvIGludGVnZXIuXG4gIGlmIChpbmRleCA+PSBsZW4pIHJldHVybiBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICBpbmRleCArPSBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBjb2VyY2UgKGxlbmd0aCkge1xuICAvLyBDb2VyY2UgbGVuZ3RoIHRvIGEgbnVtYmVyIChwb3NzaWJseSBOYU4pLCByb3VuZCB1cFxuICAvLyBpbiBjYXNlIGl0J3MgZnJhY3Rpb25hbCAoZS5nLiAxMjMuNDU2KSB0aGVuIGRvIGFcbiAgLy8gZG91YmxlIG5lZ2F0ZSB0byBjb2VyY2UgYSBOYU4gdG8gMC4gRWFzeSwgcmlnaHQ/XG4gIGxlbmd0aCA9IH5+TWF0aC5jZWlsKCtsZW5ndGgpXG4gIHJldHVybiBsZW5ndGggPCAwID8gMCA6IGxlbmd0aFxufVxuXG5mdW5jdGlvbiBpc0FycmF5IChzdWJqZWN0KSB7XG4gIHJldHVybiAoQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoc3ViamVjdCkge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc3ViamVjdCkgPT09ICdbb2JqZWN0IEFycmF5XSdcbiAgfSkoc3ViamVjdClcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYiA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaWYgKGIgPD0gMHg3RilcbiAgICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpKVxuICAgIGVsc2Uge1xuICAgICAgdmFyIHN0YXJ0ID0gaVxuICAgICAgaWYgKGIgPj0gMHhEODAwICYmIGIgPD0gMHhERkZGKSBpKytcbiAgICAgIHZhciBoID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0ci5zbGljZShzdGFydCwgaSsxKSkuc3Vic3RyKDEpLnNwbGl0KCclJylcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaC5sZW5ndGg7IGorKylcbiAgICAgICAgYnl0ZUFycmF5LnB1c2gocGFyc2VJbnQoaFtqXSwgMTYpKVxuICAgIH1cbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGFzY2lpVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIC8vIE5vZGUncyBjb2RlIHNlZW1zIHRvIGJlIGRvaW5nIHRoaXMgYW5kIG5vdCAmIDB4N0YuLlxuICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRilcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGMsIGhpLCBsb1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICBjID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBoaSA9IGMgPj4gOFxuICAgIGxvID0gYyAlIDI1NlxuICAgIGJ5dGVBcnJheS5wdXNoKGxvKVxuICAgIGJ5dGVBcnJheS5wdXNoKGhpKVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBiYXNlNjRUb0J5dGVzIChzdHIpIHtcbiAgcmV0dXJuIGJhc2U2NC50b0J5dGVBcnJheShzdHIpXG59XG5cbmZ1bmN0aW9uIGJsaXRCdWZmZXIgKHNyYywgZHN0LCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgcG9zXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKGkgKyBvZmZzZXQgPj0gZHN0Lmxlbmd0aCkgfHwgKGkgPj0gc3JjLmxlbmd0aCkpXG4gICAgICBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIGRlY29kZVV0ZjhDaGFyIChzdHIpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHN0cilcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoMHhGRkZEKSAvLyBVVEYgOCBpbnZhbGlkIGNoYXJcbiAgfVxufVxuXG4vKlxuICogV2UgaGF2ZSB0byBtYWtlIHN1cmUgdGhhdCB0aGUgdmFsdWUgaXMgYSB2YWxpZCBpbnRlZ2VyLiBUaGlzIG1lYW5zIHRoYXQgaXRcbiAqIGlzIG5vbi1uZWdhdGl2ZS4gSXQgaGFzIG5vIGZyYWN0aW9uYWwgY29tcG9uZW50IGFuZCB0aGF0IGl0IGRvZXMgbm90XG4gKiBleGNlZWQgdGhlIG1heGltdW0gYWxsb3dlZCB2YWx1ZS5cbiAqL1xuZnVuY3Rpb24gdmVyaWZ1aW50ICh2YWx1ZSwgbWF4KSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA+PSAwLFxuICAgICAgJ3NwZWNpZmllZCBhIG5lZ2F0aXZlIHZhbHVlIGZvciB3cml0aW5nIGFuIHVuc2lnbmVkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGlzIGxhcmdlciB0aGFuIG1heGltdW0gdmFsdWUgZm9yIHR5cGUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZnNpbnQgKHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZklFRUU3NTQgKHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxufVxuXG5mdW5jdGlvbiBhc3NlcnQgKHRlc3QsIG1lc3NhZ2UpIHtcbiAgaWYgKCF0ZXN0KSB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSB8fCAnRmFpbGVkIGFzc2VydGlvbicpXG59XG4iLCJ2YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG47KGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuICB2YXIgQXJyID0gKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJylcbiAgICA/IFVpbnQ4QXJyYXlcbiAgICA6IEFycmF5XG5cblx0dmFyIFpFUk8gICA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBQTFVTICAgPSAnKycuY2hhckNvZGVBdCgwKVxuXHR2YXIgU0xBU0ggID0gJy8nLmNoYXJDb2RlQXQoMClcblx0dmFyIE5VTUJFUiA9ICcwJy5jaGFyQ29kZUF0KDApXG5cdHZhciBMT1dFUiAgPSAnYScuY2hhckNvZGVBdCgwKVxuXHR2YXIgVVBQRVIgID0gJ0EnLmNoYXJDb2RlQXQoMClcblxuXHRmdW5jdGlvbiBkZWNvZGUgKGVsdCkge1xuXHRcdHZhciBjb2RlID0gZWx0LmNoYXJDb2RlQXQoMClcblx0XHRpZiAoY29kZSA9PT0gUExVUylcblx0XHRcdHJldHVybiA2MiAvLyAnKydcblx0XHRpZiAoY29kZSA9PT0gU0xBU0gpXG5cdFx0XHRyZXR1cm4gNjMgLy8gJy8nXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIpXG5cdFx0XHRyZXR1cm4gLTEgLy9ubyBtYXRjaFxuXHRcdGlmIChjb2RlIDwgTlVNQkVSICsgMTApXG5cdFx0XHRyZXR1cm4gY29kZSAtIE5VTUJFUiArIDI2ICsgMjZcblx0XHRpZiAoY29kZSA8IFVQUEVSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIFVQUEVSXG5cdFx0aWYgKGNvZGUgPCBMT1dFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBMT1dFUiArIDI2XG5cdH1cblxuXHRmdW5jdGlvbiBiNjRUb0J5dGVBcnJheSAoYjY0KSB7XG5cdFx0dmFyIGksIGosIGwsIHRtcCwgcGxhY2VIb2xkZXJzLCBhcnJcblxuXHRcdGlmIChiNjQubGVuZ3RoICUgNCA+IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzdHJpbmcuIExlbmd0aCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNCcpXG5cdFx0fVxuXG5cdFx0Ly8gdGhlIG51bWJlciBvZiBlcXVhbCBzaWducyAocGxhY2UgaG9sZGVycylcblx0XHQvLyBpZiB0aGVyZSBhcmUgdHdvIHBsYWNlaG9sZGVycywgdGhhbiB0aGUgdHdvIGNoYXJhY3RlcnMgYmVmb3JlIGl0XG5cdFx0Ly8gcmVwcmVzZW50IG9uZSBieXRlXG5cdFx0Ly8gaWYgdGhlcmUgaXMgb25seSBvbmUsIHRoZW4gdGhlIHRocmVlIGNoYXJhY3RlcnMgYmVmb3JlIGl0IHJlcHJlc2VudCAyIGJ5dGVzXG5cdFx0Ly8gdGhpcyBpcyBqdXN0IGEgY2hlYXAgaGFjayB0byBub3QgZG8gaW5kZXhPZiB0d2ljZVxuXHRcdHZhciBsZW4gPSBiNjQubGVuZ3RoXG5cdFx0cGxhY2VIb2xkZXJzID0gJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDIpID8gMiA6ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAxKSA/IDEgOiAwXG5cblx0XHQvLyBiYXNlNjQgaXMgNC8zICsgdXAgdG8gdHdvIGNoYXJhY3RlcnMgb2YgdGhlIG9yaWdpbmFsIGRhdGFcblx0XHRhcnIgPSBuZXcgQXJyKGI2NC5sZW5ndGggKiAzIC8gNCAtIHBsYWNlSG9sZGVycylcblxuXHRcdC8vIGlmIHRoZXJlIGFyZSBwbGFjZWhvbGRlcnMsIG9ubHkgZ2V0IHVwIHRvIHRoZSBsYXN0IGNvbXBsZXRlIDQgY2hhcnNcblx0XHRsID0gcGxhY2VIb2xkZXJzID4gMCA/IGI2NC5sZW5ndGggLSA0IDogYjY0Lmxlbmd0aFxuXG5cdFx0dmFyIEwgPSAwXG5cblx0XHRmdW5jdGlvbiBwdXNoICh2KSB7XG5cdFx0XHRhcnJbTCsrXSA9IHZcblx0XHR9XG5cblx0XHRmb3IgKGkgPSAwLCBqID0gMDsgaSA8IGw7IGkgKz0gNCwgaiArPSAzKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDE4KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDEyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpIDw8IDYpIHwgZGVjb2RlKGI2NC5jaGFyQXQoaSArIDMpKVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwMDApID4+IDE2KVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwKSA+PiA4KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdGlmIChwbGFjZUhvbGRlcnMgPT09IDIpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA+PiA0KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH0gZWxzZSBpZiAocGxhY2VIb2xkZXJzID09PSAxKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDEwKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDQpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPj4gMilcblx0XHRcdHB1c2goKHRtcCA+PiA4KSAmIDB4RkYpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyclxuXHR9XG5cblx0ZnVuY3Rpb24gdWludDhUb0Jhc2U2NCAodWludDgpIHtcblx0XHR2YXIgaSxcblx0XHRcdGV4dHJhQnl0ZXMgPSB1aW50OC5sZW5ndGggJSAzLCAvLyBpZiB3ZSBoYXZlIDEgYnl0ZSBsZWZ0LCBwYWQgMiBieXRlc1xuXHRcdFx0b3V0cHV0ID0gXCJcIixcblx0XHRcdHRlbXAsIGxlbmd0aFxuXG5cdFx0ZnVuY3Rpb24gZW5jb2RlIChudW0pIHtcblx0XHRcdHJldHVybiBsb29rdXAuY2hhckF0KG51bSlcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0cmlwbGV0VG9CYXNlNjQgKG51bSkge1xuXHRcdFx0cmV0dXJuIGVuY29kZShudW0gPj4gMTggJiAweDNGKSArIGVuY29kZShudW0gPj4gMTIgJiAweDNGKSArIGVuY29kZShudW0gPj4gNiAmIDB4M0YpICsgZW5jb2RlKG51bSAmIDB4M0YpXG5cdFx0fVxuXG5cdFx0Ly8gZ28gdGhyb3VnaCB0aGUgYXJyYXkgZXZlcnkgdGhyZWUgYnl0ZXMsIHdlJ2xsIGRlYWwgd2l0aCB0cmFpbGluZyBzdHVmZiBsYXRlclxuXHRcdGZvciAoaSA9IDAsIGxlbmd0aCA9IHVpbnQ4Lmxlbmd0aCAtIGV4dHJhQnl0ZXM7IGkgPCBsZW5ndGg7IGkgKz0gMykge1xuXHRcdFx0dGVtcCA9ICh1aW50OFtpXSA8PCAxNikgKyAodWludDhbaSArIDFdIDw8IDgpICsgKHVpbnQ4W2kgKyAyXSlcblx0XHRcdG91dHB1dCArPSB0cmlwbGV0VG9CYXNlNjQodGVtcClcblx0XHR9XG5cblx0XHQvLyBwYWQgdGhlIGVuZCB3aXRoIHplcm9zLCBidXQgbWFrZSBzdXJlIHRvIG5vdCBmb3JnZXQgdGhlIGV4dHJhIGJ5dGVzXG5cdFx0c3dpdGNoIChleHRyYUJ5dGVzKSB7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHRlbXAgPSB1aW50OFt1aW50OC5sZW5ndGggLSAxXVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPT0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdHRlbXAgPSAodWludDhbdWludDgubGVuZ3RoIC0gMl0gPDwgOCkgKyAodWludDhbdWludDgubGVuZ3RoIC0gMV0pXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAxMClcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA+PiA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgMikgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dFxuXHR9XG5cblx0bW9kdWxlLmV4cG9ydHMudG9CeXRlQXJyYXkgPSBiNjRUb0J5dGVBcnJheVxuXHRtb2R1bGUuZXhwb3J0cy5mcm9tQnl0ZUFycmF5ID0gdWludDhUb0Jhc2U2NFxufSgpKVxuIiwiZXhwb3J0cy5yZWFkID0gZnVuY3Rpb24oYnVmZmVyLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBuQml0cyA9IC03LFxuICAgICAgaSA9IGlzTEUgPyAobkJ5dGVzIC0gMSkgOiAwLFxuICAgICAgZCA9IGlzTEUgPyAtMSA6IDEsXG4gICAgICBzID0gYnVmZmVyW29mZnNldCArIGldO1xuXG4gIGkgKz0gZDtcblxuICBlID0gcyAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgcyA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IGVMZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IGUgPSBlICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIG0gPSBlICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBlID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gbUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgbSA9IG0gKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgaWYgKGUgPT09IDApIHtcbiAgICBlID0gMSAtIGVCaWFzO1xuICB9IGVsc2UgaWYgKGUgPT09IGVNYXgpIHtcbiAgICByZXR1cm4gbSA/IE5hTiA6ICgocyA/IC0xIDogMSkgKiBJbmZpbml0eSk7XG4gIH0gZWxzZSB7XG4gICAgbSA9IG0gKyBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICBlID0gZSAtIGVCaWFzO1xuICB9XG4gIHJldHVybiAocyA/IC0xIDogMSkgKiBtICogTWF0aC5wb3coMiwgZSAtIG1MZW4pO1xufTtcblxuZXhwb3J0cy53cml0ZSA9IGZ1bmN0aW9uKGJ1ZmZlciwgdmFsdWUsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLCBjLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIHJ0ID0gKG1MZW4gPT09IDIzID8gTWF0aC5wb3coMiwgLTI0KSAtIE1hdGgucG93KDIsIC03NykgOiAwKSxcbiAgICAgIGkgPSBpc0xFID8gMCA6IChuQnl0ZXMgLSAxKSxcbiAgICAgIGQgPSBpc0xFID8gMSA6IC0xLFxuICAgICAgcyA9IHZhbHVlIDwgMCB8fCAodmFsdWUgPT09IDAgJiYgMSAvIHZhbHVlIDwgMCkgPyAxIDogMDtcblxuICB2YWx1ZSA9IE1hdGguYWJzKHZhbHVlKTtcblxuICBpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlID09PSBJbmZpbml0eSkge1xuICAgIG0gPSBpc05hTih2YWx1ZSkgPyAxIDogMDtcbiAgICBlID0gZU1heDtcbiAgfSBlbHNlIHtcbiAgICBlID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMik7XG4gICAgaWYgKHZhbHVlICogKGMgPSBNYXRoLnBvdygyLCAtZSkpIDwgMSkge1xuICAgICAgZS0tO1xuICAgICAgYyAqPSAyO1xuICAgIH1cbiAgICBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIHZhbHVlICs9IHJ0IC8gYztcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgKz0gcnQgKiBNYXRoLnBvdygyLCAxIC0gZUJpYXMpO1xuICAgIH1cbiAgICBpZiAodmFsdWUgKiBjID49IDIpIHtcbiAgICAgIGUrKztcbiAgICAgIGMgLz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZSArIGVCaWFzID49IGVNYXgpIHtcbiAgICAgIG0gPSAwO1xuICAgICAgZSA9IGVNYXg7XG4gICAgfSBlbHNlIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgbSA9ICh2YWx1ZSAqIGMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IGUgKyBlQmlhcztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IHZhbHVlICogTWF0aC5wb3coMiwgZUJpYXMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IDA7XG4gICAgfVxuICB9XG5cbiAgZm9yICg7IG1MZW4gPj0gODsgYnVmZmVyW29mZnNldCArIGldID0gbSAmIDB4ZmYsIGkgKz0gZCwgbSAvPSAyNTYsIG1MZW4gLT0gOCk7XG5cbiAgZSA9IChlIDw8IG1MZW4pIHwgbTtcbiAgZUxlbiArPSBtTGVuO1xuICBmb3IgKDsgZUxlbiA+IDA7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IGUgJiAweGZmLCBpICs9IGQsIGUgLz0gMjU2LCBlTGVuIC09IDgpO1xuXG4gIGJ1ZmZlcltvZmZzZXQgKyBpIC0gZF0gfD0gcyAqIDEyODtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9XHJcblxyXG4gIGZpcnN0OiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBZb3VyIGZpcnN0IExvb3BTY3JpcHQuIENsaWNrIFwiQ29tcGlsZVwiIGJlbG93IHRvIHN0YXJ0IVxyXG5cclxudG9uZSBub3RlMVxyXG4gIGR1cmF0aW9uIDI1MFxyXG4gIG9jdGF2ZSA0XHJcbiAgbm90ZSBDXHJcblxyXG50b25lIGJhc3MxXHJcbiAgZHVyYXRpb24gMjUwXHJcbiAgb2N0YXZlIDFcclxuICBub3RlIEJcclxuXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIG5vdGUxIHguLi4uLi4ueC4uLi4uLi5cclxuICBwYXR0ZXJuIGJhc3MxIC4uLi54Li4uLi4uLnguLi5cclxuXHJcblwiXCJcIlxyXG5cclxuICBub3RlczogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgTm90ZSBvdmVycmlkZXMhXHJcblxyXG4jIEgtTCBhcmUgdGhlIGJsYWNrIGtleXM6XHJcbiMgICAgIEggSSAgIEogSyBMXHJcbiMgICAgQyBEIEUgRiBHIEEgQlxyXG5cclxuIyBUcnkgc2V0dGluZyB0aGUgZHVyYXRpb24gdG8gMTAwXHJcbnRvbmUgbm90ZTFcclxuICBhZHNyIDAuMDA1IDAuMDUgMC43IDAuMDVcclxuICBkdXJhdGlvbiAyNTBcclxuXHJcbiMgU2FtcGxlcyBjYW4gaGF2ZSB0aGVpciBub3RlcyBvdmVycmlkZGVuIHRvbyFcclxuc2FtcGxlIGRpbmdcclxuICBzcmMgc2FtcGxlcy9kaW5nX2Uud2F2XHJcbiAgc3Jjbm90ZSBlXHJcblxyXG5sb29wIGxvb3AxXHJcbiAgcGF0dGVybiBub3RlMSBiLmEuZy5hLmIuYi5iLi4uXHJcblxyXG5sb29wIGxvb3AyXHJcbiAgcGF0dGVybiBkaW5nIGIuYS5nLmEuYi5iLmIuLi5cclxuXHJcbnRyYWNrIHNvbmdcclxuICBwYXR0ZXJuIGxvb3AxIHhcclxuICBwYXR0ZXJuIGxvb3AyIC54XHJcblxyXG5cIlwiXCJcclxuXHJcbiAgbW90dG86IFwiXCJcIlxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEFuIGFwcHJveGltYXRpb24gb2YgdGhlIGJlYXQgZnJvbSBEcmFrZSdzIFwiVGhlIE1vdHRvXCJcclxuXHJcbmJwbSAxMDBcclxuc2VjdGlvbiAjIHRvIHNoYXJlIEFEU1JcclxuICBhZHNyIDAuMDA1IDAuMDUgMC43IDAuMDVcclxuICB0b25lIGJhc3MxIC0+IG9jdGF2ZSAxXHJcbiAgdG9uZSBiYXNzMiAtPiBvY3RhdmUgMlxyXG5cclxuc2FtcGxlIGNsYXAgIC0+IHNyYyBzYW1wbGVzL2NsYXAud2F2XHJcbnNhbXBsZSBzbmFyZSAtPiBzcmMgc2FtcGxlcy9zbmFyZS53YXZcclxuc2FtcGxlIGhpaGF0IC0+IHNyYyBzYW1wbGVzL2hpaGF0LndhdlxyXG5cclxubG9vcCBsb29wMVxyXG4gIHBhdHRlcm4gaGloYXQgLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uLi54Li4uLi5cclxuICBwYXR0ZXJuIGNsYXAgIC4uLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uLi54Li4uXHJcbiAgcGF0dGVybiBzbmFyZSAuLi4uLi54Li4ueC4uLngueC4uLi4uLi4uLi4uLi4uLlxyXG4gIHBhdHRlcm4gYmFzczEgQmJiYmJiLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cclxuICBwYXR0ZXJuIGJhc3MyIC4uLi4uLkhoaGhoaERkZGRkZC4uLi5IaGhoSmouSmouXHJcblxyXG50cmFjayBzb25nXHJcbiAgcGF0dGVybiBsb29wMSB4eHh4XHJcblxyXG5cIlwiXCJcclxuXHJcbiAgbGVuZ3RoOiBcIlwiXCJcclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBTaG93aW5nIG9mZiB2YXJpb3VzIG5vdGUgbGVuZ3RocyB1c2luZyBjYXBzIGFuZCBsb3dlcmNhc2VcclxuIyBBbHNvIHNob3dzIHdoYXQgQURTUiBjYW4gZG8hXHJcblxyXG50b25lIG5vdGUxXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcblxyXG50b25lIG5vdGUyXHJcbiAgIyBOb3RlOiBPbmx5IHRoZSBmaXJzdCB0b25lIGhhcyBBRFNSXHJcblxyXG4jIElmIHlvdSB1c2UgYW55IGxldHRlcnMgb3RoZXIgdGhhbiBcInhcIiBvbiBhIHRvbmUgcGF0dGVybiwgeW91IG92ZXJyaWRlIGl0c1xyXG4jIG5vdGUgd2l0aCB0aGUgbm90ZSBsaXN0ZWQuIEFsc28sIGlmIHlvdSB1c2UgYW55IGNhcGl0YWwgbGV0dGVycyBpbiBhIHBhdHRlcm4sXHJcbiMgeW91IG92ZXJyaWRlIHRoZSBsZW5ndGggb2YgdGhhdCBub3RlIHdpdGggdGhlIG51bWJlciBvZiBtYXRjaGluZyBsb3dlcmNhc2VcclxuIyBsZXR0ZXJzIGZvbGxvd2luZyBpdC5cclxuXHJcbmxvb3AgbG9vcDFcclxuICBwYXR0ZXJuIG5vdGUxIEdnZ2dnZ2dnRmZmZmZmLi5BYWFhQmJiLkNjLi5ELi4uXHJcblxyXG5sb29wIGxvb3AyXHJcbiAgcGF0dGVybiBub3RlMiBHZ2dnZ2dnZ0ZmZmZmZi4uQWFhYUJiYi5DYy4uRC4uLlxyXG5cclxudHJhY2sgc29uZ1xyXG4gIHBhdHRlcm4gbG9vcDEgeC5cclxuICBwYXR0ZXJuIGxvb3AyIC54XHJcblxyXG5cIlwiXCJcclxuXHJcbiAgY2hvY29ibzogXCJcIlwiXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgVGhlIENob2NvYm8gVGhlbWUgKGZpcnN0IHBhcnQgb25seSlcclxuXHJcbmJwbSAxMjVcclxuXHJcbnNlY3Rpb24gVG9uZSAoaW4gYSBzZWN0aW9uIHRvIHNoYXJlIEFEU1IpXHJcbiAgYWRzciAwLjAwNSAwLjA1IDAuNyAwLjA1XHJcbiAgdG9uZSBjaG9jb2JvMVxyXG4gICAgb2N0YXZlIDVcclxuICB0b25lIGNob2NvYm8yXHJcbiAgICBvY3RhdmUgNFxyXG5cclxubG9vcCBsb29wMVxyXG4gcGF0dGVybiBjaG9jb2JvMSBEZGRkLi4uLi4uRGQuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5ELkUuRmZmZmZmLi4uXHJcbiBwYXR0ZXJuIGNob2NvYm8yIC4uLi5CYkdnRWUuLkJiR2dCYi4uR2cuLkJiYmJiYi5BYUdnR0FHLkYuR2dnZ2dnLkYuR2dHQi4uLi4uLi4uLi4uLi5cclxuXHJcbnRyYWNrIHNvbmdcclxuICBwYXR0ZXJuIGxvb3AxIHh4XHJcblwiXCJcIiIsImZyZXFUYWJsZSA9IFtcclxuICB7ICMgT2N0YXZlIDBcclxuXHJcbiAgICBcImFcIjogMjcuNTAwMFxyXG4gICAgXCJsXCI6IDI5LjEzNTNcclxuICAgIFwiYlwiOiAzMC44Njc3XHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDFcclxuICAgIFwiY1wiOiAzMi43MDMyXHJcbiAgICBcImhcIjogMzQuNjQ3OVxyXG4gICAgXCJkXCI6IDM2LjcwODFcclxuICAgIFwiaVwiOiAzOC44OTA5XHJcbiAgICBcImVcIjogNDEuMjAzNVxyXG4gICAgXCJmXCI6IDQzLjY1MzZcclxuICAgIFwialwiOiA0Ni4yNDkzXHJcbiAgICBcImdcIjogNDguOTk5NVxyXG4gICAgXCJrXCI6IDUxLjkxMzBcclxuICAgIFwiYVwiOiA1NS4wMDAwXHJcbiAgICBcImxcIjogNTguMjcwNVxyXG4gICAgXCJiXCI6IDYxLjczNTRcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgMlxyXG4gICAgXCJjXCI6IDY1LjQwNjRcclxuICAgIFwiaFwiOiA2OS4yOTU3XHJcbiAgICBcImRcIjogNzMuNDE2MlxyXG4gICAgXCJpXCI6IDc3Ljc4MTdcclxuICAgIFwiZVwiOiA4Mi40MDY5XHJcbiAgICBcImZcIjogODcuMzA3MVxyXG4gICAgXCJqXCI6IDkyLjQ5ODZcclxuICAgIFwiZ1wiOiA5Ny45OTg5XHJcbiAgICBcImtcIjogMTAzLjgyNlxyXG4gICAgXCJhXCI6IDExMC4wMDBcclxuICAgIFwibFwiOiAxMTYuNTQxXHJcbiAgICBcImJcIjogMTIzLjQ3MVxyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSAzXHJcbiAgICBcImNcIjogMTMwLjgxM1xyXG4gICAgXCJoXCI6IDEzOC41OTFcclxuICAgIFwiZFwiOiAxNDYuODMyXHJcbiAgICBcImlcIjogMTU1LjU2M1xyXG4gICAgXCJlXCI6IDE2NC44MTRcclxuICAgIFwiZlwiOiAxNzQuNjE0XHJcbiAgICBcImpcIjogMTg0Ljk5N1xyXG4gICAgXCJnXCI6IDE5NS45OThcclxuICAgIFwia1wiOiAyMDcuNjUyXHJcbiAgICBcImFcIjogMjIwLjAwMFxyXG4gICAgXCJsXCI6IDIzMy4wODJcclxuICAgIFwiYlwiOiAyNDYuOTQyXHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDRcclxuICAgIFwiY1wiOiAyNjEuNjI2XHJcbiAgICBcImhcIjogMjc3LjE4M1xyXG4gICAgXCJkXCI6IDI5My42NjVcclxuICAgIFwiaVwiOiAzMTEuMTI3XHJcbiAgICBcImVcIjogMzI5LjYyOFxyXG4gICAgXCJmXCI6IDM0OS4yMjhcclxuICAgIFwialwiOiAzNjkuOTk0XHJcbiAgICBcImdcIjogMzkxLjk5NVxyXG4gICAgXCJrXCI6IDQxNS4zMDVcclxuICAgIFwiYVwiOiA0NDAuMDAwXHJcbiAgICBcImxcIjogNDY2LjE2NFxyXG4gICAgXCJiXCI6IDQ5My44ODNcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgNVxyXG4gICAgXCJjXCI6IDUyMy4yNTFcclxuICAgIFwiaFwiOiA1NTQuMzY1XHJcbiAgICBcImRcIjogNTg3LjMzMFxyXG4gICAgXCJpXCI6IDYyMi4yNTRcclxuICAgIFwiZVwiOiA2NTkuMjU1XHJcbiAgICBcImZcIjogNjk4LjQ1NlxyXG4gICAgXCJqXCI6IDczOS45ODlcclxuICAgIFwiZ1wiOiA3ODMuOTkxXHJcbiAgICBcImtcIjogODMwLjYwOVxyXG4gICAgXCJhXCI6IDg4MC4wMDBcclxuICAgIFwibFwiOiA5MzIuMzI4XHJcbiAgICBcImJcIjogOTg3Ljc2N1xyXG4gIH1cclxuXHJcbiAgeyAjIE9jdGF2ZSA2XHJcbiAgICBcImNcIjogMTA0Ni41MFxyXG4gICAgXCJoXCI6IDExMDguNzNcclxuICAgIFwiZFwiOiAxMTc0LjY2XHJcbiAgICBcImlcIjogMTI0NC41MVxyXG4gICAgXCJlXCI6IDEzMTguNTFcclxuICAgIFwiZlwiOiAxMzk2LjkxXHJcbiAgICBcImpcIjogMTQ3OS45OFxyXG4gICAgXCJnXCI6IDE1NjcuOThcclxuICAgIFwia1wiOiAxNjYxLjIyXHJcbiAgICBcImFcIjogMTc2MC4wMFxyXG4gICAgXCJsXCI6IDE4NjQuNjZcclxuICAgIFwiYlwiOiAxOTc1LjUzXHJcbiAgfVxyXG5cclxuICB7ICMgT2N0YXZlIDdcclxuICAgIFwiY1wiOiAyMDkzLjAwXHJcbiAgICBcImhcIjogMjIxNy40NlxyXG4gICAgXCJkXCI6IDIzNDkuMzJcclxuICAgIFwiaVwiOiAyNDg5LjAyXHJcbiAgICBcImVcIjogMjYzNy4wMlxyXG4gICAgXCJmXCI6IDI3OTMuODNcclxuICAgIFwialwiOiAyOTU5Ljk2XHJcbiAgICBcImdcIjogMzEzNS45NlxyXG4gICAgXCJrXCI6IDMzMjIuNDRcclxuICAgIFwiYVwiOiAzNTIwLjAwXHJcbiAgICBcImxcIjogMzcyOS4zMVxyXG4gICAgXCJiXCI6IDM5NTEuMDdcclxuICB9XHJcblxyXG4gIHsgIyBPY3RhdmUgOFxyXG4gICAgXCJjXCI6IDQxODYuMDFcclxuICB9XHJcbl1cclxuXHJcbmxlZ2FsTm90ZVJlZ2V4ID0gL1thLWxdL1xyXG5cclxuZmluZEZyZXEgPSAob2N0YXZlLCBub3RlKSAtPlxyXG4gIG5vdGUgPSBub3RlLnRvTG93ZXJDYXNlKClcclxuICBpZiAob2N0YXZlID49IDApIGFuZCAob2N0YXZlIDwgZnJlcVRhYmxlLmxlbmd0aCkgYW5kIGxlZ2FsTm90ZVJlZ2V4LnRlc3Qobm90ZSlcclxuICAgIG9jdGF2ZVRhYmxlID0gZnJlcVRhYmxlW29jdGF2ZV1cclxuICAgIGlmIG9jdGF2ZVRhYmxlPyBhbmQgb2N0YXZlVGFibGVbbm90ZV0/XHJcbiAgICAgIHJldHVybiBvY3RhdmVUYWJsZVtub3RlXVxyXG4gIHJldHVybiA0NDAuMFxyXG5cclxubW9kdWxlLmV4cG9ydHMgPVxyXG4gIGZyZXFUYWJsZTogZnJlcVRhYmxlXHJcbiAgZmluZEZyZXE6IGZpbmRGcmVxXHJcbiIsIiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEltcG9ydHNcclxuXHJcbntmaW5kRnJlcX0gPSByZXF1aXJlICcuL2ZyZXEnXHJcbnJpZmZ3YXZlICAgPSByZXF1aXJlIFwiLi9yaWZmd2F2ZVwiXHJcbmpEYXRhVmlldyAgPSByZXF1aXJlICcuLi9qcy9qZGF0YXZpZXcnXHJcbmZzICAgICAgICAgPSByZXF1aXJlICdmcydcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEhlbHBlciBmdW5jdGlvbnNcclxuXHJcbmxvZ0RlYnVnID0gKGFyZ3MuLi4pIC0+XHJcbiAgIyBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmdzKVxyXG5cclxuY2xvbmUgPSAob2JqKSAtPlxyXG4gIGlmIG5vdCBvYmo/IG9yIHR5cGVvZiBvYmogaXNudCAnb2JqZWN0J1xyXG4gICAgcmV0dXJuIG9ialxyXG5cclxuICBpZiBvYmogaW5zdGFuY2VvZiBEYXRlXHJcbiAgICByZXR1cm4gbmV3IERhdGUob2JqLmdldFRpbWUoKSlcclxuXHJcbiAgaWYgb2JqIGluc3RhbmNlb2YgUmVnRXhwXHJcbiAgICBmbGFncyA9ICcnXHJcbiAgICBmbGFncyArPSAnZycgaWYgb2JqLmdsb2JhbD9cclxuICAgIGZsYWdzICs9ICdpJyBpZiBvYmouaWdub3JlQ2FzZT9cclxuICAgIGZsYWdzICs9ICdtJyBpZiBvYmoubXVsdGlsaW5lP1xyXG4gICAgZmxhZ3MgKz0gJ3knIGlmIG9iai5zdGlja3k/XHJcbiAgICByZXR1cm4gbmV3IFJlZ0V4cChvYmouc291cmNlLCBmbGFncylcclxuXHJcbiAgbmV3SW5zdGFuY2UgPSBuZXcgb2JqLmNvbnN0cnVjdG9yKClcclxuXHJcbiAgZm9yIGtleSBvZiBvYmpcclxuICAgIG5ld0luc3RhbmNlW2tleV0gPSBjbG9uZSBvYmpba2V5XVxyXG5cclxuICByZXR1cm4gbmV3SW5zdGFuY2VcclxuXHJcbnBhcnNlQm9vbCA9ICh2KSAtPlxyXG4gIHN3aXRjaCBTdHJpbmcodilcclxuICAgIHdoZW4gXCJ0cnVlXCIgdGhlbiB0cnVlXHJcbiAgICB3aGVuIFwieWVzXCIgdGhlbiB0cnVlXHJcbiAgICB3aGVuIFwib25cIiB0aGVuIHRydWVcclxuICAgIHdoZW4gXCIxXCIgdGhlbiB0cnVlXHJcbiAgICBlbHNlIGZhbHNlXHJcblxyXG5jb3VudEluZGVudCA9ICh0ZXh0KSAtPlxyXG4gIGluZGVudCA9IDBcclxuICBmb3IgaSBpbiBbMC4uLnRleHQubGVuZ3RoXVxyXG4gICAgaWYgdGV4dFtpXSA9PSAnXFx0J1xyXG4gICAgICBpbmRlbnQgKz0gOFxyXG4gICAgZWxzZVxyXG4gICAgICBpbmRlbnQrK1xyXG4gIHJldHVybiBpbmRlbnRcclxuXHJcbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4jIEJpdG1hcCBjb2RlIG9yaWdpbmFsbHkgZnJvbSBodHRwOi8vbXJjb2xlcy5jb20vbG93LXJlcy1wYWludC8gKE1JVCBsaWNlbnNlZClcclxuXHJcbl9hc0xpdHRsZUVuZGlhbkhleCA9ICh2YWx1ZSwgYnl0ZXMpIC0+XHJcbiAgIyBDb252ZXJ0IHZhbHVlIGludG8gbGl0dGxlIGVuZGlhbiBoZXggYnl0ZXNcclxuICAjIHZhbHVlIC0gdGhlIG51bWJlciBhcyBhIGRlY2ltYWwgaW50ZWdlciAocmVwcmVzZW50aW5nIGJ5dGVzKVxyXG4gICMgYnl0ZXMgLSB0aGUgbnVtYmVyIG9mIGJ5dGVzIHRoYXQgdGhpcyB2YWx1ZSB0YWtlcyB1cCBpbiBhIHN0cmluZ1xyXG5cclxuICAjIEV4YW1wbGU6XHJcbiAgIyBfYXNMaXR0bGVFbmRpYW5IZXgoMjgzNSwgNClcclxuICAjID4gJ1xceDEzXFx4MGJcXHgwMFxceDAwJ1xyXG5cclxuICByZXN1bHQgPSBbXVxyXG5cclxuICB3aGlsZSBieXRlcyA+IDBcclxuICAgIHJlc3VsdC5wdXNoKFN0cmluZy5mcm9tQ2hhckNvZGUodmFsdWUgJiAyNTUpKVxyXG4gICAgdmFsdWUgPj49IDhcclxuICAgIGJ5dGVzLS1cclxuXHJcbiAgcmV0dXJuIHJlc3VsdC5qb2luKCcnKVxyXG5cclxuX2NvbGxhcHNlRGF0YSA9IChyb3dzLCByb3dfcGFkZGluZykgLT5cclxuICAjIENvbnZlcnQgcm93cyBvZiBSR0IgYXJyYXlzIGludG8gQk1QIGRhdGFcclxuICByb3dzX2xlbiA9IHJvd3MubGVuZ3RoXHJcbiAgcGl4ZWxzX2xlbiA9IGlmIHJvd3NfbGVuIHRoZW4gcm93c1swXS5sZW5ndGggZWxzZSAwXHJcbiAgcGFkZGluZyA9ICcnXHJcbiAgcmVzdWx0ID0gW11cclxuXHJcbiAgd2hpbGUgcm93X3BhZGRpbmcgPiAwXHJcbiAgICBwYWRkaW5nICs9ICdcXHgwMCdcclxuICAgIHJvd19wYWRkaW5nLS1cclxuXHJcbiAgZm9yIGkgaW4gWzAuLi5yb3dzX2xlbl1cclxuICAgIGZvciBqIGluIFswLi4ucGl4ZWxzX2xlbl1cclxuICAgICAgcGl4ZWwgPSByb3dzW2ldW2pdXHJcbiAgICAgIHJlc3VsdC5wdXNoKFN0cmluZy5mcm9tQ2hhckNvZGUocGl4ZWxbMl0pICtcclxuICAgICAgICAgICAgICAgICAgU3RyaW5nLmZyb21DaGFyQ29kZShwaXhlbFsxXSkgK1xyXG4gICAgICAgICAgICAgICAgICBTdHJpbmcuZnJvbUNoYXJDb2RlKHBpeGVsWzBdKSlcclxuXHJcbiAgICByZXN1bHQucHVzaChwYWRkaW5nKVxyXG5cclxuICByZXR1cm4gcmVzdWx0LmpvaW4oJycpXHJcblxyXG5fc2NhbGVSb3dzID0gKHJvd3MsIHNjYWxlKSAtPlxyXG4gICMgU2ltcGxlc3Qgc2NhbGluZyBwb3NzaWJsZVxyXG4gIHJlYWxfdyA9IHJvd3MubGVuZ3RoXHJcbiAgc2NhbGVkX3cgPSBwYXJzZUludChyZWFsX3cgKiBzY2FsZSlcclxuICByZWFsX2ggPSBpZiByZWFsX3cgdGhlbiByb3dzWzBdLmxlbmd0aCBlbHNlIDBcclxuICBzY2FsZWRfaCA9IHBhcnNlSW50KHJlYWxfaCAqIHNjYWxlKVxyXG4gIG5ld19yb3dzID0gW11cclxuXHJcbiAgZm9yIHkgaW4gWzAuLi5zY2FsZWRfaF1cclxuICAgIG5ld19yb3dzLnB1c2gobmV3X3JvdyA9IFtdKVxyXG4gICAgZm9yIHggaW4gWzAuLi5zY2FsZWRfd11cclxuICAgICAgbmV3X3Jvdy5wdXNoKHJvd3NbcGFyc2VJbnQoeS9zY2FsZSldW3BhcnNlSW50KHgvc2NhbGUpXSlcclxuXHJcbiAgcmV0dXJuIG5ld19yb3dzXHJcblxyXG5nZW5lcmF0ZUJpdG1hcERhdGFVUkwgPSAocm93cywgc2NhbGUpIC0+XHJcbiAgIyBFeHBlY3RzIHJvd3Mgc3RhcnRpbmcgaW4gYm90dG9tIGxlZnRcclxuICAjIGZvcm1hdHRlZCBsaWtlIHRoaXM6IFtbWzI1NSwgMCwgMF0sIFsyNTUsIDI1NSwgMF0sIC4uLl0sIC4uLl1cclxuICAjIHdoaWNoIHJlcHJlc2VudHM6IFtbcmVkLCB5ZWxsb3csIC4uLl0sIC4uLl1cclxuXHJcbiAgaWYgIWJ0b2FcclxuICAgIHJldHVybiBmYWxzZVxyXG5cclxuICBzY2FsZSA9IHNjYWxlIHx8IDFcclxuICBpZiAoc2NhbGUgIT0gMSlcclxuICAgIHJvd3MgPSBfc2NhbGVSb3dzKHJvd3MsIHNjYWxlKVxyXG5cclxuICBoZWlnaHQgPSByb3dzLmxlbmd0aCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIyB0aGUgbnVtYmVyIG9mIHJvd3NcclxuICB3aWR0aCA9IGlmIGhlaWdodCB0aGVuIHJvd3NbMF0ubGVuZ3RoIGVsc2UgMCAgICAgICAgIyB0aGUgbnVtYmVyIG9mIGNvbHVtbnMgcGVyIHJvd1xyXG4gIHJvd19wYWRkaW5nID0gKDQgLSAod2lkdGggKiAzKSAlIDQpICUgNCAgICAgICAgICAgICAjIHBhZCBlYWNoIHJvdyB0byBhIG11bHRpcGxlIG9mIDQgYnl0ZXNcclxuICBudW1fZGF0YV9ieXRlcyA9ICh3aWR0aCAqIDMgKyByb3dfcGFkZGluZykgKiBoZWlnaHQgIyBzaXplIGluIGJ5dGVzIG9mIEJNUCBkYXRhXHJcbiAgbnVtX2ZpbGVfYnl0ZXMgPSA1NCArIG51bV9kYXRhX2J5dGVzICAgICAgICAgICAgICAgICMgZnVsbCBoZWFkZXIgc2l6ZSAob2Zmc2V0KSArIHNpemUgb2YgZGF0YVxyXG5cclxuICBoZWlnaHQgPSBfYXNMaXR0bGVFbmRpYW5IZXgoaGVpZ2h0LCA0KVxyXG4gIHdpZHRoID0gX2FzTGl0dGxlRW5kaWFuSGV4KHdpZHRoLCA0KVxyXG4gIG51bV9kYXRhX2J5dGVzID0gX2FzTGl0dGxlRW5kaWFuSGV4KG51bV9kYXRhX2J5dGVzLCA0KVxyXG4gIG51bV9maWxlX2J5dGVzID0gX2FzTGl0dGxlRW5kaWFuSGV4KG51bV9maWxlX2J5dGVzLCA0KVxyXG5cclxuICAjIHRoZXNlIGFyZSB0aGUgYWN0dWFsIGJ5dGVzIG9mIHRoZSBmaWxlLi4uXHJcblxyXG4gIGZpbGUgPSAnQk0nICsgICAgICAgICAgICAgICAgIyBcIk1hZ2ljIE51bWJlclwiXHJcbiAgICAgICAgICBudW1fZmlsZV9ieXRlcyArICAgICAjIHNpemUgb2YgdGhlIGZpbGUgKGJ5dGVzKSpcclxuICAgICAgICAgICdcXHgwMFxceDAwJyArICAgICAgICAgIyByZXNlcnZlZFxyXG4gICAgICAgICAgJ1xceDAwXFx4MDAnICsgICAgICAgICAjIHJlc2VydmVkXHJcbiAgICAgICAgICAnXFx4MzZcXHgwMFxceDAwXFx4MDAnICsgIyBvZmZzZXQgb2Ygd2hlcmUgQk1QIGRhdGEgbGl2ZXMgKDU0IGJ5dGVzKVxyXG4gICAgICAgICAgJ1xceDI4XFx4MDBcXHgwMFxceDAwJyArICMgbnVtYmVyIG9mIHJlbWFpbmluZyBieXRlcyBpbiBoZWFkZXIgZnJvbSBoZXJlICg0MCBieXRlcylcclxuICAgICAgICAgIHdpZHRoICsgICAgICAgICAgICAgICMgdGhlIHdpZHRoIG9mIHRoZSBiaXRtYXAgaW4gcGl4ZWxzKlxyXG4gICAgICAgICAgaGVpZ2h0ICsgICAgICAgICAgICAgIyB0aGUgaGVpZ2h0IG9mIHRoZSBiaXRtYXAgaW4gcGl4ZWxzKlxyXG4gICAgICAgICAgJ1xceDAxXFx4MDAnICsgICAgICAgICAjIHRoZSBudW1iZXIgb2YgY29sb3IgcGxhbmVzICgxKVxyXG4gICAgICAgICAgJ1xceDE4XFx4MDAnICsgICAgICAgICAjIDI0IGJpdHMgLyBwaXhlbFxyXG4gICAgICAgICAgJ1xceDAwXFx4MDBcXHgwMFxceDAwJyArICMgTm8gY29tcHJlc3Npb24gKDApXHJcbiAgICAgICAgICBudW1fZGF0YV9ieXRlcyArICAgICAjIHNpemUgb2YgdGhlIEJNUCBkYXRhIChieXRlcykqXHJcbiAgICAgICAgICAnXFx4MTNcXHgwQlxceDAwXFx4MDAnICsgIyAyODM1IHBpeGVscy9tZXRlciAtIGhvcml6b250YWwgcmVzb2x1dGlvblxyXG4gICAgICAgICAgJ1xceDEzXFx4MEJcXHgwMFxceDAwJyArICMgMjgzNSBwaXhlbHMvbWV0ZXIgLSB0aGUgdmVydGljYWwgcmVzb2x1dGlvblxyXG4gICAgICAgICAgJ1xceDAwXFx4MDBcXHgwMFxceDAwJyArICMgTnVtYmVyIG9mIGNvbG9ycyBpbiB0aGUgcGFsZXR0ZSAoa2VlcCAwIGZvciAyNC1iaXQpXHJcbiAgICAgICAgICAnXFx4MDBcXHgwMFxceDAwXFx4MDAnICsgIyAwIGltcG9ydGFudCBjb2xvcnMgKG1lYW5zIGFsbCBjb2xvcnMgYXJlIGltcG9ydGFudClcclxuICAgICAgICAgIF9jb2xsYXBzZURhdGEocm93cywgcm93X3BhZGRpbmcpXHJcblxyXG4gIHJldHVybiAnZGF0YTppbWFnZS9ibXA7YmFzZTY0LCcgKyBidG9hKGZpbGUpXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBQYXJzZXJcclxuXHJcbmNsYXNzIFBhcnNlclxyXG4gIGNvbnN0cnVjdG9yOiAoQGxvZykgLT5cclxuICAgIEBjb21tZW50UmVnZXggPSAvXihbXiNdKj8pKFxccyojLiopPyQvXHJcbiAgICBAb25seVdoaXRlc3BhY2VSZWdleCA9IC9eXFxzKiQvXHJcbiAgICBAaW5kZW50UmVnZXggPSAvXihcXHMqKShcXFMuKikkL1xyXG4gICAgQGxlYWRpbmdVbmRlcnNjb3JlUmVnZXggPSAvXl8vXHJcbiAgICBAaGFzQ2FwaXRhbExldHRlcnNSZWdleCA9IC9bQS1aXS9cclxuICAgIEBpc05vdGVSZWdleCA9IC9bQS1MYS1sXS9cclxuXHJcbiAgICAjIEgtTCBhcmUgdGhlIGJsYWNrIGtleXM6XHJcbiAgICAjICBIIEkgICBKIEsgTFxyXG4gICAgIyBDIEQgRSBGIEcgQSBCXHJcblxyXG4gICAgQG5hbWVkU3RhdGVzID1cclxuICAgICAgZGVmYXVsdDpcclxuICAgICAgICBzcmNvY3RhdmU6IDRcclxuICAgICAgICBzcmNub3RlOiAnYSdcclxuICAgICAgICBvY3RhdmU6IDRcclxuICAgICAgICBub3RlOiAnYSdcclxuICAgICAgICB3YXZlOiAnc2luZSdcclxuICAgICAgICBicG06IDEyMFxyXG4gICAgICAgIGR1cmF0aW9uOiAyMDBcclxuICAgICAgICB2b2x1bWU6IDEuMFxyXG4gICAgICAgIGNsaXA6IHRydWVcclxuICAgICAgICByZXZlcmI6XHJcbiAgICAgICAgICBkZWxheTogMFxyXG4gICAgICAgICAgZGVjYXk6IDBcclxuICAgICAgICBhZHNyOiAjIG5vLW9wIEFEU1IgKGZ1bGwgMS4wIHN1c3RhaW4pXHJcbiAgICAgICAgICBhOiAwXHJcbiAgICAgICAgICBkOiAwXHJcbiAgICAgICAgICBzOiAxXHJcbiAgICAgICAgICByOiAxXHJcblxyXG4gICAgIyBpZiBhIGtleSBpcyBwcmVzZW50IGluIHRoaXMgbWFwLCB0aGF0IG5hbWUgaXMgY29uc2lkZXJlZCBhbiBcIm9iamVjdFwiXHJcbiAgICBAb2JqZWN0S2V5cyA9XHJcbiAgICAgIHRvbmU6XHJcbiAgICAgICAgd2F2ZTogJ3N0cmluZydcclxuICAgICAgICBmcmVxOiAnZmxvYXQnXHJcbiAgICAgICAgZHVyYXRpb246ICdmbG9hdCdcclxuICAgICAgICBhZHNyOiAnYWRzcidcclxuICAgICAgICBvY3RhdmU6ICdpbnQnXHJcbiAgICAgICAgbm90ZTogJ3N0cmluZydcclxuICAgICAgICB2b2x1bWU6ICdmbG9hdCdcclxuICAgICAgICBjbGlwOiAnYm9vbCdcclxuICAgICAgICByZXZlcmI6ICdyZXZlcmInXHJcblxyXG4gICAgICBzYW1wbGU6XHJcbiAgICAgICAgc3JjOiAnc3RyaW5nJ1xyXG4gICAgICAgIHZvbHVtZTogJ2Zsb2F0J1xyXG4gICAgICAgIGNsaXA6ICdib29sJ1xyXG4gICAgICAgIHJldmVyYjogJ3JldmVyYidcclxuICAgICAgICBzcmNvY3RhdmU6ICdpbnQnXHJcbiAgICAgICAgc3Jjbm90ZTogJ3N0cmluZydcclxuICAgICAgICBvY3RhdmU6ICdpbnQnXHJcbiAgICAgICAgbm90ZTogJ3N0cmluZydcclxuXHJcbiAgICAgIGxvb3A6XHJcbiAgICAgICAgYnBtOiAnaW50J1xyXG5cclxuICAgICAgdHJhY2s6IHt9XHJcblxyXG4gICAgQHN0YXRlU3RhY2sgPSBbXVxyXG4gICAgQHJlc2V0ICdkZWZhdWx0JywgMFxyXG4gICAgQG9iamVjdHMgPSB7fVxyXG4gICAgQG9iamVjdCA9IG51bGxcclxuICAgIEBvYmplY3RTY29wZVJlYWR5ID0gZmFsc2VcclxuXHJcbiAgaXNPYmplY3RUeXBlOiAodHlwZSkgLT5cclxuICAgIHJldHVybiBAb2JqZWN0S2V5c1t0eXBlXT9cclxuXHJcbiAgZXJyb3I6ICh0ZXh0KSAtPlxyXG4gICAgQGxvZy5lcnJvciBcIlBBUlNFIEVSUk9SLCBsaW5lICN7QGxpbmVOb306ICN7dGV4dH1cIlxyXG5cclxuICByZXNldDogKG5hbWUsIGluZGVudCkgLT5cclxuICAgIG5hbWUgPz0gJ2RlZmF1bHQnXHJcbiAgICBpbmRlbnQgPz0gMFxyXG4gICAgaWYgbm90IEBuYW1lZFN0YXRlc1tuYW1lXVxyXG4gICAgICBAZXJyb3IgXCJpbnZhbGlkIHJlc2V0IG5hbWU6ICN7bmFtZX1cIlxyXG4gICAgICByZXR1cm4gZmFsc2VcclxuICAgIG5ld1N0YXRlID0gY2xvbmUoQG5hbWVkU3RhdGVzW25hbWVdKVxyXG4gICAgbmV3U3RhdGUuX2luZGVudCA9IGluZGVudFxyXG4gICAgQHN0YXRlU3RhY2sucHVzaCBuZXdTdGF0ZVxyXG4gICAgcmV0dXJuIHRydWVcclxuXHJcbiAgZmxhdHRlbjogKCkgLT5cclxuICAgIGZsYXR0ZW5lZFN0YXRlID0ge31cclxuICAgIGZvciBzdGF0ZSBpbiBAc3RhdGVTdGFja1xyXG4gICAgICBmb3Iga2V5IG9mIHN0YXRlXHJcbiAgICAgICAgZmxhdHRlbmVkU3RhdGVba2V5XSA9IHN0YXRlW2tleV1cclxuICAgIHJldHVybiBmbGF0dGVuZWRTdGF0ZVxyXG5cclxuICB0cmFjZTogKHByZWZpeCkgLT5cclxuICAgIHByZWZpeCA/PSAnJ1xyXG4gICAgQGxvZy52ZXJib3NlIFwidHJhY2U6ICN7cHJlZml4fSBcIiArIEpTT04uc3RyaW5naWZ5KEBmbGF0dGVuKCkpXHJcblxyXG4gIGNyZWF0ZU9iamVjdDogKGluZGVudCwgZGF0YS4uLikgLT5cclxuICAgICAgQG9iamVjdCA9IHsgX2luZGVudDogaW5kZW50IH1cclxuICAgICAgZm9yIGkgaW4gWzAuLi5kYXRhLmxlbmd0aF0gYnkgMlxyXG4gICAgICAgIEBvYmplY3RbZGF0YVtpXV0gPSBkYXRhW2krMV1cclxuICAgICAgQG9iamVjdFNjb3BlUmVhZHkgPSB0cnVlXHJcblxyXG4gICAgICBpZiBAb2JqZWN0Ll90eXBlID09ICdsb29wJ1xyXG4gICAgICAgIEBvYmplY3QuX3BhdHRlcm5zID0gW11cclxuXHJcbiAgICAgIGlmIEBvYmplY3QuX3R5cGUgPT0gJ3RyYWNrJ1xyXG4gICAgICAgIEBvYmplY3QuX3BhdHRlcm5zID0gW11cclxuXHJcbiAgICAgIGlmIEBvYmplY3QuX25hbWVcclxuICAgICAgICBAbGFzdE9iamVjdCA9IEBvYmplY3QuX25hbWVcclxuICAgICAgICBsb2dEZWJ1ZyBcImNyZWF0ZU9iamVjdFsje2luZGVudH1dOiBcIiwgQGxhc3RPYmplY3RcclxuXHJcbiAgZmluaXNoT2JqZWN0OiAtPlxyXG4gICAgaWYgQG9iamVjdFxyXG4gICAgICBzdGF0ZSA9IEBmbGF0dGVuKClcclxuICAgICAgZm9yIGtleSBvZiBAb2JqZWN0S2V5c1tAb2JqZWN0Ll90eXBlXVxyXG4gICAgICAgIGV4cGVjdGVkVHlwZSA9IEBvYmplY3RLZXlzW0BvYmplY3QuX3R5cGVdW2tleV1cclxuICAgICAgICBpZiBzdGF0ZVtrZXldP1xyXG4gICAgICAgICAgdiA9IHN0YXRlW2tleV1cclxuICAgICAgICAgIEBvYmplY3Rba2V5XSA9IHN3aXRjaCBleHBlY3RlZFR5cGVcclxuICAgICAgICAgICAgd2hlbiAnaW50JyB0aGVuIHBhcnNlSW50KHYpXHJcbiAgICAgICAgICAgIHdoZW4gJ2Zsb2F0JyB0aGVuIHBhcnNlRmxvYXQodilcclxuICAgICAgICAgICAgd2hlbiAnYm9vbCcgdGhlbiBwYXJzZUJvb2wodilcclxuICAgICAgICAgICAgZWxzZSB2XHJcblxyXG4gICAgICBsb2dEZWJ1ZyBcImZpbmlzaE9iamVjdDogXCIsIEBvYmplY3RcclxuICAgICAgQG9iamVjdHNbQG9iamVjdC5fbmFtZV0gPSBAb2JqZWN0XHJcbiAgICBAb2JqZWN0ID0gbnVsbFxyXG5cclxuICBjcmVhdGluZ09iamVjdFR5cGU6ICh0eXBlKSAtPlxyXG4gICAgcmV0dXJuIGZhbHNlIGlmIG5vdCBAb2JqZWN0XHJcbiAgICByZXR1cm4gZmFsc2UgaWYgbm90IEBvYmplY3QuX3R5cGUgPT0gdHlwZVxyXG4gICAgcmV0dXJuIHRydWVcclxuXHJcbiAgdXBkYXRlRmFrZUluZGVudHM6IChpbmRlbnQpIC0+XHJcbiAgICByZXR1cm4gaWYgaW5kZW50ID49IDEwMDBcclxuICAgIGkgPSBAc3RhdGVTdGFjay5sZW5ndGggLSAxXHJcbiAgICB3aGlsZSBpID4gMFxyXG4gICAgICBwcmV2SW5kZW50ID0gQHN0YXRlU3RhY2tbaSAtIDFdLl9pbmRlbnRcclxuICAgICAgaWYgKEBzdGF0ZVN0YWNrW2ldLl9pbmRlbnQgPiAxMDAwKSBhbmQgKHByZXZJbmRlbnQgPCBpbmRlbnQpXHJcbiAgICAgICAgbG9nRGVidWcgXCJ1cGRhdGVGYWtlSW5kZW50czogY2hhbmdpbmcgc3RhY2sgaW5kZW50ICN7aX0gZnJvbSAje0BzdGF0ZVN0YWNrW2ldLl9pbmRlbnR9IHRvICN7aW5kZW50fVwiXHJcbiAgICAgICAgQHN0YXRlU3RhY2tbaV0uX2luZGVudCA9IGluZGVudFxyXG4gICAgICBpLS1cclxuXHJcbiAgcHVzaFN0YXRlOiAoaW5kZW50KSAtPlxyXG4gICAgaW5kZW50ID89IDBcclxuICAgIGxvZ0RlYnVnIFwicHVzaFN0YXRlKCN7aW5kZW50fSlcIlxyXG4gICAgQHVwZGF0ZUZha2VJbmRlbnRzIGluZGVudFxyXG4gICAgQHN0YXRlU3RhY2sucHVzaCB7IF9pbmRlbnQ6IGluZGVudCB9XHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuICBwb3BTdGF0ZTogKGluZGVudCkgLT5cclxuICAgIGxvZ0RlYnVnIFwicG9wU3RhdGUoI3tpbmRlbnR9KVwiXHJcbiAgICBpZiBAb2JqZWN0P1xyXG4gICAgICBpZiBpbmRlbnQgPD0gQG9iamVjdC5faW5kZW50XHJcbiAgICAgICAgQGZpbmlzaE9iamVjdCgpXHJcblxyXG4gICAgQHVwZGF0ZUZha2VJbmRlbnRzIGluZGVudFxyXG5cclxuICAgIGxvb3BcclxuICAgICAgdG9wSW5kZW50ID0gQGdldFRvcEluZGVudCgpXHJcbiAgICAgIGxvZ0RlYnVnIFwicG9wU3RhdGUoI3tpbmRlbnR9KSB0b3AgaW5kZW50ICN7dG9wSW5kZW50fVwiXHJcbiAgICAgIGJyZWFrIGlmIGluZGVudCA9PSB0b3BJbmRlbnRcclxuICAgICAgaWYgQHN0YXRlU3RhY2subGVuZ3RoIDwgMlxyXG4gICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgICBsb2dEZWJ1ZyBcInBvcFN0YXRlKCN7aW5kZW50fSkgcG9wcGluZyBpbmRlbnQgI3t0b3BJbmRlbnR9XCJcclxuICAgICAgQHN0YXRlU3RhY2sucG9wKClcclxuICAgIHJldHVybiB0cnVlXHJcblxyXG4gIHBhcnNlUGF0dGVybjogKHBhdHRlcm4pIC0+XHJcbiAgICBvdmVycmlkZUxlbmd0aCA9IEBoYXNDYXBpdGFsTGV0dGVyc1JlZ2V4LnRlc3QocGF0dGVybilcclxuICAgIGkgPSAwXHJcbiAgICBzb3VuZHMgPSBbXVxyXG4gICAgd2hpbGUgaSA8IHBhdHRlcm4ubGVuZ3RoXHJcbiAgICAgIGMgPSBwYXR0ZXJuW2ldXHJcbiAgICAgIGlmIGMgIT0gJy4nXHJcbiAgICAgICAgc3ltYm9sID0gYy50b0xvd2VyQ2FzZSgpXHJcbiAgICAgICAgc291bmQgPSB7IG9mZnNldDogaSB9XHJcbiAgICAgICAgaWYgQGlzTm90ZVJlZ2V4LnRlc3QoYylcclxuICAgICAgICAgIHNvdW5kLm5vdGUgPSBzeW1ib2xcclxuICAgICAgICBpZiBvdmVycmlkZUxlbmd0aFxyXG4gICAgICAgICAgbGVuZ3RoID0gMVxyXG4gICAgICAgICAgbG9vcFxyXG4gICAgICAgICAgICBuZXh0ID0gcGF0dGVybltpKzFdXHJcbiAgICAgICAgICAgIGlmIG5leHQgPT0gc3ltYm9sXHJcbiAgICAgICAgICAgICAgbGVuZ3RoKytcclxuICAgICAgICAgICAgICBpKytcclxuICAgICAgICAgICAgICBpZiBpID09IHBhdHRlcm4ubGVuZ3RoXHJcbiAgICAgICAgICAgICAgICBicmVha1xyXG4gICAgICAgICAgICBlbHNlXHJcbiAgICAgICAgICAgICAgYnJlYWtcclxuICAgICAgICAgIHNvdW5kLmxlbmd0aCA9IGxlbmd0aFxyXG4gICAgICAgIHNvdW5kcy5wdXNoIHNvdW5kXHJcbiAgICAgIGkrK1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgcGF0dGVybjogcGF0dGVyblxyXG4gICAgICBsZW5ndGg6IHBhdHRlcm4ubGVuZ3RoXHJcbiAgICAgIHNvdW5kczogc291bmRzXHJcbiAgICB9XHJcblxyXG4gIGdldFRvcEluZGVudDogLT5cclxuICAgIHJldHVybiBAc3RhdGVTdGFja1tAc3RhdGVTdGFjay5sZW5ndGggLSAxXS5faW5kZW50XHJcblxyXG4gIHByb2Nlc3NUb2tlbnM6ICh0b2tlbnMsIGluZGVudCkgLT5cclxuICAgIGNtZCA9IHRva2Vuc1swXS50b0xvd2VyQ2FzZSgpXHJcbiAgICBpZiBjbWQgPT0gJ3Jlc2V0J1xyXG4gICAgICBpZiBub3QgQHJlc2V0KHRva2Vuc1sxXSwgaW5kZW50KVxyXG4gICAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgZWxzZSBpZiBjbWQgPT0gJ3NlY3Rpb24nXHJcbiAgICAgIEBvYmplY3RTY29wZVJlYWR5ID0gdHJ1ZVxyXG4gICAgZWxzZSBpZiBAaXNPYmplY3RUeXBlKGNtZClcclxuICAgICAgQGNyZWF0ZU9iamVjdCBpbmRlbnQsICdfdHlwZScsIGNtZCwgJ19uYW1lJywgdG9rZW5zWzFdXHJcbiAgICBlbHNlIGlmIGNtZCA9PSAncGF0dGVybidcclxuICAgICAgaWYgbm90IChAY3JlYXRpbmdPYmplY3RUeXBlKCdsb29wJykgb3IgQGNyZWF0aW5nT2JqZWN0VHlwZSgndHJhY2snKSlcclxuICAgICAgICBAZXJyb3IgXCJ1bmV4cGVjdGVkIHBhdHRlcm4gY29tbWFuZFwiXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlXHJcblxyXG4gICAgICBwYXR0ZXJuID0gQHBhcnNlUGF0dGVybih0b2tlbnNbMl0pXHJcbiAgICAgIHBhdHRlcm4uc3JjID0gdG9rZW5zWzFdXHJcbiAgICAgIEBvYmplY3QuX3BhdHRlcm5zLnB1c2ggcGF0dGVyblxyXG4gICAgZWxzZSBpZiBjbWQgPT0gJ2Fkc3InXHJcbiAgICAgIEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdW2NtZF0gPVxyXG4gICAgICAgIGE6IHBhcnNlRmxvYXQodG9rZW5zWzFdKVxyXG4gICAgICAgIGQ6IHBhcnNlRmxvYXQodG9rZW5zWzJdKVxyXG4gICAgICAgIHM6IHBhcnNlRmxvYXQodG9rZW5zWzNdKVxyXG4gICAgICAgIHI6IHBhcnNlRmxvYXQodG9rZW5zWzRdKVxyXG4gICAgZWxzZSBpZiBjbWQgPT0gJ3JldmVyYidcclxuICAgICAgQHN0YXRlU3RhY2tbQHN0YXRlU3RhY2subGVuZ3RoIC0gMV1bY21kXSA9XHJcbiAgICAgICAgZGVsYXk6IHBhcnNlSW50KHRva2Vuc1sxXSlcclxuICAgICAgICBkZWNheTogcGFyc2VGbG9hdCh0b2tlbnNbMl0pXHJcbiAgICBlbHNlXHJcbiAgICAgICMgVGhlIGJvcmluZyByZWd1bGFyIGNhc2U6IHN0YXNoIG9mZiB0aGlzIHZhbHVlXHJcbiAgICAgIGlmIEBsZWFkaW5nVW5kZXJzY29yZVJlZ2V4LnRlc3QoY21kKVxyXG4gICAgICAgIEBlcnJvciBcImNhbm5vdCBzZXQgaW50ZXJuYWwgbmFtZXMgKHVuZGVyc2NvcmUgcHJlZml4KVwiXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgIEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdW2NtZF0gPSB0b2tlbnNbMV1cclxuXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuICBwYXJzZTogKHRleHQpIC0+XHJcbiAgICBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpXHJcbiAgICBAbGluZU5vID0gMFxyXG4gICAgZm9yIGxpbmUgaW4gbGluZXNcclxuICAgICAgQGxpbmVObysrXHJcbiAgICAgIGxpbmUgPSBsaW5lLnJlcGxhY2UoLyhcXHJcXG58XFxufFxccikvZ20sXCJcIikgIyBzdHJpcCBuZXdsaW5lc1xyXG4gICAgICBsaW5lID0gQGNvbW1lbnRSZWdleC5leGVjKGxpbmUpWzFdICAgICAgICMgc3RyaXAgY29tbWVudHMgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2VcclxuICAgICAgY29udGludWUgaWYgQG9ubHlXaGl0ZXNwYWNlUmVnZXgudGVzdChsaW5lKVxyXG4gICAgICBbXywgaW5kZW50VGV4dCwgbGluZV0gPSBAaW5kZW50UmVnZXguZXhlYyBsaW5lXHJcbiAgICAgIGluZGVudCA9IGNvdW50SW5kZW50IGluZGVudFRleHRcclxuICAgICAgbGluZU9ianMgPSBbXVxyXG5cclxuICAgICAgYXJyb3dTZWN0aW9ucyA9IGxpbmUuc3BsaXQoL1xccyotPlxccyovKVxyXG4gICAgICBmb3IgYXJyb3dTZWN0aW9uIGluIGFycm93U2VjdGlvbnNcclxuICAgICAgICBzZW1pU2VjdGlvbnMgPSBhcnJvd1NlY3Rpb24uc3BsaXQoL1xccyo7XFxzKi8pXHJcbiAgICAgICAgZm9yIHNlbWlTZWN0aW9uIGluIHNlbWlTZWN0aW9uc1xyXG4gICAgICAgICAgbGluZU9ianMucHVzaCB7XHJcbiAgICAgICAgICAgICAgaW5kZW50OiBpbmRlbnRcclxuICAgICAgICAgICAgICBsaW5lOiBzZW1pU2VjdGlvblxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgaW5kZW50ICs9IDEwMDBcclxuXHJcbiAgICAgIGZvciBvYmogaW4gbGluZU9ianNcclxuICAgICAgICBsb2dEZWJ1ZyBcImhhbmRsaW5nIGluZGVudDogXCIgKyBKU09OLnN0cmluZ2lmeShvYmopXHJcbiAgICAgICAgdG9wSW5kZW50ID0gQGdldFRvcEluZGVudCgpXHJcbiAgICAgICAgaWYgb2JqLmluZGVudCA+IHRvcEluZGVudFxyXG4gICAgICAgICAgQHB1c2hTdGF0ZShvYmouaW5kZW50KVxyXG4gICAgICAgIGVsc2VcclxuICAgICAgICAgIGlmIG5vdCBAcG9wU3RhdGUob2JqLmluZGVudClcclxuICAgICAgICAgICAgQGxvZy5lcnJvciBcInVuZXhwZWN0ZWQgb3V0ZGVudFwiXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxyXG5cclxuICAgICAgICBsb2dEZWJ1ZyBcInByb2Nlc3Npbmc6IFwiICsgSlNPTi5zdHJpbmdpZnkob2JqKVxyXG4gICAgICAgIGlmIG5vdCBAcHJvY2Vzc1Rva2VucyhvYmoubGluZS5zcGxpdCgvXFxzKy8pLCBvYmouaW5kZW50KVxyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlXHJcblxyXG4gICAgQHBvcFN0YXRlKDApXHJcbiAgICByZXR1cm4gdHJ1ZVxyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgUmVuZGVyZXJcclxuXHJcbiMgSW4gYWxsIGNhc2VzIHdoZXJlIGEgcmVuZGVyZWQgc291bmQgaXMgZ2VuZXJhdGVkLCB0aGVyZSBhcmUgYWN0dWFsbHkgdHdvIGxlbmd0aHNcclxuIyBhc3NvY2lhdGVkIHdpdGggdGhlIHNvdW5kLiBcInNvdW5kLmxlbmd0aFwiIGlzIHRoZSBcImV4cGVjdGVkXCIgbGVuZ3RoLCB3aXRoIHJlZ2FyZHNcclxuIyB0byB0aGUgdHlwZWQtaW4gZHVyYXRpb24gZm9yIGl0IG9yIGZvciBkZXRlcm1pbmluZyBsb29wIG9mZmV0cy4gVGhlIG90aGVyIGxlbmd0aFxyXG4jIGlzIHRoZSBzb3VuZC5zYW1wbGVzLmxlbmd0aCAoYWxzbyBrbm93biBhcyB0aGUgXCJvdmVyZmxvdyBsZW5ndGhcIiksIHdoaWNoIGlzIHRoZVxyXG4jIGxlbmd0aCB0aGF0IGFjY291bnRzIGZvciB0aGluZ3MgbGlrZSByZXZlcmIgb3IgYW55dGhpbmcgZWxzZSB0aGF0IHdvdWxkIGNhdXNlIHRoZVxyXG4jIHNvdW5kIHRvIHNwaWxsIGludG8gdGhlIG5leHQgbG9vcC90cmFjay4gVGhpcyBhbGxvd3MgZm9yIHNlYW1sZXNzIGxvb3BzIHRoYXQgY2FuXHJcbiMgcGxheSBhIGxvbmcgc291bmQgYXMgdGhlIGVuZCBvZiBhIHBhdHRlcm4sIGFuZCBpdCdsbCBjbGVhbmx5IG1peCBpbnRvIHRoZSBiZWdpbm5pbmdcclxuIyBvZiB0aGUgbmV4dCBwYXR0ZXJuLlxyXG5cclxuY2xhc3MgUmVuZGVyZXJcclxuICBjb25zdHJ1Y3RvcjogKEBsb2csIEBzYW1wbGVSYXRlLCBAcmVhZExvY2FsRmlsZXMsIEBvYmplY3RzKSAtPlxyXG4gICAgQHNvdW5kQ2FjaGUgPSB7fVxyXG5cclxuICBlcnJvcjogKHRleHQpIC0+XHJcbiAgICBAbG9nLmVycm9yIFwiUkVOREVSIEVSUk9SOiAje3RleHR9XCJcclxuXHJcbiAgZ2VuZXJhdGVFbnZlbG9wZTogKGFkc3IsIGxlbmd0aCkgLT5cclxuICAgIGVudmVsb3BlID0gQXJyYXkobGVuZ3RoKVxyXG4gICAgQXRvRCA9IE1hdGguZmxvb3IoYWRzci5hICogbGVuZ3RoKVxyXG4gICAgRHRvUyA9IE1hdGguZmxvb3IoYWRzci5kICogbGVuZ3RoKVxyXG4gICAgU3RvUiA9IE1hdGguZmxvb3IoYWRzci5yICogbGVuZ3RoKVxyXG4gICAgYXR0YWNrTGVuID0gQXRvRFxyXG4gICAgZGVjYXlMZW4gPSBEdG9TIC0gQXRvRFxyXG4gICAgc3VzdGFpbkxlbiA9IFN0b1IgLSBEdG9TXHJcbiAgICByZWxlYXNlTGVuID0gbGVuZ3RoIC0gU3RvUlxyXG4gICAgc3VzdGFpbiA9IGFkc3Iuc1xyXG4gICAgcGVha1N1c3RhaW5EZWx0YSA9IDEuMCAtIHN1c3RhaW5cclxuICAgIGZvciBpIGluIFswLi4uYXR0YWNrTGVuXVxyXG4gICAgICAjIEF0dGFja1xyXG4gICAgICBlbnZlbG9wZVtpXSA9IGkgLyBhdHRhY2tMZW5cclxuICAgIGZvciBpIGluIFswLi4uZGVjYXlMZW5dXHJcbiAgICAgICMgRGVjYXlcclxuICAgICAgZW52ZWxvcGVbQXRvRCArIGldID0gMS4wIC0gKHBlYWtTdXN0YWluRGVsdGEgKiAoaSAvIGRlY2F5TGVuKSlcclxuICAgIGZvciBpIGluIFswLi4uc3VzdGFpbkxlbl1cclxuICAgICAgIyBTdXN0YWluXHJcbiAgICAgIGVudmVsb3BlW0R0b1MgKyBpXSA9IHN1c3RhaW5cclxuICAgIGZvciBpIGluIFswLi4ucmVsZWFzZUxlbl1cclxuICAgICAgIyBSZWxlYXNlXHJcbiAgICAgIGVudmVsb3BlW1N0b1IgKyBpXSA9IHN1c3RhaW4gLSAoc3VzdGFpbiAqIChpIC8gcmVsZWFzZUxlbikpXHJcbiAgICByZXR1cm4gZW52ZWxvcGVcclxuXHJcbiAgcmVuZGVyVG9uZTogKHRvbmVPYmosIG92ZXJyaWRlcykgLT5cclxuICAgIGFtcGxpdHVkZSA9IDEwMDAwXHJcbiAgICBpZiBvdmVycmlkZXMubGVuZ3RoID4gMFxyXG4gICAgICBsZW5ndGggPSBvdmVycmlkZXMubGVuZ3RoXHJcbiAgICBlbHNlXHJcbiAgICAgIGxlbmd0aCA9IE1hdGguZmxvb3IodG9uZU9iai5kdXJhdGlvbiAqIEBzYW1wbGVSYXRlIC8gMTAwMClcclxuICAgIHNhbXBsZXMgPSBBcnJheShsZW5ndGgpXHJcbiAgICBBID0gMjAwXHJcbiAgICBCID0gMC41XHJcbiAgICBpZiBvdmVycmlkZXMubm90ZT9cclxuICAgICAgZnJlcSA9IGZpbmRGcmVxKHRvbmVPYmoub2N0YXZlLCBvdmVycmlkZXMubm90ZSlcclxuICAgIGVsc2UgaWYgdG9uZU9iai5mcmVxP1xyXG4gICAgICBmcmVxID0gdG9uZU9iai5mcmVxXHJcbiAgICBlbHNlXHJcbiAgICAgIGZyZXEgPSBmaW5kRnJlcSh0b25lT2JqLm9jdGF2ZSwgdG9uZU9iai5ub3RlKVxyXG4gICAgZW52ZWxvcGUgPSBAZ2VuZXJhdGVFbnZlbG9wZSh0b25lT2JqLmFkc3IsIGxlbmd0aClcclxuICAgIHBlcmlvZCA9IEBzYW1wbGVSYXRlIC8gZnJlcVxyXG4gICAgZm9yIGkgaW4gWzAuLi5sZW5ndGhdXHJcbiAgICAgIGlmIHRvbmVPYmoud2F2ZSA9PSBcInNhd3Rvb3RoXCJcclxuICAgICAgICBzYW1wbGUgPSAoKGkgJSBwZXJpb2QpIC8gcGVyaW9kKSAtIDAuNVxyXG4gICAgICBlbHNlXHJcbiAgICAgICAgc2FtcGxlID0gTWF0aC5zaW4oaSAvIHBlcmlvZCAqIDIgKiBNYXRoLlBJKVxyXG4gICAgICAgIGlmIHRvbmVPYmoud2F2ZSA9PSBcInNxdWFyZVwiXHJcbiAgICAgICAgICBzYW1wbGUgPSBpZiAoc2FtcGxlID4gMCkgdGhlbiAxIGVsc2UgLTFcclxuICAgICAgc2FtcGxlc1tpXSA9IHNhbXBsZSAqIGFtcGxpdHVkZSAqIGVudmVsb3BlW2ldXHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgc2FtcGxlczogc2FtcGxlc1xyXG4gICAgICBsZW5ndGg6IHNhbXBsZXMubGVuZ3RoXHJcbiAgICB9XHJcblxyXG4gIHJlbmRlclNhbXBsZTogKHNhbXBsZU9iaiwgb3ZlcnJpZGVzKSAtPlxyXG4gICAgdmlldyA9IG51bGxcclxuXHJcbiAgICBpZiBAcmVhZExvY2FsRmlsZXNcclxuICAgICAgZGF0YSA9IGZzLnJlYWRGaWxlU3luYyBzYW1wbGVPYmouc3JjXHJcbiAgICAgIHZpZXcgPSBuZXcgakRhdGFWaWV3KGRhdGEsIDAsIGRhdGEubGVuZ3RoLCB0cnVlKVxyXG4gICAgZWxzZVxyXG4gICAgICAkLmFqYXgge1xyXG4gICAgICAgIHVybDogc2FtcGxlT2JqLnNyY1xyXG4gICAgICAgIG1pbWVUeXBlOiAndGV4dC9wbGFpbjsgY2hhcnNldD14LXVzZXItZGVmaW5lZCdcclxuICAgICAgICBzdWNjZXNzOiAoZGF0YSkgLT5cclxuICAgICAgICAgIHZpZXcgPSBuZXcgakRhdGFWaWV3KGRhdGEsIDAsIGRhdGEubGVuZ3RoLCB0cnVlKVxyXG4gICAgICAgIGFzeW5jOiBmYWxzZVxyXG4gICAgICB9XHJcblxyXG4gICAgaWYgbm90IHZpZXdcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzYW1wbGVzOiBbXVxyXG4gICAgICAgIGxlbmd0aDogMFxyXG4gICAgICB9XHJcblxyXG4gICAgIyBza2lwIHRoZSBmaXJzdCA0MCBieXRlc1xyXG4gICAgdmlldy5zZWVrKDQwKVxyXG4gICAgc3ViY2h1bmsyU2l6ZSA9IHZpZXcuZ2V0SW50MzIoKVxyXG4gICAgc2FtcGxlcyA9IFtdXHJcbiAgICB3aGlsZSB2aWV3LnRlbGwoKSsxIDwgdmlldy5ieXRlTGVuZ3RoXHJcbiAgICAgIHNhbXBsZXMucHVzaCB2aWV3LmdldEludDE2KClcclxuXHJcbiAgICBvdmVycmlkZU5vdGUgPSBpZiBvdmVycmlkZXMubm90ZSB0aGVuIG92ZXJyaWRlcy5ub3RlIGVsc2Ugc2FtcGxlT2JqLm5vdGVcclxuICAgIGlmIChvdmVycmlkZU5vdGUgIT0gc2FtcGxlT2JqLnNyY25vdGUpIG9yIChzYW1wbGVPYmoub2N0YXZlICE9IHNhbXBsZU9iai5zcmNvY3RhdmUpXHJcbiAgICAgIG9sZGZyZXEgPSBmaW5kRnJlcShzYW1wbGVPYmouc3Jjb2N0YXZlLCBzYW1wbGVPYmouc3Jjbm90ZSlcclxuICAgICAgbmV3ZnJlcSA9IGZpbmRGcmVxKHNhbXBsZU9iai5vY3RhdmUsIG92ZXJyaWRlTm90ZSlcclxuXHJcbiAgICAgIGZhY3RvciA9IG9sZGZyZXEgLyBuZXdmcmVxXHJcbiAgICAgICMgQGxvZy52ZXJib3NlIFwib2xkOiAje29sZGZyZXF9LCBuZXc6ICN7bmV3ZnJlcX0sIGZhY3RvcjogI3tmYWN0b3J9XCJcclxuXHJcbiAgICAgICMgVE9ETzogUHJvcGVybHkgcmVzYW1wbGUgaGVyZSB3aXRoIHNvbWV0aGluZyBvdGhlciB0aGFuIFwibmVhcmVzdCBuZWlnaGJvclwiXHJcbiAgICAgIHJlbGVuZ3RoID0gTWF0aC5mbG9vcihzYW1wbGVzLmxlbmd0aCAqIGZhY3RvcilcclxuICAgICAgcmVzYW1wbGVzID0gQXJyYXkocmVsZW5ndGgpXHJcbiAgICAgIGZvciBpIGluIFswLi4ucmVsZW5ndGhdXHJcbiAgICAgICAgcmVzYW1wbGVzW2ldID0gMFxyXG4gICAgICBmb3IgaSBpbiBbMC4uLnJlbGVuZ3RoXVxyXG4gICAgICAgIHJlc2FtcGxlc1tpXSA9IHNhbXBsZXNbTWF0aC5mbG9vcihpIC8gZmFjdG9yKV1cclxuXHJcbiAgICAgIHJldHVybiB7XHJcbiAgICAgICAgc2FtcGxlczogcmVzYW1wbGVzXHJcbiAgICAgICAgbGVuZ3RoOiByZXNhbXBsZXMubGVuZ3RoXHJcbiAgICAgIH1cclxuICAgIGVsc2VcclxuICAgICAgcmV0dXJuIHtcclxuICAgICAgICBzYW1wbGVzOiBzYW1wbGVzXHJcbiAgICAgICAgbGVuZ3RoOiBzYW1wbGVzLmxlbmd0aFxyXG4gICAgICB9XHJcblxyXG4gIHJlbmRlckxvb3A6IChsb29wT2JqKSAtPlxyXG4gICAgYmVhdENvdW50ID0gMFxyXG4gICAgZm9yIHBhdHRlcm4gaW4gbG9vcE9iai5fcGF0dGVybnNcclxuICAgICAgaWYgYmVhdENvdW50IDwgcGF0dGVybi5sZW5ndGhcclxuICAgICAgICBiZWF0Q291bnQgPSBwYXR0ZXJuLmxlbmd0aFxyXG5cclxuICAgIHNhbXBsZXNQZXJCZWF0ID0gQHNhbXBsZVJhdGUgLyAobG9vcE9iai5icG0gLyA2MCkgLyA0XHJcbiAgICB0b3RhbExlbmd0aCA9IE1hdGguZmxvb3Ioc2FtcGxlc1BlckJlYXQgKiBiZWF0Q291bnQpXHJcbiAgICBvdmVyZmxvd0xlbmd0aCA9IHRvdGFsTGVuZ3RoXHJcblxyXG4gICAgZm9yIHBhdHRlcm4gaW4gbG9vcE9iai5fcGF0dGVybnNcclxuICAgICAgc2VjdGlvbkNvdW50ID0gcGF0dGVybi5sZW5ndGggLyAxNlxyXG4gICAgICBvZmZzZXRMZW5ndGggPSBNYXRoLmZsb29yKHRvdGFsTGVuZ3RoIC8gMTYgLyBzZWN0aW9uQ291bnQpXHJcbiAgICAgIGZvciBzb3VuZCBpbiBwYXR0ZXJuLnNvdW5kc1xyXG4gICAgICAgIG92ZXJyaWRlcyA9IHt9XHJcbiAgICAgICAgaWYgc291bmQubGVuZ3RoID4gMFxyXG4gICAgICAgICAgb3ZlcnJpZGVzLmxlbmd0aCA9IHNvdW5kLmxlbmd0aCAqIG9mZnNldExlbmd0aFxyXG4gICAgICAgIGlmIHNvdW5kLm5vdGU/XHJcbiAgICAgICAgICBvdmVycmlkZXMubm90ZSA9IHNvdW5kLm5vdGVcclxuICAgICAgICBzb3VuZC5fcmVuZGVyID0gQHJlbmRlcihwYXR0ZXJuLnNyYywgb3ZlcnJpZGVzKVxyXG4gICAgICAgIGVuZCA9IChzb3VuZC5vZmZzZXQgKiBvZmZzZXRMZW5ndGgpICsgc291bmQuX3JlbmRlci5zYW1wbGVzLmxlbmd0aFxyXG4gICAgICAgIGlmIG92ZXJmbG93TGVuZ3RoIDwgZW5kXHJcbiAgICAgICAgICBvdmVyZmxvd0xlbmd0aCA9IGVuZFxyXG5cclxuICAgIHNhbXBsZXMgPSBBcnJheShvdmVyZmxvd0xlbmd0aClcclxuICAgIGZvciBpIGluIFswLi4ub3ZlcmZsb3dMZW5ndGhdXHJcbiAgICAgIHNhbXBsZXNbaV0gPSAwXHJcblxyXG4gICAgZm9yIHBhdHRlcm4gaW4gbG9vcE9iai5fcGF0dGVybnNcclxuICAgICAgc2VjdGlvbkNvdW50ID0gcGF0dGVybi5sZW5ndGggLyAxNlxyXG4gICAgICBvZmZzZXRMZW5ndGggPSBNYXRoLmZsb29yKHRvdGFsTGVuZ3RoIC8gMTYgLyBzZWN0aW9uQ291bnQpXHJcblxyXG4gICAgICBwYXR0ZXJuU2FtcGxlcyA9IEFycmF5KG92ZXJmbG93TGVuZ3RoKVxyXG4gICAgICBmb3IgaSBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxyXG4gICAgICAgIHBhdHRlcm5TYW1wbGVzW2ldID0gMFxyXG5cclxuICAgICAgZm9yIHNvdW5kIGluIHBhdHRlcm4uc291bmRzXHJcbiAgICAgICAgc3JjU291bmQgPSBzb3VuZC5fcmVuZGVyXHJcblxyXG4gICAgICAgIG9iaiA9IEBnZXRPYmplY3QocGF0dGVybi5zcmMpXHJcbiAgICAgICAgb2Zmc2V0ID0gc291bmQub2Zmc2V0ICogb2Zmc2V0TGVuZ3RoXHJcbiAgICAgICAgY29weUxlbiA9IHNyY1NvdW5kLnNhbXBsZXMubGVuZ3RoXHJcbiAgICAgICAgaWYgKG9mZnNldCArIGNvcHlMZW4pID4gb3ZlcmZsb3dMZW5ndGhcclxuICAgICAgICAgIGNvcHlMZW4gPSBvdmVyZmxvd0xlbmd0aCAtIG9mZnNldFxyXG5cclxuICAgICAgICBpZiBvYmouY2xpcFxyXG4gICAgICAgICAgZmFkZUNsaXAgPSAyMDAgIyBmYWRlIG91dCBvdmVyIHRoaXMgbWFueSBzYW1wbGVzIHByaW9yIHRvIGEgY2xpcCB0byBhdm9pZCBhIHBvcFxyXG4gICAgICAgICAgaWYgb2Zmc2V0ID4gZmFkZUNsaXBcclxuICAgICAgICAgICAgZm9yIGogaW4gWzAuLi5mYWRlQ2xpcF1cclxuICAgICAgICAgICAgICB2ID0gcGF0dGVyblNhbXBsZXNbb2Zmc2V0IC0gZmFkZUNsaXAgKyBqXVxyXG4gICAgICAgICAgICAgIHBhdHRlcm5TYW1wbGVzW29mZnNldCAtIGZhZGVDbGlwICsgal0gPSBNYXRoLmZsb29yKHYgKiAoKGZhZGVDbGlwIC0gaikgLyBmYWRlQ2xpcCkpXHJcbiAgICAgICAgICBmb3IgaiBpbiBbb2Zmc2V0Li4ub3ZlcmZsb3dMZW5ndGhdXHJcbiAgICAgICAgICAgICMgY2xlYW4gb3V0IHRoZSByZXN0IG9mIHRoZSBzb3VuZCB0byBlbnN1cmUgdGhhdCB0aGUgcHJldmlvdXMgb25lICh3aGljaCBjb3VsZCBiZSBsb25nZXIpIHdhcyBmdWxseSBjbGlwcGVkXHJcbiAgICAgICAgICAgIHBhdHRlcm5TYW1wbGVzW2pdID0gMFxyXG4gICAgICAgICAgZm9yIGogaW4gWzAuLi5jb3B5TGVuXVxyXG4gICAgICAgICAgICBwYXR0ZXJuU2FtcGxlc1tvZmZzZXQgKyBqXSA9IHNyY1NvdW5kLnNhbXBsZXNbal1cclxuICAgICAgICBlbHNlXHJcbiAgICAgICAgICBmb3IgaiBpbiBbMC4uLmNvcHlMZW5dXHJcbiAgICAgICAgICAgIHBhdHRlcm5TYW1wbGVzW29mZnNldCArIGpdICs9IHNyY1NvdW5kLnNhbXBsZXNbal1cclxuXHJcbiAgICAgICMgTm93IGNvcHkgdGhlIGNsaXBwZWQgcGF0dGVybiBpbnRvIHRoZSBmaW5hbCBsb29wXHJcbiAgICAgIGZvciBqIGluIFswLi4ub3ZlcmZsb3dMZW5ndGhdXHJcbiAgICAgICAgc2FtcGxlc1tqXSArPSBwYXR0ZXJuU2FtcGxlc1tqXVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgIHNhbXBsZXM6IHNhbXBsZXNcclxuICAgICAgbGVuZ3RoOiB0b3RhbExlbmd0aFxyXG4gICAgfVxyXG5cclxuICByZW5kZXJUcmFjazogKHRyYWNrT2JqKSAtPlxyXG4gICAgcGllY2VDb3VudCA9IDBcclxuICAgIGZvciBwYXR0ZXJuIGluIHRyYWNrT2JqLl9wYXR0ZXJuc1xyXG4gICAgICBpZiBwaWVjZUNvdW50IDwgcGF0dGVybi5wYXR0ZXJuLmxlbmd0aFxyXG4gICAgICAgIHBpZWNlQ291bnQgPSBwYXR0ZXJuLnBhdHRlcm4ubGVuZ3RoXHJcblxyXG4gICAgdG90YWxMZW5ndGggPSAwXHJcbiAgICBvdmVyZmxvd0xlbmd0aCA9IDBcclxuICAgIHBpZWNlVG90YWxMZW5ndGggPSBBcnJheShwaWVjZUNvdW50KVxyXG4gICAgcGllY2VPdmVyZmxvd0xlbmd0aCA9IEFycmF5KHBpZWNlQ291bnQpXHJcbiAgICBmb3IgcGllY2VJbmRleCBpbiBbMC4uLnBpZWNlQ291bnRdXHJcbiAgICAgIHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF0gPSAwXHJcbiAgICAgIHBpZWNlT3ZlcmZsb3dMZW5ndGhbcGllY2VJbmRleF0gPSAwXHJcbiAgICAgIGZvciBwYXR0ZXJuIGluIHRyYWNrT2JqLl9wYXR0ZXJuc1xyXG4gICAgICAgIGlmIChwaWVjZUluZGV4IDwgcGF0dGVybi5wYXR0ZXJuLmxlbmd0aCkgYW5kIChwYXR0ZXJuLnBhdHRlcm5bcGllY2VJbmRleF0gIT0gJy4nKVxyXG4gICAgICAgICAgc3JjU291bmQgPSBAcmVuZGVyKHBhdHRlcm4uc3JjKVxyXG4gICAgICAgICAgaWYgcGllY2VUb3RhbExlbmd0aFtwaWVjZUluZGV4XSA8IHNyY1NvdW5kLmxlbmd0aFxyXG4gICAgICAgICAgICBwaWVjZVRvdGFsTGVuZ3RoW3BpZWNlSW5kZXhdID0gc3JjU291bmQubGVuZ3RoXHJcbiAgICAgICAgICBpZiBwaWVjZU92ZXJmbG93TGVuZ3RoW3BpZWNlSW5kZXhdIDwgc3JjU291bmQuc2FtcGxlcy5sZW5ndGhcclxuICAgICAgICAgICAgcGllY2VPdmVyZmxvd0xlbmd0aFtwaWVjZUluZGV4XSA9IHNyY1NvdW5kLnNhbXBsZXMubGVuZ3RoXHJcbiAgICAgIHBvc3NpYmxlTWF4TGVuZ3RoID0gdG90YWxMZW5ndGggKyBwaWVjZU92ZXJmbG93TGVuZ3RoW3BpZWNlSW5kZXhdXHJcbiAgICAgIGlmIG92ZXJmbG93TGVuZ3RoIDwgcG9zc2libGVNYXhMZW5ndGhcclxuICAgICAgICBvdmVyZmxvd0xlbmd0aCA9IHBvc3NpYmxlTWF4TGVuZ3RoXHJcbiAgICAgIHRvdGFsTGVuZ3RoICs9IHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF1cclxuXHJcbiAgICBzYW1wbGVzID0gQXJyYXkob3ZlcmZsb3dMZW5ndGgpXHJcbiAgICBmb3IgaSBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxyXG4gICAgICBzYW1wbGVzW2ldID0gMFxyXG5cclxuICAgIGZvciBwYXR0ZXJuIGluIHRyYWNrT2JqLl9wYXR0ZXJuc1xyXG4gICAgICB0cmFja09mZnNldCA9IDBcclxuICAgICAgc3JjU291bmQgPSBAcmVuZGVyKHBhdHRlcm4uc3JjLCB7fSlcclxuICAgICAgZm9yIHBpZWNlSW5kZXggaW4gWzAuLi5waWVjZUNvdW50XVxyXG4gICAgICAgIGlmIChwaWVjZUluZGV4IDwgcGF0dGVybi5wYXR0ZXJuLmxlbmd0aCkgYW5kIChwYXR0ZXJuLnBhdHRlcm5bcGllY2VJbmRleF0gIT0gJy4nKVxyXG4gICAgICAgICAgY29weUxlbiA9IHNyY1NvdW5kLnNhbXBsZXMubGVuZ3RoXHJcbiAgICAgICAgICBpZiAodHJhY2tPZmZzZXQgKyBjb3B5TGVuKSA+IG92ZXJmbG93TGVuZ3RoXHJcbiAgICAgICAgICAgIGNvcHlMZW4gPSBvdmVyZmxvd0xlbmd0aCAtIHRyYWNrT2Zmc2V0XHJcbiAgICAgICAgICBmb3IgaiBpbiBbMC4uLmNvcHlMZW5dXHJcbiAgICAgICAgICAgIHNhbXBsZXNbdHJhY2tPZmZzZXQgKyBqXSArPSBzcmNTb3VuZC5zYW1wbGVzW2pdXHJcblxyXG4gICAgICAgIHRyYWNrT2Zmc2V0ICs9IHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICBzYW1wbGVzOiBzYW1wbGVzXHJcbiAgICAgIGxlbmd0aDogdG90YWxMZW5ndGhcclxuICAgIH1cclxuXHJcbiAgY2FsY0NhY2hlTmFtZTogKHR5cGUsIHdoaWNoLCBvdmVycmlkZXMpIC0+XHJcbiAgICBpZiAodHlwZSAhPSAndG9uZScpIGFuZCAodHlwZSAhPSAnc2FtcGxlJylcclxuICAgICAgcmV0dXJuIHdoaWNoXHJcblxyXG4gICAgbmFtZSA9IHdoaWNoXHJcbiAgICBpZiBvdmVycmlkZXMubm90ZVxyXG4gICAgICBuYW1lICs9IFwiL04je292ZXJyaWRlcy5ub3RlfVwiXHJcbiAgICBpZiBvdmVycmlkZXMubGVuZ3RoXHJcbiAgICAgIG5hbWUgKz0gXCIvTCN7b3ZlcnJpZGVzLmxlbmd0aH1cIlxyXG5cclxuICAgIHJldHVybiBuYW1lXHJcblxyXG4gIGdldE9iamVjdDogKHdoaWNoKSAtPlxyXG4gICAgb2JqZWN0ID0gQG9iamVjdHNbd2hpY2hdXHJcbiAgICBpZiBub3Qgb2JqZWN0XHJcbiAgICAgIEBlcnJvciBcIm5vIHN1Y2ggb2JqZWN0ICN7d2hpY2h9XCJcclxuICAgICAgcmV0dXJuIG51bGxcclxuICAgIHJldHVybiBvYmplY3RcclxuXHJcbiAgcmVuZGVyOiAod2hpY2gsIG92ZXJyaWRlcykgLT5cclxuICAgIG9iamVjdCA9IEBnZXRPYmplY3Qod2hpY2gpXHJcbiAgICBpZiBub3Qgb2JqZWN0XHJcbiAgICAgIHJldHVybiBudWxsXHJcblxyXG4gICAgb3ZlcnJpZGVzID89IHt9XHJcblxyXG4gICAgY2FjaGVOYW1lID0gQGNhbGNDYWNoZU5hbWUob2JqZWN0Ll90eXBlLCB3aGljaCwgb3ZlcnJpZGVzKVxyXG4gICAgaWYgQHNvdW5kQ2FjaGVbY2FjaGVOYW1lXVxyXG4gICAgICByZXR1cm4gQHNvdW5kQ2FjaGVbY2FjaGVOYW1lXVxyXG5cclxuICAgIHNvdW5kID0gc3dpdGNoIG9iamVjdC5fdHlwZVxyXG4gICAgICB3aGVuICd0b25lJyB0aGVuIEByZW5kZXJUb25lKG9iamVjdCwgb3ZlcnJpZGVzKVxyXG4gICAgICB3aGVuICdzYW1wbGUnIHRoZW4gQHJlbmRlclNhbXBsZShvYmplY3QsIG92ZXJyaWRlcylcclxuICAgICAgd2hlbiAnbG9vcCcgdGhlbiBAcmVuZGVyTG9vcChvYmplY3QpXHJcbiAgICAgIHdoZW4gJ3RyYWNrJyB0aGVuIEByZW5kZXJUcmFjayhvYmplY3QpXHJcbiAgICAgIGVsc2VcclxuICAgICAgICBAZXJyb3IgXCJ1bmtub3duIHR5cGUgI3tvYmplY3QuX3R5cGV9XCJcclxuICAgICAgICBudWxsXHJcblxyXG4gICAgaWYgb2JqZWN0Ll90eXBlICE9ICd0b25lJ1xyXG4gICAgICBvdmVycmlkZU5vdGUgPSBpZiBvdmVycmlkZXMubm90ZSB0aGVuIG92ZXJyaWRlcy5ub3RlIGVsc2Ugb2JqZWN0Lm5vdGVcclxuICAgICAgaWYgKG92ZXJyaWRlTm90ZSAhPSBvYmplY3Quc3Jjbm90ZSkgb3IgKG9iamVjdC5vY3RhdmUgIT0gb2JqZWN0LnNyY29jdGF2ZSlcclxuICAgICAgICBvbGRmcmVxID0gZmluZEZyZXEob2JqZWN0LnNyY29jdGF2ZSwgb2JqZWN0LnNyY25vdGUpXHJcbiAgICAgICAgbmV3ZnJlcSA9IGZpbmRGcmVxKG9iamVjdC5vY3RhdmUsIG92ZXJyaWRlTm90ZSlcclxuXHJcbiAgICAgICAgZmFjdG9yID0gb2xkZnJlcSAvIG5ld2ZyZXFcclxuICAgICAgICAjIEBsb2cudmVyYm9zZSBcIm9sZDogI3tvbGRmcmVxfSwgbmV3OiAje25ld2ZyZXF9LCBmYWN0b3I6ICN7ZmFjdG9yfVwiXHJcblxyXG4gICAgICAgICMgVE9ETzogUHJvcGVybHkgcmVzYW1wbGUgaGVyZSB3aXRoIHNvbWV0aGluZyBvdGhlciB0aGFuIFwibmVhcmVzdCBuZWlnaGJvclwiXHJcbiAgICAgICAgcmVsZW5ndGggPSBNYXRoLmZsb29yKHNvdW5kLnNhbXBsZXMubGVuZ3RoICogZmFjdG9yKVxyXG4gICAgICAgIHJlc2FtcGxlcyA9IEFycmF5KHJlbGVuZ3RoKVxyXG4gICAgICAgIGZvciBpIGluIFswLi4ucmVsZW5ndGhdXHJcbiAgICAgICAgICByZXNhbXBsZXNbaV0gPSAwXHJcbiAgICAgICAgZm9yIGkgaW4gWzAuLi5yZWxlbmd0aF1cclxuICAgICAgICAgIHJlc2FtcGxlc1tpXSA9IHNvdW5kLnNhbXBsZXNbTWF0aC5mbG9vcihpIC8gZmFjdG9yKV1cclxuXHJcbiAgICAgICAgc291bmQuc2FtcGxlcyA9IHJlc2FtcGxlc1xyXG4gICAgICAgIHNvdW5kLmxlbmd0aCA9IHJlc2FtcGxlcy5sZW5ndGhcclxuXHJcbiAgICAjIFZvbHVtZVxyXG4gICAgaWYgb2JqZWN0LnZvbHVtZT8gYW5kIChvYmplY3Qudm9sdW1lICE9IDEuMClcclxuICAgICAgZm9yIGkgaW4gWzAuLi5zb3VuZC5zYW1wbGVzLmxlbmd0aF1cclxuICAgICAgICBzb3VuZC5zYW1wbGVzW2ldICo9IG9iamVjdC52b2x1bWVcclxuXHJcbiAgICAjIFJldmVyYlxyXG4gICAgaWYgb2JqZWN0LnJldmVyYj8gYW5kIChvYmplY3QucmV2ZXJiLmRlbGF5ID4gMClcclxuICAgICAgZGVsYXlTYW1wbGVzID0gTWF0aC5mbG9vcihvYmplY3QucmV2ZXJiLmRlbGF5ICogQHNhbXBsZVJhdGUgLyAxMDAwKVxyXG4gICAgICBpZiBzb3VuZC5zYW1wbGVzLmxlbmd0aCA+IGRlbGF5U2FtcGxlc1xyXG4gICAgICAgIHRvdGFsTGVuZ3RoID0gc291bmQuc2FtcGxlcy5sZW5ndGggKyAoZGVsYXlTYW1wbGVzICogOCkgIyB0aGlzICo4IGlzIHRvdGFsbHkgd3JvbmcuIE5lZWRzIG1vcmUgdGhvdWdodC5cclxuICAgICAgICAjIEBsb2cudmVyYm9zZSBcInJldmVyYmluZyAje2NhY2hlTmFtZX06ICN7ZGVsYXlTYW1wbGVzfS4gbGVuZ3RoIHVwZGF0ZSAje3NvdW5kLnNhbXBsZXMubGVuZ3RofSAtPiAje3RvdGFsTGVuZ3RofVwiXHJcbiAgICAgICAgc2FtcGxlcyA9IEFycmF5KHRvdGFsTGVuZ3RoKVxyXG4gICAgICAgIGZvciBpIGluIFswLi4uc291bmQuc2FtcGxlcy5sZW5ndGhdXHJcbiAgICAgICAgICBzYW1wbGVzW2ldID0gc291bmQuc2FtcGxlc1tpXVxyXG4gICAgICAgIGZvciBpIGluIFtzb3VuZC5zYW1wbGVzLmxlbmd0aC4uLnRvdGFsTGVuZ3RoXVxyXG4gICAgICAgICAgc2FtcGxlc1tpXSA9IDBcclxuICAgICAgICBmb3IgaSBpbiBbMC4uLih0b3RhbExlbmd0aCAtIGRlbGF5U2FtcGxlcyldXHJcbiAgICAgICAgICBzYW1wbGVzW2kgKyBkZWxheVNhbXBsZXNdICs9IE1hdGguZmxvb3Ioc2FtcGxlc1tpXSAqIG9iamVjdC5yZXZlcmIuZGVjYXkpXHJcbiAgICAgICAgc291bmQuc2FtcGxlcyA9IHNhbXBsZXNcclxuXHJcbiAgICBAbG9nLnZlcmJvc2UgXCJSZW5kZXJlZCAje2NhY2hlTmFtZX0uXCJcclxuICAgIEBzb3VuZENhY2hlW2NhY2hlTmFtZV0gPSBzb3VuZFxyXG4gICAgcmV0dXJuIHNvdW5kXHJcblxyXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuIyBXYXZlZm9ybSBJbWFnZSBSZW5kZXJlclxyXG5cclxucmVuZGVyV2F2ZWZvcm1JbWFnZSA9IChzYW1wbGVzLCB3aWR0aCwgaGVpZ2h0LCBiYWNrZ3JvdW5kQ29sb3IsIHdhdmVmb3JtQ29sb3IpIC0+XHJcbiAgYmFja2dyb3VuZENvbG9yID89IFsyNTUsIDI1NSwgMjU1XVxyXG4gIHdhdmVmb3JtQ29sb3IgPz0gWzI1NSwgMCwgMF1cclxuICByb3dzID0gW11cclxuICBmb3IgaiBpbiBbMC4uLmhlaWdodF1cclxuICAgIHJvdyA9IFtdXHJcbiAgICBmb3IgaSBpbiBbMC4uLndpZHRoXVxyXG4gICAgICByb3cucHVzaCBiYWNrZ3JvdW5kQ29sb3JcclxuICAgIHJvd3MucHVzaCByb3dcclxuXHJcbiAgc2FtcGxlc1BlckNvbCA9IE1hdGguZmxvb3Ioc2FtcGxlcy5sZW5ndGggLyB3aWR0aClcclxuXHJcbiAgcGVhayA9IDBcclxuICBmb3Igc2FtcGxlIGluIHNhbXBsZXNcclxuICAgIGEgPSBNYXRoLmFicyhzYW1wbGUpXHJcbiAgICBpZiBwZWFrIDwgYVxyXG4gICAgICBwZWFrID0gYVxyXG5cclxuICBwZWFrID0gTWF0aC5mbG9vcihwZWFrICogMS4xKSAjIEdpdmUgYSBiaXQgb2YgbWFyZ2luIG9uIHRvcC9ib3R0b21cclxuXHJcbiAgaWYgcGVhayA9PSAwXHJcbiAgICByb3cgPSByb3dzWyBNYXRoLmZsb29yKGhlaWdodCAvIDIpIF1cclxuICAgIGZvciBpIGluIFswLi4ud2lkdGhdXHJcbiAgICAgIHJvd1tpXSA9IHdhdmVmb3JtQ29sb3JcclxuICBlbHNlXHJcbiAgICBmb3IgaSBpbiBbMC4uLndpZHRoXVxyXG4gICAgICBzYW1wbGVPZmZzZXQgPSBNYXRoLmZsb29yKChpIC8gd2lkdGgpICogc2FtcGxlcy5sZW5ndGgpXHJcbiAgICAgIHNhbXBsZVN1bSA9IDBcclxuICAgICAgc2FtcGxlTWF4ID0gMFxyXG4gICAgICBmb3Igc2FtcGxlSW5kZXggaW4gW3NhbXBsZU9mZnNldC4uLihzYW1wbGVPZmZzZXQrc2FtcGxlc1BlckNvbCldXHJcbiAgICAgICAgYSA9IE1hdGguYWJzKHNhbXBsZXNbc2FtcGxlSW5kZXhdKVxyXG4gICAgICAgIHNhbXBsZVN1bSArPSBhXHJcbiAgICAgICAgaWYgc2FtcGxlTWF4IDwgYVxyXG4gICAgICAgICAgc2FtcGxlTWF4ID0gYVxyXG4gICAgICBzYW1wbGVBdmcgPSBNYXRoLmZsb29yKHNhbXBsZVN1bSAvIHNhbXBsZXNQZXJDb2wpXHJcbiAgICAgIGxpbmVIZWlnaHQgPSBNYXRoLmZsb29yKHNhbXBsZU1heCAvIHBlYWsgKiBoZWlnaHQpXHJcbiAgICAgIGxpbmVPZmZzZXQgPSAoaGVpZ2h0IC0gbGluZUhlaWdodCkgPj4gMVxyXG4gICAgICBpZiBsaW5lSGVpZ2h0ID09IDBcclxuICAgICAgICBsaW5lSGVpZ2h0ID0gMVxyXG4gICAgICBmb3IgaiBpbiBbMC4uLmxpbmVIZWlnaHRdXHJcbiAgICAgICAgcm93ID0gcm93c1tqICsgbGluZU9mZnNldF1cclxuICAgICAgICByb3dbaV0gPSB3YXZlZm9ybUNvbG9yXHJcblxyXG4gIHJldHVybiBnZW5lcmF0ZUJpdG1hcERhdGFVUkwgcm93c1xyXG5cclxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiMgRXhwb3J0c1xyXG5cclxucmVuZGVyTG9vcFNjcmlwdCA9IChhcmdzKSAtPlxyXG4gIGxvZ09iaiA9IGFyZ3MubG9nXHJcbiAgbG9nT2JqLnZlcmJvc2UgXCJQYXJzaW5nLi4uXCJcclxuICBwYXJzZXIgPSBuZXcgUGFyc2VyKGxvZ09iailcclxuICBwYXJzZXIucGFyc2UgYXJncy5zY3JpcHRcclxuXHJcbiAgd2hpY2ggPSBhcmdzLndoaWNoXHJcbiAgd2hpY2ggPz0gcGFyc2VyLmxhc3RPYmplY3RcclxuXHJcbiAgaWYgd2hpY2hcclxuICAgIHNhbXBsZVJhdGUgPSA0NDEwMFxyXG4gICAgbG9nT2JqLnZlcmJvc2UgXCJSZW5kZXJpbmcuLi5cIlxyXG4gICAgcmVuZGVyZXIgPSBuZXcgUmVuZGVyZXIobG9nT2JqLCBzYW1wbGVSYXRlLCBhcmdzLnJlYWRMb2NhbEZpbGVzLCBwYXJzZXIub2JqZWN0cylcclxuICAgIG91dHB1dFNvdW5kID0gcmVuZGVyZXIucmVuZGVyKHdoaWNoLCB7fSlcclxuICAgIHJldCA9IHt9XHJcbiAgICBpZiBhcmdzLndhdkZpbGVuYW1lXHJcbiAgICAgIHJpZmZ3YXZlLndyaXRlV0FWIGFyZ3Mud2F2RmlsZW5hbWUsIHNhbXBsZVJhdGUsIG91dHB1dFNvdW5kLnNhbXBsZXNcclxuICAgIGVsc2VcclxuICAgICAgcmV0LndhdlVybCA9IHJpZmZ3YXZlLm1ha2VCbG9iVXJsKHNhbXBsZVJhdGUsIG91dHB1dFNvdW5kLnNhbXBsZXMpXHJcbiAgICBpZiBhcmdzLmltYWdlV2lkdGg/IGFuZCBhcmdzLmltYWdlSGVpZ2h0PyBhbmQgKGFyZ3MuaW1hZ2VXaWR0aCA+IDApIGFuZCAoYXJncy5pbWFnZUhlaWdodCA+IDApXHJcbiAgICAgIHJldC5pbWFnZVVybCA9IHJlbmRlcldhdmVmb3JtSW1hZ2Uob3V0cHV0U291bmQuc2FtcGxlcywgYXJncy5pbWFnZVdpZHRoLCBhcmdzLmltYWdlSGVpZ2h0LCBhcmdzLmltYWdlQmFja2dyb3VuZENvbG9yLCBhcmdzLmltYWdlV2F2ZWZvcm1Db2xvcilcclxuICAgIHJldHVybiByZXRcclxuXHJcbiAgcmV0dXJuIG51bGxcclxuXHJcbm1vZHVsZS5leHBvcnRzID1cclxuICByZW5kZXI6IHJlbmRlckxvb3BTY3JpcHRcclxuIiwiZnMgPSByZXF1aXJlIFwiZnNcIlxyXG5cclxuY2xhc3MgRmFzdEJhc2U2NFxyXG5cclxuICBjb25zdHJ1Y3RvcjogLT5cclxuICAgIEBjaGFycyA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLz1cIlxyXG4gICAgQGVuY0xvb2t1cCA9IFtdXHJcbiAgICBmb3IgaSBpbiBbMC4uLjQwOTZdXHJcbiAgICAgIEBlbmNMb29rdXBbaV0gPSBAY2hhcnNbaSA+PiA2XSArIEBjaGFyc1tpICYgMHgzRl1cclxuXHJcbiAgZW5jb2RlOiAoc3JjKSAtPlxyXG4gICAgbGVuID0gc3JjLmxlbmd0aFxyXG4gICAgZHN0ID0gJydcclxuICAgIGkgPSAwXHJcbiAgICB3aGlsZSAobGVuID4gMilcclxuICAgICAgbiA9IChzcmNbaV0gPDwgMTYpIHwgKHNyY1tpKzFdPDw4KSB8IHNyY1tpKzJdXHJcbiAgICAgIGRzdCs9IHRoaXMuZW5jTG9va3VwW24gPj4gMTJdICsgdGhpcy5lbmNMb29rdXBbbiAmIDB4RkZGXVxyXG4gICAgICBsZW4tPSAzXHJcbiAgICAgIGkrPSAzXHJcbiAgICBpZiAobGVuID4gMClcclxuICAgICAgbjE9IChzcmNbaV0gJiAweEZDKSA+PiAyXHJcbiAgICAgIG4yPSAoc3JjW2ldICYgMHgwMykgPDwgNFxyXG4gICAgICBpZiAobGVuID4gMSlcclxuICAgICAgICBuMiB8PSAoc3JjWysraV0gJiAweEYwKSA+PiA0XHJcbiAgICAgIGRzdCs9IHRoaXMuY2hhcnNbbjFdXHJcbiAgICAgIGRzdCs9IHRoaXMuY2hhcnNbbjJdXHJcbiAgICAgIGlmIChsZW4gPT0gMilcclxuICAgICAgICBuMz0gKHNyY1tpKytdICYgMHgwRikgPDwgMlxyXG4gICAgICAgIG4zIHw9IChzcmNbaV0gJiAweEMwKSA+PiA2XHJcbiAgICAgICAgZHN0Kz0gdGhpcy5jaGFyc1tuM11cclxuICAgICAgaWYgKGxlbiA9PSAxKVxyXG4gICAgICAgIGRzdCs9ICc9J1xyXG4gICAgICBkc3QrPSAnPSdcclxuXHJcbiAgICByZXR1cm4gZHN0XHJcblxyXG5jbGFzcyBSSUZGV0FWRVxyXG4gIGNvbnN0cnVjdG9yOiAoQHNhbXBsZVJhdGUsIEBkYXRhKSAtPlxyXG4gICAgQHdhdiA9IFtdICAgICAjIEFycmF5IGNvbnRhaW5pbmcgdGhlIGdlbmVyYXRlZCB3YXZlIGZpbGVcclxuICAgIEBoZWFkZXIgPSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjIE9GRlMgU0laRSBOT1RFU1xyXG4gICAgICBjaHVua0lkICAgICAgOiBbMHg1MiwweDQ5LDB4NDYsMHg0Nl0sICMgMCAgICA0ICBcIlJJRkZcIiA9IDB4NTI0OTQ2NDZcclxuICAgICAgY2h1bmtTaXplICAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDQgICAgNCAgMzYrU3ViQ2h1bmsyU2l6ZSA9IDQrKDgrU3ViQ2h1bmsxU2l6ZSkrKDgrU3ViQ2h1bmsyU2l6ZSlcclxuICAgICAgZm9ybWF0ICAgICAgIDogWzB4NTcsMHg0MSwweDU2LDB4NDVdLCAjIDggICAgNCAgXCJXQVZFXCIgPSAweDU3NDE1NjQ1XHJcbiAgICAgIHN1YkNodW5rMUlkICA6IFsweDY2LDB4NmQsMHg3NCwweDIwXSwgIyAxMiAgIDQgIFwiZm10IFwiID0gMHg2NjZkNzQyMFxyXG4gICAgICBzdWJDaHVuazFTaXplOiAxNiwgICAgICAgICAgICAgICAgICAgICMgMTYgICA0ICAxNiBmb3IgUENNXHJcbiAgICAgIGF1ZGlvRm9ybWF0ICA6IDEsICAgICAgICAgICAgICAgICAgICAgIyAyMCAgIDIgIFBDTSA9IDFcclxuICAgICAgbnVtQ2hhbm5lbHMgIDogMSwgICAgICAgICAgICAgICAgICAgICAjIDIyICAgMiAgTW9ubyA9IDEsIFN0ZXJlbyA9IDIuLi5cclxuICAgICAgc2FtcGxlUmF0ZSAgIDogQHNhbXBsZVJhdGUsICAgICAgICAgICAjIDI0ICAgNCAgODAwMCwgNDQxMDAuLi5cclxuICAgICAgYnl0ZVJhdGUgICAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDI4ICAgNCAgU2FtcGxlUmF0ZSpOdW1DaGFubmVscypCaXRzUGVyU2FtcGxlLzhcclxuICAgICAgYmxvY2tBbGlnbiAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDMyICAgMiAgTnVtQ2hhbm5lbHMqQml0c1BlclNhbXBsZS84XHJcbiAgICAgIGJpdHNQZXJTYW1wbGU6IDE2LCAgICAgICAgICAgICAgICAgICAgIyAzNCAgIDIgIDggYml0cyA9IDgsIDE2IGJpdHMgPSAxNlxyXG4gICAgICBzdWJDaHVuazJJZCAgOiBbMHg2NCwweDYxLDB4NzQsMHg2MV0sICMgMzYgICA0ICBcImRhdGFcIiA9IDB4NjQ2MTc0NjFcclxuICAgICAgc3ViQ2h1bmsyU2l6ZTogMCAgICAgICAgICAgICAgICAgICAgICAjIDQwICAgNCAgZGF0YSBzaXplID0gTnVtU2FtcGxlcypOdW1DaGFubmVscypCaXRzUGVyU2FtcGxlLzhcclxuXHJcbiAgICBAZ2VuZXJhdGUoKVxyXG5cclxuICB1MzJUb0FycmF5OiAoaSkgLT5cclxuICAgIHJldHVybiBbaSYweEZGLCAoaT4+OCkmMHhGRiwgKGk+PjE2KSYweEZGLCAoaT4+MjQpJjB4RkZdXHJcblxyXG4gIHUxNlRvQXJyYXk6IChpKSAtPlxyXG4gICAgcmV0dXJuIFtpJjB4RkYsIChpPj44KSYweEZGXVxyXG5cclxuICBzcGxpdDE2Yml0QXJyYXk6IChkYXRhKSAtPlxyXG4gICAgciA9IFtdXHJcbiAgICBqID0gMFxyXG4gICAgbGVuID0gZGF0YS5sZW5ndGhcclxuICAgIGZvciBpIGluIFswLi4ubGVuXVxyXG4gICAgICByW2orK10gPSBkYXRhW2ldICYgMHhGRlxyXG4gICAgICByW2orK10gPSAoZGF0YVtpXT4+OCkgJiAweEZGXHJcblxyXG4gICAgcmV0dXJuIHJcclxuXHJcbiAgZ2VuZXJhdGU6IC0+XHJcbiAgICBAaGVhZGVyLmJsb2NrQWxpZ24gPSAoQGhlYWRlci5udW1DaGFubmVscyAqIEBoZWFkZXIuYml0c1BlclNhbXBsZSkgPj4gM1xyXG4gICAgQGhlYWRlci5ieXRlUmF0ZSA9IEBoZWFkZXIuYmxvY2tBbGlnbiAqIEBzYW1wbGVSYXRlXHJcbiAgICBAaGVhZGVyLnN1YkNodW5rMlNpemUgPSBAZGF0YS5sZW5ndGggKiAoQGhlYWRlci5iaXRzUGVyU2FtcGxlID4+IDMpXHJcbiAgICBAaGVhZGVyLmNodW5rU2l6ZSA9IDM2ICsgQGhlYWRlci5zdWJDaHVuazJTaXplXHJcblxyXG4gICAgaWYgQGhlYWRlci5iaXRzUGVyU2FtcGxlID09IDE2XHJcbiAgICAgIEBkYXRhID0gQHNwbGl0MTZiaXRBcnJheShAZGF0YSlcclxuXHJcbiAgICBAd2F2ID0gQGhlYWRlci5jaHVua0lkLmNvbmNhdChcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5jaHVua1NpemUpLFxyXG4gICAgICBAaGVhZGVyLmZvcm1hdCxcclxuICAgICAgQGhlYWRlci5zdWJDaHVuazFJZCxcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5zdWJDaHVuazFTaXplKSxcclxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5hdWRpb0Zvcm1hdCksXHJcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIubnVtQ2hhbm5lbHMpLFxyXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLnNhbXBsZVJhdGUpLFxyXG4gICAgICBAdTMyVG9BcnJheShAaGVhZGVyLmJ5dGVSYXRlKSxcclxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5ibG9ja0FsaWduKSxcclxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5iaXRzUGVyU2FtcGxlKSxcclxuICAgICAgQGhlYWRlci5zdWJDaHVuazJJZCxcclxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5zdWJDaHVuazJTaXplKSxcclxuICAgICAgQGRhdGFcclxuICAgIClcclxuICAgIGZiID0gbmV3IEZhc3RCYXNlNjRcclxuICAgIEBiYXNlNjREYXRhID0gZmIuZW5jb2RlKEB3YXYpXHJcbiAgICBAZGF0YVVSSSA9ICdkYXRhOmF1ZGlvL3dhdjtiYXNlNjQsJyArIEBiYXNlNjREYXRhXHJcblxyXG4gIHJhdzogLT5cclxuICAgIHJldHVybiBuZXcgQnVmZmVyKEBiYXNlNjREYXRhLCBcImJhc2U2NFwiKVxyXG5cclxud3JpdGVXQVYgPSAoZmlsZW5hbWUsIHNhbXBsZVJhdGUsIHNhbXBsZXMpIC0+XHJcbiAgd2F2ZSA9IG5ldyBSSUZGV0FWRSBzYW1wbGVSYXRlLCBzYW1wbGVzXHJcbiAgZnMud3JpdGVGaWxlU3luYyhmaWxlbmFtZSwgd2F2ZS5yYXcoKSlcclxuICByZXR1cm4gdHJ1ZVxyXG5cclxubWFrZURhdGFVUkkgPSAoc2FtcGxlUmF0ZSwgc2FtcGxlcykgLT5cclxuICB3YXZlID0gbmV3IFJJRkZXQVZFIHNhbXBsZVJhdGUsIHNhbXBsZXNcclxuICByZXR1cm4gd2F2ZS5kYXRhVVJJXHJcblxyXG5iNjR0b0Jsb2IgPSAoYjY0RGF0YSwgY29udGVudFR5cGUsIHNsaWNlU2l6ZSkgLT5cclxuICBjb250ZW50VHlwZSA9IGNvbnRlbnRUeXBlIHx8ICcnXHJcbiAgc2xpY2VTaXplID0gc2xpY2VTaXplIHx8IDUxMlxyXG5cclxuICBieXRlQ2hhcmFjdGVycyA9IGF0b2IoYjY0RGF0YSlcclxuICBieXRlQXJyYXlzID0gW11cclxuXHJcbiAgZm9yIG9mZnNldCBpbiBbMC4uLmJ5dGVDaGFyYWN0ZXJzLmxlbmd0aF0gYnkgc2xpY2VTaXplXHJcbiAgICBzbGljZSA9IGJ5dGVDaGFyYWN0ZXJzLnNsaWNlKG9mZnNldCwgb2Zmc2V0ICsgc2xpY2VTaXplKVxyXG5cclxuICAgIGJ5dGVOdW1iZXJzID0gbmV3IEFycmF5KHNsaWNlLmxlbmd0aClcclxuICAgIGZvciBpIGluIFswLi4uc2xpY2UubGVuZ3RoXVxyXG4gICAgICBieXRlTnVtYmVyc1tpXSA9IHNsaWNlLmNoYXJDb2RlQXQoaSlcclxuXHJcbiAgICBieXRlQXJyYXkgPSBuZXcgVWludDhBcnJheShieXRlTnVtYmVycylcclxuXHJcbiAgICBieXRlQXJyYXlzLnB1c2goYnl0ZUFycmF5KVxyXG5cclxuICBibG9iID0gbmV3IEJsb2IoYnl0ZUFycmF5cywge3R5cGU6IGNvbnRlbnRUeXBlfSlcclxuICByZXR1cm4gYmxvYlxyXG5cclxubWFrZUJsb2JVcmwgPSAoc2FtcGxlUmF0ZSwgc2FtcGxlcykgLT5cclxuICB3YXZlID0gbmV3IFJJRkZXQVZFIHNhbXBsZVJhdGUsIHNhbXBsZXNcclxuICBibG9iID0gYjY0dG9CbG9iKHdhdmUuYmFzZTY0RGF0YSwgXCJhdWRpby93YXZcIilcclxuICByZXR1cm4gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKVxyXG5cclxubW9kdWxlLmV4cG9ydHMgPVxyXG4gIFJJRkZXQVZFOiBSSUZGV0FWRVxyXG4gIHdyaXRlV0FWOiB3cml0ZVdBVlxyXG4gIG1ha2VEYXRhVVJJOiBtYWtlRGF0YVVSSVxyXG4gIG1ha2VCbG9iVXJsOiBtYWtlQmxvYlVybFxyXG4iXX0=
