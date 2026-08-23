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
exports.CurrencyInput = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var react_number_format_1 = __importDefault(require("react-number-format"));
var InputBase_1 = require("../InputBase");
exports.CurrencyInput = (0, react_1.forwardRef)(function (_a, ref) {
    var maxValue = _a.maxValue, minValue = _a.minValue, errorMessage = _a.errorMessage, helperMessage = _a.helperMessage, value = _a.value, onChange = _a.onChange, _b = _a.prefix, prefix = _b === void 0 ? 'R$ ' : _b, props = __rest(_a, ["maxValue", "minValue", "errorMessage", "helperMessage", "value", "onChange", "prefix"]);
    var _c = (0, react_1.useState)(''), errorMsg = _c[0], setErrorMsg = _c[1];
    var handleValueChange = function (values) {
        var floatValue = values.floatValue;
        if (!floatValue) {
            onChange(0);
            return setErrorMsg('');
        }
        var calculatedValue = Number((floatValue / 100).toFixed(2));
        onChange(calculatedValue);
        if (maxValue && calculatedValue && calculatedValue > maxValue) {
            return setErrorMsg("O valor n\u00E3o pode ser maior que R$ ".concat(maxValue));
        }
        if (minValue && calculatedValue && calculatedValue < minValue) {
            return setErrorMsg("O valor n\u00E3o pode ser menor que R$ ".concat(minValue));
        }
        return setErrorMsg('');
    };
    var currencyFormatter = function (value) {
        if (!Number(value))
            return '';
        var amount = Number((parseInt(value, 10) / 100).toFixed(2)).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
        });
        return "".concat(prefix, " ").concat(amount);
    };
    return ((0, jsx_runtime_1.jsx)(react_number_format_1.default, __assign({ _numberFormatRef: ref, allowLeadingZeros: true, customInput: InputBase_1.InputBase, allowedDecimalSeparators: [','], allowNegative: false, decimalScale: 2, errorMessage: errorMsg || errorMessage, helperMessage: helperMessage, isNumericString: true, fixedDecimalScale: true, prefix: prefix, value: value !== null && value !== undefined ? (value * 100).toFixed(2) : '', onValueChange: function (values) { return handleValueChange(values); }, format: currencyFormatter }, props)));
});
