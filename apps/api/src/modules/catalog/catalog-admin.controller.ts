import { Controller, HttpCode, Param, Patch, Post, Put, Res } from '@nestjs/common';
import {
  type CategoryCreateBody,
  type CategoryOrderBody,
  type CategoryUpdateBody,
  type ServiceCategoryDto,
  type ServiceCreateBody,
  type ServiceDto,
  type ServiceListItemDto,
  type ServiceOrderBody,
  type ServiceUpdateBody,
  categoryCreateSchema,
  categoryOrderSchema,
  categoryUpdateSchema,
  serviceCreateSchema,
  serviceOrderSchema,
  serviceUpdateSchema,
} from '@point/shared';
import type { Response } from 'express';

import { Can } from '../../common/access/declarations.js';
import { ZBody } from '../../common/http/zod-validation.pipe.js';
import { Audited } from '../platform/index.js';
import {
  CATEGORY_ARCHIVE,
  CATEGORY_CREATE,
  CATEGORY_REORDER,
  CATEGORY_UPDATE,
  CategoryWrites,
} from './category-writes/category-writes.js';
import {
  SERVICE_ARCHIVE,
  SERVICE_CREATE,
  SERVICE_REORDER,
  SERVICE_UPDATE,
  ServiceWrites,
} from './service-writes/service-writes.js';

// The catalogue master writes of add-service-catalogue (design D2): categories and services. One access
// declaration each (API-PERM-02): company master data, so `level: 'company'` — a holder at branch scope gets
// `company_scope_required`, a caller without the code `forbidden` with `context.required`. The operational
// reads stay in CatalogController, whose routes are `@Staff()`.
@Controller('v1')
export class CatalogAdminController {
  constructor(
    private readonly categories: CategoryWrites,
    private readonly services: ServiceWrites,
  ) {}

  /** P2.CAT.02 — 201 with `Location` (API-DATA-10). */
  @Post('service-categories')
  @Can('service.create', { level: 'company' })
  @Audited({ actions: [CATEGORY_CREATE] })
  async createCategory(
    @ZBody(categoryCreateSchema) body: CategoryCreateBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServiceCategoryDto> {
    const category = await this.categories.create(body);
    res.location(`/api/v1/service-categories/${category.id}`);
    return category;
  }

  /** P2.CAT.05 — registered before the `:id` routes of the same path (design D2). */
  @Put('service-categories/order')
  @Can('service.update', { level: 'company' })
  @Audited({ actions: [CATEGORY_REORDER] })
  reorderCategories(
    @ZBody(categoryOrderSchema) body: CategoryOrderBody,
  ): Promise<{ items: ServiceCategoryDto[] }> {
    return this.categories.reorder(body);
  }

  /** P2.CAT.03 */
  @Patch('service-categories/:id')
  @Can('service.update', { level: 'company' })
  @Audited({ actions: [CATEGORY_UPDATE] })
  updateCategory(
    @Param('id') id: string,
    @ZBody(categoryUpdateSchema) body: CategoryUpdateBody,
  ): Promise<ServiceCategoryDto> {
    return this.categories.update(id, body);
  }

  /** P2.CAT.04 — an action endpoint: 200 with the row (a repeat answers the same row). */
  @Post('service-categories/:id/archive')
  @HttpCode(200)
  @Can('service.delete', { level: 'company' })
  @Audited({ actions: [CATEGORY_ARCHIVE] })
  archiveCategory(@Param('id') id: string): Promise<ServiceCategoryDto> {
    return this.categories.archive(id);
  }

  /** P2.SVC.02 — 201 with `Location` (API-DATA-10). */
  @Post('services')
  @Can('service.create', { level: 'company' })
  @Audited({ actions: [SERVICE_CREATE] })
  async createService(
    @ZBody(serviceCreateSchema) body: ServiceCreateBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ServiceDto> {
    const service = await this.services.create(body);
    res.location(`/api/v1/services/${service.id}`);
    return service;
  }

  /** P2.SVC.07 — registered before the `:id` routes of the same path (design D2). */
  @Put('services/order')
  @Can('service.update', { level: 'company' })
  @Audited({ actions: [SERVICE_REORDER] })
  reorderServices(
    @ZBody(serviceOrderSchema) body: ServiceOrderBody,
  ): Promise<{ items: ServiceListItemDto[] }> {
    return this.services.reorder(body);
  }

  /** P2.SVC.04 */
  @Patch('services/:id')
  @Can('service.update', { level: 'company' })
  @Audited({ actions: [SERVICE_UPDATE] })
  updateService(
    @Param('id') id: string,
    @ZBody(serviceUpdateSchema) body: ServiceUpdateBody,
  ): Promise<ServiceDto & { warnings: [] }> {
    return this.services.update(id, body);
  }

  /** P2.SVC.05 — an action endpoint: 200 with the row (a repeat answers the same row). */
  @Post('services/:id/archive')
  @HttpCode(200)
  @Can('service.delete', { level: 'company' })
  @Audited({ actions: [SERVICE_ARCHIVE] })
  archiveService(@Param('id') id: string): Promise<ServiceDto & { warnings: [] }> {
    return this.services.archive(id);
  }
}
