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
exports.RadioButton = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var RadioButton_module_scss_1 = __importDefault(require("./RadioButton.module.scss"));
var RadioGroupProvider_1 = require("../RadioGroup/RadioGroupProvider");
exports.RadioButton = (0, react_1.forwardRef)(function (_a, ref) {
    var id = _a.id, value = _a.value, label = _a.label, rest = __rest(_a, ["id", "value", "label"]);
    var _b = (0, react_1.useContext)(RadioGroupProvider_1.RadioGroupContext), groupValue = _b.value, name = _b.name;
    var isChecked = groupValue === value;
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ className: RadioButton_module_scss_1.default['ds-radio-button'] }, { children: [(0, jsx_runtime_1.jsxs)("label", __assign({ htmlFor: id, className: RadioButton_module_scss_1.default['ds-radio-button__label'] }, { children: [(0, jsx_runtime_1.jsx)("input", __assign({ type: "radio", ref: ref, id: id, value: value, name: name, checked: isChecked, className: RadioButton_module_scss_1.default['ds-radio-button__input'], readOnly: true }, rest)), (0, jsx_runtime_1.jsx)("span", __assign({ className: RadioButton_module_scss_1.default['ds-radio-button__radio'] }, { children: isChecked && (0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)('icon', 'icon-check') }) }))] })), (0, jsx_runtime_1.jsx)("label", __assign({ htmlFor: id, className: RadioButton_module_scss_1.default['ds-radio-button__text'] }, { children: label }))] })));
});
exports.default = exports.RadioButton;
