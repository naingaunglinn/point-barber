import { SaleScreen } from './sale-screen';

// /sales/[id] — a sale by its link (AD-NAV-06), whatever its state (add-walkin-visit-checkout design D11).
export default async function SalePage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SaleScreen id={id} />;
}
