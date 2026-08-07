"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToastContainer = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_hot_toast_1 = require("react-hot-toast");
var Toast_module_scss_1 = __importDefault(require("./Toast.module.scss"));
var ToastContainer = function (_a) {
    var _b = _a.position, position = _b === void 0 ? 'top-right' : _b, _c = _a.duration, duration = _c === void 0 ? 5000 : _c;
    return ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: (0, jsx_runtime_1.jsx)(react_hot_toast_1.Toaster, { containerClassName: Toast_module_scss_1.default['ds-toast__container'], position: position, toastOptions: {
                duration: duration,
                ariaProps: {
                    role: 'alert',
                    'aria-live': 'polite',
                },
                style: {
                    backgroundColor: 'transparent',
                    boxShadow: 'none',
                    margin: 0,
                    boxSizing: 'border-box',
                    padding: 0,
                },
            }, gutter: 16 }) }));
};
exports.ToastContainer = ToastContainer;
