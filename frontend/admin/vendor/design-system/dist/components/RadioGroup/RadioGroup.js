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
exports.RadioGroup = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var RadioGroupProvider_1 = require("./RadioGroupProvider");
var RadioGroup_module_scss_1 = __importDefault(require("./RadioGroup.module.scss"));
var RadioGroup = function (_a) {
    var name = _a.name, value = _a.value, onChange = _a.onChange, children = _a.children;
    return ((0, jsx_runtime_1.jsx)(RadioGroupProvider_1.RadioGroupProvider, __assign({ name: name, value: value }, { children: (0, jsx_runtime_1.jsx)("fieldset", __assign({ id: "radiogroup-".concat(name), "data-testid": "radiogroup-".concat(name), className: RadioGroup_module_scss_1.default['ds-radiogroup__fieldset'], onChange: function (evt) { return onChange(evt.target.value); } }, { children: children })) })));
};
exports.RadioGroup = RadioGroup;
