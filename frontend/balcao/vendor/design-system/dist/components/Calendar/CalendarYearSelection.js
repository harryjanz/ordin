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
exports.CalendarYearSelection = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var classnames_1 = __importDefault(require("classnames"));
var nanoid_1 = require("nanoid");
var utils_1 = require("./utils");
var enums_1 = require("./enums");
var CalendarYearSelection_module_scss_1 = __importDefault(require("./CalendarYearSelection.module.scss"));
var CalendarButton_1 = require("./CalendarButton");
var CalendarYearSelection = function (_a) {
    var currentDate = _a.currentDate, defaultDate = _a.defaultDate, maxDate = _a.maxDate, minDate = _a.minDate, onChangeDate = _a.onChangeDate, onChangeCalendarOption = _a.onChangeCalendarOption;
    var years = (0, utils_1.getYearInterval)();
    var handleChangeYear = function (date) {
        onChangeDate(date, enums_1.CalendarOptionsEnum.YEAR);
        onChangeCalendarOption(enums_1.CalendarOptionsEnum.MONTH);
    };
    return ((0, jsx_runtime_1.jsx)("ul", __assign({ className: (0, classnames_1.default)(CalendarYearSelection_module_scss_1.default['ds-calendar-year-selection__list']) }, { children: years.map(function (year) { return ((0, jsx_runtime_1.jsx)("li", __assign({ className: (0, classnames_1.default)(CalendarYearSelection_module_scss_1.default['ds-calendar-year-selection__item']) }, { children: (0, jsx_runtime_1.jsx)(CalendarButton_1.CalendarButton, __assign({ onClick: function () { return handleChangeYear(year); }, disabled: (0, utils_1.isBeforeOrAfterYear)(year, maxDate, minDate), isDefaultDate: (0, utils_1.isEqualYear)(defaultDate, year), isActive: currentDate && (0, utils_1.isEqualYear)(currentDate, year), scrollToReference: true }, { children: year.getFullYear() })) }), (0, nanoid_1.nanoid)(8))); }) })));
};
exports.CalendarYearSelection = CalendarYearSelection;
