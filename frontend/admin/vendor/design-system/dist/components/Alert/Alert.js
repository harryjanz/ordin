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
exports.Alert = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var nanoid_1 = require("nanoid");
var LinkButton_1 = require("../LinkButton");
var ThemeProvider_1 = require("../ThemeProvider");
var Alert_module_scss_1 = __importDefault(require("./Alert.module.scss"));
var Alert = function (_a) {
    var _b;
    var text = _a.text, variant = _a.variant, icon = _a.icon, _c = _a.width, width = _c === void 0 ? 240 : _c, _d = _a.fullWidth, fullWidth = _d === void 0 ? false : _d, arrow = _a.arrow, actionButtonText = _a.actionButtonText, onActionButtonClick = _a.onActionButtonClick;
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    var handleLinkButtonClick = function () {
        if (onActionButtonClick) {
            onActionButtonClick();
        }
    };
    return ((0, jsx_runtime_1.jsx)("div", __assign({ style: { width: fullWidth ? '100%' : width }, className: (0, classnames_1.default)(Alert_module_scss_1.default[theme], Alert_module_scss_1.default['ds-alert__wrapper'], Alert_module_scss_1.default["ds-alert__wrapper--".concat(variant)], (_b = {}, _b[Alert_module_scss_1.default["ds-alert__wrapper--arrow-".concat(arrow)]] = arrow !== undefined, _b)) }, { children: (0, jsx_runtime_1.jsxs)("div", __assign({ className: Alert_module_scss_1.default['ds-alert__content'] }, { children: [icon && ((0, jsx_runtime_1.jsx)("div", __assign({ className: Alert_module_scss_1.default['ds-alert__icon'] }, { children: (0, jsx_runtime_1.jsx)("i", { className: "icon icon-".concat(icon) }) }))), (0, jsx_runtime_1.jsxs)("p", __assign({ className: (0, classnames_1.default)(Alert_module_scss_1.default['ds-alert__text'], Alert_module_scss_1.default[theme]) }, { children: [' ', text.split(' ').map(function (item) {
                            var updatedText;
                            if (item === '%ACTION_BUTTON%' && actionButtonText) {
                                updatedText = ((0, jsx_runtime_1.jsx)(LinkButton_1.LinkButton, { variant: variant === 'neutral' || variant === 'info'
                                        ? 'primary'
                                        : variant, "data-testid": "alert-linkButton", label: actionButtonText, onClick: function () { return handleLinkButtonClick(); } }, (0, nanoid_1.nanoid)(5)));
                            }
                            else {
                                updatedText =
                                    item !== '%BR%'
                                        ? (updatedText = "".concat(item, " "))
                                        : (updatedText = (0, jsx_runtime_1.jsx)("br", {}, (0, nanoid_1.nanoid)(5)));
                            }
                            return updatedText;
                        })] }))] })) })));
};
exports.Alert = Alert;
