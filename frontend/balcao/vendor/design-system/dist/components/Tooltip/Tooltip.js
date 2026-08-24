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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tooltip = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable consistent-return */
var react_1 = require("react");
var react_dom_1 = require("@floating-ui/react-dom");
var classnames_1 = __importDefault(require("classnames"));
var Tooltip_module_scss_1 = __importDefault(require("./Tooltip.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
var Tooltip = function (_a) {
    var _b;
    var anchorRef = _a.anchorRef, visible = _a.visible, _c = _a.position, position = _c === void 0 ? 'top-start' : _c, icon = _a.icon, text = _a.text, children = _a.children;
    var arrowRef = (0, react_1.useRef)(null);
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    var _d = (0, react_dom_1.useFloating)({
        placement: position,
        middleware: [
            (0, react_dom_1.offset)(16),
            (0, react_dom_1.shift)({ padding: 16 }),
            (0, react_dom_1.flip)({ padding: 16 }),
            (0, react_dom_1.arrow)({ element: arrowRef, padding: 20 }),
        ],
    }), reference = _d.reference, floating = _d.floating, update = _d.update, refs = _d.refs, placement = _d.placement, tooltipX = _d.x, tooltipY = _d.y, _e = _d.middlewareData.arrow, _f = _e === void 0 ? {} : _e, arrowX = _f.x, arrowY = _f.y;
    (0, react_1.useEffect)(function () {
        if (!refs.floating.current || !refs.reference.current) {
            return;
        }
        var parents = __spreadArray(__spreadArray([], (0, react_dom_1.getScrollParents)(refs.reference.current), true), (0, react_dom_1.getScrollParents)(refs.floating.current), true);
        parents.forEach(function (parent) {
            parent.addEventListener('resize', update);
        });
        return function () {
            parents.forEach(function (parent) {
                parent.removeEventListener('resize', update);
            });
        };
    }, [refs.floating.current, refs.reference.current, update]);
    (0, react_1.useLayoutEffect)(function () {
        reference(anchorRef.current);
    }, [anchorRef, reference]);
    (0, react_1.useEffect)(function () {
        update();
    }, [visible, update]);
    var getArrowSide = function () {
        return ({
            top: 'bottom',
            right: 'left',
            bottom: 'top',
            left: 'right',
        }[placement.split('-')[0]] || '');
    };
    if (visible) {
        return ((0, jsx_runtime_1.jsxs)("div", __assign({ ref: floating, className: (0, classnames_1.default)(Tooltip_module_scss_1.default['ds-tooltip__wrapper'], Tooltip_module_scss_1.default[theme]), style: {
                position: 'absolute',
                left: tooltipX !== null && tooltipX !== void 0 ? tooltipX : '',
                top: tooltipY !== null && tooltipY !== void 0 ? tooltipY : '',
            } }, { children: [(0, jsx_runtime_1.jsxs)("div", __assign({ className: Tooltip_module_scss_1.default['ds-tooltip__content'] }, { children: [icon && ((0, jsx_runtime_1.jsx)("div", __assign({ className: Tooltip_module_scss_1.default['ds-tooltip__icon'] }, { children: (0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)("icon-".concat(icon), Tooltip_module_scss_1.default[theme]) }) }))), text && ((0, jsx_runtime_1.jsx)("p", __assign({ className: (0, classnames_1.default)(Tooltip_module_scss_1.default['ds-tooltip__text'], Tooltip_module_scss_1.default[theme]) }, { children: text }))), children && ((0, jsx_runtime_1.jsx)("div", __assign({ className: (0, classnames_1.default)(Tooltip_module_scss_1.default['ds-tooltip__children'], Tooltip_module_scss_1.default[theme]) }, { children: children })))] })), (0, jsx_runtime_1.jsx)("div", { ref: arrowRef, style: (_b = {
                            left: arrowX !== null && arrowX !== void 0 ? arrowX : '',
                            top: arrowY !== null && arrowY !== void 0 ? arrowY : '',
                            right: '',
                            bottom: ''
                        },
                        _b[getArrowSide()] = '-8px',
                        _b), className: (0, classnames_1.default)(Tooltip_module_scss_1.default['ds-tooltip__arrow'], Tooltip_module_scss_1.default["ds-tooltip__arrow--".concat(getArrowSide())]) })] })));
    }
    return null;
};
exports.Tooltip = Tooltip;
