"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/merge-value";
exports.ids = ["vendor-chunks/merge-value"];
exports.modules = {

/***/ "(ssr)/./node_modules/merge-value/index.js":
/*!*******************************************!*\
  !*** ./node_modules/merge-value/index.js ***!
  \*******************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("\nvar isObject = __webpack_require__(/*! is-extendable */ \"(ssr)/./node_modules/is-extendable/index.js\");\nvar merge = __webpack_require__(/*! mixin-deep */ \"(ssr)/./node_modules/mixin-deep/index.js\");\nvar get = __webpack_require__(/*! get-value */ \"(ssr)/./node_modules/get-value/index.js\");\nvar set = __webpack_require__(/*! set-value */ \"(ssr)/./node_modules/set-value/index.js\");\nmodule.exports = function mergeValue(obj, prop, value) {\n    if (!isObject(obj)) {\n        throw new TypeError(\"expected an object\");\n    }\n    if (typeof prop !== \"string\" || value == null) {\n        return merge.apply(null, arguments);\n    }\n    if (typeof value === \"string\") {\n        set(obj, prop, value);\n        return obj;\n    }\n    var current = get(obj, prop);\n    if (isObject(value) && isObject(current)) {\n        value = merge({}, current, value);\n    }\n    set(obj, prop, value);\n    return obj;\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvbWVyZ2UtdmFsdWUvaW5kZXguanMiLCJtYXBwaW5ncyI6IkFBQUE7QUFFQSxJQUFJQSxXQUFXQyxtQkFBT0EsQ0FBQztBQUN2QixJQUFJQyxRQUFRRCxtQkFBT0EsQ0FBQztBQUNwQixJQUFJRSxNQUFNRixtQkFBT0EsQ0FBQztBQUNsQixJQUFJRyxNQUFNSCxtQkFBT0EsQ0FBQztBQUVsQkksT0FBT0MsT0FBTyxHQUFHLFNBQVNDLFdBQVdDLEdBQUcsRUFBRUMsSUFBSSxFQUFFQyxLQUFLO0lBQ25ELElBQUksQ0FBQ1YsU0FBU1EsTUFBTTtRQUNsQixNQUFNLElBQUlHLFVBQVU7SUFDdEI7SUFFQSxJQUFJLE9BQU9GLFNBQVMsWUFBWUMsU0FBUyxNQUFNO1FBQzdDLE9BQU9SLE1BQU1VLEtBQUssQ0FBQyxNQUFNQztJQUMzQjtJQUVBLElBQUksT0FBT0gsVUFBVSxVQUFVO1FBQzdCTixJQUFJSSxLQUFLQyxNQUFNQztRQUNmLE9BQU9GO0lBQ1Q7SUFFQSxJQUFJTSxVQUFVWCxJQUFJSyxLQUFLQztJQUN2QixJQUFJVCxTQUFTVSxVQUFVVixTQUFTYyxVQUFVO1FBQ3hDSixRQUFRUixNQUFNLENBQUMsR0FBR1ksU0FBU0o7SUFDN0I7SUFFQU4sSUFBSUksS0FBS0MsTUFBTUM7SUFDZixPQUFPRjtBQUNUIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vdmliZS0zZC1jb2RlLy4vbm9kZV9tb2R1bGVzL21lcmdlLXZhbHVlL2luZGV4LmpzPzEyZjAiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG52YXIgaXNPYmplY3QgPSByZXF1aXJlKCdpcy1leHRlbmRhYmxlJyk7XG52YXIgbWVyZ2UgPSByZXF1aXJlKCdtaXhpbi1kZWVwJyk7XG52YXIgZ2V0ID0gcmVxdWlyZSgnZ2V0LXZhbHVlJyk7XG52YXIgc2V0ID0gcmVxdWlyZSgnc2V0LXZhbHVlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbWVyZ2VWYWx1ZShvYmosIHByb3AsIHZhbHVlKSB7XG4gIGlmICghaXNPYmplY3Qob2JqKSkge1xuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ2V4cGVjdGVkIGFuIG9iamVjdCcpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBwcm9wICE9PSAnc3RyaW5nJyB8fCB2YWx1ZSA9PSBudWxsKSB7XG4gICAgcmV0dXJuIG1lcmdlLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gIH1cblxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHNldChvYmosIHByb3AsIHZhbHVlKTtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgdmFyIGN1cnJlbnQgPSBnZXQob2JqLCBwcm9wKTtcbiAgaWYgKGlzT2JqZWN0KHZhbHVlKSAmJiBpc09iamVjdChjdXJyZW50KSkge1xuICAgIHZhbHVlID0gbWVyZ2Uoe30sIGN1cnJlbnQsIHZhbHVlKTtcbiAgfVxuXG4gIHNldChvYmosIHByb3AsIHZhbHVlKTtcbiAgcmV0dXJuIG9iajtcbn07XG4iXSwibmFtZXMiOlsiaXNPYmplY3QiLCJyZXF1aXJlIiwibWVyZ2UiLCJnZXQiLCJzZXQiLCJtb2R1bGUiLCJleHBvcnRzIiwibWVyZ2VWYWx1ZSIsIm9iaiIsInByb3AiLCJ2YWx1ZSIsIlR5cGVFcnJvciIsImFwcGx5IiwiYXJndW1lbnRzIiwiY3VycmVudCJdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/merge-value/index.js\n");

/***/ })

};
;