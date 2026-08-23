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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tag = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var classnames_1 = __importDefault(require("classnames"));
var react_1 = require("react");
var Tag_module_scss_1 = __importDefault(require("./Tag.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
function Tag(_a) {
    var _b;
    var children = _a.children, _c = _a.variant, variant = _c === void 0 ? 'neutral' : _c, _d = _a.removable, removable = _d === void 0 ? false : _d, onRemove = _a.onRemove;
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    return ((0, jsx_runtime_1.jsxs)("span", __assign({ className: (0, classnames_1.default)(Tag_module_scss_1.default[theme], Tag_module_scss_1.default['ds-tag__wrapper'], Tag_module_scss_1.default["ds-tag__wrapper--".concat(variant)], (_b = {}, _b[Tag_module_scss_1.default['ds-tag__wrapper--removable']] = removable, _b)) }, { children: [children, removable && ((0, jsx_runtime_1.jsx)("button", __assign({ type: "button", className: Tag_module_scss_1.default[theme], onClick: onRemove }, { children: (0, jsx_runtime_1.jsx)("i", { className: "icon icon-x" }) })))] })));
}
exports.Tag = Tag;
