import { ServicePricingMode, type ServiceListItemDto } from '@point/shared';

// The service chips of the START sheet (AD-POS-03 · AD-POS-05 · add-walkin-visit-checkout design D12): the
// first 6 simple services of the branch in catalogue order, as `GET /v1/services?branch_id=&pricing_mode=1`
// returns them. An option service is never a chip (it needs its option chosen in the picker). No usage
// ranking exists in V1.

export const START_CHIP_COUNT = 6;

export function startChips(services: readonly ServiceListItemDto[]): ServiceListItemDto[] {
  return services
    .filter((item) => item.pricing_mode === ServicePricingMode.SIMPLE)
    .slice(0, START_CHIP_COUNT);
}
