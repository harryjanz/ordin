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
exports.Tab = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var Tab_module_scss_1 = __importDefault(require("./Tab.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
var Tab = function (_a) {
    var _b, _c, _d;
    var value = _a.value, label = _a.label, totalizer = _a.totalizer, _e = _a.disabled, disabled = _e === void 0 ? false : _e, _f = _a.active, active = _f === void 0 ? false : _f, onSelect = _a.onSelect;
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    return ((0, jsx_runtime_1.jsxs)("button", __assign({ type: "button", role: "tab", className: (0, classnames_1.default)(Tab_module_scss_1.default['ds-tab__button'], (_b = {}, _b[Tab_module_scss_1.default['ds-tab__button--active']] = active, _b), (_c = {}, _c[Tab_module_scss_1.default['ds-tab__button--disabled']] = disabled, _c)), onClick: function () { return !disabled && onSelect && onSelect(value); }, "data-testid": "tab-".concat(value), "data-tab-id": "tab-id-".concat(value) }, { children: [(0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(Tab_module_scss_1.default['ds-tab__label'], Tab_module_scss_1.default[theme]) }, { children: label })), totalizer !== null && totalizer !== undefined && ((0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(Tab_module_scss_1.default['ds-tab__totalizer'], Tab_module_scss_1.default[theme], (_d = {},
                    _d[Tab_module_scss_1.default['ds-tab__totalizer--active']] = active,
                    _d)) }, { children: totalizer })))] }), value));
};
exports.Tab = Tab;
