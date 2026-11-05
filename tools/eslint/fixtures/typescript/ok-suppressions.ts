// Fixture: described suppressions pass (CG-TS-01 · CG-META-05).
// @ts-expect-error -- 'retri' is not a language key (CG-I18N-02)
const key: 'my' | 'en' = 'retri';

// eslint-disable-next-line no-console -- start-up banner (cg-exception CG-OBS-01)
console.log(key);
