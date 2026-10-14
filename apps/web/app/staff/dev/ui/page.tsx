import type { Metadata } from 'next';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { LOCALE_COOKIE, loadMessages } from '@point/i18n';
import { formatDateTime } from '@point/shared';
import { ClockProvider } from '@point/ui';
import {
  CATALOGUE_SECTIONS,
  CatalogueControls,
  CatalogueProviders,
  FontsSection,
  FormattersSection,
  SectionDemos,
  TokensSection,
  type CatalogueSectionId,
} from '@point/ui/catalogue';

// The catalogue flag as a build-time constant: no environment read at run time can open the page
// (scripts/write-catalogue-flag.mjs).
import { DEV_CATALOGUE } from '../../../../catalogue-flag.generated';
import { HtmlAttributes } from './html-attributes';
import { parseCatalogueParams, type CatalogueParams } from './params';

// The component catalogue `/dev/ui` (AD-IMPL-06 · design D12): every shared component in Myanmar and
// English, on fixture data, with no login and no API. Only the `dev` and `build:catalogue` builds
// have it; any other build answers 404.

/** Tokens, Fonts and Formatters have their own tables; the other sections render the manifest. */
function sectionContent(id: CatalogueSectionId, params: CatalogueParams) {
  switch (id) {
    case 'tokens':
      return <TokensSection tree={params.theme} />;
    case 'fonts':
      return <FontsSection tree={params.theme} lang={params.lang} />;
    case 'formatters':
      return <FormattersSection />;
    default:
      return <SectionDemos section={id} />;
  }
}

type Props = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

async function paramsOf(searchParams: Props['searchParams']): Promise<CatalogueParams> {
  return parseCatalogueParams(await searchParams, (await cookies()).get(LOCALE_COOKIE)?.value);
}

/** The page title in the chosen language (WCAG 2.4.2 — axe `document-title`). */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  if (!DEV_CATALOGUE) return {};
  const { lang } = await paramsOf(searchParams);
  const t = createTranslator({ locale: lang, messages: loadMessages(lang), namespace: 'devui' });
  return { title: t('title') };
}

export default async function CataloguePage({ searchParams }: Props) {
  if (!DEV_CATALOGUE) notFound();
  const params = await paramsOf(searchParams);
  const messages = loadMessages(params.lang);
  const t = createTranslator({ locale: params.lang, messages, namespace: 'devui' });

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
            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <CatalogueControls lang={params.lang} theme={params.theme} as={params.as} />
              <div className="flex items-center gap-2">
                <span className="font-bold">{t('control.clock')}</span>
                <time dateTime={params.now} data-testid="catalogue-clock">
                  {formatDateTime(params.now, { locale: params.lang })}
                </time>
              </div>
            </div>
          </header>
          <nav aria-label={t('nav.sections')} className="border-b border-border px-4 py-2">
            <ul className="flex flex-wrap gap-2 text-sm">
              {CATALOGUE_SECTIONS.map(({ id, label }) => (
                <li key={id}>
                  {/* 44 px targets 8 px apart, like every control (AD-A11Y-05 · AD-VIS-07). */}
                  <a
                    href={`#${id}`}
                    className="inline-flex min-h-11 min-w-11 items-center px-2 underline-offset-4 hover:underline"
                  >
                    {t(`section.${label}`)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <CatalogueProviders lang={params.lang} theme={params.theme} as={params.as}>
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
          </CatalogueProviders>
        </div>
      </ClockProvider>
    </NextIntlClientProvider>
  );
}
