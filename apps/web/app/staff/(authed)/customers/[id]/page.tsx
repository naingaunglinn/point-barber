import { CustomerScreen } from './customer-screen';

// /customers/[id] — a customer: the header and the Overview (add-customer-management design D11).
export default async function CustomerPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomerScreen id={id} />;
}
