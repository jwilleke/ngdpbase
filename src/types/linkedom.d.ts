/**
 * Minimal type declaration for linkedom.
 * linkedom has no official @types package; this covers the APIs used in this project.
 */
declare module 'linkedom' {
  interface LinkedomText {
    textContent: string | null;
    nodeType: number;
    nodeName: string;
  }

  interface LinkedomComment {
    textContent: string | null;
    nodeType: number;
    nodeName: string;
  }

  interface LinkedomNodeList extends ArrayLike<LinkedomNode> {
    length: number;
  }

  interface LinkedomHTMLCollection extends ArrayLike<LinkedomElement> {
    length: number;
  }

  type LinkedomNode = LinkedomElement | LinkedomText | LinkedomComment;

  interface LinkedomElement {
    innerHTML: string;
    outerHTML: string;
    textContent: string | null;
    className: string;
    nodeType: number;
    nodeName: string;
    tagName: string;
    childNodes: LinkedomNodeList;
    firstChild: LinkedomNode | null;
    lastChild: LinkedomNode | null;
    setAttribute(name: string, value: string): void;
    getAttribute(name: string): string | null;
    removeAttribute(name: string): void;
    appendChild(node: LinkedomNode): LinkedomNode;
    insertBefore(newNode: LinkedomNode, referenceNode: LinkedomNode | null): LinkedomNode;
    removeChild(node: LinkedomNode): LinkedomNode;
    replaceChild(newNode: LinkedomNode, oldNode: LinkedomNode): LinkedomNode;
    replaceWith(node: LinkedomNode): void;
    remove(): void;
    querySelector(selector: string): LinkedomElement | null;
    querySelectorAll(selector: string): LinkedomElement[];
    getElementsByClassName(className: string): LinkedomHTMLCollection;
    getElementsByTagName(tagName: string): LinkedomHTMLCollection;
  }

  interface LinkedomDocument {
    body: LinkedomElement;
    documentElement?: LinkedomElement;
    createElement(tag: string): LinkedomElement;
    createTextNode(text: string): LinkedomText;
    createComment(text: string): LinkedomComment;
    getElementById(id: string): LinkedomElement | null;
    querySelector(selector: string): LinkedomElement | null;
    querySelectorAll(selector: string): LinkedomElement[];
  }

  function parseHTML(html: string): { document: LinkedomDocument };

  export {
    parseHTML,
    LinkedomDocument,
    LinkedomElement,
    LinkedomText,
    LinkedomComment,
    LinkedomNode,
    LinkedomNodeList,
    LinkedomHTMLCollection
  };
}
