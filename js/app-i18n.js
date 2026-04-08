/**
 * app-i18n.js — نظام الترجمة الشامل
 * يُحمَّل بعد app-common.js مباشرة
 * يغطي: قيم DB، نصوص UI، رؤوس الجداول، رسائل الأخطاء
 */

// ══════════════════════════════════════════════════════════════
//  القاموس الشامل — AR → EN
// ══════════════════════════════════════════════════════════════
const i18n = {
  ar: null, // يُحسب تلقائياً (المفاتيح = القيم)
  en: {
    // ── الحالات / Statuses ────────────────────────────────────
    'مسودة': 'Draft',
    'قيد المراجعة': 'Under Review',
    'معتمد': 'Approved',
    'معتمد مبدئياً': 'Provisionally Approved',
    'مرفوض': 'Rejected',
    'ملغى': 'Cancelled',
    'ملغي': 'Cancelled',
    'منفذ': 'Executed',
    'نشط': 'Active',
    'منتهي': 'Expired',
    'موقوف': 'Suspended',
    'مكتمل': 'Completed',
    'مكتملة': 'Completed',
    'معلق': 'Pending',
    'جاري': 'In Progress',
    'جديد': 'New',
    'مستلم': 'Received',
    'في الموازنة': 'In Budget',
    'في الدفع': 'In Payment',
    'مدفوع': 'Paid',
    'تم الدفع': 'Paid',
    'تم الإغلاق': 'Closed',
    'مستحق': 'Due',
    'منتهية الصلاحية': 'Expired',
    'منتهي الصلاحية': 'Expired',
    'completed': 'Completed',
    // ── الأولوية / Priority ────────────────────────────────────
    'عاجل': 'Urgent',
    'عاجلة': 'Urgent',
    'مهم': 'Important',
    'مهمة': 'Important',
    'متابعة': 'Follow-up',
    'عادي': 'Normal',
    'عادية': 'Normal',
    // ── مراحل سير العمل / Workflow Stages ─────────────────────
    'إنشاء': 'Creation',
    'الاستلام': 'Receiving',
    'الاستلام والتحقق': 'Receiving & Verification',
    'الموازنة': 'Budget',
    'مراجعة موظف الموازنة': 'Budget Officer Review',
    'مراجعة مدير الخزينة': 'Treasury Manager Review',
    'مراجعة مدير القسم': 'Dept. Manager Review',
    'مراجعة رئيس القطاع المالي': 'Finance Sector Head Review',
    'مراجعة CEO مبدئية': 'Initial CEO Review',
    'مراجعة الموازنة': 'Budget Review',
    'الدفع': 'Payment',
    'الفوترة': 'Invoicing',
    'اعتماد': 'Approval',
    'اعتماد حجز الموازنة': 'Budget Reservation Approval',
    'الحسابات — مراجعة وتوزيع': 'Accounts — Review & Distribution',
    'الشراء — إنشاء حجز': 'Procurement — Create Reservation',
    'إصدار أمر الشراء (PO)': 'PO Issuance',
    'التوجيه': 'Routing',
    'الإرسال': 'Submission',
    'creation': 'Creation',
    'receiving': 'Receiving',
    'budget': 'Budget',
    'budget_review': 'Budget Review',
    'payment': 'Payment',
    'invoice': 'Invoicing',
    'dispatch': 'Routing',
    // ── السايدبار / Sidebar ────────────────────────────────────
    'الرئيسية': 'Main',
    'لوحة التحكم': 'Dashboard',
    'التنبيهات': 'Notifications',
    'المعاملات': 'Transactions',
    'المعاملات المالية': 'Financial Transactions',
    'الخطابات': 'Correspondence',
    'التخطيط والموازنة': 'Planning & Budget',
    'حجوزات الموازنة': 'Budget Reservations',
    'الموازنة التقديرية': 'Estimated Budget',
    'الخزينة': 'Treasury',
    'نظرة عامة': 'Overview',
    'الحسابات البنكية': 'Bank Accounts',
    'الودائع الاستثمارية الشهرية': 'Monthly Investment Deposits',
    'نشاط الودائع الاستثمارية': 'Investment Activity',
    'الاستحقاقات القادمة': 'Upcoming Maturities',
    'آخر الودائع': 'Recent Deposits',
    'نظام الودائع البنكية': 'Banking Deposits System',
    'ودائع الشهر': 'Monthly Deposits',
    'سجل الأرصدة اليومية': 'Daily Balance Log',
    'تسجيل رصيد اليوم': 'Record Today\'s Balance',
    'إضافة حساب': 'Add Account',
    'وديعة جديدة': 'New Deposit',
    'رصيد وديعة جديدة': 'New Deposit Balance',
    'تسجيل جديد': 'New Record',
    'لا يوجد ودائع': 'No deposits',
    'لم يتم تسجيل أي رصيدة يومية بعد': 'No daily balances recorded yet',
    'سجّل الرصيد الآن': 'Record Balance Now',
    'إجمالي أرصدة الحسابات': 'Total Account Balances',
    'إجمالي الاستثمارات النشطة': 'Total Active Investments',
    'إجمالي الأرباح المتراكمة': 'Total Accumulated Returns',
    'قريبة الاستحقاق': 'Near Maturity',
    'أرباح متبقة': 'Remaining Returns',
    'الاسم': 'Name',
    'الحساب': 'Account',
    'الفائدة': 'Interest',
    'الاستحقاق': 'Maturity',
    'الربح': 'Return',
    'الحالة': 'Status',
    'رقم الإيداع': 'Deposit No.',
    'سجل الأرصدة': 'Balance Log',
    'ودائع': 'Deposits',
    'إغلاق': 'Closing',
    'افتتاح': 'Opening',
    'الفرق': 'Difference',
    'الأرشيف المالي': 'Financial Archive',
    'جميع المستندات': 'All Documents',
    'مستندات تشغيلية': 'Operational Documents',
    'مستندات مالية': 'Financial Documents',
    'تقارير وموازنة': 'Reports & Budget',
    'وثائق رسمية': 'Official Documents',
    'التجديد والصلاحيات': 'Renewals & Validity',
    'متابعة الأداء': 'Performance Tracking',
    'اعتمادات الرئيس التنفيذي': 'CEO Approvals',
    'الإعدادات': 'Settings',
    // ── رؤوس الجداول / Table Headers ──────────────────────────
    'الاسم': 'Name',
    'اسم الموظف': 'Employee Name',
    'رقم الموظف': 'Employee No.',
    'رقم المعاملة': 'Transaction No.',
    'رقم الحجز': 'Reservation No.',
    'رقم الخطاب': 'Letter No.',
    'الحالة': 'Status',
    'الأولوية': 'Priority',
    'المبلغ': 'Amount',
    'التاريخ': 'Date',
    'تاريخ البدء': 'Start Date',
    'تاريخ الانتهاء': 'End Date',
    'تاريخ الإنشاء': 'Created',
    'تاريخ الاستحقاق': 'Due Date',
    'الإجراءات': 'Actions',
    'الإجراء': 'Action',
    'القسم': 'Department',
    'القطاع': 'Sector',
    'القطاع / القسم': 'Sector / Dept.',
    'الدور': 'Role',
    'المرحلة': 'Stage',
    'المسار': 'Path',
    'الموظف': 'Employee',
    'المشرف': 'Supervisor',
    'الوقت': 'Time',
    'المدة': 'Duration',
    'التواصل': 'Contact',
    'البريد الإلكتروني': 'Email',
    'الهاتف': 'Phone',
    'السبب': 'Reason',
    'السبب/الملاحظات': 'Reason / Notes',
    'الملاحظات': 'Notes',
    'ملاحظات': 'Notes',
    'الحساب البنكي': 'Bank Account',
    'تاريخ الإيداع': 'Deposit Date',
    'نوع الإيداع': 'Deposit Type',
    'اسم المودع': 'Depositor Name',
    'رقم المرجع': 'Reference Number',
    '● النشطة': '● Active',
    '✔ المنتهية': '✔ Completed',
    '✖ الملغاة': '✖ Cancelled',
    'الوصف': 'Description',
    'النوع': 'Type',
    'الغرض': 'Purpose',
    'الفرض': 'Purpose',
    'الفرض / القسم': 'Purpose / Dept.',
    'الجهة': 'Entity',
    'المورد': 'Vendor',
    'رقم الفاتورة': 'Invoice No.',
    'مستوى الصلاحية': 'Permission Level',
    'من': 'From',
    'إلى': 'To',
    'إجمالي': 'Total',
    'الإجمالي': 'Total',
    'إجمالي الكلي': 'Grand Total',
    'العملة': 'Currency',
    '#': '#',
    'الصنف': 'Item',
    'الوصف / الصنف': 'Description / Item',
    'الكمية': 'Qty',
    'الوحدة': 'Unit',
    'سعر الوحدة': 'Unit Price',
    'الإجمالي الفرعي': 'Subtotal',
    'رقم الطلب': 'Request No.',
    'العنوان': 'Title',
    'الإدارة': 'Department',
    'مُسند إلى': 'Assigned To',
    'إجراءات': 'Actions',
    'مسند إلى': 'Assigned To',
    'بنك': 'Bank',
    'رقم الحساب': 'Account No.',
    'نوع الحساب': 'Account Type',
    'الرصيد': 'Balance',
    'المستلم': 'Recipient',
    'المرسل': 'Sender',
    'المصدر': 'Source',
    'البنك': 'Bank',
    'الفرع': 'Branch',
    'رقم المرجع': 'Reference No.',
    'رقم المستند': 'Document No.',
    'تاريخ التنفيذ': 'Execution Date',
    'تاريخ الاعتماد': 'Approval Date',
    'المعتمد من': 'Approved By',
    'المنفذ': 'Executed By',
    'الجهة المستفيدة': 'Beneficiary',
    'رقم أمر الدفع': 'Payment Order No.',
    'بيان': 'Statement',
    'مرفقات': 'Attachments',
    // ── السايدبار الإضافي / Sidebar Extra ────────────────────
    'المتابعة': 'Follow-up',
    'النظام': 'System',
    'المعاملات': 'Transactions',
    'إجمالي الحجم': 'Total Size',
    // ── المدفوعات اليومية / Daily Payments ───────────────────
    'السجل السابق': 'Previous Log',
    'إصدار أمر الدفع': 'Issue Payment Order',
    'إجمالي المبالغ': 'Total Amounts',
    'تجاوزت SLA': 'SLA Breached',
    'تحذير SLA': 'SLA Warning',
    'تحديد الكل': 'Select All',
    'كل الأولويات': 'All Priorities',
    'كل الحالات': 'All Statuses',
    'تجاوز SLA': 'SLA Breach',
    // ── استثمارات / Investments ───────────────────────────────
    'إجمالي مُستثمر': 'Total Invested',
    'قريبة الاستحقاق': 'Near Maturity',
    'الاستحقاق': 'Maturity',
    'الفائدة': 'Interest',
    'الربح': 'Profit',
    'الربح المتوقع': 'Expected Return',
    'الربح المتراكم': 'Accumulated Return',
    'الربح الفعلي': 'Actual Return',
    'إجمالي الأرصدة': 'Total Balances',
    'الحساب': 'Account',
    // ── الخزينة / Treasury Bank ───────────────────────────────
    'نظام الودائع البنكية': 'Banking & Deposits System',
    'إجمالي أرصدة الحسابات': 'Total Account Balances',
    'إجمالي الاستثمارات النشطة': 'Total Active Investments',
    'إجمالي الأرباح المتوقعة': 'Total Expected Returns',
    'قريب الاستحقاق': 'Near Maturity',
    'نشاط الودائع الاستثمارية': 'Investment Activity',
    'الأرباح الاستثمارية الشهرية': 'Monthly Investment Returns',
    'الاستحقاقات القادمة': 'Upcoming Maturities',
    'آخر الودائع': 'Recent Deposits',
    'لا توجد ودائع': 'No deposits',
    'لا توجد ودائع مسجلة': 'No deposits recorded',
    'لا توجد ودائع مجدولة هذا الشهر': 'No deposits scheduled this month',
    'سجل الأرصدة اليومية': 'Daily Balance Log',
    'لم يتم تسجيل أي أرصدة يومية بعد': 'No daily balances recorded yet',
    'تسجيل رصيد اليوم': "Record Today's Balance",
    'سجل الرصيد الآن': 'Record Balance Now',
    'إضافة حساب': 'Add Account',
    'إضافة حساب بنكي': 'Add Bank Account',
    'سجل رصيد جديد': 'Record New Balance',
    'حساب الإيداعات': 'Deposits Account',
    'حساب التشغيل': 'Operating Account',
    'جاري': 'Current',
    'توفير': 'Savings',
    'استثماري': 'Investment',
    'ربح متراكم': 'Accumulated Return',
    'مستحقة الإغلاق': 'Due for Closure',
    'فترة الاستحقاق': 'Maturity Period',
    'مستحق': 'Overdue',
    'ملغي': 'Cancelled',
    '● النشطة': '● Active',
    '✖ الملغاة': '✖ Cancelled',
    'لا توجد حسابات بنكية نشطة': 'No active bank accounts',
    'وديعة جديدة': 'New Deposit',
    'إضافة وديعة': 'Add Deposit',
    'وديعة استثمارية جديدة': 'New Investment Deposit',
    'في الانتظار': 'Pending',
    'في التأخر': 'Delayed',
    'حسن الوقت': 'On Time',
    'آخر 6 أشهر': 'Last 6 months',
    'يوم': 'day',
    'متبقٍ': 'remaining',
    'متأخرة': 'overdue by',
    'ربح مراكم': 'Accumulated Return',
    'أقرب استحقاق': 'Nearest Maturity',
    'حتى اليوم': 'To Date',
    'تنتظر إغلاق': 'Pending Closure',
    'لا شيء': 'None',
    'خلال 3 أيام': 'Within 3 Days',
    'وديعة': 'deposit',
    'بحث في الودائع': 'Search deposits',
    // ── تفاصيل الاستثمار / Investment Detail ─────────────────
    'التواريخ': 'Dates',
    'المبلغ الأصلي': 'Principal Amount',
    'معدل الفائدة': 'Interest Rate',
    'تاريخ الإغلاق': 'Closure Date',
    'الرقم': 'Number',
    'إعادة لـ': 'Return to',
    '⏰ مستحقة الإغلاق': '⏰ Due for Closure',
    '🔔 قريبة الاستحقاق': '🔔 Near Maturity',
    '● نشطة': '● Active',
    '✔ منتهية': '✔ Completed',
    '✖ ملغاة': '✖ Cancelled',
    'نشطة': 'Active',
    'منتهية': 'Completed',
    'ملغاة': 'Cancelled',
    '• النشطة •': '• Active •',
    '✓ المنتهية': '✓ Completed',
    '✖ الملغاة': '✖ Cancelled',
    'سجل رصيد جديد': 'Record New Balance',
    'سجل الرصيد الآن': 'Record Balance Now',
    // ── مودالات البنك / Bank Modals ───────────────────────────
    'جميع الحسابات': 'All Accounts',
    'الرصيد الحالي في النظام': 'Current System Balance',
    'رصيد الافتتاح': 'Opening Balance',
    'رصيد الإغلاق الفعلي': 'Actual Closing Balance',
    'ملاحظة عامة': 'General Note',
    'اختياري': 'Optional',
    'حفظ الرصيد': 'Save Balance',
    'حفظ وتحديث رصيد النظام': 'Save & Update System Balance',
    'تحديث رصيد النظام': 'Update System Balance',
    'حفظ جميع الأرصدة': 'Save All Balances',
    'لا يوجد سجل أرصدة لهذا الحساب بعد': 'No balance log for this account yet',
    'الرصيد الافتتاحي': 'Opening Balance',
    'افتتاح': 'Opening',
    'ودائع': 'Deposits',
    'إغلاق': 'Closing',
    'الفرق': 'Difference',
    'إضافة إيداع بنكي': 'Add Bank Deposit',
    'جدولة وديعة شهرية': 'Schedule Monthly Deposit',
    'ربط وديعة استثمارية جديدة': 'Link New Investment Deposit',
    'إغلاق الوديعة واسترداد المبلغ': 'Close Deposit & Redeem',
    'إلغاء الوديعة مبكراً': 'Early Deposit Cancellation',
    'حفظ التغييرات': 'Save Changes',
    'حفظ الحساب': 'Save Account',
    'حفظ الأرصدة': 'Save Balances',
    'اسم الحساب': 'Account Name',
    'رقم الحساب': 'Account Number',
    'اسم البنك': 'Bank Name',
    'نوع الحساب': 'Account Type',
    'الرصيد الافتتائي': 'Initial Balance',
    'الرصيد الجديد': 'New Balance',
    'سبب التعديل': 'Reason for Edit',
    'الرصيد الحالي': 'Current Balance',
    'تحديث الرصيد': 'Update Balance',
    'حفظ وتحديث رصيد النظام': 'Save & Update Balance',
    // ── تفاصيل المعاملة / PR Detail ───────────────────────────
    'المبلغ التقديري': 'Estimated Amount',
    'المبلغ النهائي': 'Final Amount',
    'بيانات الطلب': 'Request Info',
    'المنشئ': 'Created By',
    'تاريخ الحاجة': 'Needed Date',
    'أمر الشراء': 'Purchase Order',
    'المورد المبدئي': 'Initial Vendor',
    'المورد النهائي': 'Final Vendor',
    'مركز التكلفة': 'Cost Center',
    'بند المصروف': 'Expense Item',
    'كود الميزانية': 'Budget Code',
    'إنشاء حجز موازنة': 'Create Budget Reservation',
    'الحجز مُنشأ — بانتظار الاعتماد': 'Reservation Created — Awaiting Approval',
    'مسار PO': 'PO Route',
    'دفع مباشر': 'Direct Payment',
    'إصدار أمر الشراء': 'Issue Purchase Order',
    'تمت موافقتك': 'You have approved',
    'إحالة': 'Refer',
    'إسناد': 'Assign',
    'إسناد إلى': 'Assigned To',
    'موافقة': 'Approve',
    'رفض': 'Reject',
    'إضافة': 'Add',
    // ── SLA ────────────────────────────────────────────────────
    'ضمن الوقت': 'On Time',
    'تجاوز SLA': 'SLA Breached',
    'تحذير': 'Warning',
    'موقوف': 'Paused',
    'متوقف — انتظار اعتماد الحجز': 'Paused — Awaiting Reservation Approval',
    'مُنقضي': 'Elapsed',
    'مضى': 'Passed',
    'متبقي': 'Remaining',
    'مسموح': 'Allowed',
    'تجاوز': 'Breached',
    'مؤشرات SLA': 'SLA Indicators',
    // ── سجل النشاط / Activity Log ──────────────────────────────
    'سجل النشاط': 'Activity Log',
    'مسار المعاملة': 'Transaction Path',
    'لا توجد أحداث بعد': 'No events yet',
    'مرحلة': 'Stage',
    'مكتملة': 'Completed',
    // ── الأفعال / Actions ─────────────────────────────────────
    'إضافة': 'Add',
    'تعديل': 'Edit',
    'حذف': 'Delete',
    'حفظ': 'Save',
    'إلغاء': 'Cancel',
    'إغلاق': 'Close',
    'تأكيد': 'Confirm',
    'بحث': 'Search',
    'تصفية': 'Filter',
    'تصدير': 'Export',
    'طباعة': 'Print',
    'تحديث': 'Refresh',
    'عرض': 'View',
    'رفع': 'Upload',
    'تنزيل': 'Download',
    'إرسال': 'Send',
    'موافقة': 'Approve',
    'رفض': 'Reject',
    'توجيه': 'Route',
    'مراجعة': 'Review',
    'إنشاء': 'Create',
    'اختيار': 'Select',
    'رجوع': 'Back',
    // ── الرسائل / Messages ────────────────────────────────────
    'الكل': 'All',
    'جميع الحالات': 'All Statuses',
    'جميع الأنواع': 'All Types',
    'جميع المراحل': 'All Stages',
    'جميع الأولويات': 'All Priorities',
    'جميع القطاعات': 'All Sectors',
    'جميع الأقسام': 'All Departments',
    'لا توجد بيانات': 'No data available',
    'لا يوجد': 'None',
    'لا توجد': 'None',
    'جاري التحميل...': 'Loading...',
    '⏳ جاري التحميل...': '⏳ Loading...',
    '⏳ جارٍ التحميل...': '⏳ Loading...',
    'جارٍ التحميل': 'Loading...',
    'خطأ في التحميل': 'Loading error',
    'خطأ في الاتصال': 'Connection error',
    'خطأ في تحميل البيانات': 'Error loading data',
    'خطأ في تحميل الأرصدة': 'Error loading balances',
    'خطأ في التحديث': 'Update error',
    'تم الحفظ بنجاح': 'Saved successfully',
    'تم الحذف بنجاح': 'Deleted successfully',
    'تم الإضافة بنجاح': 'Added successfully',
    'تم التحديث بنجاح': 'Updated successfully',
    'تم الاعتماد بنجاح': 'Approved successfully',
    'تم الرفض بنجاح': 'Rejected successfully',
    'تم تحديث الأولوية': 'Priority updated',
    'تم رفع المرفقات بنجاح': 'Attachments uploaded',
    'حدث خطأ': 'An error occurred',
    'وصول مرفوض': 'Access Denied',
    'غير مصرح بالوصول': 'Unauthorized Access',
    'ليس لديك صلاحية': 'No permission',
    'لا توجد معاملات': 'No transactions',
    'لا توجد حجوزات': 'No reservations',
    'لا توجد إشعارات': 'No notifications',
    'لا توجد أحداث': 'No events',
    'لا توجد مرفقات': 'No attachments',
    'لا توجد مستندات': 'No documents',
    'لا توجد ودائع': 'No deposits',
    'لا توجد معاملات عاجلة': 'No urgent transactions',
    'جميع المعاملات تسير بشكل طبيعي': 'All transactions are proceeding normally',
    // ── النماذج / Forms ───────────────────────────────────────
    'الاسم الكامل': 'Full Name',
    'كلمة المرور': 'Password',
    'رقم الهاتف': 'Phone Number',
    'اختر القسم': 'Select Department',
    'اختر الدور': 'Select Role',
    'اختر العملة': 'Select Currency',
    'اختر السنة': 'Select Year',
    'يتعبّأ تلقائياً عند اختيار مركز التكلفة': 'Auto-filled when cost center is selected',
    'بحث في المعاملات...': 'Search transactions...',
    'بحث في الموظفين...': 'Search employees...',
    'بحث في الخطابات...': 'Search letters...',
    'بحث في الرقم أو العرض...': 'Search by number or purpose...',
    'بحث في الوثيقة...': 'Search document...',
    'أدخل سبب الرفض': 'Enter rejection reason',
    'سبب تحديد الأولوية...': 'Reason for priority...',
    // ── البنك / Bank ───────────────────────────────────────────
    'نظام الودائع البنكية': 'Banking Deposits System',
    'الودائع': 'Deposits',
    'ودائع الشهر': 'Monthly Deposits',
    'رصيد الحساب': 'Account Balance',
    'إجمالي الأرصدة': 'Total Balances',
    'حساب الإيداعات': 'Deposit Account',
    'حساب التشغيل': 'Operating Account',
    'البنك': 'Bank',
    'رقم الحساب': 'Account Number',
    'نوع الحساب': 'Account Type',
    'معدل الفائدة': 'Interest Rate',
    'ربح متوقع': 'Expected Profit',
    'تم الإغلاق ✅': 'Closed ✅',
    'مستحقة الآن 🔴': 'Due Now 🔴',
    'وديعة نشطة': 'Active Deposit',
    'وديعة': 'Deposit',
    'SAR': 'SAR',
    // ── الأرشيف / Archive ─────────────────────────────────────
    'أرشيف مباشر': 'Direct Archive',
    'الأرشيف': 'Archive',
    'تنتهي خلال 30 يوم': 'Expires in 30 days',
    'تنتهي خلال 7 أيام': 'Expires in 7 days',
    'قرب الانتهاء': 'Expiring Soon',
    'صالح': 'Valid',
    'رفع': 'Upload',
    'إضافة وثيقة': 'Add Document',
    'إضافة وثيقة جديدة': 'Add New Document',
    'اختر النوع ثم أدخل البيانات': 'Select type then enter data',
    'تفاصيل المستند': 'Document Details',
    'تعديل المستند': 'Edit Document',
    'استعراض': 'Preview',
    'تحميل': 'Download',
    'إجمالي المستندات': 'Total Documents',
    'مصادر مرتبطة': 'Linked Sources',
    'تحت المتابعة': 'Under Follow-up',
    'صلاحيات وعقود': 'Licenses & Contracts',
    'لا تنبيهات': 'No alerts',
    'هذا الشهر': 'this month',
    'هذا الأسبوع': 'this week',
    'عرض الكل': 'View All',
    'عرض الكل ←': 'View All →',
    'لا توجد مستندات للتجديد': 'No renewal documents',
    'ستظهر هنا المستندات التي تقترب صلاحيتها': 'Documents nearing expiry will appear here',
    'مستندات التجديد السنوي': 'Annual Renewal Documents',
    'مستندات تشغيلية': 'Operational Documents',
    'مستندات مالية': 'Financial Documents',
    'تقارير وموازنة': 'Reports & Budget',
    'وثائق رسمية': 'Official Documents',
    'التجديد والصلاحيات': 'Renewals & Licenses',
    'جميع المستندات': 'All Documents',
    'لا توجد مستندات': 'No documents',
    'لا توجد مستندات في هذا القسم': 'No documents in this section',
    'جميع المستندات ←': 'All Documents →',
    'ملف': 'file',
    'مستندات': 'documents',
    'جارٍ التحميل…': 'Loading…',
    'فواتير مبيعات': 'Sales Invoices',
    'فواتير موردين': 'Supplier Invoices',
    'قيود يومية': 'Journal Entries',
    'مستندات بنكية': 'Bank Documents',
    'ضرائب وزكاة': 'Tax & Zakat',
    'تقارير مالية': 'Financial Reports',
    'موازنة وتخطيط': 'Budget & Planning',
    'العقود والاتفاقيات': 'Contracts & Agreements',
    'التعميدات والتفويضات': 'Mandates & Delegations',
    'الخطابات والمراسلات': 'Letters & Correspondence',
    'وثائق حكومية': 'Government Documents',
    'سجلات تجارية': 'Commercial Records',
    'نوع الوثيقة': 'Document Type',
    'البيانات': 'Data',
    'الملف': 'File',
    'التالي': 'Next',
    'رجوع': 'Back',
    'حفظ الوثيقة': 'Save Document',
    'اسحب الملف هنا أو انقر للاختيار': 'Drag file here or click to select',
    'الملف اختياري — يمكنك الحفظ بدون رفع ملف': 'File is optional — you can save without uploading',
    'انقر لاختيار ملف جديد أو اسحبه هنا': 'Click to select a new file or drag it here',
    'استبدال الملف': 'Replace File',
    'البيانات الأساسية': 'Basic Data',
    'اسم المستند': 'Document Name',
    'تغيير النوع': 'Change Type',
    'ابحث باسم الملف أو التصنيف أو المصدر…': 'Search by name, category, or source…',
    'الأحدث أولاً': 'Newest First',
    'الأقدم أولاً': 'Oldest First',
    'الاسم أ-ي': 'Name A-Z',
    'الأقرب انتهاءً': 'Expiring Soonest',
    'بطاقات': 'Cards',
    'قائمة': 'List',
    'جدول': 'Table',
    'انتهت منذ': 'Expired',
    'ينتهي بعد': 'Expires in',
    'يوم متبقي': 'day(s) remaining',
    'أيام': 'days',
    'منتهية': 'Expired',
    'نشط': 'Active',
    'اسم الملف': 'File Name',
    'التصنيف': 'Category',
    'الحجم': 'Size',
    'تاريخ الرفع': 'Upload Date',
    'رفع بواسطة': 'Uploaded By',
    'الصلاحية': 'Validity',
    'ملف جديد': 'New File',
    'معاملة': 'Transaction',
    'خطاب': 'Letter',
    'بنكي': 'Bank',
    'موازنة': 'Budget',
    'أرشيف': 'Archive',
    // ── الأداء / Performance ───────────────────────────────────
    'تحليل أوقات الإنجاز': 'Completion Time Analysis',
    'سجل الأحداث': 'Events Log',
    'من تاريخ': 'From Date',
    'إلى تاريخ': 'To Date',
    'إعادة تعيين': 'Reset',
    'أحداث': 'Events',
    'متوسط إنجاز المعاملة': 'Avg. Transaction Completion',
    'معاملة محللة': 'transactions analyzed',
    'أحداث اليوم': 'Today\'s Events',
    'متوسط الوقت': 'Average Time',
    // ── CEO / اعتمادات الرئيس ─────────────────────────────────
    'بانتظار القرار': 'Awaiting Decision',
    'مراجعة أرشيفية': 'Archival Review',
    'قرار الرئيس': 'CEO Decision',
    'تحضير ملف': 'Prepare File',
    'إعدادات الختم والتوقيع': 'Stamp & Signature Settings',
    'معاينة الختم': 'Stamp Preview',
    // ── SLA ────────────────────────────────────────────────────
    '⚠️ تحذير OLA': '⚠️ OLA Warning',
    '🔴 تجاوزOLA': '🔴 OLA Breach',
    '⚠️ تحذير SLA': '⚠️ SLA Warning',
    '🚨 تجاوزSLA': '🚨 SLA Breach',
    'نظام SLA المركزي': 'Central SLA System',
    'طلبات الشراء': 'Purchase Requests',
    'حجوزات الموازنة': 'Budget Reservations',
    'سجل التجاوزات': 'Violations Log',
    'حفظ التعديلات': 'Save Changes',
    // ── أنواع المستندات / Document types ──────────────────────
    'تشغيلية': 'Operational',
    'مالية': 'Financial',
    'رسمية': 'Official',
    'تجديد': 'Renewal',
    'داخلي': 'Internal',
    'داخلي - مالي': 'Internal - Financial',
    'داخلي - عام': 'Internal - General',
    'خارجي': 'External',
    'سري': 'Confidential',
    'وارد': 'Incoming',
    'صادر': 'Outgoing',
    // ── الأشهر / Months ────────────────────────────────────────
    'يناير': 'January', 'فبراير': 'February', 'مارس': 'March',
    'أبريل': 'April', 'مايو': 'May', 'يونيو': 'June',
    'يوليو': 'July', 'أغسطس': 'August', 'سبتمبر': 'September',
    'أكتوبر': 'October', 'نوفمبر': 'November', 'ديسمبر': 'December',
    // ── الأدوار / Roles ────────────────────────────────────────
    'مدير النظام': 'System Admin',
    'الرئيس التنفيذي': 'CEO',
    'مدير القسم': 'Dept. Manager',
    'موظف مستوى أول': 'Level 1 Employee',
    'مدير الخزينة': 'Treasury Manager',
    'رئيس القطاع': 'Sector Head',
    'مدير مالي': 'Finance Manager',
    'محاسب': 'Accountant',
    // ── وقت / Time ─────────────────────────────────────────────
    'دقيقة': 'minute',
    'ساعة': 'hour',
    'يوم': 'day',
    'أيام': 'days',
    'الآن': 'Now',
    'سنوياً': 'annually',
    // ── التفاصيل / Details ─────────────────────────────────────
    'تفاصيل المعاملة': 'Transaction Details',
    'تفاصيل الحجز': 'Reservation Details',
    'إضافة معاملة جديدة': 'Add New Transaction',
    'إضافة حجز جديد': 'Add New Reservation',
    'مراجعة الحجز': 'Review Reservation',
    'حجز جديد': 'New Reservation',
    'طلب جديد': 'New Request',
    'طلب شراء جديد': 'New Purchase Request',
    'المرفقات': 'Attachments',
    'إضافة مرفقات': 'Add Attachments',
    'لا توجد مرفقات': 'No attachments',
    'اختر ملفاً على الأقل': 'Select at least one file',
    'الحد الأقصى': 'Maximum',
    // ── الموازنة / Budget ─────────────────────────────────────
    'قيد المراجعة': 'Under Review',
    'إجمالي المبالغ المطلوبة': 'Total Requested Amounts',
    'إجمالي الحجوزات': 'Total Reservations',
    'معتمدة': 'Approved',
    'مرفوضة': 'Rejected',
    'المبلغ المطلوب': 'Requested Amount',
    'المبلغ المعتمد': 'Approved Amount',
    'متبقي الموازنة': 'Remaining Budget',
    'نسبة الاستخدام': 'Usage Rate',
    'الموازنة الأصلية': 'Original Budget',
    'الموازنة المستخدمة': 'Used Budget',
    'متاح من الموازنة': 'Available from Budget',
    'الاحتياطي': 'Reserve',
    // ── الإعدادات / Settings ──────────────────────────────────
    'بادئات الأرقام التلقائية': 'Auto Number Prefixes',
    'موقّعو أوامر الدفع': 'Payment Order Signatories',
    'إعدادات طلبات الشراء': 'Purchase Request Settings',
    'معلومات النظام': 'System Information',
    'إصدار': 'Version',
    'قاعدة البيانات': 'Database',
    'الهوية البصرية': 'Visual Identity',
    'بنود الموازنة': 'Budget Items',
    'أنواع المعاملات': 'Transaction Types',
    'إدارة الموظفين': 'Employee Management',
    'إضافة موظف': 'Add Employee',
    'تعديل موظف': 'Edit Employee',
    'كود البند': 'Item Code',
    'اسم البند': 'Item Name',
    // ── الملف الشخصي / Profile ────────────────────────────────
    'إجمالي المعاملات': 'Total Transactions',
    'قيد الإنجاز': 'In Progress',
    'تصعيدات': 'Escalations',
    'الخطابات': 'Letters',
    'انضم في': 'Joined',
    'آخر دخول': 'Last Login',
    'معلومات الحساب': 'Account Info',
    'تغيير كلمة المرور': 'Change Password',
  }
};

