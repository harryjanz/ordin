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
exports.CSATWidget = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var CSATWidget_module_scss_1 = __importDefault(require("./CSATWidget.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
var Modal_1 = require("../Modal");
var Button_1 = require("../Button");
var TextArea_1 = require("../TextArea");
var FavoriteIcon_1 = require("./FavoriteIcon");
var CSATWidget = function (_a) {
    var onFeedbackSubmit = _a.onFeedbackSubmit, title = _a.title, modalTitle = _a.modalTitle, finishMessageTitle = _a.finishMessageTitle, finishMessage = _a.finishMessage, placeholderForScoreEqualOrBelowThree = _a.placeholderForScoreEqualOrBelowThree, placeholderForScoreEqualOrGreaterThanFour = _a.placeholderForScoreEqualOrGreaterThanFour;
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    var scoresArray = [1, 2, 3, 4, 5];
    var _b = (0, react_1.useState)(0), focusedScore = _b[0], setFocusedScore = _b[1];
    var _c = (0, react_1.useState)(null), selectedScore = _c[0], setSelectedScore = _c[1];
    var _d = (0, react_1.useState)(''), scoreTitle = _d[0], setScoreTitle = _d[1];
    var _e = (0, react_1.useState)(false), feedbackModalOpen = _e[0], setfeedbackModalOpen = _e[1];
    var _f = (0, react_1.useState)(''), feedback = _f[0], setFeedback = _f[1];
    var _g = (0, react_1.useState)(false), isFeedbackSubmited = _g[0], setIsFeedbackSubmited = _g[1];
    var onBlurTextArea = function (value) {
        if (value !== '') {
            setFeedback(value);
        }
    };
    var handleScoreClick = function (score) {
        setSelectedScore(function (oldScore) { return (oldScore === score ? null : score); });
        scoreDescription(score);
        setfeedbackModalOpen(true);
    };
    var handleSubmit = function () {
        if (selectedScore !== null) {
            setfeedbackModalOpen(false);
            setIsFeedbackSubmited(true);
            setFeedback(feedback);
            onFeedbackSubmit(selectedScore, feedback);
        }
    };
    var handleCloseModal = function () {
        setfeedbackModalOpen(false);
        setSelectedScore(null);
        setFeedback('');
    };
    var scoreDescription = function (selectedScore) {
        var scoreTitles = [
            'Totalmente insatisfeito',
            'Pouco satisfeito',
            'Indiferente',
            'Satisfeito',
            'Totalmente satisfeito',
        ];
        var scoreTitle = scoreTitles[selectedScore - 1];
        setScoreTitle(scoreTitle);
    };
    var templateModal = {
        title: {
            value: modalTitle,
            align: 'center',
        },
        text: {
            value: "".concat(selectedScore, ": ").concat(scoreTitle),
            align: 'center',
        },
    };
    return !isFeedbackSubmited ? ((0, jsx_runtime_1.jsxs)(jsx_runtime_1.Fragment, { children: [(0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(CSATWidget_module_scss_1.default['ds-csat__wrapper'], CSATWidget_module_scss_1.default[theme]) }, { children: [(0, jsx_runtime_1.jsx)("h1", __assign({ className: (0, classnames_1.default)(CSATWidget_module_scss_1.default['ds-csat__title'], CSATWidget_module_scss_1.default[theme]) }, { children: title })), (0, jsx_runtime_1.jsx)("div", __assign({ className: (0, classnames_1.default)(CSATWidget_module_scss_1.default['ds-csat__container-scores'], CSATWidget_module_scss_1.default[theme]) }, { children: scoresArray.map(function (score) { return ((0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(CSATWidget_module_scss_1.default['ds-csat__score'], CSATWidget_module_scss_1.default[theme]), onMouseEnter: function () { return setFocusedScore(score); }, onMouseLeave: function () { return setFocusedScore(-1); } }, { children: [(0, jsx_runtime_1.jsx)("button", __assign({ type: "button", "data-testid": "csat-score-".concat(score), onClick: function () { return handleScoreClick(score); } }, { children: (0, jsx_runtime_1.jsx)(FavoriteIcon_1.FavoriteIcon, { isActive: (selectedScore && score <= selectedScore) ||
                                            score <= focusedScore }) })), (0, jsx_runtime_1.jsx)("span", { children: score })] }), "csat-score-".concat(score))); }) }))] })), (0, jsx_runtime_1.jsxs)(Modal_1.Modal, __assign({ width: 410, height: 435, template: templateModal, onBackdropClick: handleCloseModal, onClose: handleCloseModal, open: feedbackModalOpen }, { children: [(0, jsx_runtime_1.jsx)("div", __assign({ className: (0, classnames_1.default)(CSATWidget_module_scss_1.default['ds-csat__modal-textarea'], CSATWidget_module_scss_1.default[theme]) }, { children: (0, jsx_runtime_1.jsx)(TextArea_1.TextArea, { onBlur: function (event) { return onBlurTextArea(event.target.value); }, placeholder: selectedScore !== null && selectedScore <= 3
                                ? placeholderForScoreEqualOrBelowThree
                                : placeholderForScoreEqualOrGreaterThanFour }) })), (0, jsx_runtime_1.jsx)(Button_1.Button, __assign({ onFocus: handleSubmit, onClick: handleSubmit, fullWidth: true }, { children: "Enviar" }))] }))] })) : ((0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(CSATWidget_module_scss_1.default['ds-csat__csat-finish-container'], CSATWidget_module_scss_1.default[theme]) }, { children: [(0, jsx_runtime_1.jsx)("h1", { children: finishMessageTitle }), (0, jsx_runtime_1.jsx)("p", { children: finishMessage })] })));
};
exports.CSATWidget = CSATWidget;
