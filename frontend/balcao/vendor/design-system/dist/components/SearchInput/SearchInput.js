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
exports.SearchInput = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
/* eslint-disable consistent-return */
var classnames_1 = __importDefault(require("classnames"));
var react_1 = require("react");
var InputBase_1 = require("../InputBase");
var SearchInput_module_scss_1 = __importDefault(require("./SearchInput.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
function SearchInput(_a) {
    var _b;
    var value = _a.value, label = _a.label, onValueSelected = _a.onValueSelected, onChange = _a.onChange, disabled = _a.disabled, _c = _a.options, options = _c === void 0 ? [] : _c, _d = _a.emptyMessage, emptyMessage = _d === void 0 ? 'Sem registros' : _d, _e = _a.changeValueOnSelect, changeValueOnSelect = _e === void 0 ? true : _e, _f = _a.variant, variant = _f === void 0 ? 'large' : _f, _g = _a.readOnly, readOnly = _g === void 0 ? false : _g, _h = _a.showEmptyOptions, showEmptyOptions = _h === void 0 ? true : _h, _j = _a.autosizeOptions, autosizeOptions = _j === void 0 ? true : _j, props = __rest(_a, ["value", "label", "onValueSelected", "onChange", "disabled", "options", "emptyMessage", "changeValueOnSelect", "variant", "readOnly", "showEmptyOptions", "autosizeOptions"]);
    var _k = (0, react_1.useState)(0), optionFocused = _k[0], setOptionFocused = _k[1];
    var _l = (0, react_1.useState)(false), isFocused = _l[0], setIsFocused = _l[1];
    var wrapperRef = (0, react_1.useRef)(null);
    var optionsListRef = (0, react_1.useRef)(null);
    var inputSearchRef = (0, react_1.useRef)(null);
    var optionsRefs = [];
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    (0, react_1.useEffect)(function () {
        if (!wrapperRef || !wrapperRef.current)
            return;
        var setOptionsVisibility = function (event) {
            var _a;
            if (!((_a = wrapperRef === null || wrapperRef === void 0 ? void 0 : wrapperRef.current) === null || _a === void 0 ? void 0 : _a.contains(event.target)) ||
                disabled ||
                readOnly) {
                setIsFocused(false);
            }
            else {
                setIsFocused(true);
            }
        };
        document.addEventListener('mousedown', setOptionsVisibility);
        return function () {
            return document.removeEventListener('mousedown', setOptionsVisibility);
        };
    }, [wrapperRef, disabled, readOnly]);
    var handleClickEvent = function (event, option, index) {
        event.preventDefault();
        if (disabled)
            return;
        onValueSelected(option);
        if (changeValueOnSelect) {
            onChange(option.label);
        }
        setIsFocused(false);
        var ref = optionsRefs[index];
        if (ref) {
            ref.blur();
        }
    };
    var handleKeyDown = function (event) {
        var _a;
        if (disabled)
            return;
        var hasNavigated = false;
        var focusIndex = 0;
        switch (event.key) {
            case 'ArrowDown':
                focusIndex =
                    optionFocused + 1 <= options.length - 1 ? optionFocused + 1 : 0;
                hasNavigated = true;
                break;
            case 'ArrowUp':
                focusIndex =
                    optionFocused - 1 >= 0 ? optionFocused - 1 : options.length - 1;
                hasNavigated = true;
                break;
            case 'Enter':
                onValueSelected(options[optionFocused]);
                if (changeValueOnSelect) {
                    onChange(options[optionFocused].label);
                }
                setIsFocused(false);
                if (inputSearchRef && inputSearchRef.current) {
                    inputSearchRef.current.blur();
                }
                break;
            default:
                return;
        }
        setOptionFocused(focusIndex);
        if (hasNavigated) {
            var elementToScroll = (_a = optionsListRef.current) === null || _a === void 0 ? void 0 : _a.querySelectorAll('button')[focusIndex];
            if (elementToScroll) {
                elementToScroll.scrollIntoView(false);
            }
        }
    };
    var shouldDisplayOptionsList = showEmptyOptions
        ? isFocused
        : isFocused && options.length > 0;
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ className: SearchInput_module_scss_1.default['ds-search-input__wrapper'], ref: wrapperRef, "data-testid": "search-input" }, { children: [(0, jsx_runtime_1.jsx)(InputBase_1.InputBase, __assign({ type: "text", value: value, label: label, onChange: function (event) { return onChange(event.target.value); }, onKeyDown: function (event) { return handleKeyDown(event); }, ref: inputSearchRef, icon: "search", disabled: disabled, variant: variant, readOnly: readOnly }, props)), (0, jsx_runtime_1.jsxs)("div", __assign({ ref: optionsListRef, className: (0, classnames_1.default)(SearchInput_module_scss_1.default['ds-search-input__list'], SearchInput_module_scss_1.default["ds-search-input__list--".concat(variant)], (_b = {},
                    _b[SearchInput_module_scss_1.default['ds-search-input__list--visible']] = shouldDisplayOptionsList,
                    _b), SearchInput_module_scss_1.default[theme]), "data-testid": "search-input-list" }, { children: [options &&
                        options.map(function (option, index) {
                            var _a, _b, _c;
                            return ((0, jsx_runtime_1.jsx)("button", __assign({ type: "button", ref: function (ref) {
                                    if (ref)
                                        optionsRefs[index] = ref;
                                }, title: option.label, onClick: function (event) { return handleClickEvent(event, option, index); }, className: (0, classnames_1.default)(SearchInput_module_scss_1.default['ds-search-input__list__item'], SearchInput_module_scss_1.default["ds-search-input__list__item--".concat(variant)], (_a = {},
                                    _a[SearchInput_module_scss_1.default['ds-search-input__list__item--selected']] = value === option.label,
                                    _a), (_b = {},
                                    _b[SearchInput_module_scss_1.default['ds-search-input__list__item--focused']] = optionFocused === index,
                                    _b), (_c = {},
                                    _c[SearchInput_module_scss_1.default['ds-search-input__list__item--overflow']] = !autosizeOptions,
                                    _c), SearchInput_module_scss_1.default[theme]) }, { children: option.label }), option.value));
                        }), options.length === 0 && ((0, jsx_runtime_1.jsx)("div", __assign({ className: (0, classnames_1.default)(SearchInput_module_scss_1.default['ds-search-input__list__item--no-results'], SearchInput_module_scss_1.default["ds-search-input__list__item--no-results--".concat(variant)], SearchInput_module_scss_1.default[theme]) }, { children: (0, jsx_runtime_1.jsx)("p", { children: emptyMessage }) })))] }))] })));
}
exports.SearchInput = SearchInput;