// ══════════════════════════════════════════════════════════════
//  دالة الترجمة الأساسية
// ══════════════════════════════════════════════════════════════

function tr(text) {
  if (text === null || text === undefined) return text;
  text = String(text);
  const lang = (typeof currentLang !== 'undefined') ? currentLang : 'ar';
  if (lang === 'ar') return text;
  return i18n.en[text] || text;
}

// ترجمة مع fallback للنص الأصلي + تسجيل المفقود
function trSafe(text, context) {
  const result = tr(text);
  if (result === text && (typeof currentLang !== 'undefined') && currentLang === 'en') {
    if (typeof console !== 'undefined' && /[\u0600-\u06FF]/.test(text)) {
      console.debug('[i18n] Missing EN translation:', JSON.stringify(text),
        context ? `(in: ${context})` : '');
    }
  }
  return result;
}

// ══════════════════════════════════════════════════════════════
//  ترجمة عنصر DOM واحد
// ══════════════════════════════════════════════════════════════

function translateElement(el) {
  if (!el || !el.textContent) return;
  const lang = (typeof currentLang !== 'undefined') ? currentLang : 'ar';
  const arText = el.getAttribute('data-ar-text') || el.textContent.trim();
  if (!arText) return;
  if (!el.getAttribute('data-ar-text')) el.setAttribute('data-ar-text', arText);
  el.textContent = lang === 'ar'
    ? (el.getAttribute('data-ar-text') || arText)
    : (i18n.en[arText] || arText);
}

