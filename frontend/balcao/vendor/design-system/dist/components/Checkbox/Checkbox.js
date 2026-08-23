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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Checkbox = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var classnames_1 = __importDefault(require("classnames"));
var react_1 = __importStar(require("react"));
var CheckmarkIcon_1 = require("./CheckmarkIcon");
var Checkbox_module_scss_1 = __importDefault(require("./Checkbox.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
exports.Checkbox = react_1.default.forwardRef(function (_a, ref) {
    var _b, _c, _d;
    var checked = _a.checked, id = _a.id, label = _a.label, onChange = _a.onChange, title = _a.title, errorMessage = _a.errorMessage, _e = _a.disabled, disabled = _e === void 0 ? false : _e, _f = _a.required, required = _f === void 0 ? false : _f, _g = _a.variant, variant = _g === void 0 ? 'medium' : _g;
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("label", __assign({ className: (0, classnames_1.default)(Checkbox_module_scss_1.default['ds-checkbox__wrapper'], (_b = {},
                    _b[Checkbox_module_scss_1.default['ds-checkbox__wrapper--disabled']] = disabled,
                    _b), (_c = {}, _c[Checkbox_module_scss_1.default['ds-checkbox__wrapper--error']] = !!errorMessage, _c), Checkbox_module_scss_1.default[theme]), htmlFor: id, title: title }, { children: [(0, jsx_runtime_1.jsx)("input", { type: "checkbox", ref: ref, id: id, name: id, "data-testid": id, required: required, checked: checked, disabled: disabled, onChange: function (evt) { return onChange(evt.target.checked); } }), (0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(Checkbox_module_scss_1.default['ds-checkbox__check'], (_d = {},
                            _d[Checkbox_module_scss_1.default['ds-checkbox__check--checked']] = checked,
                            _d), Checkbox_module_scss_1.default[theme]), "aria-hidden": "true" }, { children: checked && (0, jsx_runtime_1.jsx)(CheckmarkIcon_1.CheckmarkIcon, {}) })), (0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(Checkbox_module_scss_1.default['ds-checkbox__label'], Checkbox_module_scss_1.default["ds-checkbox__label--".concat(variant)], Checkbox_module_scss_1.default[theme]) }, { children: label }))] })), errorMessage && ((0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(Checkbox_module_scss_1.default['ds-checkbox__error-message'], Checkbox_module_scss_1.default[theme]) }, { children: errorMessage })))] }));
});
