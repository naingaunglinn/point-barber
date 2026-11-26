import { Injectable } from '@nestjs/common';

import type { Tx } from '../../../common/database/transaction-runner.js';
import { EmployeeRepository } from '../repositories/employee.repository.js';

// The employee code of a create (design D5 · D-EMP-03). `next` arrives with task 3.3; the lock of
// every writer that reads the highest number of a company is here so the order of design D1 can name
// it (advisory `coadmin` → advisory `empcode` → branch rows → …).
@Injectable()
export class EmployeeCodes {
  constructor(private readonly employees: EmployeeRepository) {}

  /** Waits for the other creates of the company; released at commit or rollback. */
  lock(tx: Tx, companyId: string): Promise<void> {
    return this.employees.lockEmployeeCodes(tx, companyId);
  }
}
