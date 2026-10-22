// Who acts (P4-RULE-03 · add-walkin-visit-checkout design D2): the signed-in user and their employee.
// The access guard of add-foundation-auth-access decides whether the action is allowed; the services
// take the actor as an input and record it (started_by, recorded_by, removed_by …).
export interface Actor {
  readonly user_id: string;
  readonly employee_id: string;
}
