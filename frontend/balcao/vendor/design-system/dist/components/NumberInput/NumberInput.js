"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NumberInput = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var react_number_format_1 = __importDefault(require("react-number-format"));
var InputBase_1 = require("../InputBase");
exports.NumberInput = (0, react_1.forwardRef)(function (_a, ref) {
    var _b = _a.prefix, prefix = _b === void 0 ? '' : _b, _c = _a.suffix, suffix = _c === void 0 ? '' : _c, value = _a.value, errorMessage = _a.errorMessage, _d = _a.decimalScale, decimalScale = _d === void 0 ? 0 : _d, _e = _a.maxLength, maxLength = _e === void 0 ? 15 : _e, maxValue = _a.maxValue, minValue = _a.minValue, onChange = _a.onChange, _f = _a.isNumericString, isNumericString = _f === void 0 ? true : _f, _g = _a.allowNegative, allowNegative = _g === void 0 ? false : _g, props = __rest(_a, ["prefix", "suffix", "value", "errorMessage", "decimalScale", "maxLength", "maxValue", "minValue", "onChange", "isNumericString", "allowNegative"]);
    var _h = (0, react_1.useState)(''), errorMsg = _h[0], setErrorMsg = _h[1];
    var handleValueChange = function (values) {
        var floatValue = values.floatValue;
        onChange(Number(floatValue));
        if (maxValue && floatValue && floatValue > maxValue) {
            return setErrorMsg("O valor n\u00E3o pode ser maior que ".concat(maxValue));
        }
        if (minValue && floatValue && floatValue < minValue) {
            return setErrorMsg("O valor n\u00E3o pode ser menor que ".concat(minValue));
        }
        return setErrorMsg('');
    };
    return ((0, jsx_runtime_1.jsx)(react_number_format_1.default, __assign({ _numberFormatRef: ref, prefix: prefix, suffix: suffix, customInput: InputBase_1.InputBase, decimalScale: decimalScale, maxLength: maxLength, onValueChange: handleValueChange, errorMessage: errorMessage || errorMsg, isNumericString: isNumericString, allowNegative: allowNegative, value: value !== null && value !== undefined ? value : '' }, props)));
});
