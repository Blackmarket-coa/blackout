if (
  typeof globalThis.HTMLElement !== "undefined" &&
  typeof globalThis.HTMLElement.prototype.scrollIntoView !== "function"
) {
  globalThis.HTMLElement.prototype.scrollIntoView = () => {};
}
