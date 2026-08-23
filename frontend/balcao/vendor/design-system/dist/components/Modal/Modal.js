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
exports.Modal = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
var react_1 = require("react");
var classnames_1 = __importDefault(require("classnames"));
var nanoid_1 = require("nanoid");
var ModalPortal_1 = require("./ModalPortal");
var Modal_module_scss_1 = __importDefault(require("./Modal.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
function Modal(_a) {
    var _b;
    var children = _a.children, open = _a.open, _c = _a.size, size = _c === void 0 ? 'default' : _c, height = _a.height, width = _a.width, _d = _a.hideCloseButton, hideCloseButton = _d === void 0 ? false : _d, onOpen = _a.onOpen, onClose = _a.onClose, onCloseButtonClick = _a.onCloseButtonClick, onBackdropClick = _a.onBackdropClick, template = _a.template;
    var _e = (0, react_1.useState)(false), overflowing = _e[0], setOverflowing = _e[1];
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    // PATCH (ver vendor/design-system/README.md): nanoid(5) direto no corpo
    // do componente gerava um identifier NOVO a cada render, e o
    // ModalPortal usa esse identifier pra montar/desmontar o container do
    // portal (document.querySelector por id) — resultado: o portal inteiro
    // recriava a cada render do pai (ex: digitar num input controlado
    // dentro do modal), perdendo o foco a cada tecla. useState com
    // inicializador preguiçoso mantém o mesmo identifier durante toda a
    // vida da instância do componente.
    var identifier = (0, react_1.useState)(function () { return (0, nanoid_1.nanoid)(5); })[0];
    var wrapperRef = (0, react_1.useRef)(null);
    // PATCH 2 (ver vendor/design-system/README.md): este efeito rodava de
    // novo toda vez que onOpen/onClose/onBackdropClick/onCloseButtonClick
    // trocavam de referência — o normal quando o consumidor passa funções
    // inline (`onClose={() => ...}`), que são recriadas a cada render do
    // componente pai. Cada vez que o efeito rodava com `open` ainda true,
    // chamava `wrapperRef.current.focus()` de novo, roubando o foco de
    // volta pro modal mesmo com o usuário digitando num campo lá dentro
    // (cada tecla causa um re-render do pai). `hasFocusedRef` garante que
    // o foco automático só acontece uma vez por "sessão" de abertura do
    // modal (reseta quando `open` vira false).
    var hasFocusedRef = (0, react_1.useRef)(false);
    (0, react_1.useEffect)(function () {
        var closeOnEscPress = function (event) {
            if (hideCloseButton)
                return;
            if (event.key === 'Escape') {
                if (onClose) {
                    onClose();
                    return;
                }
                if (onCloseButtonClick) {
                    onCloseButtonClick();
                }
            }
        };
        if (open) {
            if (!hasFocusedRef.current) {
                hasFocusedRef.current = true;
                if (onOpen) {
                    onOpen();
                }
                if (wrapperRef.current) {
                    wrapperRef.current.focus();
                }
            }
            var checkOverflow_1 = function () {
                var _a;
                var windowHeight = window.innerHeight;
                var wrapperHeight = ((_a = wrapperRef.current) === null || _a === void 0 ? void 0 : _a.clientHeight) || 0;
                setOverflowing(wrapperHeight >= windowHeight);
            };
            window.addEventListener('resize', checkOverflow_1);
            window.addEventListener('keydown', closeOnEscPress);
            checkOverflow_1();
            return function () {
                window.removeEventListener('resize', checkOverflow_1);
                window.removeEventListener('keydown', closeOnEscPress);
            };
        }
        hasFocusedRef.current = false;
        window.removeEventListener('keydown', closeOnEscPress);
        return undefined;
    }, [
        open,
        hideCloseButton,
        onOpen,
        onClose,
        onBackdropClick,
        onCloseButtonClick,
        identifier,
    ]);
    function renderCloseButton() {
        if (hideCloseButton)
            return null;
        return ((0, jsx_runtime_1.jsx)("button", __assign({ type: "button", onClick: function () {
                if (onCloseButtonClick)
                    onCloseButtonClick();
                if (onClose)
                    onClose();
            }, className: (0, classnames_1.default)(Modal_module_scss_1.default['ds-modal__close-button'], Modal_module_scss_1.default[theme]), "data-testid": "modal-close-button" }, { children: (0, jsx_runtime_1.jsx)("i", { className: "icon icon-x" }) })));
    }
    function renderTemplate() {
        var _a, _b, _c, _d;
        if (!template)
            return null;
        var content = [];
        var title = template.title, icon = template.icon, text = template.text, buttons = template.buttons;
        if (icon) {
            content.push((0, jsx_runtime_1.jsx)("div", __assign({ className: Modal_module_scss_1.default['ds-modal__icon'] }, { children: icon }), "modal-icon"));
        }
        if (title) {
            var value = title.value, align = title.align;
            content.push((0, jsx_runtime_1.jsx)("h1", __assign({ className: (0, classnames_1.default)(Modal_module_scss_1.default['ds-modal__title'], Modal_module_scss_1.default[theme], (_a = {},
                    _a[Modal_module_scss_1.default['ds-modal__title--centered']] = align === 'center',
                    _a)) }, { children: value }), "modal-title"));
        }
        if (text) {
            var value = text.value, align = text.align, scrollable = text.scrollable;
            content.push((0, jsx_runtime_1.jsx)("p", __assign({ className: (0, classnames_1.default)(Modal_module_scss_1.default['ds-modal__text'], Modal_module_scss_1.default[theme], (_b = {}, _b[Modal_module_scss_1.default['ds-modal__text--centered']] = align === 'center', _b), (_c = {}, _c[Modal_module_scss_1.default['ds-modal__text--scrollable']] = scrollable, _c)) }, { children: value }), "modal-text"));
        }
        if (buttons) {
            var primary = buttons.primary, secondary = buttons.secondary;
            content.push((0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(Modal_module_scss_1.default['ds-modal__button_wrapper'], (_d = {},
                    _d[Modal_module_scss_1.default['ds-modal__button_wrapper--composite']] = !!(primary && secondary),
                    _d)) }, { children: [primary, secondary] }), "modal-buttons"));
        }
        return content;
    }
    var wrapperStyle = (0, react_1.useMemo)(function () {
        var styleObj = {};
        if (width) {
            styleObj.width = "".concat(width, "px");
        }
        if (height) {
            styleObj.height = "".concat(height, "px");
        }
        return styleObj;
    }, [width, height]);
    if (open) {
        return ((0, jsx_runtime_1.jsx)(ModalPortal_1.ModalPortal, __assign({ className: Modal_module_scss_1.default['ds-modal__portal'], identifier: identifier }, { children: (0, jsx_runtime_1.jsx)("div", __assign({ id: "ds-modal-backdrop-".concat(identifier), className: Modal_module_scss_1.default['ds-modal__backdrop'], "data-testid": "modal-backdrop", role: "presentation", tabIndex: 0, onClick: function (event) {
                    if (event.target === event.currentTarget && onBackdropClick) {
                        onBackdropClick();
                        if (onClose)
                            onClose();
                    }
                } }, { children: (0, jsx_runtime_1.jsxs)("div", __assign({ role: "dialog", tabIndex: 0, "aria-label": template && template.title ? template.title.value : 'modal-dialog', ref: wrapperRef, style: wrapperStyle, className: (0, classnames_1.default)(Modal_module_scss_1.default['ds-modal__wrapper'], Modal_module_scss_1.default["ds-modal__wrapper--".concat(size)], (_b = {}, _b[Modal_module_scss_1.default['ds-modal__wrapper--overflowing']] = overflowing, _b)) }, { children: [renderCloseButton(), renderTemplate(), children] })) })) })));
    }
    return null;
}
exports.Modal = Modal;
