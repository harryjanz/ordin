"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeToast = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_hot_toast_1 = __importDefault(require("react-hot-toast"));
var ToastComponent_1 = require("./ToastComponent");
var makeToast = function (toastType, message, actionButtonText, onActionButtonClick) {
    (0, react_hot_toast_1.default)(function (t) { return ((0, jsx_runtime_1.jsx)(ToastComponent_1.ToastComponent, { toastObject: t, type: toastType, message: message, actionButtonText: actionButtonText, onActionButtonClick: onActionButtonClick })); });
};
exports.makeToast = makeToast;
