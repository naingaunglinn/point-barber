// Helpers shared by the lint rule tests (add-ci-lint-rules design D5).
import { builtinRules } from 'eslint/use-at-your-own-risk';

/** The name every object of `typeChecked` carries (typescript.mjs). */
export const TYPE_CHECKED = 'point/type-checked';

/**
 * The configuration without the type-aware objects. The older tests lint virtual text with the plain
 * parser, where a rule that needs type information would throw.
 */
export const withoutTypeChecked = (configs) =>
  configs.filter((config) => config.name !== TYPE_CHECKED);

/**
 * The configuration with every rule that needs type information switched off and the project service
 * left out, so that virtual text can be linted by the other rules of `typeChecked`.
 */
export function withoutTypeAwareRules(configs) {
  const plugins = Object.assign({}, ...configs.map((config) => config.plugins ?? {}));
  const needsTypes = (id) => {
    const at = id.lastIndexOf('/');
    const rule =
      at === -1 ? builtinRules.get(id) : plugins[id.slice(0, at)]?.rules?.[id.slice(at + 1)];
    return rule?.meta?.docs?.requiresTypeChecking === true;
  };
  const off = Object.fromEntries(
    configs
      .flatMap((config) => Object.keys(config.rules ?? {}))
      .filter(needsTypes)
      .map((id) => [id, 'off']),
  );
  return [
    ...configs,
    { rules: off },
    { languageOptions: { parserOptions: { projectService: false, project: null } } },
  ];
}
