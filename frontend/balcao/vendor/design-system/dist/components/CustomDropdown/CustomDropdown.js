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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
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
exports.CustomDropdown = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var classnames_1 = __importDefault(require("classnames"));
var react_1 = __importStar(require("react"));
var InputBase_1 = require("../InputBase");
var CustomDropdown_module_scss_1 = __importDefault(require("./CustomDropdown.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
var CustomDropdown = function (_a) {
    var _b, _c, _d;
    var _e = _a.inputLabel, inputLabel = _e === void 0 ? '' : _e, _f = _a.inputValue, inputValue = _f === void 0 ? '' : _f, _g = _a.disabled, disabled = _g === void 0 ? false : _g, _h = _a.closeActionToChildren, closeActionToChildren = _h === void 0 ? false : _h, _j = _a.loading, loading = _j === void 0 ? false : _j, _k = _a.readOnly, readOnly = _k === void 0 ? false : _k, children = _a.children, props = __rest(_a, ["inputLabel", "inputValue", "disabled", "closeActionToChildren", "loading", "readOnly", "children"]);
    var wrapperRef = (0, react_1.useRef)(null);
    var inputRef = (0, react_1.useRef)(null);
    var _l = (0, react_1.useState)(false), contentVisible = _l[0], setContentVisible = _l[1];
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    (0, react_1.useEffect)(function () {
        if (!wrapperRef || !wrapperRef.current || !inputRef || !inputRef.current)
            return;
        var hideContent = function (event) {
            var _a;
            if (!((_a = wrapperRef === null || wrapperRef === void 0 ? void 0 : wrapperRef.current) === null || _a === void 0 ? void 0 : _a.contains(event.target)) ||
                disabled ||
                readOnly) {
                setContentVisible(false);
            }
        };
        document.addEventListener('mousedown', hideContent);
        /* eslint-disable-next-line consistent-return */
        return function () { return document.removeEventListener('mousedown', hideContent); };
    }, [wrapperRef, inputRef, contentVisible, disabled, readOnly]);
    var toggleContentVisibility = function () {
        if (disabled || readOnly) {
            setContentVisible(false);
            return;
        }
        setContentVisible(!contentVisible);
    };
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ ref: wrapperRef, className: (0, classnames_1.default)(CustomDropdown_module_scss_1.default['ds-custom-dropdown__wrapper'], (_b = {},
            _b[CustomDropdown_module_scss_1.default['ds-custom-dropdown__wrapper--focused']] = contentVisible,
            _b), (_c = {},
            _c[CustomDropdown_module_scss_1.default['ds-custom-dropdown__wrapper--loading']] = loading,
            _c)) }, { children: [(0, jsx_runtime_1.jsx)("div", __assign({ role: "textbox", tabIndex: 0, onClick: function () { return toggleContentVisibility(); }, onKeyDown: function (e) {
                    if (e.key === 'Enter')
                        toggleContentVisibility();
                } }, { children: (0, jsx_runtime_1.jsx)(InputBase_1.InputBase, __assign({ "aria-readonly": true, type: "text", icon: "chevron-down", _isTypeable: false, ref: inputRef, value: inputValue, label: inputLabel, disabled: disabled, onActionIconClick: undefined, loading: loading, readOnly: readOnly }, props)) })), (0, jsx_runtime_1.jsx)("div", __assign({ className: (0, classnames_1.default)(CustomDropdown_module_scss_1.default['ds-custom-dropdown__content'], CustomDropdown_module_scss_1.default["ds-custom-dropdown__content--".concat(props.variant || 'large')], (_d = {},
                    _d[CustomDropdown_module_scss_1.default['ds-custom-dropdown__content--visible']] = contentVisible,
                    _d), CustomDropdown_module_scss_1.default[theme]) }, { children: react_1.default.Children.map(children, function (child) {
                    if (react_1.default.isValidElement(child) && typeof child.type !== 'string') {
                        return react_1.default.cloneElement(child, {
                            closeDropdown: closeActionToChildren
                                ? function () { return setContentVisible(false); }
                                : null,
                        });
                    }
                    return child;
                }) }))] })));
};
exports.CustomDropdown = CustomDropdown;
