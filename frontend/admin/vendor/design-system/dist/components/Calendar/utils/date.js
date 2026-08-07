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
exports.updateDate = exports.formatDate = exports.isBeforeOrAfterYear = exports.isBeforeOrAfterMonth = exports.isBeforeOrAfterDay = exports.isAfterDate = exports.isBeforeDate = exports.isEqualYear = exports.isEqualMonth = exports.isEqualDate = exports.isValidDate = exports.getYearInterval = exports.getFirstDayMonthInfo = exports.getMonthInfo = exports.getMonthDays = exports.getMonthList = exports.getDefaultDate = exports.getDayOfWeekInfo = exports.getDaysLetter = void 0;
var date_fns_1 = require("date-fns");
var constants_1 = require("../constants");
var enums_1 = require("../enums");
var getDaysLetter = function () {
    return constants_1.daysOfWeek.map(function (days) { return days.letter; });
};
exports.getDaysLetter = getDaysLetter;
var getDayOfWeekInfo = function (date) {
    return constants_1.daysOfWeek.find(function (info) { return (0, date_fns_1.getDay)(date) === info.index; }) || null;
};
exports.getDayOfWeekInfo = getDayOfWeekInfo;
var getDefaultDate = function () {
    return (0, date_fns_1.startOfToday)();
};
exports.getDefaultDate = getDefaultDate;
var getMonthList = function (date) {
    var monthDates = (0, date_fns_1.eachMonthOfInterval)({
        start: (0, date_fns_1.startOfYear)(date),
        end: (0, date_fns_1.endOfYear)(date),
    });
    return monthDates.map(function (date) { return (__assign(__assign({}, constants_1.months[(0, date_fns_1.getMonth)(date)]), { date: date })); });
};
exports.getMonthList = getMonthList;
var getMonthDays = function (date) {
    return (0, date_fns_1.eachDayOfInterval)({
        start: (0, date_fns_1.startOfMonth)(date),
        end: (0, date_fns_1.lastDayOfMonth)(date),
    });
};
exports.getMonthDays = getMonthDays;
var getMonthInfo = function (date) {
    return constants_1.months.find(function (info) { return (0, date_fns_1.getMonth)(date) === info.index; }) || null;
};
exports.getMonthInfo = getMonthInfo;
var getFirstDayMonthInfo = function (date) {
    var startDate = (0, date_fns_1.startOfMonth)(date);
    return constants_1.daysOfWeek.find(function (info) { return (0, date_fns_1.getDay)(startDate) === info.index; }) || null;
};
exports.getFirstDayMonthInfo = getFirstDayMonthInfo;
var getYearInterval = function (startDate, endDate) {
    if (startDate === void 0) { startDate = new Date(1970, 0, 1); }
    if (endDate === void 0) { endDate = new Date(2100, 0, 1); }
    return (0, date_fns_1.eachYearOfInterval)({
        start: startDate,
        end: endDate,
    });
};
exports.getYearInterval = getYearInterval;
var isValidDate = function (date) {
    return (0, date_fns_1.isValid)(date);
};
exports.isValidDate = isValidDate;
var isEqualDate = function (startDate, endDate) {
    var startDateWithoutTime = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    var endDateWithoutTime = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    return (0, date_fns_1.isEqual)(startDateWithoutTime, endDateWithoutTime);
};
exports.isEqualDate = isEqualDate;
var isEqualMonth = function (startDate, endDate) {
    var startDateWithMonthAndYear = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    var endDateWithMonthAndYear = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    return (0, date_fns_1.isEqual)(startDateWithMonthAndYear, endDateWithMonthAndYear);
};
exports.isEqualMonth = isEqualMonth;
var isEqualYear = function (startDate, endDate) {
    var startDateWithYear = new Date(startDate.getFullYear(), 0, 1);
    var endDateWithYear = new Date(endDate.getFullYear(), 0, 1);
    return (0, date_fns_1.isEqual)(startDateWithYear, endDateWithYear);
};
exports.isEqualYear = isEqualYear;
var isBeforeDate = function (date, minDate) {
    return (0, date_fns_1.isBefore)(date, minDate);
};
exports.isBeforeDate = isBeforeDate;
var isAfterDate = function (date, maxDate) {
    return (0, date_fns_1.isAfter)(date, maxDate);
};
exports.isAfterDate = isAfterDate;
var isBeforeOrAfterDay = function (date, maxDate, minDate) {
    var isBeforeMinDate = minDate ? (0, date_fns_1.isBefore)(date, minDate) : false;
    var isAfterMaxDate = maxDate ? (0, date_fns_1.isAfter)(date, maxDate) : false;
    return isBeforeMinDate || isAfterMaxDate;
};
exports.isBeforeOrAfterDay = isBeforeOrAfterDay;
var isBeforeOrAfterMonth = function (date, maxDate, minDate) {
    var isBeforeMinDate = minDate
        ? (0, date_fns_1.isBefore)(date, new Date(minDate.getFullYear(), minDate.getMonth(), 1))
        : false;
    var isAfterMaxDate = maxDate
        ? (0, date_fns_1.isAfter)(date, new Date(maxDate.getFullYear(), maxDate.getMonth(), 1))
        : false;
    return isBeforeMinDate || isAfterMaxDate;
};
exports.isBeforeOrAfterMonth = isBeforeOrAfterMonth;
var isBeforeOrAfterYear = function (date, maxDate, minDate) {
    var isBeforeMinDate = minDate
        ? (0, date_fns_1.isBefore)(date, new Date(minDate.getFullYear(), 0, 1))
        : false;
    var isAfterMaxDate = maxDate
        ? (0, date_fns_1.isAfter)(date, new Date(maxDate.getFullYear(), 0, 1))
        : false;
    return isBeforeMinDate || isAfterMaxDate;
};
exports.isBeforeOrAfterYear = isBeforeOrAfterYear;
var formatDate = function (date, formatString) {
    if (formatString === void 0) { formatString = 'dd/MM/yyyy'; }
    return (0, date_fns_1.format)(date, formatString);
};
exports.formatDate = formatDate;
var updateDate = function (currentDate, updatedDate, type) {
    switch (type) {
        case enums_1.CalendarOptionsEnum.DAY:
            return (0, date_fns_1.setDate)(currentDate, updatedDate.getDate());
        case enums_1.CalendarOptionsEnum.MONTH:
            return (0, date_fns_1.setMonth)(currentDate, updatedDate.getMonth());
        case enums_1.CalendarOptionsEnum.YEAR:
            return (0, date_fns_1.setYear)(currentDate, updatedDate.getFullYear());
        default:
            return updatedDate;
    }
};
exports.updateDate = updateDate;
