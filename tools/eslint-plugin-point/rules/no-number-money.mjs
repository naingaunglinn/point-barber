// point/no-number-money (CG-MONEY-03 · API-DATA-02 · D-PLT-04 · add-shared-ui-components design D14):
// money is an integer number of kyats (`Mmk`) and is changed only by the helpers of
// packages/shared/src/money. Outside that folder a value named `amount`, `*_amount` or `*Amount` may not
// go through `Number()`, `parseInt()` or a unary `+`, nor take part in arithmetic (`+ - * / % **`, also
// as compound assignment). `parseFloat` is banned everywhere by its own rule.

const MONEY_NAME = /^amount$|_amount$|Amount$/;
const ARITHMETIC = new Set(['+', '-', '*', '/', '%', '**']);
const COMPOUND = new Set(['+=', '-=', '*=', '/=', '%=', '**=']);

/** The money name of `amount`, `sale.total_amount`, `cell['price_amount']`, or undefined. */
function moneyName(node) {
  if (node === null || node === undefined) return undefined;
  if (node.type === 'TSNonNullExpression' || node.type === 'TSAsExpression')
    return moneyName(node.expression);
  if (node.type === 'ChainExpression') return moneyName(node.expression);
  if (node.type === 'Identifier') return MONEY_NAME.test(node.name) ? node.name : undefined;
  if (node.type === 'MemberExpression') {
    const key = node.property;
    const name =
      !node.computed && key.type === 'Identifier'
        ? key.name
        : key.type === 'Literal' && typeof key.value === 'string'
          ? key.value
          : undefined;
    return name !== undefined && MONEY_NAME.test(name) ? name : undefined;
  }
  return undefined;
}

/** `Number`, `parseInt`, `Number.parseInt`. */
function converterName(callee) {
  if (callee.type === 'Identifier' && (callee.name === 'Number' || callee.name === 'parseInt')) {
    return callee.name;
  }
  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Number' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'parseInt'
  ) {
    return 'Number.parseInt';
  }
  return undefined;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Money values are not converted to numbers or used in arithmetic outside the money helpers (CG-MONEY-03)',
    },
    schema: [],
    messages: {
      convert:
        '`{{fn}}({{name}})` — money is an integer number of kyats; use the helpers of packages/shared/src/money (CG-MONEY-03 · D-PLT-04).',
      unary:
        'Unary `+{{name}}` — money is an integer number of kyats; use the helpers of packages/shared/src/money (CG-MONEY-03 · D-PLT-04).',
      arithmetic:
        "Arithmetic on `{{name}}` — totals are the server's or come from the helpers of packages/shared/src/money (CG-MONEY-03 · API-DATA-02).",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const fn = converterName(node.callee);
        const name = fn === undefined ? undefined : moneyName(node.arguments[0]);
        if (name !== undefined) context.report({ node, messageId: 'convert', data: { fn, name } });
      },
      UnaryExpression(node) {
        const name = node.operator === '+' ? moneyName(node.argument) : undefined;
        if (name !== undefined) context.report({ node, messageId: 'unary', data: { name } });
      },
      BinaryExpression(node) {
        if (!ARITHMETIC.has(node.operator)) return;
        const name = moneyName(node.left) ?? moneyName(node.right);
        if (name !== undefined) context.report({ node, messageId: 'arithmetic', data: { name } });
      },
      AssignmentExpression(node) {
        if (!COMPOUND.has(node.operator)) return;
        const name = moneyName(node.left) ?? moneyName(node.right);
        if (name !== undefined) context.report({ node, messageId: 'arithmetic', data: { name } });
      },
    };
  },
};
