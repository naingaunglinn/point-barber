// The two hosts of the catalogue test build (task 11.13 · design D13): `next start` alone on port
// 3100, the staff host by name and the site host by address, so one server answers both trees.

/** Staff host: the catalogue lives here. */
export const CATALOGUE_APP_ORIGIN = 'http://localhost:3100';
/** Site host: answers 404 on `/dev/ui` in every build. */
export const CATALOGUE_SITE_ORIGIN = 'http://127.0.0.1:3100';
