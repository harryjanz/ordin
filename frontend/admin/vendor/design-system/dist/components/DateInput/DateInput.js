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
exports.DateInput = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var react_number_format_1 = __importDefault(require("react-number-format"));
var InputBase_1 = require("../InputBase");
var CalendarModal_1 = require("../Calendar/CalendarModal");
var utils_1 = require("../Calendar/utils");
var DateInput = function (_a) {
    var label = _a.label, value = _a.value, onChange = _a.onChange, _b = _a.placeholder, placeholder = _b === void 0 ? 'DD/MM/AAAA' : _b, _c = _a.helperMessage, helperMessage = _c === void 0 ? '' : _c, _d = _a.invalidDateMessage, invalidDateMessage = _d === void 0 ? 'Data inválida.' : _d, _e = _a.invalidMaxDateMessage, invalidMaxDateMessage = _e === void 0 ? 'A data é maior que a data máxima especificada' : _e, _f = _a.invalidMinDateMessage, invalidMinDateMessage = _f === void 0 ? 'A data é menor que a data mínima especificada' : _f, _g = _a.errorMessage, errorMessage = _g === void 0 ? '' : _g, _h = _a.maxDate, maxDate = _h === void 0 ? new Date('2100-01-01T00:00:00') : _h, _j = _a.minDate, minDate = _j === void 0 ? new Date('1900-01-01T00:00:00') : _j, _k = _a.format, format = _k === void 0 ? '##/##/####' : _k, _l = _a.mask, mask = _l === void 0 ? '_' : _l, props = __rest(_a, ["label", "value", "onChange", "placeholder", "helperMessage", "invalidDateMessage", "invalidMaxDateMessage", "invalidMinDateMessage", "errorMessage", "maxDate", "minDate", "format", "mask"]);
    var inputRef = (0, react_1.useRef)(null);
    var _m = (0, react_1.useState)(false), invalidDate = _m[0], setInvalidDate = _m[1];
    var _o = (0, react_1.useState)(false), invalidRangeMax = _o[0], setInvalidRangeMax = _o[1];
    var _p = (0, react_1.useState)(false), invalidRangeMin = _p[0], setInvalidRangeMin = _p[1];
    var _q = (0, react_1.useState)(false), isOpen = _q[0], setIsOpen = _q[1];
    // used to validate the date value prop on component mount
    (0, react_1.useEffect)(function () {
        handleInputChange(value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    var isValidDate = function (date) {
        if (Number.isNaN(date.getTime())) {
            setInvalidDate(true);
            setInvalidRangeMax(false);
            setInvalidRangeMin(false);
            return false;
        }
        return true;
    };
    var isValidRangeMin = (0, react_1.useCallback)(function (date) {
        if (minDate.getTime() > date.getTime()) {
            setInvalidRangeMin(true);
            setInvalidDate(false);
            setInvalidRangeMax(false);
            return false;
        }
        return true;
    }, [minDate]);
    var isValidRangeMax = (0, react_1.useCallback)(function (date) {
        if (maxDate.getTime() < date.getTime()) {
            setInvalidRangeMax(true);
            setInvalidDate(false);
            setInvalidRangeMin(false);
            return false;
        }
        return true;
    }, [maxDate]);
    var getErrorMessage = function () {
        if (invalidDate) {
            return invalidDateMessage;
        }
        if (invalidRangeMax) {
            return invalidMaxDateMessage;
        }
        if (invalidRangeMin) {
            return invalidMinDateMessage;
        }
        return errorMessage || '';
    };
    var clearErrors = function () {
        setInvalidRangeMax(false);
        setInvalidDate(false);
        setInvalidRangeMin(false);
    };
    var handleInputChange = function (inputValue) {
        if (!inputValue || inputValue.includes('_')) {
            clearErrors();
            onChange(inputValue, false);
            return;
        }
        var parsedDate = parseDate(inputValue);
        if (!parsedDate)
            return;
        if (!isValidDate(parsedDate) ||
            !isValidRangeMax(parsedDate) ||
            !isValidRangeMin(parsedDate)) {
            onChange(inputValue, false);
            return;
        }
        if (parsedDate) {
            setInvalidDate(false);
            setInvalidRangeMax(false);
            setInvalidRangeMin(false);
            onChange(inputValue, true);
        }
    };
    var getDate = function () {
        if (!value)
            return undefined;
        return parseDate(value);
    };
    var parseDate = function (date) {
        var _a = date.split('/'), day = _a[0], month = _a[1], year = _a[2];
        if (!day || !month || !year)
            return undefined;
        return new Date("".concat(year, "-").concat(month, "-").concat(day, "T00:00:00"));
    };
    var onChangeCalendar = function (date) {
        handleInputChange((0, utils_1.formatDate)(date));
        if (inputRef.current) {
            inputRef.current.focus();
        }
    };
    var handleToggleCalendar = function (status) {
        setIsOpen(status);
        if (!status && inputRef.current) {
            inputRef.current.focus();
        }
    };
    return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)(react_number_format_1.default, __assign({ getInputRef: inputRef, customInput: InputBase_1.InputBase, format: format, mask: mask, label: label, value: value, placeholder: placeholder, helperMessage: helperMessage, errorMessage: getErrorMessage(), icon: "calendar", onActionIconClick: function () { return handleToggleCalendar(true); }, onValueChange: function (e) { return handleInputChange(e.formattedValue); } }, props)), (0, jsx_runtime_1.jsx)(CalendarModal_1.Calendar, { onClose: function () { return handleToggleCalendar(false); }, onChange: onChangeCalendar, isOpen: isOpen, date: getDate(), maxDate: maxDate, minDate: minDate })] }));
};
exports.DateInput = DateInput;