// ══════════════════════════════════════════════════════════════
//  تطبيق الترجمة على الصفحة الحالية
// ══════════════════════════════════════════════════════════════

function applyI18nToCurrentPage() {
  const lang = (typeof currentLang !== 'undefined') ? currentLang : 'ar';

  // 1. data-i18n elements (from app-common translations)
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    const key = el.getAttribute('data-i18n');
    const val = (typeof translations !== 'undefined') && translations[lang] && translations[lang][key];
    if (val) el.textContent = val;
  });

  // 2. data-tr elements (direct text key)
  document.querySelectorAll('[data-tr]').forEach(function (el) {
    el.textContent = tr(el.getAttribute('data-tr'));
  });

  // 3. Status badges
  document.querySelectorAll(
    '.status-badge, .badge-status, [data-status], .pr-status-badge, ' +
    '.reservation-status, .stage-badge, .bsc-label, ' +
    '.uf-btn:not(.active), .priority-badge'
  ).forEach(translateElement);

  // 4. Table headers (th)
  document.querySelectorAll('th').forEach(function (th) {
    const t = th.textContent.trim();
    if (/[\u0600-\u06FF]/.test(t)) translateElement(th);
  });

  // 5. Placeholders
  document.querySelectorAll('[data-tr-placeholder]').forEach(function (el) {
    el.setAttribute('placeholder', tr(el.getAttribute('data-tr-placeholder')));
  });
  // Also translate existing placeholders directly
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(function (el) {
    const ph = el.getAttribute('placeholder');
    if (ph && /[\u0600-\u06FF]/.test(ph)) {
      if (!el.getAttribute('data-ar-placeholder')) {
        el.setAttribute('data-ar-placeholder', ph);
      }
      el.setAttribute('placeholder',
        lang === 'ar'
          ? el.getAttribute('data-ar-placeholder')
          : (i18n.en[el.getAttribute('data-ar-placeholder')] || el.getAttribute('data-ar-placeholder'))
      );
    }
  });

  // 6. Select options
  document.querySelectorAll('option').forEach(function (opt) {
    const t = opt.textContent.trim();
    if (/[\u0600-\u06FF]/.test(t)) {
      if (!opt.getAttribute('data-ar-text')) opt.setAttribute('data-ar-text', t);
      opt.textContent = lang === 'ar'
        ? opt.getAttribute('data-ar-text')
        : (i18n.en[opt.getAttribute('data-ar-text')] || opt.getAttribute('data-ar-text'));
    }
  });

  // 7. Fix table direction
  document.querySelectorAll('table').forEach(function (t) {
    t.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  });

  // 8. Fix sidebar & layout
  fixSidebarDirection(lang);

  // 9. Fix inputs direction
  document.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="number"]):not([type="date"]):not([type="time"]):not([type="email"]):not([type="tel"]), textarea').forEach(function (inp) {
    inp.style.direction = lang === 'ar' ? 'rtl' : 'ltr';
    inp.style.textAlign = lang === 'ar' ? 'right' : 'left';
  });

  // 10. Fix toast position
  const toast = document.getElementById('toast');
  if (toast) {
    toast.style.right = lang === 'ar' ? '1.5rem' : 'auto';
    toast.style.left = lang === 'ar' ? 'auto' : '1.5rem';
  }
}

