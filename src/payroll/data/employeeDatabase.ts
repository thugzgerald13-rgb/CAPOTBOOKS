export interface EmployeeRecord {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  fullName: string;
  preferredName: string;
  dateOfBirth: string;
  civilStatus: 'Single' | 'Married' | 'Widowed' | 'Legally Separated';
  dependentsCount: number;
  address: string;
  contactNumber: string;
  workEmail: string;
  dateHired: string;
  dateRegularized: string;
  dateSeparated: string;
  employmentStatus: 'Regular' | 'Probationary' | 'Contractual' | 'Resigned';
  employmentCategory: 'Executive' | 'Managerial' | 'Supervisory' | 'Rank & File';
  department: string;
  position: string;
  location: string;
  supervisorId: string;
  payType: 'Monthly' | 'Daily' | 'Hourly';
  payrollFrequency: 'Semi-Monthly' | 'Monthly';
  monthlySalary: number;
  dailyRate: number;
  hourlyRate: number;
  activeStatus: 'ACTIVE' | 'INACTIVE';
  remarks: string;
}

export interface SalaryHistoryRecord {
  salaryHistId: string;
  employeeId: string;
  effectiveDate: string;
  previousSalary: number;
  newSalary: number;
  adjustmentAmount: number;
  changeType: string;
  reason: string;
  approvedBy: string;
  approvalDate: string;
  remarks: string;
}

export interface BankDetailRecord {
  bankDetailId: string;
  employeeId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  accountType: string;
  disbursementMode: string;
  active: 'YES' | 'NO';
  effectiveDate: string;
  verifiedBy: string;
}

export interface GovernmentIdRecord {
  govIdRecordId: string;
  employeeId: string;
  tin: string;
  sssNumber: string;
  philHealthNumber: string;
  pagIbigNumber: string;
  rdoCode: string;
  verificationStatus: 'VERIFIED' | 'PENDING_DOCS';
  lastVerifiedDate: string;
  remarks: string;
}

