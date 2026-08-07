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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckboxMultiselect = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
/* eslint-disable consistent-return */
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var __1 = require("..");
var CheckboxMultiselect_module_scss_1 = __importDefault(require("./CheckboxMultiselect.module.scss"));
var CheckboxMultiselect = function (_a) {
    var _b, _c, _d;
    var id = _a.id, inputValue = _a.inputValue, options = _a.options, onSelectOption = _a.onSelectOption, initialSelection = _a.initialSelection, disabled = _a.disabled, _e = _a.emptyMessage, emptyMessage = _e === void 0 ? 'Sem registros' : _e, _f = _a.showEmptyOptions, showEmptyOptions = _f === void 0 ? true : _f, actionButtons = _a.actionButtons, _g = _a.variant, variant = _g === void 0 ? 'large' : _g, _h = _a.loading, loading = _h === void 0 ? false : _h, _j = _a.readOnly, readOnly = _j === void 0 ? false : _j, props = __rest(_a, ["id", "inputValue", "options", "onSelectOption", "initialSelection", "disabled", "emptyMessage", "showEmptyOptions", "actionButtons", "variant", "loading", "readOnly"]);
    var wrapperRef = (0, react_1.useRef)(null);
    var optionsListRef = (0, react_1.useRef)(null);
    var _k = (0, react_1.useState)(false), isFocused = _k[0], setIsFocused = _k[1];
    var _l = (0, react_1.useState)([]), selection = _l[0], setSelection = _l[1];
    var theme = (0, react_1.useContext)(__1.ThemeContext);
    (0, react_1.useEffect)(function () {
        if (!wrapperRef || !wrapperRef.current)
            return;
        var hideOptionsList = function (event) {
            var _a, _b;
            if ((!((_a = wrapperRef === null || wrapperRef === void 0 ? void 0 : wrapperRef.current) === null || _a === void 0 ? void 0 : _a.contains(event.target)) &&
                !((_b = optionsListRef === null || optionsListRef === void 0 ? void 0 : optionsListRef.current) === null || _b === void 0 ? void 0 : _b.contains(event.target))) ||
                disabled ||
                readOnly) {
                setIsFocused(false);
            }
        };
        document.addEventListener('mousedown', hideOptionsList);
        return function () { return document.removeEventListener('mousedown', hideOptionsList); };
    }, [wrapperRef, isFocused, disabled, readOnly]);
    (0, react_1.useEffect)(function () {
        if (!initialSelection)
            return;
        // Removes an item if there is no option with the same value
        var validSelection = initialSelection.filter(function (initialSelected) { return !!options.find(function (opt) { return opt.value === initialSelected; }); });
        setSelection(validSelection);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialSelection]);
    var handleOptionCheck = function (checked, option) {
        var value = option.value;
        if (checked) {
            setSelection(function (prevSelection) { return __spreadArray(__spreadArray([], prevSelection, true), [value], false); });
        }
        else {
            setSelection(function (prevSelection) { return prevSelection.filter(function (s) { return s !== value; }); });
        }
        if (onSelectOption) {
            onSelectOption(option, checked);
        }
    };
    var handleClearButtonClick = function (clearProps) {
        if (!clearProps)
            return;
        var onClick = clearProps.onClick, closeOnClick = clearProps.closeOnClick;
        if (onClick)
            onClick();
        setSelection([]);
        if (closeOnClick)
            setIsFocused(false);
    };
    var handleApplyButtonClick = function (applyProps) {
        if (!applyProps)
            return;
        var onClick = applyProps.onClick, closeOnClick = applyProps.closeOnClick;
        if (onClick)
            onClick(selection);
        if (closeOnClick)
            setIsFocused(false);
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
    var renderActionButtons = function () {
        if (!actionButtons)
            return null;
        var applyButton = actionButtons.applyButton, clearButton = actionButtons.clearButton, inverseOrder = actionButtons.inverseOrder;
        if (!applyButton && !clearButton)
            return null;
        var apply = applyButton && ((0, jsx_runtime_1.jsx)(__1.Button, __assign({ variant: "primary", "data-testid": "".concat(id, "-chk-multi-apply-btn"), size: applyButton.size || 'medium', onClick: function () { return handleApplyButtonClick(applyButton); }, disabled: applyButton.disabled || false }, { children: (applyButton === null || applyButton === void 0 ? void 0 : applyButton.label) || 'Aplicar' })));
        var clear = clearButton && ((0, jsx_runtime_1.jsx)(__1.Button, __assign({ "data-testid": "".concat(id, "-chk-multi-clear-btn"), variant: "secondary", size: clearButton.size || 'medium', onClick: function () { return handleClearButtonClick(clearButton); }, disabled: clearButton.disabled || false }, { children: (clearButton === null || clearButton === void 0 ? void 0 : clearButton.label) || 'Limpar' })));
        return ((0, jsx_runtime_1.jsx)("div", __assign({ className: CheckboxMultiselect_module_scss_1.default['ds-checkbox-multiselect__buttons-wrapper'] }, { children: inverseOrder ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [apply, clear] })) : ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [clear, apply] })) })));
    };
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ ref: wrapperRef, className: (0, classnames_1.default)(CheckboxMultiselect_module_scss_1.default['ds-checkbox-multiselect__wrapper'], (_b = {},
            _b[CheckboxMultiselect_module_scss_1.default['ds-checkbox-multiselect__wrapper--focused']] = shouldDisplayOptionsList,
            _b), (_c = {},
            _c[CheckboxMultiselect_module_scss_1.default['ds-checkbox-multiselect__wrapper--loading']] = loading,
            _c)) }, { children: [(0, jsx_runtime_1.jsx)("div", __assign({ role: "textbox", tabIndex: 0, onClick: function () { return toggleFocused(); }, onKeyDown: function (e) {
                    if (e.key === 'Enter')
                        toggleFocused();
                } }, { children: (0, jsx_runtime_1.jsx)(__1.InputBase, __assign({ _isTypeable: false, "aria-readonly": true, type: "text", icon: "chevron-down", value: inputValue, disabled: disabled, variant: variant, onActionIconClick: undefined, loading: loading, readOnly: readOnly }, props)) })), (0, jsx_runtime_1.jsxs)("div", __assign({ ref: optionsListRef, className: (0, classnames_1.default)(CheckboxMultiselect_module_scss_1.default['ds-checkbox-multiselect__options'], CheckboxMultiselect_module_scss_1.default["ds-checkbox-multiselect__options--".concat(variant)], (_d = {},
                    _d[CheckboxMultiselect_module_scss_1.default['ds-checkbox-multiselect__options--visible']] = shouldDisplayOptionsList,
                    _d), CheckboxMultiselect_module_scss_1.default[theme]), "data-testid": "".concat(id, "-checkbox-multiselect-options") }, { children: [(0, jsx_runtime_1.jsx)("div", __assign({ className: CheckboxMultiselect_module_scss_1.default['ds-checkbox-multiselect__options-list'] }, { children: options.map(function (option) {
                            var value = option.value, label = option.label, optionDisabled = option.disabled;
                            return ((0, jsx_runtime_1.jsx)("div", __assign({ className: (0, classnames_1.default)(CheckboxMultiselect_module_scss_1.default['ds-checkbox-multiselect__option-item'], CheckboxMultiselect_module_scss_1.default["ds-checkbox-multiselect__option-item--".concat(variant)], CheckboxMultiselect_module_scss_1.default[theme]) }, { children: (0, jsx_runtime_1.jsx)(__1.Checkbox, { id: "".concat(id, "-chk-multi-").concat(value), label: label, disabled: optionDisabled, checked: selection.includes(option.value), onChange: function (checked) { return handleOptionCheck(checked, option); }, variant: variant, title: label }) }), value));
                        }) })), options.length === 0 && ((0, jsx_runtime_1.jsx)("div", __assign({ className: (0, classnames_1.default)(CheckboxMultiselect_module_scss_1.default['ds-checkbox-multiselect__options--no-results'], CheckboxMultiselect_module_scss_1.default["ds-checkbox-multiselect__options--no-results--".concat(variant)], CheckboxMultiselect_module_scss_1.default[theme]) }, { children: (0, jsx_runtime_1.jsx)("p", { children: emptyMessage }) }))), actionButtons && options.length > 0 && renderActionButtons()] }))] })));
};
exports.CheckboxMultiselect = CheckboxMultiselect;
