import type { AuditSource } from '@point/shared';

// One application audit row as the writer built it (add-foundation-auth-access design D12). The
// platform module's Audit service builds rows; TransactionRunner writes them just before commit.
// Nobody inserts an audit_events row by hand.
export interface AuditRow {
  readonly id: string;
  readonly occurred_at: Date;
  readonly actor_user_id: string | null;
  readonly actor_session_id: string | null;
  readonly source: AuditSource;
  readonly action: string;
  readonly entity_type: string;
  readonly entity_id: string | null;
  readonly branch_id: string | null;
  readonly before_data: Readonly<Record<string, unknown>> | null;
  readonly after_data: Readonly<Record<string, unknown>> | null;
  readonly reason: string | null;
  readonly request_id: string | null;
}
