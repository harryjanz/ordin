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
exports.TagInput = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var classnames_1 = __importDefault(require("classnames"));
var TagInput_module_scss_1 = __importDefault(require("./TagInput.module.scss"));
require("../../core/icons/icons.css");
var TagInput = function (_a) {
    var _b, _c, _d, _e;
    var label = _a.label, placeholder = _a.placeholder, disabled = _a.disabled, errorMessage = _a.errorMessage, helperMessage = _a.helperMessage, onValueChange = _a.onValueChange, value = _a.value, props = __rest(_a, ["label", "placeholder", "disabled", "errorMessage", "helperMessage", "onValueChange", "value"]);
    function removeTags(tagToRemove) {
        var modifiedTags = __spreadArray([], value.filter(function (item) { return item !== tagToRemove; }), true);
        onValueChange(modifiedTags);
    }
    function addTags(tagToAdd) {
        if (value.includes(tagToAdd)) {
            return;
        }
        if (tagToAdd !== '') {
            var modifiedTags = __spreadArray(__spreadArray([], value, true), [tagToAdd], false);
            onValueChange(modifiedTags);
        }
    }
    function parseInput(valueInput) {
        var valueParsed = valueInput.match(/[a-z]|[A-Z]|[0-9]|[@._-]/g);
        return (valueParsed === null || valueParsed === void 0 ? void 0 : valueParsed.join('')) || '';
    }
    function handleKeyDown(event) {
        if (event.key === 'Enter' ||
            event.key === ',' ||
            event.key === ';' ||
            event.key === ' ') {
            addTags(parseInput(event.target.value));
            event.target.value = '';
        }
        if (event.key === 'Backspace' &&
            event.target.value === '' &&
            value.length > 0) {
            removeTags(value[value.length - 1]);
        }
    }
    function handleChange(event) {
        var valueParsed = event.target.value.match(/[^,;]/g);
        event.target.value = (valueParsed === null || valueParsed === void 0 ? void 0 : valueParsed.join('')) || '';
    }
    var TagsContainer = function () {
        /* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
        return ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: value.map(function (tag) { return ((0, jsx_runtime_1.jsxs)("span", __assign({ className: TagInput_module_scss_1.default['ds-tag-input__tag__container'] }, { children: [(0, jsx_runtime_1.jsx)("span", __assign({ className: TagInput_module_scss_1.default['ds-tag-input__tag__title'] }, { children: tag })), (0, jsx_runtime_1.jsx)("span", __assign({ className: TagInput_module_scss_1.default['ds-tag-input__tag__close'], onClick: function () { return removeTags(tag); } }, { children: (0, jsx_runtime_1.jsx)("i", { className: "icon-delete" }) }))] }), tag)); }) }));
    };
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ className: TagInput_module_scss_1.default['ds-tag-input__wrapper'] }, { children: [(0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(TagInput_module_scss_1.default['ds-tag-input__container'], (_b = {}, _b[TagInput_module_scss_1.default['ds-tag-input__container--disabled']] = disabled, _b), (_c = {},
                    _c[TagInput_module_scss_1.default['ds-tag-input__container--error']] = !!errorMessage,
                    _c), (_d = {}, _d[TagInput_module_scss_1.default['ds-tag-input__container--tagged']] = value.length > 0, _d)) }, { children: [(0, jsx_runtime_1.jsx)(TagsContainer, {}), (0, jsx_runtime_1.jsx)("input", __assign({ disabled: disabled, placeholder: value.length > 0 ? '' : placeholder, className: (0, classnames_1.default)(TagInput_module_scss_1.default['ds-tag-input__field'], (_e = {},
                            _e[TagInput_module_scss_1.default['ds-tag-input__field--tagged']] = value.length > 0,
                            _e)), onKeyDown: handleKeyDown, onChange: handleChange }, props)), (0, jsx_runtime_1.jsx)("span", __assign({ className: TagInput_module_scss_1.default['ds-tag-input__label'] }, { children: label }))] })), errorMessage && ((0, jsx_runtime_1.jsx)("span", __assign({ className: TagInput_module_scss_1.default['ds-tag-input__error'] }, { children: errorMessage }))), helperMessage && ((0, jsx_runtime_1.jsx)("span", __assign({ className: TagInput_module_scss_1.default['ds-tag-input__helper-message'] }, { children: helperMessage })))] })));
};
exports.TagInput = TagInput;
