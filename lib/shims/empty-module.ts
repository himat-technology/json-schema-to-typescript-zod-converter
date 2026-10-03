const emptyModule = {};

export default emptyModule;

export function readFileSync(): never {
  throw new Error("File system access is not available in the browser.");
}
