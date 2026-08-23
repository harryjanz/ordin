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
exports.Dropdown = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
/* eslint-disable consistent-return */
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var Dropdown_module_scss_1 = __importDefault(require("./Dropdown.module.scss"));
var InputBase_1 = require("../InputBase");
var ThemeProvider_1 = require("../ThemeProvider");
function Dropdown(_a) {
    var _b, _c, _d;
    var _e = _a.label, label = _e === void 0 ? '' : _e, _f = _a.placeholder, placeholder = _f === void 0 ? '' : _f, value = _a.value, onValueSelected = _a.onValueSelected, _g = _a.options, options = _g === void 0 ? [] : _g, _h = _a.emptyMessage, emptyMessage = _h === void 0 ? 'Sem registros' : _h, disabled = _a.disabled, _j = _a.variant, variant = _j === void 0 ? 'large' : _j, _k = _a.showEmptyOptions, showEmptyOptions = _k === void 0 ? true : _k, _l = _a.autosizeOptions, autosizeOptions = _l === void 0 ? true : _l, _m = _a.loading, loading = _m === void 0 ? false : _m, _o = _a.readOnly, readOnly = _o === void 0 ? false : _o, props = __rest(_a, ["label", "placeholder", "value", "onValueSelected", "options", "emptyMessage", "disabled", "variant", "showEmptyOptions", "autosizeOptions", "loading", "readOnly"]);
    var _p = (0, react_1.useState)(0), optionFocused = _p[0], setOptionFocused = _p[1];
    var _q = (0, react_1.useState)(false), isFocused = _q[0], setIsFocused = _q[1];
    var dropdownInputRef = (0, react_1.useRef)(null);
    var wrapperRef = (0, react_1.useRef)(null);
    var optionsListRef = (0, react_1.useRef)(null);
    var itemsRefs = [];
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    (0, react_1.useEffect)(function () {
        if (!wrapperRef || !wrapperRef.current)
            return;
        var hideOptionsList = function (event) {
            var _a;
            if (!((_a = wrapperRef === null || wrapperRef === void 0 ? void 0 : wrapperRef.current) === null || _a === void 0 ? void 0 : _a.contains(event.target)) ||
                disabled ||
                readOnly) {
                setIsFocused(false);
            }
        };
        document.addEventListener('mousedown', hideOptionsList);
        return function () { return document.removeEventListener('mousedown', hideOptionsList); };
    }, [wrapperRef, disabled, readOnly]);
    var handleClickEvent = function (event, option, index) {
        event.preventDefault();
        if (disabled)
            return;
        onValueSelected(option);
        setIsFocused(false);
        var ref = itemsRefs[index];
        if (ref) {
            ref.blur();
        }
    };
    var handleKeyDown = function (event) {
        var _a;
        if (disabled)
            return;
        var focusIndex = 0;
        switch (event.key) {
            case 'ArrowDown':
                focusIndex =
                    optionFocused + 1 <= options.length - 1 ? optionFocused + 1 : 0;
                break;
            case 'ArrowUp':
                focusIndex =
                    optionFocused - 1 >= 0 ? optionFocused - 1 : options.length - 1;
                break;
            case 'Enter':
                onValueSelected(options[optionFocused]);
                setIsFocused(false);
                if (dropdownInputRef && dropdownInputRef.current) {
                    dropdownInputRef.current.blur();
                }
                break;
            default:
                break;
        }
        setOptionFocused(focusIndex);
        var elementToScroll = (_a = optionsListRef.current) === null || _a === void 0 ? void 0 : _a.querySelectorAll('button')[focusIndex];
        if (elementToScroll) {
            elementToScroll.scrollIntoView(false);
        }
    };
    var toggleFocused = function () {
        if (disabled || readOnly) {
            setIsFocused(false);
            return;
        }
        setIsFocused(!isFocused);
    };
    var shouldDisplayOptionsList = showEmptyOptions
        ? isFocused
        : isFocused && options.length > 0;
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(Dropdown_module_scss_1.default['ds-dropdown-input__wrapper'], (_b = {},
            _b[Dropdown_module_scss_1.default['ds-dropdown-input__wrapper--focused']] = shouldDisplayOptionsList,
            _b), (_c = {},
            _c[Dropdown_module_scss_1.default['ds-dropdown-input__wrapper--loading']] = loading,
            _c)), ref: wrapperRef, "data-testid": "dropdown-input", role: "textbox", tabIndex: 0, onClick: function () { return toggleFocused(); }, onKeyDown: function (e) {
            if (e.key === 'Enter')
                toggleFocused();
        } }, { children: [(0, jsx_runtime_1.jsx)(InputBase_1.InputBase, __assign({ ref: dropdownInputRef, label: label, placeholder: placeholder, type: "text", value: (value === null || value === void 0 ? void 0 : value.label) || '', onKeyDown: function (event) {
                    return handleKeyDown(event);
                }, onActionIconClick: undefined, icon: "chevron-down", _isTypeable: false, disabled: disabled, variant: variant, loading: loading, readOnly: readOnly }, props)), (0, jsx_runtime_1.jsxs)("div", __assign({ ref: optionsListRef, className: (0, classnames_1.default)(Dropdown_module_scss_1.default['ds-dropdown-input__list'], Dropdown_module_scss_1.default["ds-dropdown-input__list--".concat(variant)], (_d = {},
                    _d[Dropdown_module_scss_1.default['ds-dropdown-input__list--visible']] = shouldDisplayOptionsList,
                    _d), Dropdown_module_scss_1.default[theme]), "data-testid": "dropdown-input-list" }, { children: [options.map(function (option, index) {
                        var _a, _b, _c;
                        return ((0, jsx_runtime_1.jsx)("button", __assign({ type: "button", ref: function (ref) {
                                if (ref)
                                    itemsRefs[index] = ref;
                            }, title: option.label, className: (0, classnames_1.default)(Dropdown_module_scss_1.default['ds-dropdown-input__list__item'], Dropdown_module_scss_1.default["ds-dropdown-input__list__item--".concat(variant)], (_a = {},
                                _a[Dropdown_module_scss_1.default['ds-dropdown-input__list__item--selected']] = (value === null || value === void 0 ? void 0 : value.label) === option.label,
                                _a), (_b = {},
                                _b[Dropdown_module_scss_1.default['ds-dropdown-input__list__item--focused']] = optionFocused === index,
                                _b), (_c = {},
                                _c[Dropdown_module_scss_1.default['ds-dropdown-input__list__item--overflow']] = !autosizeOptions,
                                _c), Dropdown_module_scss_1.default[theme]), onClick: function (event) { return handleClickEvent(event, option, index); } }, { children: option.label }), option.value));
                    }), options.length === 0 && ((0, jsx_runtime_1.jsx)("div", __assign({ className: (0, classnames_1.default)(Dropdown_module_scss_1.default['ds-dropdown-input__list__item--no-results'], Dropdown_module_scss_1.default["ds-dropdown-input__list__item--no-results--".concat(variant)], Dropdown_module_scss_1.default[theme]) }, { children: (0, jsx_runtime_1.jsx)("p", { children: emptyMessage }) })))] }))] })));
}
exports.Dropdown = Dropdown;
