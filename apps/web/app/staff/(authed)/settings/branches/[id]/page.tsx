import { BranchDetailScreen } from './branch-detail-screen';

// /settings/branches/[id] — a branch: the form in edit or read-only mode, the status action in the header
// (add-branch-management design D9).
export default async function BranchPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BranchDetailScreen id={id} />;
}