// 12 Diverse Fictional Test Employees (Strictly Fictional Government IDs)
export const FICTIONAL_EMPLOYEES: EmployeeRecord[] = [
  {
    employeeId: 'EMP-2022-0001',
    employeeNumber: 'PH-1001',
    firstName: 'Maria Cristina',
    middleName: 'Santos',
    lastName: 'Reyes',
    suffix: '',
    fullName: 'Reyes, Maria Cristina S.',
    preferredName: 'Cris',
    dateOfBirth: '1984-06-15',
    civilStatus: 'Married',
    dependentsCount: 2,
    address: 'Unit 12B Horizon Tower, BGC, Taguig City, Metro Manila',
    contactNumber: '09171234501',
    workEmail: 'cristina.reyes@company.ph',
    dateHired: '2022-01-10',
    dateRegularized: '2022-07-10',
    dateSeparated: '',
    employmentStatus: 'Regular',
    employmentCategory: 'Executive',
    department: 'Executive Management',
    position: 'Chief Executive Officer',
    location: 'Corporate HQ - BGC',
    supervisorId: '',
    payType: 'Monthly',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 165000.00,
    dailyRate: 7586.21,
    hourlyRate: 948.28,
    activeStatus: 'ACTIVE',
    remarks: 'Company President; high-bracket tax; max statutory ceilings'
  },
  {
    employeeId: 'EMP-2023-0002',
    employeeNumber: 'PH-1002',
    firstName: 'Juan Carlo',
    middleName: 'Dela Cruz',
    lastName: 'Bautista',
    suffix: '',
    fullName: 'Bautista, Juan Carlo D.',
    preferredName: 'JC',
    dateOfBirth: '1989-11-23',
    civilStatus: 'Married',
    dependentsCount: 3,
    address: '45 Acacia Avenue, Ayala Alabang, Muntinlupa City',
    contactNumber: '09181234502',
    workEmail: 'jc.bautista@company.ph',
    dateHired: '2023-03-01',
    dateRegularized: '2023-09-01',
    dateSeparated: '',
    employmentStatus: 'Regular',
    employmentCategory: 'Managerial',
    department: 'Finance & Accounting',
    position: 'Finance Director',
    location: 'Corporate HQ - BGC',
    supervisorId: 'EMP-2022-0001',
    payType: 'Monthly',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 110000.00,
    dailyRate: 5057.47,
    hourlyRate: 632.18,
    activeStatus: 'ACTIVE',
    remarks: 'Finance approver for payroll workflow'
  },
  {
    employeeId: 'EMP-2023-0003',
    employeeNumber: 'PH-1003',
    firstName: 'Rosario',
    middleName: 'Flores',
    lastName: 'Mendoza',
    suffix: '',
    fullName: 'Mendoza, Rosario F.',
    preferredName: 'Rose',
    dateOfBirth: '1991-04-08',
    civilStatus: 'Single',
    dependentsCount: 0,
    address: '88 San Gregorio St., Kapitolyo, Pasig City',
    contactNumber: '09191234503',
    workEmail: 'rose.mendoza@company.ph',
    dateHired: '2023-05-15',
    dateRegularized: '2023-11-15',
    dateSeparated: '',
    employmentStatus: 'Regular',
    employmentCategory: 'Managerial',
    department: 'Human Resources',
    position: 'HR Manager',
    location: 'Corporate HQ - BGC',
    supervisorId: 'EMP-2022-0001',
    payType: 'Monthly',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 78000.00,
    dailyRate: 3586.21,
    hourlyRate: 448.28,
    activeStatus: 'ACTIVE',
    remarks: 'HR Checker for payroll validation'
  },
  {
    employeeId: 'EMP-2024-0004',
    employeeNumber: 'PH-1004',
    firstName: 'Mark Anthony',
    middleName: 'Villanueva',
    lastName: 'Tan',
    suffix: 'Jr.',
    fullName: 'Tan, Mark Anthony V. Jr.',
    preferredName: 'Mark',
    dateOfBirth: '1995-08-30',
    civilStatus: 'Single',
    dependentsCount: 0,
    address: '142 Katipunan Ave., Loyola Heights, Quezon City',
    contactNumber: '09201234504',
    workEmail: 'mark.tan@company.ph',
    dateHired: '2024-01-15',
    dateRegularized: '2024-07-15',
    dateSeparated: '',
    employmentStatus: 'Regular',
    employmentCategory: 'Supervisory',
    department: 'Information Technology',
    position: 'Lead Software Architect',
    location: 'Makati Tech Center',
    supervisorId: 'EMP-2022-0001',
    payType: 'Monthly',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 68000.00,
    dailyRate: 3126.44,
    hourlyRate: 390.80,
    activeStatus: 'ACTIVE',
    remarks: 'Exempt from OT pay pursuant to DOLE managerial guidelines'
  },
  {
    employeeId: 'EMP-2024-0005',
    employeeNumber: 'PH-1005',
    firstName: 'Patricia Anne',
    middleName: 'Alvarez',
    lastName: 'Lim',
    suffix: '',
    fullName: 'Lim, Patricia Anne A.',
    preferredName: 'Trish',
    dateOfBirth: '1997-02-14',
    civilStatus: 'Single',
    dependentsCount: 0,
    address: 'Tower 3, Light Residences, EDSA, Mandaluyong City',
    contactNumber: '09211234505',
    workEmail: 'trish.lim@company.ph',
    dateHired: '2024-02-01',
    dateRegularized: '2024-08-01',
    dateSeparated: '',
    employmentStatus: 'Regular',
    employmentCategory: 'Rank & File',
    department: 'Human Resources',
    position: 'Payroll Specialist',
    location: 'Corporate HQ - BGC',
    supervisorId: 'EMP-2023-0003',
    payType: 'Monthly',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 34000.00,
    dailyRate: 1563.22,
    hourlyRate: 195.40,
    activeStatus: 'ACTIVE',
    remarks: 'Payroll preparer in charge of input and calculation'
  },
  {
    employeeId: 'EMP-2024-0006',
    employeeNumber: 'PH-1006',
    firstName: 'Eduardo',
    middleName: 'Gonzales',
    lastName: 'Aquino',
    suffix: '',
    fullName: 'Aquino, Eduardo G.',
    preferredName: 'Ed',
    dateOfBirth: '1993-10-19',
    civilStatus: 'Married',
    dependentsCount: 1,
    address: '22 Sampaguita St., Pembo, Taguig City',
    contactNumber: '09221234506',
    workEmail: 'ed.aquino@company.ph',
    dateHired: '2024-03-15',
    dateRegularized: '2024-09-15',
    dateSeparated: '',
    employmentStatus: 'Regular',
    employmentCategory: 'Rank & File',
    department: 'Finance & Accounting',
    position: 'Senior Accountant',
    location: 'Corporate HQ - BGC',
    supervisorId: 'EMP-2023-0002',
    payType: 'Monthly',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 42000.00,
    dailyRate: 1931.03,
    hourlyRate: 241.38,
    activeStatus: 'ACTIVE',
    remarks: 'Active SSS Salary Loan amortizing semi-monthly'
  },
  {
    employeeId: 'EMP-2024-0007',
    employeeNumber: 'PH-1007',
    firstName: 'Danilo',
    middleName: 'Pascual',
    lastName: 'Tolentino',
    suffix: '',
    fullName: 'Tolentino, Danilo P.',
    preferredName: 'Danny',
    dateOfBirth: '1987-05-12',
    civilStatus: 'Married',
    dependentsCount: 4,
    address: 'Block 5 Lot 18, San Jose Del Monte, Bulacan',
    contactNumber: '09231234507',
    workEmail: 'danny.tolentino@company.ph',
    dateHired: '2024-04-01',
    dateRegularized: '2024-10-01',
    dateSeparated: '',
    employmentStatus: 'Regular',
    employmentCategory: 'Supervisory',
    department: 'Plant Operations',
    position: 'Production Shift Supervisor',
    location: 'Laguna Technopark Plant',
    supervisorId: 'EMP-2022-0001',
    payType: 'Monthly',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 38000.00,
    dailyRate: 1747.13,
    hourlyRate: 218.39,
    activeStatus: 'ACTIVE',
    remarks: 'Renders rotating overnight shifts; night differential recipient'
  },
  {
    employeeId: 'EMP-2024-0008',
    employeeNumber: 'PH-1008',
    firstName: 'Rodrigo',
    middleName: 'Castro',
    lastName: 'De Leon',
    suffix: '',
    fullName: 'De Leon, Rodrigo C.',
    preferredName: 'Rody',
    dateOfBirth: '1998-07-22',
    civilStatus: 'Single',
    dependentsCount: 0,
    address: '77 Narra St., Sta. Rosa, Laguna',
    contactNumber: '09241234508',
    workEmail: 'rody.deleon@company.ph',
    dateHired: '2024-06-01',
    dateRegularized: '2024-12-01',
    dateSeparated: '',
    employmentStatus: 'Regular',
    employmentCategory: 'Rank & File',
    department: 'Plant Operations',
    position: 'Machine Operator II',
    location: 'Laguna Technopark Plant',
    supervisorId: 'EMP-2024-0007',
    payType: 'Daily',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 18000.00,
    dailyRate: 610.00,
    hourlyRate: 76.25,
    activeStatus: 'ACTIVE',
    remarks: 'Daily-paid worker; regular recipient of OT, night diff, and rest-day premiums'
  },
  {
    employeeId: 'EMP-2024-0009',
    employeeNumber: 'PH-1009',
    firstName: 'Bernadette',
    middleName: 'Ilagan',
    lastName: 'Soriano',
    suffix: '',
    fullName: 'Soriano, Bernadette I.',
    preferredName: 'Det',
    dateOfBirth: '1999-09-05',
    civilStatus: 'Single',
    dependentsCount: 1,
    address: 'Blk 12 Lot 3, Carmona, Cavite',
    contactNumber: '09251234509',
    workEmail: 'det.soriano@company.ph',
    dateHired: '2024-07-15',
    dateRegularized: '2025-01-15',
    dateSeparated: '',
    employmentStatus: 'Regular',
    employmentCategory: 'Rank & File',
    department: 'Plant Operations',
    position: 'Quality Assurance Inspector',
    location: 'Laguna Technopark Plant',
    supervisorId: 'EMP-2024-0007',
    payType: 'Daily',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 18500.00,
    dailyRate: 625.00,
    hourlyRate: 78.13,
    activeStatus: 'ACTIVE',
    remarks: 'Solo parent statutory leave beneficiary'
  },
  {
    employeeId: 'EMP-2025-0010',
    employeeNumber: 'PH-1010',
    firstName: 'Angelo',
    middleName: 'Ramos',
    lastName: 'Garcia',
    suffix: '',
    fullName: 'Garcia, Angelo R.',
    preferredName: 'Gelo',
    dateOfBirth: '2001-12-10',
    civilStatus: 'Single',
    dependentsCount: 0,
    address: '15 Rosal St., Poblacion, Makati City',
    contactNumber: '09261234510',
    workEmail: 'angelo.garcia@company.ph',
    dateHired: '2025-01-06',
    dateRegularized: '',
    dateSeparated: '',
    employmentStatus: 'Probationary',
    employmentCategory: 'Rank & File',
    department: 'Sales & Marketing',
    position: 'Sales Account Executive',
    location: 'Makati Tech Center',
    supervisorId: 'EMP-2022-0001',
    payType: 'Monthly',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 28000.00,
    dailyRate: 1287.36,
    hourlyRate: 160.92,
    activeStatus: 'ACTIVE',
    remarks: 'New hire (probationary); recipient of taxable sales commissions'
  },
  {
    employeeId: 'EMP-2025-0011',
    employeeNumber: 'PH-1011',
    firstName: 'Kathleen',
    middleName: 'Navarro',
    lastName: 'Del Rosario',
    suffix: '',
    fullName: 'Del Rosario, Kathleen N.',
    preferredName: 'Kat',
    dateOfBirth: '1996-03-25',
    civilStatus: 'Married',
    dependentsCount: 1,
    address: '502 Cypress Bld., Marikina Heights, Marikina City',
    contactNumber: '09271234511',
    workEmail: 'kat.delrosario@company.ph',
    dateHired: '2025-01-16',
    dateRegularized: '',
    dateSeparated: '',
    employmentStatus: 'Probationary',
    employmentCategory: 'Rank & File',
    department: 'Information Technology',
    position: 'UI/UX Designer',
    location: 'Makati Tech Center',
    supervisorId: 'EMP-2024-0004',
    payType: 'Monthly',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 36000.00,
    dailyRate: 1655.17,
    hourlyRate: 206.90,
    activeStatus: 'ACTIVE',
    remarks: 'Hired mid-period on Jan 16; tests prorated salary calculation'
  },
  {
    employeeId: 'EMP-2023-0012',
    employeeNumber: 'PH-1012',
    firstName: 'Ramon',
    middleName: 'Fernandez',
    lastName: 'Estrada',
    suffix: '',
    fullName: 'Estrada, Ramon F.',
    preferredName: 'Mon',
    dateOfBirth: '1990-08-17',
    civilStatus: 'Single',
    dependentsCount: 0,
    address: '18 Malvar St., San Lorenzo, Makati City',
    contactNumber: '09281234512',
    workEmail: 'mon.estrada@company.ph',
    dateHired: '2023-08-01',
    dateRegularized: '2024-02-01',
    dateSeparated: '2024-12-31',
    employmentStatus: 'Resigned',
    employmentCategory: 'Rank & File',
    department: 'Sales & Marketing',
    position: 'Marketing Specialist',
    location: 'Makati Tech Center',
    supervisorId: 'EMP-2022-0001',
    payType: 'Monthly',
    payrollFrequency: 'Semi-Monthly',
    monthlySalary: 32000.00,
    dailyRate: 1471.26,
    hourlyRate: 183.91,
    activeStatus: 'INACTIVE',
    remarks: 'Separated employee; tests exclusion from active payroll runs and 13th month prorating'
  }
];

