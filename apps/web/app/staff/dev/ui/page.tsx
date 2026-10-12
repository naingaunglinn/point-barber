import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { LOCALE_COOKIE, LOCALES, loadMessages } from '@point/i18n';
import { formatDateTime } from '@point/shared';
import { ClockProvider } from '@point/ui';
import {
  CATALOGUE_SECTIONS,
  FontsSection,
  FormattersSection,
  TokensSection,
  type CatalogueSectionId,
} from '@point/ui/catalogue';

import { DEV_CATALOGUE } from '../../../../env';
import { HtmlAttributes } from './html-attributes';
import { catalogueHref, parseCatalogueParams, PERSONAS, type CatalogueParams } from './params';

// The component catalogue `/dev/ui` (AD-IMPL-06 · design D12): every shared component in Myanmar and
// English, on fixture data, with no login and no API. Only the `dev` and `build:catalogue` builds
// have it; any other build answers 404.

const PERSONA_LABEL = {
  admin: 'admin',
  manager: 'manager',
  barber: 'barber',
  'branch-holder': 'branchHolder',
} as const;

const TREES = ['staff', 'site'] as const;

/** The sections built so far; the others keep their anchor and title until their demos arrive. */
function sectionContent(id: CatalogueSectionId, params: CatalogueParams) {
  switch (id) {
    case 'tokens':
      return <TokensSection tree={params.theme} />;
    case 'fonts':
      return <FontsSection tree={params.theme} lang={params.lang} />;
    case 'formatters':
      return <FormattersSection />;
    default:
      return null;
  }
}

type Props = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function CataloguePage({ searchParams }: Props) {
  if (!DEV_CATALOGUE) notFound();
  const params = parseCatalogueParams(
    await searchParams,
    (await cookies()).get(LOCALE_COOKIE)?.value,
  );
  const messages = loadMessages(params.lang);
  const t = createTranslator({ locale: params.lang, messages, namespace: 'devui' });

  const link = (change: Partial<CatalogueParams>, current: boolean, label: string) => (
    <a
      href={catalogueHref(params, change)}
      aria-current={current ? 'true' : undefined}
      className="rounded-md px-2 py-1 underline-offset-4 hover:underline aria-[current]:bg-primary aria-[current]:text-primary-foreground"
    >
      {label}
    </a>
  );

  return (
    <NextIntlClientProvider
      locale={params.lang}
      messages={messages}
      timeZone="Asia/Yangon"
      now={new Date(params.now)}
      formats={{}}
    >
      <HtmlAttributes lang={params.lang} tree={params.theme} />
      <ClockProvider now={params.now}>
        <div className="min-h-screen bg-background text-foreground">
          <header className="border-b border-border px-4 py-4">
            <h1 className="text-2xl font-bold">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('notice')}</p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-1">
                <dt className="font-bold">{t('control.language')}</dt>
                {LOCALES.map((lang) => (
                  <dd key={lang}>{link({ lang }, params.lang === lang, t(`language.${lang}`))}</dd>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <dt className="font-bold">{t('control.theme')}</dt>
                {TREES.map((theme) => (
                  <dd key={theme}>
                    {link({ theme }, params.theme === theme, t(`theme.${theme}`))}
                  </dd>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <dt className="font-bold">{t('control.persona')}</dt>
                {PERSONAS.map((as) => (
                  <dd key={as}>
                    {link({ as }, params.as === as, t(`persona.${PERSONA_LABEL[as]}`))}
                  </dd>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <dt className="font-bold">{t('control.clock')}</dt>
                <dd>
                  <time dateTime={params.now} data-testid="catalogue-clock">
                    {formatDateTime(params.now, { locale: params.lang })}
                  </time>
                </dd>
              </div>
            </dl>
          </header>
          <nav aria-label={t('nav.sections')} className="border-b border-border px-4 py-2">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {CATALOGUE_SECTIONS.map(({ id, label }) => (
                <li key={id}>
                  <a href={`#${id}`} className="underline-offset-4 hover:underline">
                    {t(`section.${label}`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <main className="px-4 py-6">
            {CATALOGUE_SECTIONS.map(({ id, label }) => (
              <section key={id} id={id} aria-labelledby={`${id}-title`} className="mb-10">
                <h2 id={`${id}-title`} className="mb-4 text-xl font-bold">
                  {t(`section.${label}`)}
                </h2>
                {sectionContent(id, params)}
              </section>
            ))}
          </main>
        </div>
      </ClockProvider>
    </NextIntlClientProvider>
  );
}
