// The catalogue `/dev/ui` (AD-IMPL-06 · design D12): imported only by apps/web/app/staff/dev/ui.
export { FontsSection } from './demos/fonts-section';
export { FormattersSection } from './demos/formatters-section';
export { TokensSection } from './demos/tokens-section';
export { CatalogueProviders } from './catalogue-providers';
export { anchorOf, MANIFEST, type ManifestDemo, type ManifestEntry } from './manifest';
export { SectionDemos } from './section-demos';
export { CATALOGUE_SECTIONS, type CatalogueSection, type CatalogueSectionId } from './sections';
export { FixtureGrantsProvider, FixturePermissionGate, useFixtureCan } from './fixture-grants';
export {
  FIXTURE_PERMISSIONS,
  PERSONA_GRANTS,
  PERSONAS,
  type FixturePermission,
  type Persona,
} from './personas';
