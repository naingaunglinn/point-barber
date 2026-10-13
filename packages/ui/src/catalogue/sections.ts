// The 14 sections of the catalogue, in page order (AD-IMPL-06 · design D12). `id` is the anchor
// (`/dev/ui#tokens`), `label` the key of its title under `devui.section`.
export const CATALOGUE_SECTIONS = [
  { id: 'tokens', label: 'tokens' },
  { id: 'fonts', label: 'fonts' },
  { id: 'formatters', label: 'formatters' },
  { id: 'buttons-and-forms', label: 'buttonsForms' },
  { id: 'inputs', label: 'inputs' },
  { id: 'badges-and-chips', label: 'badgesChips' },
  { id: 'dialogs-and-overlays', label: 'dialogsOverlays' },
  { id: 'lists', label: 'lists' },
  { id: 'states', label: 'states' },
  { id: 'permissions', label: 'permissions' },
  { id: 'shell', label: 'shell' },
  { id: 'charts-and-kpi', label: 'chartsKpi' },
  { id: 'pickers', label: 'pickers' },
  { id: 'data-less-components', label: 'dataLess' },
] as const;

export type CatalogueSection = (typeof CATALOGUE_SECTIONS)[number];
export type CatalogueSectionId = CatalogueSection['id'];
