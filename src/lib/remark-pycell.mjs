// MDX strips up to two spaces of indentation from every continuation line of a
// multi-line JSX attribute expression, which mangles Python code (4 -> 2 spaces).
// This remark plugin restores the exact text: for every <PyCell>, attributes
// written as {`template literals`} are re-read from the raw source and replaced
// with plain string attributes.
const ATTR = /(\w+)=\{`((?:[^`\\]|\\[\s\S])*)`\}/g;

function visit(node, fn) {
  fn(node);
  for (const child of node.children ?? []) visit(child, fn);
}

export default function remarkPyCell() {
  return (tree, file) => {
    const source = String(file.value);
    visit(tree, (node) => {
      if (node.type !== 'mdxJsxFlowElement' || node.name !== 'PyCell' || !node.position) return;
      const raw = source.slice(node.position.start.offset, node.position.end.offset);
      if (!raw.startsWith('<PyCell')) return;
      for (const [, name, body] of raw.matchAll(ATTR)) {
        if (/(^|[^\\])\$\{/.test(body)) throw new Error(`${file.path}: unescaped \${ in PyCell ${name}; write \\\${`);
        const value = new Function('return `' + body + '`')(); // exact JS template-literal unescaping
        const attr = node.attributes.find((a) => a.type === 'mdxJsxAttribute' && a.name === name);
        if (attr) attr.value = value;
      }
    });
  };
}
