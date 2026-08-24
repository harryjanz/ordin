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
exports.ThemeProvider = exports.ThemeContext = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var themes_1 = __importDefault(require("../../core/themes"));
exports.ThemeContext = (0, react_1.createContext)(themes_1.default.DEFAULT);
var ThemeProvider = function (_a) {
    var children = _a.children, _b = _a.theme, theme = _b === void 0 ? themes_1.default.DEFAULT : _b;
    return ((0, jsx_runtime_1.jsx)(exports.ThemeContext.Provider, __assign({ value: theme }, { children: children })));
};
exports.ThemeProvider = ThemeProvider;
