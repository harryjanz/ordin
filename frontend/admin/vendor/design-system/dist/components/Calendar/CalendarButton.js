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
exports.CalendarButton = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var CalendarButton_module_scss_1 = __importDefault(require("./CalendarButton.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
var CalendarButton = function (_a) {
    var _b, _c;
    var _d = _a.disabled, disabled = _d === void 0 ? false : _d, onClick = _a.onClick, _e = _a.isDefaultDate, isDefaultDate = _e === void 0 ? false : _e, _f = _a.isActive, isActive = _f === void 0 ? false : _f, _g = _a.scrollToReference, scrollToReference = _g === void 0 ? false : _g, children = _a.children;
    var dateRef = (0, react_1.useRef)(null);
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    (0, react_1.useEffect)(function () {
        if (dateRef.current &&
            dateRef.current.scrollIntoView &&
            scrollToReference) {
            dateRef.current.scrollIntoView({
                behavior: 'smooth',
            });
        }
    }, [scrollToReference]);
    return ((0, jsx_runtime_1.jsx)("button", __assign({ type: "button", disabled: disabled, onClick: onClick, ref: isDefaultDate || isActive ? dateRef : null, className: (0, classnames_1.default)(CalendarButton_module_scss_1.default['ds-calendar-button__container'], (_b = {},
            _b[CalendarButton_module_scss_1.default['ds-calendar-button__container--default-day']] = isDefaultDate,
            _b), (_c = {},
            _c[CalendarButton_module_scss_1.default['ds-calendar-button__container--active']] = isActive,
            _c), CalendarButton_module_scss_1.default[theme]) }, { children: children })));
};
exports.CalendarButton = CalendarButton;
