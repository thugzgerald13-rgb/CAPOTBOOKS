export interface PayrollPeriodRecord {
  payrollId: string;
  periodName: string;
  periodType: '1st Half' | '2nd Half' | 'Monthly' | 'Special Run';
  cutoffStartDate: string;
  cutoffEndDate: string;
  payDate: string;
  statutoryVersionId: string;
  taxTableVersion: string;
  deductSss: boolean;
  deductPhilHealth: boolean;
  deductPagIbig: boolean;
  status: 'Draft' | 'In-Progress' | 'Checked' | 'Approved' | 'Paid' | 'Locked';
  lockedTimestamp: string;
  lockedBy: string;
  totalWorkingDays: number;
  expectedWorkHours: number;
  remarks?: string;
}

export const PAYROLL_PERIODS_2025: PayrollPeriodRecord[] = [
  // JANUARY 2025
  {
    payrollId: 'PR-2025-01-P1',
    periodName: 'January 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-01-01',
    cutoffEndDate: '2025-01-15',
    payDate: '2025-01-20',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Locked',
    lockedTimestamp: '2025-01-20T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 11,
    expectedWorkHours: 88,
    remarks: 'Historical period - locked and immutable'
  },
  {
    payrollId: 'PR-2025-01-P2',
    periodName: 'January 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-01-16',
    cutoffEndDate: '2025-01-31',
    payDate: '2025-02-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Locked',
    lockedTimestamp: '2025-02-05T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 12,
    expectedWorkHours: 96,
    remarks: 'Full statutory deductions applied'
  },

  // FEBRUARY 2025
  {
    payrollId: 'PR-2025-02-P1',
    periodName: 'February 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-02-01',
    cutoffEndDate: '2025-02-15',
    payDate: '2025-02-20',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Locked',
    lockedTimestamp: '2025-02-20T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 10,
    expectedWorkHours: 80,
    remarks: 'Historical period - locked'
  },
  {
    payrollId: 'PR-2025-02-P2',
    periodName: 'February 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-02-16',
    cutoffEndDate: '2025-02-28',
    payDate: '2025-03-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Locked',
    lockedTimestamp: '2025-03-05T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 10,
    expectedWorkHours: 80,
    remarks: 'Full statutory deductions applied'
  },

  // MARCH 2025
  {
    payrollId: 'PR-2025-03-P1',
    periodName: 'March 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-03-01',
    cutoffEndDate: '2025-03-15',
    payDate: '2025-03-20',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Locked',
    lockedTimestamp: '2025-03-20T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 10,
    expectedWorkHours: 80,
    remarks: 'Historical period - locked'
  },
  {
    payrollId: 'PR-2025-03-P2',
    periodName: 'March 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-03-16',
    cutoffEndDate: '2025-03-31',
    payDate: '2025-04-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Locked',
    lockedTimestamp: '2025-04-05T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 11,
    expectedWorkHours: 88,
    remarks: 'Full statutory deductions applied'
  },

  // APRIL 2025
  {
    payrollId: 'PR-2025-04-P1',
    periodName: 'April 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-04-01',
    cutoffEndDate: '2025-04-15',
    payDate: '2025-04-20',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Locked',
    lockedTimestamp: '2025-04-20T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 9,
    expectedWorkHours: 72,
    remarks: 'Araw ng Kagitingan included'
  },
  {
    payrollId: 'PR-2025-04-P2',
    periodName: 'April 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-04-16',
    cutoffEndDate: '2025-04-30',
    payDate: '2025-05-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Locked',
    lockedTimestamp: '2025-05-05T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 10,
    expectedWorkHours: 80,
    remarks: 'Maundy Thursday & Good Friday included'
  },

  // MAY 2025
  {
    payrollId: 'PR-2025-05-P1',
    periodName: 'May 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-05-01',
    cutoffEndDate: '2025-05-15',
    payDate: '2025-05-20',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Locked',
    lockedTimestamp: '2025-05-20T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 10,
    expectedWorkHours: 80,
    remarks: 'Labor Day (May 1) included'
  },
  {
    payrollId: 'PR-2025-05-P2',
    periodName: 'May 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-05-16',
    cutoffEndDate: '2025-05-31',
    payDate: '2025-06-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Locked',
    lockedTimestamp: '2025-06-05T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 11,
    expectedWorkHours: 88,
    remarks: 'Full statutory deductions applied'
  },

  // JUNE 2025
  {
    payrollId: 'PR-2025-06-P1',
    periodName: 'June 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-06-01',
    cutoffEndDate: '2025-06-15',
    payDate: '2025-06-20',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Locked',
    lockedTimestamp: '2025-06-20T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 9,
    expectedWorkHours: 72,
    remarks: 'Independence Day (June 12) included'
  },
  {
    payrollId: 'PR-2025-06-P2',
    periodName: 'June 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-06-16',
    cutoffEndDate: '2025-06-30',
    payDate: '2025-07-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Locked',
    lockedTimestamp: '2025-07-05T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 11,
    expectedWorkHours: 88,
    remarks: 'Mid-year 2nd half closed'
  },

  // JULY 2025
  {
    payrollId: 'PR-2025-07-P1',
    periodName: 'July 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-07-01',
    cutoffEndDate: '2025-07-15',
    payDate: '2025-07-20',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Locked',
    lockedTimestamp: '2025-07-20T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 11,
    expectedWorkHours: 88,
    remarks: 'Historical period - locked'
  },
  {
    payrollId: 'PR-2025-07-P2',
    periodName: 'July 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-07-16',
    cutoffEndDate: '2025-07-31',
    payDate: '2025-08-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Locked',
    lockedTimestamp: '2025-08-05T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 12,
    expectedWorkHours: 96,
    remarks: 'Full statutory deductions applied'
  },

  // AUGUST 2025
  {
    payrollId: 'PR-2025-08-P1',
    periodName: 'August 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-08-01',
    cutoffEndDate: '2025-08-15',
    payDate: '2025-08-20',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Locked',
    lockedTimestamp: '2025-08-20T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 11,
    expectedWorkHours: 88,
    remarks: 'Historical period - locked'
  },
  {
    payrollId: 'PR-2025-08-P2',
    periodName: 'August 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-08-16',
    cutoffEndDate: '2025-08-31',
    payDate: '2025-09-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Locked',
    lockedTimestamp: '2025-09-05T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 9,
    expectedWorkHours: 72,
    remarks: 'Ninoy Aquino Day & National Heroes Day'
  },

  // SEPTEMBER 2025
  {
    payrollId: 'PR-2025-09-P1',
    periodName: 'September 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-09-01',
    cutoffEndDate: '2025-09-15',
    payDate: '2025-09-20',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Locked',
    lockedTimestamp: '2025-09-20T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 11,
    expectedWorkHours: 88,
    remarks: 'Historical period - locked'
  },
  {
    payrollId: 'PR-2025-09-P2',
    periodName: 'September 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-09-16',
    cutoffEndDate: '2025-09-30',
    payDate: '2025-10-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Locked',
    lockedTimestamp: '2025-10-05T17:00:00Z',
    lockedBy: 'admin@cassiopeia-andromeda.ph',
    totalWorkingDays: 11,
    expectedWorkHours: 88,
    remarks: 'Full statutory deductions applied'
  },

  // OCTOBER 2025 (ACTIVE / IN-PROGRESS CURRENT PERIOD)
  {
    payrollId: 'PR-2025-10-P1',
    periodName: 'October 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-10-01',
    cutoffEndDate: '2025-10-15',
    payDate: '2025-10-20',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'In-Progress',
    lockedTimestamp: '',
    lockedBy: '',
    totalWorkingDays: 11,
    expectedWorkHours: 88,
    remarks: 'CURRENT ACTIVE PAYROLL RUN &bull; Attendance data synced'
  },
  {
    payrollId: 'PR-2025-10-P2',
    periodName: 'October 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-10-16',
    cutoffEndDate: '2025-10-31',
    payDate: '2025-11-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Draft',
    lockedTimestamp: '',
    lockedBy: '',
    totalWorkingDays: 12,
    expectedWorkHours: 96,
    remarks: 'Upcoming regular run'
  },

  // NOVEMBER 2025
  {
    payrollId: 'PR-2025-11-P1',
    periodName: 'November 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-11-01',
    cutoffEndDate: '2025-11-15',
    payDate: '2025-11-20',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Draft',
    lockedTimestamp: '',
    lockedBy: '',
    totalWorkingDays: 10,
    expectedWorkHours: 80,
    remarks: 'All Saints Day (Nov 1) included'
  },
  {
    payrollId: 'PR-2025-11-P2',
    periodName: 'November 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-11-16',
    cutoffEndDate: '2025-11-30',
    payDate: '2025-12-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Draft',
    lockedTimestamp: '',
    lockedBy: '',
    totalWorkingDays: 10,
    expectedWorkHours: 80,
    remarks: 'Bonifacio Day (Nov 30) included'
  },

  // DECEMBER 2025
  {
    payrollId: 'PR-2025-12-P1',
    periodName: 'December 2025 - 1st Half',
    periodType: '1st Half',
    cutoffStartDate: '2025-12-01',
    cutoffEndDate: '2025-12-15',
    payDate: '2025-12-18', // Advanced payout before holidays
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false,
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Draft',
    lockedTimestamp: '',
    lockedBy: '',
    totalWorkingDays: 10,
    expectedWorkHours: 80,
    remarks: 'Feast of Immaculate Conception (Dec 8) included'
  },
  {
    payrollId: 'PR-2025-12-P2',
    periodName: 'December 2025 - 2nd Half',
    periodType: '2nd Half',
    cutoffStartDate: '2025-12-16',
    cutoffEndDate: '2025-12-31',
    payDate: '2026-01-05',
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: true,
    deductPhilHealth: true,
    deductPagIbig: true,
    status: 'Draft',
    lockedTimestamp: '',
    lockedBy: '',
    totalWorkingDays: 10,
    expectedWorkHours: 80,
    remarks: 'Christmas & Rizal Day holidays included'
  },

  // SPECIAL 13TH MONTH RUN
  {
    payrollId: 'PR-2025-13TH',
    periodName: '2025 Annual 13th Month Pay',
    periodType: 'Special Run',
    cutoffStartDate: '2025-01-01',
    cutoffEndDate: '2025-11-30',
    payDate: '2025-12-10', // Mandated by DOLE on or before Dec 24
    statutoryVersionId: 'SSS-2025-V1',
    taxTableVersion: 'TAX-TRAIN-SM-T1',
    deductSss: false, // Statutory contributions do not apply to 13th month
    deductPhilHealth: false,
    deductPagIbig: false,
    status: 'Draft',
    lockedTimestamp: '',
    lockedBy: '',
    totalWorkingDays: 240,
    expectedWorkHours: 1920,
    remarks: 'P.D. 851 Mandated Benefit (Tax-exempt up to ₱90K threshold)'
  }
];

