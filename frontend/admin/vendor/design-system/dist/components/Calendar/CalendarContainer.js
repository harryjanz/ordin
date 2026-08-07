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
exports.CalendarContainer = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var classnames_1 = __importDefault(require("classnames"));
var react_1 = require("react");
var CalendarContainer_module_scss_1 = __importDefault(require("./CalendarContainer.module.scss"));
var Divider_1 = require("../Divider");
var Button_1 = require("../Button");
var CalendarDateSelection_1 = require("./CalendarDateSelection");
var utils_1 = require("./utils");
var CalendarMonthSelection_1 = require("./CalendarMonthSelection");
var CalendarYearSelection_1 = require("./CalendarYearSelection");
var enums_1 = require("./enums");
var ThemeProvider_1 = require("../ThemeProvider");
var CalendarContainer = function (_a) {
    var id = _a.id, dataTestId = _a.dataTestId, date = _a.date, minDate = _a.minDate, maxDate = _a.maxDate, onChange = _a.onChange, onClose = _a.onClose, props = __rest(_a, ["id", "dataTestId", "date", "minDate", "maxDate", "onChange", "onClose"]);
    var _b = (0, react_1.useState)(date), currentDate = _b[0], setCurrentDate = _b[1];
    var _c = (0, react_1.useState)(enums_1.CalendarOptionsEnum.DAY), calendarOption = _c[0], setCalendarOption = _c[1];
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    var defaultDate = (0, utils_1.getDefaultDate)();
    var day = (currentDate && currentDate.getDate()) || defaultDate.getDate();
    var dayOfWeekInfo = (0, utils_1.getDayOfWeekInfo)(currentDate || defaultDate);
    var monthInfo = (0, utils_1.getMonthInfo)(currentDate || defaultDate);
    var year = (currentDate && currentDate.getFullYear()) || defaultDate.getFullYear();
    (0, react_1.useEffect)(function () {
        setCurrentDate((0, utils_1.isValidDate)(date) ? date : undefined);
    }, [date]);
    var renderSelection = function () {
        var _a;
        var props = {
            currentDate: currentDate,
            defaultDate: defaultDate,
            minDate: minDate,
            maxDate: maxDate,
            onChangeDate: onChangeDate,
            onChangeCalendarOption: onChangeCalendarOption,
        };
        var components = (_a = {},
            _a[enums_1.CalendarOptionsEnum.DAY] = (0, jsx_runtime_1.jsx)(CalendarDateSelection_1.CalendarDateSelecion, __assign({}, props)),
            _a[enums_1.CalendarOptionsEnum.MONTH] = (0, jsx_runtime_1.jsx)(CalendarMonthSelection_1.CalendarMonthSelection, __assign({}, props)),
            _a[enums_1.CalendarOptionsEnum.YEAR] = (0, jsx_runtime_1.jsx)(CalendarYearSelection_1.CalendarYearSelection, __assign({}, props)),
            _a);
        return components[calendarOption];
    };
    var handleClose = function () {
        onChangeCalendarOption(enums_1.CalendarOptionsEnum.DAY);
        setCurrentDate((0, utils_1.isValidDate)(date) ? date : undefined);
        if (onClose)
            onClose();
    };
    var handleChange = function () {
        onChange(currentDate || defaultDate);
        onClose();
    };
    var onChangeCalendarOption = function (value) {
        setCalendarOption(value);
    };
    var onChangeDate = function (updatedDate, type) {
        var newDate = (0, utils_1.updateDate)(currentDate || defaultDate, updatedDate, type);
        if (minDate && (0, utils_1.isBeforeDate)(newDate, minDate)) {
            setCurrentDate(minDate);
            return;
        }
        if (maxDate && (0, utils_1.isAfterDate)(newDate, maxDate)) {
            setCurrentDate(maxDate);
            return;
        }
        setCurrentDate(newDate);
    };
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ id: "".concat(id, "-calendar"), "data-testid": "".concat(dataTestId, "-calendar"), className: (0, classnames_1.default)(CalendarContainer_module_scss_1.default['ds-calendar-container__wrapper'], CalendarContainer_module_scss_1.default[theme]) }, props, { children: [(0, jsx_runtime_1.jsx)("header", __assign({ className: (0, classnames_1.default)(CalendarContainer_module_scss_1.default['ds-calendar-container__header'], CalendarContainer_module_scss_1.default[theme]) }, { children: (0, jsx_runtime_1.jsxs)("button", __assign({ id: "".concat(id, "-calendar-header-button"), "data-testid": "".concat(dataTestId, "-calendar-header-button"), type: "button", onClick: function () { return onChangeCalendarOption(enums_1.CalendarOptionsEnum.DAY); }, className: (0, classnames_1.default)(CalendarContainer_module_scss_1.default['ds-calendar-container__header-button'], CalendarContainer_module_scss_1.default[theme]) }, { children: [dayOfWeekInfo === null || dayOfWeekInfo === void 0 ? void 0 : dayOfWeekInfo.abbreviation, ", ", day, " ", monthInfo === null || monthInfo === void 0 ? void 0 : monthInfo.abbreviation] })) })), (0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(CalendarContainer_module_scss_1.default['ds-calendar-container__content']) }, { children: [(0, jsx_runtime_1.jsxs)("header", __assign({ className: (0, classnames_1.default)(CalendarContainer_module_scss_1.default['ds-calendar-container__content-header'], CalendarContainer_module_scss_1.default[theme]) }, { children: [(0, jsx_runtime_1.jsxs)("button", __assign({ id: "".concat(id, "-calendar-month-button"), "data-testid": "".concat(dataTestId, "-calendar-month-button"), type: "button", disabled: calendarOption === enums_1.CalendarOptionsEnum.YEAR, onClick: function () { return onChangeCalendarOption(enums_1.CalendarOptionsEnum.MONTH); }, className: (0, classnames_1.default)(CalendarContainer_module_scss_1.default['ds-calendar-container__content-button'], CalendarContainer_module_scss_1.default[theme]) }, { children: [monthInfo === null || monthInfo === void 0 ? void 0 : monthInfo.name, (0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)('icon', 'icon-chevron-down', CalendarContainer_module_scss_1.default[theme]) })] })), (0, jsx_runtime_1.jsxs)("button", __assign({ id: "".concat(id, "-calendar-year-button"), "data-testid": "".concat(dataTestId, "-calendar-year-button"), type: "button", disabled: calendarOption === enums_1.CalendarOptionsEnum.MONTH, onClick: function () { return onChangeCalendarOption(enums_1.CalendarOptionsEnum.YEAR); }, className: (0, classnames_1.default)(CalendarContainer_module_scss_1.default['ds-calendar-container__content-button'], CalendarContainer_module_scss_1.default[theme]) }, { children: [year, (0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)('icon', 'icon-chevron-down', CalendarContainer_module_scss_1.default[theme]) })] }))] })), renderSelection()] })), (0, jsx_runtime_1.jsx)(Divider_1.Divider, {}), (0, jsx_runtime_1.jsxs)("footer", __assign({ className: (0, classnames_1.default)(CalendarContainer_module_scss_1.default['ds-calendar-container__footer']) }, { children: [(0, jsx_runtime_1.jsx)(Button_1.Button, __assign({ id: "".concat(id, "-calendar-close-button"), "data-testid": "".concat(dataTestId, "-calendar-close-button"), size: "medium", variant: "secondary", onClick: function () { return handleClose(); } }, { children: "Fechar" })), (0, jsx_runtime_1.jsx)(Button_1.Button, __assign({ id: "".concat(id, "-submit-button"), "data-testid": "".concat(dataTestId, "-submit-button"), size: "medium", variant: "primary", onClick: function () { return handleChange(); } }, { children: "Ok" }))] }))] })));
};
exports.CalendarContainer = CalendarContainer;