// ══════════════════════════════════════════════════════════════
//  إصلاح السايدبار
// ══════════════════════════════════════════════════════════════

function fixSidebarDirection(lang) {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main-content');
  const toggle = document.getElementById('sidebarToggle');
  if (!sidebar) return;

  const isRTL = lang === 'ar';
  const collapsed = sidebar.classList.contains('collapsed');
  const cssVar = collapsed ? '--sidebar-collapsed' : '--sidebar-width';
  const w = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || '240px';

  if (isRTL) {
    sidebar.style.cssText += ';right:0!important;left:auto!important';
    if (main) { main.style.marginRight = w; main.style.marginLeft = '0'; }
    if (toggle) { toggle.style.right = `calc(${w} - 14px)`; toggle.style.left = 'auto'; }
  } else {
    sidebar.style.cssText += ';left:0!important;right:auto!important';
    if (main) { main.style.marginLeft = w; main.style.marginRight = '0'; }
    if (toggle) { toggle.style.left = `calc(${w} - 14px)`; toggle.style.right = 'auto'; }
  }
}

// ══════════════════════════════════════════════════════════════
//  MutationObserver — يترجم كل HTML جديد تلقائياً
// ══════════════════════════════════════════════════════════════

const _i18nObserver = new MutationObserver(function (mutations) {
  let hasNew = mutations.some(m => m.addedNodes.length > 0);
  if (!hasNew) return;

  clearTimeout(window._i18nTimer);
  window._i18nTimer = setTimeout(function () {
    const lang = (typeof currentLang !== 'undefined') ? currentLang : 'ar';
    if (lang === 'ar') {
      // في العربية: فقط إصلاح الاتجاه
      fixSidebarDirection('ar');
      return;
    }
    applyI18nToCurrentPage();
  }, 60);
});

// ══════════════════════════════════════════════════════════════
//  تكامل مع app-common.js
// ══════════════════════════════════════════════════════════════

(function patchCommon() {
  const _origApply = window.applyLanguage;
  window.applyLanguage = function () {
    if (typeof _origApply === 'function') _origApply();
    const lang = (typeof currentLang !== 'undefined') ? currentLang : 'ar';
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    applyI18nToCurrentPage();
  };

  const _origInit = window.initLanguage;
  window.initLanguage = function () {
    if (typeof _origInit === 'function') _origInit();
    applyI18nToCurrentPage();
  };
})();

// ══════════════════════════════════════════════════════════════
//  تشغيل عند جاهزية DOM
// ══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function () {
  const main = document.getElementById('main-content');
  if (main) _i18nObserver.observe(main, { childList: true, subtree: true });
  applyI18nToCurrentPage();
});

// ── Exports ─────────────────────────────────────────────────
window.tr = tr;
window.trSafe = trSafe;
window.i18n = i18n;
window.translateElement = translateElement;
window.applyI18nToCurrentPage = applyI18nToCurrentPage;
window.fixSidebarDirection = fixSidebarDirection;