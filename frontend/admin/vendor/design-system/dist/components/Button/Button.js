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
exports.Button = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
/* eslint-disable react/button-has-type */
var react_1 = __importStar(require("react"));
var classnames_1 = __importDefault(require("classnames"));
var Button_module_scss_1 = __importDefault(require("./Button.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
exports.Button = react_1.default.forwardRef(function (_a, ref) {
    var _b, _c, _d, _e;
    var children = _a.children, _f = _a.size, size = _f === void 0 ? 'large' : _f, _g = _a.variant, variant = _g === void 0 ? 'primary' : _g, _h = _a.fullWidth, fullWidth = _h === void 0 ? false : _h, _j = _a.mobileFullWidth, mobileFullWidth = _j === void 0 ? false : _j, _k = _a.type, type = _k === void 0 ? 'button' : _k, _l = _a.loading, loading = _l === void 0 ? false : _l, onClick = _a.onClick, props = __rest(_a, ["children", "size", "variant", "fullWidth", "mobileFullWidth", "type", "loading", "onClick"]);
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    var renderLoading = function () { return ((0, jsx_runtime_1.jsx)("span", __assign({ className: Button_module_scss_1.default['ds-button__loading'] }, { children: (0, jsx_runtime_1.jsx)("i", { className: "icon-loading" }) }))); };
    return ((0, jsx_runtime_1.jsxs)("button", __assign({}, props, { ref: ref, type: type, onClick: function (e) {
            if (loading)
                return;
            if (onClick)
                onClick(e);
        }, className: (0, classnames_1.default)(Button_module_scss_1.default['ds-button__container'], Button_module_scss_1.default["ds-button__container--".concat(variant)], Button_module_scss_1.default["ds-button__container--".concat(size)], (_b = {}, _b[Button_module_scss_1.default["ds-button__container--fullwidth"]] = fullWidth, _b), (_c = {}, _c[Button_module_scss_1.default["ds-button__container--loading"]] = loading, _c), (_d = {},
            _d[Button_module_scss_1.default["ds-button__container--mobile-fullwidth"]] = mobileFullWidth,
            _d), Button_module_scss_1.default[theme]) }, { children: [loading && renderLoading(), (0, jsx_runtime_1.jsx)("div", __assign({ className: (0, classnames_1.default)(Button_module_scss_1.default['ds-button__children-wrapper'], (_e = {},
                    _e[Button_module_scss_1.default['ds-button__children-wrapper--loading']] = loading,
                    _e)) }, { children: children }))] })));
});
