import { OfflineHelp } from '../../../../../components/pos/OfflineHelp';

// /help/offline — behind the offline banner's link (AD-STATE-05 · task 10.10): write the service on
// paper; it is entered later with Late entry. No form and no record button.
export default function OfflineHelpPage() {
  return (
    <main className="mx-auto w-full max-w-3xl p-4">
      <OfflineHelp />
    </main>
  );
}
