// Legacy mount for the Circle graph.
//
// Following *is* how a Circle is built, so there is one implementation
// (routes/circle.ts) and this re-exports it. Mounting the same router at
// `/v1/follows` keeps every pre-Circle client working on identical paths while
// `/v1/circle` becomes the name the product actually uses.
export { default } from './circle';
