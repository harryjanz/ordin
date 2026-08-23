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
exports.ToastComponent = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var react_hot_toast_1 = __importDefault(require("react-hot-toast"));
var Toast_module_scss_1 = __importDefault(require("./Toast.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
var LinkButton_1 = require("../LinkButton");
var ToastComponent = function (_a) {
    var type = _a.type, message = _a.message, toastObject = _a.toastObject, actionButtonText = _a.actionButtonText, onActionButtonClick = _a.onActionButtonClick;
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    var renderIcon = function () {
        if (type === 'neutral')
            return null;
        var icon = '';
        switch (type) {
            case 'success':
                icon = 'check-circle';
                break;
            case 'warning':
                icon = 'alert-circle';
                break;
            case 'error':
                icon = 'x-circle';
                break;
            default:
                break;
        }
        return (0, jsx_runtime_1.jsx)("i", { className: "icon-".concat(icon) });
    };
    var handleLinkButtonClick = function () {
        if (onActionButtonClick) {
            onActionButtonClick();
        }
    };
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(Toast_module_scss_1.default[theme], Toast_module_scss_1.default['ds-toast__wrapper'], Toast_module_scss_1.default["ds-toast__wrapper--".concat(type)]) }, { children: [renderIcon(), (0, jsx_runtime_1.jsx)("p", __assign({ className: Toast_module_scss_1.default['ds-toast__text'] }, { children: message.split(' ').map(function (word) {
                    var updatedText;
                    if (word === '%ACTION_BUTTON%' && actionButtonText) {
                        updatedText = ((0, jsx_runtime_1.jsx)(LinkButton_1.LinkButton, { variant: type === 'neutral' ? 'primary' : type, "data-testid": "toast-linkButton", label: actionButtonText, onClick: function () { return handleLinkButtonClick(); } }));
                    }
                    else {
                        updatedText = "".concat(word, " ");
                    }
                    return updatedText;
                }) })), (0, jsx_runtime_1.jsx)("button", __assign({ className: Toast_module_scss_1.default['ds-toast__close-button'], type: "button", onClick: function () { return react_hot_toast_1.default.dismiss(toastObject.id); }, title: "Fechar" }, { children: (0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)(Toast_module_scss_1.default[theme], 'icon-x') }) }))] })));
};
exports.ToastComponent = ToastComponent;
