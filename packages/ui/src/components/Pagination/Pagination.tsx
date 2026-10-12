'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { DESKTOP, useMinWidth } from '../../hooks/use-min-width';
import { Button } from '../Button/Button';
import { PAGE_SIZES, type PagedList, type PageSize } from './use-paged-list';

// "Previous" / "Next" under a list (AD-LIST-05 · API-DATA-08 · design D10): the total only when the
// server gives it, no next page when `next_cursor` is null, and the page-size choice 25 / 50 / 100 from
// 1024 px ("on desktop").

export function Pagination<T>({ list }: Readonly<{ list: PagedList<T> }>) {
  const t = useTranslations('common');
  const desktop = useMinWidth(DESKTOP);
  const sizeId = useId();
  return (
    <div className="flex flex-wrap items-center gap-3" data-slot="pagination">
      {list.total === null ? null : (
        <span className="text-sm text-muted-foreground" data-slot="total">
          {t('list.total', { n: list.total })}
        </span>
      )}
      <div className="ms-auto flex items-center gap-2">
        {desktop ? (
          <span className="flex items-center gap-2 text-sm">
            <label htmlFor={sizeId}>{t('list.pageSize')}</label>
            <select
              id={sizeId}
              value={list.limit}
              onChange={(event) => list.setLimit(Number(event.target.value) as PageSize)}
              className="h-10 rounded-md border border-[var(--field-border)] bg-background px-2 text-base"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </span>
        ) : null}
        <Button
          icon={<ChevronLeft />}

          disabled={!list.hasPrevious}
          onClick={list.previous}
        >
          {t('action.previous')}
        </Button>
        <Button icon={<ChevronRight />} disabled={!list.hasNext} onClick={list.next}>
          {t('action.next')}
        </Button>
      </div>
    </div>
  );
}
