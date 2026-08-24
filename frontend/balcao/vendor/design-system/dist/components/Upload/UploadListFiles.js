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
exports.UploadListFiles = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
/* eslint-disable no-nested-ternary */
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var UploadListFiles_module_scss_1 = __importDefault(require("./UploadListFiles.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
var UploadListFiles = function (_a) {
    var title = _a.title, items = _a.items, _b = _a.removable, removable = _b === void 0 ? true : _b, onCallbackRemove = _a.onCallbackRemove;
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    return ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: items && items.length > 0 && ((0, jsx_runtime_1.jsxs)("div", __assign({ id: "list-files", "data-testid": "list-files", className: UploadListFiles_module_scss_1.default['ds-upload-list-files__container'] }, { children: [title && ((0, jsx_runtime_1.jsx)("div", __assign({ className: UploadListFiles_module_scss_1.default['ds-upload-list-files__title'] }, { children: title }))), (0, jsx_runtime_1.jsx)("div", __assign({ id: "list-itens", className: UploadListFiles_module_scss_1.default['ds-upload-list-files__items-wrapper'] }, { children: items.map(function (item) {
                        var _a, _b;
                        return ((0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)([UploadListFiles_module_scss_1.default["ds-upload-list-files__item"]], (_a = {},
                                _a[UploadListFiles_module_scss_1.default["ds-upload-list-files__item"]] = item.status === 'processing' ||
                                    item.status === 'loading',
                                _a), (_b = {},
                                _b[UploadListFiles_module_scss_1.default["ds-upload-list-files__item--over"]] = item.status !== 'processing' &&
                                    item.status !== 'loading',
                                _b), UploadListFiles_module_scss_1.default[theme]) }, { children: [(0, jsx_runtime_1.jsxs)("div", __assign({ className: UploadListFiles_module_scss_1.default['ds-upload-list-files__item-card'] }, { children: [(0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)(UploadListFiles_module_scss_1.default['ds-upload__icon'], 'icon-file', UploadListFiles_module_scss_1.default[theme]) }), (0, jsx_runtime_1.jsxs)("div", __assign({ className: UploadListFiles_module_scss_1.default['ds-upload-list-files__item-wrapper'] }, { children: [(0, jsx_runtime_1.jsx)("span", __assign({ className: UploadListFiles_module_scss_1.default[theme] }, { children: item.file.name })), removable &&
                                                    item.status !== 'loading' &&
                                                    item.status !== 'processing' && ((0, jsx_runtime_1.jsx)("button", __assign({ id: "remove-file", "data-testid": "remove-file", type: "button", onClick: function () {
                                                        return onCallbackRemove && onCallbackRemove(item.id);
                                                    } }, { children: (0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)('icon-delete', UploadListFiles_module_scss_1.default[theme]) }) })))] }))] })), item.status === 'loading' ? ((0, jsx_runtime_1.jsx)("div", __assign({ id: "load-bar", "data-testid": "load-bar", className: (0, classnames_1.default)(UploadListFiles_module_scss_1.default['ds-upload-list-files__loader'], UploadListFiles_module_scss_1.default[theme]) }, { children: (0, jsx_runtime_1.jsx)("div", { className: (0, classnames_1.default)(UploadListFiles_module_scss_1.default['ds-upload-list-files__loader-bar'], UploadListFiles_module_scss_1.default[theme]) }) }))) : ((0, jsx_runtime_1.jsx)("div", __assign({ id: "file-process", "data-testid": "file-process", className: item.status === 'success' ||
                                        item.status === 'processing'
                                        ? (0, classnames_1.default)(UploadListFiles_module_scss_1.default['ds-upload-list-files__item-status'], UploadListFiles_module_scss_1.default[theme])
                                        : (0, classnames_1.default)(UploadListFiles_module_scss_1.default['ds-upload-list-files__item-status'], UploadListFiles_module_scss_1.default['ds-upload-list-files__item-status--error'], UploadListFiles_module_scss_1.default[theme]) }, { children: item.status === 'success'
                                        ? "".concat((item.file.size / 1048576).toFixed(2), " MB")
                                        : item.status === 'processing'
                                            ? 'Processando arquivo...'
                                            : item.status === 'error-read'
                                                ? 'Erro no arquivo'
                                                : 'Erro no envio' })))] }), item.id));
                    }) }))] }))) }));
};
exports.UploadListFiles = UploadListFiles;
