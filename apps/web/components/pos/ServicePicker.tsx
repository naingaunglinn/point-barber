'use client';

import {
  type QuoteItemDto,
  type ServiceCategoryDto,
  type ServiceListItemDto,
  ServicePricingMode,
  formatDuration,
  formatMoney,
  localized,
  moneyFromWire,
} from '@point/shared';
import { Button, ReasonDialog, SearchInput, Sheet, useFormat } from '@point/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

// The service picker of a visit (AD-POS-05 · P2.SVC.01 · P2.PRC.06 · services-pricing spec "The services
// sold at a branch" · add-walkin-visit-checkout task 11.4): a bottom sheet with a search field and the
// categories in their order — no "Frequent here" section (no usage ranking in V1). Only services sold at
// the branch appear; each row shows the name, the duration and the price the line will record, from the
// quote for this performer on the visit's business date (P4-RULE-05). Only simple services are offered in
// this change: a line takes no variant yet (the option picker comes with variants). A service added after
// COMPLETE asks "Why was this added?" first and sends it as `added_reason` (task 11.5).

export interface ServicePickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** `GET /v1/services?branch_id=` in catalogue order; undefined while it loads. */
  readonly services: readonly ServiceListItemDto[] | undefined;
  /** `GET /v1/service-categories` in `sort_order`. */
  readonly categories: readonly ServiceCategoryDto[] | undefined;
  /** The quote's items for these services (performer, visit date); undefined while it loads. */
  readonly quote: readonly QuoteItemDto[] | undefined;
  /** True while the add request runs. */
  readonly pending: boolean;
  /** The visit is COMPLETED: an added service needs `added_reason` (P4.SAL.04). */
  readonly askReason?: boolean;
  readonly onPick: (serviceId: string, addedReason?: string) => void | Promise<unknown>;
}

const matches = (service: ServiceListItemDto, text: string) => {
  const needle = text.trim().toLocaleLowerCase();
  return (
    needle === '' ||
    service.name_mm.toLocaleLowerCase().includes(needle) ||
    (service.name_en ?? '').toLocaleLowerCase().includes(needle)
  );
};

export function ServicePicker({
  open,
  onOpenChange,
  services,
  categories,
  quote,
  pending,
  askReason = false,
  onPick,
}: ServicePickerProps) {
  const t = useTranslations('pos.picker');
  const tLines = useTranslations('pos.lines');
  const locale = useLocale() as 'my' | 'en';
  const format = useFormat('ServicePicker');
  const [search, setSearch] = useState('');
  const [asking, setAsking] = useState<ServiceListItemDto | null>(null);
  const simple = (services ?? []).filter(
    (service) => service.pricing_mode === ServicePricingMode.SIMPLE && matches(service, search),
  );
  const groups = (categories ?? [])
    .map((category) => ({
      category,
      rows: simple.filter((service) => service.category_id === category.id),
    }))
    .filter((group) => group.rows.length > 0);
  const priced = new Map((quote ?? []).map((item) => [item.service_id, item]));

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="bottom" title={t('title')}>
      <div className="grid gap-4">
        <SearchInput value={search} onChange={setSearch} placeholder={t('search')} />
        {services !== undefined && groups.length === 0 && (
          <p className="text-muted-foreground">{t('empty')}</p>
        )}
        {groups.map(({ category, rows }) => (
          <section
            key={category.id}
            className="grid gap-2"
            aria-label={localized(category, 'name', locale)}
          >
            <h3 className="text-sm font-semibold text-muted-foreground">
              {localized(category, 'name', locale)}
            </h3>
            {rows.map((service) => {
              const item = priced.get(service.id);
              const minutes = item?.duration_minutes ?? service.duration_range.min;
              return (
                <Button
                  key={service.id}
                  fullWidth
                  loading={pending}
                  onClick={() => (askReason ? setAsking(service) : onPick(service.id))}
                  data-testid={`pick-${service.id}`}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <span>{localized(service, 'name', locale)}</span>
                    <span className="text-sm text-muted-foreground">
                      {item?.unit_price_amount == null
                        ? formatDuration(minutes, { locale })
                        : t('detail', {
                            duration: formatDuration(minutes, { locale }),
                            price: formatMoney(moneyFromWire(item.unit_price_amount), format),
                          })}
                    </span>
                  </span>
                </Button>
              );
            })}
          </section>
        ))}
      </div>
      {asking !== null && (
        <ReasonDialog
          open
          title={tLines('addedTitle')}
          consequence={tLines('addedConsequence', { service: localized(asking, 'name', locale) })}
          source={{ type: 'free' }}
          confirmLabel={tLines('addedConfirm')}
          onCancel={() => setAsking(null)}
          onConfirm={async (result) => {
            await onPick(asking.id, result.note ?? '');
            setAsking(null);
          }}
        />
      )}
    </Sheet>
  );
}
