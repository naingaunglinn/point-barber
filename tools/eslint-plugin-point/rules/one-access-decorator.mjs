// point/one-access-decorator (API-PERM-02 · design D10): in a class decorated with @Controller, every
// method that carries a NestJS route decorator declares exactly one access decorator. All six access
// names are listed from the start, so a later change adds a decorator without touching this rule.
export const ROUTE_DECORATORS = [
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'All',
  'Head',
  'Options',
  'Sse',
];
export const ACCESS_DECORATORS = ['Can', 'CanView', 'Staff', 'Self', 'Public', 'Internal'];

/** `@Get()`, `@Get`, `@common.Get()` → `Get`. */
function decoratorName(decorator) {
  let node = decorator.expression;
  if (node.type === 'CallExpression') node = node.callee;
  if (node.type === 'MemberExpression' && !node.computed) node = node.property;
  return node.type === 'Identifier' ? node.name : undefined;
}

const names = (node) => (node.decorators ?? []).map(decoratorName);

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Every endpoint declares exactly one access decorator (API-PERM-02)' },
    schema: [],
    messages: {
      missing:
        'Endpoint `{{method}}` has no access decorator — add exactly one of @{{access}} (API-PERM-02).',
      several:
        'Endpoint `{{method}}` has {{count}} access decorators (@{{found}}) — keep exactly one (API-PERM-02).',
    },
  },
  create(context) {
    return {
      'ClassDeclaration, ClassExpression'(cls) {
        if (!names(cls).includes('Controller')) return;
        for (const member of cls.body.body) {
          if (member.type !== 'MethodDefinition') continue;
          const decorators = names(member);
          if (!decorators.some((name) => ROUTE_DECORATORS.includes(name))) continue;
          const access = decorators.filter((name) => ACCESS_DECORATORS.includes(name));
          if (access.length === 1) continue;
          const method = context.sourceCode.getText(member.key);
          context.report({
            node: member.key,
            messageId: access.length === 0 ? 'missing' : 'several',
            data: {
              method,
              access: ACCESS_DECORATORS.join(', @'),
              count: String(access.length),
              found: access.join(', @'),
            },
          });
        }
      },
    };
  },
};
