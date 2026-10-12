// The language files of the system (D-PLT-03 · AD-IMPL-03): `my` and `en`, one JSON file per
// namespace, read through next-intl. This package has no workspace dependency (design D1).
export * from './config';
export * from './resolve-locale';
export { loadMessages, type Messages } from './messages';