export function validatePeriodDates(start: string, end: string, pay: string): { valid: boolean; error?: string } {
  const dStart = new Date(start);
  const dEnd = new Date(end);
  const dPay = new Date(pay);

  if (isNaN(dStart.getTime()) || isNaN(dEnd.getTime()) || isNaN(dPay.getTime())) {
    return { valid: false, error: 'Invalid ISO date string.' };
  }
  if (dEnd < dStart) {
    return { valid: false, error: 'Cutoff End Date cannot be earlier than Cutoff Start Date.' };
  }
  if (dPay < dEnd) {
    return { valid: false, error: 'Disbursement Pay Date cannot be earlier than Cutoff End Date.' };
  }
  return { valid: true };
}

export function checkPeriodOverlap(periods: PayrollPeriodRecord[], candidate: PayrollPeriodRecord): { overlap: boolean; conflictingId?: string } {
  const cStart = new Date(candidate.cutoffStartDate).getTime();
  const cEnd = new Date(candidate.cutoffEndDate).getTime();

  for (const p of periods) {
    if (p.payrollId === candidate.payrollId) continue;
    if (p.periodType === 'Special Run' || candidate.periodType === 'Special Run') continue; // Special runs like 13th month can span multiple months

    const pStart = new Date(p.cutoffStartDate).getTime();
    const pEnd = new Date(p.cutoffEndDate).getTime();

    // Check if intervals overlap
    if (cStart <= pEnd && cEnd >= pStart) {
      return { overlap: true, conflictingId: p.payrollId };
    }
  }

  return { overlap: false };
}
