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
exports.CalendarMonthSelection = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var classnames_1 = __importDefault(require("classnames"));
var nanoid_1 = require("nanoid");
var utils_1 = require("./utils");
var enums_1 = require("./enums");
var CalendarMonthSelection_module_scss_1 = __importDefault(require("./CalendarMonthSelection.module.scss"));
var CalendarButton_1 = require("./CalendarButton");
var CalendarMonthSelection = function (_a) {
    var currentDate = _a.currentDate, defaultDate = _a.defaultDate, minDate = _a.minDate, maxDate = _a.maxDate, onChangeDate = _a.onChangeDate, onChangeCalendarOption = _a.onChangeCalendarOption;
    var months = (0, utils_1.getMonthList)(currentDate || defaultDate);
    var handleChangeMonth = function (date) {
        if (!date)
            return;
        onChangeDate(date, enums_1.CalendarOptionsEnum.MONTH);
        onChangeCalendarOption(enums_1.CalendarOptionsEnum.DAY);
    };
    return ((0, jsx_runtime_1.jsx)("ul", __assign({ className: (0, classnames_1.default)(CalendarMonthSelection_module_scss_1.default['ds-calendar-month-selection__list']) }, { children: months.map(function (month) {
            return ((0, jsx_runtime_1.jsx)("li", __assign({ className: (0, classnames_1.default)(CalendarMonthSelection_module_scss_1.default['ds-calendar-month-selection__item']) }, { children: (0, jsx_runtime_1.jsx)(CalendarButton_1.CalendarButton, __assign({ onClick: function () { return handleChangeMonth(month.date); }, disabled: month.date &&
                        (0, utils_1.isBeforeOrAfterMonth)(month.date, maxDate, minDate), isDefaultDate: month.date && (0, utils_1.isEqualMonth)(defaultDate, month.date), isActive: currentDate &&
                        month.date &&
                        (0, utils_1.isEqualMonth)(currentDate, month.date) }, { children: month.abbreviation.toUpperCase() })) }), (0, nanoid_1.nanoid)(8)));
        }) })));
};
exports.CalendarMonthSelection = CalendarMonthSelection;
