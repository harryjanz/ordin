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
exports.Skeleton = exports.SkeletonThemeProvider = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = __importDefault(require("react"));
var react_loading_skeleton_1 = __importStar(require("react-loading-skeleton"));
function SkeletonThemeProvider(_a) {
    var children = _a.children, _b = _a.color, color = _b === void 0 ? '#F2F5F7' : _b, _c = _a.highlightColor, highlightColor = _c === void 0 ? '#E0E7EC' : _c, props = __rest(_a, ["children", "color", "highlightColor"]);
    return react_1.default.createElement(react_loading_skeleton_1.SkeletonTheme, __assign({ color: color, highlightColor: highlightColor }, props), children);
}
exports.SkeletonThemeProvider = SkeletonThemeProvider;
function Skeleton(_a) {
    var _b = _a.width, width = _b === void 0 ? '200px' : _b, _c = _a.height, height = _c === void 0 ? '16px' : _c, _d = _a.rounded, rounded = _d === void 0 ? 'none' : _d, props = __rest(_a, ["width", "height", "rounded"]);
    var getBorderRadius = function (rounded) {
        var borderRadiusMap = {
            xs: '4px',
            s: '8px',
            m: '16px',
            l: '24px',
            xl: '32px',
            none: '0px',
        };
        return borderRadiusMap[rounded] || '0px';
    };
    return ((0, jsx_runtime_1.jsx)(react_loading_skeleton_1.default, __assign({ style: { borderRadius: getBorderRadius(rounded) }, height: height, width: width }, props)));
}
exports.Skeleton = Skeleton;
