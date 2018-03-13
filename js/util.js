// System-wide javascript environment library.
//
// Concerns are utility functions and browser compatibility/polyfills.

/* global alert, console, JSON */

// ** Polyfills ** //

(function () {
    'use strict';

    // Production steps of ECMA-262, Edition 5, 15.4.4.18
    // Reference: http://es5.github.io/#x15.4.4.18
    if (typeof Array.prototype.forEach !== 'function') {
        Array.prototype.forEach = function(callback, thisArg) {
            /* jshint bitwise: false */
            var T, k;

            if (this === null || this === undefined) {
                throw new TypeError(' this is null or not defined');
            }

            // 1. Let O be the result of calling ToObject passing the |this| value
            // as the argument.
            var O = Object(this);

            // 2. Let lenValue be the result of calling the Get internal method of
            //     O with the argument "length".
            // 3. Let len be ToUint32(lenValue).
            var len = O.length >>> 0;

            // 4. If IsCallable(callback) is false, throw a TypeError exception.
            // See: http://es5.github.com/#x9.11
            if (typeof callback !== 'function') {
                throw new TypeError(callback + ' is not a function');
            }

            // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
            if (arguments.length > 1) {
                T = thisArg;
            }

            // 6. Let k be 0
            k = 0;

            // 7. Repeat, while k < len
            while (k < len) {

                var kValue;

                // a. Let Pk be ToString(k).
                //     This is implicit for LHS operands of the in operator
                // b. Let kPresent be the result of calling the HasProperty
                //     internal method of O with argument Pk. This step can be
                //     combined with c
                // c. If kPresent is true, then
                if (k in O) {

                    // i. Let kValue be the result of calling the Get internal
                    //     method of O with argument Pk.
                    kValue = O[k];

                    // ii. Call the Call internal method of callback with T as the
                    //      this value and argument list containing kValue, k,
                    //      and O.
                    callback.call(T, kValue, k, O);
                }
                // d. Increase k by 1.
                k += 1;
            }
            // 8. return undefined
        };
    }

    if (typeof Array.prototype.filter !== 'function') {
        Array.prototype.filter = function (fun, thisp) {
            if (!this) {
                throw new TypeError();
            }
            var objects = Object(this);
            if (typeof fun !== 'function') {
                throw new TypeError();
            }
            var res = [], i;
            for (i in objects) {
                if (objects.hasOwnProperty(i)) {
                    if (fun.call(thisp, objects[i], i, objects)) {
                        res.push(objects[i]);
                    }
                }
            }
            return res;
        };
    }

    // The find() method returns a value of the first element in the array that
    // satisfies the provided testing function. Otherwise undefined is returned.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find
    if (!Array.prototype.find) {
      Object.defineProperty(Array.prototype, 'find', {
        value: function (predicate) {
          /* jshint bitwise: false */
          if (this == null) {
            throw new TypeError('Array.prototype.find called on null or undefined');
          }
          if (typeof predicate !== 'function') {
            throw new TypeError('predicate must be a function');
          }
          var list = Object(this);
          var length = list.length >>> 0;
          var thisArg = arguments[1];
          var value;

          for (var i = 0; i < length; i++) {
            value = list[i];
            if (predicate.call(thisArg, value, i, list)) {
              return value;
            }
          }
          return undefined;
        }
      });
    }

    if (typeof Array.prototype.indexOf !== 'function') {
        Array.prototype.indexOf = function (element, from) {
            from = Number(from) || 0;
            from = (from < 0) ? Math.ceil(from) : Math.floor(from);
            if (from < 0) {
                from += this.length;
            }
            for (from; from < this.length; from += 1) {
                if (this[from] === element) {
                    return from;
                }
            }
            return -1;
        };
    }

    // Hilariously, splice is broken in IE. Fix it.
    // http://stackoverflow.com/questions/8332969/ie-8-slice-not-working
    var originalSplice = Array.prototype.splice;
    Array.prototype.splice = function (start, deleteCount) {
        // convert arguments to a real Array
        var args = Array.prototype.slice.call(arguments);
        // IE requires deleteCount; set default value if it doesn't exist
        if (deleteCount === undefined) {
            args[1] = this.length - start;
        }
        // call the original function with the patched arguments
        return originalSplice.apply(this, args);
    };

    // Reduce is present pretty much everywhere but IE8.
    // Production steps of ECMA-262, Edition 5, 15.4.4.21
    // Reference: http://es5.github.io/#x15.4.4.21
    if (typeof Array.prototype.reduce !== 'function') {
        Array.prototype.reduce = function(callback /*, initialValue*/) {
            /* jshint eqeqeq: false, eqnull: true, bitwise: false */
            /* jshint plusplus: false */
            if (this == null) {
                throw new TypeError('Array.prototype.reduce called on null or undefined');
            }
            if (typeof callback !== 'function') {
                throw new TypeError(callback + ' is not a function');
            }
            var t = Object(this), len = t.length >>> 0, k = 0, value;
            if (arguments.length == 2) {
                value = arguments[1];
            } else {
                while (k < len && !(k in t)) {
                    k++;
                }
                if (k >= len) {
                    throw new TypeError('Reduce of empty array with no initial value');
                }
                value = t[k++];
            }
            for (; k < len; k++) {
                if (k in t) {
                    value = callback(value, t[k], k, t);
                }
            }
            return value;
        };
    }

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/every
    if (typeof Array.prototype.every !== 'function') {
        Array.prototype.every = function(callbackfn, thisArg) {
            var T, k;
            if (this == null) {
                throw new TypeError('this is null or not defined');
            }
            // 1. Let O be the result of calling ToObject passing the this
            //        value as the argument.
            var O = Object(this);
            // 2. Let lenValue be the result of calling the Get internal method
            //        of O with the argument "length".
            // 3. Let len be ToUint32(lenValue).
            var len = O.length >>> 0;
            // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
            if (typeof callbackfn !== 'function') {
                throw new TypeError();
            }
            // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
            if (arguments.length > 1) {
                T = thisArg;
            }
            // 6. Let k be 0.
            k = 0;
            // 7. Repeat, while k < len
            while (k < len) {
                var kValue;
                // a. Let Pk be ToString(k).
                //     This is implicit for LHS operands of the in operator
                // b. Let kPresent be the result of calling the HasProperty internal
                //        method of O with argument Pk.
                //     This step can be combined with c
                // c. If kPresent is true, then
                if (k in O) {
                    // i. Let kValue be the result of calling the Get internal method
                    //        of O with argument Pk.
                    kValue = O[k];
                    // ii. Let testResult be the result of calling the Call internal method
                    //         of callbackfn with T as the this value and argument list
                    //         containing kValue, k, and O.
                    var testResult = callbackfn.call(T, kValue, k, O);
                    // iii. If ToBoolean(testResult) is false, return false.
                    if (!testResult) {
                        return false;
                    }
                }
                k++;
            }
            return true;
        };
    }

    // Production steps of ECMA-262, Edition 5, 15.4.4.17
    // Reference: http://es5.github.io/#x15.4.4.17
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/some
    if (!Array.prototype.some) {
        Array.prototype.some = function(fun/*, thisArg*/) {

            if (this == null) {
                throw new TypeError('Array.prototype.some called on null or undefined');
            }

            if (typeof fun !== 'function') {
                throw new TypeError();
            }

            var t = Object(this);
            var len = t.length >>> 0;

            var thisArg = arguments.length >= 2 ? arguments[1] : void 0;
            for (var i = 0; i < len; i++) {
                if (i in t && fun.call(thisArg, t[i], i, t)) {
                    return true;
                }
            }

            return false;
        };
    }

    // Polyfill of Object.create for IE8. The real thing is much fancier,
    // including "property descriptors", which are some kind of crazy alien
    // species with strange powers. But we don't need to use them.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create
    if (typeof Object.create !== 'function') {
        var F = function () {};
        Object.create = function (o) {
            if (arguments.length > 1) {
                throw new Error('Second argument not supported');
            }
            if (typeof o !== 'object') {
                throw new TypeError('Argument must be an object');
            }
            F.prototype = o;
            return new F();
        };
    }

    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/values
    // https://github.com/tc39/proposal-object-values-entries/blob/master/polyfill.js
    if (!Object.values) {
	      Object.values = function values(O) {
		        return Array.prototype.reduce(Object.keys(O), (v, k) => Array.prototype.concat(v, typeof k === 'string' && Object.prototype.propertyIsEnumerable(O, k) ? [O[k]] : []), []);
	      };
    }

    // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
    if (!Object.keys) {
        Object.keys = (function() {
            'use strict';
            var hasOwnProperty = Object.prototype.hasOwnProperty,
                hasDontEnumBug = !({ toString: null }).propertyIsEnumerable('toString'),
                dontEnums = [
                    'toString',
                    'toLocaleString',
                    'valueOf',
                    'hasOwnProperty',
                    'isPrototypeOf',
                    'propertyIsEnumerable',
                    'constructor'
                ],
                dontEnumsLength = dontEnums.length;

            return function(obj) {
                if (typeof obj !== 'function' && (typeof obj !== 'object' || obj === null)) {
                    throw new TypeError('Object.keys called on non-object');
                }

                var result = [], prop, i;

                for (prop in obj) {
                    if (hasOwnProperty.call(obj, prop)) {
                        result.push(prop);
                    }
                }

                if (hasDontEnumBug) {
                    for (i = 0; i < dontEnumsLength; i++) {
                        if (hasOwnProperty.call(obj, dontEnums[i])) {
                            result.push(dontEnums[i]);
                        }
                    }
                }
                return result;
            };
        }());
    }

    if (typeof String.prototype.trim !== 'function') {
        String.prototype.trim = function () {
            return this.replace(/^\s+|\s+$/g, '');
        };
    }

    // Not implemented in IE. Just like sanity isn't implemented in IE.
    // Note that this outputs the date in UTC! Might not produce what you expect!
    if (typeof Date.prototype.toISOString !== 'function') {
        var pad = function pad(number) {
            var r = String(number);
            if (r.length === 1) {
                r = '0' + r;
            }
            return r;
        };
        Date.prototype.toISOString = function () {
            return this.getUTCFullYear() +
                '-' + pad(this.getUTCMonth() + 1) +
                '-' + pad(this.getUTCDate()) +
                'T' + pad(this.getUTCHours()) +
                ':' + pad(this.getUTCMinutes()) +
                ':' + pad(this.getUTCSeconds()) +
                '.' + String((this.getUTCMilliseconds() / 1000).toFixed(3)).slice(2, 5) +
                'Z';
        };
    }

    if (typeof Function.prototype.bind !== 'function') {
        Function.prototype.bind = function (oThis) {
            if (typeof this !== 'function') {
                // closest thing possible to the ECMAScript 5
                // internal IsCallable function
                throw new TypeError("Function.prototype.bind - what is trying " +
                    "to be bound is not callable");
            }

            var aArgs = Array.prototype.slice.call(arguments, 1),
                toBind = this,
                Noop = function () {},
                bound = function () {
                    return toBind.apply(
                        this instanceof Noop && oThis ? this : oThis,
                        aArgs.concat(Array.prototype.slice.call(arguments))
                    );
                };

            Noop.prototype = this.prototype;
            bound.prototype = new Noop();

            return bound;
        };
    }

    // IE doesn't always have console.log, and, like the piece of fossilized
    // dinosaur dung that it is, will break when it encounters one. So put in a
    // dummy.
    if (!window.console) {
        window.console = {
            error: function (msg) {},
            warn: function (msg) {},
            log: function () {},
            debug: function () {}
        };
    } else if (!window.console.debug) {
        // in ie 10, console exists, but console.debug doesn't!!
        window.console.debug = function () {};
    }
}());

