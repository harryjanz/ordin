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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RadioGroupProvider = exports.RadioGroupContext = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
exports.RadioGroupContext = (0, react_1.createContext)({
    name: '',
    value: '',
});
var RadioGroupProvider = function (_a) {
    var children = _a.children, name = _a.name, value = _a.value;
    return ((0, jsx_runtime_1.jsx)(exports.RadioGroupContext.Provider, __assign({ value: { name: name, value: value } }, { children: children })));
};
exports.RadioGroupProvider = RadioGroupProvider;
