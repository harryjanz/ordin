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
exports.TextArea = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var TextArea_module_scss_1 = __importDefault(require("./TextArea.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
exports.TextArea = (0, react_1.forwardRef)(function (_a, ref) {
    var _b, _c, _d, _e;
    var label = _a.label, _f = _a.helperMessage, helperMessage = _f === void 0 ? '' : _f, _g = _a.errorMessage, errorMessage = _g === void 0 ? '' : _g, _h = _a.variant, variant = _h === void 0 ? 'large' : _h, maxLength = _a.maxLength, value = _a.value, onChange = _a.onChange, _j = _a.autoSize, autoSize = _j === void 0 ? false : _j, _k = _a.resizeable, resizeable = _k === void 0 ? false : _k, _l = _a.rows, rows = _l === void 0 ? 3 : _l, props = __rest(_a, ["label", "helperMessage", "errorMessage", "variant", "maxLength", "value", "onChange", "autoSize", "resizeable", "rows"]);
    var internalRef = (0, react_1.useRef)(null);
    var _m = (0, react_1.useState)('auto'), textAreaHeight = _m[0], setTextAreaHeight = _m[1];
    var _o = (0, react_1.useState)('auto'), parentHeight = _o[0], setParentHeight = _o[1];
    var _p = (0, react_1.useState)(''), currentValue = _p[0], setCurrentValue = _p[1];
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    (0, react_1.useImperativeHandle)(ref, function () { return internalRef.current; });
    (0, react_1.useEffect)(function () {
        var _a, _b;
        if (internalRef && autoSize) {
            setParentHeight("".concat((_a = internalRef.current) === null || _a === void 0 ? void 0 : _a.scrollHeight, "px"));
            setTextAreaHeight("".concat((_b = internalRef.current) === null || _b === void 0 ? void 0 : _b.scrollHeight, "px"));
        }
    }, [currentValue, autoSize, internalRef]);
    var onChangeHandler = function (event) {
        setTextAreaHeight('auto');
        setCurrentValue(event.target.value);
        if (onChange) {
            onChange(event);
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(TextArea_module_scss_1.default['ds-textarea__wrapper']) }, { children: [(0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(TextArea_module_scss_1.default['ds-textarea__container'], (_b = {},
                    _b[TextArea_module_scss_1.default['ds-textarea__container--error']] = !!errorMessage,
                    _b), TextArea_module_scss_1.default[theme]), style: {
                    minHeight: parentHeight,
                } }, { children: [(0, jsx_runtime_1.jsx)("textarea", __assign({ className: (0, classnames_1.default)(TextArea_module_scss_1.default['ds-textarea__field'], TextArea_module_scss_1.default["ds-textarea__field--".concat(variant)], (_c = {},
                            _c[TextArea_module_scss_1.default['ds-textarea__field--resizeable']] = resizeable,
                            _c), (_d = {}, _d[TextArea_module_scss_1.default['ds-textarea__field--nolabel']] = !label, _d), TextArea_module_scss_1.default[theme]), maxLength: maxLength, value: value, ref: internalRef, rows: rows, style: {
                            height: textAreaHeight,
                        }, onChange: onChangeHandler }, props)), !!label && ((0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(TextArea_module_scss_1.default['ds-textarea__label_internal'], TextArea_module_scss_1.default["ds-textarea__label_internal--".concat(variant)], (_e = {},
                            _e[TextArea_module_scss_1.default['ds-textarea__label_internal--error']] = !!errorMessage,
                            _e), TextArea_module_scss_1.default[theme]) }, { children: label })))] })), errorMessage && ((0, jsx_runtime_1.jsxs)("span", __assign({ className: (0, classnames_1.default)(TextArea_module_scss_1.default['ds-textarea__error_message'], TextArea_module_scss_1.default[theme]) }, { children: [(0, jsx_runtime_1.jsx)("i", { className: "icon-alert-circle" }), errorMessage] }))), !errorMessage && ((0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(TextArea_module_scss_1.default['ds-textarea__help_text'], TextArea_module_scss_1.default[theme]) }, { children: maxLength
                    ? "".concat(maxLength - String(value || '').length, "/").concat(maxLength, " caracteres")
                    : helperMessage })))] })));
});
