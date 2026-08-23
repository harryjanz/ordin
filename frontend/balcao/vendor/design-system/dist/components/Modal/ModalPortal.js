"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModalPortal = void 0;
var react_1 = require("react");
var react_dom_1 = __importDefault(require("react-dom"));
function ModalPortal(_a) {
    var children = _a.children, className = _a.className, identifier = _a.identifier;
    var id = "ds-modal-".concat(identifier);
    var element = document.querySelector("#".concat(id));
    if (!element) {
        element = document.createElement('div');
        element.id = id;
        element.classList.add(className);
    }
    var body = document.querySelector('body');
    body === null || body === void 0 ? void 0 : body.insertBefore(element, body.childNodes[0]);
    body === null || body === void 0 ? void 0 : body.setAttribute('style', 'overflow-y: hidden;');
    (0, react_1.useEffect)(function () {
        return function cleanup() {
            body === null || body === void 0 ? void 0 : body.removeAttribute('style');
            element === null || element === void 0 ? void 0 : element.remove();
        };
    }, [body, element]);
    return react_dom_1.default.createPortal(children, element);
}
exports.ModalPortal = ModalPortal;
