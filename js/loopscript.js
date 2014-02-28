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
  first: "# ------------------------------------------------------------\n# Your first LoopScript. Someday there will be documentation!\n\ntone note1\n  duration 250\n  octave 4\n  note C\n\ntone bass1\n  duration 250\n  octave 1\n  note B\n\nloop loop1\n  pattern note1 x.......x.......\n  pattern bass1 ....x.......x...\n",
  notes: "# ------------------------------------------------------------\n# Note overrides!\n\n# Try setting the duration to 100\ntone note1\n  adsr 0.005 0.05 0.7 0.05\n  duration 250\n\n# Samples can have their notes overridden too!\nsample ding\n  src samples/ding_e.wav\n  srcnote e\n\nloop loop1\n  pattern note1 b.a.g.a.b.b.b.\n\nloop loop2\n  pattern ding b.a.g.a.b.b.b.\n\ntrack song\n  pattern loop1 x\n  pattern loop2 .x\n",
  motto: "# ------------------------------------------------------------\n# An approximation of the beat from Drake's \"The Motto\"\n\nbpm 100\nsection Bass (in a section to share ADSR)\n  adsr 0.005 0.05 0.7 0.05\n  tone bass1\n    octave 1\n  tone bass2\n    octave 2\n\nsample clap\n  src samples/clap.wav\nsample snare\n  src samples/snare.wav\nsample hihat\n  src samples/hihat.wav\n\nloop loop1\n  pattern hihat ..x.......x.......x.......x.....\n  pattern clap  ....x.......x.......x.......x...\n  pattern snare ......x...x...x.x...............\n  pattern bass1 Bbbbbb..........................\n  pattern bass2 ......HhhhhhDddddd....HhhhJj.Jj.\n\ntrack song\n  pattern loop1 xxxx\n",
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


},{}],"q0pWe1":[function(require,module,exports){
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
            this.log.error("Unexpected indent " + indent + " on line " + lineNo + ": " + line);
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


},{"../js/jdataview":1,"./freq":"SwjZMG","./riffwave":"XjRWhK","fs":2}],"./loopscript":[function(require,module,exports){
module.exports=require('q0pWe1');
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
},{"buffer":3,"fs":2}],"./riffwave":[function(require,module,exports){
module.exports=require('XjRWhK');
},{}]},{},[])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJyb3dzZXItcGFja1xcX3ByZWx1ZGUuanMiLCJqZGF0YXZpZXcuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxsaWJcXF9lbXB0eS5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnVmZmVyXFxpbmRleC5qcyIsIi4uXFxub2RlX21vZHVsZXNcXGJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnVmZmVyXFxub2RlX21vZHVsZXNcXGJhc2U2NC1qc1xcbGliXFxiNjQuanMiLCIuLlxcbm9kZV9tb2R1bGVzXFxicm93c2VyaWZ5XFxub2RlX21vZHVsZXNcXGJ1ZmZlclxcbm9kZV9tb2R1bGVzXFxpZWVlNzU0XFxpbmRleC5qcyIsIi4uXFxzcmNcXGV4YW1wbGVzLmNvZmZlZSIsIi4uXFxzcmNcXGZyZXEuY29mZmVlIiwiLi5cXHNyY1xcbG9vcHNjcmlwdC5jb2ZmZWUiLCIuLlxcc3JjXFxyaWZmd2F2ZS5jb2ZmZWUiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNXZCQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNwRkEsTUFBTSxDQUFDLE9BQVAsR0FFRTtBQUFBLEVBQUEsS0FBQSxFQUFPLDJUQUFQO0FBQUEsRUFvQkEsS0FBQSxFQUFPLHdhQXBCUDtBQUFBLEVBOENBLEtBQUEsRUFBTyx3cUJBOUNQO0FBQUEsRUE2RUEsTUFBQSxFQUFRLDhyQkE3RVI7QUFBQSxFQXlHQSxPQUFBLEVBQVMsdWRBekdUO0NBRkYsQ0FBQTs7Ozs7O0FDQUEsSUFBQSxtQ0FBQTs7QUFBQSxTQUFBLEdBQVk7RUFDVjtBQUFBLElBRUUsR0FBQSxFQUFLLE9BRlA7QUFBQSxJQUdFLEdBQUEsRUFBSyxPQUhQO0FBQUEsSUFJRSxHQUFBLEVBQUssT0FKUDtHQURVLEVBUVY7QUFBQSxJQUNFLEdBQUEsRUFBSyxPQURQO0FBQUEsSUFFRSxHQUFBLEVBQUssT0FGUDtBQUFBLElBR0UsR0FBQSxFQUFLLE9BSFA7QUFBQSxJQUlFLEdBQUEsRUFBSyxPQUpQO0FBQUEsSUFLRSxHQUFBLEVBQUssT0FMUDtBQUFBLElBTUUsR0FBQSxFQUFLLE9BTlA7QUFBQSxJQU9FLEdBQUEsRUFBSyxPQVBQO0FBQUEsSUFRRSxHQUFBLEVBQUssT0FSUDtBQUFBLElBU0UsR0FBQSxFQUFLLE9BVFA7QUFBQSxJQVVFLEdBQUEsRUFBSyxPQVZQO0FBQUEsSUFXRSxHQUFBLEVBQUssT0FYUDtBQUFBLElBWUUsR0FBQSxFQUFLLE9BWlA7R0FSVSxFQXVCVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXZCVSxFQXNDVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXRDVSxFQXFEVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXJEVSxFQW9FVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQXBFVSxFQW1GVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQW5GVSxFQWtHVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9BRFA7QUFBQSxJQUVFLEdBQUEsRUFBSyxPQUZQO0FBQUEsSUFHRSxHQUFBLEVBQUssT0FIUDtBQUFBLElBSUUsR0FBQSxFQUFLLE9BSlA7QUFBQSxJQUtFLEdBQUEsRUFBSyxPQUxQO0FBQUEsSUFNRSxHQUFBLEVBQUssT0FOUDtBQUFBLElBT0UsR0FBQSxFQUFLLE9BUFA7QUFBQSxJQVFFLEdBQUEsRUFBSyxPQVJQO0FBQUEsSUFTRSxHQUFBLEVBQUssT0FUUDtBQUFBLElBVUUsR0FBQSxFQUFLLE9BVlA7QUFBQSxJQVdFLEdBQUEsRUFBSyxPQVhQO0FBQUEsSUFZRSxHQUFBLEVBQUssT0FaUDtHQWxHVSxFQWlIVjtBQUFBLElBQ0UsR0FBQSxFQUFLLE9B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QSxNQTBJTSxDQUFDLE9BQVAsR0FDRTtBQUFBLEVBQUEsUUFBQSxFQUFVLFFBQVY7QUFBQSxFQUNBLFFBQUEsRUFBVSxRQURWO0FBQUEsRUFFQSxXQUFBLEVBQWEsV0FGYjtBQUFBLEVBR0EsV0FBQSxFQUFhLFdBSGI7Q0EzSUYsQ0FBQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uIChCdWZmZXIpe1xuLy9cbi8vIGpEYXRhVmlldyBieSBWamV1eCA8dmpldXh4QGdtYWlsLmNvbT4gLSBKYW4gMjAxMFxuLy8gQ29udGludWVkIGJ5IFJSZXZlcnNlciA8bWVAcnJldmVyc2VyLmNvbT4gLSBGZWIgMjAxM1xuLy9cbi8vIEEgdW5pcXVlIHdheSB0byB3b3JrIHdpdGggYSBiaW5hcnkgZmlsZSBpbiB0aGUgYnJvd3NlclxuLy8gaHR0cDovL2dpdGh1Yi5jb20vakRhdGFWaWV3L2pEYXRhVmlld1xuLy8gaHR0cDovL2pEYXRhVmlldy5naXRodWIuaW8vXG5cbihmdW5jdGlvbiAoZ2xvYmFsKSB7XG5cbid1c2Ugc3RyaWN0JztcblxudmFyIGNvbXBhdGliaWxpdHkgPSB7XG5cdC8vIE5vZGVKUyBCdWZmZXIgaW4gdjAuNS41IGFuZCBuZXdlclxuXHROb2RlQnVmZmVyOiAnQnVmZmVyJyBpbiBnbG9iYWwgJiYgJ3JlYWRJbnQxNkxFJyBpbiBCdWZmZXIucHJvdG90eXBlLFxuXHREYXRhVmlldzogJ0RhdGFWaWV3JyBpbiBnbG9iYWwgJiYgKFxuXHRcdCdnZXRGbG9hdDY0JyBpbiBEYXRhVmlldy5wcm90b3R5cGUgfHwgICAgICAgICAgICAvLyBDaHJvbWVcblx0XHQnZ2V0RmxvYXQ2NCcgaW4gbmV3IERhdGFWaWV3KG5ldyBBcnJheUJ1ZmZlcigxKSkgLy8gTm9kZVxuXHQpLFxuXHRBcnJheUJ1ZmZlcjogJ0FycmF5QnVmZmVyJyBpbiBnbG9iYWwsXG5cdFBpeGVsRGF0YTogJ0NhbnZhc1BpeGVsQXJyYXknIGluIGdsb2JhbCAmJiAnSW1hZ2VEYXRhJyBpbiBnbG9iYWwgJiYgJ2RvY3VtZW50JyBpbiBnbG9iYWxcbn07XG5cbi8vIHdlIGRvbid0IHdhbnQgdG8gYm90aGVyIHdpdGggb2xkIEJ1ZmZlciBpbXBsZW1lbnRhdGlvblxuaWYgKGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlcikge1xuXHQoZnVuY3Rpb24gKGJ1ZmZlcikge1xuXHRcdHRyeSB7XG5cdFx0XHRidWZmZXIud3JpdGVGbG9hdExFKEluZmluaXR5LCAwKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIgPSBmYWxzZTtcblx0XHR9XG5cdH0pKG5ldyBCdWZmZXIoNCkpO1xufVxuXG5pZiAoY29tcGF0aWJpbGl0eS5QaXhlbERhdGEpIHtcblx0dmFyIGNyZWF0ZVBpeGVsRGF0YSA9IGZ1bmN0aW9uIChieXRlTGVuZ3RoLCBidWZmZXIpIHtcblx0XHR2YXIgZGF0YSA9IGNyZWF0ZVBpeGVsRGF0YS5jb250ZXh0MmQuY3JlYXRlSW1hZ2VEYXRhKChieXRlTGVuZ3RoICsgMykgLyA0LCAxKS5kYXRhO1xuXHRcdGRhdGEuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGg7XG5cdFx0aWYgKGJ1ZmZlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGJ5dGVMZW5ndGg7IGkrKykge1xuXHRcdFx0XHRkYXRhW2ldID0gYnVmZmVyW2ldO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZGF0YTtcblx0fTtcblx0Y3JlYXRlUGl4ZWxEYXRhLmNvbnRleHQyZCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpLmdldENvbnRleHQoJzJkJyk7XG59XG5cbnZhciBkYXRhVHlwZXMgPSB7XG5cdCdJbnQ4JzogMSxcblx0J0ludDE2JzogMixcblx0J0ludDMyJzogNCxcblx0J1VpbnQ4JzogMSxcblx0J1VpbnQxNic6IDIsXG5cdCdVaW50MzInOiA0LFxuXHQnRmxvYXQzMic6IDQsXG5cdCdGbG9hdDY0JzogOFxufTtcblxudmFyIG5vZGVOYW1pbmcgPSB7XG5cdCdJbnQ4JzogJ0ludDgnLFxuXHQnSW50MTYnOiAnSW50MTYnLFxuXHQnSW50MzInOiAnSW50MzInLFxuXHQnVWludDgnOiAnVUludDgnLFxuXHQnVWludDE2JzogJ1VJbnQxNicsXG5cdCdVaW50MzInOiAnVUludDMyJyxcblx0J0Zsb2F0MzInOiAnRmxvYXQnLFxuXHQnRmxvYXQ2NCc6ICdEb3VibGUnXG59O1xuXG5mdW5jdGlvbiBhcnJheUZyb20oYXJyYXlMaWtlLCBmb3JjZUNvcHkpIHtcblx0cmV0dXJuICghZm9yY2VDb3B5ICYmIChhcnJheUxpa2UgaW5zdGFuY2VvZiBBcnJheSkpID8gYXJyYXlMaWtlIDogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJyYXlMaWtlKTtcbn1cblxuZnVuY3Rpb24gZGVmaW5lZCh2YWx1ZSwgZGVmYXVsdFZhbHVlKSB7XG5cdHJldHVybiB2YWx1ZSAhPT0gdW5kZWZpbmVkID8gdmFsdWUgOiBkZWZhdWx0VmFsdWU7XG59XG5cbmZ1bmN0aW9uIGpEYXRhVmlldyhidWZmZXIsIGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgsIGxpdHRsZUVuZGlhbikge1xuXHQvKiBqc2hpbnQgdmFsaWR0aGlzOnRydWUgKi9cblxuXHRpZiAoYnVmZmVyIGluc3RhbmNlb2YgakRhdGFWaWV3KSB7XG5cdFx0dmFyIHJlc3VsdCA9IGJ1ZmZlci5zbGljZShieXRlT2Zmc2V0LCBieXRlT2Zmc2V0ICsgYnl0ZUxlbmd0aCk7XG5cdFx0cmVzdWx0Ll9saXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgcmVzdWx0Ll9saXR0bGVFbmRpYW4pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRpZiAoISh0aGlzIGluc3RhbmNlb2YgakRhdGFWaWV3KSkge1xuXHRcdHJldHVybiBuZXcgakRhdGFWaWV3KGJ1ZmZlciwgYnl0ZU9mZnNldCwgYnl0ZUxlbmd0aCwgbGl0dGxlRW5kaWFuKTtcblx0fVxuXG5cdHRoaXMuYnVmZmVyID0gYnVmZmVyID0gakRhdGFWaWV3LndyYXBCdWZmZXIoYnVmZmVyKTtcblxuXHQvLyBDaGVjayBwYXJhbWV0ZXJzIGFuZCBleGlzdGluZyBmdW5jdGlvbm5hbGl0aWVzXG5cdHRoaXMuX2lzQXJyYXlCdWZmZXIgPSBjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyICYmIGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyO1xuXHR0aGlzLl9pc1BpeGVsRGF0YSA9IGNvbXBhdGliaWxpdHkuUGl4ZWxEYXRhICYmIGJ1ZmZlciBpbnN0YW5jZW9mIENhbnZhc1BpeGVsQXJyYXk7XG5cdHRoaXMuX2lzRGF0YVZpZXcgPSBjb21wYXRpYmlsaXR5LkRhdGFWaWV3ICYmIHRoaXMuX2lzQXJyYXlCdWZmZXI7XG5cdHRoaXMuX2lzTm9kZUJ1ZmZlciA9IGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlciAmJiBidWZmZXIgaW5zdGFuY2VvZiBCdWZmZXI7XG5cblx0Ly8gSGFuZGxlIFR5cGUgRXJyb3JzXG5cdGlmICghdGhpcy5faXNOb2RlQnVmZmVyICYmICF0aGlzLl9pc0FycmF5QnVmZmVyICYmICF0aGlzLl9pc1BpeGVsRGF0YSAmJiAhKGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5KSkge1xuXHRcdHRocm93IG5ldyBUeXBlRXJyb3IoJ2pEYXRhVmlldyBidWZmZXIgaGFzIGFuIGluY29tcGF0aWJsZSB0eXBlJyk7XG5cdH1cblxuXHQvLyBEZWZhdWx0IFZhbHVlc1xuXHR0aGlzLl9saXR0bGVFbmRpYW4gPSAhIWxpdHRsZUVuZGlhbjtcblxuXHR2YXIgYnVmZmVyTGVuZ3RoID0gJ2J5dGVMZW5ndGgnIGluIGJ1ZmZlciA/IGJ1ZmZlci5ieXRlTGVuZ3RoIDogYnVmZmVyLmxlbmd0aDtcblx0dGhpcy5ieXRlT2Zmc2V0ID0gYnl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgMCk7XG5cdHRoaXMuYnl0ZUxlbmd0aCA9IGJ5dGVMZW5ndGggPSBkZWZpbmVkKGJ5dGVMZW5ndGgsIGJ1ZmZlckxlbmd0aCAtIGJ5dGVPZmZzZXQpO1xuXG5cdGlmICghdGhpcy5faXNEYXRhVmlldykge1xuXHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgsIGJ1ZmZlckxlbmd0aCk7XG5cdH0gZWxzZSB7XG5cdFx0dGhpcy5fdmlldyA9IG5ldyBEYXRhVmlldyhidWZmZXIsIGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgpO1xuXHR9XG5cblx0Ly8gQ3JlYXRlIHVuaWZvcm0gbWV0aG9kcyAoYWN0aW9uIHdyYXBwZXJzKSBmb3IgdGhlIGZvbGxvd2luZyBkYXRhIHR5cGVzXG5cblx0dGhpcy5fZW5naW5lQWN0aW9uID1cblx0XHR0aGlzLl9pc0RhdGFWaWV3XG5cdFx0XHQ/IHRoaXMuX2RhdGFWaWV3QWN0aW9uXG5cdFx0OiB0aGlzLl9pc05vZGVCdWZmZXJcblx0XHRcdD8gdGhpcy5fbm9kZUJ1ZmZlckFjdGlvblxuXHRcdDogdGhpcy5faXNBcnJheUJ1ZmZlclxuXHRcdFx0PyB0aGlzLl9hcnJheUJ1ZmZlckFjdGlvblxuXHRcdDogdGhpcy5fYXJyYXlBY3Rpb247XG59XG5cbmZ1bmN0aW9uIGdldENoYXJDb2RlcyhzdHJpbmcpIHtcblx0aWYgKGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlcikge1xuXHRcdHJldHVybiBuZXcgQnVmZmVyKHN0cmluZywgJ2JpbmFyeScpO1xuXHR9XG5cblx0dmFyIFR5cGUgPSBjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyID8gVWludDhBcnJheSA6IEFycmF5LFxuXHRcdGNvZGVzID0gbmV3IFR5cGUoc3RyaW5nLmxlbmd0aCk7XG5cblx0Zm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IHN0cmluZy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdGNvZGVzW2ldID0gc3RyaW5nLmNoYXJDb2RlQXQoaSkgJiAweGZmO1xuXHR9XG5cdHJldHVybiBjb2Rlcztcbn1cblxuLy8gbW9zdGx5IGludGVybmFsIGZ1bmN0aW9uIGZvciB3cmFwcGluZyBhbnkgc3VwcG9ydGVkIGlucHV0IChTdHJpbmcgb3IgQXJyYXktbGlrZSkgdG8gYmVzdCBzdWl0YWJsZSBidWZmZXIgZm9ybWF0XG5qRGF0YVZpZXcud3JhcEJ1ZmZlciA9IGZ1bmN0aW9uIChidWZmZXIpIHtcblx0c3dpdGNoICh0eXBlb2YgYnVmZmVyKSB7XG5cdFx0Y2FzZSAnbnVtYmVyJzpcblx0XHRcdGlmIChjb21wYXRpYmlsaXR5Lk5vZGVCdWZmZXIpIHtcblx0XHRcdFx0YnVmZmVyID0gbmV3IEJ1ZmZlcihidWZmZXIpO1xuXHRcdFx0XHRidWZmZXIuZmlsbCgwKTtcblx0XHRcdH0gZWxzZVxuXHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuQXJyYXlCdWZmZXIpIHtcblx0XHRcdFx0YnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKS5idWZmZXI7XG5cdFx0XHR9IGVsc2Vcblx0XHRcdGlmIChjb21wYXRpYmlsaXR5LlBpeGVsRGF0YSkge1xuXHRcdFx0XHRidWZmZXIgPSBjcmVhdGVQaXhlbERhdGEoYnVmZmVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJ1ZmZlciA9IG5ldyBBcnJheShidWZmZXIpO1xuXHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IGJ1ZmZlci5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGJ1ZmZlcltpXSA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBidWZmZXI7XG5cblx0XHRjYXNlICdzdHJpbmcnOlxuXHRcdFx0YnVmZmVyID0gZ2V0Q2hhckNvZGVzKGJ1ZmZlcik7XG5cdFx0XHQvKiBmYWxscyB0aHJvdWdoICovXG5cdFx0ZGVmYXVsdDpcblx0XHRcdGlmICgnbGVuZ3RoJyBpbiBidWZmZXIgJiYgISgoY29tcGF0aWJpbGl0eS5Ob2RlQnVmZmVyICYmIGJ1ZmZlciBpbnN0YW5jZW9mIEJ1ZmZlcikgfHwgKGNvbXBhdGliaWxpdHkuQXJyYXlCdWZmZXIgJiYgYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHx8IChjb21wYXRpYmlsaXR5LlBpeGVsRGF0YSAmJiBidWZmZXIgaW5zdGFuY2VvZiBDYW52YXNQaXhlbEFycmF5KSkpIHtcblx0XHRcdFx0aWYgKGNvbXBhdGliaWxpdHkuTm9kZUJ1ZmZlcikge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IG5ldyBCdWZmZXIoYnVmZmVyKTtcblx0XHRcdFx0fSBlbHNlXG5cdFx0XHRcdGlmIChjb21wYXRpYmlsaXR5LkFycmF5QnVmZmVyKSB7XG5cdFx0XHRcdFx0aWYgKCEoYnVmZmVyIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpKSB7XG5cdFx0XHRcdFx0XHRidWZmZXIgPSBuZXcgVWludDhBcnJheShidWZmZXIpLmJ1ZmZlcjtcblx0XHRcdFx0XHRcdC8vIGJ1ZyBpbiBOb2RlLmpzIDw9IDAuODpcblx0XHRcdFx0XHRcdGlmICghKGJ1ZmZlciBpbnN0YW5jZW9mIEFycmF5QnVmZmVyKSkge1xuXHRcdFx0XHRcdFx0XHRidWZmZXIgPSBuZXcgVWludDhBcnJheShhcnJheUZyb20oYnVmZmVyLCB0cnVlKSkuYnVmZmVyO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlXG5cdFx0XHRcdGlmIChjb21wYXRpYmlsaXR5LlBpeGVsRGF0YSkge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IGNyZWF0ZVBpeGVsRGF0YShidWZmZXIubGVuZ3RoLCBidWZmZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IGFycmF5RnJvbShidWZmZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYnVmZmVyO1xuXHR9XG59O1xuXG5mdW5jdGlvbiBwb3cyKG4pIHtcblx0cmV0dXJuIChuID49IDAgJiYgbiA8IDMxKSA/ICgxIDw8IG4pIDogKHBvdzJbbl0gfHwgKHBvdzJbbl0gPSBNYXRoLnBvdygyLCBuKSkpO1xufVxuXG4vLyBsZWZ0IGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG5qRGF0YVZpZXcuY3JlYXRlQnVmZmVyID0gZnVuY3Rpb24gKCkge1xuXHRyZXR1cm4gakRhdGFWaWV3LndyYXBCdWZmZXIoYXJndW1lbnRzKTtcbn07XG5cbmZ1bmN0aW9uIFVpbnQ2NChsbywgaGkpIHtcblx0dGhpcy5sbyA9IGxvO1xuXHR0aGlzLmhpID0gaGk7XG59XG5cbmpEYXRhVmlldy5VaW50NjQgPSBVaW50NjQ7XG5cblVpbnQ2NC5wcm90b3R5cGUgPSB7XG5cdHZhbHVlT2Y6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcy5sbyArIHBvdzIoMzIpICogdGhpcy5oaTtcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBOdW1iZXIucHJvdG90eXBlLnRvU3RyaW5nLmFwcGx5KHRoaXMudmFsdWVPZigpLCBhcmd1bWVudHMpO1xuXHR9XG59O1xuXG5VaW50NjQuZnJvbU51bWJlciA9IGZ1bmN0aW9uIChudW1iZXIpIHtcblx0dmFyIGhpID0gTWF0aC5mbG9vcihudW1iZXIgLyBwb3cyKDMyKSksXG5cdFx0bG8gPSBudW1iZXIgLSBoaSAqIHBvdzIoMzIpO1xuXG5cdHJldHVybiBuZXcgVWludDY0KGxvLCBoaSk7XG59O1xuXG5mdW5jdGlvbiBJbnQ2NChsbywgaGkpIHtcblx0VWludDY0LmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG59XG5cbmpEYXRhVmlldy5JbnQ2NCA9IEludDY0O1xuXG5JbnQ2NC5wcm90b3R5cGUgPSAnY3JlYXRlJyBpbiBPYmplY3QgPyBPYmplY3QuY3JlYXRlKFVpbnQ2NC5wcm90b3R5cGUpIDogbmV3IFVpbnQ2NCgpO1xuXG5JbnQ2NC5wcm90b3R5cGUudmFsdWVPZiA9IGZ1bmN0aW9uICgpIHtcblx0aWYgKHRoaXMuaGkgPCBwb3cyKDMxKSkge1xuXHRcdHJldHVybiBVaW50NjQucHJvdG90eXBlLnZhbHVlT2YuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0fVxuXHRyZXR1cm4gLSgocG93MigzMikgLSB0aGlzLmxvKSArIHBvdzIoMzIpICogKHBvdzIoMzIpIC0gMSAtIHRoaXMuaGkpKTtcbn07XG5cbkludDY0LmZyb21OdW1iZXIgPSBmdW5jdGlvbiAobnVtYmVyKSB7XG5cdHZhciBsbywgaGk7XG5cdGlmIChudW1iZXIgPj0gMCkge1xuXHRcdHZhciB1bnNpZ25lZCA9IFVpbnQ2NC5mcm9tTnVtYmVyKG51bWJlcik7XG5cdFx0bG8gPSB1bnNpZ25lZC5sbztcblx0XHRoaSA9IHVuc2lnbmVkLmhpO1xuXHR9IGVsc2Uge1xuXHRcdGhpID0gTWF0aC5mbG9vcihudW1iZXIgLyBwb3cyKDMyKSk7XG5cdFx0bG8gPSBudW1iZXIgLSBoaSAqIHBvdzIoMzIpO1xuXHRcdGhpICs9IHBvdzIoMzIpO1xuXHR9XG5cdHJldHVybiBuZXcgSW50NjQobG8sIGhpKTtcbn07XG5cbmpEYXRhVmlldy5wcm90b3R5cGUgPSB7XG5cdF9vZmZzZXQ6IDAsXG5cdF9iaXRPZmZzZXQ6IDAsXG5cblx0Y29tcGF0aWJpbGl0eTogY29tcGF0aWJpbGl0eSxcblxuXHRfY2hlY2tCb3VuZHM6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBieXRlTGVuZ3RoLCBtYXhMZW5ndGgpIHtcblx0XHQvLyBEbyBhZGRpdGlvbmFsIGNoZWNrcyB0byBzaW11bGF0ZSBEYXRhVmlld1xuXHRcdGlmICh0eXBlb2YgYnl0ZU9mZnNldCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBUeXBlRXJyb3IoJ09mZnNldCBpcyBub3QgYSBudW1iZXIuJyk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYnl0ZUxlbmd0aCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBUeXBlRXJyb3IoJ1NpemUgaXMgbm90IGEgbnVtYmVyLicpO1xuXHRcdH1cblx0XHRpZiAoYnl0ZUxlbmd0aCA8IDApIHtcblx0XHRcdHRocm93IG5ldyBSYW5nZUVycm9yKCdMZW5ndGggaXMgbmVnYXRpdmUuJyk7XG5cdFx0fVxuXHRcdGlmIChieXRlT2Zmc2V0IDwgMCB8fCBieXRlT2Zmc2V0ICsgYnl0ZUxlbmd0aCA+IGRlZmluZWQobWF4TGVuZ3RoLCB0aGlzLmJ5dGVMZW5ndGgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgUmFuZ2VFcnJvcignT2Zmc2V0cyBhcmUgb3V0IG9mIGJvdW5kcy4nKTtcblx0XHR9XG5cdH0sXG5cblx0X2FjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdHJldHVybiB0aGlzLl9lbmdpbmVBY3Rpb24oXG5cdFx0XHR0eXBlLFxuXHRcdFx0aXNSZWFkQWN0aW9uLFxuXHRcdFx0ZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpLFxuXHRcdFx0ZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbiksXG5cdFx0XHR2YWx1ZVxuXHRcdCk7XG5cdH0sXG5cblx0X2RhdGFWaWV3QWN0aW9uOiBmdW5jdGlvbiAodHlwZSwgaXNSZWFkQWN0aW9uLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKSB7XG5cdFx0Ly8gTW92ZSB0aGUgaW50ZXJuYWwgb2Zmc2V0IGZvcndhcmRcblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgZGF0YVR5cGVzW3R5cGVdO1xuXHRcdHJldHVybiBpc1JlYWRBY3Rpb24gPyB0aGlzLl92aWV3WydnZXQnICsgdHlwZV0oYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSA6IHRoaXMuX3ZpZXdbJ3NldCcgKyB0eXBlXShieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfbm9kZUJ1ZmZlckFjdGlvbjogZnVuY3Rpb24gKHR5cGUsIGlzUmVhZEFjdGlvbiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuLCB2YWx1ZSkge1xuXHRcdC8vIE1vdmUgdGhlIGludGVybmFsIG9mZnNldCBmb3J3YXJkXG5cdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIGRhdGFUeXBlc1t0eXBlXTtcblx0XHR2YXIgbm9kZU5hbWUgPSBub2RlTmFtaW5nW3R5cGVdICsgKCh0eXBlID09PSAnSW50OCcgfHwgdHlwZSA9PT0gJ1VpbnQ4JykgPyAnJyA6IGxpdHRsZUVuZGlhbiA/ICdMRScgOiAnQkUnKTtcblx0XHRieXRlT2Zmc2V0ICs9IHRoaXMuYnl0ZU9mZnNldDtcblx0XHRyZXR1cm4gaXNSZWFkQWN0aW9uID8gdGhpcy5idWZmZXJbJ3JlYWQnICsgbm9kZU5hbWVdKGJ5dGVPZmZzZXQpIDogdGhpcy5idWZmZXJbJ3dyaXRlJyArIG5vZGVOYW1lXSh2YWx1ZSwgYnl0ZU9mZnNldCk7XG5cdH0sXG5cblx0X2FycmF5QnVmZmVyQWN0aW9uOiBmdW5jdGlvbiAodHlwZSwgaXNSZWFkQWN0aW9uLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKSB7XG5cdFx0dmFyIHNpemUgPSBkYXRhVHlwZXNbdHlwZV0sIFR5cGVkQXJyYXkgPSBnbG9iYWxbdHlwZSArICdBcnJheSddLCB0eXBlZEFycmF5O1xuXG5cdFx0bGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cblx0XHQvLyBBcnJheUJ1ZmZlcjogd2UgdXNlIGEgdHlwZWQgYXJyYXkgb2Ygc2l6ZSAxIGZyb20gb3JpZ2luYWwgYnVmZmVyIGlmIGFsaWdubWVudCBpcyBnb29kIGFuZCBmcm9tIHNsaWNlIHdoZW4gaXQncyBub3Rcblx0XHRpZiAoc2l6ZSA9PT0gMSB8fCAoKHRoaXMuYnl0ZU9mZnNldCArIGJ5dGVPZmZzZXQpICUgc2l6ZSA9PT0gMCAmJiBsaXR0bGVFbmRpYW4pKSB7XG5cdFx0XHR0eXBlZEFycmF5ID0gbmV3IFR5cGVkQXJyYXkodGhpcy5idWZmZXIsIHRoaXMuYnl0ZU9mZnNldCArIGJ5dGVPZmZzZXQsIDEpO1xuXHRcdFx0dGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldCArIHNpemU7XG5cdFx0XHRyZXR1cm4gaXNSZWFkQWN0aW9uID8gdHlwZWRBcnJheVswXSA6ICh0eXBlZEFycmF5WzBdID0gdmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YXIgYnl0ZXMgPSBuZXcgVWludDhBcnJheShpc1JlYWRBY3Rpb24gPyB0aGlzLmdldEJ5dGVzKHNpemUsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSkgOiBzaXplKTtcblx0XHRcdHR5cGVkQXJyYXkgPSBuZXcgVHlwZWRBcnJheShieXRlcy5idWZmZXIsIDAsIDEpO1xuXG5cdFx0XHRpZiAoaXNSZWFkQWN0aW9uKSB7XG5cdFx0XHRcdHJldHVybiB0eXBlZEFycmF5WzBdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHlwZWRBcnJheVswXSA9IHZhbHVlO1xuXHRcdFx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBieXRlcywgbGl0dGxlRW5kaWFuKTtcblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cblx0X2FycmF5QWN0aW9uOiBmdW5jdGlvbiAodHlwZSwgaXNSZWFkQWN0aW9uLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKSB7XG5cdFx0cmV0dXJuIGlzUmVhZEFjdGlvbiA/IHRoaXNbJ19nZXQnICsgdHlwZV0oYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSA6IHRoaXNbJ19zZXQnICsgdHlwZV0oYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0Ly8gSGVscGVyc1xuXG5cdF9nZXRCeXRlczogZnVuY3Rpb24gKGxlbmd0aCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0bGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblx0XHRsZW5ndGggPSBkZWZpbmVkKGxlbmd0aCwgdGhpcy5ieXRlTGVuZ3RoIC0gYnl0ZU9mZnNldCk7XG5cblx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBsZW5ndGgpO1xuXG5cdFx0Ynl0ZU9mZnNldCArPSB0aGlzLmJ5dGVPZmZzZXQ7XG5cblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0IC0gdGhpcy5ieXRlT2Zmc2V0ICsgbGVuZ3RoO1xuXG5cdFx0dmFyIHJlc3VsdCA9IHRoaXMuX2lzQXJyYXlCdWZmZXJcblx0XHRcdFx0XHQgPyBuZXcgVWludDhBcnJheSh0aGlzLmJ1ZmZlciwgYnl0ZU9mZnNldCwgbGVuZ3RoKVxuXHRcdFx0XHRcdCA6ICh0aGlzLmJ1ZmZlci5zbGljZSB8fCBBcnJheS5wcm90b3R5cGUuc2xpY2UpLmNhbGwodGhpcy5idWZmZXIsIGJ5dGVPZmZzZXQsIGJ5dGVPZmZzZXQgKyBsZW5ndGgpO1xuXG5cdFx0cmV0dXJuIGxpdHRsZUVuZGlhbiB8fCBsZW5ndGggPD0gMSA/IHJlc3VsdCA6IGFycmF5RnJvbShyZXN1bHQpLnJldmVyc2UoKTtcblx0fSxcblxuXHQvLyB3cmFwcGVyIGZvciBleHRlcm5hbCBjYWxscyAoZG8gbm90IHJldHVybiBpbm5lciBidWZmZXIgZGlyZWN0bHkgdG8gcHJldmVudCBpdCdzIG1vZGlmeWluZylcblx0Z2V0Qnl0ZXM6IGZ1bmN0aW9uIChsZW5ndGgsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiwgdG9BcnJheSkge1xuXHRcdHZhciByZXN1bHQgPSB0aGlzLl9nZXRCeXRlcyhsZW5ndGgsIGJ5dGVPZmZzZXQsIGRlZmluZWQobGl0dGxlRW5kaWFuLCB0cnVlKSk7XG5cdFx0cmV0dXJuIHRvQXJyYXkgPyBhcnJheUZyb20ocmVzdWx0KSA6IHJlc3VsdDtcblx0fSxcblxuXHRfc2V0Qnl0ZXM6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBieXRlcywgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dmFyIGxlbmd0aCA9IGJ5dGVzLmxlbmd0aDtcblxuXHRcdC8vIG5lZWRlZCBmb3IgT3BlcmFcblx0XHRpZiAobGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGl0dGxlRW5kaWFuID0gZGVmaW5lZChsaXR0bGVFbmRpYW4sIHRoaXMuX2xpdHRsZUVuZGlhbik7XG5cdFx0Ynl0ZU9mZnNldCA9IGRlZmluZWQoYnl0ZU9mZnNldCwgdGhpcy5fb2Zmc2V0KTtcblxuXHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIGxlbmd0aCk7XG5cblx0XHRpZiAoIWxpdHRsZUVuZGlhbiAmJiBsZW5ndGggPiAxKSB7XG5cdFx0XHRieXRlcyA9IGFycmF5RnJvbShieXRlcywgdHJ1ZSkucmV2ZXJzZSgpO1xuXHRcdH1cblxuXHRcdGJ5dGVPZmZzZXQgKz0gdGhpcy5ieXRlT2Zmc2V0O1xuXG5cdFx0aWYgKHRoaXMuX2lzQXJyYXlCdWZmZXIpIHtcblx0XHRcdG5ldyBVaW50OEFycmF5KHRoaXMuYnVmZmVyLCBieXRlT2Zmc2V0LCBsZW5ndGgpLnNldChieXRlcyk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuX2lzTm9kZUJ1ZmZlcikge1xuXHRcdFx0XHRuZXcgQnVmZmVyKGJ5dGVzKS5jb3B5KHRoaXMuYnVmZmVyLCBieXRlT2Zmc2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHR0aGlzLmJ1ZmZlcltieXRlT2Zmc2V0ICsgaV0gPSBieXRlc1tpXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgLSB0aGlzLmJ5dGVPZmZzZXQgKyBsZW5ndGg7XG5cdH0sXG5cblx0c2V0Qnl0ZXM6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBieXRlcywgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgYnl0ZXMsIGRlZmluZWQobGl0dGxlRW5kaWFuLCB0cnVlKSk7XG5cdH0sXG5cblx0Z2V0U3RyaW5nOiBmdW5jdGlvbiAoYnl0ZUxlbmd0aCwgYnl0ZU9mZnNldCwgZW5jb2RpbmcpIHtcblx0XHRpZiAodGhpcy5faXNOb2RlQnVmZmVyKSB7XG5cdFx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXHRcdFx0Ynl0ZUxlbmd0aCA9IGRlZmluZWQoYnl0ZUxlbmd0aCwgdGhpcy5ieXRlTGVuZ3RoIC0gYnl0ZU9mZnNldCk7XG5cblx0XHRcdHRoaXMuX2NoZWNrQm91bmRzKGJ5dGVPZmZzZXQsIGJ5dGVMZW5ndGgpO1xuXG5cdFx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgYnl0ZUxlbmd0aDtcblx0XHRcdHJldHVybiB0aGlzLmJ1ZmZlci50b1N0cmluZyhlbmNvZGluZyB8fCAnYmluYXJ5JywgdGhpcy5ieXRlT2Zmc2V0ICsgYnl0ZU9mZnNldCwgdGhpcy5ieXRlT2Zmc2V0ICsgdGhpcy5fb2Zmc2V0KTtcblx0XHR9XG5cdFx0dmFyIGJ5dGVzID0gdGhpcy5fZ2V0Qnl0ZXMoYnl0ZUxlbmd0aCwgYnl0ZU9mZnNldCwgdHJ1ZSksIHN0cmluZyA9ICcnO1xuXHRcdGJ5dGVMZW5ndGggPSBieXRlcy5sZW5ndGg7XG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBieXRlTGVuZ3RoOyBpKyspIHtcblx0XHRcdHN0cmluZyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldKTtcblx0XHR9XG5cdFx0aWYgKGVuY29kaW5nID09PSAndXRmOCcpIHtcblx0XHRcdHN0cmluZyA9IGRlY29kZVVSSUNvbXBvbmVudChlc2NhcGUoc3RyaW5nKSk7XG5cdFx0fVxuXHRcdHJldHVybiBzdHJpbmc7XG5cdH0sXG5cblx0c2V0U3RyaW5nOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgc3ViU3RyaW5nLCBlbmNvZGluZykge1xuXHRcdGlmICh0aGlzLl9pc05vZGVCdWZmZXIpIHtcblx0XHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cdFx0XHR0aGlzLl9jaGVja0JvdW5kcyhieXRlT2Zmc2V0LCBzdWJTdHJpbmcubGVuZ3RoKTtcblx0XHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyB0aGlzLmJ1ZmZlci53cml0ZShzdWJTdHJpbmcsIHRoaXMuYnl0ZU9mZnNldCArIGJ5dGVPZmZzZXQsIGVuY29kaW5nIHx8ICdiaW5hcnknKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGVuY29kaW5nID09PSAndXRmOCcpIHtcblx0XHRcdHN1YlN0cmluZyA9IHVuZXNjYXBlKGVuY29kZVVSSUNvbXBvbmVudChzdWJTdHJpbmcpKTtcblx0XHR9XG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgZ2V0Q2hhckNvZGVzKHN1YlN0cmluZyksIHRydWUpO1xuXHR9LFxuXG5cdGdldENoYXI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0KSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0U3RyaW5nKDEsIGJ5dGVPZmZzZXQpO1xuXHR9LFxuXG5cdHNldENoYXI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBjaGFyYWN0ZXIpIHtcblx0XHR0aGlzLnNldFN0cmluZyhieXRlT2Zmc2V0LCBjaGFyYWN0ZXIpO1xuXHR9LFxuXG5cdHRlbGw6IGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGhpcy5fb2Zmc2V0O1xuXHR9LFxuXG5cdHNlZWs6IGZ1bmN0aW9uIChieXRlT2Zmc2V0KSB7XG5cdFx0dGhpcy5fY2hlY2tCb3VuZHMoYnl0ZU9mZnNldCwgMCk7XG5cdFx0LyoganNoaW50IGJvc3M6IHRydWUgKi9cblx0XHRyZXR1cm4gdGhpcy5fb2Zmc2V0ID0gYnl0ZU9mZnNldDtcblx0fSxcblxuXHRza2lwOiBmdW5jdGlvbiAoYnl0ZUxlbmd0aCkge1xuXHRcdHJldHVybiB0aGlzLnNlZWsodGhpcy5fb2Zmc2V0ICsgYnl0ZUxlbmd0aCk7XG5cdH0sXG5cblx0c2xpY2U6IGZ1bmN0aW9uIChzdGFydCwgZW5kLCBmb3JjZUNvcHkpIHtcblx0XHRmdW5jdGlvbiBub3JtYWxpemVPZmZzZXQob2Zmc2V0LCBieXRlTGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gb2Zmc2V0IDwgMCA/IG9mZnNldCArIGJ5dGVMZW5ndGggOiBvZmZzZXQ7XG5cdFx0fVxuXG5cdFx0c3RhcnQgPSBub3JtYWxpemVPZmZzZXQoc3RhcnQsIHRoaXMuYnl0ZUxlbmd0aCk7XG5cdFx0ZW5kID0gbm9ybWFsaXplT2Zmc2V0KGRlZmluZWQoZW5kLCB0aGlzLmJ5dGVMZW5ndGgpLCB0aGlzLmJ5dGVMZW5ndGgpO1xuXG5cdFx0cmV0dXJuIGZvcmNlQ29weVxuXHRcdFx0ICAgPyBuZXcgakRhdGFWaWV3KHRoaXMuZ2V0Qnl0ZXMoZW5kIC0gc3RhcnQsIHN0YXJ0LCB0cnVlLCB0cnVlKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMuX2xpdHRsZUVuZGlhbilcblx0XHRcdCAgIDogbmV3IGpEYXRhVmlldyh0aGlzLmJ1ZmZlciwgdGhpcy5ieXRlT2Zmc2V0ICsgc3RhcnQsIGVuZCAtIHN0YXJ0LCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHR9LFxuXG5cdGFsaWduQnk6IGZ1bmN0aW9uIChieXRlQ291bnQpIHtcblx0XHR0aGlzLl9iaXRPZmZzZXQgPSAwO1xuXHRcdGlmIChkZWZpbmVkKGJ5dGVDb3VudCwgMSkgIT09IDEpIHtcblx0XHRcdHJldHVybiB0aGlzLnNraXAoYnl0ZUNvdW50IC0gKHRoaXMuX29mZnNldCAlIGJ5dGVDb3VudCB8fCBieXRlQ291bnQpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX29mZnNldDtcblx0XHR9XG5cdH0sXG5cblx0Ly8gQ29tcGF0aWJpbGl0eSBmdW5jdGlvbnNcblxuXHRfZ2V0RmxvYXQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBiID0gdGhpcy5fZ2V0Qnl0ZXMoOCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSxcblxuXHRcdFx0c2lnbiA9IDEgLSAoMiAqIChiWzddID4+IDcpKSxcblx0XHRcdGV4cG9uZW50ID0gKCgoKGJbN10gPDwgMSkgJiAweGZmKSA8PCAzKSB8IChiWzZdID4+IDQpKSAtICgoMSA8PCAxMCkgLSAxKSxcblxuXHRcdC8vIEJpbmFyeSBvcGVyYXRvcnMgc3VjaCBhcyB8IGFuZCA8PCBvcGVyYXRlIG9uIDMyIGJpdCB2YWx1ZXMsIHVzaW5nICsgYW5kIE1hdGgucG93KDIpIGluc3RlYWRcblx0XHRcdG1hbnRpc3NhID0gKChiWzZdICYgMHgwZikgKiBwb3cyKDQ4KSkgKyAoYls1XSAqIHBvdzIoNDApKSArIChiWzRdICogcG93MigzMikpICtcblx0XHRcdFx0XHRcdChiWzNdICogcG93MigyNCkpICsgKGJbMl0gKiBwb3cyKDE2KSkgKyAoYlsxXSAqIHBvdzIoOCkpICsgYlswXTtcblxuXHRcdGlmIChleHBvbmVudCA9PT0gMTAyNCkge1xuXHRcdFx0aWYgKG1hbnRpc3NhICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiBOYU47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gc2lnbiAqIEluZmluaXR5O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleHBvbmVudCA9PT0gLTEwMjMpIHsgLy8gRGVub3JtYWxpemVkXG5cdFx0XHRyZXR1cm4gc2lnbiAqIG1hbnRpc3NhICogcG93MigtMTAyMiAtIDUyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc2lnbiAqICgxICsgbWFudGlzc2EgKiBwb3cyKC01MikpICogcG93MihleHBvbmVudCk7XG5cdH0sXG5cblx0X2dldEZsb2F0MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgYiA9IHRoaXMuX2dldEJ5dGVzKDQsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbiksXG5cblx0XHRcdHNpZ24gPSAxIC0gKDIgKiAoYlszXSA+PiA3KSksXG5cdFx0XHRleHBvbmVudCA9ICgoKGJbM10gPDwgMSkgJiAweGZmKSB8IChiWzJdID4+IDcpKSAtIDEyNyxcblx0XHRcdG1hbnRpc3NhID0gKChiWzJdICYgMHg3ZikgPDwgMTYpIHwgKGJbMV0gPDwgOCkgfCBiWzBdO1xuXG5cdFx0aWYgKGV4cG9uZW50ID09PSAxMjgpIHtcblx0XHRcdGlmIChtYW50aXNzYSAhPT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gTmFOO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHNpZ24gKiBJbmZpbml0eTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZXhwb25lbnQgPT09IC0xMjcpIHsgLy8gRGVub3JtYWxpemVkXG5cdFx0XHRyZXR1cm4gc2lnbiAqIG1hbnRpc3NhICogcG93MigtMTI2IC0gMjMpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzaWduICogKDEgKyBtYW50aXNzYSAqIHBvdzIoLTIzKSkgKiBwb3cyKGV4cG9uZW50KTtcblx0fSxcblxuXHRfZ2V0NjQ6IGZ1bmN0aW9uIChUeXBlLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRsaXR0bGVFbmRpYW4gPSBkZWZpbmVkKGxpdHRsZUVuZGlhbiwgdGhpcy5fbGl0dGxlRW5kaWFuKTtcblx0XHRieXRlT2Zmc2V0ID0gZGVmaW5lZChieXRlT2Zmc2V0LCB0aGlzLl9vZmZzZXQpO1xuXG5cdFx0dmFyIHBhcnRzID0gbGl0dGxlRW5kaWFuID8gWzAsIDRdIDogWzQsIDBdO1xuXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCAyOyBpKyspIHtcblx0XHRcdHBhcnRzW2ldID0gdGhpcy5nZXRVaW50MzIoYnl0ZU9mZnNldCArIHBhcnRzW2ldLCBsaXR0bGVFbmRpYW4pO1xuXHRcdH1cblxuXHRcdHRoaXMuX29mZnNldCA9IGJ5dGVPZmZzZXQgKyA4O1xuXG5cdFx0cmV0dXJuIG5ldyBUeXBlKHBhcnRzWzBdLCBwYXJ0c1sxXSk7XG5cdH0sXG5cblx0Z2V0SW50NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0NjQoSW50NjQsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0Z2V0VWludDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldDY0KFVpbnQ2NCwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfZ2V0SW50MzI6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgYiA9IHRoaXMuX2dldEJ5dGVzKDQsIGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbik7XG5cdFx0cmV0dXJuIChiWzNdIDw8IDI0KSB8IChiWzJdIDw8IDE2KSB8IChiWzFdIDw8IDgpIHwgYlswXTtcblx0fSxcblxuXHRfZ2V0VWludDMyOiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEludDMyKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikgPj4+IDA7XG5cdH0sXG5cblx0X2dldEludDE2OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0cmV0dXJuICh0aGlzLl9nZXRVaW50MTYoYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKSA8PCAxNikgPj4gMTY7XG5cdH0sXG5cblx0X2dldFVpbnQxNjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIGxpdHRsZUVuZGlhbikge1xuXHRcdHZhciBiID0gdGhpcy5fZ2V0Qnl0ZXMoMiwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKTtcblx0XHRyZXR1cm4gKGJbMV0gPDwgOCkgfCBiWzBdO1xuXHR9LFxuXG5cdF9nZXRJbnQ4OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCkge1xuXHRcdHJldHVybiAodGhpcy5fZ2V0VWludDgoYnl0ZU9mZnNldCkgPDwgMjQpID4+IDI0O1xuXHR9LFxuXG5cdF9nZXRVaW50ODogZnVuY3Rpb24gKGJ5dGVPZmZzZXQpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Qnl0ZXMoMSwgYnl0ZU9mZnNldClbMF07XG5cdH0sXG5cblx0X2dldEJpdFJhbmdlRGF0YTogZnVuY3Rpb24gKGJpdExlbmd0aCwgYnl0ZU9mZnNldCkge1xuXHRcdHZhciBzdGFydEJpdCA9IChkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCkgPDwgMykgKyB0aGlzLl9iaXRPZmZzZXQsXG5cdFx0XHRlbmRCaXQgPSBzdGFydEJpdCArIGJpdExlbmd0aCxcblx0XHRcdHN0YXJ0ID0gc3RhcnRCaXQgPj4+IDMsXG5cdFx0XHRlbmQgPSAoZW5kQml0ICsgNykgPj4+IDMsXG5cdFx0XHRiID0gdGhpcy5fZ2V0Qnl0ZXMoZW5kIC0gc3RhcnQsIHN0YXJ0LCB0cnVlKSxcblx0XHRcdHdpZGVWYWx1ZSA9IDA7XG5cblx0XHQvKiBqc2hpbnQgYm9zczogdHJ1ZSAqL1xuXHRcdGlmICh0aGlzLl9iaXRPZmZzZXQgPSBlbmRCaXQgJiA3KSB7XG5cdFx0XHR0aGlzLl9iaXRPZmZzZXQgLT0gODtcblx0XHR9XG5cblx0XHRmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gYi5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0d2lkZVZhbHVlID0gKHdpZGVWYWx1ZSA8PCA4KSB8IGJbaV07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0OiBzdGFydCxcblx0XHRcdGJ5dGVzOiBiLFxuXHRcdFx0d2lkZVZhbHVlOiB3aWRlVmFsdWVcblx0XHR9O1xuXHR9LFxuXG5cdGdldFNpZ25lZDogZnVuY3Rpb24gKGJpdExlbmd0aCwgYnl0ZU9mZnNldCkge1xuXHRcdHZhciBzaGlmdCA9IDMyIC0gYml0TGVuZ3RoO1xuXHRcdHJldHVybiAodGhpcy5nZXRVbnNpZ25lZChiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpIDw8IHNoaWZ0KSA+PiBzaGlmdDtcblx0fSxcblxuXHRnZXRVbnNpZ25lZDogZnVuY3Rpb24gKGJpdExlbmd0aCwgYnl0ZU9mZnNldCkge1xuXHRcdHZhciB2YWx1ZSA9IHRoaXMuX2dldEJpdFJhbmdlRGF0YShiaXRMZW5ndGgsIGJ5dGVPZmZzZXQpLndpZGVWYWx1ZSA+Pj4gLXRoaXMuX2JpdE9mZnNldDtcblx0XHRyZXR1cm4gYml0TGVuZ3RoIDwgMzIgPyAodmFsdWUgJiB+KC0xIDw8IGJpdExlbmd0aCkpIDogdmFsdWU7XG5cdH0sXG5cblx0X3NldEJpbmFyeUZsb2F0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIG1hbnRTaXplLCBleHBTaXplLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR2YXIgc2lnbkJpdCA9IHZhbHVlIDwgMCA/IDEgOiAwLFxuXHRcdFx0ZXhwb25lbnQsXG5cdFx0XHRtYW50aXNzYSxcblx0XHRcdGVNYXggPSB+KC0xIDw8IChleHBTaXplIC0gMSkpLFxuXHRcdFx0ZU1pbiA9IDEgLSBlTWF4O1xuXG5cdFx0aWYgKHZhbHVlIDwgMCkge1xuXHRcdFx0dmFsdWUgPSAtdmFsdWU7XG5cdFx0fVxuXG5cdFx0aWYgKHZhbHVlID09PSAwKSB7XG5cdFx0XHRleHBvbmVudCA9IDA7XG5cdFx0XHRtYW50aXNzYSA9IDA7XG5cdFx0fSBlbHNlIGlmIChpc05hTih2YWx1ZSkpIHtcblx0XHRcdGV4cG9uZW50ID0gMiAqIGVNYXggKyAxO1xuXHRcdFx0bWFudGlzc2EgPSAxO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IEluZmluaXR5KSB7XG5cdFx0XHRleHBvbmVudCA9IDIgKiBlTWF4ICsgMTtcblx0XHRcdG1hbnRpc3NhID0gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZXhwb25lbnQgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKTtcblx0XHRcdGlmIChleHBvbmVudCA+PSBlTWluICYmIGV4cG9uZW50IDw9IGVNYXgpIHtcblx0XHRcdFx0bWFudGlzc2EgPSBNYXRoLmZsb29yKCh2YWx1ZSAqIHBvdzIoLWV4cG9uZW50KSAtIDEpICogcG93MihtYW50U2l6ZSkpO1xuXHRcdFx0XHRleHBvbmVudCArPSBlTWF4O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWFudGlzc2EgPSBNYXRoLmZsb29yKHZhbHVlIC8gcG93MihlTWluIC0gbWFudFNpemUpKTtcblx0XHRcdFx0ZXhwb25lbnQgPSAwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHZhciBiID0gW107XG5cdFx0d2hpbGUgKG1hbnRTaXplID49IDgpIHtcblx0XHRcdGIucHVzaChtYW50aXNzYSAlIDI1Nik7XG5cdFx0XHRtYW50aXNzYSA9IE1hdGguZmxvb3IobWFudGlzc2EgLyAyNTYpO1xuXHRcdFx0bWFudFNpemUgLT0gODtcblx0XHR9XG5cdFx0ZXhwb25lbnQgPSAoZXhwb25lbnQgPDwgbWFudFNpemUpIHwgbWFudGlzc2E7XG5cdFx0ZXhwU2l6ZSArPSBtYW50U2l6ZTtcblx0XHR3aGlsZSAoZXhwU2l6ZSA+PSA4KSB7XG5cdFx0XHRiLnB1c2goZXhwb25lbnQgJiAweGZmKTtcblx0XHRcdGV4cG9uZW50ID4+Pj0gODtcblx0XHRcdGV4cFNpemUgLT0gODtcblx0XHR9XG5cdFx0Yi5wdXNoKChzaWduQml0IDw8IGV4cFNpemUpIHwgZXhwb25lbnQpO1xuXG5cdFx0dGhpcy5fc2V0Qnl0ZXMoYnl0ZU9mZnNldCwgYiwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0RmxvYXQzMjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXRCaW5hcnlGbG9hdChieXRlT2Zmc2V0LCB2YWx1ZSwgMjMsIDgsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldEZsb2F0NjQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0dGhpcy5fc2V0QmluYXJ5RmxvYXQoYnl0ZU9mZnNldCwgdmFsdWUsIDUyLCAxMSwgbGl0dGxlRW5kaWFuKTtcblx0fSxcblxuXHRfc2V0NjQ6IGZ1bmN0aW9uIChUeXBlLCBieXRlT2Zmc2V0LCB2YWx1ZSwgbGl0dGxlRW5kaWFuKSB7XG5cdFx0aWYgKCEodmFsdWUgaW5zdGFuY2VvZiBUeXBlKSkge1xuXHRcdFx0dmFsdWUgPSBUeXBlLmZyb21OdW1iZXIodmFsdWUpO1xuXHRcdH1cblxuXHRcdGxpdHRsZUVuZGlhbiA9IGRlZmluZWQobGl0dGxlRW5kaWFuLCB0aGlzLl9saXR0bGVFbmRpYW4pO1xuXHRcdGJ5dGVPZmZzZXQgPSBkZWZpbmVkKGJ5dGVPZmZzZXQsIHRoaXMuX29mZnNldCk7XG5cblx0XHR2YXIgcGFydHMgPSBsaXR0bGVFbmRpYW4gPyB7bG86IDAsIGhpOiA0fSA6IHtsbzogNCwgaGk6IDB9O1xuXG5cdFx0Zm9yICh2YXIgcGFydE5hbWUgaW4gcGFydHMpIHtcblx0XHRcdHRoaXMuc2V0VWludDMyKGJ5dGVPZmZzZXQgKyBwYXJ0c1twYXJ0TmFtZV0sIHZhbHVlW3BhcnROYW1lXSwgbGl0dGxlRW5kaWFuKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vZmZzZXQgPSBieXRlT2Zmc2V0ICsgODtcblx0fSxcblxuXHRzZXRJbnQ2NDogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXQ2NChJbnQ2NCwgYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0c2V0VWludDY0OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdHRoaXMuX3NldDY0KFVpbnQ2NCwgYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldFVpbnQzMjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBbXG5cdFx0XHR2YWx1ZSAmIDB4ZmYsXG5cdFx0XHQodmFsdWUgPj4+IDgpICYgMHhmZixcblx0XHRcdCh2YWx1ZSA+Pj4gMTYpICYgMHhmZixcblx0XHRcdHZhbHVlID4+PiAyNFxuXHRcdF0sIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldFVpbnQxNjogZnVuY3Rpb24gKGJ5dGVPZmZzZXQsIHZhbHVlLCBsaXR0bGVFbmRpYW4pIHtcblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBbXG5cdFx0XHR2YWx1ZSAmIDB4ZmYsXG5cdFx0XHQodmFsdWUgPj4+IDgpICYgMHhmZlxuXHRcdF0sIGxpdHRsZUVuZGlhbik7XG5cdH0sXG5cblx0X3NldFVpbnQ4OiBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUpIHtcblx0XHR0aGlzLl9zZXRCeXRlcyhieXRlT2Zmc2V0LCBbdmFsdWUgJiAweGZmXSk7XG5cdH0sXG5cblx0c2V0VW5zaWduZWQ6IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCB2YWx1ZSwgYml0TGVuZ3RoKSB7XG5cdFx0dmFyIGRhdGEgPSB0aGlzLl9nZXRCaXRSYW5nZURhdGEoYml0TGVuZ3RoLCBieXRlT2Zmc2V0KSxcblx0XHRcdHdpZGVWYWx1ZSA9IGRhdGEud2lkZVZhbHVlLFxuXHRcdFx0YiA9IGRhdGEuYnl0ZXM7XG5cblx0XHR3aWRlVmFsdWUgJj0gfih+KC0xIDw8IGJpdExlbmd0aCkgPDwgLXRoaXMuX2JpdE9mZnNldCk7IC8vIGNsZWFyaW5nIGJpdCByYW5nZSBiZWZvcmUgYmluYXJ5IFwib3JcIlxuXHRcdHdpZGVWYWx1ZSB8PSAoYml0TGVuZ3RoIDwgMzIgPyAodmFsdWUgJiB+KC0xIDw8IGJpdExlbmd0aCkpIDogdmFsdWUpIDw8IC10aGlzLl9iaXRPZmZzZXQ7IC8vIHNldHRpbmcgYml0c1xuXG5cdFx0Zm9yICh2YXIgaSA9IGIubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGJbaV0gPSB3aWRlVmFsdWUgJiAweGZmO1xuXHRcdFx0d2lkZVZhbHVlID4+Pj0gODtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXRCeXRlcyhkYXRhLnN0YXJ0LCBiLCB0cnVlKTtcblx0fVxufTtcblxudmFyIHByb3RvID0gakRhdGFWaWV3LnByb3RvdHlwZTtcblxuZm9yICh2YXIgdHlwZSBpbiBkYXRhVHlwZXMpIHtcblx0KGZ1bmN0aW9uICh0eXBlKSB7XG5cdFx0cHJvdG9bJ2dldCcgKyB0eXBlXSA9IGZ1bmN0aW9uIChieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4pIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY3Rpb24odHlwZSwgdHJ1ZSwgYnl0ZU9mZnNldCwgbGl0dGxlRW5kaWFuKTtcblx0XHR9O1xuXHRcdHByb3RvWydzZXQnICsgdHlwZV0gPSBmdW5jdGlvbiAoYnl0ZU9mZnNldCwgdmFsdWUsIGxpdHRsZUVuZGlhbikge1xuXHRcdFx0dGhpcy5fYWN0aW9uKHR5cGUsIGZhbHNlLCBieXRlT2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHZhbHVlKTtcblx0XHR9O1xuXHR9KSh0eXBlKTtcbn1cblxucHJvdG8uX3NldEludDMyID0gcHJvdG8uX3NldFVpbnQzMjtcbnByb3RvLl9zZXRJbnQxNiA9IHByb3RvLl9zZXRVaW50MTY7XG5wcm90by5fc2V0SW50OCA9IHByb3RvLl9zZXRVaW50ODtcbnByb3RvLnNldFNpZ25lZCA9IHByb3RvLnNldFVuc2lnbmVkO1xuXG5mb3IgKHZhciBtZXRob2QgaW4gcHJvdG8pIHtcblx0aWYgKG1ldGhvZC5zbGljZSgwLCAzKSA9PT0gJ3NldCcpIHtcblx0XHQoZnVuY3Rpb24gKHR5cGUpIHtcblx0XHRcdHByb3RvWyd3cml0ZScgKyB0eXBlXSA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0QXJyYXkucHJvdG90eXBlLnVuc2hpZnQuY2FsbChhcmd1bWVudHMsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXNbJ3NldCcgKyB0eXBlXS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdFx0fTtcblx0XHR9KShtZXRob2Quc2xpY2UoMykpO1xuXHR9XG59XG5cbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG5cdG1vZHVsZS5leHBvcnRzID0gakRhdGFWaWV3O1xufSBlbHNlXG5pZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG5cdGRlZmluZShbXSwgZnVuY3Rpb24gKCkgeyByZXR1cm4gakRhdGFWaWV3IH0pO1xufSBlbHNlIHtcblx0dmFyIG9sZEdsb2JhbCA9IGdsb2JhbC5qRGF0YVZpZXc7XG5cdChnbG9iYWwuakRhdGFWaWV3ID0gakRhdGFWaWV3KS5ub0NvbmZsaWN0ID0gZnVuY3Rpb24gKCkge1xuXHRcdGdsb2JhbC5qRGF0YVZpZXcgPSBvbGRHbG9iYWw7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH07XG59XG5cbn0pKChmdW5jdGlvbiAoKSB7IC8qIGpzaGludCBzdHJpY3Q6IGZhbHNlICovIHJldHVybiB0aGlzIH0pKCkpO1xufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCJidWZmZXJcIikuQnVmZmVyKSIsbnVsbCwiLyoqXG4gKiBUaGUgYnVmZmVyIG1vZHVsZSBmcm9tIG5vZGUuanMsIGZvciB0aGUgYnJvd3Nlci5cbiAqXG4gKiBBdXRob3I6ICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIExpY2Vuc2U6ICBNSVRcbiAqXG4gKiBgbnBtIGluc3RhbGwgYnVmZmVyYFxuICovXG5cbnZhciBiYXNlNjQgPSByZXF1aXJlKCdiYXNlNjQtanMnKVxudmFyIGllZWU3NTQgPSByZXF1aXJlKCdpZWVlNzU0JylcblxuZXhwb3J0cy5CdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuU2xvd0J1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUyA9IDUwXG5CdWZmZXIucG9vbFNpemUgPSA4MTkyXG5cbi8qKlxuICogSWYgYEJ1ZmZlci5fdXNlVHlwZWRBcnJheXNgOlxuICogICA9PT0gdHJ1ZSAgICBVc2UgVWludDhBcnJheSBpbXBsZW1lbnRhdGlvbiAoZmFzdGVzdClcbiAqICAgPT09IGZhbHNlICAgVXNlIE9iamVjdCBpbXBsZW1lbnRhdGlvbiAoY29tcGF0aWJsZSBkb3duIHRvIElFNilcbiAqL1xuQnVmZmVyLl91c2VUeXBlZEFycmF5cyA9IChmdW5jdGlvbiAoKSB7XG4gICAvLyBEZXRlY3QgaWYgYnJvd3NlciBzdXBwb3J0cyBUeXBlZCBBcnJheXMuIFN1cHBvcnRlZCBicm93c2VycyBhcmUgSUUgMTArLFxuICAgLy8gRmlyZWZveCA0KywgQ2hyb21lIDcrLCBTYWZhcmkgNS4xKywgT3BlcmEgMTEuNissIGlPUyA0LjIrLlxuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgPT09ICd1bmRlZmluZWQnIHx8IHR5cGVvZiBBcnJheUJ1ZmZlciA9PT0gJ3VuZGVmaW5lZCcpXG4gICAgcmV0dXJuIGZhbHNlXG5cbiAgLy8gRG9lcyB0aGUgYnJvd3NlciBzdXBwb3J0IGFkZGluZyBwcm9wZXJ0aWVzIHRvIGBVaW50OEFycmF5YCBpbnN0YW5jZXM/IElmXG4gIC8vIG5vdCwgdGhlbiB0aGF0J3MgdGhlIHNhbWUgYXMgbm8gYFVpbnQ4QXJyYXlgIHN1cHBvcnQuIFdlIG5lZWQgdG8gYmUgYWJsZSB0b1xuICAvLyBhZGQgYWxsIHRoZSBub2RlIEJ1ZmZlciBBUEkgbWV0aG9kcy5cbiAgLy8gUmVsZXZhbnQgRmlyZWZveCBidWc6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOFxuICB0cnkge1xuICAgIHZhciBhcnIgPSBuZXcgVWludDhBcnJheSgwKVxuICAgIGFyci5mb28gPSBmdW5jdGlvbiAoKSB7IHJldHVybiA0MiB9XG4gICAgcmV0dXJuIDQyID09PSBhcnIuZm9vKCkgJiZcbiAgICAgICAgdHlwZW9mIGFyci5zdWJhcnJheSA9PT0gJ2Z1bmN0aW9uJyAvLyBDaHJvbWUgOS0xMCBsYWNrIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gV29ya2Fyb3VuZDogbm9kZSdzIGJhc2U2NCBpbXBsZW1lbnRhdGlvbiBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgc3RyaW5nc1xuICAvLyB3aGlsZSBiYXNlNjQtanMgZG9lcyBub3QuXG4gIGlmIChlbmNvZGluZyA9PT0gJ2Jhc2U2NCcgJiYgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBzdWJqZWN0ID0gc3RyaW5ndHJpbShzdWJqZWN0KVxuICAgIHdoaWxlIChzdWJqZWN0Lmxlbmd0aCAlIDQgIT09IDApIHtcbiAgICAgIHN1YmplY3QgPSBzdWJqZWN0ICsgJz0nXG4gICAgfVxuICB9XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0KVxuICBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJylcbiAgICBsZW5ndGggPSBCdWZmZXIuYnl0ZUxlbmd0aChzdWJqZWN0LCBlbmNvZGluZylcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QubGVuZ3RoKSAvLyBBc3N1bWUgb2JqZWN0IGlzIGFuIGFycmF5XG4gIGVsc2VcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZpcnN0IGFyZ3VtZW50IG5lZWRzIHRvIGJlIGEgbnVtYmVyLCBhcnJheSBvciBzdHJpbmcuJylcblxuICB2YXIgYnVmXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgLy8gUHJlZmVycmVkOiBSZXR1cm4gYW4gYXVnbWVudGVkIGBVaW50OEFycmF5YCBpbnN0YW5jZSBmb3IgYmVzdCBwZXJmb3JtYW5jZVxuICAgIGJ1ZiA9IGF1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIFRISVMgaW5zdGFuY2Ugb2YgQnVmZmVyIChjcmVhdGVkIGJ5IGBuZXdgKVxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gICAgYnVmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmIHR5cGVvZiBVaW50OEFycmF5ID09PSAnZnVuY3Rpb24nICYmXG4gICAgICBzdWJqZWN0IGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIFVpbnQ4QXJyYXlcbiAgICBidWYuX3NldChzdWJqZWN0KVxuICB9IGVsc2UgaWYgKGlzQXJyYXlpc2goc3ViamVjdCkpIHtcbiAgICAvLyBUcmVhdCBhcnJheS1pc2ggb2JqZWN0cyBhcyBhIGJ5dGUgYXJyYXlcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkpXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3QucmVhZFVJbnQ4KGkpXG4gICAgICBlbHNlXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3RbaV1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBidWYud3JpdGUoc3ViamVjdCwgMCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgIUJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgIW5vWmVybykge1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgYnVmW2ldID0gMFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBidWZcbn1cblxuLy8gU1RBVElDIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09XG5cbkJ1ZmZlci5pc0VuY29kaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nKSB7XG4gIHN3aXRjaCAoU3RyaW5nKGVuY29kaW5nKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICBjYXNlICdyYXcnOlxuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiAoYikge1xuICByZXR1cm4gISEoYiAhPT0gbnVsbCAmJiBiICE9PSB1bmRlZmluZWQgJiYgYi5faXNCdWZmZXIpXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldFxuICBzdHIgPSBzdHIgKyAnJ1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoIC8gMlxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdyYXcnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAqIDJcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIuY29uY2F0ID0gZnVuY3Rpb24gKGxpc3QsIHRvdGFsTGVuZ3RoKSB7XG4gIGFzc2VydChpc0FycmF5KGxpc3QpLCAnVXNhZ2U6IEJ1ZmZlci5jb25jYXQobGlzdCwgW3RvdGFsTGVuZ3RoXSlcXG4nICtcbiAgICAgICdsaXN0IHNob3VsZCBiZSBhbiBBcnJheS4nKVxuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKDApXG4gIH0gZWxzZSBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gbGlzdFswXVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB0b3RhbExlbmd0aCAhPT0gJ251bWJlcicpIHtcbiAgICB0b3RhbExlbmd0aCA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgdG90YWxMZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcih0b3RhbExlbmd0aClcbiAgdmFyIHBvcyA9IDBcbiAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgaXRlbSA9IGxpc3RbaV1cbiAgICBpdGVtLmNvcHkoYnVmLCBwb3MpXG4gICAgcG9zICs9IGl0ZW0ubGVuZ3RoXG4gIH1cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBCVUZGRVIgSU5TVEFOQ0UgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gX2hleFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gYnVmLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG5cbiAgLy8gbXVzdCBiZSBhbiBldmVuIG51bWJlciBvZiBkaWdpdHNcbiAgdmFyIHN0ckxlbiA9IHN0cmluZy5sZW5ndGhcbiAgYXNzZXJ0KHN0ckxlbiAlIDIgPT09IDAsICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBhc3NlcnQoIWlzTmFOKGJ5dGUpLCAnSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPSBpICogMlxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBfdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjhUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2FzY2lpV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2JpbmFyeVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIF9hc2NpaVdyaXRlKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGJhc2U2NFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfdXRmMTZsZVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjE2bGVUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gX2hleFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IF91dGY4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0ID0gX2FzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IF9iaW5hcnlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gX2Jhc2U2NFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBfdXRmMTZsZVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgc2VsZiA9IHRoaXNcblxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcbiAgc3RhcnQgPSBOdW1iZXIoc3RhcnQpIHx8IDBcbiAgZW5kID0gKGVuZCAhPT0gdW5kZWZpbmVkKVxuICAgID8gTnVtYmVyKGVuZClcbiAgICA6IGVuZCA9IHNlbGYubGVuZ3RoXG5cbiAgLy8gRmFzdHBhdGggZW1wdHkgc3RyaW5nc1xuICBpZiAoZW5kID09PSBzdGFydClcbiAgICByZXR1cm4gJydcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gX2hleFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IF91dGY4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0ID0gX2FzY2lpU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IF9iaW5hcnlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gX2Jhc2U2NFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBfdXRmMTZsZVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogJ0J1ZmZlcicsXG4gICAgZGF0YTogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5fYXJyIHx8IHRoaXMsIDApXG4gIH1cbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKHRhcmdldCwgdGFyZ2V0X3N0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIHZhciBzb3VyY2UgPSB0aGlzXG5cbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKCF0YXJnZXRfc3RhcnQpIHRhcmdldF9zdGFydCA9IDBcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdzb3VyY2VFbmQgPCBzb3VyY2VTdGFydCcpXG4gIGFzc2VydCh0YXJnZXRfc3RhcnQgPj0gMCAmJiB0YXJnZXRfc3RhcnQgPCB0YXJnZXQubGVuZ3RoLFxuICAgICAgJ3RhcmdldFN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSBzb3VyY2UubGVuZ3RoLCAnc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aClcbiAgICBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCA8IGVuZCAtIHN0YXJ0KVxuICAgIGVuZCA9IHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgKyBzdGFydFxuXG4gIC8vIGNvcHkhXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZW5kIC0gc3RhcnQ7IGkrKylcbiAgICB0YXJnZXRbaSArIHRhcmdldF9zdGFydF0gPSB0aGlzW2kgKyBzdGFydF1cbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKHN0YXJ0ID09PSAwICYmIGVuZCA9PT0gYnVmLmxlbmd0aCkge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1Zi5zbGljZShzdGFydCwgZW5kKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBfdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKylcbiAgICByZXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gX2JpbmFyeVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgcmV0dXJuIF9hc2NpaVNsaWNlKGJ1Ziwgc3RhcnQsIGVuZClcbn1cblxuZnVuY3Rpb24gX2hleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gX3V0ZjE2bGVTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBieXRlcyA9IGJ1Zi5zbGljZShzdGFydCwgZW5kKVxuICB2YXIgcmVzID0gJydcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkgKz0gMikge1xuICAgIHJlcyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldICsgYnl0ZXNbaSsxXSAqIDI1NilcbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgc3RhcnQgPSBjbGFtcChzdGFydCwgbGVuLCAwKVxuICBlbmQgPSBjbGFtcChlbmQsIGxlbiwgbGVuKVxuXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgcmV0dXJuIGF1Z21lbnQodGhpcy5zdWJhcnJheShzdGFydCwgZW5kKSlcbiAgfSBlbHNlIHtcbiAgICB2YXIgc2xpY2VMZW4gPSBlbmQgLSBzdGFydFxuICAgIHZhciBuZXdCdWYgPSBuZXcgQnVmZmVyKHNsaWNlTGVuLCB1bmRlZmluZWQsIHRydWUpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbGljZUxlbjsgaSsrKSB7XG4gICAgICBuZXdCdWZbaV0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gICAgcmV0dXJuIG5ld0J1ZlxuICB9XG59XG5cbi8vIGBnZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5nZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLnJlYWRVSW50OChvZmZzZXQpXG59XG5cbi8vIGBzZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uICh2LCBvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5zZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLndyaXRlVUludDgodiwgb2Zmc2V0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgfSBlbHNlIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAyXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gICAgdmFsIHw9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldCArIDNdIDw8IDI0ID4+PiAwKVxuICB9IGVsc2Uge1xuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDFdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDJdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgM11cbiAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldF0gPDwgMjQgPj4+IDApXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLFxuICAgICAgICAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgdmFyIG5lZyA9IHRoaXNbb2Zmc2V0XSAmIDB4ODBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MTYoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDMyKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDAwMDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmZmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEZsb2F0IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdEJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRG91YmxlIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZilcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpIHJldHVyblxuXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmZmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDQpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlID4+PiAobGl0dGxlRW5kaWFuID8gaSA6IDMgLSBpKSAqIDgpICYgMHhmZlxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmLCAtMHg4MClcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgdGhpcy53cml0ZVVJbnQ4KHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgdGhpcy53cml0ZVVJbnQ4KDB4ZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZiwgLTB4ODAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQxNihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MTYoYnVmLCAweGZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MzIoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgMHhmZmZmZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVGbG9hdCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAzLjQwMjgyMzQ2NjM4NTI4ODZlKzM4LCAtMy40MDI4MjM0NjYzODUyODg2ZSszOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsXG4gICAgICAgICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgsIC0xLjc5NzY5MzEzNDg2MjMxNTdFKzMwOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gZmlsbCh2YWx1ZSwgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiAodmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCF2YWx1ZSkgdmFsdWUgPSAwXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCkgZW5kID0gdGhpcy5sZW5ndGhcblxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHZhbHVlID0gdmFsdWUuY2hhckNvZGVBdCgwKVxuICB9XG5cbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgIWlzTmFOKHZhbHVlKSwgJ3ZhbHVlIGlzIG5vdCBhIG51bWJlcicpXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdlbmQgPCBzdGFydCcpXG5cbiAgLy8gRmlsbCAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHRoaXMubGVuZ3RoLCAnc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gdGhpcy5sZW5ndGgsICdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICB0aGlzW2ldID0gdmFsdWVcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBvdXQgPSBbXVxuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIG91dFtpXSA9IHRvSGV4KHRoaXNbaV0pXG4gICAgaWYgKGkgPT09IGV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMpIHtcbiAgICAgIG91dFtpICsgMV0gPSAnLi4uJ1xuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICc8QnVmZmVyICcgKyBvdXQuam9pbignICcpICsgJz4nXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgQXJyYXlCdWZmZXJgIHdpdGggdGhlICpjb3BpZWQqIG1lbW9yeSBvZiB0aGUgYnVmZmVyIGluc3RhbmNlLlxuICogQWRkZWQgaW4gTm9kZSAwLjEyLiBPbmx5IGF2YWlsYWJsZSBpbiBicm93c2VycyB0aGF0IHN1cHBvcnQgQXJyYXlCdWZmZXIuXG4gKi9cbkJ1ZmZlci5wcm90b3R5cGUudG9BcnJheUJ1ZmZlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiBVaW50OEFycmF5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAgIHJldHVybiAobmV3IEJ1ZmZlcih0aGlzKSkuYnVmZmVyXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBidWYgPSBuZXcgVWludDhBcnJheSh0aGlzLmxlbmd0aClcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBidWYubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDEpXG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignQnVmZmVyLnRvQXJyYXlCdWZmZXIgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGJyb3dzZXInKVxuICB9XG59XG5cbi8vIEhFTFBFUiBGVU5DVElPTlNcbi8vID09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxudmFyIEJQID0gQnVmZmVyLnByb3RvdHlwZVxuXG4vKipcbiAqIEF1Z21lbnQgdGhlIFVpbnQ4QXJyYXkgKmluc3RhbmNlKiAobm90IHRoZSBjbGFzcyEpIHdpdGggQnVmZmVyIG1ldGhvZHNcbiAqL1xuZnVuY3Rpb24gYXVnbWVudCAoYXJyKSB7XG4gIGFyci5faXNCdWZmZXIgPSB0cnVlXG5cbiAgLy8gc2F2ZSByZWZlcmVuY2UgdG8gb3JpZ2luYWwgVWludDhBcnJheSBnZXQvc2V0IG1ldGhvZHMgYmVmb3JlIG92ZXJ3cml0aW5nXG4gIGFyci5fZ2V0ID0gYXJyLmdldFxuICBhcnIuX3NldCA9IGFyci5zZXRcblxuICAvLyBkZXByZWNhdGVkLCB3aWxsIGJlIHJlbW92ZWQgaW4gbm9kZSAwLjEzK1xuICBhcnIuZ2V0ID0gQlAuZ2V0XG4gIGFyci5zZXQgPSBCUC5zZXRcblxuICBhcnIud3JpdGUgPSBCUC53cml0ZVxuICBhcnIudG9TdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9Mb2NhbGVTdHJpbmcgPSBCUC50b1N0cmluZ1xuICBhcnIudG9KU09OID0gQlAudG9KU09OXG4gIGFyci5jb3B5ID0gQlAuY29weVxuICBhcnIuc2xpY2UgPSBCUC5zbGljZVxuICBhcnIucmVhZFVJbnQ4ID0gQlAucmVhZFVJbnQ4XG4gIGFyci5yZWFkVUludDE2TEUgPSBCUC5yZWFkVUludDE2TEVcbiAgYXJyLnJlYWRVSW50MTZCRSA9IEJQLnJlYWRVSW50MTZCRVxuICBhcnIucmVhZFVJbnQzMkxFID0gQlAucmVhZFVJbnQzMkxFXG4gIGFyci5yZWFkVUludDMyQkUgPSBCUC5yZWFkVUludDMyQkVcbiAgYXJyLnJlYWRJbnQ4ID0gQlAucmVhZEludDhcbiAgYXJyLnJlYWRJbnQxNkxFID0gQlAucmVhZEludDE2TEVcbiAgYXJyLnJlYWRJbnQxNkJFID0gQlAucmVhZEludDE2QkVcbiAgYXJyLnJlYWRJbnQzMkxFID0gQlAucmVhZEludDMyTEVcbiAgYXJyLnJlYWRJbnQzMkJFID0gQlAucmVhZEludDMyQkVcbiAgYXJyLnJlYWRGbG9hdExFID0gQlAucmVhZEZsb2F0TEVcbiAgYXJyLnJlYWRGbG9hdEJFID0gQlAucmVhZEZsb2F0QkVcbiAgYXJyLnJlYWREb3VibGVMRSA9IEJQLnJlYWREb3VibGVMRVxuICBhcnIucmVhZERvdWJsZUJFID0gQlAucmVhZERvdWJsZUJFXG4gIGFyci53cml0ZVVJbnQ4ID0gQlAud3JpdGVVSW50OFxuICBhcnIud3JpdGVVSW50MTZMRSA9IEJQLndyaXRlVUludDE2TEVcbiAgYXJyLndyaXRlVUludDE2QkUgPSBCUC53cml0ZVVJbnQxNkJFXG4gIGFyci53cml0ZVVJbnQzMkxFID0gQlAud3JpdGVVSW50MzJMRVxuICBhcnIud3JpdGVVSW50MzJCRSA9IEJQLndyaXRlVUludDMyQkVcbiAgYXJyLndyaXRlSW50OCA9IEJQLndyaXRlSW50OFxuICBhcnIud3JpdGVJbnQxNkxFID0gQlAud3JpdGVJbnQxNkxFXG4gIGFyci53cml0ZUludDE2QkUgPSBCUC53cml0ZUludDE2QkVcbiAgYXJyLndyaXRlSW50MzJMRSA9IEJQLndyaXRlSW50MzJMRVxuICBhcnIud3JpdGVJbnQzMkJFID0gQlAud3JpdGVJbnQzMkJFXG4gIGFyci53cml0ZUZsb2F0TEUgPSBCUC53cml0ZUZsb2F0TEVcbiAgYXJyLndyaXRlRmxvYXRCRSA9IEJQLndyaXRlRmxvYXRCRVxuICBhcnIud3JpdGVEb3VibGVMRSA9IEJQLndyaXRlRG91YmxlTEVcbiAgYXJyLndyaXRlRG91YmxlQkUgPSBCUC53cml0ZURvdWJsZUJFXG4gIGFyci5maWxsID0gQlAuZmlsbFxuICBhcnIuaW5zcGVjdCA9IEJQLmluc3BlY3RcbiAgYXJyLnRvQXJyYXlCdWZmZXIgPSBCUC50b0FycmF5QnVmZmVyXG5cbiAgcmV0dXJuIGFyclxufVxuXG4vLyBzbGljZShzdGFydCwgZW5kKVxuZnVuY3Rpb24gY2xhbXAgKGluZGV4LCBsZW4sIGRlZmF1bHRWYWx1ZSkge1xuICBpZiAodHlwZW9mIGluZGV4ICE9PSAnbnVtYmVyJykgcmV0dXJuIGRlZmF1bHRWYWx1ZVxuICBpbmRleCA9IH5+aW5kZXg7ICAvLyBDb2VyY2UgdG8gaW50ZWdlci5cbiAgaWYgKGluZGV4ID49IGxlbikgcmV0dXJuIGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIGluZGV4ICs9IGxlblxuICBpZiAoaW5kZXggPj0gMCkgcmV0dXJuIGluZGV4XG4gIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGNvZXJjZSAobGVuZ3RoKSB7XG4gIC8vIENvZXJjZSBsZW5ndGggdG8gYSBudW1iZXIgKHBvc3NpYmx5IE5hTiksIHJvdW5kIHVwXG4gIC8vIGluIGNhc2UgaXQncyBmcmFjdGlvbmFsIChlLmcuIDEyMy40NTYpIHRoZW4gZG8gYVxuICAvLyBkb3VibGUgbmVnYXRlIHRvIGNvZXJjZSBhIE5hTiB0byAwLiBFYXN5LCByaWdodD9cbiAgbGVuZ3RoID0gfn5NYXRoLmNlaWwoK2xlbmd0aClcbiAgcmV0dXJuIGxlbmd0aCA8IDAgPyAwIDogbGVuZ3RoXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXkgKHN1YmplY3QpIHtcbiAgcmV0dXJuIChBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uIChzdWJqZWN0KSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzdWJqZWN0KSA9PT0gJ1tvYmplY3QgQXJyYXldJ1xuICB9KShzdWJqZWN0KVxufVxuXG5mdW5jdGlvbiBpc0FycmF5aXNoIChzdWJqZWN0KSB7XG4gIHJldHVybiBpc0FycmF5KHN1YmplY3QpIHx8IEJ1ZmZlci5pc0J1ZmZlcihzdWJqZWN0KSB8fFxuICAgICAgc3ViamVjdCAmJiB0eXBlb2Ygc3ViamVjdCA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHR5cGVvZiBzdWJqZWN0Lmxlbmd0aCA9PT0gJ251bWJlcidcbn1cblxuZnVuY3Rpb24gdG9IZXggKG4pIHtcbiAgaWYgKG4gPCAxNikgcmV0dXJuICcwJyArIG4udG9TdHJpbmcoMTYpXG4gIHJldHVybiBuLnRvU3RyaW5nKDE2KVxufVxuXG5mdW5jdGlvbiB1dGY4VG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIHZhciBiID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBpZiAoYiA8PSAweDdGKVxuICAgICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkpXG4gICAgZWxzZSB7XG4gICAgICB2YXIgc3RhcnQgPSBpXG4gICAgICBpZiAoYiA+PSAweEQ4MDAgJiYgYiA8PSAweERGRkYpIGkrK1xuICAgICAgdmFyIGggPSBlbmNvZGVVUklDb21wb25lbnQoc3RyLnNsaWNlKHN0YXJ0LCBpKzEpKS5zdWJzdHIoMSkuc3BsaXQoJyUnKVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBoLmxlbmd0aDsgaisrKVxuICAgICAgICBieXRlQXJyYXkucHVzaChwYXJzZUludChoW2pdLCAxNikpXG4gICAgfVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYXNjaWlUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgLy8gTm9kZSdzIGNvZGUgc2VlbXMgdG8gYmUgZG9pbmcgdGhpcyBhbmQgbm90ICYgMHg3Ri4uXG4gICAgYnl0ZUFycmF5LnB1c2goc3RyLmNoYXJDb2RlQXQoaSkgJiAweEZGKVxuICB9XG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gdXRmMTZsZVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYywgaGksIGxvXG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIGMgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGhpID0gYyA+PiA4XG4gICAgbG8gPSBjICUgMjU2XG4gICAgYnl0ZUFycmF5LnB1c2gobG8pXG4gICAgYnl0ZUFycmF5LnB1c2goaGkpXG4gIH1cblxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGJhc2U2NFRvQnl0ZXMgKHN0cikge1xuICByZXR1cm4gYmFzZTY0LnRvQnl0ZUFycmF5KHN0cilcbn1cblxuZnVuY3Rpb24gYmxpdEJ1ZmZlciAoc3JjLCBkc3QsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBwb3NcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmICgoaSArIG9mZnNldCA+PSBkc3QubGVuZ3RoKSB8fCAoaSA+PSBzcmMubGVuZ3RoKSlcbiAgICAgIGJyZWFrXG4gICAgZHN0W2kgKyBvZmZzZXRdID0gc3JjW2ldXG4gIH1cbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gZGVjb2RlVXRmOENoYXIgKHN0cikge1xuICB0cnkge1xuICAgIHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKVxuICB9IGNhdGNoIChlcnIpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSgweEZGRkQpIC8vIFVURiA4IGludmFsaWQgY2hhclxuICB9XG59XG5cbi8qXG4gKiBXZSBoYXZlIHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSB2YWx1ZSBpcyBhIHZhbGlkIGludGVnZXIuIFRoaXMgbWVhbnMgdGhhdCBpdFxuICogaXMgbm9uLW5lZ2F0aXZlLiBJdCBoYXMgbm8gZnJhY3Rpb25hbCBjb21wb25lbnQgYW5kIHRoYXQgaXQgZG9lcyBub3RcbiAqIGV4Y2VlZCB0aGUgbWF4aW11bSBhbGxvd2VkIHZhbHVlLlxuICovXG5mdW5jdGlvbiB2ZXJpZnVpbnQgKHZhbHVlLCBtYXgpIHtcbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicsICdjYW5ub3Qgd3JpdGUgYSBub24tbnVtYmVyIGFzIGEgbnVtYmVyJylcbiAgYXNzZXJ0KHZhbHVlID49IDAsXG4gICAgICAnc3BlY2lmaWVkIGEgbmVnYXRpdmUgdmFsdWUgZm9yIHdyaXRpbmcgYW4gdW5zaWduZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgaXMgbGFyZ2VyIHRoYW4gbWF4aW11bSB2YWx1ZSBmb3IgdHlwZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmc2ludCAodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmSUVFRTc1NCAodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG59XG5cbmZ1bmN0aW9uIGFzc2VydCAodGVzdCwgbWVzc2FnZSkge1xuICBpZiAoIXRlc3QpIHRocm93IG5ldyBFcnJvcihtZXNzYWdlIHx8ICdGYWlsZWQgYXNzZXJ0aW9uJylcbn1cbiIsInZhciBsb29rdXAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG5cbjsoZnVuY3Rpb24gKGV4cG9ydHMpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG4gIHZhciBBcnIgPSAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKVxuICAgID8gVWludDhBcnJheVxuICAgIDogQXJyYXlcblxuXHR2YXIgWkVSTyAgID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXG5cdGZ1bmN0aW9uIGRlY29kZSAoZWx0KSB7XG5cdFx0dmFyIGNvZGUgPSBlbHQuY2hhckNvZGVBdCgwKVxuXHRcdGlmIChjb2RlID09PSBQTFVTKVxuXHRcdFx0cmV0dXJuIDYyIC8vICcrJ1xuXHRcdGlmIChjb2RlID09PSBTTEFTSClcblx0XHRcdHJldHVybiA2MyAvLyAnLydcblx0XHRpZiAoY29kZSA8IE5VTUJFUilcblx0XHRcdHJldHVybiAtMSAvL25vIG1hdGNoXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIgKyAxMClcblx0XHRcdHJldHVybiBjb2RlIC0gTlVNQkVSICsgMjYgKyAyNlxuXHRcdGlmIChjb2RlIDwgVVBQRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gVVBQRVJcblx0XHRpZiAoY29kZSA8IExPV0VSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIExPV0VSICsgMjZcblx0fVxuXG5cdGZ1bmN0aW9uIGI2NFRvQnl0ZUFycmF5IChiNjQpIHtcblx0XHR2YXIgaSwgaiwgbCwgdG1wLCBwbGFjZUhvbGRlcnMsIGFyclxuXG5cdFx0aWYgKGI2NC5sZW5ndGggJSA0ID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0Jylcblx0XHR9XG5cblx0XHQvLyB0aGUgbnVtYmVyIG9mIGVxdWFsIHNpZ25zIChwbGFjZSBob2xkZXJzKVxuXHRcdC8vIGlmIHRoZXJlIGFyZSB0d28gcGxhY2Vob2xkZXJzLCB0aGFuIHRoZSB0d28gY2hhcmFjdGVycyBiZWZvcmUgaXRcblx0XHQvLyByZXByZXNlbnQgb25lIGJ5dGVcblx0XHQvLyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgdGhlbiB0aGUgdGhyZWUgY2hhcmFjdGVycyBiZWZvcmUgaXQgcmVwcmVzZW50IDIgYnl0ZXNcblx0XHQvLyB0aGlzIGlzIGp1c3QgYSBjaGVhcCBoYWNrIHRvIG5vdCBkbyBpbmRleE9mIHR3aWNlXG5cdFx0dmFyIGxlbiA9IGI2NC5sZW5ndGhcblx0XHRwbGFjZUhvbGRlcnMgPSAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMikgPyAyIDogJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDEpID8gMSA6IDBcblxuXHRcdC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuXHRcdGFyciA9IG5ldyBBcnIoYjY0Lmxlbmd0aCAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKVxuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHBsYWNlaG9sZGVycywgb25seSBnZXQgdXAgdG8gdGhlIGxhc3QgY29tcGxldGUgNCBjaGFyc1xuXHRcdGwgPSBwbGFjZUhvbGRlcnMgPiAwID8gYjY0Lmxlbmd0aCAtIDQgOiBiNjQubGVuZ3RoXG5cblx0XHR2YXIgTCA9IDBcblxuXHRcdGZ1bmN0aW9uIHB1c2ggKHYpIHtcblx0XHRcdGFycltMKytdID0gdlxuXHRcdH1cblxuXHRcdGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbDsgaSArPSA0LCBqICs9IDMpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTgpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgMTIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPDwgNikgfCBkZWNvZGUoYjY0LmNoYXJBdChpICsgMykpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDAwMCkgPj4gMTYpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDApID4+IDgpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpID4+IDQpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fSBlbHNlIGlmIChwbGFjZUhvbGRlcnMgPT09IDEpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTApIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgNCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA+PiAyKVxuXHRcdFx0cHVzaCgodG1wID4+IDgpICYgMHhGRilcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJyXG5cdH1cblxuXHRmdW5jdGlvbiB1aW50OFRvQmFzZTY0ICh1aW50OCkge1xuXHRcdHZhciBpLFxuXHRcdFx0ZXh0cmFCeXRlcyA9IHVpbnQ4Lmxlbmd0aCAlIDMsIC8vIGlmIHdlIGhhdmUgMSBieXRlIGxlZnQsIHBhZCAyIGJ5dGVzXG5cdFx0XHRvdXRwdXQgPSBcIlwiLFxuXHRcdFx0dGVtcCwgbGVuZ3RoXG5cblx0XHRmdW5jdGlvbiBlbmNvZGUgKG51bSkge1xuXHRcdFx0cmV0dXJuIGxvb2t1cC5jaGFyQXQobnVtKVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRyaXBsZXRUb0Jhc2U2NCAobnVtKSB7XG5cdFx0XHRyZXR1cm4gZW5jb2RlKG51bSA+PiAxOCAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiAxMiAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiA2ICYgMHgzRikgKyBlbmNvZGUobnVtICYgMHgzRilcblx0XHR9XG5cblx0XHQvLyBnbyB0aHJvdWdoIHRoZSBhcnJheSBldmVyeSB0aHJlZSBieXRlcywgd2UnbGwgZGVhbCB3aXRoIHRyYWlsaW5nIHN0dWZmIGxhdGVyXG5cdFx0Zm9yIChpID0gMCwgbGVuZ3RoID0gdWludDgubGVuZ3RoIC0gZXh0cmFCeXRlczsgaSA8IGxlbmd0aDsgaSArPSAzKSB7XG5cdFx0XHR0ZW1wID0gKHVpbnQ4W2ldIDw8IDE2KSArICh1aW50OFtpICsgMV0gPDwgOCkgKyAodWludDhbaSArIDJdKVxuXHRcdFx0b3V0cHV0ICs9IHRyaXBsZXRUb0Jhc2U2NCh0ZW1wKVxuXHRcdH1cblxuXHRcdC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcblx0XHRzd2l0Y2ggKGV4dHJhQnl0ZXMpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0dGVtcCA9IHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAyKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9PSdcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgMjpcblx0XHRcdFx0dGVtcCA9ICh1aW50OFt1aW50OC5sZW5ndGggLSAyXSA8PCA4KSArICh1aW50OFt1aW50OC5sZW5ndGggLSAxXSlcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDEwKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wID4+IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCAyKSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPSdcblx0XHRcdFx0YnJlYWtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0XG5cdH1cblxuXHRtb2R1bGUuZXhwb3J0cy50b0J5dGVBcnJheSA9IGI2NFRvQnl0ZUFycmF5XG5cdG1vZHVsZS5leHBvcnRzLmZyb21CeXRlQXJyYXkgPSB1aW50OFRvQmFzZTY0XG59KCkpXG4iLCJleHBvcnRzLnJlYWQgPSBmdW5jdGlvbihidWZmZXIsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIG5CaXRzID0gLTcsXG4gICAgICBpID0gaXNMRSA/IChuQnl0ZXMgLSAxKSA6IDAsXG4gICAgICBkID0gaXNMRSA/IC0xIDogMSxcbiAgICAgIHMgPSBidWZmZXJbb2Zmc2V0ICsgaV07XG5cbiAgaSArPSBkO1xuXG4gIGUgPSBzICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBzID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gZUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgZSA9IGUgKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgbSA9IGUgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIGUgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBtTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBtID0gbSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBpZiAoZSA9PT0gMCkge1xuICAgIGUgPSAxIC0gZUJpYXM7XG4gIH0gZWxzZSBpZiAoZSA9PT0gZU1heCkge1xuICAgIHJldHVybiBtID8gTmFOIDogKChzID8gLTEgOiAxKSAqIEluZmluaXR5KTtcbiAgfSBlbHNlIHtcbiAgICBtID0gbSArIE1hdGgucG93KDIsIG1MZW4pO1xuICAgIGUgPSBlIC0gZUJpYXM7XG4gIH1cbiAgcmV0dXJuIChzID8gLTEgOiAxKSAqIG0gKiBNYXRoLnBvdygyLCBlIC0gbUxlbik7XG59O1xuXG5leHBvcnRzLndyaXRlID0gZnVuY3Rpb24oYnVmZmVyLCB2YWx1ZSwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sIGMsXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgcnQgPSAobUxlbiA9PT0gMjMgPyBNYXRoLnBvdygyLCAtMjQpIC0gTWF0aC5wb3coMiwgLTc3KSA6IDApLFxuICAgICAgaSA9IGlzTEUgPyAwIDogKG5CeXRlcyAtIDEpLFxuICAgICAgZCA9IGlzTEUgPyAxIDogLTEsXG4gICAgICBzID0gdmFsdWUgPCAwIHx8ICh2YWx1ZSA9PT0gMCAmJiAxIC8gdmFsdWUgPCAwKSA/IDEgOiAwO1xuXG4gIHZhbHVlID0gTWF0aC5hYnModmFsdWUpO1xuXG4gIGlmIChpc05hTih2YWx1ZSkgfHwgdmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgbSA9IGlzTmFOKHZhbHVlKSA/IDEgOiAwO1xuICAgIGUgPSBlTWF4O1xuICB9IGVsc2Uge1xuICAgIGUgPSBNYXRoLmZsb29yKE1hdGgubG9nKHZhbHVlKSAvIE1hdGguTE4yKTtcbiAgICBpZiAodmFsdWUgKiAoYyA9IE1hdGgucG93KDIsIC1lKSkgPCAxKSB7XG4gICAgICBlLS07XG4gICAgICBjICo9IDI7XG4gICAgfVxuICAgIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgdmFsdWUgKz0gcnQgLyBjO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YWx1ZSArPSBydCAqIE1hdGgucG93KDIsIDEgLSBlQmlhcyk7XG4gICAgfVxuICAgIGlmICh2YWx1ZSAqIGMgPj0gMikge1xuICAgICAgZSsrO1xuICAgICAgYyAvPSAyO1xuICAgIH1cblxuICAgIGlmIChlICsgZUJpYXMgPj0gZU1heCkge1xuICAgICAgbSA9IDA7XG4gICAgICBlID0gZU1heDtcbiAgICB9IGVsc2UgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICBtID0gKHZhbHVlICogYyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gZSArIGVCaWFzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gdmFsdWUgKiBNYXRoLnBvdygyLCBlQmlhcyAtIDEpICogTWF0aC5wb3coMiwgbUxlbik7XG4gICAgICBlID0gMDtcbiAgICB9XG4gIH1cblxuICBmb3IgKDsgbUxlbiA+PSA4OyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBtICYgMHhmZiwgaSArPSBkLCBtIC89IDI1NiwgbUxlbiAtPSA4KTtcblxuICBlID0gKGUgPDwgbUxlbikgfCBtO1xuICBlTGVuICs9IG1MZW47XG4gIGZvciAoOyBlTGVuID4gMDsgYnVmZmVyW29mZnNldCArIGldID0gZSAmIDB4ZmYsIGkgKz0gZCwgZSAvPSAyNTYsIGVMZW4gLT0gOCk7XG5cbiAgYnVmZmVyW29mZnNldCArIGkgLSBkXSB8PSBzICogMTI4O1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID1cblxuICBmaXJzdDogXCJcIlwiXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBZb3VyIGZpcnN0IExvb3BTY3JpcHQuIFNvbWVkYXkgdGhlcmUgd2lsbCBiZSBkb2N1bWVudGF0aW9uIVxuXG50b25lIG5vdGUxXG4gIGR1cmF0aW9uIDI1MFxuICBvY3RhdmUgNFxuICBub3RlIENcblxudG9uZSBiYXNzMVxuICBkdXJhdGlvbiAyNTBcbiAgb2N0YXZlIDFcbiAgbm90ZSBCXG5cbmxvb3AgbG9vcDFcbiAgcGF0dGVybiBub3RlMSB4Li4uLi4uLnguLi4uLi4uXG4gIHBhdHRlcm4gYmFzczEgLi4uLnguLi4uLi4ueC4uLlxuXG5cIlwiXCJcblxuICBub3RlczogXCJcIlwiXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBOb3RlIG92ZXJyaWRlcyFcblxuIyBUcnkgc2V0dGluZyB0aGUgZHVyYXRpb24gdG8gMTAwXG50b25lIG5vdGUxXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxuICBkdXJhdGlvbiAyNTBcblxuIyBTYW1wbGVzIGNhbiBoYXZlIHRoZWlyIG5vdGVzIG92ZXJyaWRkZW4gdG9vIVxuc2FtcGxlIGRpbmdcbiAgc3JjIHNhbXBsZXMvZGluZ19lLndhdlxuICBzcmNub3RlIGVcblxubG9vcCBsb29wMVxuICBwYXR0ZXJuIG5vdGUxIGIuYS5nLmEuYi5iLmIuXG5cbmxvb3AgbG9vcDJcbiAgcGF0dGVybiBkaW5nIGIuYS5nLmEuYi5iLmIuXG5cbnRyYWNrIHNvbmdcbiAgcGF0dGVybiBsb29wMSB4XG4gIHBhdHRlcm4gbG9vcDIgLnhcblxuXCJcIlwiXG5cbiAgbW90dG86IFwiXCJcIlxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgQW4gYXBwcm94aW1hdGlvbiBvZiB0aGUgYmVhdCBmcm9tIERyYWtlJ3MgXCJUaGUgTW90dG9cIlxuXG5icG0gMTAwXG5zZWN0aW9uIEJhc3MgKGluIGEgc2VjdGlvbiB0byBzaGFyZSBBRFNSKVxuICBhZHNyIDAuMDA1IDAuMDUgMC43IDAuMDVcbiAgdG9uZSBiYXNzMVxuICAgIG9jdGF2ZSAxXG4gIHRvbmUgYmFzczJcbiAgICBvY3RhdmUgMlxuXG5zYW1wbGUgY2xhcFxuICBzcmMgc2FtcGxlcy9jbGFwLndhdlxuc2FtcGxlIHNuYXJlXG4gIHNyYyBzYW1wbGVzL3NuYXJlLndhdlxuc2FtcGxlIGhpaGF0XG4gIHNyYyBzYW1wbGVzL2hpaGF0LndhdlxuXG5sb29wIGxvb3AxXG4gIHBhdHRlcm4gaGloYXQgLi54Li4uLi4uLnguLi4uLi4ueC4uLi4uLi54Li4uLi5cbiAgcGF0dGVybiBjbGFwICAuLi4ueC4uLi4uLi54Li4uLi4uLnguLi4uLi4ueC4uLlxuICBwYXR0ZXJuIHNuYXJlIC4uLi4uLnguLi54Li4ueC54Li4uLi4uLi4uLi4uLi4uXG4gIHBhdHRlcm4gYmFzczEgQmJiYmJiLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi5cbiAgcGF0dGVybiBiYXNzMiAuLi4uLi5IaGhoaGhEZGRkZGQuLi4uSGhoaEpqLkpqLlxuXG50cmFjayBzb25nXG4gIHBhdHRlcm4gbG9vcDEgeHh4eFxuXG5cIlwiXCJcblxuICBsZW5ndGg6IFwiXCJcIlxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgU2hvd2luZyBvZmYgdmFyaW91cyBub3RlIGxlbmd0aHMgdXNpbmcgY2FwcyBhbmQgbG93ZXJjYXNlXG4jIEFsc28gc2hvd3Mgd2hhdCBBRFNSIGNhbiBkbyFcblxudG9uZSBub3RlMVxuICBhZHNyIDAuMDA1IDAuMDUgMC43IDAuMDVcblxudG9uZSBub3RlMlxuICAjIE5vdGU6IE9ubHkgdGhlIGZpcnN0IHRvbmUgaGFzIEFEU1JcblxuIyBJZiB5b3UgdXNlIGFueSBsZXR0ZXJzIG90aGVyIHRoYW4gXCJ4XCIgb24gYSB0b25lIHBhdHRlcm4sIHlvdSBvdmVycmlkZSBpdHNcbiMgbm90ZSB3aXRoIHRoZSBub3RlIGxpc3RlZC4gQWxzbywgaWYgeW91IHVzZSBhbnkgY2FwaXRhbCBsZXR0ZXJzIGluIGEgcGF0dGVybixcbiMgeW91IG92ZXJyaWRlIHRoZSBsZW5ndGggb2YgdGhhdCBub3RlIHdpdGggdGhlIG51bWJlciBvZiBtYXRjaGluZyBsb3dlcmNhc2VcbiMgbGV0dGVycyBmb2xsb3dpbmcgaXQuXG5cbmxvb3AgbG9vcDFcbiAgcGF0dGVybiBub3RlMSBHZ2dnZ2dnZ0ZmZmZmZi4uQWFhYUJiYi5DYy4uRC4uLlxuXG5sb29wIGxvb3AyXG4gIHBhdHRlcm4gbm90ZTIgR2dnZ2dnZ2dGZmZmZmYuLkFhYWFCYmIuQ2MuLkQuLi5cblxudHJhY2sgc29uZ1xuICBwYXR0ZXJuIGxvb3AxIHguXG4gIHBhdHRlcm4gbG9vcDIgLnhcblxuXCJcIlwiXG5cbiAgY2hvY29ibzogXCJcIlwiXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBUaGUgQ2hvY29ibyBUaGVtZSAoZmlyc3QgcGFydCBvbmx5KVxuXG5icG0gMTI1XG5cbnNlY3Rpb24gVG9uZSAoaW4gYSBzZWN0aW9uIHRvIHNoYXJlIEFEU1IpXG4gIGFkc3IgMC4wMDUgMC4wNSAwLjcgMC4wNVxuICB0b25lIGNob2NvYm8xXG4gICAgb2N0YXZlIDVcbiAgdG9uZSBjaG9jb2JvMlxuICAgIG9jdGF2ZSA0XG5cbmxvb3AgbG9vcDFcbiBwYXR0ZXJuIGNob2NvYm8xIERkZGQuLi4uLi5EZC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLkQuRS5GZmZmZmYuLi5cbiBwYXR0ZXJuIGNob2NvYm8yIC4uLi5CYkdnRWUuLkJiR2dCYi4uR2cuLkJiYmJiYi5BYUdnR0FHLkYuR2dnZ2dnLkYuR2dHQi4uLi4uLi4uLi4uLi5cblxudHJhY2sgc29uZ1xuICBwYXR0ZXJuIGxvb3AxIHh4XG5cIlwiXCIiLCJmcmVxVGFibGUgPSBbXG4gIHsgIyBPY3RhdmUgMFxuXG4gICAgXCJhXCI6IDI3LjUwMDBcbiAgICBcImxcIjogMjkuMTM1M1xuICAgIFwiYlwiOiAzMC44Njc3XG4gIH1cblxuICB7ICMgT2N0YXZlIDFcbiAgICBcImNcIjogMzIuNzAzMlxuICAgIFwiaFwiOiAzNC42NDc5XG4gICAgXCJkXCI6IDM2LjcwODFcbiAgICBcImlcIjogMzguODkwOVxuICAgIFwiZVwiOiA0MS4yMDM1XG4gICAgXCJmXCI6IDQzLjY1MzZcbiAgICBcImpcIjogNDYuMjQ5M1xuICAgIFwiZ1wiOiA0OC45OTk1XG4gICAgXCJrXCI6IDUxLjkxMzBcbiAgICBcImFcIjogNTUuMDAwMFxuICAgIFwibFwiOiA1OC4yNzA1XG4gICAgXCJiXCI6IDYxLjczNTRcbiAgfVxuXG4gIHsgIyBPY3RhdmUgMlxuICAgIFwiY1wiOiA2NS40MDY0XG4gICAgXCJoXCI6IDY5LjI5NTdcbiAgICBcImRcIjogNzMuNDE2MlxuICAgIFwiaVwiOiA3Ny43ODE3XG4gICAgXCJlXCI6IDgyLjQwNjlcbiAgICBcImZcIjogODcuMzA3MVxuICAgIFwialwiOiA5Mi40OTg2XG4gICAgXCJnXCI6IDk3Ljk5ODlcbiAgICBcImtcIjogMTAzLjgyNlxuICAgIFwiYVwiOiAxMTAuMDAwXG4gICAgXCJsXCI6IDExNi41NDFcbiAgICBcImJcIjogMTIzLjQ3MVxuICB9XG5cbiAgeyAjIE9jdGF2ZSAzXG4gICAgXCJjXCI6IDEzMC44MTNcbiAgICBcImhcIjogMTM4LjU5MVxuICAgIFwiZFwiOiAxNDYuODMyXG4gICAgXCJpXCI6IDE1NS41NjNcbiAgICBcImVcIjogMTY0LjgxNFxuICAgIFwiZlwiOiAxNzQuNjE0XG4gICAgXCJqXCI6IDE4NC45OTdcbiAgICBcImdcIjogMTk1Ljk5OFxuICAgIFwia1wiOiAyMDcuNjUyXG4gICAgXCJhXCI6IDIyMC4wMDBcbiAgICBcImxcIjogMjMzLjA4MlxuICAgIFwiYlwiOiAyNDYuOTQyXG4gIH1cblxuICB7ICMgT2N0YXZlIDRcbiAgICBcImNcIjogMjYxLjYyNlxuICAgIFwiaFwiOiAyNzcuMTgzXG4gICAgXCJkXCI6IDI5My42NjVcbiAgICBcImlcIjogMzExLjEyN1xuICAgIFwiZVwiOiAzMjkuNjI4XG4gICAgXCJmXCI6IDM0OS4yMjhcbiAgICBcImpcIjogMzY5Ljk5NFxuICAgIFwiZ1wiOiAzOTEuOTk1XG4gICAgXCJrXCI6IDQxNS4zMDVcbiAgICBcImFcIjogNDQwLjAwMFxuICAgIFwibFwiOiA0NjYuMTY0XG4gICAgXCJiXCI6IDQ5My44ODNcbiAgfVxuXG4gIHsgIyBPY3RhdmUgNVxuICAgIFwiY1wiOiA1MjMuMjUxXG4gICAgXCJoXCI6IDU1NC4zNjVcbiAgICBcImRcIjogNTg3LjMzMFxuICAgIFwiaVwiOiA2MjIuMjU0XG4gICAgXCJlXCI6IDY1OS4yNTVcbiAgICBcImZcIjogNjk4LjQ1NlxuICAgIFwialwiOiA3MzkuOTg5XG4gICAgXCJnXCI6IDc4My45OTFcbiAgICBcImtcIjogODMwLjYwOVxuICAgIFwiYVwiOiA4ODAuMDAwXG4gICAgXCJsXCI6IDkzMi4zMjhcbiAgICBcImJcIjogOTg3Ljc2N1xuICB9XG5cbiAgeyAjIE9jdGF2ZSA2XG4gICAgXCJjXCI6IDEwNDYuNTBcbiAgICBcImhcIjogMTEwOC43M1xuICAgIFwiZFwiOiAxMTc0LjY2XG4gICAgXCJpXCI6IDEyNDQuNTFcbiAgICBcImVcIjogMTMxOC41MVxuICAgIFwiZlwiOiAxMzk2LjkxXG4gICAgXCJqXCI6IDE0NzkuOThcbiAgICBcImdcIjogMTU2Ny45OFxuICAgIFwia1wiOiAxNjYxLjIyXG4gICAgXCJhXCI6IDE3NjAuMDBcbiAgICBcImxcIjogMTg2NC42NlxuICAgIFwiYlwiOiAxOTc1LjUzXG4gIH1cblxuICB7ICMgT2N0YXZlIDdcbiAgICBcImNcIjogMjA5My4wMFxuICAgIFwiaFwiOiAyMjE3LjQ2XG4gICAgXCJkXCI6IDIzNDkuMzJcbiAgICBcImlcIjogMjQ4OS4wMlxuICAgIFwiZVwiOiAyNjM3LjAyXG4gICAgXCJmXCI6IDI3OTMuODNcbiAgICBcImpcIjogMjk1OS45NlxuICAgIFwiZ1wiOiAzMTM1Ljk2XG4gICAgXCJrXCI6IDMzMjIuNDRcbiAgICBcImFcIjogMzUyMC4wMFxuICAgIFwibFwiOiAzNzI5LjMxXG4gICAgXCJiXCI6IDM5NTEuMDdcbiAgfVxuXG4gIHsgIyBPY3RhdmUgOFxuICAgIFwiY1wiOiA0MTg2LjAxXG4gIH1cbl1cblxubGVnYWxOb3RlUmVnZXggPSAvW2EtbF0vXG5cbmZpbmRGcmVxID0gKG9jdGF2ZSwgbm90ZSkgLT5cbiAgbm90ZSA9IG5vdGUudG9Mb3dlckNhc2UoKVxuICBpZiAob2N0YXZlID49IDApIGFuZCAob2N0YXZlIDwgZnJlcVRhYmxlLmxlbmd0aCkgYW5kIGxlZ2FsTm90ZVJlZ2V4LnRlc3Qobm90ZSlcbiAgICBvY3RhdmVUYWJsZSA9IGZyZXFUYWJsZVtvY3RhdmVdXG4gICAgaWYgb2N0YXZlVGFibGU/IGFuZCBvY3RhdmVUYWJsZVtub3RlXT9cbiAgICAgIHJldHVybiBvY3RhdmVUYWJsZVtub3RlXVxuICByZXR1cm4gNDQwLjBcblxubW9kdWxlLmV4cG9ydHMgPVxuICBmcmVxVGFibGU6IGZyZXFUYWJsZVxuICBmaW5kRnJlcTogZmluZEZyZXFcbiIsIiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBJbXBvcnRzXG5cbntmaW5kRnJlcX0gPSByZXF1aXJlICcuL2ZyZXEnXG5yaWZmd2F2ZSAgID0gcmVxdWlyZSBcIi4vcmlmZndhdmVcIlxuakRhdGFWaWV3ICA9IHJlcXVpcmUgJy4uL2pzL2pkYXRhdmlldydcbmZzICAgICAgICAgPSByZXF1aXJlICdmcydcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIEhlbHBlciBmdW5jdGlvbnNcblxuY2xvbmUgPSAob2JqKSAtPlxuICBpZiBub3Qgb2JqPyBvciB0eXBlb2Ygb2JqIGlzbnQgJ29iamVjdCdcbiAgICByZXR1cm4gb2JqXG5cbiAgaWYgb2JqIGluc3RhbmNlb2YgRGF0ZVxuICAgIHJldHVybiBuZXcgRGF0ZShvYmouZ2V0VGltZSgpKVxuXG4gIGlmIG9iaiBpbnN0YW5jZW9mIFJlZ0V4cFxuICAgIGZsYWdzID0gJydcbiAgICBmbGFncyArPSAnZycgaWYgb2JqLmdsb2JhbD9cbiAgICBmbGFncyArPSAnaScgaWYgb2JqLmlnbm9yZUNhc2U/XG4gICAgZmxhZ3MgKz0gJ20nIGlmIG9iai5tdWx0aWxpbmU/XG4gICAgZmxhZ3MgKz0gJ3knIGlmIG9iai5zdGlja3k/XG4gICAgcmV0dXJuIG5ldyBSZWdFeHAob2JqLnNvdXJjZSwgZmxhZ3MpXG5cbiAgbmV3SW5zdGFuY2UgPSBuZXcgb2JqLmNvbnN0cnVjdG9yKClcblxuICBmb3Iga2V5IG9mIG9ialxuICAgIG5ld0luc3RhbmNlW2tleV0gPSBjbG9uZSBvYmpba2V5XVxuXG4gIHJldHVybiBuZXdJbnN0YW5jZVxuXG5wYXJzZUJvb2wgPSAodikgLT5cbiAgc3dpdGNoIFN0cmluZyh2KVxuICAgIHdoZW4gXCJ0cnVlXCIgdGhlbiB0cnVlXG4gICAgd2hlbiBcInllc1wiIHRoZW4gdHJ1ZVxuICAgIHdoZW4gXCJvblwiIHRoZW4gdHJ1ZVxuICAgIHdoZW4gXCIxXCIgdGhlbiB0cnVlXG4gICAgZWxzZSBmYWxzZVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgSW5kZW50U3RhY2sgLSB1c2VkIGJ5IFBhcnNlclxuXG5jbGFzcyBJbmRlbnRTdGFja1xuICBjb25zdHJ1Y3RvcjogLT5cbiAgICBAc3RhY2sgPSBbMF1cblxuICBwdXNoOiAoaW5kZW50KSAtPlxuICAgIEBzdGFjay5wdXNoIGluZGVudFxuXG4gIHBvcDogLT5cbiAgICBpZiBAc3RhY2subGVuZ3RoID4gMVxuICAgICAgQHN0YWNrLnBvcCgpXG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIHJldHVybiBmYWxzZVxuXG4gIHRvcDogLT5cbiAgICByZXR1cm4gQHN0YWNrW0BzdGFjay5sZW5ndGggLSAxXVxuXG5jb3VudEluZGVudCA9ICh0ZXh0KSAtPlxuICBpbmRlbnQgPSAwXG4gIGZvciBpIGluIFswLi4udGV4dC5sZW5ndGhdXG4gICAgaWYgdGV4dFtpXSA9PSAnXFx0J1xuICAgICAgaW5kZW50ICs9IDhcbiAgICBlbHNlXG4gICAgICBpbmRlbnQrK1xuICByZXR1cm4gaW5kZW50XG5cbiMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuIyBQYXJzZXJcblxuY2xhc3MgUGFyc2VyXG4gIGNvbnN0cnVjdG9yOiAoQGxvZykgLT5cbiAgICBAY29tbWVudFJlZ2V4ID0gL14oW14jXSo/KShcXHMqIy4qKT8kL1xuICAgIEBvbmx5V2hpdGVzcGFjZVJlZ2V4ID0gL15cXHMqJC9cbiAgICBAaW5kZW50UmVnZXggPSAvXihcXHMqKShcXFMuKikkL1xuICAgIEBsZWFkaW5nVW5kZXJzY29yZVJlZ2V4ID0gL15fL1xuICAgIEBoYXNDYXBpdGFsTGV0dGVyc1JlZ2V4ID0gL1tBLVpdL1xuICAgIEBpc05vdGVSZWdleCA9IC9bQS1MYS1sXS9cblxuICAgICMgSC1MIGFyZSB0aGUgYmxhY2sga2V5czpcbiAgICAjICBIIEkgICBKIEsgTFxuICAgICMgQyBEIEUgRiBHIEEgQlxuXG4gICAgQG5hbWVkU3RhdGVzID1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHNyY29jdGF2ZTogNFxuICAgICAgICBzcmNub3RlOiAnYSdcbiAgICAgICAgb2N0YXZlOiA0XG4gICAgICAgIG5vdGU6ICdhJ1xuICAgICAgICB3YXZlOiAnc2luZSdcbiAgICAgICAgYnBtOiAxMjBcbiAgICAgICAgZHVyYXRpb246IDIwMFxuICAgICAgICBiZWF0czogNFxuICAgICAgICB2b2x1bWU6IDEuMFxuICAgICAgICBjbGlwOiB0cnVlXG4gICAgICAgIHJldmVyYjpcbiAgICAgICAgICBkZWxheTogMFxuICAgICAgICAgIGRlY2F5OiAwXG4gICAgICAgIGFkc3I6ICMgbm8tb3AgQURTUiAoZnVsbCAxLjAgc3VzdGFpbilcbiAgICAgICAgICBhOiAwXG4gICAgICAgICAgZDogMFxuICAgICAgICAgIHM6IDFcbiAgICAgICAgICByOiAxXG5cbiAgICAjIGlmIGEga2V5IGlzIHByZXNlbnQgaW4gdGhpcyBtYXAsIHRoYXQgbmFtZSBpcyBjb25zaWRlcmVkIGFuIFwib2JqZWN0XCJcbiAgICBAb2JqZWN0S2V5cyA9XG4gICAgICB0b25lOlxuICAgICAgICB3YXZlOiAnc3RyaW5nJ1xuICAgICAgICBmcmVxOiAnZmxvYXQnXG4gICAgICAgIGR1cmF0aW9uOiAnZmxvYXQnXG4gICAgICAgIGFkc3I6ICdhZHNyJ1xuICAgICAgICBvY3RhdmU6ICdpbnQnXG4gICAgICAgIG5vdGU6ICdzdHJpbmcnXG4gICAgICAgIHZvbHVtZTogJ2Zsb2F0J1xuICAgICAgICBjbGlwOiAnYm9vbCdcbiAgICAgICAgcmV2ZXJiOiAncmV2ZXJiJ1xuXG4gICAgICBzYW1wbGU6XG4gICAgICAgIHNyYzogJ3N0cmluZydcbiAgICAgICAgdm9sdW1lOiAnZmxvYXQnXG4gICAgICAgIGNsaXA6ICdib29sJ1xuICAgICAgICByZXZlcmI6ICdyZXZlcmInXG4gICAgICAgIHNyY29jdGF2ZTogJ2ludCdcbiAgICAgICAgc3Jjbm90ZTogJ3N0cmluZydcbiAgICAgICAgb2N0YXZlOiAnaW50J1xuICAgICAgICBub3RlOiAnc3RyaW5nJ1xuXG4gICAgICBsb29wOlxuICAgICAgICBicG06ICdpbnQnXG4gICAgICAgIGJlYXRzOiAnaW50J1xuXG4gICAgICB0cmFjazoge31cblxuICAgIEBpbmRlbnRTdGFjayA9IG5ldyBJbmRlbnRTdGFja1xuICAgIEBzdGF0ZVN0YWNrID0gW11cbiAgICBAcmVzZXQgJ2RlZmF1bHQnXG4gICAgQG9iamVjdHMgPSB7fVxuICAgIEBvYmplY3QgPSBudWxsXG4gICAgQG9iamVjdFNjb3BlUmVhZHkgPSBmYWxzZVxuXG4gIGlzT2JqZWN0VHlwZTogKHR5cGUpIC0+XG4gICAgcmV0dXJuIEBvYmplY3RLZXlzW3R5cGVdP1xuXG4gIGVycm9yOiAodGV4dCkgLT5cbiAgICBAbG9nLmVycm9yIFwiUEFSU0UgRVJST1IsIGxpbmUgI3tAbGluZU5vfTogI3t0ZXh0fVwiXG5cbiAgcmVzZXQ6IChuYW1lKSAtPlxuICAgIG5hbWUgPz0gJ2RlZmF1bHQnXG4gICAgaWYgbm90IEBuYW1lZFN0YXRlc1tuYW1lXVxuICAgICAgQGVycm9yIFwiaW52YWxpZCByZXNldCBuYW1lOiAje25hbWV9XCJcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIEBzdGF0ZVN0YWNrLnB1c2ggY2xvbmUoQG5hbWVkU3RhdGVzW25hbWVdKVxuICAgIHJldHVybiB0cnVlXG5cbiAgZmxhdHRlbjogKCkgLT5cbiAgICBmbGF0dGVuZWRTdGF0ZSA9IHt9XG4gICAgZm9yIHN0YXRlIGluIEBzdGF0ZVN0YWNrXG4gICAgICBmb3Iga2V5IG9mIHN0YXRlXG4gICAgICAgIGZsYXR0ZW5lZFN0YXRlW2tleV0gPSBzdGF0ZVtrZXldXG4gICAgcmV0dXJuIGZsYXR0ZW5lZFN0YXRlXG5cbiAgdHJhY2U6IChwcmVmaXgpIC0+XG4gICAgcHJlZml4ID89ICcnXG4gICAgQGxvZy52ZXJib3NlIFwidHJhY2U6ICN7cHJlZml4fSBcIiArIEpTT04uc3RyaW5naWZ5KEBmbGF0dGVuKCkpXG5cbiAgY3JlYXRlT2JqZWN0OiAoZGF0YS4uLikgLT5cbiAgICAgIEBmaW5pc2hPYmplY3QoKVxuXG4gICAgICBAb2JqZWN0ID0ge31cbiAgICAgIGZvciBpIGluIFswLi4uZGF0YS5sZW5ndGhdIGJ5IDJcbiAgICAgICAgQG9iamVjdFtkYXRhW2ldXSA9IGRhdGFbaSsxXVxuICAgICAgQG9iamVjdFNjb3BlUmVhZHkgPSB0cnVlXG5cbiAgICAgIGlmIEBvYmplY3QuX3R5cGUgPT0gJ2xvb3AnXG4gICAgICAgIEBvYmplY3QuX3BhdHRlcm5zID0gW11cblxuICAgICAgaWYgQG9iamVjdC5fdHlwZSA9PSAndHJhY2snXG4gICAgICAgIEBvYmplY3QuX3BhdHRlcm5zID0gW11cblxuICAgICAgaWYgQG9iamVjdC5fbmFtZVxuICAgICAgICBAbGFzdE9iamVjdCA9IEBvYmplY3QuX25hbWVcblxuICBmaW5pc2hPYmplY3Q6IC0+XG4gICAgaWYgQG9iamVjdFxuICAgICAgc3RhdGUgPSBAZmxhdHRlbigpXG4gICAgICBmb3Iga2V5IG9mIEBvYmplY3RLZXlzW0BvYmplY3QuX3R5cGVdXG4gICAgICAgIGV4cGVjdGVkVHlwZSA9IEBvYmplY3RLZXlzW0BvYmplY3QuX3R5cGVdW2tleV1cbiAgICAgICAgaWYgc3RhdGVba2V5XT9cbiAgICAgICAgICB2ID0gc3RhdGVba2V5XVxuICAgICAgICAgIEBvYmplY3Rba2V5XSA9IHN3aXRjaCBleHBlY3RlZFR5cGVcbiAgICAgICAgICAgIHdoZW4gJ2ludCcgdGhlbiBwYXJzZUludCh2KVxuICAgICAgICAgICAgd2hlbiAnZmxvYXQnIHRoZW4gcGFyc2VGbG9hdCh2KVxuICAgICAgICAgICAgd2hlbiAnYm9vbCcgdGhlbiBwYXJzZUJvb2wodilcbiAgICAgICAgICAgIGVsc2UgdlxuICAgICAgICAgICMgQGxvZy52ZXJib3NlIFwic2V0dGluZyAje0BvYmplY3QuX25hbWV9J3MgI3trZXl9IHRvIFwiICsgSlNPTi5zdHJpbmdpZnkoQG9iamVjdFtrZXldKVxuXG4gICAgICBAb2JqZWN0c1tAb2JqZWN0Ll9uYW1lXSA9IEBvYmplY3RcbiAgICBAb2JqZWN0ID0gbnVsbFxuXG4gIGNyZWF0aW5nT2JqZWN0VHlwZTogKHR5cGUpIC0+XG4gICAgcmV0dXJuIGZhbHNlIGlmIG5vdCBAb2JqZWN0XG4gICAgcmV0dXJuIGZhbHNlIGlmIG5vdCBAb2JqZWN0Ll90eXBlID09IHR5cGVcbiAgICByZXR1cm4gdHJ1ZVxuXG4gIHB1c2hTY29wZTogLT5cbiAgICBpZiBub3QgQG9iamVjdFNjb3BlUmVhZHlcbiAgICAgIEBlcnJvciBcInVuZXhwZWN0ZWQgaW5kZW50XCJcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIEBvYmplY3RTY29wZVJlYWR5ID0gZmFsc2VcbiAgICBAc3RhdGVTdGFjay5wdXNoIHsgX3Njb3BlOiB0cnVlIH1cbiAgICByZXR1cm4gdHJ1ZVxuXG4gIHBvcFNjb3BlOiAtPlxuICAgIEBmaW5pc2hPYmplY3QoKVxuICAgIGxvb3BcbiAgICAgIGlmIEBzdGF0ZVN0YWNrLmxlbmd0aCA9PSAwXG4gICAgICAgIEBlcnJvciBcInN0YXRlIHN0YWNrIGlzIGVtcHR5ISBzb21ldGhpbmcgYmFkIGhhcyBoYXBwZW5lZFwiXG4gICAgICB0b3AgPSBAc3RhdGVTdGFja1tAc3RhdGVTdGFjay5sZW5ndGggLSAxXVxuICAgICAgYnJlYWsgaWYgdG9wLl9zY29wZT9cbiAgICAgIEBzdGF0ZVN0YWNrLnBvcCgpXG4gICAgQHN0YXRlU3RhY2sucG9wKClcbiAgICByZXR1cm4gdHJ1ZVxuXG4gIHBhcnNlUGF0dGVybjogKHBhdHRlcm4pIC0+XG4gICAgb3ZlcnJpZGVMZW5ndGggPSBAaGFzQ2FwaXRhbExldHRlcnNSZWdleC50ZXN0KHBhdHRlcm4pXG4gICAgaSA9IDBcbiAgICBzb3VuZHMgPSBbXVxuICAgIHdoaWxlIGkgPCBwYXR0ZXJuLmxlbmd0aFxuICAgICAgYyA9IHBhdHRlcm5baV1cbiAgICAgIGlmIGMgIT0gJy4nXG4gICAgICAgIHN5bWJvbCA9IGMudG9Mb3dlckNhc2UoKVxuICAgICAgICBzb3VuZCA9IHsgb2Zmc2V0OiBpIH1cbiAgICAgICAgaWYgQGlzTm90ZVJlZ2V4LnRlc3QoYylcbiAgICAgICAgICBzb3VuZC5ub3RlID0gc3ltYm9sXG4gICAgICAgIGlmIG92ZXJyaWRlTGVuZ3RoXG4gICAgICAgICAgbGVuZ3RoID0gMVxuICAgICAgICAgIGxvb3BcbiAgICAgICAgICAgIG5leHQgPSBwYXR0ZXJuW2krMV1cbiAgICAgICAgICAgIGlmIG5leHQgPT0gc3ltYm9sXG4gICAgICAgICAgICAgIGxlbmd0aCsrXG4gICAgICAgICAgICAgIGkrK1xuICAgICAgICAgICAgICBpZiBpID09IHBhdHRlcm4ubGVuZ3RoXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICBzb3VuZC5sZW5ndGggPSBsZW5ndGhcbiAgICAgICAgc291bmRzLnB1c2ggc291bmRcbiAgICAgIGkrK1xuICAgIHJldHVybiB7XG4gICAgICBwYXR0ZXJuOiBwYXR0ZXJuXG4gICAgICBsZW5ndGg6IHBhdHRlcm4ubGVuZ3RoXG4gICAgICBzb3VuZHM6IHNvdW5kc1xuICAgIH1cblxuICBwcm9jZXNzVG9rZW5zOiAodG9rZW5zKSAtPlxuICAgIGNtZCA9IHRva2Vuc1swXS50b0xvd2VyQ2FzZSgpXG4gICAgaWYgY21kID09ICdyZXNldCdcbiAgICAgIGlmIG5vdCBAcmVzZXQodG9rZW5zWzFdKVxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICBlbHNlIGlmIGNtZCA9PSAnc2VjdGlvbidcbiAgICAgIEBvYmplY3RTY29wZVJlYWR5ID0gdHJ1ZVxuICAgIGVsc2UgaWYgQGlzT2JqZWN0VHlwZShjbWQpXG4gICAgICBAY3JlYXRlT2JqZWN0ICdfdHlwZScsIGNtZCwgJ19uYW1lJywgdG9rZW5zWzFdXG4gICAgZWxzZSBpZiBjbWQgPT0gJ3BhdHRlcm4nXG4gICAgICBpZiBub3QgKEBjcmVhdGluZ09iamVjdFR5cGUoJ2xvb3AnKSBvciBAY3JlYXRpbmdPYmplY3RUeXBlKCd0cmFjaycpKVxuICAgICAgICBAZXJyb3IgXCJ1bmV4cGVjdGVkIHBhdHRlcm4gY29tbWFuZFwiXG4gICAgICAgIHJldHVybiBmYWxzZVxuXG4gICAgICBwYXR0ZXJuID0gQHBhcnNlUGF0dGVybih0b2tlbnNbMl0pXG4gICAgICBwYXR0ZXJuLnNyYyA9IHRva2Vuc1sxXVxuICAgICAgQG9iamVjdC5fcGF0dGVybnMucHVzaCBwYXR0ZXJuXG4gICAgZWxzZSBpZiBjbWQgPT0gJ2Fkc3InXG4gICAgICBAc3RhdGVTdGFja1tAc3RhdGVTdGFjay5sZW5ndGggLSAxXVtjbWRdID1cbiAgICAgICAgYTogcGFyc2VGbG9hdCh0b2tlbnNbMV0pXG4gICAgICAgIGQ6IHBhcnNlRmxvYXQodG9rZW5zWzJdKVxuICAgICAgICBzOiBwYXJzZUZsb2F0KHRva2Vuc1szXSlcbiAgICAgICAgcjogcGFyc2VGbG9hdCh0b2tlbnNbNF0pXG4gICAgZWxzZSBpZiBjbWQgPT0gJ3JldmVyYidcbiAgICAgIEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdW2NtZF0gPVxuICAgICAgICBkZWxheTogcGFyc2VJbnQodG9rZW5zWzFdKVxuICAgICAgICBkZWNheTogcGFyc2VGbG9hdCh0b2tlbnNbMl0pXG4gICAgZWxzZVxuICAgICAgIyBUaGUgYm9yaW5nIHJlZ3VsYXIgY2FzZTogc3Rhc2ggb2ZmIHRoaXMgdmFsdWVcbiAgICAgIGlmIEBsZWFkaW5nVW5kZXJzY29yZVJlZ2V4LnRlc3QoY21kKVxuICAgICAgICBAZXJyb3IgXCJjYW5ub3Qgc2V0IGludGVybmFsIG5hbWVzICh1bmRlcnNjb3JlIHByZWZpeClcIlxuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIEBzdGF0ZVN0YWNrW0BzdGF0ZVN0YWNrLmxlbmd0aCAtIDFdW2NtZF0gPSB0b2tlbnNbMV1cblxuICAgIHJldHVybiB0cnVlXG5cbiAgcGFyc2U6ICh0ZXh0KSAtPlxuICAgIGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJylcbiAgICBAbGluZU5vID0gMFxuICAgIGZvciBsaW5lIGluIGxpbmVzXG4gICAgICBAbGluZU5vKytcbiAgICAgIGxpbmUgPSBsaW5lLnJlcGxhY2UoLyhcXHJcXG58XFxufFxccikvZ20sXCJcIikgIyBzdHJpcCBuZXdsaW5lc1xuICAgICAgbGluZSA9IEBjb21tZW50UmVnZXguZXhlYyhsaW5lKVsxXSAgICAgICAgIyBzdHJpcCBjb21tZW50cyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZVxuICAgICAgY29udGludWUgaWYgQG9ubHlXaGl0ZXNwYWNlUmVnZXgudGVzdChsaW5lKVxuICAgICAgW18sIGluZGVudFRleHQsIGxpbmVdID0gQGluZGVudFJlZ2V4LmV4ZWMgbGluZVxuICAgICAgaW5kZW50ID0gY291bnRJbmRlbnQgaW5kZW50VGV4dFxuXG4gICAgICB0b3BJbmRlbnQgPSBAaW5kZW50U3RhY2sudG9wKClcbiAgICAgIGlmIGluZGVudCA9PSB0b3BJbmRlbnRcbiAgICAgICAgIyBkbyBub3RoaW5nXG4gICAgICBlbHNlIGlmIGluZGVudCA+IHRvcEluZGVudFxuICAgICAgICBAaW5kZW50U3RhY2sucHVzaCBpbmRlbnRcbiAgICAgICAgaWYgbm90IEBwdXNoU2NvcGUoKVxuICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgZWxzZVxuICAgICAgICBsb29wXG4gICAgICAgICAgaWYgbm90IEBpbmRlbnRTdGFjay5wb3AoKVxuICAgICAgICAgICAgQGxvZy5lcnJvciBcIlVuZXhwZWN0ZWQgaW5kZW50ICN7aW5kZW50fSBvbiBsaW5lICN7bGluZU5vfTogI3tsaW5lfVwiXG4gICAgICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgICAgICBpZiBub3QgQHBvcFNjb3BlKClcbiAgICAgICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgICAgIGJyZWFrIGlmIEBpbmRlbnRTdGFjay50b3AoKSA9PSBpbmRlbnRcblxuICAgICAgaWYgbm90IEBwcm9jZXNzVG9rZW5zKGxpbmUuc3BsaXQoL1xccysvKSlcbiAgICAgICAgcmV0dXJuIGZhbHNlXG5cbiAgICB3aGlsZSBAaW5kZW50U3RhY2sucG9wKClcbiAgICAgIEBwb3BTY29wZSgpXG5cbiAgICBAZmluaXNoT2JqZWN0KClcbiAgICByZXR1cm4gdHJ1ZVxuXG4jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiMgUmVuZGVyZXJcblxuIyBJbiBhbGwgY2FzZXMgd2hlcmUgYSByZW5kZXJlZCBzb3VuZCBpcyBnZW5lcmF0ZWQsIHRoZXJlIGFyZSBhY3R1YWxseSB0d28gbGVuZ3Roc1xuIyBhc3NvY2lhdGVkIHdpdGggdGhlIHNvdW5kLiBcInNvdW5kLmxlbmd0aFwiIGlzIHRoZSBcImV4cGVjdGVkXCIgbGVuZ3RoLCB3aXRoIHJlZ2FyZHNcbiMgdG8gdGhlIHR5cGVkLWluIGR1cmF0aW9uIGZvciBpdCBvciBmb3IgZGV0ZXJtaW5pbmcgbG9vcCBvZmZldHMuIFRoZSBvdGhlciBsZW5ndGhcbiMgaXMgdGhlIHNvdW5kLnNhbXBsZXMubGVuZ3RoIChhbHNvIGtub3duIGFzIHRoZSBcIm92ZXJmbG93IGxlbmd0aFwiKSwgd2hpY2ggaXMgdGhlXG4jIGxlbmd0aCB0aGF0IGFjY291bnRzIGZvciB0aGluZ3MgbGlrZSByZXZlcmIgb3IgYW55dGhpbmcgZWxzZSB0aGF0IHdvdWxkIGNhdXNlIHRoZVxuIyBzb3VuZCB0byBzcGlsbCBpbnRvIHRoZSBuZXh0IGxvb3AvdHJhY2suIFRoaXMgYWxsb3dzIGZvciBzZWFtbGVzcyBsb29wcyB0aGF0IGNhblxuIyBwbGF5IGEgbG9uZyBzb3VuZCBhcyB0aGUgZW5kIG9mIGEgcGF0dGVybiwgYW5kIGl0J2xsIGNsZWFubHkgbWl4IGludG8gdGhlIGJlZ2lubmluZ1xuIyBvZiB0aGUgbmV4dCBwYXR0ZXJuLlxuXG5jbGFzcyBSZW5kZXJlclxuICBjb25zdHJ1Y3RvcjogKEBsb2csIEBzYW1wbGVSYXRlLCBAcmVhZExvY2FsRmlsZXMsIEBvYmplY3RzKSAtPlxuICAgIEBzb3VuZENhY2hlID0ge31cblxuICBlcnJvcjogKHRleHQpIC0+XG4gICAgQGxvZy5lcnJvciBcIlJFTkRFUiBFUlJPUjogI3t0ZXh0fVwiXG5cbiAgZ2VuZXJhdGVFbnZlbG9wZTogKGFkc3IsIGxlbmd0aCkgLT5cbiAgICBlbnZlbG9wZSA9IEFycmF5KGxlbmd0aClcbiAgICBBdG9EID0gTWF0aC5mbG9vcihhZHNyLmEgKiBsZW5ndGgpXG4gICAgRHRvUyA9IE1hdGguZmxvb3IoYWRzci5kICogbGVuZ3RoKVxuICAgIFN0b1IgPSBNYXRoLmZsb29yKGFkc3IuciAqIGxlbmd0aClcbiAgICBhdHRhY2tMZW4gPSBBdG9EXG4gICAgZGVjYXlMZW4gPSBEdG9TIC0gQXRvRFxuICAgIHN1c3RhaW5MZW4gPSBTdG9SIC0gRHRvU1xuICAgIHJlbGVhc2VMZW4gPSBsZW5ndGggLSBTdG9SXG4gICAgc3VzdGFpbiA9IGFkc3Iuc1xuICAgIHBlYWtTdXN0YWluRGVsdGEgPSAxLjAgLSBzdXN0YWluXG4gICAgZm9yIGkgaW4gWzAuLi5hdHRhY2tMZW5dXG4gICAgICAjIEF0dGFja1xuICAgICAgZW52ZWxvcGVbaV0gPSBpIC8gYXR0YWNrTGVuXG4gICAgZm9yIGkgaW4gWzAuLi5kZWNheUxlbl1cbiAgICAgICMgRGVjYXlcbiAgICAgIGVudmVsb3BlW0F0b0QgKyBpXSA9IDEuMCAtIChwZWFrU3VzdGFpbkRlbHRhICogKGkgLyBkZWNheUxlbikpXG4gICAgZm9yIGkgaW4gWzAuLi5zdXN0YWluTGVuXVxuICAgICAgIyBTdXN0YWluXG4gICAgICBlbnZlbG9wZVtEdG9TICsgaV0gPSBzdXN0YWluXG4gICAgZm9yIGkgaW4gWzAuLi5yZWxlYXNlTGVuXVxuICAgICAgIyBSZWxlYXNlXG4gICAgICBlbnZlbG9wZVtTdG9SICsgaV0gPSBzdXN0YWluIC0gKHN1c3RhaW4gKiAoaSAvIHJlbGVhc2VMZW4pKVxuICAgIHJldHVybiBlbnZlbG9wZVxuXG4gIHJlbmRlclRvbmU6ICh0b25lT2JqLCBvdmVycmlkZXMpIC0+XG4gICAgb2Zmc2V0ID0gMFxuICAgIGFtcGxpdHVkZSA9IDEwMDAwXG4gICAgaWYgb3ZlcnJpZGVzLmxlbmd0aCA+IDBcbiAgICAgIGxlbmd0aCA9IG92ZXJyaWRlcy5sZW5ndGhcbiAgICBlbHNlXG4gICAgICBsZW5ndGggPSBNYXRoLmZsb29yKHRvbmVPYmouZHVyYXRpb24gKiBAc2FtcGxlUmF0ZSAvIDEwMDApXG4gICAgc2FtcGxlcyA9IEFycmF5KGxlbmd0aClcbiAgICBBID0gMjAwXG4gICAgQiA9IDAuNVxuICAgIGlmIG92ZXJyaWRlcy5ub3RlP1xuICAgICAgZnJlcSA9IGZpbmRGcmVxKHRvbmVPYmoub2N0YXZlLCBvdmVycmlkZXMubm90ZSlcbiAgICBlbHNlIGlmIHRvbmVPYmouZnJlcT9cbiAgICAgIGZyZXEgPSB0b25lT2JqLmZyZXFcbiAgICBlbHNlXG4gICAgICBmcmVxID0gZmluZEZyZXEodG9uZU9iai5vY3RhdmUsIHRvbmVPYmoubm90ZSlcbiAgICBlbnZlbG9wZSA9IEBnZW5lcmF0ZUVudmVsb3BlKHRvbmVPYmouYWRzciwgbGVuZ3RoKVxuICAgIGZvciBpIGluIFswLi4ubGVuZ3RoXVxuICAgICAgcGVyaW9kID0gQHNhbXBsZVJhdGUgLyBmcmVxXG4gICAgICBzaW5lID0gTWF0aC5zaW4ob2Zmc2V0ICsgaSAvIHBlcmlvZCAqIDIgKiBNYXRoLlBJKVxuICAgICAgIyBpZih0b25lT2JqLndhdiA9PSBcInNxdWFyZVwiKVxuICAgICAgIyAgIHNpbmUgPSAoc2luZSA+IDApID8gMSA6IC0xXG4gICAgICBzYW1wbGVzW2ldID0gc2luZSAqIGFtcGxpdHVkZSAqIGVudmVsb3BlW2ldXG5cbiAgICByZXR1cm4ge1xuICAgICAgc2FtcGxlczogc2FtcGxlc1xuICAgICAgbGVuZ3RoOiBzYW1wbGVzLmxlbmd0aFxuICAgIH1cblxuICByZW5kZXJTYW1wbGU6IChzYW1wbGVPYmosIG92ZXJyaWRlcykgLT5cbiAgICB2aWV3ID0gbnVsbFxuXG4gICAgaWYgQHJlYWRMb2NhbEZpbGVzXG4gICAgICBkYXRhID0gZnMucmVhZEZpbGVTeW5jIHNhbXBsZU9iai5zcmNcbiAgICAgIHZpZXcgPSBuZXcgakRhdGFWaWV3KGRhdGEsIDAsIGRhdGEubGVuZ3RoLCB0cnVlKVxuICAgIGVsc2VcbiAgICAgICQuYWpheCB7XG4gICAgICAgIHVybDogc2FtcGxlT2JqLnNyY1xuICAgICAgICBtaW1lVHlwZTogJ3RleHQvcGxhaW47IGNoYXJzZXQ9eC11c2VyLWRlZmluZWQnXG4gICAgICAgIHN1Y2Nlc3M6IChkYXRhKSAtPlxuICAgICAgICAgIHZpZXcgPSBuZXcgakRhdGFWaWV3KGRhdGEsIDAsIGRhdGEubGVuZ3RoLCB0cnVlKVxuICAgICAgICBhc3luYzogZmFsc2VcbiAgICAgIH1cblxuICAgIGlmIG5vdCB2aWV3XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzYW1wbGVzOiBbXVxuICAgICAgICBsZW5ndGg6IDBcbiAgICAgIH1cblxuICAgICMgc2tpcCB0aGUgZmlyc3QgNDAgYnl0ZXNcbiAgICB2aWV3LnNlZWsoNDApXG4gICAgc3ViY2h1bmsyU2l6ZSA9IHZpZXcuZ2V0SW50MzIoKVxuICAgIHNhbXBsZXMgPSBbXVxuICAgIHdoaWxlIHZpZXcudGVsbCgpKzEgPCB2aWV3LmJ5dGVMZW5ndGhcbiAgICAgIHNhbXBsZXMucHVzaCB2aWV3LmdldEludDE2KClcblxuICAgIGlmIChvdmVycmlkZXMubm90ZT8gYW5kIChvdmVycmlkZXMubm90ZSAhPSBzYW1wbGVPYmouc3Jjbm90ZSkpIG9yIChzYW1wbGVPYmoub2N0YXZlICE9IHNhbXBsZU9iai5zcmNvY3RhdmUpXG4gICAgICBvbGRmcmVxID0gZmluZEZyZXEoc2FtcGxlT2JqLnNyY29jdGF2ZSwgc2FtcGxlT2JqLnNyY25vdGUpXG4gICAgICBuZXdmcmVxID0gZmluZEZyZXEoc2FtcGxlT2JqLm9jdGF2ZSwgb3ZlcnJpZGVzLm5vdGUpXG5cbiAgICAgIGZhY3RvciA9IG9sZGZyZXEgLyBuZXdmcmVxXG4gICAgICAjIEBsb2cudmVyYm9zZSBcIm9sZDogI3tvbGRmcmVxfSwgbmV3OiAje25ld2ZyZXF9LCBmYWN0b3I6ICN7ZmFjdG9yfVwiXG5cbiAgICAgICMgVE9ETzogUHJvcGVybHkgcmVzYW1wbGUgaGVyZSB3aXRoIHNvbWV0aGluZyBvdGhlciB0aGFuIFwibmVhcmVzdCBuZWlnaGJvclwiXG4gICAgICByZWxlbmd0aCA9IE1hdGguZmxvb3Ioc2FtcGxlcy5sZW5ndGggKiBmYWN0b3IpXG4gICAgICByZXNhbXBsZXMgPSBBcnJheShyZWxlbmd0aClcbiAgICAgIGZvciBpIGluIFswLi4ucmVsZW5ndGhdXG4gICAgICAgIHJlc2FtcGxlc1tpXSA9IDBcbiAgICAgIGZvciBpIGluIFswLi4ucmVsZW5ndGhdXG4gICAgICAgIHJlc2FtcGxlc1tpXSA9IHNhbXBsZXNbTWF0aC5mbG9vcihpIC8gZmFjdG9yKV1cblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc2FtcGxlczogcmVzYW1wbGVzXG4gICAgICAgIGxlbmd0aDogcmVzYW1wbGVzLmxlbmd0aFxuICAgICAgfVxuICAgIGVsc2VcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHNhbXBsZXM6IHNhbXBsZXNcbiAgICAgICAgbGVuZ3RoOiBzYW1wbGVzLmxlbmd0aFxuICAgICAgfVxuXG4gIHJlbmRlckxvb3A6IChsb29wT2JqKSAtPlxuICAgIGJlYXRDb3VudCA9IDBcbiAgICBmb3IgcGF0dGVybiBpbiBsb29wT2JqLl9wYXR0ZXJuc1xuICAgICAgaWYgYmVhdENvdW50IDwgcGF0dGVybi5sZW5ndGhcbiAgICAgICAgYmVhdENvdW50ID0gcGF0dGVybi5sZW5ndGhcblxuICAgIHNhbXBsZXNQZXJCZWF0ID0gQHNhbXBsZVJhdGUgLyAobG9vcE9iai5icG0gLyA2MCkgLyBsb29wT2JqLmJlYXRzXG4gICAgdG90YWxMZW5ndGggPSBzYW1wbGVzUGVyQmVhdCAqIGJlYXRDb3VudFxuICAgIG92ZXJmbG93TGVuZ3RoID0gdG90YWxMZW5ndGhcblxuICAgIGZvciBwYXR0ZXJuIGluIGxvb3BPYmouX3BhdHRlcm5zXG4gICAgICBzZWN0aW9uQ291bnQgPSBwYXR0ZXJuLmxlbmd0aCAvIDE2XG4gICAgICBvZmZzZXRMZW5ndGggPSBNYXRoLmZsb29yKHRvdGFsTGVuZ3RoIC8gMTYgLyBzZWN0aW9uQ291bnQpXG4gICAgICBmb3Igc291bmQgaW4gcGF0dGVybi5zb3VuZHNcbiAgICAgICAgb3ZlcnJpZGVzID0ge31cbiAgICAgICAgaWYgc291bmQubGVuZ3RoID4gMFxuICAgICAgICAgIG92ZXJyaWRlcy5sZW5ndGggPSBzb3VuZC5sZW5ndGggKiBvZmZzZXRMZW5ndGhcbiAgICAgICAgaWYgc291bmQubm90ZT9cbiAgICAgICAgICBvdmVycmlkZXMubm90ZSA9IHNvdW5kLm5vdGVcbiAgICAgICAgc291bmQuX3JlbmRlciA9IEByZW5kZXIocGF0dGVybi5zcmMsIG92ZXJyaWRlcylcbiAgICAgICAgZW5kID0gKHNvdW5kLm9mZnNldCAqIG9mZnNldExlbmd0aCkgKyBzb3VuZC5fcmVuZGVyLnNhbXBsZXMubGVuZ3RoXG4gICAgICAgIGlmIG92ZXJmbG93TGVuZ3RoIDwgZW5kXG4gICAgICAgICAgb3ZlcmZsb3dMZW5ndGggPSBlbmRcblxuICAgIHNhbXBsZXMgPSBBcnJheShvdmVyZmxvd0xlbmd0aClcbiAgICBmb3IgaSBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxuICAgICAgc2FtcGxlc1tpXSA9IDBcblxuICAgIGZvciBwYXR0ZXJuIGluIGxvb3BPYmouX3BhdHRlcm5zXG4gICAgICBzZWN0aW9uQ291bnQgPSBwYXR0ZXJuLmxlbmd0aCAvIDE2XG4gICAgICBvZmZzZXRMZW5ndGggPSBNYXRoLmZsb29yKHRvdGFsTGVuZ3RoIC8gMTYgLyBzZWN0aW9uQ291bnQpXG5cbiAgICAgIHBhdHRlcm5TYW1wbGVzID0gQXJyYXkob3ZlcmZsb3dMZW5ndGgpXG4gICAgICBmb3IgaSBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxuICAgICAgICBwYXR0ZXJuU2FtcGxlc1tpXSA9IDBcblxuICAgICAgZm9yIHNvdW5kIGluIHBhdHRlcm4uc291bmRzXG4gICAgICAgIHNyY1NvdW5kID0gc291bmQuX3JlbmRlclxuXG4gICAgICAgIG9iaiA9IEBnZXRPYmplY3QocGF0dGVybi5zcmMpXG4gICAgICAgIG9mZnNldCA9IHNvdW5kLm9mZnNldCAqIG9mZnNldExlbmd0aFxuICAgICAgICBjb3B5TGVuID0gc3JjU291bmQuc2FtcGxlcy5sZW5ndGhcbiAgICAgICAgaWYgKG9mZnNldCArIGNvcHlMZW4pID4gb3ZlcmZsb3dMZW5ndGhcbiAgICAgICAgICBjb3B5TGVuID0gb3ZlcmZsb3dMZW5ndGggLSBvZmZzZXRcblxuICAgICAgICBpZiBvYmouY2xpcFxuICAgICAgICAgIGZhZGVDbGlwID0gMjAwICMgZmFkZSBvdXQgb3ZlciB0aGlzIG1hbnkgc2FtcGxlcyBwcmlvciB0byBhIGNsaXAgdG8gYXZvaWQgYSBwb3BcbiAgICAgICAgICBpZiBvZmZzZXQgPiBmYWRlQ2xpcFxuICAgICAgICAgICAgZm9yIGogaW4gWzAuLi5mYWRlQ2xpcF1cbiAgICAgICAgICAgICAgdiA9IHBhdHRlcm5TYW1wbGVzW29mZnNldCAtIGZhZGVDbGlwICsgal1cbiAgICAgICAgICAgICAgcGF0dGVyblNhbXBsZXNbb2Zmc2V0IC0gZmFkZUNsaXAgKyBqXSA9IE1hdGguZmxvb3IodiAqICgoZmFkZUNsaXAgLSBqKSAvIGZhZGVDbGlwKSlcbiAgICAgICAgICBmb3IgaiBpbiBbb2Zmc2V0Li4ub3ZlcmZsb3dMZW5ndGhdXG4gICAgICAgICAgICAjIGNsZWFuIG91dCB0aGUgcmVzdCBvZiB0aGUgc291bmQgdG8gZW5zdXJlIHRoYXQgdGhlIHByZXZpb3VzIG9uZSAod2hpY2ggY291bGQgYmUgbG9uZ2VyKSB3YXMgZnVsbHkgY2xpcHBlZFxuICAgICAgICAgICAgcGF0dGVyblNhbXBsZXNbal0gPSAwXG4gICAgICAgICAgZm9yIGogaW4gWzAuLi5jb3B5TGVuXVxuICAgICAgICAgICAgcGF0dGVyblNhbXBsZXNbb2Zmc2V0ICsgal0gPSBzcmNTb3VuZC5zYW1wbGVzW2pdXG4gICAgICAgIGVsc2VcbiAgICAgICAgICBmb3IgaiBpbiBbMC4uLmNvcHlMZW5dXG4gICAgICAgICAgICBwYXR0ZXJuU2FtcGxlc1tvZmZzZXQgKyBqXSArPSBzcmNTb3VuZC5zYW1wbGVzW2pdXG5cbiAgICAgICMgTm93IGNvcHkgdGhlIGNsaXBwZWQgcGF0dGVybiBpbnRvIHRoZSBmaW5hbCBsb29wXG4gICAgICBmb3IgaiBpbiBbMC4uLm92ZXJmbG93TGVuZ3RoXVxuICAgICAgICBzYW1wbGVzW2pdICs9IHBhdHRlcm5TYW1wbGVzW2pdXG5cbiAgICByZXR1cm4ge1xuICAgICAgc2FtcGxlczogc2FtcGxlc1xuICAgICAgbGVuZ3RoOiB0b3RhbExlbmd0aFxuICAgIH1cblxuICByZW5kZXJUcmFjazogKHRyYWNrT2JqKSAtPlxuICAgIHBpZWNlQ291bnQgPSAwXG4gICAgZm9yIHBhdHRlcm4gaW4gdHJhY2tPYmouX3BhdHRlcm5zXG4gICAgICBpZiBwaWVjZUNvdW50IDwgcGF0dGVybi5wYXR0ZXJuLmxlbmd0aFxuICAgICAgICBwaWVjZUNvdW50ID0gcGF0dGVybi5wYXR0ZXJuLmxlbmd0aFxuXG4gICAgdG90YWxMZW5ndGggPSAwXG4gICAgb3ZlcmZsb3dMZW5ndGggPSAwXG4gICAgcGllY2VUb3RhbExlbmd0aCA9IEFycmF5KHBpZWNlQ291bnQpXG4gICAgcGllY2VPdmVyZmxvd0xlbmd0aCA9IEFycmF5KHBpZWNlQ291bnQpXG4gICAgZm9yIHBpZWNlSW5kZXggaW4gWzAuLi5waWVjZUNvdW50XVxuICAgICAgcGllY2VUb3RhbExlbmd0aFtwaWVjZUluZGV4XSA9IDBcbiAgICAgIHBpZWNlT3ZlcmZsb3dMZW5ndGhbcGllY2VJbmRleF0gPSAwXG4gICAgICBmb3IgcGF0dGVybiBpbiB0cmFja09iai5fcGF0dGVybnNcbiAgICAgICAgaWYgKHBpZWNlSW5kZXggPCBwYXR0ZXJuLnBhdHRlcm4ubGVuZ3RoKSBhbmQgKHBhdHRlcm4ucGF0dGVybltwaWVjZUluZGV4XSAhPSAnLicpXG4gICAgICAgICAgc3JjU291bmQgPSBAcmVuZGVyKHBhdHRlcm4uc3JjKVxuICAgICAgICAgIGlmIHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF0gPCBzcmNTb3VuZC5sZW5ndGhcbiAgICAgICAgICAgIHBpZWNlVG90YWxMZW5ndGhbcGllY2VJbmRleF0gPSBzcmNTb3VuZC5sZW5ndGhcbiAgICAgICAgICBpZiBwaWVjZU92ZXJmbG93TGVuZ3RoW3BpZWNlSW5kZXhdIDwgc3JjU291bmQuc2FtcGxlcy5sZW5ndGhcbiAgICAgICAgICAgIHBpZWNlT3ZlcmZsb3dMZW5ndGhbcGllY2VJbmRleF0gPSBzcmNTb3VuZC5zYW1wbGVzLmxlbmd0aFxuICAgICAgcG9zc2libGVNYXhMZW5ndGggPSB0b3RhbExlbmd0aCArIHBpZWNlT3ZlcmZsb3dMZW5ndGhbcGllY2VJbmRleF1cbiAgICAgIGlmIG92ZXJmbG93TGVuZ3RoIDwgcG9zc2libGVNYXhMZW5ndGhcbiAgICAgICAgb3ZlcmZsb3dMZW5ndGggPSBwb3NzaWJsZU1heExlbmd0aFxuICAgICAgdG90YWxMZW5ndGggKz0gcGllY2VUb3RhbExlbmd0aFtwaWVjZUluZGV4XVxuXG4gICAgc2FtcGxlcyA9IEFycmF5KG92ZXJmbG93TGVuZ3RoKVxuICAgIGZvciBpIGluIFswLi4ub3ZlcmZsb3dMZW5ndGhdXG4gICAgICBzYW1wbGVzW2ldID0gMFxuXG4gICAgZm9yIHBhdHRlcm4gaW4gdHJhY2tPYmouX3BhdHRlcm5zXG4gICAgICB0cmFja09mZnNldCA9IDBcbiAgICAgIHNyY1NvdW5kID0gQHJlbmRlcihwYXR0ZXJuLnNyYywge30pXG4gICAgICBmb3IgcGllY2VJbmRleCBpbiBbMC4uLnBpZWNlQ291bnRdXG4gICAgICAgIGlmIChwaWVjZUluZGV4IDwgcGF0dGVybi5wYXR0ZXJuLmxlbmd0aCkgYW5kIChwYXR0ZXJuLnBhdHRlcm5bcGllY2VJbmRleF0gIT0gJy4nKVxuICAgICAgICAgIGNvcHlMZW4gPSBzcmNTb3VuZC5zYW1wbGVzLmxlbmd0aFxuICAgICAgICAgIGlmICh0cmFja09mZnNldCArIGNvcHlMZW4pID4gb3ZlcmZsb3dMZW5ndGhcbiAgICAgICAgICAgIGNvcHlMZW4gPSBvdmVyZmxvd0xlbmd0aCAtIHRyYWNrT2Zmc2V0XG4gICAgICAgICAgZm9yIGogaW4gWzAuLi5jb3B5TGVuXVxuICAgICAgICAgICAgc2FtcGxlc1t0cmFja09mZnNldCArIGpdICs9IHNyY1NvdW5kLnNhbXBsZXNbal1cblxuICAgICAgICB0cmFja09mZnNldCArPSBwaWVjZVRvdGFsTGVuZ3RoW3BpZWNlSW5kZXhdXG5cbiAgICByZXR1cm4ge1xuICAgICAgc2FtcGxlczogc2FtcGxlc1xuICAgICAgbGVuZ3RoOiB0b3RhbExlbmd0aFxuICAgIH1cblxuICBjYWxjQ2FjaGVOYW1lOiAodHlwZSwgd2hpY2gsIG92ZXJyaWRlcykgLT5cbiAgICBpZiAodHlwZSAhPSAndG9uZScpIGFuZCAodHlwZSAhPSAnc2FtcGxlJylcbiAgICAgIHJldHVybiB3aGljaFxuXG4gICAgbmFtZSA9IHdoaWNoXG4gICAgaWYgb3ZlcnJpZGVzLm5vdGVcbiAgICAgIG5hbWUgKz0gXCIvTiN7b3ZlcnJpZGVzLm5vdGV9XCJcbiAgICBpZiBvdmVycmlkZXMubGVuZ3RoXG4gICAgICBuYW1lICs9IFwiL0wje292ZXJyaWRlcy5sZW5ndGh9XCJcblxuICAgIHJldHVybiBuYW1lXG5cbiAgZ2V0T2JqZWN0OiAod2hpY2gpIC0+XG4gICAgb2JqZWN0ID0gQG9iamVjdHNbd2hpY2hdXG4gICAgaWYgbm90IG9iamVjdFxuICAgICAgQGVycm9yIFwibm8gc3VjaCBvYmplY3QgI3t3aGljaH1cIlxuICAgICAgcmV0dXJuIG51bGxcbiAgICByZXR1cm4gb2JqZWN0XG5cbiAgcmVuZGVyOiAod2hpY2gsIG92ZXJyaWRlcykgLT5cbiAgICBvYmplY3QgPSBAZ2V0T2JqZWN0KHdoaWNoKVxuICAgIGlmIG5vdCBvYmplY3RcbiAgICAgIHJldHVybiBudWxsXG5cbiAgICBjYWNoZU5hbWUgPSBAY2FsY0NhY2hlTmFtZShvYmplY3QuX3R5cGUsIHdoaWNoLCBvdmVycmlkZXMpXG4gICAgaWYgQHNvdW5kQ2FjaGVbY2FjaGVOYW1lXVxuICAgICAgcmV0dXJuIEBzb3VuZENhY2hlW2NhY2hlTmFtZV1cblxuICAgIHNvdW5kID0gc3dpdGNoIG9iamVjdC5fdHlwZVxuICAgICAgd2hlbiAndG9uZScgdGhlbiBAcmVuZGVyVG9uZShvYmplY3QsIG92ZXJyaWRlcylcbiAgICAgIHdoZW4gJ3NhbXBsZScgdGhlbiBAcmVuZGVyU2FtcGxlKG9iamVjdCwgb3ZlcnJpZGVzKVxuICAgICAgd2hlbiAnbG9vcCcgdGhlbiBAcmVuZGVyTG9vcChvYmplY3QpXG4gICAgICB3aGVuICd0cmFjaycgdGhlbiBAcmVuZGVyVHJhY2sob2JqZWN0KVxuICAgICAgZWxzZVxuICAgICAgICBAZXJyb3IgXCJ1bmtub3duIHR5cGUgI3tvYmplY3QuX3R5cGV9XCJcbiAgICAgICAgbnVsbFxuXG4gICAgIyBWb2x1bWVcbiAgICBpZiBvYmplY3Qudm9sdW1lPyBhbmQgKG9iamVjdC52b2x1bWUgIT0gMS4wKVxuICAgICAgZm9yIGkgaW4gWzAuLi5zb3VuZC5zYW1wbGVzLmxlbmd0aF1cbiAgICAgICAgc291bmQuc2FtcGxlc1tpXSAqPSBvYmplY3Qudm9sdW1lXG5cbiAgICAjIFJldmVyYlxuICAgIGlmIG9iamVjdC5yZXZlcmI/IGFuZCAob2JqZWN0LnJldmVyYi5kZWxheSA+IDApXG4gICAgICBkZWxheVNhbXBsZXMgPSBNYXRoLmZsb29yKG9iamVjdC5yZXZlcmIuZGVsYXkgKiBAc2FtcGxlUmF0ZSAvIDEwMDApXG4gICAgICBpZiBzb3VuZC5zYW1wbGVzLmxlbmd0aCA+IGRlbGF5U2FtcGxlc1xuICAgICAgICB0b3RhbExlbmd0aCA9IHNvdW5kLnNhbXBsZXMubGVuZ3RoICsgKGRlbGF5U2FtcGxlcyAqIDgpICMgdGhpcyAqOCBpcyB0b3RhbGx5IHdyb25nLiBOZWVkcyBtb3JlIHRob3VnaHQuXG4gICAgICAgICMgQGxvZy52ZXJib3NlIFwicmV2ZXJiaW5nICN7Y2FjaGVOYW1lfTogI3tkZWxheVNhbXBsZXN9LiBsZW5ndGggdXBkYXRlICN7c291bmQuc2FtcGxlcy5sZW5ndGh9IC0+ICN7dG90YWxMZW5ndGh9XCJcbiAgICAgICAgc2FtcGxlcyA9IEFycmF5KHRvdGFsTGVuZ3RoKVxuICAgICAgICBmb3IgaSBpbiBbMC4uLnNvdW5kLnNhbXBsZXMubGVuZ3RoXVxuICAgICAgICAgIHNhbXBsZXNbaV0gPSBzb3VuZC5zYW1wbGVzW2ldXG4gICAgICAgIGZvciBpIGluIFtzb3VuZC5zYW1wbGVzLmxlbmd0aC4uLnRvdGFsTGVuZ3RoXVxuICAgICAgICAgIHNhbXBsZXNbaV0gPSAwXG4gICAgICAgIGZvciBpIGluIFswLi4uKHRvdGFsTGVuZ3RoIC0gZGVsYXlTYW1wbGVzKV1cbiAgICAgICAgICBzYW1wbGVzW2kgKyBkZWxheVNhbXBsZXNdICs9IE1hdGguZmxvb3Ioc2FtcGxlc1tpXSAqIG9iamVjdC5yZXZlcmIuZGVjYXkpXG4gICAgICAgIHNvdW5kLnNhbXBsZXMgPSBzYW1wbGVzXG5cbiAgICBAbG9nLnZlcmJvc2UgXCJSZW5kZXJlZCAje2NhY2hlTmFtZX0uXCJcbiAgICBAc291bmRDYWNoZVtjYWNoZU5hbWVdID0gc291bmRcbiAgICByZXR1cm4gc291bmRcblxuIyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4jIEV4cG9ydHNcblxucmVuZGVyTG9vcFNjcmlwdCA9IChhcmdzKSAtPlxuICBsb2dPYmogPSBhcmdzLmxvZ1xuICBsb2dPYmoudmVyYm9zZSBcIlBhcnNpbmcuLi5cIlxuICBwYXJzZXIgPSBuZXcgUGFyc2VyKGxvZ09iailcbiAgcGFyc2VyLnBhcnNlIGFyZ3Muc2NyaXB0XG5cbiAgd2hpY2ggPSBhcmdzLndoaWNoXG4gIHdoaWNoID89IHBhcnNlci5sYXN0T2JqZWN0XG5cbiAgaWYgd2hpY2hcbiAgICBzYW1wbGVSYXRlID0gNDQxMDBcbiAgICBsb2dPYmoudmVyYm9zZSBcIlJlbmRlcmluZy4uLlwiXG4gICAgcmVuZGVyZXIgPSBuZXcgUmVuZGVyZXIobG9nT2JqLCBzYW1wbGVSYXRlLCBhcmdzLnJlYWRMb2NhbEZpbGVzLCBwYXJzZXIub2JqZWN0cylcbiAgICBvdXRwdXRTb3VuZCA9IHJlbmRlcmVyLnJlbmRlcih3aGljaCwge30pXG4gICAgaWYgYXJncy5vdXRwdXRGaWxlbmFtZVxuICAgICAgcmV0dXJuIHJpZmZ3YXZlLndyaXRlV0FWIGFyZ3Mub3V0cHV0RmlsZW5hbWUsIHNhbXBsZVJhdGUsIG91dHB1dFNvdW5kLnNhbXBsZXNcbiAgICByZXR1cm4gcmlmZndhdmUubWFrZUJsb2JVcmwoc2FtcGxlUmF0ZSwgb3V0cHV0U291bmQuc2FtcGxlcylcblxuICByZXR1cm4gbnVsbFxuXG5tb2R1bGUuZXhwb3J0cyA9XG4gIHJlbmRlcjogcmVuZGVyTG9vcFNjcmlwdFxuIiwiZnMgPSByZXF1aXJlIFwiZnNcIlxuXG5jbGFzcyBGYXN0QmFzZTY0XG5cbiAgY29uc3RydWN0b3I6IC0+XG4gICAgQGNoYXJzID0gXCJBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWmFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MDEyMzQ1Njc4OSsvPVwiXG4gICAgQGVuY0xvb2t1cCA9IFtdXG4gICAgZm9yIGkgaW4gWzAuLi40MDk2XVxuICAgICAgQGVuY0xvb2t1cFtpXSA9IEBjaGFyc1tpID4+IDZdICsgQGNoYXJzW2kgJiAweDNGXVxuXG4gIGVuY29kZTogKHNyYykgLT5cbiAgICBsZW4gPSBzcmMubGVuZ3RoXG4gICAgZHN0ID0gJydcbiAgICBpID0gMFxuICAgIHdoaWxlIChsZW4gPiAyKVxuICAgICAgbiA9IChzcmNbaV0gPDwgMTYpIHwgKHNyY1tpKzFdPDw4KSB8IHNyY1tpKzJdXG4gICAgICBkc3QrPSB0aGlzLmVuY0xvb2t1cFtuID4+IDEyXSArIHRoaXMuZW5jTG9va3VwW24gJiAweEZGRl1cbiAgICAgIGxlbi09IDNcbiAgICAgIGkrPSAzXG4gICAgaWYgKGxlbiA+IDApXG4gICAgICBuMT0gKHNyY1tpXSAmIDB4RkMpID4+IDJcbiAgICAgIG4yPSAoc3JjW2ldICYgMHgwMykgPDwgNFxuICAgICAgaWYgKGxlbiA+IDEpXG4gICAgICAgIG4yIHw9IChzcmNbKytpXSAmIDB4RjApID4+IDRcbiAgICAgIGRzdCs9IHRoaXMuY2hhcnNbbjFdXG4gICAgICBkc3QrPSB0aGlzLmNoYXJzW24yXVxuICAgICAgaWYgKGxlbiA9PSAyKVxuICAgICAgICBuMz0gKHNyY1tpKytdICYgMHgwRikgPDwgMlxuICAgICAgICBuMyB8PSAoc3JjW2ldICYgMHhDMCkgPj4gNlxuICAgICAgICBkc3QrPSB0aGlzLmNoYXJzW24zXVxuICAgICAgaWYgKGxlbiA9PSAxKVxuICAgICAgICBkc3QrPSAnPSdcbiAgICAgIGRzdCs9ICc9J1xuXG4gICAgcmV0dXJuIGRzdFxuXG5jbGFzcyBSSUZGV0FWRVxuICBjb25zdHJ1Y3RvcjogKEBzYW1wbGVSYXRlLCBAZGF0YSkgLT5cbiAgICBAd2F2ID0gW10gICAgICMgQXJyYXkgY29udGFpbmluZyB0aGUgZ2VuZXJhdGVkIHdhdmUgZmlsZVxuICAgIEBoZWFkZXIgPSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjIE9GRlMgU0laRSBOT1RFU1xuICAgICAgY2h1bmtJZCAgICAgIDogWzB4NTIsMHg0OSwweDQ2LDB4NDZdLCAjIDAgICAgNCAgXCJSSUZGXCIgPSAweDUyNDk0NjQ2XG4gICAgICBjaHVua1NpemUgICAgOiAwLCAgICAgICAgICAgICAgICAgICAgICMgNCAgICA0ICAzNitTdWJDaHVuazJTaXplID0gNCsoOCtTdWJDaHVuazFTaXplKSsoOCtTdWJDaHVuazJTaXplKVxuICAgICAgZm9ybWF0ICAgICAgIDogWzB4NTcsMHg0MSwweDU2LDB4NDVdLCAjIDggICAgNCAgXCJXQVZFXCIgPSAweDU3NDE1NjQ1XG4gICAgICBzdWJDaHVuazFJZCAgOiBbMHg2NiwweDZkLDB4NzQsMHgyMF0sICMgMTIgICA0ICBcImZtdCBcIiA9IDB4NjY2ZDc0MjBcbiAgICAgIHN1YkNodW5rMVNpemU6IDE2LCAgICAgICAgICAgICAgICAgICAgIyAxNiAgIDQgIDE2IGZvciBQQ01cbiAgICAgIGF1ZGlvRm9ybWF0ICA6IDEsICAgICAgICAgICAgICAgICAgICAgIyAyMCAgIDIgIFBDTSA9IDFcbiAgICAgIG51bUNoYW5uZWxzICA6IDEsICAgICAgICAgICAgICAgICAgICAgIyAyMiAgIDIgIE1vbm8gPSAxLCBTdGVyZW8gPSAyLi4uXG4gICAgICBzYW1wbGVSYXRlICAgOiBAc2FtcGxlUmF0ZSwgICAgICAgICAgICMgMjQgICA0ICA4MDAwLCA0NDEwMC4uLlxuICAgICAgYnl0ZVJhdGUgICAgIDogMCwgICAgICAgICAgICAgICAgICAgICAjIDI4ICAgNCAgU2FtcGxlUmF0ZSpOdW1DaGFubmVscypCaXRzUGVyU2FtcGxlLzhcbiAgICAgIGJsb2NrQWxpZ24gICA6IDAsICAgICAgICAgICAgICAgICAgICAgIyAzMiAgIDIgIE51bUNoYW5uZWxzKkJpdHNQZXJTYW1wbGUvOFxuICAgICAgYml0c1BlclNhbXBsZTogMTYsICAgICAgICAgICAgICAgICAgICAjIDM0ICAgMiAgOCBiaXRzID0gOCwgMTYgYml0cyA9IDE2XG4gICAgICBzdWJDaHVuazJJZCAgOiBbMHg2NCwweDYxLDB4NzQsMHg2MV0sICMgMzYgICA0ICBcImRhdGFcIiA9IDB4NjQ2MTc0NjFcbiAgICAgIHN1YkNodW5rMlNpemU6IDAgICAgICAgICAgICAgICAgICAgICAgIyA0MCAgIDQgIGRhdGEgc2l6ZSA9IE51bVNhbXBsZXMqTnVtQ2hhbm5lbHMqQml0c1BlclNhbXBsZS84XG5cbiAgICBAZ2VuZXJhdGUoKVxuXG4gIHUzMlRvQXJyYXk6IChpKSAtPlxuICAgIHJldHVybiBbaSYweEZGLCAoaT4+OCkmMHhGRiwgKGk+PjE2KSYweEZGLCAoaT4+MjQpJjB4RkZdXG5cbiAgdTE2VG9BcnJheTogKGkpIC0+XG4gICAgcmV0dXJuIFtpJjB4RkYsIChpPj44KSYweEZGXVxuXG4gIHNwbGl0MTZiaXRBcnJheTogKGRhdGEpIC0+XG4gICAgciA9IFtdXG4gICAgaiA9IDBcbiAgICBsZW4gPSBkYXRhLmxlbmd0aFxuICAgIGZvciBpIGluIFswLi4ubGVuXVxuICAgICAgcltqKytdID0gZGF0YVtpXSAmIDB4RkZcbiAgICAgIHJbaisrXSA9IChkYXRhW2ldPj44KSAmIDB4RkZcblxuICAgIHJldHVybiByXG5cbiAgZ2VuZXJhdGU6IC0+XG4gICAgQGhlYWRlci5ibG9ja0FsaWduID0gKEBoZWFkZXIubnVtQ2hhbm5lbHMgKiBAaGVhZGVyLmJpdHNQZXJTYW1wbGUpID4+IDNcbiAgICBAaGVhZGVyLmJ5dGVSYXRlID0gQGhlYWRlci5ibG9ja0FsaWduICogQHNhbXBsZVJhdGVcbiAgICBAaGVhZGVyLnN1YkNodW5rMlNpemUgPSBAZGF0YS5sZW5ndGggKiAoQGhlYWRlci5iaXRzUGVyU2FtcGxlID4+IDMpXG4gICAgQGhlYWRlci5jaHVua1NpemUgPSAzNiArIEBoZWFkZXIuc3ViQ2h1bmsyU2l6ZVxuXG4gICAgaWYgQGhlYWRlci5iaXRzUGVyU2FtcGxlID09IDE2XG4gICAgICBAZGF0YSA9IEBzcGxpdDE2Yml0QXJyYXkoQGRhdGEpXG5cbiAgICBAd2F2ID0gQGhlYWRlci5jaHVua0lkLmNvbmNhdChcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuY2h1bmtTaXplKSxcbiAgICAgIEBoZWFkZXIuZm9ybWF0LFxuICAgICAgQGhlYWRlci5zdWJDaHVuazFJZCxcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuc3ViQ2h1bmsxU2l6ZSksXG4gICAgICBAdTE2VG9BcnJheShAaGVhZGVyLmF1ZGlvRm9ybWF0KSxcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIubnVtQ2hhbm5lbHMpLFxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5zYW1wbGVSYXRlKSxcbiAgICAgIEB1MzJUb0FycmF5KEBoZWFkZXIuYnl0ZVJhdGUpLFxuICAgICAgQHUxNlRvQXJyYXkoQGhlYWRlci5ibG9ja0FsaWduKSxcbiAgICAgIEB1MTZUb0FycmF5KEBoZWFkZXIuYml0c1BlclNhbXBsZSksXG4gICAgICBAaGVhZGVyLnN1YkNodW5rMklkLFxuICAgICAgQHUzMlRvQXJyYXkoQGhlYWRlci5zdWJDaHVuazJTaXplKSxcbiAgICAgIEBkYXRhXG4gICAgKVxuICAgIGZiID0gbmV3IEZhc3RCYXNlNjRcbiAgICBAYmFzZTY0RGF0YSA9IGZiLmVuY29kZShAd2F2KVxuICAgIEBkYXRhVVJJID0gJ2RhdGE6YXVkaW8vd2F2O2Jhc2U2NCwnICsgQGJhc2U2NERhdGFcblxuICByYXc6IC0+XG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoQGJhc2U2NERhdGEsIFwiYmFzZTY0XCIpXG5cbndyaXRlV0FWID0gKGZpbGVuYW1lLCBzYW1wbGVSYXRlLCBzYW1wbGVzKSAtPlxuICB3YXZlID0gbmV3IFJJRkZXQVZFIHNhbXBsZVJhdGUsIHNhbXBsZXNcbiAgZnMud3JpdGVGaWxlU3luYyhmaWxlbmFtZSwgd2F2ZS5yYXcoKSlcbiAgcmV0dXJuIHRydWVcblxubWFrZURhdGFVUkkgPSAoc2FtcGxlUmF0ZSwgc2FtcGxlcykgLT5cbiAgd2F2ZSA9IG5ldyBSSUZGV0FWRSBzYW1wbGVSYXRlLCBzYW1wbGVzXG4gIHJldHVybiB3YXZlLmRhdGFVUklcblxuYjY0dG9CbG9iID0gKGI2NERhdGEsIGNvbnRlbnRUeXBlLCBzbGljZVNpemUpIC0+XG4gIGNvbnRlbnRUeXBlID0gY29udGVudFR5cGUgfHwgJydcbiAgc2xpY2VTaXplID0gc2xpY2VTaXplIHx8IDUxMlxuXG4gIGJ5dGVDaGFyYWN0ZXJzID0gYXRvYihiNjREYXRhKVxuICBieXRlQXJyYXlzID0gW11cblxuICBmb3Igb2Zmc2V0IGluIFswLi4uYnl0ZUNoYXJhY3RlcnMubGVuZ3RoXSBieSBzbGljZVNpemVcbiAgICBzbGljZSA9IGJ5dGVDaGFyYWN0ZXJzLnNsaWNlKG9mZnNldCwgb2Zmc2V0ICsgc2xpY2VTaXplKVxuXG4gICAgYnl0ZU51bWJlcnMgPSBuZXcgQXJyYXkoc2xpY2UubGVuZ3RoKVxuICAgIGZvciBpIGluIFswLi4uc2xpY2UubGVuZ3RoXVxuICAgICAgYnl0ZU51bWJlcnNbaV0gPSBzbGljZS5jaGFyQ29kZUF0KGkpXG5cbiAgICBieXRlQXJyYXkgPSBuZXcgVWludDhBcnJheShieXRlTnVtYmVycylcblxuICAgIGJ5dGVBcnJheXMucHVzaChieXRlQXJyYXkpXG5cbiAgYmxvYiA9IG5ldyBCbG9iKGJ5dGVBcnJheXMsIHt0eXBlOiBjb250ZW50VHlwZX0pXG4gIHJldHVybiBibG9iXG5cbm1ha2VCbG9iVXJsID0gKHNhbXBsZVJhdGUsIHNhbXBsZXMpIC0+XG4gIHdhdmUgPSBuZXcgUklGRldBVkUgc2FtcGxlUmF0ZSwgc2FtcGxlc1xuICBibG9iID0gYjY0dG9CbG9iKHdhdmUuYmFzZTY0RGF0YSwgXCJhdWRpby93YXZcIilcbiAgcmV0dXJuIFVSTC5jcmVhdGVPYmplY3RVUkwoYmxvYilcblxubW9kdWxlLmV4cG9ydHMgPVxuICBSSUZGV0FWRTogUklGRldBVkVcbiAgd3JpdGVXQVY6IHdyaXRlV0FWXG4gIG1ha2VEYXRhVVJJOiBtYWtlRGF0YVVSSVxuICBtYWtlQmxvYlVybDogbWFrZUJsb2JVcmxcbiJdfQ==
