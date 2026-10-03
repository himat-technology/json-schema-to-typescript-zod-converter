export function format(): never {
  throw new Error("Use prettier/standalone in the browser.");
}

const prettierStub = { format };

export default prettierStub;
