// The project's own ESLint rules — owner: Dev 2 (design D3 · D10). Used as plugin `point`.
import oneAccessDecorator from './rules/one-access-decorator.mjs';

export default {
  meta: { name: 'eslint-plugin-point' },
  rules: { 'one-access-decorator': oneAccessDecorator },
};
