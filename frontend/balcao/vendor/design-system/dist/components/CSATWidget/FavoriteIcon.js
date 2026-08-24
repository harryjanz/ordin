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
exports.FavoriteIcon = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var FavoriteIcon = function (_a) {
    var isActive = _a.isActive;
    return ((0, jsx_runtime_1.jsx)("svg", __assign({ width: "16", height: "16", viewBox: "0 0 16 16", fill: isActive ? '#9900FF' : 'transparent', strokeWidth: "1", stroke: isActive ? '#9900FF' : '#ACBEC7', xmlns: "http://www.w3.org/2000/svg" }, { children: (0, jsx_runtime_1.jsx)("path", { fillRule: "evenodd", clipRule: "evenodd", d: "M8.00106 0.73333C8.22943 0.73333 8.438 0.862973 8.53908 1.06776L10.4596 4.95854L14.7545 5.5863C14.9804 5.61933 15.168 5.77773 15.2385 5.99494C15.3089 6.21214 15.2499 6.45049 15.0864 6.60981L11.9791 9.63628L12.7124 13.9119C12.751 14.137 12.6585 14.3645 12.4737 14.4988C12.2889 14.633 12.0439 14.6507 11.8418 14.5444L8.00106 12.5246L4.16033 14.5444C3.95818 14.6507 3.71321 14.633 3.52842 14.4988C3.34363 14.3645 3.25109 14.137 3.28969 13.9119L4.02301 9.63628L0.915753 6.60981C0.752182 6.45049 0.693218 6.21214 0.763645 5.99494C0.834071 5.77773 1.02168 5.61933 1.24762 5.5863L5.5425 4.95854L7.46304 1.06776C7.56412 0.862973 7.77269 0.73333 8.00106 0.73333Z" }) })));
};
exports.FavoriteIcon = FavoriteIcon;