// Fictional Salary History Records
export const FICTIONAL_SALARY_HISTORY: SalaryHistoryRecord[] = [
  {
    salaryHistId: 'SAL-HIST-00001',
    employeeId: 'EMP-2022-0001',
    effectiveDate: '2022-01-10',
    previousSalary: 0.00,
    newSalary: 150000.00,
    adjustmentAmount: 150000.00,
    changeType: 'Initial Onboarding',
    reason: 'Initial contracted CEO base salary upon corporate incorporation',
    approvedBy: 'Board of Directors',
    approvalDate: '2022-01-05',
    remarks: 'Founding executive contract'
  },
  {
    salaryHistId: 'SAL-HIST-00002',
    employeeId: 'EMP-2022-0001',
    effectiveDate: '2024-01-01',
    previousSalary: 150000.00,
    newSalary: 165000.00,
    adjustmentAmount: 150000.00,
    changeType: 'Annual Merit',
    reason: 'Annual executive performance and inflation adjustment (+10%)',
    approvedBy: 'Board of Directors',
    approvalDate: '2023-12-15',
    remarks: 'Board Resolution No. 2023-14'
  },
  {
    salaryHistId: 'SAL-HIST-00003',
    employeeId: 'EMP-2023-0002',
    effectiveDate: '2023-03-01',
    previousSalary: 0.00,
    newSalary: 100000.00,
    adjustmentAmount: 100000.00,
    changeType: 'Initial Onboarding',
    reason: 'Finance Director employment offer',
    approvedBy: 'EMP-2022-0001',
    approvalDate: '2023-02-20',
    remarks: 'Confirmed CPA candidate'
  },
  {
    salaryHistId: 'SAL-HIST-00004',
    employeeId: 'EMP-2023-0002',
    effectiveDate: '2024-07-01',
    previousSalary: 100000.00,
    newSalary: 110000.00,
    adjustmentAmount: 10000.00,
    changeType: 'Merit',
    reason: 'Mid-year performance merit adjustment',
    approvedBy: 'EMP-2022-0001',
    approvalDate: '2024-06-20',
    remarks: 'Approved by CEO'
  },
  {
    salaryHistId: 'SAL-HIST-00005',
    employeeId: 'EMP-2024-0005',
    effectiveDate: '2024-02-01',
    previousSalary: 0.00,
    newSalary: 30000.00,
    adjustmentAmount: 30000.00,
    changeType: 'Initial Onboarding',
    reason: 'Probationary employment offer for Payroll Specialist',
    approvedBy: 'EMP-2023-0003',
    approvalDate: '2024-01-25',
    remarks: 'HR Operations team'
  },
  {
    salaryHistId: 'SAL-HIST-00006',
    employeeId: 'EMP-2024-0005',
    effectiveDate: '2024-08-01',
    previousSalary: 30000.00,
    newSalary: 34000.00,
    adjustmentAmount: 4000.00,
    changeType: 'Regularization',
    reason: 'Regularization salary increase upon satisfactory 6-month probationary review',
    approvedBy: 'EMP-2023-0003',
    approvalDate: '2024-07-28',
    remarks: 'Granted permanent status'
  },
  {
    salaryHistId: 'SAL-HIST-00007',
    employeeId: 'EMP-2024-0008',
    effectiveDate: '2024-06-01',
    previousSalary: 0.00,
    newSalary: 18000.00,
    adjustmentAmount: 18000.00,
    changeType: 'Initial Onboarding',
    reason: 'Plant Machine Operator contract (₱610.00 daily rate)',
    approvedBy: 'EMP-2024-0007',
    approvalDate: '2024-05-25',
    remarks: 'Complies with Region IV-A Wage Order No. RBIVA-20'
  }
];

