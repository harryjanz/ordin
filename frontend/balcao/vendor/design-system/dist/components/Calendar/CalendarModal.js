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
exports.Calendar = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var classnames_1 = __importDefault(require("classnames"));
var CalendarContainer_1 = require("./CalendarContainer");
var CalendarModal_module_scss_1 = __importDefault(require("./CalendarModal.module.scss"));
var CalendarModal = function (_a) {
    var isOpen = _a.isOpen, onClose = _a.onClose, props = __rest(_a, ["isOpen", "onClose"]);
    return ((0, jsx_runtime_1.jsxs)("dialog", __assign({ className: (0, classnames_1.default)(CalendarModal_module_scss_1.default['ds-calendar-modal__wrapper']), open: isOpen }, { children: [(0, jsx_runtime_1.jsx)(CalendarContainer_1.CalendarContainer, __assign({ onClose: onClose }, props)), (0, jsx_runtime_1.jsx)("button", __assign({ id: "".concat(props.id, "-calendar-modal-close-button"), "data-testid": "".concat(props.dataTestId, "-calendar-modal-close-button"), type: "button", onClick: function () { return onClose(); }, className: (0, classnames_1.default)(CalendarModal_module_scss_1.default['ds-calendar-modal__button-close']) }, { children: "close" }))] })));
};
exports.Calendar = CalendarModal;
