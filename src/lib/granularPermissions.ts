/**
 * Hierarchical per-client permissions for CAPOTBOOKS.
 * Keys are shared with scripts/granular_permissions_migration.sql.
 * Base capability checks remain server-authoritative; this catalog narrows
 * navigation, actions and dropdown choices per profile.
 */
import { featureAllows } from './pagePermissions';
export type BasePermissionKey = 'manage_users' | 'edit_transactions' | 'delete_transactions' | 'approve_journal' | 'view_reports' | 'manage_settings' | 'export_data' | 'lock_period';
export type UiPermissionKind = 'module' | 'action' | 'dropdown';
export interface UiPermissionAction { id: string; label: string; requiredPermission: string | null }
export interface UiPermissionDropdownOption { id: string; label: string; requiredPermission: string | null }
export interface UiPermissionDropdown { id: string; label: string; options: UiPermissionDropdownOption[] }
export interface UiPermissionModule { id: string; label: string; requiredPermission: string | null; actions: UiPermissionAction[]; dropdowns: UiPermissionDropdown[] }
export interface UiPermissionCatalogItem { key: string; moduleId: string; kind: UiPermissionKind; label: string; groupId?: string; groupLabel?: string; requiredPermission: string | null }

export const GRANULAR_PERMISSION_MODULES: UiPermissionModule[] = [
  {
    "id": "dashboard",
    "label": "Dashboard",
    "requiredPermission": null,
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": null
      }
    ],
    "dropdowns": []
  },
  {
    "id": "coa",
    "label": "Chart of Accounts",
    "requiredPermission": "manage_settings",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "manage_settings"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "import",
        "label": "Import",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "manage_settings"
      },
      {
        "id": "manage",
        "label": "Manage settings/users",
        "requiredPermission": "manage_settings"
      }
    ],
    "dropdowns": [
      {
        "id": "account_type",
        "label": "Account type",
        "options": [
          {
            "id": "asset",
            "label": "Asset",
            "requiredPermission": "manage_settings"
          },
          {
            "id": "liability",
            "label": "Liability",
            "requiredPermission": "manage_settings"
          },
          {
            "id": "equity",
            "label": "Equity",
            "requiredPermission": "manage_settings"
          },
          {
            "id": "income",
            "label": "Income",
            "requiredPermission": "manage_settings"
          },
          {
            "id": "expense",
            "label": "Expense",
            "requiredPermission": "manage_settings"
          }
        ]
      }
    ]
  },
  {
    "id": "billing",
    "label": "Billing / Invoices",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "document_type",
        "label": "Document type",
        "options": [
          {
            "id": "invoice",
            "label": "Invoice",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "official_receipt",
            "label": "Official receipt",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "statement_of_account",
            "label": "Statement of account",
            "requiredPermission": "edit_transactions"
          }
        ]
      },
      {
        "id": "payment_type",
        "label": "Payment method",
        "options": [
          {
            "id": "cash",
            "label": "Cash",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "check",
            "label": "Check",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "e_payment",
            "label": "E-Payment",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "bank_transfer",
            "label": "Bank transfer",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "credit_card",
            "label": "Credit card",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "on_account",
            "label": "On account",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "payroll",
    "label": "Payroll",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "approve",
        "label": "Approve",
        "requiredPermission": "approve_journal"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "workspace",
        "label": "Payroll workspace",
        "options": [
          {
            "id": "employees",
            "label": "Employees",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "payroll_register",
            "label": "Payroll register",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "payslips",
            "label": "Payslips",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "statutory_reports",
            "label": "Statutory reports",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "payroll_settings",
    "label": "Payroll Settings",
    "requiredPermission": "manage_settings",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "manage_settings"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "manage",
        "label": "Manage settings/users",
        "requiredPermission": "manage_settings"
      }
    ],
    "dropdowns": [
      {
        "id": "settings",
        "label": "Payroll settings",
        "options": [
          {
            "id": "pay_periods",
            "label": "Pay periods",
            "requiredPermission": "manage_settings"
          },
          {
            "id": "statutory_rates",
            "label": "Statutory rates",
            "requiredPermission": "manage_settings"
          },
          {
            "id": "withholding_rules",
            "label": "Withholding rules",
            "requiredPermission": "manage_settings"
          },
          {
            "id": "overtime_rules",
            "label": "Overtime rules",
            "requiredPermission": "manage_settings"
          }
        ]
      }
    ]
  },
  {
    "id": "sales",
    "label": "Income / Sales",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "payment_type",
        "label": "Payment type",
        "options": [
          {
            "id": "cash",
            "label": "Cash",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "check",
            "label": "Check",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "bank",
            "label": "Bank transfer",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "credit",
            "label": "Credit",
            "requiredPermission": "edit_transactions"
          }
        ]
      },
      {
        "id": "vat_type",
        "label": "VAT type",
        "options": [
          {
            "id": "vatable",
            "label": "VATable",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "vat_exempt",
            "label": "VAT-exempt",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "zero_rated",
            "label": "Zero-rated",
            "requiredPermission": "edit_transactions"
          }
        ]
      },
      {
        "id": "income_type",
        "label": "Income type",
        "options": [
          {
            "id": "goods",
            "label": "Sale of goods",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "services",
            "label": "Sale of services",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "purchases",
    "label": "Purchases / Bills",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "approve",
        "label": "Approve",
        "requiredPermission": "approve_journal"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      },
      {
        "id": "import",
        "label": "Import",
        "requiredPermission": "edit_transactions"
      }
    ],
    "dropdowns": [
      {
        "id": "payment_method",
        "label": "Payment method",
        "options": [
          {
            "id": "cash",
            "label": "Cash",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "check",
            "label": "Check",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "bank_transfer",
            "label": "Bank transfer",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "credit",
            "label": "Credit / payable",
            "requiredPermission": "edit_transactions"
          }
        ]
      },
      {
        "id": "vat_type",
        "label": "VAT treatment",
        "options": [
          {
            "id": "vat",
            "label": "VAT",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "non_vat",
            "label": "Non-VAT",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "vat_nonvat",
            "label": "VAT + Non-VAT",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "zero_rated",
            "label": "Zero-rated",
            "requiredPermission": "edit_transactions"
          }
        ]
      },
      {
        "id": "withholding",
        "label": "Withholding tax",
        "options": [
          {
            "id": "none",
            "label": "No withholding",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "withholding",
            "label": "Apply withholding tax",
            "requiredPermission": "edit_transactions"
          }
        ]
      },
      {
        "id": "purchase_type",
        "label": "Purchase type",
        "options": [
          {
            "id": "capital_goods",
            "label": "Capital goods",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "operating_expense",
            "label": "Operating expense",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "other_payment",
            "label": "Other payment",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "purchases_invoiced",
    "label": "Purchases · Invoiced",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "purchases_other_payments",
    "label": "Purchases · Other Payments",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "purchases_ap",
    "label": "Purchases · Accounts Payable",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "approve",
        "label": "Approve",
        "requiredPermission": "approve_journal"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "ap_action",
        "label": "Accounts payable actions",
        "options": [
          {
            "id": "record_payment",
            "label": "Record payment",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "apply_credit",
            "label": "Apply credit",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "view_aging",
            "label": "View aging report",
            "requiredPermission": "view_reports"
          }
        ]
      }
    ]
  },
  {
    "id": "journal_voucher",
    "label": "Journal Voucher",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "approve",
        "label": "Approve",
        "requiredPermission": "approve_journal"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "voucher_type",
        "label": "Voucher type",
        "options": [
          {
            "id": "general",
            "label": "General",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "adjusting",
            "label": "Adjusting",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "closing",
            "label": "Closing",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "reversing",
            "label": "Reversing",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "history",
    "label": "Expense / Income History",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "history_type",
        "label": "History type",
        "options": [
          {
            "id": "expenses",
            "label": "Expense history",
            "requiredPermission": "view_reports"
          },
          {
            "id": "income",
            "label": "Income history",
            "requiredPermission": "view_reports"
          }
        ]
      }
    ]
  },
  {
    "id": "compliance_tracker",
    "label": "Compliance Tracker",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "approve",
        "label": "Approve",
        "requiredPermission": "approve_journal"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "compliance_action",
        "label": "Compliance actions",
        "options": [
          {
            "id": "deadlines",
            "label": "View deadlines",
            "requiredPermission": "view_reports"
          },
          {
            "id": "mark_paid",
            "label": "Mark as paid",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "mark_filed",
            "label": "Mark as filed",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "bir_forms",
    "label": "BIR Forms",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "bir_form",
        "label": "BIR form",
        "options": [
          {
            "id": "2550q",
            "label": "BIR Form 2550Q",
            "requiredPermission": "view_reports"
          },
          {
            "id": "1701q",
            "label": "BIR Form 1701Q",
            "requiredPermission": "view_reports"
          },
          {
            "id": "2551q",
            "label": "BIR Form 2551Q",
            "requiredPermission": "view_reports"
          },
          {
            "id": "1601c",
            "label": "BIR Form 1601-C",
            "requiredPermission": "view_reports"
          },
          {
            "id": "0619e",
            "label": "BIR Form 0619-E",
            "requiredPermission": "view_reports"
          },
          {
            "id": "1601eq",
            "label": "BIR Form 1601-EQ",
            "requiredPermission": "view_reports"
          }
        ]
      }
    ]
  },
  {
    "id": "eis_center",
    "label": "BIR E-Invoicing (EIS)",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "eis_action",
        "label": "EIS actions",
        "options": [
          {
            "id": "build_json",
            "label": "Build payload",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "validate",
            "label": "Validate payload",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "transmit",
            "label": "Transmit to BIR",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "cashflow",
    "label": "Cash Flow",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "journal",
    "label": "General Journal",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "approve",
        "label": "Approve",
        "requiredPermission": "approve_journal"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "journal_type",
        "label": "Journal type",
        "options": [
          {
            "id": "general",
            "label": "General journal",
            "requiredPermission": "view_reports"
          },
          {
            "id": "adjusting",
            "label": "Adjusting entries",
            "requiredPermission": "view_reports"
          },
          {
            "id": "closing",
            "label": "Closing entries",
            "requiredPermission": "view_reports"
          },
          {
            "id": "reversing",
            "label": "Reversing entries",
            "requiredPermission": "view_reports"
          }
        ]
      }
    ]
  },
  {
    "id": "ledger",
    "label": "General Ledger",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "sales_journal",
    "label": "Sales Journal",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "purchase_journal",
    "label": "Purchase Journal",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "cash_disbursement",
    "label": "Cash Disbursement Book",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "approve",
        "label": "Approve",
        "requiredPermission": "approve_journal"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "payment_method",
        "label": "Payment method",
        "options": [
          {
            "id": "cash",
            "label": "Cash",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "check",
            "label": "Check",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "bank_transfer",
            "label": "Bank transfer",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "cash_receipt",
    "label": "Cash Receipt Journal",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "receipt_type",
        "label": "Receipt type",
        "options": [
          {
            "id": "cash_sales",
            "label": "Cash sales",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "collection",
            "label": "Customer collection",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "other_receipt",
            "label": "Other receipt",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "trialbalance",
    "label": "Trial Balance",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "balancesheet",
    "label": "Balance Sheet",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "pl",
    "label": "Profit & Loss",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "assetlapsing",
    "label": "Asset Lapsing",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "asset_action",
        "label": "Asset actions",
        "options": [
          {
            "id": "view_schedule",
            "label": "View schedule",
            "requiredPermission": "view_reports"
          },
          {
            "id": "record_depreciation",
            "label": "Record depreciation",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "files",
    "label": "Upload Files",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "download",
        "label": "Download",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "file_action",
        "label": "File actions",
        "options": [
          {
            "id": "upload",
            "label": "Upload file",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "download",
            "label": "Download file",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "preview",
            "label": "Preview file",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "inventory",
    "label": "Inventory",
    "requiredPermission": "edit_transactions",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "post",
        "label": "Post",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "import",
        "label": "Import",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "inventory_action",
        "label": "Inventory actions",
        "options": [
          {
            "id": "items",
            "label": "Manage items",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "movements",
            "label": "View stock movements",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "adjustments",
            "label": "Stock adjustments",
            "requiredPermission": "edit_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "clients",
    "label": "Clients",
    "requiredPermission": "manage_settings",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "manage_settings"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "manage",
        "label": "Manage settings/users",
        "requiredPermission": "manage_settings"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "business",
    "label": "Business Profile",
    "requiredPermission": "manage_settings",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "manage_settings"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "manage",
        "label": "Manage settings/users",
        "requiredPermission": "manage_settings"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "account_settings",
    "label": "Account Settings",
    "requiredPermission": null,
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": null
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "account_action",
        "label": "Account actions",
        "options": [
          {
            "id": "profile",
            "label": "Profile details",
            "requiredPermission": null
          },
          {
            "id": "password",
            "label": "Change password",
            "requiredPermission": null
          },
          {
            "id": "export_data",
            "label": "Export account data",
            "requiredPermission": "export_data"
          }
        ]
      }
    ]
  },
  {
    "id": "tinlibrary",
    "label": "TIN Library",
    "requiredPermission": "manage_settings",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "manage_settings"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "import",
        "label": "Import",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "team",
    "label": "Team & Subusers",
    "requiredPermission": "manage_users",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "manage_users"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "manage",
        "label": "Manage settings/users",
        "requiredPermission": "manage_users"
      }
    ],
    "dropdowns": [
      {
        "id": "team_action",
        "label": "Team actions",
        "options": [
          {
            "id": "invite",
            "label": "Invite users",
            "requiredPermission": "manage_users"
          },
          {
            "id": "change_roles",
            "label": "Change roles",
            "requiredPermission": "manage_users"
          },
          {
            "id": "reset_password",
            "label": "Reset managed password",
            "requiredPermission": "manage_users"
          },
          {
            "id": "grant_permissions",
            "label": "Manage permissions",
            "requiredPermission": "manage_users"
          }
        ]
      }
    ]
  },
  {
    "id": "reports",
    "label": "Reports",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "report_format",
        "label": "Report output",
        "options": [
          {
            "id": "pdf",
            "label": "PDF",
            "requiredPermission": "view_reports"
          },
          {
            "id": "csv",
            "label": "CSV",
            "requiredPermission": "view_reports"
          },
          {
            "id": "excel",
            "label": "Excel",
            "requiredPermission": "view_reports"
          },
          {
            "id": "print",
            "label": "Print",
            "requiredPermission": "view_reports"
          }
        ]
      }
    ]
  },
  {
    "id": "relief",
    "label": "RELIEF",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": [
      {
        "id": "relief_action",
        "label": "RELIEF actions",
        "options": [
          {
            "id": "view_schedule",
            "label": "View schedule",
            "requiredPermission": "view_reports"
          },
          {
            "id": "edit_transfers",
            "label": "Edit transfers",
            "requiredPermission": "edit_transactions"
          },
          {
            "id": "reset_transfers",
            "label": "Reset transfers",
            "requiredPermission": "delete_transactions"
          }
        ]
      }
    ]
  },
  {
    "id": "taxnotes",
    "label": "Tax Notes",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "books",
    "label": "Books",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "afs_financial_position",
    "label": "AFS · Financial Position",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "afs_income_statements",
    "label": "AFS · Income Statements",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "afs_equity_retained_earnings",
    "label": "AFS · Equity & Retained Earnings",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  },
  {
    "id": "afs_ppe",
    "label": "AFS · Property, Plant & Equipment",
    "requiredPermission": "view_reports",
    "actions": [
      {
        "id": "view",
        "label": "View",
        "requiredPermission": "view_reports"
      },
      {
        "id": "add",
        "label": "Add",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "edit",
        "label": "Edit",
        "requiredPermission": "edit_transactions"
      },
      {
        "id": "delete",
        "label": "Delete",
        "requiredPermission": "delete_transactions"
      },
      {
        "id": "print",
        "label": "Print",
        "requiredPermission": "view_reports"
      },
      {
        "id": "export",
        "label": "Export",
        "requiredPermission": "export_data"
      }
    ],
    "dropdowns": []
  }
];
export const GRANULAR_PERMISSION_CATALOG: UiPermissionCatalogItem[] = [
  {
    "key": "module.dashboard",
    "moduleId": "dashboard",
    "kind": "module",
    "label": "Dashboard",
    "requiredPermission": null
  },
  {
    "key": "action.dashboard.view",
    "moduleId": "dashboard",
    "kind": "action",
    "label": "View",
    "requiredPermission": null
  },
  {
    "key": "module.coa",
    "moduleId": "coa",
    "kind": "module",
    "label": "Chart of Accounts",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "action.coa.view",
    "moduleId": "coa",
    "kind": "action",
    "label": "View",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "action.coa.add",
    "moduleId": "coa",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.coa.edit",
    "moduleId": "coa",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.coa.delete",
    "moduleId": "coa",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.coa.import",
    "moduleId": "coa",
    "kind": "action",
    "label": "Import",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.coa.export",
    "moduleId": "coa",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "action.coa.print",
    "moduleId": "coa",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "action.coa.manage",
    "moduleId": "coa",
    "kind": "action",
    "label": "Manage settings/users",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "dropdown.coa.account_type.asset",
    "moduleId": "coa",
    "kind": "dropdown",
    "label": "Asset",
    "groupId": "account_type",
    "groupLabel": "Account type",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "dropdown.coa.account_type.liability",
    "moduleId": "coa",
    "kind": "dropdown",
    "label": "Liability",
    "groupId": "account_type",
    "groupLabel": "Account type",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "dropdown.coa.account_type.equity",
    "moduleId": "coa",
    "kind": "dropdown",
    "label": "Equity",
    "groupId": "account_type",
    "groupLabel": "Account type",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "dropdown.coa.account_type.income",
    "moduleId": "coa",
    "kind": "dropdown",
    "label": "Income",
    "groupId": "account_type",
    "groupLabel": "Account type",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "dropdown.coa.account_type.expense",
    "moduleId": "coa",
    "kind": "dropdown",
    "label": "Expense",
    "groupId": "account_type",
    "groupLabel": "Account type",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "module.billing",
    "moduleId": "billing",
    "kind": "module",
    "label": "Billing / Invoices",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.billing.view",
    "moduleId": "billing",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.billing.add",
    "moduleId": "billing",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.billing.edit",
    "moduleId": "billing",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.billing.delete",
    "moduleId": "billing",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.billing.post",
    "moduleId": "billing",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.billing.print",
    "moduleId": "billing",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.billing.export",
    "moduleId": "billing",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.billing.document_type.invoice",
    "moduleId": "billing",
    "kind": "dropdown",
    "label": "Invoice",
    "groupId": "document_type",
    "groupLabel": "Document type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.billing.document_type.official_receipt",
    "moduleId": "billing",
    "kind": "dropdown",
    "label": "Official receipt",
    "groupId": "document_type",
    "groupLabel": "Document type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.billing.document_type.statement_of_account",
    "moduleId": "billing",
    "kind": "dropdown",
    "label": "Statement of account",
    "groupId": "document_type",
    "groupLabel": "Document type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.billing.payment_type.cash",
    "moduleId": "billing",
    "kind": "dropdown",
    "label": "Cash",
    "groupId": "payment_type",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.billing.payment_type.check",
    "moduleId": "billing",
    "kind": "dropdown",
    "label": "Check",
    "groupId": "payment_type",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.billing.payment_type.e_payment",
    "moduleId": "billing",
    "kind": "dropdown",
    "label": "E-Payment",
    "groupId": "payment_type",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.billing.payment_type.bank_transfer",
    "moduleId": "billing",
    "kind": "dropdown",
    "label": "Bank transfer",
    "groupId": "payment_type",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.billing.payment_type.credit_card",
    "moduleId": "billing",
    "kind": "dropdown",
    "label": "Credit card",
    "groupId": "payment_type",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.billing.payment_type.on_account",
    "moduleId": "billing",
    "kind": "dropdown",
    "label": "On account",
    "groupId": "payment_type",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.payroll",
    "moduleId": "payroll",
    "kind": "module",
    "label": "Payroll",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.payroll.view",
    "moduleId": "payroll",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.payroll.add",
    "moduleId": "payroll",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.payroll.edit",
    "moduleId": "payroll",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.payroll.delete",
    "moduleId": "payroll",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.payroll.approve",
    "moduleId": "payroll",
    "kind": "action",
    "label": "Approve",
    "requiredPermission": "approve_journal"
  },
  {
    "key": "action.payroll.print",
    "moduleId": "payroll",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.payroll.export",
    "moduleId": "payroll",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.payroll.workspace.employees",
    "moduleId": "payroll",
    "kind": "dropdown",
    "label": "Employees",
    "groupId": "workspace",
    "groupLabel": "Payroll workspace",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.payroll.workspace.payroll_register",
    "moduleId": "payroll",
    "kind": "dropdown",
    "label": "Payroll register",
    "groupId": "workspace",
    "groupLabel": "Payroll workspace",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.payroll.workspace.payslips",
    "moduleId": "payroll",
    "kind": "dropdown",
    "label": "Payslips",
    "groupId": "workspace",
    "groupLabel": "Payroll workspace",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.payroll.workspace.statutory_reports",
    "moduleId": "payroll",
    "kind": "dropdown",
    "label": "Statutory reports",
    "groupId": "workspace",
    "groupLabel": "Payroll workspace",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.payroll_settings",
    "moduleId": "payroll_settings",
    "kind": "module",
    "label": "Payroll Settings",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "action.payroll_settings.view",
    "moduleId": "payroll_settings",
    "kind": "action",
    "label": "View",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "action.payroll_settings.edit",
    "moduleId": "payroll_settings",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.payroll_settings.manage",
    "moduleId": "payroll_settings",
    "kind": "action",
    "label": "Manage settings/users",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "dropdown.payroll_settings.settings.pay_periods",
    "moduleId": "payroll_settings",
    "kind": "dropdown",
    "label": "Pay periods",
    "groupId": "settings",
    "groupLabel": "Payroll settings",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "dropdown.payroll_settings.settings.statutory_rates",
    "moduleId": "payroll_settings",
    "kind": "dropdown",
    "label": "Statutory rates",
    "groupId": "settings",
    "groupLabel": "Payroll settings",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "dropdown.payroll_settings.settings.withholding_rules",
    "moduleId": "payroll_settings",
    "kind": "dropdown",
    "label": "Withholding rules",
    "groupId": "settings",
    "groupLabel": "Payroll settings",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "dropdown.payroll_settings.settings.overtime_rules",
    "moduleId": "payroll_settings",
    "kind": "dropdown",
    "label": "Overtime rules",
    "groupId": "settings",
    "groupLabel": "Payroll settings",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "module.sales",
    "moduleId": "sales",
    "kind": "module",
    "label": "Income / Sales",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales.view",
    "moduleId": "sales",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales.add",
    "moduleId": "sales",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales.edit",
    "moduleId": "sales",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales.delete",
    "moduleId": "sales",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.sales.post",
    "moduleId": "sales",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales.print",
    "moduleId": "sales",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales.export",
    "moduleId": "sales",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.sales.payment_type.cash",
    "moduleId": "sales",
    "kind": "dropdown",
    "label": "Cash",
    "groupId": "payment_type",
    "groupLabel": "Payment type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.sales.payment_type.check",
    "moduleId": "sales",
    "kind": "dropdown",
    "label": "Check",
    "groupId": "payment_type",
    "groupLabel": "Payment type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.sales.payment_type.bank",
    "moduleId": "sales",
    "kind": "dropdown",
    "label": "Bank transfer",
    "groupId": "payment_type",
    "groupLabel": "Payment type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.sales.payment_type.credit",
    "moduleId": "sales",
    "kind": "dropdown",
    "label": "Credit",
    "groupId": "payment_type",
    "groupLabel": "Payment type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.sales.vat_type.vatable",
    "moduleId": "sales",
    "kind": "dropdown",
    "label": "VATable",
    "groupId": "vat_type",
    "groupLabel": "VAT type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.sales.vat_type.vat_exempt",
    "moduleId": "sales",
    "kind": "dropdown",
    "label": "VAT-exempt",
    "groupId": "vat_type",
    "groupLabel": "VAT type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.sales.vat_type.zero_rated",
    "moduleId": "sales",
    "kind": "dropdown",
    "label": "Zero-rated",
    "groupId": "vat_type",
    "groupLabel": "VAT type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.sales.income_type.goods",
    "moduleId": "sales",
    "kind": "dropdown",
    "label": "Sale of goods",
    "groupId": "income_type",
    "groupLabel": "Income type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.sales.income_type.services",
    "moduleId": "sales",
    "kind": "dropdown",
    "label": "Sale of services",
    "groupId": "income_type",
    "groupLabel": "Income type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.purchases",
    "moduleId": "purchases",
    "kind": "module",
    "label": "Purchases / Bills",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases.view",
    "moduleId": "purchases",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases.add",
    "moduleId": "purchases",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases.edit",
    "moduleId": "purchases",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases.delete",
    "moduleId": "purchases",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.purchases.post",
    "moduleId": "purchases",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases.approve",
    "moduleId": "purchases",
    "kind": "action",
    "label": "Approve",
    "requiredPermission": "approve_journal"
  },
  {
    "key": "action.purchases.print",
    "moduleId": "purchases",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases.export",
    "moduleId": "purchases",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "action.purchases.import",
    "moduleId": "purchases",
    "kind": "action",
    "label": "Import",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.payment_method.cash",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "Cash",
    "groupId": "payment_method",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.payment_method.check",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "Check",
    "groupId": "payment_method",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.payment_method.bank_transfer",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "Bank transfer",
    "groupId": "payment_method",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.payment_method.credit",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "Credit / payable",
    "groupId": "payment_method",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.vat_type.vat",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "VAT",
    "groupId": "vat_type",
    "groupLabel": "VAT treatment",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.vat_type.non_vat",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "Non-VAT",
    "groupId": "vat_type",
    "groupLabel": "VAT treatment",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.vat_type.vat_nonvat",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "VAT + Non-VAT",
    "groupId": "vat_type",
    "groupLabel": "VAT treatment",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.vat_type.zero_rated",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "Zero-rated",
    "groupId": "vat_type",
    "groupLabel": "VAT treatment",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.withholding.none",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "No withholding",
    "groupId": "withholding",
    "groupLabel": "Withholding tax",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.withholding.withholding",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "Apply withholding tax",
    "groupId": "withholding",
    "groupLabel": "Withholding tax",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.purchase_type.capital_goods",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "Capital goods",
    "groupId": "purchase_type",
    "groupLabel": "Purchase type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.purchase_type.operating_expense",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "Operating expense",
    "groupId": "purchase_type",
    "groupLabel": "Purchase type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases.purchase_type.other_payment",
    "moduleId": "purchases",
    "kind": "dropdown",
    "label": "Other payment",
    "groupId": "purchase_type",
    "groupLabel": "Purchase type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.purchases_invoiced",
    "moduleId": "purchases_invoiced",
    "kind": "module",
    "label": "Purchases · Invoiced",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_invoiced.view",
    "moduleId": "purchases_invoiced",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_invoiced.add",
    "moduleId": "purchases_invoiced",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_invoiced.edit",
    "moduleId": "purchases_invoiced",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_invoiced.delete",
    "moduleId": "purchases_invoiced",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.purchases_invoiced.post",
    "moduleId": "purchases_invoiced",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_invoiced.print",
    "moduleId": "purchases_invoiced",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_invoiced.export",
    "moduleId": "purchases_invoiced",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.purchases_other_payments",
    "moduleId": "purchases_other_payments",
    "kind": "module",
    "label": "Purchases · Other Payments",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_other_payments.view",
    "moduleId": "purchases_other_payments",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_other_payments.add",
    "moduleId": "purchases_other_payments",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_other_payments.edit",
    "moduleId": "purchases_other_payments",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_other_payments.delete",
    "moduleId": "purchases_other_payments",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.purchases_other_payments.post",
    "moduleId": "purchases_other_payments",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_other_payments.print",
    "moduleId": "purchases_other_payments",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_other_payments.export",
    "moduleId": "purchases_other_payments",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.purchases_ap",
    "moduleId": "purchases_ap",
    "kind": "module",
    "label": "Purchases · Accounts Payable",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_ap.view",
    "moduleId": "purchases_ap",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_ap.add",
    "moduleId": "purchases_ap",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_ap.edit",
    "moduleId": "purchases_ap",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_ap.delete",
    "moduleId": "purchases_ap",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.purchases_ap.post",
    "moduleId": "purchases_ap",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_ap.approve",
    "moduleId": "purchases_ap",
    "kind": "action",
    "label": "Approve",
    "requiredPermission": "approve_journal"
  },
  {
    "key": "action.purchases_ap.print",
    "moduleId": "purchases_ap",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchases_ap.export",
    "moduleId": "purchases_ap",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.purchases_ap.ap_action.record_payment",
    "moduleId": "purchases_ap",
    "kind": "dropdown",
    "label": "Record payment",
    "groupId": "ap_action",
    "groupLabel": "Accounts payable actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases_ap.ap_action.apply_credit",
    "moduleId": "purchases_ap",
    "kind": "dropdown",
    "label": "Apply credit",
    "groupId": "ap_action",
    "groupLabel": "Accounts payable actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.purchases_ap.ap_action.view_aging",
    "moduleId": "purchases_ap",
    "kind": "dropdown",
    "label": "View aging report",
    "groupId": "ap_action",
    "groupLabel": "Accounts payable actions",
    "requiredPermission": "view_reports"
  },
  {
    "key": "module.journal_voucher",
    "moduleId": "journal_voucher",
    "kind": "module",
    "label": "Journal Voucher",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.journal_voucher.view",
    "moduleId": "journal_voucher",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.journal_voucher.add",
    "moduleId": "journal_voucher",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.journal_voucher.edit",
    "moduleId": "journal_voucher",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.journal_voucher.delete",
    "moduleId": "journal_voucher",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.journal_voucher.post",
    "moduleId": "journal_voucher",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.journal_voucher.approve",
    "moduleId": "journal_voucher",
    "kind": "action",
    "label": "Approve",
    "requiredPermission": "approve_journal"
  },
  {
    "key": "action.journal_voucher.print",
    "moduleId": "journal_voucher",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.journal_voucher.export",
    "moduleId": "journal_voucher",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.journal_voucher.voucher_type.general",
    "moduleId": "journal_voucher",
    "kind": "dropdown",
    "label": "General",
    "groupId": "voucher_type",
    "groupLabel": "Voucher type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.journal_voucher.voucher_type.adjusting",
    "moduleId": "journal_voucher",
    "kind": "dropdown",
    "label": "Adjusting",
    "groupId": "voucher_type",
    "groupLabel": "Voucher type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.journal_voucher.voucher_type.closing",
    "moduleId": "journal_voucher",
    "kind": "dropdown",
    "label": "Closing",
    "groupId": "voucher_type",
    "groupLabel": "Voucher type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.journal_voucher.voucher_type.reversing",
    "moduleId": "journal_voucher",
    "kind": "dropdown",
    "label": "Reversing",
    "groupId": "voucher_type",
    "groupLabel": "Voucher type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.history",
    "moduleId": "history",
    "kind": "module",
    "label": "Expense / Income History",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.history.view",
    "moduleId": "history",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.history.print",
    "moduleId": "history",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.history.export",
    "moduleId": "history",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.history.history_type.expenses",
    "moduleId": "history",
    "kind": "dropdown",
    "label": "Expense history",
    "groupId": "history_type",
    "groupLabel": "History type",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.history.history_type.income",
    "moduleId": "history",
    "kind": "dropdown",
    "label": "Income history",
    "groupId": "history_type",
    "groupLabel": "History type",
    "requiredPermission": "view_reports"
  },
  {
    "key": "module.compliance_tracker",
    "moduleId": "compliance_tracker",
    "kind": "module",
    "label": "Compliance Tracker",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.compliance_tracker.view",
    "moduleId": "compliance_tracker",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.compliance_tracker.edit",
    "moduleId": "compliance_tracker",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.compliance_tracker.approve",
    "moduleId": "compliance_tracker",
    "kind": "action",
    "label": "Approve",
    "requiredPermission": "approve_journal"
  },
  {
    "key": "action.compliance_tracker.print",
    "moduleId": "compliance_tracker",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.compliance_tracker.export",
    "moduleId": "compliance_tracker",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.compliance_tracker.compliance_action.deadlines",
    "moduleId": "compliance_tracker",
    "kind": "dropdown",
    "label": "View deadlines",
    "groupId": "compliance_action",
    "groupLabel": "Compliance actions",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.compliance_tracker.compliance_action.mark_paid",
    "moduleId": "compliance_tracker",
    "kind": "dropdown",
    "label": "Mark as paid",
    "groupId": "compliance_action",
    "groupLabel": "Compliance actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.compliance_tracker.compliance_action.mark_filed",
    "moduleId": "compliance_tracker",
    "kind": "dropdown",
    "label": "Mark as filed",
    "groupId": "compliance_action",
    "groupLabel": "Compliance actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.bir_forms",
    "moduleId": "bir_forms",
    "kind": "module",
    "label": "BIR Forms",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.bir_forms.view",
    "moduleId": "bir_forms",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.bir_forms.print",
    "moduleId": "bir_forms",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.bir_forms.export",
    "moduleId": "bir_forms",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.bir_forms.bir_form.2550q",
    "moduleId": "bir_forms",
    "kind": "dropdown",
    "label": "BIR Form 2550Q",
    "groupId": "bir_form",
    "groupLabel": "BIR form",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.bir_forms.bir_form.1701q",
    "moduleId": "bir_forms",
    "kind": "dropdown",
    "label": "BIR Form 1701Q",
    "groupId": "bir_form",
    "groupLabel": "BIR form",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.bir_forms.bir_form.2551q",
    "moduleId": "bir_forms",
    "kind": "dropdown",
    "label": "BIR Form 2551Q",
    "groupId": "bir_form",
    "groupLabel": "BIR form",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.bir_forms.bir_form.1601c",
    "moduleId": "bir_forms",
    "kind": "dropdown",
    "label": "BIR Form 1601-C",
    "groupId": "bir_form",
    "groupLabel": "BIR form",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.bir_forms.bir_form.0619e",
    "moduleId": "bir_forms",
    "kind": "dropdown",
    "label": "BIR Form 0619-E",
    "groupId": "bir_form",
    "groupLabel": "BIR form",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.bir_forms.bir_form.1601eq",
    "moduleId": "bir_forms",
    "kind": "dropdown",
    "label": "BIR Form 1601-EQ",
    "groupId": "bir_form",
    "groupLabel": "BIR form",
    "requiredPermission": "view_reports"
  },
  {
    "key": "module.eis_center",
    "moduleId": "eis_center",
    "kind": "module",
    "label": "BIR E-Invoicing (EIS)",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.eis_center.view",
    "moduleId": "eis_center",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.eis_center.add",
    "moduleId": "eis_center",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.eis_center.edit",
    "moduleId": "eis_center",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.eis_center.post",
    "moduleId": "eis_center",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.eis_center.print",
    "moduleId": "eis_center",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.eis_center.export",
    "moduleId": "eis_center",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.eis_center.eis_action.build_json",
    "moduleId": "eis_center",
    "kind": "dropdown",
    "label": "Build payload",
    "groupId": "eis_action",
    "groupLabel": "EIS actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.eis_center.eis_action.validate",
    "moduleId": "eis_center",
    "kind": "dropdown",
    "label": "Validate payload",
    "groupId": "eis_action",
    "groupLabel": "EIS actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.eis_center.eis_action.transmit",
    "moduleId": "eis_center",
    "kind": "dropdown",
    "label": "Transmit to BIR",
    "groupId": "eis_action",
    "groupLabel": "EIS actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.cashflow",
    "moduleId": "cashflow",
    "kind": "module",
    "label": "Cash Flow",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.cashflow.view",
    "moduleId": "cashflow",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.cashflow.print",
    "moduleId": "cashflow",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.cashflow.export",
    "moduleId": "cashflow",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.journal",
    "moduleId": "journal",
    "kind": "module",
    "label": "General Journal",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.journal.view",
    "moduleId": "journal",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.journal.add",
    "moduleId": "journal",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.journal.edit",
    "moduleId": "journal",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.journal.delete",
    "moduleId": "journal",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.journal.post",
    "moduleId": "journal",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.journal.approve",
    "moduleId": "journal",
    "kind": "action",
    "label": "Approve",
    "requiredPermission": "approve_journal"
  },
  {
    "key": "action.journal.print",
    "moduleId": "journal",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.journal.export",
    "moduleId": "journal",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.journal.journal_type.general",
    "moduleId": "journal",
    "kind": "dropdown",
    "label": "General journal",
    "groupId": "journal_type",
    "groupLabel": "Journal type",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.journal.journal_type.adjusting",
    "moduleId": "journal",
    "kind": "dropdown",
    "label": "Adjusting entries",
    "groupId": "journal_type",
    "groupLabel": "Journal type",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.journal.journal_type.closing",
    "moduleId": "journal",
    "kind": "dropdown",
    "label": "Closing entries",
    "groupId": "journal_type",
    "groupLabel": "Journal type",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.journal.journal_type.reversing",
    "moduleId": "journal",
    "kind": "dropdown",
    "label": "Reversing entries",
    "groupId": "journal_type",
    "groupLabel": "Journal type",
    "requiredPermission": "view_reports"
  },
  {
    "key": "module.ledger",
    "moduleId": "ledger",
    "kind": "module",
    "label": "General Ledger",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.ledger.view",
    "moduleId": "ledger",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.ledger.print",
    "moduleId": "ledger",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.ledger.export",
    "moduleId": "ledger",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.sales_journal",
    "moduleId": "sales_journal",
    "kind": "module",
    "label": "Sales Journal",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales_journal.view",
    "moduleId": "sales_journal",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales_journal.add",
    "moduleId": "sales_journal",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales_journal.edit",
    "moduleId": "sales_journal",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales_journal.delete",
    "moduleId": "sales_journal",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.sales_journal.post",
    "moduleId": "sales_journal",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales_journal.print",
    "moduleId": "sales_journal",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.sales_journal.export",
    "moduleId": "sales_journal",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.purchase_journal",
    "moduleId": "purchase_journal",
    "kind": "module",
    "label": "Purchase Journal",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchase_journal.view",
    "moduleId": "purchase_journal",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchase_journal.add",
    "moduleId": "purchase_journal",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchase_journal.edit",
    "moduleId": "purchase_journal",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchase_journal.delete",
    "moduleId": "purchase_journal",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.purchase_journal.post",
    "moduleId": "purchase_journal",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchase_journal.print",
    "moduleId": "purchase_journal",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.purchase_journal.export",
    "moduleId": "purchase_journal",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.cash_disbursement",
    "moduleId": "cash_disbursement",
    "kind": "module",
    "label": "Cash Disbursement Book",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_disbursement.view",
    "moduleId": "cash_disbursement",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_disbursement.add",
    "moduleId": "cash_disbursement",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_disbursement.edit",
    "moduleId": "cash_disbursement",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_disbursement.delete",
    "moduleId": "cash_disbursement",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.cash_disbursement.post",
    "moduleId": "cash_disbursement",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_disbursement.approve",
    "moduleId": "cash_disbursement",
    "kind": "action",
    "label": "Approve",
    "requiredPermission": "approve_journal"
  },
  {
    "key": "action.cash_disbursement.print",
    "moduleId": "cash_disbursement",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_disbursement.export",
    "moduleId": "cash_disbursement",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.cash_disbursement.payment_method.cash",
    "moduleId": "cash_disbursement",
    "kind": "dropdown",
    "label": "Cash",
    "groupId": "payment_method",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.cash_disbursement.payment_method.check",
    "moduleId": "cash_disbursement",
    "kind": "dropdown",
    "label": "Check",
    "groupId": "payment_method",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.cash_disbursement.payment_method.bank_transfer",
    "moduleId": "cash_disbursement",
    "kind": "dropdown",
    "label": "Bank transfer",
    "groupId": "payment_method",
    "groupLabel": "Payment method",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.cash_receipt",
    "moduleId": "cash_receipt",
    "kind": "module",
    "label": "Cash Receipt Journal",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_receipt.view",
    "moduleId": "cash_receipt",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_receipt.add",
    "moduleId": "cash_receipt",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_receipt.edit",
    "moduleId": "cash_receipt",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_receipt.delete",
    "moduleId": "cash_receipt",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.cash_receipt.post",
    "moduleId": "cash_receipt",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_receipt.print",
    "moduleId": "cash_receipt",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.cash_receipt.export",
    "moduleId": "cash_receipt",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.cash_receipt.receipt_type.cash_sales",
    "moduleId": "cash_receipt",
    "kind": "dropdown",
    "label": "Cash sales",
    "groupId": "receipt_type",
    "groupLabel": "Receipt type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.cash_receipt.receipt_type.collection",
    "moduleId": "cash_receipt",
    "kind": "dropdown",
    "label": "Customer collection",
    "groupId": "receipt_type",
    "groupLabel": "Receipt type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.cash_receipt.receipt_type.other_receipt",
    "moduleId": "cash_receipt",
    "kind": "dropdown",
    "label": "Other receipt",
    "groupId": "receipt_type",
    "groupLabel": "Receipt type",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.trialbalance",
    "moduleId": "trialbalance",
    "kind": "module",
    "label": "Trial Balance",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.trialbalance.view",
    "moduleId": "trialbalance",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.trialbalance.print",
    "moduleId": "trialbalance",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.trialbalance.export",
    "moduleId": "trialbalance",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.balancesheet",
    "moduleId": "balancesheet",
    "kind": "module",
    "label": "Balance Sheet",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.balancesheet.view",
    "moduleId": "balancesheet",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.balancesheet.print",
    "moduleId": "balancesheet",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.balancesheet.export",
    "moduleId": "balancesheet",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.pl",
    "moduleId": "pl",
    "kind": "module",
    "label": "Profit & Loss",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.pl.view",
    "moduleId": "pl",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.pl.print",
    "moduleId": "pl",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.pl.export",
    "moduleId": "pl",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.assetlapsing",
    "moduleId": "assetlapsing",
    "kind": "module",
    "label": "Asset Lapsing",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.assetlapsing.view",
    "moduleId": "assetlapsing",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.assetlapsing.add",
    "moduleId": "assetlapsing",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.assetlapsing.edit",
    "moduleId": "assetlapsing",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.assetlapsing.delete",
    "moduleId": "assetlapsing",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.assetlapsing.print",
    "moduleId": "assetlapsing",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.assetlapsing.export",
    "moduleId": "assetlapsing",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.assetlapsing.asset_action.view_schedule",
    "moduleId": "assetlapsing",
    "kind": "dropdown",
    "label": "View schedule",
    "groupId": "asset_action",
    "groupLabel": "Asset actions",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.assetlapsing.asset_action.record_depreciation",
    "moduleId": "assetlapsing",
    "kind": "dropdown",
    "label": "Record depreciation",
    "groupId": "asset_action",
    "groupLabel": "Asset actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.files",
    "moduleId": "files",
    "kind": "module",
    "label": "Upload Files",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.files.view",
    "moduleId": "files",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.files.add",
    "moduleId": "files",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.files.edit",
    "moduleId": "files",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.files.delete",
    "moduleId": "files",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.files.download",
    "moduleId": "files",
    "kind": "action",
    "label": "Download",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.files.export",
    "moduleId": "files",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.files.file_action.upload",
    "moduleId": "files",
    "kind": "dropdown",
    "label": "Upload file",
    "groupId": "file_action",
    "groupLabel": "File actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.files.file_action.download",
    "moduleId": "files",
    "kind": "dropdown",
    "label": "Download file",
    "groupId": "file_action",
    "groupLabel": "File actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.files.file_action.preview",
    "moduleId": "files",
    "kind": "dropdown",
    "label": "Preview file",
    "groupId": "file_action",
    "groupLabel": "File actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.inventory",
    "moduleId": "inventory",
    "kind": "module",
    "label": "Inventory",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.inventory.view",
    "moduleId": "inventory",
    "kind": "action",
    "label": "View",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.inventory.add",
    "moduleId": "inventory",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.inventory.edit",
    "moduleId": "inventory",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.inventory.delete",
    "moduleId": "inventory",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.inventory.post",
    "moduleId": "inventory",
    "kind": "action",
    "label": "Post",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.inventory.import",
    "moduleId": "inventory",
    "kind": "action",
    "label": "Import",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.inventory.export",
    "moduleId": "inventory",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.inventory.inventory_action.items",
    "moduleId": "inventory",
    "kind": "dropdown",
    "label": "Manage items",
    "groupId": "inventory_action",
    "groupLabel": "Inventory actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.inventory.inventory_action.movements",
    "moduleId": "inventory",
    "kind": "dropdown",
    "label": "View stock movements",
    "groupId": "inventory_action",
    "groupLabel": "Inventory actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.inventory.inventory_action.adjustments",
    "moduleId": "inventory",
    "kind": "dropdown",
    "label": "Stock adjustments",
    "groupId": "inventory_action",
    "groupLabel": "Inventory actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "module.clients",
    "moduleId": "clients",
    "kind": "module",
    "label": "Clients",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "action.clients.view",
    "moduleId": "clients",
    "kind": "action",
    "label": "View",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "action.clients.add",
    "moduleId": "clients",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.clients.edit",
    "moduleId": "clients",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.clients.delete",
    "moduleId": "clients",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.clients.manage",
    "moduleId": "clients",
    "kind": "action",
    "label": "Manage settings/users",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "module.business",
    "moduleId": "business",
    "kind": "module",
    "label": "Business Profile",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "action.business.view",
    "moduleId": "business",
    "kind": "action",
    "label": "View",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "action.business.edit",
    "moduleId": "business",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.business.manage",
    "moduleId": "business",
    "kind": "action",
    "label": "Manage settings/users",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "module.account_settings",
    "moduleId": "account_settings",
    "kind": "module",
    "label": "Account Settings",
    "requiredPermission": null
  },
  {
    "key": "action.account_settings.view",
    "moduleId": "account_settings",
    "kind": "action",
    "label": "View",
    "requiredPermission": null
  },
  {
    "key": "action.account_settings.export",
    "moduleId": "account_settings",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.account_settings.account_action.profile",
    "moduleId": "account_settings",
    "kind": "dropdown",
    "label": "Profile details",
    "groupId": "account_action",
    "groupLabel": "Account actions",
    "requiredPermission": null
  },
  {
    "key": "dropdown.account_settings.account_action.password",
    "moduleId": "account_settings",
    "kind": "dropdown",
    "label": "Change password",
    "groupId": "account_action",
    "groupLabel": "Account actions",
    "requiredPermission": null
  },
  {
    "key": "dropdown.account_settings.account_action.export_data",
    "moduleId": "account_settings",
    "kind": "dropdown",
    "label": "Export account data",
    "groupId": "account_action",
    "groupLabel": "Account actions",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.tinlibrary",
    "moduleId": "tinlibrary",
    "kind": "module",
    "label": "TIN Library",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "action.tinlibrary.view",
    "moduleId": "tinlibrary",
    "kind": "action",
    "label": "View",
    "requiredPermission": "manage_settings"
  },
  {
    "key": "action.tinlibrary.add",
    "moduleId": "tinlibrary",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.tinlibrary.edit",
    "moduleId": "tinlibrary",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.tinlibrary.delete",
    "moduleId": "tinlibrary",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.tinlibrary.import",
    "moduleId": "tinlibrary",
    "kind": "action",
    "label": "Import",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.tinlibrary.export",
    "moduleId": "tinlibrary",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.team",
    "moduleId": "team",
    "kind": "module",
    "label": "Team & Subusers",
    "requiredPermission": "manage_users"
  },
  {
    "key": "action.team.view",
    "moduleId": "team",
    "kind": "action",
    "label": "View",
    "requiredPermission": "manage_users"
  },
  {
    "key": "action.team.add",
    "moduleId": "team",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.team.edit",
    "moduleId": "team",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.team.delete",
    "moduleId": "team",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.team.manage",
    "moduleId": "team",
    "kind": "action",
    "label": "Manage settings/users",
    "requiredPermission": "manage_users"
  },
  {
    "key": "dropdown.team.team_action.invite",
    "moduleId": "team",
    "kind": "dropdown",
    "label": "Invite users",
    "groupId": "team_action",
    "groupLabel": "Team actions",
    "requiredPermission": "manage_users"
  },
  {
    "key": "dropdown.team.team_action.change_roles",
    "moduleId": "team",
    "kind": "dropdown",
    "label": "Change roles",
    "groupId": "team_action",
    "groupLabel": "Team actions",
    "requiredPermission": "manage_users"
  },
  {
    "key": "dropdown.team.team_action.reset_password",
    "moduleId": "team",
    "kind": "dropdown",
    "label": "Reset managed password",
    "groupId": "team_action",
    "groupLabel": "Team actions",
    "requiredPermission": "manage_users"
  },
  {
    "key": "dropdown.team.team_action.grant_permissions",
    "moduleId": "team",
    "kind": "dropdown",
    "label": "Manage permissions",
    "groupId": "team_action",
    "groupLabel": "Team actions",
    "requiredPermission": "manage_users"
  },
  {
    "key": "module.reports",
    "moduleId": "reports",
    "kind": "module",
    "label": "Reports",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.reports.view",
    "moduleId": "reports",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.reports.print",
    "moduleId": "reports",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.reports.export",
    "moduleId": "reports",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.reports.report_format.pdf",
    "moduleId": "reports",
    "kind": "dropdown",
    "label": "PDF",
    "groupId": "report_format",
    "groupLabel": "Report output",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.reports.report_format.csv",
    "moduleId": "reports",
    "kind": "dropdown",
    "label": "CSV",
    "groupId": "report_format",
    "groupLabel": "Report output",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.reports.report_format.excel",
    "moduleId": "reports",
    "kind": "dropdown",
    "label": "Excel",
    "groupId": "report_format",
    "groupLabel": "Report output",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.reports.report_format.print",
    "moduleId": "reports",
    "kind": "dropdown",
    "label": "Print",
    "groupId": "report_format",
    "groupLabel": "Report output",
    "requiredPermission": "view_reports"
  },
  {
    "key": "module.relief",
    "moduleId": "relief",
    "kind": "module",
    "label": "RELIEF",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.relief.view",
    "moduleId": "relief",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.relief.edit",
    "moduleId": "relief",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.relief.print",
    "moduleId": "relief",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.relief.export",
    "moduleId": "relief",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "dropdown.relief.relief_action.view_schedule",
    "moduleId": "relief",
    "kind": "dropdown",
    "label": "View schedule",
    "groupId": "relief_action",
    "groupLabel": "RELIEF actions",
    "requiredPermission": "view_reports"
  },
  {
    "key": "dropdown.relief.relief_action.edit_transfers",
    "moduleId": "relief",
    "kind": "dropdown",
    "label": "Edit transfers",
    "groupId": "relief_action",
    "groupLabel": "RELIEF actions",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "dropdown.relief.relief_action.reset_transfers",
    "moduleId": "relief",
    "kind": "dropdown",
    "label": "Reset transfers",
    "groupId": "relief_action",
    "groupLabel": "RELIEF actions",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "module.taxnotes",
    "moduleId": "taxnotes",
    "kind": "module",
    "label": "Tax Notes",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.taxnotes.view",
    "moduleId": "taxnotes",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.taxnotes.add",
    "moduleId": "taxnotes",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.taxnotes.edit",
    "moduleId": "taxnotes",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.taxnotes.delete",
    "moduleId": "taxnotes",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.taxnotes.print",
    "moduleId": "taxnotes",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.taxnotes.export",
    "moduleId": "taxnotes",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.books",
    "moduleId": "books",
    "kind": "module",
    "label": "Books",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.books.view",
    "moduleId": "books",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.books.print",
    "moduleId": "books",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.books.export",
    "moduleId": "books",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.afs_financial_position",
    "moduleId": "afs_financial_position",
    "kind": "module",
    "label": "AFS · Financial Position",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_financial_position.view",
    "moduleId": "afs_financial_position",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_financial_position.print",
    "moduleId": "afs_financial_position",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_financial_position.export",
    "moduleId": "afs_financial_position",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.afs_income_statements",
    "moduleId": "afs_income_statements",
    "kind": "module",
    "label": "AFS · Income Statements",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_income_statements.view",
    "moduleId": "afs_income_statements",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_income_statements.print",
    "moduleId": "afs_income_statements",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_income_statements.export",
    "moduleId": "afs_income_statements",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.afs_equity_retained_earnings",
    "moduleId": "afs_equity_retained_earnings",
    "kind": "module",
    "label": "AFS · Equity & Retained Earnings",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_equity_retained_earnings.view",
    "moduleId": "afs_equity_retained_earnings",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_equity_retained_earnings.print",
    "moduleId": "afs_equity_retained_earnings",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_equity_retained_earnings.export",
    "moduleId": "afs_equity_retained_earnings",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  },
  {
    "key": "module.afs_ppe",
    "moduleId": "afs_ppe",
    "kind": "module",
    "label": "AFS · Property, Plant & Equipment",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_ppe.view",
    "moduleId": "afs_ppe",
    "kind": "action",
    "label": "View",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_ppe.add",
    "moduleId": "afs_ppe",
    "kind": "action",
    "label": "Add",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.afs_ppe.edit",
    "moduleId": "afs_ppe",
    "kind": "action",
    "label": "Edit",
    "requiredPermission": "edit_transactions"
  },
  {
    "key": "action.afs_ppe.delete",
    "moduleId": "afs_ppe",
    "kind": "action",
    "label": "Delete",
    "requiredPermission": "delete_transactions"
  },
  {
    "key": "action.afs_ppe.print",
    "moduleId": "afs_ppe",
    "kind": "action",
    "label": "Print",
    "requiredPermission": "view_reports"
  },
  {
    "key": "action.afs_ppe.export",
    "moduleId": "afs_ppe",
    "kind": "action",
    "label": "Export",
    "requiredPermission": "export_data"
  }
];
export const GRANULAR_PERMISSION_KEYS = GRANULAR_PERMISSION_CATALOG.map((item) => item.key);
export const GRANULAR_PERMISSION_REQUIREMENTS: Record<string, string | null> = Object.fromEntries(GRANULAR_PERMISSION_CATALOG.map((item) => [item.key, item.requiredPermission]));
export const GRANULAR_PERMISSION_MODULE_IDS = new Set(GRANULAR_PERMISSION_MODULES.map((item) => item.id));

export const modulePermissionKey = (moduleId: string) => `module.${moduleId}`;
export const actionPermissionKey = (moduleId: string, actionId: string) => `action.${moduleId}.${actionId}`;
export const dropdownPermissionKey = (moduleId: string, groupId: string, optionId: string) => `dropdown.${moduleId}.${groupId}.${optionId}`;

export function hasBasePermission(basePermissions: Record<string, boolean>, permission: string | null | undefined): boolean {
  return !permission || Boolean(basePermissions[permission]);
}

/** Defaults preserve current role behavior until the owner saves fine-grained grants. */
export function buildDefaultUiPermissions(basePermissions: Record<string, boolean>): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const item of GRANULAR_PERMISSION_CATALOG) {
    const module = GRANULAR_PERMISSION_MODULES.find((candidate) => candidate.id === item.moduleId);
    const moduleAllowed = hasBasePermission(basePermissions, module?.requiredPermission);
    result[item.key] = moduleAllowed && hasBasePermission(basePermissions, item.requiredPermission);
  }
  return result;
}

export function moduleIdForSidebarPage(pageId: string | null | undefined): string | null {
  if (!pageId) return 'dashboard';
  const normalized = pageId.replace(/^\/+/, '');
  return PAGE_ID_MODULES[normalized] || null;
}
const PAGE_ID_MODULES: Record<string, string> = {
  "coa": "coa",
  "billing": "billing",
  "payroll": "payroll",
  "payroll/settings": "payroll_settings",
  "sales": "sales",
  "purchases": "purchases",
  "purchases/invoiced": "purchases",
  "purchases/other-payments": "purchases_other_payments",
  "purchases/ap": "purchases_ap",
  "ap-workspace": "purchases_ap",
  "journal-voucher": "journal_voucher",
  "history": "history",
  "expenses": "history",
  "income": "history",
  "compliance-tracker": "compliance_tracker",
  "bir-forms": "bir_forms",
  "eis-center": "eis_center",
  "cashflow": "cashflow",
  "journal": "journal",
  "ledger": "ledger",
  "sales-journal": "sales_journal",
  "purchase-journal": "purchase_journal",
  "cash-disbursement": "cash_disbursement",
  "cash-receipt": "cash_receipt",
  "trialbalance": "trialbalance",
  "balancesheet": "balancesheet",
  "pl": "pl",
  "assetlapsing": "assetlapsing",
  "files": "files",
  "inventory": "inventory",
  "clients": "clients",
  "business": "business",
  "account-settings": "account_settings",
  "tinlibrary": "tinlibrary",
  "team": "team",
  "reports": "reports",
  "relief": "relief",
  "taxnotes": "taxnotes",
  "books": "books",
  "afs-financial-position": "afs_financial_position",
  "afs-income-statements": "afs_income_statements",
  "afs-equity-retained-earnings": "afs_equity_retained_earnings",
  "afs-ppe": "afs_ppe"
};

export function moduleIdForRoute(pathname: string): string | null {
  const normalized = pathname.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  return ROUTE_MODULES[normalized] || (normalized.startsWith('/purchases/') ? (normalized.endsWith('/ap') ? 'purchases_ap' : normalized.endsWith('/other-payments') ? 'purchases_other_payments' : 'purchases_invoiced') : null);
}
const ROUTE_MODULES: Record<string, string> = {
  "/": "dashboard",
  "/coa": "coa",
  "/billing": "billing",
  "/payroll": "payroll",
  "/payroll/settings": "payroll_settings",
  "/sales": "sales",
  "/purchases": "purchases",
  "/purchases/invoiced": "purchases_invoiced",
  "/purchases/other-payments": "purchases_other_payments",
  "/purchases/ap": "purchases_ap",
  "/ap-workspace": "purchases_ap",
  "/journal-voucher": "journal_voucher",
  "/history": "history",
  "/compliance-tracker": "compliance_tracker",
  "/bir-forms": "bir_forms",
  "/eis-center": "eis_center",
  "/cashflow": "cashflow",
  "/journal": "journal",
  "/ledger": "ledger",
  "/sales-journal": "sales_journal",
  "/purchase-journal": "purchase_journal",
  "/cash-disbursement": "cash_disbursement",
  "/cash-receipt": "cash_receipt",
  "/trialbalance": "trialbalance",
  "/balancesheet": "balancesheet",
  "/pl": "pl",
  "/assetlapsing": "assetlapsing",
  "/files": "files",
  "/inventory": "inventory",
  "/clients": "clients",
  "/business": "business",
  "/account-settings": "account_settings",
  "/tinlibrary": "tinlibrary",
  "/team": "team",
  "/reports": "reports",
  "/relief": "relief",
  "/taxnotes": "taxnotes",
  "/books": "books",
  "/afs-financial-position": "afs_financial_position",
  "/afs-income-statements": "afs_income_statements",
  "/afs-equity-retained-earnings": "afs_equity_retained_earnings",
  "/afs-ppe": "afs_ppe"
};


/** Modules that must all be granted for a route to be accessible. */
export function moduleIdsForRoute(pathname: string): string[] {
  const normalized = pathname.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
  if (normalized === '/purchases/invoiced') return ['purchases', 'purchases_invoiced'];
  if (normalized === '/purchases/other-payments') return ['purchases', 'purchases_other_payments'];
  if (normalized === '/purchases/ap' || normalized === '/ap-workspace') return ['purchases', 'purchases_ap'];
  const moduleId = moduleIdForRoute(normalized);
  return moduleId ? [moduleId] : [];
}

/**
 * A page can only appear in permission selections if regular users can
 * actually open it. Availability follows the same feature allowlist that the
 * route guard and sidebar use (pagePermissions.featureAllows), so a page that
 * is locked for everyone never shows up as something an owner can grant.
 */
export function isModuleAvailableToUsers(moduleId: string): boolean {
  if (moduleId === 'dashboard') return true;
  const routes = Object.entries(ROUTE_MODULES).filter(([, id]) => id === moduleId).map(([route]) => route);
  return routes.some((route) => featureAllows(route));
}

/** Permission modules that may be offered in the Team & Subusers editor. */
export const AVAILABLE_PERMISSION_MODULES: UiPermissionModule[] = GRANULAR_PERMISSION_MODULES.filter((m) => isModuleAvailableToUsers(m.id));
/** Fine-grained keys that belong to an available module. */
export const AVAILABLE_GRANULAR_PERMISSION_KEYS: string[] = GRANULAR_PERMISSION_CATALOG
  .filter((item) => isModuleAvailableToUsers(item.moduleId))
  .map((item) => item.key);
