// point/no-raw-status (AD-IMPL-04 · D-DB-03 · API-DATA-04 · add-shared-ui-components design D14 row 7): a
// status is a smallint code with a named constant (packages/shared/src/constants/status.ts). A member
// named `status` or ending in `_status` is never compared with, or assigned, a number literal:
// `booking.status === BookingStatus.STARTED`, not `booking.status === 2`.

const STATUS_NAME = /^status$|_status$/;
const COMPARISON = new Set(['===', '!==', '==', '!=', '<', '<=', '>', '>=']);

/** The status name of `status`, `x.status`, `x['booking_status']`, or undefined. */
function statusName(node) {
  if (node.type === 'Identifier') return STATUS_NAME.test(node.name) ? node.name : undefined;
  if (node.type === 'ChainExpression') return statusName(node.expression);
  if (node.type === 'MemberExpression') {
    const key = node.property;
    const name =
      !node.computed && key.type === 'Identifier'
        ? key.name
        : key.type === 'Literal' && typeof key.value === 'string'
          ? key.value
          : undefined;
    return name !== undefined && STATUS_NAME.test(name) ? name : undefined;
  }
  return undefined;
}

const isNumber = (node) =>
  (node.type === 'Literal' && typeof node.value === 'number') ||
  (node.type === 'UnaryExpression' && node.operator === '-' && isNumber(node.argument));

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Status codes are named constants (D-DB-03)' },
    schema: [],
    messages: {
      raw: '`{{name}}` with the number {{value}} — use the named constant of packages/shared/src/constants/status.ts (D-DB-03 · AD-IMPL-04).',
    },
  },
  create(context) {
    const report = (node, name, value) =>
      context.report({
        node,
        messageId: 'raw',
        data: { name, value: context.sourceCode.getText(value) },
      });
    return {
      BinaryExpression(node) {
        if (!COMPARISON.has(node.operator)) return;
        const name = statusName(node.left) ?? statusName(node.right);
        const value = isNumber(node.right)
          ? node.right
          : isNumber(node.left)
            ? node.left
            : undefined;
        if (name !== undefined && value !== undefined) report(node, name, value);
      },
      AssignmentExpression(node) {
        const name = statusName(node.left);
        if (name !== undefined && isNumber(node.right)) report(node, name, node.right);
      },
      Property(node) {
        const key = node.key;
        const name =
          !node.computed && key.type === 'Identifier'
            ? key.name
            : key.type === 'Literal' && typeof key.value === 'string'
              ? key.value
              : undefined;
        if (name !== undefined && STATUS_NAME.test(name) && isNumber(node.value)) {
          report(node, name, node.value);
        }
      },
    };
  },
};
