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
exports.Upload = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
/* eslint-disable import/no-extraneous-dependencies */
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var non_secure_1 = require("nanoid/non-secure");
var components_1 = require("../../components");
var Upload_module_scss_1 = __importDefault(require("./Upload.module.scss"));
var Upload = function (_a) {
    var _b, _c;
    var maxFileSize = _a.maxFileSize, multipleFiles = _a.multipleFiles, types = _a.types, onCallbackUpload = _a.onCallbackUpload, helperMessage = _a.helperMessage, _d = _a.width, width = _d === void 0 ? 416 : _d, _e = _a.fullWidth, fullWidth = _e === void 0 ? false : _e, _f = _a.errorMessage, errorMessage = _f === void 0 ? 'Formato inválido' : _f, _g = _a.showMaxFileSize, showMaxFileSize = _g === void 0 ? true : _g;
    var _h = (0, react_1.useState)(false), dragOver = _h[0], setDragOver = _h[1];
    var _j = (0, react_1.useState)([]), dataFiles = _j[0], setDataFiles = _j[1];
    var inputId = (0, react_1.useMemo)(function () { return (0, non_secure_1.nanoid)(5); }, []);
    var inputRef = (0, react_1.useRef)(null);
    var dataMultiple = [];
    var theme = (0, react_1.useContext)(components_1.ThemeContext);
    var handleFilesChange = function (event) {
        event.preventDefault();
        event.stopPropagation();
        var files = event.target.files;
        if (files)
            validateFiles(files);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };
    var enableDropping = function (event) {
        event.preventDefault();
        event.stopPropagation();
        setDragOver(true);
    };
    var handleDrop = function (event) {
        event.preventDefault();
        event.stopPropagation();
        var files = event.dataTransfer.files;
        if (files)
            validateFiles(files);
        setDragOver(false);
        event.dataTransfer.clearData();
    };
    var validateFiles = function (files) {
        var onError = false;
        if (!multipleFiles && files.length > 1) {
            onError = true;
            (0, components_1.makeToast)('error', 'Envie somente 1 arquivo por vez');
            return;
        }
        Array.from(files).forEach(function (file) {
            if (!types.includes(file.type) && types.length > 0) {
                onError = true;
                (0, components_1.makeToast)('error', errorMessage);
            }
            if (file.size > maxFileSize * 1048576) {
                (0, components_1.makeToast)('error', "Utilize arquivos com menos de ".concat(maxFileSize, " MB"));
                onError = true;
            }
            if (file.size <= 0) {
                (0, components_1.makeToast)('error', 'Utilize arquivos com mais de 0 KB');
                onError = true;
            }
        });
        if (onError)
            return;
        updateData(files);
    };
    var updateData = function (files) {
        Array.from(files).map(function (file) {
            return dataMultiple.push({
                id: (0, non_secure_1.nanoid)(8),
                file: file,
                status: types.includes(file.type) &&
                    file.size / 1048576 < maxFileSize &&
                    types.includes(file.type)
                    ? 'success'
                    : 'error-read',
            });
        });
        setDataFiles(dataMultiple);
    };
    (0, react_1.useEffect)(function () {
        if (dataFiles.length > 0)
            onCallbackUpload(dataFiles);
    }, [dataFiles]);
    return ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: (0, jsx_runtime_1.jsxs)("div", __assign({ style: { maxWidth: !fullWidth ? "".concat(width, "px") : '' }, className: (0, classnames_1.default)((_b = {},
                _b[Upload_module_scss_1.default["ds-upload__container--fullWidth"]] = fullWidth,
                _b)) }, { children: [(0, jsx_runtime_1.jsx)("div", __assign({ id: "drop-files", "data-testid": "drop-files", className: (0, classnames_1.default)(Upload_module_scss_1.default['ds-upload__wrapper'], (_c = {},
                        _c[Upload_module_scss_1.default['ds-upload__wrapper--drag-over']] = dragOver,
                        _c), Upload_module_scss_1.default[theme]), onDragOver: enableDropping, onDrop: handleDrop, onDragLeave: function () { return setDragOver(false); } }, { children: (0, jsx_runtime_1.jsxs)("label", __assign({ className: (0, classnames_1.default)(Upload_module_scss_1.default['ds-upload__input-custom'], Upload_module_scss_1.default[theme]), htmlFor: inputId }, { children: [(0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)(Upload_module_scss_1.default['ds-upload__icon'], 'icon-upload-cloud') }), "Clique aqui", (0, jsx_runtime_1.jsxs)("span", { children: ["ou arraste ", multipleFiles ? ' os arquivos' : ' o arquivo'] }), (0, jsx_runtime_1.jsx)("input", { ref: inputRef, id: inputId, "data-testid": "input-files", className: "ds-upload-input-field", type: "file", multiple: multipleFiles, onChange: function (event) { return handleFilesChange(event); } })] })) })), showMaxFileSize && ((0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(Upload_module_scss_1.default['ds-upload__file-size'], Upload_module_scss_1.default[theme]) }, { children: ["Tamanho limite: ", maxFileSize, " MB"] }))), helperMessage && ((0, jsx_runtime_1.jsx)("div", __assign({ className: (0, classnames_1.default)(Upload_module_scss_1.default['ds-upload__helper'], Upload_module_scss_1.default[theme]) }, { children: helperMessage })))] })) }));
};
exports.Upload = Upload;
