// point/no-device-clock (D-PLT-15 · CG-TIME-03 · CG-TIME-04 · add-shared-ui-components design D14 rows
// 42 / 43): the time comes from the supplied clock (ClockProvider / useNow) and the zone is always
// Asia/Yangon. `new Date()` without arguments and `Date.now()` read the device clock; the local-time
// getters and setters (`getHours()`, `setDate()` …) use the device's zone. The option `clock: false`
// turns off the first two (ClockProvider itself); `localTime: false` the getters and setters
// (packages/shared/src/time and src/format, which work in Asia/Yangon explicitly).

const LOCAL_TIME = new Set(
  ['FullYear', 'Month', 'Date', 'Day', 'Hours', 'Minutes', 'Seconds', 'Milliseconds', 'Year']
    .flatMap((part) => [`get${part}`, `set${part}`])
    .filter((name) => name !== 'setDay'),
);

export default {
  meta: {
    type: 'problem',
    docs: { description: 'The time comes from the supplied clock, in Asia/Yangon (D-PLT-15)' },
    schema: [
      {
        type: 'object',
        properties: { clock: { type: 'boolean' }, localTime: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    messages: {
      newDate:
        '`new Date()` reads the device clock — take the time from useNow() / the supplied clock (D-PLT-15 · CG-TIME-03).',
      now: '`Date.now()` reads the device clock — take the time from useNow() / the supplied clock (D-PLT-15 · CG-TIME-03).',
      local:
        '`{{name}}()` uses the device time zone — use the Asia/Yangon helpers of packages/shared/src/time (D-PLT-15 · CG-TIME-04).',
    },
  },
  create(context) {
    const { clock = true, localTime = true } = context.options[0] ?? {};
    return {
      NewExpression(node) {
        if (
          clock &&
          node.callee.type === 'Identifier' &&
          node.callee.name === 'Date' &&
          node.arguments.length === 0
        ) {
          context.report({ node, messageId: 'newDate' });
        }
      },
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier') return;
        const name = callee.property.name;
        if (
          clock &&
          name === 'now' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'Date'
        ) {
          context.report({ node, messageId: 'now' });
        } else if (localTime && LOCAL_TIME.has(name)) {
          context.report({ node, messageId: 'local', data: { name } });
        }
      },
    };
  },
};
