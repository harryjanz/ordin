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
exports.Pagination = void 0;
var jsx_runtime_1 = require("react/jsx-runtime");
var classnames_1 = __importDefault(require("classnames"));
var react_1 = require("react");
var Pagination_module_scss_1 = __importDefault(require("./Pagination.module.scss"));
var ThemeProvider_1 = require("../ThemeProvider");
var Pagination = function (_a) {
    var activePage = _a.activePage, totalItemsCount = _a.totalItemsCount, itemsPerPage = _a.itemsPerPage, onChange = _a.onChange;
    var pageCount = Math.ceil((totalItemsCount === 0 ? 1 : totalItemsCount) /
        (itemsPerPage === 0 ? 1 : itemsPerPage));
    var _b = (0, react_1.useState)(0), innerCount = _b[0], setInnerCount = _b[1];
    var theme = (0, react_1.useContext)(ThemeProvider_1.ThemeContext);
    (0, react_1.useEffect)(function () {
        var updateInnerCount = function () {
            setInnerCount(calculateInnerCount());
        };
        window.addEventListener('resize', updateInnerCount);
        updateInnerCount();
        return function () { return window.removeEventListener('resize', updateInnerCount); };
    });
    var calculateInnerCount = function () {
        var desktopInnerCount = pageCount === 5 || pageCount === 6 ? pageCount - 2 : 5;
        var mobileInnerCount = pageCount === 4 ? pageCount - 2 : 3;
        return window.innerWidth <= 576 ? mobileInnerCount : desktopInnerCount;
    };
    var calculateInnerRange = function () {
        var innerItemCount = innerCount;
        var initRange = [activePage - 1, activePage, activePage + 1];
        if (innerItemCount === 5) {
            initRange.unshift(activePage - 2);
            initRange.push(activePage + 2);
        }
        // Removes first and negative indexes
        initRange = initRange.filter(function (i) { return i > 1; });
        // Removes last and greater indexes
        initRange = initRange.filter(function (i) { return i < pageCount; });
        // Append items to complete range
        var hasSecond = initRange.includes(2);
        var hasPenultimate = initRange.includes(pageCount - 1);
        if (initRange.length > 0 &&
            innerItemCount > initRange.length &&
            !(hasSecond && hasPenultimate)) {
            var operation = hasSecond
                ? function () { return initRange.push(initRange[initRange.length - 1] + 1); }
                : function () { return initRange.unshift(initRange[0] - 1); };
            while (innerItemCount > initRange.length) {
                operation();
            }
        }
        // Replaces first index !== 2 and last index !== (pageCount - 1) for -1 for ellipsis button
        initRange = initRange.map(function (val, idx) {
            return (idx === 0 && val !== 2) ||
                (idx === initRange.length - 1 && val !== pageCount - 1)
                ? -1
                : val;
        });
        return initRange;
    };
    var renderPages = function () {
        var content = [];
        // Inner pages and ellipsis
        var innerRange = calculateInnerRange();
        content.push(innerRange.map(function (pgNumber, idx) {
            return pgNumber === -1 ? renderEllipsis(idx) : renderPageButton(pgNumber);
        }));
        // First and last page
        content.unshift(renderPageButton(1));
        if (pageCount !== 1) {
            content.push(renderPageButton(pageCount));
        }
        // Prev and next button
        if (activePage !== 1) {
            content.unshift(renderPrevButton());
        }
        if (activePage !== pageCount) {
            content.push(renderNextButton());
        }
        return content;
    };
    var renderPrevButton = function () { return ((0, jsx_runtime_1.jsx)("li", __assign({ className: Pagination_module_scss_1.default['ds-pagination__page-item'] }, { children: (0, jsx_runtime_1.jsx)("button", __assign({ type: "button", className: Pagination_module_scss_1.default[theme], onClick: function () { return onChange(activePage - 1); }, "data-testid": "pagination-prev-btn" }, { children: (0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)('icon-chevron-left', Pagination_module_scss_1.default[theme]) }) })) }), "prev")); };
    var renderNextButton = function () { return ((0, jsx_runtime_1.jsx)("li", __assign({ className: Pagination_module_scss_1.default['ds-pagination__page-item'] }, { children: (0, jsx_runtime_1.jsx)("button", __assign({ type: "button", className: Pagination_module_scss_1.default[theme], onClick: function () { return onChange(activePage + 1); }, "data-testid": "pagination-next-btn" }, { children: (0, jsx_runtime_1.jsx)("i", { className: (0, classnames_1.default)('icon-chevron-right', Pagination_module_scss_1.default[theme]) }) })) }), "next")); };
    var renderEllipsis = function (index) { return ((0, jsx_runtime_1.jsx)("li", __assign({ className: (0, classnames_1.default)(Pagination_module_scss_1.default['ds-pagination__page-item'], Pagination_module_scss_1.default['ds-pagination__page-item--ellipsis']) }, { children: (0, jsx_runtime_1.jsx)("button", __assign({ type: "button", className: Pagination_module_scss_1.default[theme] }, { children: "..." })) }), "ellipsis-".concat(index))); };
    var renderPageButton = function (index) {
        var _a;
        return ((0, jsx_runtime_1.jsx)("li", __assign({ className: (0, classnames_1.default)(Pagination_module_scss_1.default['ds-pagination__page-item'], (_a = {},
                _a[Pagination_module_scss_1.default['ds-pagination__page-item--active']] = index === activePage,
                _a)) }, { children: (0, jsx_runtime_1.jsx)("button", __assign({ type: "button", className: Pagination_module_scss_1.default[theme], onClick: function () { return onChange(index); }, "data-testid": "pagination-page-".concat(index, "-btn") }, { children: index })) }), "page-".concat(index)));
    };
    return ((0, jsx_runtime_1.jsx)("div", __assign({ className: Pagination_module_scss_1.default['ds-pagination__wrapper'] }, { children: (0, jsx_runtime_1.jsx)("ul", __assign({ className: Pagination_module_scss_1.default['ds-pagination__List'] }, { children: renderPages() })) })));
};
exports.Pagination = Pagination;
