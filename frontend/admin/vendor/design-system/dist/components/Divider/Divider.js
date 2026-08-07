"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Divider = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var classnames_1 = __importDefault(require("classnames"));
var Divider_module_scss_1 = __importDefault(require("./Divider.module.scss"));
var Divider = function (_a) {
    var _b;
    var _c = _a.orientation, orientation = _c === void 0 ? 'horizontal' : _c, _d = _a.size, size = _d === void 0 ? '100%' : _d, _e = _a.centered, centered = _e === void 0 ? false : _e;
    return ((0, jsx_runtime_1.jsx)("div", { className: (0, classnames_1.default)(Divider_module_scss_1.default["ds-divider__div--".concat(orientation)], (_b = {},
            _b[Divider_module_scss_1.default['ds-divider__div--centered']] = centered,
            _b)), style: {
            width: orientation === 'horizontal' ? size : '0px',
            height: orientation === 'horizontal' ? '0px' : size,
        } }));
};
exports.Divider = Divider;
