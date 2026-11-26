import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';

// The three registries of the attachments module (add-attachments-upload design D8 · CG-ARCH-02 ·
// CG-ARCH-08 — the pattern of `BranchUsage`): the module that owns the rows registers, in its
// `onModuleInit`, what the attachments module may not know; `freeze()` runs at `onApplicationBootstrap`,
// after every module's `onModuleInit`. A duplicate key stops start-up with a message naming the key, and
// a registration after start-up throws and leaves the registry as it was.

abstract class Registry<V> {
  private readonly entries = new Map<string, V>();
  private frozen = false;

  protected constructor(private readonly name: string) {}

  protected add(key: string, label: string, value: V): void {
    if (this.frozen) throw new Error(`${this.name}: ${label} is registered after start-up`);
    if (this.entries.has(key)) throw new Error(`${this.name}: ${label} is registered twice`);
    this.entries.set(key, value);
  }

  protected find(key: string): V | undefined {
    return this.entries.get(key);
  }

  protected all(): V[] {
    return [...this.entries.values()];
  }

  /** After this no registration is accepted. */
  freeze(): void {
    this.frozen = true;
  }
}

/** `allow`; `deny` — the caller may not (a 403 where an answer is given); `hidden` — an answer of 404. */
export type PolicyDecision = 'allow' | 'deny' | 'hidden';

/** The signed-in caller a policy decides for. */
export interface PolicyCaller {
  readonly user_id: string;
}

/** Who may read and who may remove the files of one `(entity_type, kind)` (P8-RULE-03 policy table). */
export interface AttachmentPolicy {
  readonly entity_type: string;
  readonly kind: number;
  /** The right to read the files of this entity (`entity_id` is the entity the file belongs to). */
  read(caller: PolicyCaller, entityId: string): PolicyDecision | Promise<PolicyDecision>;
  /** The right to remove a file of this entity (task 4.6 uses it). */
  remove(caller: PolicyCaller, entityId: string): PolicyDecision | Promise<PolicyDecision>;
}

@Injectable()
export class AttachmentPolicies extends Registry<AttachmentPolicy> {
  constructor() {
    super('AttachmentPolicies');
  }

  register(policy: AttachmentPolicy): void {
    this.add(
      `${policy.entity_type}:${policy.kind}`,
      `("${policy.entity_type}", ${policy.kind})`,
      policy,
    );
  }

  /** The policy of a pair; undefined fails closed. */
  of(entityType: string, kind: number): AttachmentPolicy | undefined {
    return this.find(`${entityType}:${kind}`);
  }

  /** The policies registered for an entity type, by kind; empty when the type is unknown. */
  ofEntityType(entityType: string): AttachmentPolicy[] {
    return this.all().filter((policy) => policy.entity_type === entityType);
  }
}

/** A field that holds one image of its entity (`company_logo` → `logo_attachment_id`). */
export interface SingleImageField {
  readonly field: string;
  /** The member of the owner's body that carries the attachment id. */
  readonly member: string;
  readonly entity_type: string;
  /** The attachment now in the field, or null. */
  current(tx: Tx, entityId: string): Promise<string | null>;
}

@Injectable()
export class SingleImageFields extends Registry<SingleImageField> {
  constructor() {
    super('SingleImageFields');
  }

  register(field: SingleImageField): void {
    this.add(field.field, `"${field.field}"`, field);
  }

  of(field: string): SingleImageField | undefined {
    return this.find(field);
  }
}

/** Whether the live image row of an entity type may be served without a session (P8-RULE-04). */
export interface PublicMediaRule {
  readonly entity_type: string;
  isPublic(row: { readonly id: string; readonly entity_id: string }): boolean | Promise<boolean>;
}

@Injectable()
export class PublicMediaRules extends Registry<PublicMediaRule> {
  constructor() {
    super('PublicMediaRules');
  }

  register(rule: PublicMediaRule): void {
    this.add(rule.entity_type, `"${rule.entity_type}"`, rule);
  }

  of(entityType: string): PublicMediaRule | undefined {
    return this.find(entityType);
  }
}
