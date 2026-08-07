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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tabs = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var react_1 = __importStar(require("react"));
var classnames_1 = __importDefault(require("classnames"));
var Divider_1 = require("../Divider");
var Tabs_module_scss_1 = __importDefault(require("./Tabs.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
var Tabs = function (_a) {
    var activeTab = _a.activeTab, onSelectTab = _a.onSelectTab, _b = _a.withDivider, withDivider = _b === void 0 ? false : _b, children = _a.children;
    var _c = (0, react_1.useState)(null), tabToRender = _c[0], setTabToRender = _c[1];
    var _d = (0, react_1.useState)(), indicatorLeft = _d[0], setIndicatorLeft = _d[1];
    var _e = (0, react_1.useState)(), indicatorWidth = _e[0], setindicatorWidth = _e[1];
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    (0, react_1.useEffect)(function () {
        setTabToRender(children.find(function (child) { return child.props.value === activeTab; }) || children[0]);
        updateIndicatorState(activeTab);
        var resizeTimer;
        var updateOnResize = function () {
            // timer to only update when user stops resizing
            window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(function () { return updateIndicatorState(activeTab); }, 50);
        };
        window.addEventListener('resize', updateOnResize);
        return function () {
            window.removeEventListener('resize', updateOnResize);
        };
    }, [children, activeTab]);
    var updateIndicatorState = function (tab) {
        var activeTabRef = document.querySelector("[data-tab-id='tab-id-".concat(tab, "']"));
        setIndicatorLeft("".concat(activeTabRef === null || activeTabRef === void 0 ? void 0 : activeTabRef.offsetLeft, "px"));
        setindicatorWidth("".concat(activeTabRef === null || activeTabRef === void 0 ? void 0 : activeTabRef.clientWidth, "px"));
    };
    return ((0, jsx_runtime_1.jsxs)("div", __assign({ className: (0, classnames_1.default)(Tabs_module_scss_1.default['ds-tabs__wrapper']) }, { children: [(0, jsx_runtime_1.jsx)("div", __assign({ className: Tabs_module_scss_1.default['ds-tabs__list'], role: "tablist" }, { children: react_1.default.Children.map(children, function (child) {
                    return react_1.default.cloneElement(child, {
                        active: child.props.value === activeTab,
                        onSelect: onSelectTab,
                    });
                }) })), (0, jsx_runtime_1.jsx)("span", { className: (0, classnames_1.default)(Tabs_module_scss_1.default['ds-tabs__indicator'], Tabs_module_scss_1.default[theme]), style: { left: indicatorLeft || 0, width: indicatorWidth || '0' } }), withDivider && (0, jsx_runtime_1.jsx)(Divider_1.Divider, {}), (0, jsx_runtime_1.jsx)("div", { children: tabToRender === null || tabToRender === void 0 ? void 0 : tabToRender.props.children })] })));
};
exports.Tabs = Tabs;
