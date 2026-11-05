'use client';

import { useTranslations } from 'next-intl';

import { ErrorState, PageHeader, Skeleton } from '@point/ui';

import { CompanyForm } from '../../../../../components/settings/CompanyForm';
import { CompanyReadOnly } from '../../../../../components/settings/CompanyReadOnly';
import { editsCompany, seesCompany } from '../../../../../components/settings/company-access';
import { screenProblem } from '../../../../../lib/pos/problem';
import { MainQueryState, RefusedPage } from '../../../../../lib/session/main-query-state';
import { useCan } from '../../../../../lib/session/grants';
import { useCompany } from '../../../../../lib/settings/company';

// /settings/company — Settings › Company (organization spec "Settings › Company is shown to holders of a
// company code and editable only with company scope" · AD-PERM-02 / 03 · AD-STATE-01 / 03 / 04 ·
// add-company-profile design D8 · proposal reading 13 · task 4.3): without a `company.*` code the "no
// access" page with a link Home; with company-scope `company.update` the form; with any other `company.*`
// grant the values as text. A slow load shows the skeleton after 400 ms; a failed one the error state
// with Retry and the short error ID. The page title is the screen's name (WCAG 2.4.2).
export function CompanyScreen() {
  const t = useTranslations('settings.company');
  const can = useCan();
  const sees = seesCompany(can);
  const company = useCompany(sees);
  if (!sees) return <RefusedPage code="forbidden" />;

  let content;
  if (company.isError) {
    const { code, request_id } = screenProblem(company.error);
    content = (
      <MainQueryState error={company.error}>
        <ErrorState
          problem={{ code, ...(request_id === '' ? {} : { request_id }) }}
          onRetry={() => company.refetch()}
        />
      </MainQueryState>
    );
  } else if (company.data === undefined) {
    content = (
      <div aria-busy="true" data-testid="company-loading">
        <Skeleton shape="row" count={6} />
      </div>
    );
  } else if (editsCompany(can)) {
    content = (
      <CompanyForm
        company={company.data}
        reload={async () => {
          const { data } = await company.refetch({ throwOnError: true });
          if (data === undefined) throw new Error('GET /v1/company answered no company');
          return data;
        }}
      />
    );
  } else {
    content = <CompanyReadOnly company={company.data} />;
  }

  return (
    <div className="grid w-full gap-6" data-testid="company-screen">
      <title>{t('title')}</title>
      <PageHeader title={t('title')} />
      {content}
    </div>
  );
}
