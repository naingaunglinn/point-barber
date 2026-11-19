import { safeReturnTo, signedOutKey } from '../../../lib/session/return-to';
import { LoginScreen } from './login-screen';

// `/login` on the staff host (AD-LOGIN-01 · AD-AUTH-01 · design D17): open without a session. The
// query carries the signed-out reason, the Google failure and the page to come back to — each
// checked here before the screen sees it.
type Props = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const signedOut = signedOutKey(one(params.reason));
  const returnTo = safeReturnTo(one(params.return_to));
  return (
    <LoginScreen
      {...(signedOut === undefined ? {} : { signedOut })}
      googleNotLinked={one(params.error) === 'google_not_linked'}
      {...(returnTo === undefined ? {} : { returnTo })}
    />
  );
}
