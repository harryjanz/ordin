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
exports.NumberSpinInput = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var InputBase_1 = require("../InputBase");
var NumberSpinInput_module_scss_1 = __importDefault(require("./NumberSpinInput.module.scss"));
var NumberSpinInput = function (_a) {
    var _b, _c, _d, _e, _f, _g;
    var minValue = _a.minValue, maxValue = _a.maxValue, value = _a.value, onChange = _a.onChange, step = _a.step, _h = _a.stepPage, stepPage = _h === void 0 ? step : _h, onIncrement = _a.onIncrement, onDecrement = _a.onDecrement, _j = _a.typeable, typeable = _j === void 0 ? false : _j, _k = _a.suffix, suffix = _k === void 0 ? '' : _k, _l = _a.prefix, prefix = _l === void 0 ? '' : _l, _m = _a.variant, variant = _m === void 0 ? 'large' : _m, _o = _a.decimalDigits, decimalDigits = _o === void 0 ? 0 : _o, _p = _a.disabled, disabled = _p === void 0 ? false : _p, _q = _a.readOnly, readOnly = _q === void 0 ? false : _q, errorMessage = _a.errorMessage, rest = __rest(_a, ["minValue", "maxValue", "value", "onChange", "step", "stepPage", "onIncrement", "onDecrement", "typeable", "suffix", "prefix", "variant", "decimalDigits", "disabled", "readOnly", "errorMessage"]);
    var _r = (0, react_1.useState)(), activeButton = _r[0], setActiveButton = _r[1];
    var inputref = (0, react_1.useRef)(null);
    var inputValue = function () {
        if (value === undefined || value === null)
            return '';
        var formattedValue = Intl.NumberFormat('pt-BR', {
            style: 'decimal',
            minimumFractionDigits: decimalDigits,
            maximumFractionDigits: decimalDigits,
        }).format(value);
        return "".concat(prefix).concat(formattedValue).concat(suffix);
    };
    var getInputErrorMessage = function () {
        if (errorMessage)
            return errorMessage;
        if (value === undefined || value === null)
            return '';
        if (minValue !== undefined && value < minValue)
            return "O valor n\u00E3o deve ser menor que ".concat(minValue);
        if (maxValue !== undefined && value > maxValue)
            return "O valor n\u00E3o deve ser maior que ".concat(maxValue);
        return '';
    };
    var handleIncrement = function (isPage) {
        if (value === undefined || value === null || disabled || readOnly) {
            onChange(minValue || 0);
            return;
        }
        setActiveButton('INC');
        var valueToIncrement = isPage ? stepPage : step;
        onChange(Number((value + valueToIncrement).toFixed(decimalDigits)));
        if (onIncrement)
            onIncrement();
    };
    var handleDecrement = function (isPage) {
        if (value === undefined || value === null || disabled || readOnly) {
            onChange(minValue || 0);
            return;
        }
        setActiveButton('DEC');
        var valueToDecrement = isPage ? stepPage : step;
        onChange(Number((value - valueToDecrement).toFixed(decimalDigits)));
        if (onDecrement)
            onDecrement();
    };
    var handleKeyDown = function (event) {
        var keyActions = {
            ArrowUp: function () { return handleIncrement(); },
            ArrowDown: function () { return handleDecrement(); },
            PageUp: function () { return handleIncrement(true); },
            PageDown: function () { return handleDecrement(true); },
            Enter: function () { return event.currentTarget.blur(); },
            Home: function () { return minValue !== undefined && onChange(minValue); },
            End: function () { return maxValue !== undefined && onChange(maxValue); },
            Backspace: function () {
                if (!typeable)
                    event.preventDefault();
                handleBackspace();
            },
        };
        if (keyActions[event.key]) {
            event.preventDefault();
            keyActions[event.key]();
        }
    };
    var handleKeyUp = function (event) {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(event.key)) {
            setActiveButton(undefined);
        }
    };
    var handleBackspace = function () {
        var getSelectedText = function () {
            if (!inputref.current)
                return '';
            var start = inputref.current.selectionStart || 0;
            var end = inputref.current.selectionEnd || 0;
            return inputref.current.value.substring(start, end);
        };
        if (value === undefined || value === null) {
            return;
        }
        var sliceEnd = getSelectedText().length === inputValue().length ? 0 : -1;
        var newValue = inputValue().replace(/\D/g, '').slice(0, sliceEnd);
        if (newValue === '') {
            onChange(undefined);
            return;
        }
        if (decimalDigits) {
            onChange(Number("".concat(newValue.slice(0, -decimalDigits), ".").concat(newValue.slice(-decimalDigits))));
            return;
        }
        onChange(Number(newValue));
    };
    var handleInputChange = function (event) {
        var newValue = event.target.value
            .replace(prefix, '')
            .replace(suffix, '')
            .replace(/\D/g, '');
        if (newValue === '') {
            onChange(undefined);
            return;
        }
        if (decimalDigits) {
            onChange(Number("".concat(newValue.slice(0, -decimalDigits), ".").concat(newValue.slice(-decimalDigits))));
            return;
        }
        onChange(Number(newValue));
    };
    return ((0, jsx_runtime_1.jsxs)(InputBase_1.InputBase, __assign({ ref: inputref, value: inputValue(), variant: variant, _isTypeable: typeable, disabled: disabled, readOnly: readOnly, onKeyDown: handleKeyDown, onKeyUp: handleKeyUp, errorMessage: getInputErrorMessage(), onChange: function (event) { return handleInputChange(event); } }, rest, { children: [(0, jsx_runtime_1.jsx)("button", __assign({ "data-testid": "increment-button", className: (0, classnames_1.default)(NumberSpinInput_module_scss_1.default['ds-number-spin-input__button'], NumberSpinInput_module_scss_1.default["ds-number-spin-input__button--".concat(variant)], (_b = {}, _b[NumberSpinInput_module_scss_1.default['ds-number-spin-input__button--disabled']] = disabled, _b), (_c = {}, _c[NumberSpinInput_module_scss_1.default['ds-number-spin-input__button--readonly']] = readOnly, _c), (_d = {},
                    _d[NumberSpinInput_module_scss_1.default['ds-number-spin-input__button--active']] = activeButton === 'INC',
                    _d)), onMouseLeave: function () { return setActiveButton(undefined); }, type: "button", title: "Incrementar", onClick: function () { return handleIncrement(); } }, { children: (0, jsx_runtime_1.jsx)("i", { className: "icon icon-arrow-up" }) })), (0, jsx_runtime_1.jsx)("button", __assign({ "data-testid": "decrement-button", className: (0, classnames_1.default)(NumberSpinInput_module_scss_1.default['ds-number-spin-input__button'], NumberSpinInput_module_scss_1.default["ds-number-spin-input__button--".concat(variant)], (_e = {}, _e[NumberSpinInput_module_scss_1.default['ds-number-spin-input__button--disabled']] = disabled, _e), (_f = {}, _f[NumberSpinInput_module_scss_1.default['ds-number-spin-input__button--readonly']] = readOnly, _f), (_g = {},
                    _g[NumberSpinInput_module_scss_1.default['ds-number-spin-input__button--active']] = activeButton === 'DEC',
                    _g)), onMouseLeave: function () { return setActiveButton(undefined); }, type: "button", title: "Decrementar", onClick: function () { return handleDecrement(); } }, { children: (0, jsx_runtime_1.jsx)("i", { className: "icon icon-arrow-down" }) }))] })));
};
exports.NumberSpinInput = NumberSpinInput;