// ** Datatype extension ** //

// Functions that aren't in the spec, but are useful in native prototypes.

// The includes() method determines whether an array includes a certain element,
// returning true or false as appropriate.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes
Array.prototype.includes = function(searchElement /*, fromIndex*/) {
    'use strict';
    if (this == null) {
        throw new TypeError('Array.prototype.includes called on null or undefined');
    }

    var O = Object(this);
    var len = parseInt(O.length, 10) || 0;
    if (len === 0) {
        return false;
    }
    var n = parseInt(arguments[1], 10) || 0;
    var k;
    if (n >= 0) {
        k = n;
    } else {
        k = len + n;
        if (k < 0) {k = 0;}
    }
    var currentElement;
    while (k < len) {
        currentElement = O[k];
        if (searchElement === currentElement ||
           (searchElement !== searchElement && currentElement !== currentElement)) { // NaN !== NaN
            return true;
        }
        k++;
    }
    return false;
};

// Alias for legacy code
Array.prototype.contains = Array.prototype.includes;

Array.prototype.last = function () {
    'use strict';
    return this[this.length - 1];
};

// Removes the first instance of x within a, matching done by Array.indexOf().
// If x is not found, does nothing.
Array.prototype.remove  = function (x) {
    'use strict';
    var i = this.indexOf(x);
    if (i !== -1) { this.splice(i, 1); }
    return this;
};

