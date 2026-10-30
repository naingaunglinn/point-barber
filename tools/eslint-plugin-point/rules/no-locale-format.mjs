// point/no-locale-format (AD-FMT-00 · D-PLT-05 · add-shared-ui-components design D14 row 44): dates,
// times, money and numbers are written only by the shared formatter (packages/shared/src/format), so
// both languages show the same digits, month names and AM / PM. Elsewhere `toLocaleString`,
// `toLocaleDateString`, `toLocaleTimeString` and `Intl.NumberFormat` / `Intl.DateTimeFormat` /
// `Intl.RelativeTimeFormat` are not used.

const LOCALE_METHODS = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']);
const INTL_FORMATS = new Set(['NumberFormat', 'DateTimeFormat', 'RelativeTimeFormat']);

const propertyName = (node) =>
  node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier'
    ? node.property.name
    : undefined;

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Locale formatting only in packages/shared/src/format (AD-FMT-00)' },
    schema: [],
    messages: {
      method:
        '`{{name}}()` — format with the shared formatter of packages/shared/src/format (AD-FMT-00 · D-PLT-05).',
      intl: '`Intl.{{name}}` — format with the shared formatter of packages/shared/src/format (AD-FMT-00 · D-PLT-05).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const name = propertyName(node.callee);
        if (name !== undefined && LOCALE_METHODS.has(name)) {
          context.report({ node, messageId: 'method', data: { name } });
        }
      },
      MemberExpression(node) {
        const name = propertyName(node);
        if (
          name !== undefined &&
          INTL_FORMATS.has(name) &&
          node.object.type === 'Identifier' &&
          node.object.name === 'Intl'
        ) {
          context.report({ node, messageId: 'intl', data: { name } });
        }
      },
    };
  },
};
