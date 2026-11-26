'use client';

import { useTranslations } from 'next-intl';

import { PageHeader, toast, useGuardedRouter } from '@point/ui';

import { CustomerForm } from '../../../../../components/customers/CustomerForm';
import { useCustomerAccess } from '../../../../../lib/customers/access';
import { createFormSchema, emptyCustomerValues } from '../../../../../lib/customers/form-values';
import { useCreateCustomer, useRestoreCustomer } from '../../../../../lib/customers/queries';
import { RefusedPage } from '../../../../../lib/session/main-query-state';

// /customers/new — Add customer (add-customer-management spec "The Add customer form shows an existing
// customer instead of a duplicate" · AD-PERM-02 · design D11 · task 4.5): only with `customer.create`, else
// the forbidden page. Save → P3.CUS.03 → the toast "Customer saved" and the new customer's page. An
// existing phone offers *Open customer* and, with `customer.delete` and an archived holder, *Restore*
// (P3.CUS.08, then the toast and the page). Cancel goes back to the list.
export function NewCustomerScreen() {
  const t = useTranslations('customer');
  const router = useGuardedRouter();
  const access = useCustomerAccess();
  const create = useCreateCustomer();
  const restore = useRestoreCustomer();
  if (!access.create) return <RefusedPage code="forbidden" />;
  // A deliberate leave for the page of the customer that already exists: nothing typed here is kept.
  const open = (id: string) => router.bypass(() => router.push(`/customers/${id}`));
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6" data-testid="customer-new-screen">
      <title>{t('form.title.new')}</title>
      <PageHeader title={t('form.title.new')} />
      <CustomerForm
        defaultValues={emptyCustomerValues()}
        schema={createFormSchema}
        save={(body) => create.mutateAsync(body)}
        onSaved={(customer) => {
          toast.success(t('toast.saved'));
          open(customer.id);
        }}
        onCancel={() => router.push('/customers')}
        onOpen={open}
        {...(access.remove
          ? {
              onRestore: async (id: string) => {
                const customer = await restore.mutateAsync(id);
                toast.success(t('toast.restored'));
                open(customer.id);
              },
            }
          : {})}
      />
    </div>
  );
}
