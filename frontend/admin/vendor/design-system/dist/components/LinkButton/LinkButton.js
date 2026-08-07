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
exports.LinkButton = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = __importStar(require("react"));
var classnames_1 = __importDefault(require("classnames"));
var LinkButton_module_scss_1 = __importDefault(require("./LinkButton.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
exports.LinkButton = react_1.default.forwardRef(function (_a, ref) {
    var _b;
    var _c = _a.size, size = _c === void 0 ? 'small' : _c, _d = _a.variant, variant = _d === void 0 ? 'primary' : _d, label = _a.label, _e = _a.icon, icon = _e === void 0 ? '' : _e, _f = _a.iconPosition, iconPosition = _f === void 0 ? 'left' : _f, _g = _a.loading, loading = _g === void 0 ? false : _g, onClick = _a.onClick, props = __rest(_a, ["size", "variant", "label", "icon", "iconPosition", "loading", "onClick"]);
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    var renderIcon = function () {
        if (loading) {
            return ((0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)("icon icon-loading", LinkButton_module_scss_1.default["ds-link-button__icon"], LinkButton_module_scss_1.default["ds-link-button__icon--loading"], LinkButton_module_scss_1.default["ds-link-button__icon--".concat(variant)], LinkButton_module_scss_1.default["ds-link-button__icon--".concat(iconPosition)], LinkButton_module_scss_1.default[theme]) }));
        }
        return ((0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)("icon icon-".concat(icon), LinkButton_module_scss_1.default["ds-link-button__icon"], LinkButton_module_scss_1.default["ds-link-button__icon--".concat(variant)], LinkButton_module_scss_1.default["ds-link-button__icon--".concat(iconPosition)], LinkButton_module_scss_1.default[theme]) }));
    };
    return ((0, jsx_runtime_1.jsxs)("button", __assign({ ref: ref, type: "button", className: (0, classnames_1.default)(LinkButton_module_scss_1.default['ds-link-button__btn'], (_b = {},
            _b[LinkButton_module_scss_1.default['ds-link-button__btn--loading']] = loading,
            _b)), onClick: function (e) {
            if (loading)
                return;
            if (onClick)
                onClick(e);
        } }, props, { children: [(!!icon || loading) && iconPosition === 'left' && renderIcon(), (0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(LinkButton_module_scss_1.default['ds-link-button__label'], LinkButton_module_scss_1.default["ds-link-button__label--".concat(size)], LinkButton_module_scss_1.default["ds-link-button__label--".concat(variant)], LinkButton_module_scss_1.default[theme]) }, { children: label })), (!!icon || loading) && iconPosition === 'right' && renderIcon()] })));
});
