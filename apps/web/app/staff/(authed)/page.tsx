import { redirect } from 'next/navigation';

// The start page of the staff app is Today (add-walkin-visit-checkout task 10.1 · AD-NAV-01). It replaces
// the temporary page of add-foundation-auth-access (auth spec "After sign-in the start page shows …",
// which held "until the Today screen exists"); its name, language switch and Sign out are under More on a
// phone (owner 28/Oct/2026) and in the top bar's user menu from 768 px. The query is kept, so
// `/?branch=B3` opens `/today?branch=B3`.
export default async function StartPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of [value].flat()) if (item !== undefined) query.append(key, item);
  }
  const rest = query.toString();
  redirect(rest === '' ? '/today' : `/today?${rest}`);
}
