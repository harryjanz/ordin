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
exports.InputBase = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var InputBase_module_scss_1 = __importDefault(require("./InputBase.module.scss"));
require("../../core/icons/icons.css");
var ThemeProvider_1 = require("../ThemeProvider");
var LinkButton_1 = require("../LinkButton");
exports.InputBase = (0, react_1.forwardRef)(function (_a, ref) {
    var _b, _c, _d, _e, _f, _g;
    var type = _a.type, value = _a.value, label = _a.label, _h = _a.errorMessage, errorMessage = _h === void 0 ? '' : _h, _j = _a.helperMessage, helperMessage = _j === void 0 ? '' : _j, _k = _a.disabled, disabled = _k === void 0 ? false : _k, _l = _a.placeholder, placeholder = _l === void 0 ? '' : _l, _m = _a.icon, icon = _m === void 0 ? '' : _m, _o = _a.variant, variant = _o === void 0 ? 'large' : _o, _p = _a.readOnly, readOnly = _p === void 0 ? false : _p, _q = _a.loading, loading = _q === void 0 ? false : _q, _r = _a._isTypeable, _isTypeable = _r === void 0 ? true : _r, onActionIconClick = _a.onActionIconClick, _numberFormatRef = _a._numberFormatRef, children = _a.children, props = __rest(_a, ["type", "value", "label", "errorMessage", "helperMessage", "disabled", "placeholder", "icon", "variant", "readOnly", "loading", "_isTypeable", "onActionIconClick", "_numberFormatRef", "children"]);
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    var inputComplement = children || ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [icon && !loading && onActionIconClick && ((0, jsx_runtime_1.jsx)("div", __assign({ className: (0, classnames_1.default)(InputBase_module_scss_1.default['ds-icon_button']) }, { children: (0, jsx_runtime_1.jsx)(LinkButton_1.LinkButton, { "data-testid": "icon-linkButton", label: "", onClick: onActionIconClick, icon: icon }) }))), icon && !loading && !onActionIconClick && ((0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)("icon-".concat(icon), InputBase_module_scss_1.default[theme]) })), loading && (0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)('icon-loading', InputBase_module_scss_1.default[theme]) })] }));
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(InputBase_module_scss_1.default['ds-input__wrapper'], InputBase_module_scss_1.default["ds-input__wrapper--".concat(variant)]) }, { children: [(0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(InputBase_module_scss_1.default['ds-input__container'], InputBase_module_scss_1.default["ds-input__container--".concat(variant)], (_b = {}, _b[InputBase_module_scss_1.default['ds-input__container--disabled']] = disabled, _b), (_c = {}, _c[InputBase_module_scss_1.default['ds-input__container--error']] = !!errorMessage, _c), (_d = {}, _d[InputBase_module_scss_1.default["ds-input__container--readonly"]] = readOnly, _d), (_e = {}, _e[InputBase_module_scss_1.default["ds-input__container--loading"]] = loading, _e), InputBase_module_scss_1.default[theme]) }, { children: [(0, jsx_runtime_1.jsx)("input", __assign({ ref: ref || _numberFormatRef, type: type, value: value, disabled: disabled, placeholder: placeholder, readOnly: readOnly || !_isTypeable, className: (0, classnames_1.default)(InputBase_module_scss_1.default['ds-input__field'], InputBase_module_scss_1.default["ds-input__field--".concat(variant)], (_f = {}, _f[InputBase_module_scss_1.default['ds-input__field--nolabel']] = !label, _f), (_g = {}, _g[InputBase_module_scss_1.default['ds-input__field--noicon']] = !icon || icon === '', _g), InputBase_module_scss_1.default[theme]) }, props)), label && ((0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(InputBase_module_scss_1.default['ds-input__label'], InputBase_module_scss_1.default["ds-input__label--".concat(variant)], InputBase_module_scss_1.default[theme]) }, { children: label }))), inputComplement] })), errorMessage ? ((0, jsx_runtime_1.jsxs)("span", __assign({ className: (0, classnames_1.default)(InputBase_module_scss_1.default['ds-input__error'], InputBase_module_scss_1.default[theme]) }, { children: [(0, jsx_runtime_1.jsx)("i", { className: "icon-alert-circle" }), errorMessage] }))) : (helperMessage && ((0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(InputBase_module_scss_1.default['ds-input__helper-message'], InputBase_module_scss_1.default[theme]) }, { children: helperMessage }))))] })));
});
