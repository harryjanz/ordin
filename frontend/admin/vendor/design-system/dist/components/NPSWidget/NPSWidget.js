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
exports.NPSWidget = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
/* eslint-disable jsx-a11y/tabindex-no-positive */
/* eslint-disable jsx-a11y/no-noninteractive-element-to-interactive-role */
/* eslint-disable consistent-return */
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var Button_1 = require("../Button");
var TextArea_1 = require("../TextArea");
var ThemeProvider_1 = require("../ThemeProvider");
var constants_1 = require("./constants");
var NPSWidget_module_scss_1 = __importDefault(require("./NPSWidget.module.scss"));
var NPSWidget = function (_a) {
    var _b, _c, _d, _e, _f, _g, _h, _j;
    var id = _a.id, isOpen = _a.isOpen, title = _a.title, subtitles = _a.subtitles, onSubmit = _a.onSubmit, onClose = _a.onClose, _k = _a.type, type = _k === void 0 ? 'horizontal' : _k, _l = _a.position, position = _l === void 0 ? 'bottom-right' : _l;
    var _m = (0, react_1.useState)(null), score = _m[0], setScore = _m[1];
    var _o = (0, react_1.useState)(''), comment = _o[0], setComment = _o[1];
    var _p = (0, react_1.useState)(false), renderFinish = _p[0], setRenderFinish = _p[1];
    var closeButtonRef = (0, react_1.useRef)(null);
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    var options = (0, react_1.useMemo)(function () {
        return ((0, jsx_runtime_1.jsx)(jsx_runtime_1.Fragment, { children: Array.from({ length: 11 }).map(function (_, index) {
                var _a;
                return ((0, jsx_runtime_1.jsxs)("label", __assign({ id: "".concat(id, "-").concat(index.toString(), "-radio-label"), "aria-label": "Nota ".concat(index.toString()), htmlFor: "".concat(id, "-").concat(index.toString(), "-radio-button"), className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__radio'], (_a = {},
                        _a[NPSWidget_module_scss_1.default['ds-npswidget__radio--vertical']] = type === 'vertical',
                        _a), NPSWidget_module_scss_1.default[theme]) }, { children: [index, (0, jsx_runtime_1.jsx)("input", { "aria-checked": score === index, "aria-labelledby": "".concat(id, "-").concat(index.toString(), "-radio-label"), type: "radio", className: NPSWidget_module_scss_1.default['ds-npswidget__input'], name: "score", tabIndex: index + 3, id: "".concat(id, "-").concat(index.toString(), "-radio-button"), "data-testid": "".concat(id, "-").concat(index.toString(), "-radio-button"), value: index, checked: score === index, onChange: function (e) { return handleScoreChange(Number(e.target.value)); } })] }), "".concat(id, "-").concat(index.toString())));
            }) }));
    }, [id, type, theme, score]);
    var handleScoreChange = function (value) { return setScore(value); };
    var handleCommentChange = function (value) { return setComment(value); };
    var handleSubmit = function (e) {
        var _a;
        e.preventDefault();
        if (score !== null) {
            onSubmit(score, comment);
            setRenderFinish(true);
            (_a = closeButtonRef.current) === null || _a === void 0 ? void 0 : _a.focus();
        }
    };
    var renderFinishContent = function () {
        return ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("h2", __assign({ className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__finish-title'], NPSWidget_module_scss_1.default[theme]) }, { children: "Obrigado!" })), (0, jsx_runtime_1.jsx)("p", __assign({ className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__finish-text'], NPSWidget_module_scss_1.default[theme]) }, { children: "Agradecemos a sua participa\u00E7\u00E3o." }))] }));
    };
    var renderFooter = function () {
        var _a, _b;
        if (score === null)
            return null;
        var subtitle = getSubtitle();
        return ((0, jsx_runtime_1.jsxs)("footer", __assign({ className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__footer'], (_a = {},
                _a[NPSWidget_module_scss_1.default['ds-npswidget__footer--vertical']] = type === 'vertical',
                _a)) }, { children: [(0, jsx_runtime_1.jsx)("h3", __assign({ "aria-live": "polite", className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__subtitle'], (_b = {},
                        _b[NPSWidget_module_scss_1.default['ds-npswidget__subtitle--vertical']] = type === 'vertical',
                        _b), NPSWidget_module_scss_1.default[theme]) }, { children: subtitle })), (0, jsx_runtime_1.jsx)(TextArea_1.TextArea, { id: "".concat(id, "-comment-textarea"), "data-testid": "".concat(id, "-comment-textarea"), placeholder: "", label: "Comente sobre sua nota", variant: "medium", value: comment, onChange: function (e) { return handleCommentChange(e.target.value); }, rows: 3, tabIndex: 15 }), (0, jsx_runtime_1.jsx)(Button_1.Button, __assign({ id: "".concat(id, "-submit-button"), "data-testid": "".concat(id, "-submit-button"), "aria-label": "Enviar avalia\u00E7\u00E3o de nota ".concat(score), type: "submit", size: type === 'vertical' ? 'medium' : 'small', tabIndex: 16 }, { children: "Enviar" }))] })));
    };
    var getSubtitle = function () {
        var subtitleList = subtitles || constants_1.SUBTITLES;
        if (score === null)
            return '';
        if (score <= 6)
            return subtitleList.detractor;
        if (score > 6 && score <= 8)
            return subtitleList.passive;
        if (score > 8 && score <= 10)
            return subtitleList.promoter;
        return subtitleList.passive;
    };
    return ((0, jsx_runtime_1.jsxs)("dialog", __assign({ id: "".concat(id, "-wrapper-dialog"), "data-testid": "".concat(id, "-wrapper-dialog"), "aria-labelledby": "".concat(id, "-dialog-title"), "aria-describedby": "".concat(id, "-dialog-description"), "aria-modal": "true", "aria-live": "assertive", className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__wrapper'], (_b = {},
            _b[NPSWidget_module_scss_1.default['ds-npswidget__wrapper--vertical']] = type === 'vertical',
            _b), (_c = {},
            _c[NPSWidget_module_scss_1.default["ds-npswidget__wrapper--".concat(position)]] = type === 'vertical',
            _c), NPSWidget_module_scss_1.default[theme]), open: isOpen }, { children: [(0, jsx_runtime_1.jsx)("button", __assign({ id: "".concat(id, "-close-button"), "data-testid": "".concat(id, "-close-button"), type: "button", "aria-label": "Fechar", className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__close'], NPSWidget_module_scss_1.default[theme]), onClick: function () { return onClose(); }, tabIndex: 1, ref: closeButtonRef }, { children: (0, jsx_runtime_1.jsx)("i", { className: "icon-x" }) })), (0, jsx_runtime_1.jsx)("section", __assign({ className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__section'], (_d = {},
                    _d[NPSWidget_module_scss_1.default['ds-npswidget__section--vertical']] = type === 'vertical',
                    _d)) }, { children: !renderFinish ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsx)("h2", __assign({ id: "".concat(id, "-dialog-title"), className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__title'], (_e = {},
                                _e[NPSWidget_module_scss_1.default['ds-npswidget__title--vertical']] = type === 'vertical',
                                _e), NPSWidget_module_scss_1.default[theme]) }, { children: title })), (0, jsx_runtime_1.jsx)("p", __assign({ id: "".concat(id, "-dialog-description"), className: NPSWidget_module_scss_1.default['ds-npswidget__description'] }, { children: "Numa escala de 0 a 10, selecione 0 para improv\u00E1vel e 10 para muito prov\u00E1vel" })), (0, jsx_runtime_1.jsxs)("form", __assign({ className: NPSWidget_module_scss_1.default['ds-npswidget__form'], onSubmit: function (e) { return handleSubmit(e); } }, { children: [(0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__label'], NPSWidget_module_scss_1.default['ds-npswidget__label--vertical'], (_f = {},
                                        _f[NPSWidget_module_scss_1.default['ds-npswidget__label--active']] = type === 'vertical',
                                        _f), NPSWidget_module_scss_1.default[theme]) }, { children: "Sendo 0 para \u201DImprov\u00E1vel\u201D e 10 \u201DMuito prov\u00E1vel\u201D" })), (0, jsx_runtime_1.jsxs)("fieldset", __assign({ tabIndex: 2, "aria-label": "radio group", role: "radiogroup", className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__radio-group'], (_g = {},
                                        _g[NPSWidget_module_scss_1.default['ds-npswidget__radio-group--vertical']] = type === 'vertical',
                                        _g), NPSWidget_module_scss_1.default[theme]) }, { children: [(0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__label'], NPSWidget_module_scss_1.default['ds-npswidget__label--horizontal'], (_h = {},
                                                _h[NPSWidget_module_scss_1.default['ds-npswidget__label--active']] = type === 'horizontal',
                                                _h), NPSWidget_module_scss_1.default[theme]) }, { children: "Improv\u00E1vel" })), options, (0, jsx_runtime_1.jsx)("span", __assign({ className: (0, classnames_1.default)(NPSWidget_module_scss_1.default['ds-npswidget__label'], [NPSWidget_module_scss_1.default['ds-npswidget__label--horizontal']], (_j = {},
                                                _j[NPSWidget_module_scss_1.default['ds-npswidget__label--active']] = type === 'horizontal',
                                                _j), NPSWidget_module_scss_1.default[theme]) }, { children: "Muito prov\u00E1vel" }))] })), renderFooter()] }))] })) : (renderFinishContent()) }))] })));
};
exports.NPSWidget = NPSWidget;
