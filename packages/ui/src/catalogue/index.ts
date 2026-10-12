// The catalogue `/dev/ui` (AD-IMPL-06 · design D12): imported only by apps/web/app/staff/dev/ui.
export { FontsSection } from './demos/fonts-section';
export { FormattersSection } from './demos/formatters-section';
export { TokensSection } from './demos/tokens-section';
export { CATALOGUE_SECTIONS, type CatalogueSection, type CatalogueSectionId } from './sections';
export {
  FIXTURE_PERMISSIONS,
  FixtureGrantsProvider,
  FixturePermissionGate,
  PERSONA_GRANTS,
  PERSONAS,
  useFixtureCan,
  type FixturePermission,
  type Persona,
} from './personas';
