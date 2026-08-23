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
exports.Toggle = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var Toggle_module_scss_1 = __importDefault(require("./Toggle.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
function Toggle(_a) {
    var _b, _c;
    var name = _a.name, label = _a.label, _d = _a.labelPosition, labelPosition = _d === void 0 ? 'right' : _d, checked = _a.checked, _e = _a.disabled, disabled = _e === void 0 ? false : _e, onChange = _a.onChange, props = __rest(_a, ["name", "label", "labelPosition", "checked", "disabled", "onChange"]);
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ className: Toggle_module_scss_1.default['ds-toggle'], "data-testid": "toggle" }, { children: [(0, jsx_runtime_1.jsxs)("label", __assign({ htmlFor: name, className: (0, classnames_1.default)(Toggle_module_scss_1.default['ds-toggle__label'], (_b = {},
                    _b[Toggle_module_scss_1.default['ds-toggle__label--invert']] = labelPosition === 'left',
                    _b)) }, { children: [(0, jsx_runtime_1.jsx)("input", __assign({ id: name, className: (0, classnames_1.default)(Toggle_module_scss_1.default['ds-toggle__check'], Toggle_module_scss_1.default[theme]), type: "checkbox", name: name, onChange: onChange, checked: checked, disabled: disabled }, props)), (0, jsx_runtime_1.jsx)("span", { className: (0, classnames_1.default)(Toggle_module_scss_1.default['ds-toggle__switch'], Toggle_module_scss_1.default[theme]) })] })), label && ((0, jsx_runtime_1.jsx)("label", __assign({ className: (0, classnames_1.default)(Toggle_module_scss_1.default['ds-toggle__text'], (_c = {}, _c[Toggle_module_scss_1.default['ds-toggle__text--disabled']] = disabled, _c), Toggle_module_scss_1.default[theme]), htmlFor: name }, { children: label })))] })));
}
exports.Toggle = Toggle;