// Fictional Government ID Records (Strictly Fictional Formats)
export const FICTIONAL_GOVERNMENT_IDS: GovernmentIdRecord[] = [
  {
    govIdRecordId: 'GID-2022-0001',
    employeeId: 'EMP-2022-0001',
    tin: '100-234-567-000',
    sssNumber: '03-1234567-8',
    philHealthNumber: '12-345678901-2',
    pagIbigNumber: '1234-5678-9012',
    rdoCode: '044',
    verificationStatus: 'VERIFIED',
    lastVerifiedDate: '2022-01-10',
    remarks: 'BIR Form 1902 and e-Services verified'
  },
  {
    govIdRecordId: 'GID-2023-0002',
    employeeId: 'EMP-2023-0002',
    tin: '200-345-678-000',
    sssNumber: '04-2345678-9',
    philHealthNumber: '13-456789012-3',
    pagIbigNumber: '2345-6789-0123',
    rdoCode: '044',
    verificationStatus: 'VERIFIED',
    lastVerifiedDate: '2023-03-01',
    remarks: 'All 4 statutory cards inspected'
  },
  {
    govIdRecordId: 'GID-2023-0003',
    employeeId: 'EMP-2023-0003',
    tin: '300-456-789-000',
    sssNumber: '05-3456789-0',
    philHealthNumber: '14-567890123-4',
    pagIbigNumber: '3456-7890-1234',
    rdoCode: '043',
    verificationStatus: 'VERIFIED',
    lastVerifiedDate: '2023-05-15',
    remarks: 'HR records complete'
  },
  {
    govIdRecordId: 'GID-2024-0004',
    employeeId: 'EMP-2024-0004',
    tin: '400-567-890-000',
    sssNumber: '06-4567890-1',
    philHealthNumber: '15-678901234-5',
    pagIbigNumber: '4567-8901-2345',
    rdoCode: '038',
    verificationStatus: 'VERIFIED',
    lastVerifiedDate: '2024-01-15',
    remarks: 'Verified'
  },
  {
    govIdRecordId: 'GID-2024-0005',
    employeeId: 'EMP-2024-0005',
    tin: '500-678-901-000',
    sssNumber: '07-5678901-2',
    philHealthNumber: '16-789012345-6',
    pagIbigNumber: '5678-9012-3456',
    rdoCode: '044',
    verificationStatus: 'VERIFIED',
    lastVerifiedDate: '2024-02-01',
    remarks: 'Payroll specialist'
  },
  {
    govIdRecordId: 'GID-2024-0006',
    employeeId: 'EMP-2024-0006',
    tin: '600-789-012-000',
    sssNumber: '08-6789012-3',
    philHealthNumber: '17-890123456-7',
    pagIbigNumber: '6789-0123-4567',
    rdoCode: '044',
    verificationStatus: 'VERIFIED',
    lastVerifiedDate: '2024-03-15',
    remarks: 'Verified'
  },
  {
    govIdRecordId: 'GID-2024-0007',
    employeeId: 'EMP-2024-0007',
    tin: '700-890-123-000',
    sssNumber: '09-7890123-4',
    philHealthNumber: '18-901234567-8',
    pagIbigNumber: '7890-1234-5678',
    rdoCode: '055',
    verificationStatus: 'VERIFIED',
    lastVerifiedDate: '2024-04-01',
    remarks: 'Laguna plant supervisor'
  },
  {
    govIdRecordId: 'GID-2024-0008',
    employeeId: 'EMP-2024-0008',
    tin: '800-901-234-000',
    sssNumber: '10-8901234-5',
    philHealthNumber: '19-012345678-9',
    pagIbigNumber: '8901-2345-6789',
    rdoCode: '055',
    verificationStatus: 'VERIFIED',
    lastVerifiedDate: '2024-06-01',
    remarks: 'Daily paid operator'
  },
  {
    govIdRecordId: 'GID-2024-0009',
    employeeId: 'EMP-2024-0009',
    tin: '900-012-345-000',
    sssNumber: '11-9012345-6',
    philHealthNumber: '20-123456789-0',
    pagIbigNumber: '9012-3456-7890',
    rdoCode: '055',
    verificationStatus: 'VERIFIED',
    lastVerifiedDate: '2024-07-15',
    remarks: 'Solo parent ID verified'
  },
  {
    govIdRecordId: 'GID-2025-0010',
    employeeId: 'EMP-2025-0010',
    tin: '101-123-456-000',
    sssNumber: '12-0123456-7',
    philHealthNumber: '21-234567890-1',
    pagIbigNumber: '0123-4567-8901',
    rdoCode: '050',
    verificationStatus: 'VERIFIED',
    lastVerifiedDate: '2025-01-06',
    remarks: 'Probationary sales executive'
  },
  {
    govIdRecordId: 'GID-2025-0011',
    employeeId: 'EMP-2025-0011',
    tin: '202-234-567-000',
    sssNumber: '13-1234567-8',
    philHealthNumber: '22-345678901-2',
    pagIbigNumber: '1234-9876-5432',
    rdoCode: '044',
    verificationStatus: 'PENDING_DOCS',
    lastVerifiedDate: '2025-01-16',
    remarks: 'TIN 1902 submitted; SSS E-1 pending clearance'
  },
  {
    govIdRecordId: 'GID-2023-0012',
    employeeId: 'EMP-2023-0012',
    tin: '303-345-678-000',
    sssNumber: '14-2345678-9',
    philHealthNumber: '23-456789012-3',
    pagIbigNumber: '2345-0987-6543',
    rdoCode: '050',
    verificationStatus: 'VERIFIED',
    lastVerifiedDate: '2023-08-01',
    remarks: 'Separated employee'
  }
];