Array.prototype.removeIndices = function (indices) {
    'use strict';
    return this.filter(function (array, index) {
        return indices.indexOf(index) < 0;
    });
};

// See http://ejohn.org/blog/partial-functions-in-javascript/
Function.prototype.partial = function () {
    'use strict';
    var fn = this, args = Array.prototype.slice.call(arguments), i;
    return function () {
        var arg = 0;
        for (i = 0; i < args.length && arg < arguments.length; i += 1) {
            if (args[i] === undefined) {
                args[i] = arguments[arg];
                arg += 1;
            }
        }
        return fn.apply(this, args);
    };
};

// This method lets you determine whether or not a string includes another string.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/includes
String.prototype.includes = function(search, start) {
    'use strict';
    if (typeof start !== 'number') {
        start = 0;
    }

    if (start + search.length > this.length) {
        return false;
    } else {
        return this.indexOf(search, start) !== -1;
    }
};

// Alias for legacy code
String.prototype.contains = String.prototype.includes;

// ** Util Module ** //

var util = (function () {
    'use strict';

    var util = {};  // to be returned/exported

    var productionDomain;

    util.arrayUnique = function (a) {
        var unique = [], i;
        for (i = 0; i < a.length; i += 1) {
            if (unique.indexOf(a[i]) === -1) {
                unique.push(a[i]);
            }
        }
        return unique;
    };

    util.arrayEqual = function (x, y) {
        if (x.length !== y.length) {
            return false;
        }
        var i;
        for (i = 0; i < x.length; i += 1) {
            if (x[i] !== y[i]) {
                return false;
            }
        }
        return true;
    };

    util.getDuplicatedValues = function (arr) {
        // Use an object as a hash map to check if a given value has been
        // encoutered before.
        // "An object property name can be any valid JavaScript string, or
        // anything that can be converted to a string, including the empty
        // string."
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Working_with_Objects#Objects_and_properties
        // N.B. Not tested on sparse arrays.
        // Returns: unique array of values which occur more than once.

        // Caching vars and avoiding function-based loops in favor of speed.
        var seenValues = {};
        var duplicatedValues = [];
        var len = arr.length;  // cache length for fewer lookups in the loop.
        var val;
        for (var x = 0; x < len; x += 1) {
            // Some evidence that `in` is faster than hasOwnProperty(), but it
            // scans the full prototype chain, which we definitely don't want.
            val = arr[x];
            if (seenValues.hasOwnProperty(val)) {
                if (seenValues[val] === 'once') {
                    duplicatedValues.push(val);
                    seenValues[val] = 'more than once';
                }
            } else {
                seenValues[val] = 'once';
            }
        }
        return duplicatedValues;
    };

    util.getDuplicateIndices = function (arr) {
        // Use an object as a hash map to check if a given value has been
        // encoutered before.
        // "An object property name can be any valid JavaScript string, or
        // anything that can be converted to a string, including the empty
        // string."
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Working_with_Objects#Objects_and_properties
        // N.B. Not tested on sparse arrays.
        // Returns: array of indicies of the given array which contain values
        // that have been encountered  before, i.e. NOT the index of the
        // original occurence of the value.

        // Caching vars and avoiding function-based loops in favor of speed.
        var seenValues = {};
        var duplicateIndices = [];
        var len = arr.length;  // cache length for fewer lookups in the loop.
        var val;
        for (var x = 0; x < len; x += 1) {
            // Some evidence that `in` is faster than hasOwnProperty(), but it
            // scans the full prototype chain, which we definitely don't want.
            val = arr[x];
            if (seenValues.hasOwnProperty(val)) {
                duplicateIndices.push(x);
            } else {
                seenValues[val] = 'found';
            }
        }
        return duplicateIndices;
    };

    util.allIndicesOf = function (arr, val, strict) {
        // Like native .indexOf(), but returns all matching indices.
        // strict - bool, default true, uses strict comparison.

        strict = strict === undefined ? true : strict;

        // Caching vars and avoiding function-based loops in favor of speed.
        var indices = [];
        var len = arr.length;
        for (var x = 0; x < len; x += 1) {
            if (strict) {
                if (arr[x] === val) {
                    indices.push(x);
                }
            } else {
                /* jshint eqeqeq: false */
                if (arr[x] == val) {
                    indices.push(x);
                }
            }
        }
        return indices;
    };

    util.setProductionDomain = function (domain) {
        var urlParser = document.createElement('a');

        // We need to set the protocol before assigning it to href below or else
        // it'll be treated as a relative path and hostname will prepend with
        // the current environment's protocol *and* domain.
        domain = '//' + domain; // shortcut to use current protocol

        urlParser.href = domain;
        if (!urlParser.hostname) {
            throw new Error("Invalid domain: " + domain);
        }
        productionDomain = urlParser.hostname;
    };

    util.isDevelopment = function () {
        if (productionDomain === undefined) {
            throw new Error("production domain not set");
        }
        var match = window.location.href.includes('//' + productionDomain);
        if (!match) {
            if (window.debug) {
                window.console.warn(
                    "Detected development environment. This function " +
                    "considers only " + productionDomain + " to be " +
                    "production.");
            }
            return true;
        }
        else {
            return false;
        }
    };

    util.indexBy = function (arrayOfObjects, property) {
        var index = {};
        arrayOfObjects.forEach(function (o) {
            var v = o[property];
            index[v] = o;
        });
        return index;
    };

    util.listBy = function (arrayOfObjects, property) {
        var index = {};
        arrayOfObjects.forEach(function (o) {
            var v = o[property];
            util.initProp(index, v, []);
            index[v].push(o);
        });
        return index;
    };

    // Breaks on capital letters only. Not tested with numbers, etc.
    // Standing defaults to false.
    util.camelToSeparated = function (camel, separator, standing) {
        if (standing !== true) { standing = false; }
        var regexp = /[A-Z]/g,
            breakPoints = [],
            substrings = [],
            match;
        while ((match = regexp.exec(camel)) !== null) {
            breakPoints.push(regexp.lastIndex);
        }
        breakPoints.forEach(function (breakPoint, index) {
            var previousBreak = index ? breakPoints[index - 1] - 1 : 0;
            substrings.push(camel.slice(previousBreak, breakPoint - 1).toLowerCase());
        });
        substrings.push(camel.slice(breakPoints.last() - 1).toLowerCase());

        // If this is StandingCamel (as opposed to drinkingCamel), ignore the
        // first break point.
        if (standing) {
            substrings.shift();
        }

        return substrings.join(separator);
    };

    // Breaks on given character only. Not tested with numbers, etc.
    util.separatedToCamel = function (s, separator) {
        var chunks = s.split(separator),
            x;
        for (x = 1; x < chunks.length; x += 1) {
            chunks[x] = chunks[x].charAt(0).toUpperCase() + chunks[x].substring(1);
        }
        return chunks.join('');
    };

    // Read query string parameters as a javascript object.
    //
    // Not tested for:
    //
    // * Mixing bracketed and non-bracketed keys
    // * Indexed brackets
    // * Nested lists
    //
    // Some examples (See unit tests below for full details):
    //
    // | query string |       result       |
    // |--------------|--------------------|
    // | undefined    | uses current URL   |
    // | ?            | {}                 |
    // | ?a           | {a: undefined}     |
    // | ?a=          | {a: undefined}     |
    // | ?a=1&b=2     | {a: 1, b: 2}       |
    // | a=1&b=2      | {a: 1, b: 2}       |
    // | ?a[]=1&b=2   | {a: [1], b: 2}     |
    // | ?a=1&a=2     | {a: [1, 2]}        |
    // | ?a[]=1&a[]=2 | {a: [1, 2]}        |
    // | ?a[]=1&a=2   | undefined behavior |
    // | ?a[1]=1      | undefined behavior |
    // | ?a[][]=1     | undefined behavior |

    util.queryStringToObject = function (queryString) {
        var params = {};
        // Allow for easy invocation in the default case.
        if (queryString === undefined) {
            queryString = window.location.search;
        }
        // Leading question mark optional.
        if (queryString.charAt(0) === '?') {
            queryString = queryString.substring(1);
        }
        // Quick return for empty query string.
        if (queryString === '') {
            return params;
        }
        // Separate the query string into key-value pairs.
        // Be careful with split! ''.split('&') gets you ['']
        var pairStrings = queryString.indexOf('&') === -1 ?
            [queryString] : queryString.split('&');
        // Add each key-value pair to the params object.
        pairStrings.forEach(function (pairStr) {
            // Split up the key and value, decoding URL escaping.
            var pair = pairStr.split('='),
                key = decodeURIComponent(pair[0]),
                value = pair[1] ? decodeURIComponent(pair[1]) : undefined,
                // A key becomes a list if it repeats or it ends in [].
                keyIsList = false;
            // Check for bracket notation.
            if (key.substr(-2) === '[]') {
                keyIsList = true;
                key = key.substr(0, key.length - 2);
            }
            // Check for repeats.
            if (key in params && !(params[key] instanceof Array)) {
                keyIsList = true;
                params[key] = [params[key]];
            }
            // Lists keys need to be pushed, not assigned.
            if (keyIsList) {
                // Never-before-seen bracketed keys need a list initialized.
                if (!(key in params)) {
                    params[key] = [];
                }
                // Pushing undefined does "set" that index in the array. It's
                // cleaner to not push it if the key has no value.
                if (value !== undefined) {
                    params[key].push(value);
                }
            } else {
                // Simple assignment for non-list keys.
                params[key] = value;
            }
        });
        return params;
    };

    // Query string unit tests. Returns map of test names to success boolean.
    (function (f) {
        var tests = [
            function normalNonRepeated() {
                var p = f('?foo=bar&baz=quz');
                return p.foo === 'bar' && p.baz === 'quz';
            },
            function normalNonRepeatedWithoutQuestionMark() {
                var p = f('foo=bar&baz=quz');
                return p.foo === 'bar' && p.baz === 'quz';
            },
            function empty() {
                var p = f('?');
                return p !== null && p !== undefined && p.constructor === Object;
            },
            function valuelessWithEquals() {
                var p = f('?foo=&baz=quz');
                return p.foo === undefined && p.baz === 'quz';
            },
            function valuelessWithEqualsSimple() {
                var p = f('?foo=');
                return p.foo === undefined;
            },
            function valuelessWithoutEquals() {
                var p = f('?foo&baz=quz');
                return p.foo === undefined && p.baz === 'quz';
            },
            function valuelessWithoutEqualsSimple() {
                var p = f('?foo');
                return p.foo === undefined;
            },
            function repeatedWithoutBrackets() {
                var p = f('?foo=bar1&foo=bar2&baz=quz');
                return p.foo[0] === 'bar1' && p.foo[1] === 'bar2' && p.baz === 'quz';
            },
            function repeatedWithBrackets() {
                var p = f('?foo[]=bar1&foo[]=bar2&baz=quz');
                return p.foo[0] === 'bar1' && p.foo[1] === 'bar2' && p.baz === 'quz';
            },
            function decodesUrlComponents() {
                var p = f('?%E3%81%BB%E3%81%92=%E3%81%BB%E3%81%92');
                return p['ほげ'] === 'ほげ';
            }
        ];
        var results = {};
        tests.forEach(function (testFn) {
            var success = false;
            try {
                success = testFn();
            } catch (e) {}
            results[testFn.name] = success;
            if (!success) {
                console.error("Test for mm.queryStringToObject() failed:",
                              testFn.name);
            }
        });
        return results;
    }(util.queryStringToObject));

    util.queryString = function (key, value) {
        // Use to access or write to the query string (search) of the current URL.
        // Note that writing will result in a page refresh. If no arguments are
        // given, returns the whole query string as a javascript object.
        var queryDict = util.queryStringToObject(window.location.search);

        if (key === undefined) {
            return queryDict;
        } else if (value === undefined) {
            return queryDict[key];
        } else {
            queryDict[key] = value;
            window.location.search = util.buildQueryString(queryDict);
        }
    };

    util.forEachObj = function (obj, f, thisObj) {
        Object.keys(obj).forEach(function (k, i) {
            f.call(thisObj, k, obj[k]);
        });
    };

    util.mapObj = function (obj, f, thisObj) {
        var results = [];
        Object.keys(obj).forEach(function (k, i) {
            var r = f.call(thisObj, k, obj[k]);
            results.push(r);
        });
        return results;
    };

    // Converts an object of key-value pairs into a url query string
    // (the part after the '?').
    util.buildQueryString = function (obj) {
        return util.mapObj(obj, function (k, v) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(v);
        }).join('&');
    };

    util.initProp = function (o, p, v) {
        if (o[p] === undefined) {
            o[p] = v;
        }
    };

    // Validates if the provided string is numeric
    // http://stackoverflow.com/a/1830844
    util.isStringNumeric = function (s) {
        return !isNaN(parseFloat(s)) && isFinite(s);
    }

    util.randomString = function (length) {
        // Code is ugly b/c cam originally wrote this in coffeescript.
        var chars, l, lowercase, n, numerals, uppercase;
        numerals = (function () {
            var _i, _results;
            _results = [];
            for (n = _i = 0; _i <= 9; n = _i, _i += 1) {
                _results.push(n);
            }
            return _results;
        }());
        uppercase = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K',
                     'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V',
                     'W', 'X', 'Y', 'Z'];
        lowercase = (function () {
            var _i, _len, _results;
            _results = [];
            for (_i = 0, _len = uppercase.length; _i < _len; _i += 1) {
                l = uppercase[_i];
                _results.push(l.toLowerCase());
            }
            return _results;
        }());
        chars = numerals.concat(uppercase).concat(lowercase);
        return (function () {
            var _i, _results;
            _results = [];
            for (_i = 1; _i <= length; _i += 1) {
                _results.push(chars[Math.floor(Math.random() * 62)]);
            }
            return _results;
        }()).join('');
    };

    util.range = function (min, max, step, inclusiveOrExclusive) {
        if (!['inclusive', 'exclusive'].includes(inclusiveOrExclusive)) {
            inclusiveOrExclusive = 'exclusive';
        }

        var args = Array.prototype.slice.call(arguments);
        if (args.length === 1) {
            min = 0;
            max = args[0];
            step = 1;
        }
        if (!step) {
            step = 1;
        }
        if (inclusiveOrExclusive === 'inclusive') {
            max += 1;
        }
        var input = [];
        for (var i = min; i < max; i += step) {
            input.push(i);
        }
        return input;
    };

    util.getKind = function (uid) {
        return uid.split('_')[0];
    };

    // Show the number of angular watchers on a page.
    // See http://www.airpair.com/angularjs/posts/top-10-mistakes-angularjs-developers-make#oTHtkJzXtJyJuemV.99
    util.countWatchers = function (root) {
        root = root === undefined ? $('html') : $(root);
        var watchers = [];
        var f = function (element) {
            if (element.data().hasOwnProperty('$scope')) {
                angular.forEach(element.data().$scope.$$watchers, function (watcher) {
                    watchers.push(watcher);
                });
            }
            angular.forEach(element.children(), function (childElement) {
                f($(childElement));
            });
        };
        f(root);
        return watchers.length;
    };

    // Blocks backspace key except in the case of textareas and text inputs to
    // prevent user navigation.
    // http://stackoverflow.com/questions/1495219/how-can-i-prevent-the-backspace-key-from-navigating-back#answer-7895814
    util.preventBackspaceNavigation = function () {
        $(document).keydown(function (e) {
            var preventKeyPress;
            if (e.keyCode === 8) {
                var d = e.srcElement || e.target;
                switch (d.tagName.toUpperCase()) {
                case 'TEXTAREA':
                    preventKeyPress = d.readOnly || d.disabled;
                    break;
                case 'INPUT':
                    preventKeyPress = d.readOnly || d.disabled ||
                        (d.attributes.type && $.inArray(d.attributes.type.value.toLowerCase(), ['radio', 'checkbox', 'submit', 'button']) >= 0);
                    break;
                case 'DIV':
                    preventKeyPress = d.readOnly || d.disabled || !(d.attributes.contentEditable && d.attributes.contentEditable.value === 'true');
                    break;
                default:
                    preventKeyPress = true;
                    break;
                }
            } else {
                preventKeyPress = false;
            }

            if (preventKeyPress) {
                e.preventDefault();
            }
        });
    };

    // Search string will match the subject string as long as the letters are
    // in the right order. Any gaps are ignored. This works like Sublime Text's
    // goto anything field.
    util.gappedMatch = function (search, subject) {
        search = search.toLowerCase().replace(/\s/g, '');
        // Turn 'chgo' into 'c.*h.*g.*o', which will match 'Chicago'.
        var regexStr = Array.prototype.slice.call(search).join('.*');
        var regex = new RegExp(regexStr, 'i');
        return regex.test(subject);
    };

    return util;
}());
