// The project's own ESLint rules — owner: Dev 2 (design D3 · D10). Used as plugin `point`.
// no-number-money, no-locale-format, no-device-clock and no-raw-status are written by
// add-shared-ui-components (Dev 1, design D14).
import noDeviceClock from './rules/no-device-clock.mjs';
import noLocaleFormat from './rules/no-locale-format.mjs';
import noNumberMoney from './rules/no-number-money.mjs';
import noRawStatus from './rules/no-raw-status.mjs';
import oneAccessDecorator from './rules/one-access-decorator.mjs';

export default {
  meta: { name: 'eslint-plugin-point' },
  rules: {
    'no-device-clock': noDeviceClock,
    'no-locale-format': noLocaleFormat,
    'no-number-money': noNumberMoney,
    'no-raw-status': noRawStatus,
    'one-access-decorator': oneAccessDecorator,
  },
};