// Fictional Bank Details Records
export const FICTIONAL_BANK_DETAILS: BankDetailRecord[] = [
  {
    bankDetailId: 'BNK-2022-0001',
    employeeId: 'EMP-2022-0001',
    bankName: 'BDO Unibank',
    accountName: 'Maria Cristina Reyes',
    accountNumber: '109283746510',
    accountType: 'Checking',
    disbursementMode: 'Direct Bank Credit',
    active: 'YES',
    effectiveDate: '2022-01-10',
    verifiedBy: 'HR-FIN-VERIFIED'
  },
  {
    bankDetailId: 'BNK-2023-0002',
    employeeId: 'EMP-2023-0002',
    bankName: 'Bank of the Philippine Islands (BPI)',
    accountName: 'Juan Carlo Bautista',
    accountNumber: '293847561029',
    accountType: 'Savings',
    disbursementMode: 'Direct Bank Credit',
    active: 'YES',
    effectiveDate: '2023-03-01',
    verifiedBy: 'HR-FIN-VERIFIED'
  },
  {
    bankDetailId: 'BNK-2023-0003',
    employeeId: 'EMP-2023-0003',
    bankName: 'BDO Unibank',
    accountName: 'Rosario Mendoza',
    accountNumber: '384756102938',
    accountType: 'Payroll ATM',
    disbursementMode: 'Direct Bank Credit',
    active: 'YES',
    effectiveDate: '2023-05-15',
    verifiedBy: 'HR-FIN-VERIFIED'
  },
  {
    bankDetailId: 'BNK-2024-0004',
    employeeId: 'EMP-2024-0004',
    bankName: 'Metrobank',
    accountName: 'Mark Anthony Tan Jr',
    accountNumber: '475610293847',
    accountType: 'Payroll ATM',
    disbursementMode: 'Direct Bank Credit',
    active: 'YES',
    effectiveDate: '2024-01-15',
    verifiedBy: 'HR-FIN-VERIFIED'
  },
  {
    bankDetailId: 'BNK-2024-0005',
    employeeId: 'EMP-2024-0005',
    bankName: 'BDO Unibank',
    accountName: 'Patricia Anne Lim',
    accountNumber: '561029384756',
    accountType: 'Payroll ATM',
    disbursementMode: 'Direct Bank Credit',
    active: 'YES',
    effectiveDate: '2024-02-01',
    verifiedBy: 'HR-FIN-VERIFIED'
  },
  {
    bankDetailId: 'BNK-2024-0006',
    employeeId: 'EMP-2024-0006',
    bankName: 'UnionBank of the Philippines',
    accountName: 'Eduardo Aquino',
    accountNumber: '610293847561',
    accountType: 'Payroll ATM',
    disbursementMode: 'Direct Bank Credit',
    active: 'YES',
    effectiveDate: '2024-03-15',
    verifiedBy: 'HR-FIN-VERIFIED'
  },
  {
    bankDetailId: 'BNK-2024-0007',
    employeeId: 'EMP-2024-0007',
    bankName: 'BDO Unibank',
    accountName: 'Danilo Tolentino',
    accountNumber: '702938475610',
    accountType: 'Payroll ATM',
    disbursementMode: 'Direct Bank Credit',
    active: 'YES',
    effectiveDate: '2024-04-01',
    verifiedBy: 'HR-FIN-VERIFIED'
  },
  {
    bankDetailId: 'BNK-2024-0008',
    employeeId: 'EMP-2024-0008',
    bankName: 'Security Bank',
    accountName: 'Rodrigo De Leon',
    accountNumber: '893847561029',
    accountType: 'Payroll ATM',
    disbursementMode: 'Direct Bank Credit',
    active: 'YES',
    effectiveDate: '2024-06-01',
    verifiedBy: 'HR-FIN-VERIFIED'
  },
  {
    bankDetailId: 'BNK-2024-0009',
    employeeId: 'EMP-2024-0009',
    bankName: 'BDO Unibank',
    accountName: 'Bernadette Soriano',
    accountNumber: '910293847561',
    accountType: 'Payroll ATM',
    disbursementMode: 'Direct Bank Credit',
    active: 'YES',
    effectiveDate: '2024-07-15',
    verifiedBy: 'HR-FIN-VERIFIED'
  },
  {
    bankDetailId: 'BNK-2025-0010',
    employeeId: 'EMP-2025-0010',
    bankName: 'Bank of the Philippine Islands (BPI)',
    accountName: 'Angelo Garcia',
    accountNumber: '192837465019',
    accountType: 'Payroll ATM',
    disbursementMode: 'Direct Bank Credit',
    active: 'YES',
    effectiveDate: '2025-01-06',
    verifiedBy: 'HR-FIN-VERIFIED'
  },
  {
    bankDetailId: 'BNK-2025-0011',
    employeeId: 'EMP-2025-0011',
    bankName: 'BDO Unibank',
    accountName: 'Kathleen Del Rosario',
    accountNumber: '283746501928',
    accountType: 'Payroll ATM',
    disbursementMode: 'Direct Bank Credit',
    active: 'YES',
    effectiveDate: '2025-01-16',
    verifiedBy: 'HR-FIN-VERIFIED'
  },
  {
    bankDetailId: 'BNK-2023-0012',
    employeeId: 'EMP-2023-0012',
    bankName: 'Metrobank',
    accountName: 'Ramon Estrada',
    accountNumber: '374650192837',
    accountType: 'Payroll ATM',
    disbursementMode: 'Cheque',
    active: 'NO',
    effectiveDate: '2023-08-01',
    verifiedBy: 'HR-FIN-VERIFIED'
  }
];
