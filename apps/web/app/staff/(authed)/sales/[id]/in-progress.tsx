'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { type SaleDto, type VisitDto, VisitStatus, type WarningDto } from '@point/shared';
import { Button, FormAlert } from '@point/ui';

import { SaleLines } from '../../../../../components/pos/SaleLines';
import { ServicePicker } from '../../../../../components/pos/ServicePicker';
import { VisitActions } from '../../../../../components/pos/VisitActions';
import { WarningNotes } from '../../../../../components/pos/WarningNotes';
import { api } from '../../../../../lib/api/client';
import { useCategories, useQuote, useServices, useStore } from '../../../../../lib/pos/queries';
import { useAction } from '../../../../../lib/pos/use-action';

// The lines of an OPEN sale and the visit's actions (AD-POS-04 / 05 · D-VIS-02 / 05 ·
// add-walkin-visit-checkout tasks 11.3 – 11.7): the lines with their durations, "Add service" (the picker
// priced by the quote for this branch, the performer and the visit's business date; after COMPLETE it asks
// "Why was this added?"), removal through the reason dialog, and — while the visit is STARTED — "Service
// done · Take payment" and the kebab's "Mark incomplete". Controls follow `Sale.actions`.

export function useDurations(branchId: string) {
  const services = useServices(branchId);
  return new Map((services.data ?? []).map((service) => [service.id, service.duration_range.min]));
}

export function SaleLinesEditor({
  sale,
  visit,
}: {
  readonly sale: SaleDto;
  readonly visit: VisitDto;
}) {
  const t = useTranslations('pos.picker');
  const store = useStore();
  const services = useServices(sale.branch_id);
  const categories = useCategories();
  const [picking, setPicking] = useState(false);
  const [warnings, setWarnings] = useState<readonly WarningDto[]>([]);
  const action = useAction(() => store.reloadSale(sale.id));
  const quote = useQuote({
    branchId: sale.branch_id,
    employeeId: visit.performed_by.id,
    date: visit.business_date,
    serviceIds: picking ? services.data?.map((service) => service.id) : undefined,
  });
  const durations = useDurations(sale.branch_id);
  const completed = visit.status === VisitStatus.COMPLETED;

  return (
    <section className="grid gap-3">
      {action.problem !== null && <FormAlert problem={action.problem} />}
      <WarningNotes warnings={warnings} />
      <SaleLines
        items={sale.items}
        durations={durations}
        canEdit={sale.actions.edit_lines}
        onRemove={(itemId, reason) =>
          action.run(
            () =>
              api<SaleDto>(`/sales/${sale.id}/items/${itemId}/remove`, {
                method: 'POST',
                body: { reason },
              }),
            store.sale,
          )
        }
      />
      {sale.actions.edit_lines && (
        <Button onClick={() => setPicking(true)} data-testid="add-service">
          {t('title')}
        </Button>
      )}
      <ServicePicker
        open={picking}
        onOpenChange={setPicking}
        services={services.data}
        categories={categories.data}
        quote={quote.data}
        pending={action.pending}
        askReason={completed}
        onPick={(serviceId, addedReason) =>
          action.run(
            () =>
              api<SaleDto>(`/sales/${sale.id}/items`, {
                method: 'POST',
                body: {
                  line_type: 1,
                  service_id: serviceId,
                  ...(addedReason === undefined ? {} : { added_reason: addedReason }),
                },
              }),
            (next) => {
              store.sale(next);
              setWarnings(next.warnings);
              setPicking(false);
            },
          )
        }
      />
    </section>
  );
}

export function InProgress({ sale, visit }: { readonly sale: SaleDto; readonly visit: VisitDto }) {
  const store = useStore();
  const action = useAction(() => store.reloadSale(sale.id));
  return (
    <div className="grid gap-4" data-testid="visit-in-progress">
      <SaleLinesEditor sale={sale} visit={visit} />
      <VisitActions
        canComplete={sale.actions.edit_lines}
        canMarkIncomplete={sale.actions.mark_incomplete}
        pending={action.pending}
        problem={action.problem}
        onComplete={() =>
          action.run(
            () => api<VisitDto>(`/visits/${visit.id}/complete`, { method: 'POST' }),
            store.visit,
          )
        }
        onIncomplete={(reason) =>
          action.run(
            () =>
              api<VisitDto>(`/visits/${visit.id}/incomplete`, {
                method: 'POST',
                body: { reason },
              }),
            store.visit,
          )
        }
      />
    </div>
  );
}
