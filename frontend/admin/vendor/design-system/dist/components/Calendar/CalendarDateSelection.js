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
exports.CalendarDateSelecion = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var nanoid_1 = require("nanoid");
var utils_1 = require("./utils");
var enums_1 = require("./enums");
var CalendarDateSelection_module_scss_1 = __importDefault(require("./CalendarDateSelection.module.scss"));
var CalendarButton_1 = require("./CalendarButton");
var ThemeProvider_1 = require("../ThemeProvider");
var CalendarDateSelecion = function (_a) {
    var currentDate = _a.currentDate, defaultDate = _a.defaultDate, minDate = _a.minDate, maxDate = _a.maxDate, onChangeDate = _a.onChangeDate;
    var _b = (0, react_1.useState)([]), days = _b[0], setDays = _b[1];
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    var daysLetter = (0, react_1.useMemo)(function () { return (0, utils_1.getDaysLetter)(); }, []);
    (0, react_1.useEffect)(function () {
        var dayList = (0, utils_1.getMonthDays)(currentDate || defaultDate);
        var firstDayOfMonth = (0, utils_1.getFirstDayMonthInfo)(currentDate || defaultDate);
        for (var index = 0; index < ((firstDayOfMonth === null || firstDayOfMonth === void 0 ? void 0 : firstDayOfMonth.index) || 0); index += 1) {
            dayList.unshift(null);
        }
        setDays(dayList);
    }, [currentDate, defaultDate]);
    var handleChangeDate = function (date) {
        onChangeDate(date, enums_1.CalendarOptionsEnum.DAY);
    };
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("ol", __assign({ className: (0, classnames_1.default)(CalendarDateSelection_module_scss_1.default['ds-calendar-date-selection__header']) }, { children: daysLetter.map(function (letter) { return ((0, jsx_runtime_1.jsx)("li", { children: letter }, (0, nanoid_1.nanoid)(8))); }) })), (0, jsx_runtime_1.jsx)("ul", __assign({ className: (0, classnames_1.default)(CalendarDateSelection_module_scss_1.default['ds-calendar-date-selection__list']) }, { children: days.map(function (day) {
                    return ((0, jsx_runtime_1.jsx)("li", __assign({ className: (0, classnames_1.default)(CalendarDateSelection_module_scss_1.default['ds-calendar-date-selection__item'], CalendarDateSelection_module_scss_1.default[theme]) }, { children: day !== null && ((0, jsx_runtime_1.jsx)(CalendarButton_1.CalendarButton, __assign({ onClick: function () { return handleChangeDate(day); }, disabled: (0, utils_1.isBeforeOrAfterDay)(day, maxDate, minDate), isDefaultDate: (0, utils_1.isEqualDate)(defaultDate, day), isActive: currentDate && (0, utils_1.isEqualDate)(currentDate, day) }, { children: day.getDate() }))) }), (0, nanoid_1.nanoid)(8)));
                }) }))] }));
};
exports.CalendarDateSelecion = CalendarDateSelecion;
