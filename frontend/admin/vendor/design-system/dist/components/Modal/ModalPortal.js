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
    // PATCH (ver vendor/design-system/README.md): body.insertBefore(element, ...)
    // rodava direto no corpo da função — ou seja, em TODO render do Modal,
    // não só na montagem. insertBefore num nó que já está no DOM faz o
    // browser remover e reinserir esse nó; se ele contém o elemento com
    // foco (ex: um input controlado sendo digitado, que causa um re-render
    // do pai a cada tecla), o foco é perdido a cada tecla — sintoma
    // idêntico ao bug do nanoid não memoizado (ver abaixo), mas com causa
    // raiz diferente e não coberta por aquele patch. useRef mantém o
    // mesmo elemento DOM entre renders e o efeito roda só quando esse
    // elemento muda (ou seja, uma vez por montagem).
    var elementRef = (0, react_1.useRef)(null);
    if (!elementRef.current) {
        var existing = document.querySelector("#".concat(id));
        if (existing) {
            elementRef.current = existing;
        }
        else {
            var created = document.createElement('div');
            created.id = id;
            created.classList.add(className);
            elementRef.current = created;
        }
    }
    var element = elementRef.current;
    (0, react_1.useEffect)(function () {
        var body = document.querySelector('body');
        body === null || body === void 0 ? void 0 : body.insertBefore(element, body.childNodes[0]);
        body === null || body === void 0 ? void 0 : body.setAttribute('style', 'overflow-y: hidden;');
        return function cleanup() {
            body === null || body === void 0 ? void 0 : body.removeAttribute('style');
            element === null || element === void 0 ? void 0 : element.remove();
        };
    }, [element]);
    return react_dom_1.default.createPortal(children, element);
}
exports.ModalPortal = ModalPortal;
