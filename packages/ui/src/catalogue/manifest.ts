import type { ComponentType } from 'react';

import type { Messages } from '@point/i18n';

import {
  ApprovalDecideDemo,
  ApprovalViewDemo,
  BellBadgeDemo,
  BellListDemo,
  QrCameraDemo,
  QrMockDemo,
} from './demos/notification-demos';
import { CanTableDemo, GateDemo } from './demos/permission-demos';
import { UploadDocumentDemo, UploadImageDemo, UploadImportDemo } from './demos/upload-demos';
import type { CatalogueSectionId } from './sections';

// The catalogue manifest (AD-IMPL-02 · AD-IMPL-06 · design D12): one entry per shared component —
// its section, the rules it implements and its demos. The page renders from it.

export interface ManifestDemo {
  readonly id: string;
  /** Key under `devui.demo`. */
  readonly title: keyof Messages['devui']['demo'];
  readonly Demo: ComponentType;
}

export interface ManifestEntry {
  readonly name: string;
  readonly section: CatalogueSectionId;
  readonly rules: readonly string[];
  readonly demos: readonly ManifestDemo[];
}

export const MANIFEST: readonly ManifestEntry[] = [
  {
    name: 'AttachmentUploader',
    section: 'inputs',
    rules: ['AD-FORM-16', 'API-LIM-03'],
    demos: [
      { id: 'image', title: 'uploadImage', Demo: UploadImageDemo },
      { id: 'document', title: 'uploadDocument', Demo: UploadDocumentDemo },
      { id: 'import', title: 'uploadImport', Demo: UploadImportDemo },
    ],
  },
  {
    name: 'PermissionGate',
    section: 'permissions',
    rules: ['AD-PERM-02', 'AD-PERM-04', 'AD-DET-03'],
    demos: [{ id: 'cancel-booking', title: 'gateCancel', Demo: GateDemo }],
  },
  {
    name: 'can',
    section: 'permissions',
    rules: ['AD-PERM-03', 'AD-PERM-05', 'API-AUTH-05', 'ADR-012'],
    demos: [{ id: 'persona', title: 'canTable', Demo: CanTableDemo }],
  },
  {
    name: 'NotificationBell',
    section: 'data-less-components',
    rules: ['AD-NTF-01', 'D-NTF-01', 'D-NTF-02', 'AD-FMT-09'],
    demos: [
      { id: 'list', title: 'bellList', Demo: BellListDemo },
      { id: 'badge', title: 'bellBadge', Demo: BellBadgeDemo },
    ],
  },
  {
    name: 'ApprovalCard',
    section: 'data-less-components',
    rules: ['AD-NTF-04', 'AD-POS-16', 'AD-PERM-02'],
    demos: [
      { id: 'decide', title: 'approvalDecide', Demo: ApprovalDecideDemo },
      { id: 'view-only', title: 'approvalView', Demo: ApprovalViewDemo },
    ],
  },
  {
    name: 'QrScanner',
    section: 'data-less-components',
    rules: ['AD-ATT-01', 'AD-QA-03'],
    demos: [
      { id: 'mock', title: 'qrMock', Demo: QrMockDemo },
      { id: 'camera', title: 'qrCamera', Demo: QrCameraDemo },
    ],
  },
];

/** `MoneyInput` → `money-input`, the component's anchor on the page. */
export const anchorOf = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
