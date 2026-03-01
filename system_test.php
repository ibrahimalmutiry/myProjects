<?php
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 


 * ═══════════════════════════════════════════════════════════════════════════════
 */

declare(strict_types=1);

// ─── إعداد البيئة ──────────────────────────────────────────────────────────────
define('TEST_VERSION',    '2.0.0');
define('TEST_START_TIME', microtime(true));
define('RUNNING_CLI',     PHP_SAPI === 'cli');
date_default_timezone_set('Asia/Riyadh');

// ─── ⚙ إعدادات قاعدة البيانات — عدّل هنا ──────────────────────────────────────
define('DB_HOST',    'localhost');
define('DB_NAME',    'workflow_system');
define('DB_USER',    'root');
define('DB_PASS',    '');
define('DB_CHARSET', 'utf8mb4');

// ─── ثوابت SLA/OLA (بالدقائق) ──────────────────────────────────────────────────
define('SLA_RECEIVING', 60);    // وقت SLA مرحلة الاستلام
define('SLA_BUDGET',    120);   // وقت SLA مرحلة الموازنة
define('SLA_PAYMENT',   180);   // وقت SLA مرحلة الدفع
define('SLA_INVOICE',   60);    // وقت SLA مرحلة الفوترة
define('OLA_RESPONSE',  30);    // وقت OLA الداخلي

// ─── الأدوار المعتمدة ──────────────────────────────────────────────────────────
const VALID_ROLES          = ['admin','receiver','budget','payment','invoice'];
const VALID_ALERT_TYPES    = ['انتظار','عاجل','متابعة'];
const VALID_PAYMENT_METHODS = ['نقدي','تحويل بنكي','شيك'];
const VALID_RECEIVE_STATUS  = ['معلق','مستلم','مرفوض'];
const VALID_BUDGET_STATUS   = ['معلق','قيد المراجعة','معتمد','مرفوض'];
const VALID_PAYMENT_STATUS  = ['معلق','قيد المراجعة','تم الدفع','ملغي'];
const VALID_INVOICE_STATUS  = ['قيد الإصدار','صدرت الفاتورة','ملغاة'];

// ─── تعريف جداول النظام الإلزامية مع أعمدتها ──────────────────────────────────
const SYSTEM_TABLES = [
    'employees'                        => ['critical'=>true,  'cols'=>['id','employee_number','name','email','phone','role','password','is_registered','is_active','last_login','created_at','updated_at']],
    'transaction_types'                => ['critical'=>true,  'cols'=>['id','name','description','is_active','created_at']],
    'transactions'                     => ['critical'=>true,  'cols'=>['id','transaction_number','transaction_date','type_id','description','amount','attachment','attachment_name','created_by','created_at','updated_at']],
    'receiving_data'                   => ['critical'=>true,  'cols'=>['id','transaction_id','employee_id','receive_date','status','notes','created_at','updated_at']],
    'budget_data'                      => ['critical'=>true,  'cols'=>['id','transaction_id','employee_id','review_date','budget_status','budget_code','notes','created_at','updated_at']],
    'payment_data'                     => ['critical'=>true,  'cols'=>['id','transaction_id','employee_id','payment_date','payment_method','status','reference_number','notes','created_at','updated_at']],
    'invoice_data'                     => ['critical'=>true,  'cols'=>['id','transaction_id','employee_id','invoice_number','invoice_date','status','alert_type','notes','created_at','updated_at']],
    'stage_times'                      => ['critical'=>true,  'cols'=>['id','transaction_id','stage','employee_id','started_at','received_at','completed_at','waiting_minutes','ola_minutes','duration_minutes','escalated_at','post_escalation_minutes','status','created_at','updated_at']],
    'activity_log'                     => ['critical'=>false, 'cols'=>['id','transaction_id','action','details','created_at']],
    'transaction_events'               => ['critical'=>false, 'cols'=>['id','transaction_id','stage','employee_id','action','old_status','new_status','notes','event_time','duration_from_previous','created_at']],
    'departments'                      => ['critical'=>false, 'cols'=>['id','name','code','description','manager_id','parent_id','is_active','created_at','updated_at']],
    'correspondence'                   => ['critical'=>false, 'cols'=>['id','correspondence_number','correspondence_date','type','category','subject','content','from_department_id','to_department_id','from_external','to_external','priority','deadline_date','is_draft','current_stage','created_by','created_at','updated_at']],
    'correspondence_stages'            => ['critical'=>false, 'cols'=>['id','correspondence_id','stage_name','stage_order','status','assigned_to','started_at','completed_at','notes','created_at']],
    'correspondence_workflow_templates'=> ['critical'=>false, 'cols'=>['id','correspondence_type','stage_name','stage_order','required_role','is_active','created_at']],
    'correspondence_attachments'       => ['critical'=>false, 'cols'=>['id','correspondence_id','file_name','original_name','file_path','file_type','file_size','uploaded_by','uploaded_at']],
    'correspondence_templates'         => ['critical'=>false, 'cols'=>['id','template_name','correspondence_type','subject_template','content_template','is_public','usage_count','created_by','created_at']],
    'correspondence_audit_log'         => ['critical'=>false, 'cols'=>['id','correspondence_id','employee_id','action','old_value','new_value','description','ip_address','user_agent','created_at']],
];

// ─── Views المطلوبة ─────────────────────────────────────────────────────────────
const SYSTEM_VIEWS = ['v_full_transactions'];

// ═══════════════════════════════════════════════════════════════════════════════
//  ████  محرك الاختبار  ████
// ═══════════════════════════════════════════════════════════════════════════════
class TestEngine
{
    private array   $results  = [];
    private int     $passed   = 0;
    private int     $failed   = 0;
    private int     $warnings = 0;
    private int     $info     = 0;
    private ?mysqli $db       = null;
    private string  $suite;

    private const C = [
        'pass'  => "\033[1;32m", 'fail'  => "\033[1;31m",
        'warn'  => "\033[1;33m", 'info'  => "\033[1;34m",
        'head'  => "\033[1;36m", 'reset' => "\033[0m",
    ];

    public function __construct(string $suite = 'all')
    {
        $this->suite = strtolower(trim($suite));
    }

    // ── الاتصال بقاعدة البيانات ───────────────────────────────────────────────
    public function connect(): bool
    {
        $conn = @new mysqli(DB_HOST, DB_USER, DB_PASS);
        if ($conn->connect_error) {
            $this->log('DB_CONNECT','🔌 الاتصال','الاتصال بخادم MySQL','fail',
                'تعذّر الاتصال: '.$conn->connect_error,
                'تأكد من تشغيل MySQL وصحة إعدادات DB_HOST / DB_USER / DB_PASS أعلى الملف');
            return false;
        }
        $conn->set_charset(DB_CHARSET);
        $dbRes = $conn->query("SHOW DATABASES LIKE '".DB_NAME."'");
        if (!$dbRes || $dbRes->num_rows === 0) {
            $this->log('DB_EXISTS','🔌 الاتصال','وجود قاعدة البيانات: '.DB_NAME,'fail',
                'القاعدة غير موجودة',
                'CREATE DATABASE IF NOT EXISTS `'.DB_NAME.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
            $conn->close();
            return false;
        }
        $conn->select_db(DB_NAME);
        $this->log('DB_CONNECT','🔌 الاتصال','الاتصال بخادم MySQL','pass','MySQL '.$conn->server_info);
        $this->log('DB_EXISTS','🔌 الاتصال','وجود قاعدة البيانات: '.DB_NAME,'pass','متاحة');
        $this->db = $conn;
        return true;
    }

    // ── تسجيل نتيجة اختبار ───────────────────────────────────────────────────
    public function log(string $id, string $suite, string $name, string $status, string $detail='', string $fix=''): void
    {
        match($status){
            'pass' => $this->passed++,
            'fail' => $this->failed++,
            'warn' => $this->warnings++,
            default=> $this->info++,
        };
        $this->results[] = compact('id','suite','name','status','detail','fix')
            + ['ms' => round((microtime(true)-TEST_START_TIME)*1000,1)];
    }

    private function rowCount(string $t): int
    {
        $r = @$this->db->query("SELECT COUNT(*) AS c FROM `$t`");
        return $r ? (int)$r->fetch_assoc()['c'] : 0;
    }
    private function tblExists(string $t): bool
    {
        $r = @$this->db->query("SHOW TABLES LIKE '$t'");
        return $r && $r->num_rows > 0;
    }
    private function cols(string $t): array
    {
        $r = @$this->db->query("SHOW COLUMNS FROM `$t`");
        $out = [];
        if($r) while($row=$r->fetch_assoc()) $out[]=$row['Field'];
        return $out;
    }
    private function q(string $sql): mysqli_result|bool
    {
        return @$this->db->query($sql);
    }
    private function val(string $sql): mixed
    {
        $r = $this->q($sql);
        if(!$r) return null;
        $row = $r->fetch_row();
        return $row[0] ?? null;
    }

    // ════════════════════════════════════════════════════════════════════════════
    // §1  توافق قاعدة البيانات والجداول
    // ════════════════════════════════════════════════════════════════════════════
    public function testDatabase(): void
    {
        if($this->suite!=='all' && $this->suite!=='db') return;
        if(!$this->db) return;

        // ── ترميز القاعدة ──────────────────────────────────────────────────
        $cs = $this->val("SELECT DEFAULT_CHARACTER_SET_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='".DB_NAME."'") ?? 'unknown';
        if($cs==='utf8mb4'){
            $this->log('DB_CHARSET','🗄️ قاعدة البيانات','ترميز القاعدة (utf8mb4)','pass',$cs);
        } else {
            $this->log('DB_CHARSET','🗄️ قاعدة البيانات','ترميز القاعدة (utf8mb4)','warn',"الترميز الحالي: $cs",
                'ALTER DATABASE `'.DB_NAME.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;');
        }

        // ── جرد الجداول والـ Views الموجودة ────────────────────────────────
        $allRes = $this->q("SHOW FULL TABLES");
        $existTables = []; $existViews = [];
        if($allRes) while($row=$allRes->fetch_row()){
            if($row[1]==='VIEW') $existViews[]=$row[0];
            else $existTables[]=$row[0];
        }

        // ── فحص كل جدول مطلوب ─────────────────────────────────────────────
        foreach(SYSTEM_TABLES as $tbl=>$cfg){
            if(!in_array($tbl,$existTables)){
                $sev = $cfg['critical'] ? 'fail' : 'warn';
                $this->log("TBL_$tbl",'🗄️ قاعدة البيانات',"وجود جدول: $tbl",$sev,
                    'الجدول غير موجود',
                    "راجع db_diagnostic.php لكود CREATE TABLE `$tbl`");
                continue;
            }
            $cnt = $this->rowCount($tbl);
            $this->log("TBL_$tbl",'🗄️ قاعدة البيانات',"وجود جدول: $tbl",'pass',number_format($cnt).' صف');
            // فحص الأعمدة
            $excols = $this->cols($tbl);
            foreach($cfg['cols'] as $col){
                if(!in_array($col,$excols)){
                    $this->log("COL_{$tbl}_$col",'🗄️ قاعدة البيانات',"عمود `$col` في `$tbl`",'warn',
                        'العمود غير موجود',
                        "ALTER TABLE `$tbl` ADD COLUMN `$col` ...  ← راجع db_diagnostic.php");
                }
            }
        }

        // ── Views المطلوبة ────────────────────────────────────────────────
        foreach(SYSTEM_VIEWS as $v){
            if(!in_array($v,$existViews)){
                $this->log("VIEW_$v",'🗄️ قاعدة البيانات',"View: $v",'fail',
                    'غير موجود',
                    'راجع functions.php::ensureViewExists() لكود الإنشاء');
            } else {
                $test = $this->q("SELECT 1 FROM `$v` LIMIT 1");
                if($test!==false){
                    $this->log("VIEW_$v",'🗄️ قاعدة البيانات',"View: $v",'pass','يعمل بشكل صحيح');
                } else {
                    $this->log("VIEW_$v",'🗄️ قاعدة البيانات',"View: $v",'fail',
                        'موجود لكن يُرجع خطأ: '.$this->db->error,
                        'احذف وأعد إنشاء الـ View من functions.php::ensureViewExists()');
                }
            }
        }

        // ── الجداول غير المرتبطة بالنظام (Orphan Tables) ─────────────────
        $known   = array_keys(SYSTEM_TABLES);
        $orphans = array_diff($existTables,$known);
        if(empty($orphans)){
            $this->log('ORPHAN_TABLES','🗄️ قاعدة البيانات','جداول غير مُعرَّفة في النظام','pass',
                'لا توجد جداول خارجة عن تعريف النظام');
        } else {
            foreach($orphans as $o){
                $cnt  = $this->rowCount($o);
                $hint = $cnt===0
                    ? "فارغ — يمكن حذفه: DROP TABLE `$o`;"
                    : "يحتوي $cnt صف — راجع ارتباطه أو أضفه لـ SYSTEM_TABLES";
                $this->log("ORPHAN_$o",'🗄️ قاعدة البيانات',"جدول غير مُعرَّف: $o",'warn',"$cnt صف",$hint);
            }
        }

        // ── سلامة المفاتيح الخارجية (Referential Integrity) ─────────────
        $fks = [
            ['c'=>'transactions','fk'=>'type_id',       'p'=>'transaction_types','pk'=>'id'],
            ['c'=>'transactions','fk'=>'created_by',    'p'=>'employees',        'pk'=>'id'],
            ['c'=>'receiving_data','fk'=>'transaction_id','p'=>'transactions',   'pk'=>'id'],
            ['c'=>'budget_data',  'fk'=>'transaction_id','p'=>'transactions',    'pk'=>'id'],
            ['c'=>'payment_data', 'fk'=>'transaction_id','p'=>'transactions',    'pk'=>'id'],
            ['c'=>'invoice_data', 'fk'=>'transaction_id','p'=>'transactions',    'pk'=>'id'],
            ['c'=>'stage_times',  'fk'=>'transaction_id','p'=>'transactions',    'pk'=>'id'],
            ['c'=>'transaction_events','fk'=>'transaction_id','p'=>'transactions','pk'=>'id'],
            ['c'=>'activity_log','fk'=>'transaction_id','p'=>'transactions',     'pk'=>'id'],
        ];
        foreach($fks as $fk){
            if(!$this->tblExists($fk['c'])||!$this->tblExists($fk['p'])) continue;
            $orphCnt = (int)$this->val(
                "SELECT COUNT(*) FROM `{$fk['c']}` ch
                 LEFT JOIN `{$fk['p']}` p ON ch.`{$fk['fk']}`=p.`{$fk['pk']}`
                 WHERE p.`{$fk['pk']}` IS NULL AND ch.`{$fk['fk']}` IS NOT NULL");
            $lid = "FK_{$fk['c']}_{$fk['fk']}";
            if($orphCnt===0){
                $this->log($lid,'🗄️ قاعدة البيانات',"سلامة FK: {$fk['c']}.{$fk['fk']} → {$fk['p']}",'pass','لا سجلات يتيمة');
            } else {
                $this->log($lid,'🗄️ قاعدة البيانات',"سلامة FK: {$fk['c']}.{$fk['fk']} → {$fk['p']}",'fail',
                    "$orphCnt سجل يتيم (Orphan Record)",
                    "DELETE FROM `{$fk['c']}` WHERE `{$fk['fk']}` NOT IN (SELECT `{$fk['pk']}` FROM `{$fk['p']}`) AND `{$fk['fk']}` IS NOT NULL;");
            }
        }

        // ── البيانات الأساسية ──────────────────────────────────────────────
        $seeds=[['t'=>'employees','min'=>1,'lbl'=>'موظفون'],['t'=>'transaction_types','min'=>3,'lbl'=>'أنواع'],['t'=>'departments','min'=>1,'lbl'=>'أقسام']];
        foreach($seeds as $s){
            if(!$this->tblExists($s['t'])) continue;
            $c=$this->rowCount($s['t']);
            if($c>=$s['min']){
                $this->log("SEED_{$s['t']}",'🗄️ قاعدة البيانات',"بيانات أساسية: {$s['t']}",'pass',"$c {$s['lbl']}");
            } else {
                $this->log("SEED_{$s['t']}",'🗄️ قاعدة البيانات',"بيانات أساسية: {$s['t']}",'warn',
                    "يحتوي $c سجل فقط (المطلوب ≥ {$s['min']})",
                    'أدخل البيانات الأساسية من db_diagnostic.php → قسم REQUIRED_DATA');
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // §2  نظام الصلاحيات والإجراءات
    // ════════════════════════════════════════════════════════════════════════════
    public function testPermissions(): void
    {
        if($this->suite!=='all' && $this->suite!=='permissions') return;
        if(!$this->db || !$this->tblExists('employees')) return;

        // ── ENUM أعمدة الدور ───────────────────────────────────────────────
        $colInfo = $this->q("SHOW COLUMNS FROM employees WHERE Field='role'")?->fetch_assoc();
        if(!$colInfo){
            $this->log('PERM_ROLE_COL','🔐 الصلاحيات',"عمود 'role' في employees",'fail','العمود غير موجود');
            return;
        }
        $enumStr = $colInfo['Type']??'';
        foreach(VALID_ROLES as $role){
            if(str_contains($enumStr,"'$role'")){
                $this->log("PERM_ENUM_$role",'🔐 الصلاحيات',"الدور '$role' في ENUM",'pass',$enumStr);
            } else {
                $this->log("PERM_ENUM_$role",'🔐 الصلاحيات',"الدور '$role' في ENUM",'fail',
                    "غير موجود في: $enumStr",
                    "ALTER TABLE employees MODIFY role ENUM('admin','receiver','budget','payment','invoice') NOT NULL;");
            }
        }

        // ── موظف نشط لكل دور ──────────────────────────────────────────────
        foreach(VALID_ROLES as $role){
            $c=(int)($this->val("SELECT COUNT(*) FROM employees WHERE role='$role' AND is_active=1")??0);
            if($c>0){
                $this->log("PERM_EMP_$role",'🔐 الصلاحيات',"موظف نشط بدور '$role'",'pass',"$c موظف");
            } else {
                $this->log("PERM_EMP_$role",'🔐 الصلاحيات',"موظف نشط بدور '$role'",'warn',
                    'لا يوجد موظف نشط بهذا الدور',
                    "INSERT INTO employees (name,role,is_active,is_registered) VALUES ('موظف $role','$role',1,1);");
            }
        }

        // ── تطابق الدور مع المرحلة ────────────────────────────────────────
        $map=[
            'receiving'=>['tbl'=>'receiving_data','role'=>'receiver'],
            'budget'   =>['tbl'=>'budget_data',   'role'=>'budget'],
            'payment'  =>['tbl'=>'payment_data',  'role'=>'payment'],
            'invoice'  =>['tbl'=>'invoice_data',  'role'=>'invoice'],
        ];
        foreach($map as $stage=>$m){
            if(!$this->tblExists($m['tbl'])) continue;
            $bad=(int)($this->val(
                "SELECT COUNT(*) FROM `{$m['tbl']}` s
                 JOIN employees e ON s.employee_id=e.id
                 WHERE e.role NOT IN ('{$m['role']}','admin') AND s.employee_id IS NOT NULL")??0);
            if($bad===0){
                $this->log("PERM_STAGE_$stage",'🔐 الصلاحيات',"تطابق دور موظف مرحلة '$stage'",'pass','جميع السجلات صحيحة');
            } else {
                $this->log("PERM_STAGE_$stage",'🔐 الصلاحيات',"تطابق دور موظف مرحلة '$stage'",'warn',
                    "$bad سجل له employee_id بدور غير متوقع",
                    "SELECT * FROM `{$m['tbl']}` s JOIN employees e ON s.employee_id=e.id WHERE e.role NOT IN ('{$m['role']}','admin');");
            }
        }

        // ── كلمات المرور ──────────────────────────────────────────────────
        $noPass=(int)($this->val("SELECT COUNT(*) FROM employees WHERE (password IS NULL OR password='') AND is_active=1")??0);
        if($noPass===0){
            $this->log('PERM_PASSWORD','🔐 الصلاحيات','كلمات مرور الموظفين النشطين','pass','جميعهم لديهم كلمة مرور');
        } else {
            $this->log('PERM_PASSWORD','🔐 الصلاحيات','كلمات مرور الموظفين النشطين','warn',
                "$noPass موظف نشط بدون كلمة مرور",
                'اطلب منهم إكمال التسجيل الأول لتعيين كلمة المرور');
        }

        // ── is_registered ─────────────────────────────────────────────────
        $unreg=(int)($this->val("SELECT COUNT(*) FROM employees WHERE is_registered=0 AND is_active=1")??0);
        $this->log('PERM_UNREG','🔐 الصلاحيات','موظفون نشطون لم يُكملوا التسجيل','info',
            "$unreg موظف",
            $unreg>0?'لن يتمكنوا من الدخول حتى يُكملوا تعيين كلمة المرور':'');
    }

    // ════════════════════════════════════════════════════════════════════════════
    // §3  نظام SLA / OLA وحساب الزمن
    // ════════════════════════════════════════════════════════════════════════════
    public function testSLA(): void
    {
        if($this->suite!=='all' && $this->suite!=='sla') return;
        if(!$this->db) return;
        if(!$this->tblExists('stage_times')){
            $this->log('SLA_TABLE','⏱️ SLA/OLA','وجود جدول stage_times','fail',
                'الجدول مفقود — قياس SLA مستحيل',
                'راجع functions.php::ensureStageTimesTable()');
            return;
        }

        // ── أعمدة SLA الأساسية ────────────────────────────────────────────
        $slaCols=['started_at','received_at','completed_at','waiting_minutes','ola_minutes','duration_minutes','escalated_at','post_escalation_minutes'];
        $excols  = $this->cols('stage_times');
        foreach($slaCols as $col){
            if(in_array($col,$excols)){
                $this->log("SLA_COL_$col",'⏱️ SLA/OLA',"عمود SLA: $col",'pass','موجود');
            } else {
                $this->log("SLA_COL_$col",'⏱️ SLA/OLA',"عمود SLA: $col",'warn','غير موجود',
                    "ALTER TABLE stage_times ADD COLUMN $col ... ← functions.php::ensureStageTimesTable()");
            }
        }

        // ── دقة duration_minutes ──────────────────────────────────────────
        $bad=(int)($this->val(
            "SELECT COUNT(*) FROM stage_times
             WHERE started_at IS NOT NULL AND completed_at IS NOT NULL
               AND duration_minutes IS NOT NULL
               AND ABS(TIMESTAMPDIFF(MINUTE,started_at,completed_at)-duration_minutes)>2")??0);
        if($bad===0){
            $this->log('SLA_DUR_ACC','⏱️ SLA/OLA','دقة حساب duration_minutes','pass','جميع القيم متطابقة');
        } else {
            $this->log('SLA_DUR_ACC','⏱️ SLA/OLA','دقة حساب duration_minutes','fail',
                "$bad سجل بفارق > 2 دقيقة",
                "UPDATE stage_times SET duration_minutes=TIMESTAMPDIFF(MINUTE,started_at,completed_at) WHERE started_at IS NOT NULL AND completed_at IS NOT NULL;");
        }

        // ── دقة ola_minutes ───────────────────────────────────────────────
        if(in_array('ola_minutes',$excols)&&in_array('received_at',$excols)){
            $badOla=(int)($this->val(
                "SELECT COUNT(*) FROM stage_times
                 WHERE received_at IS NOT NULL AND completed_at IS NOT NULL
                   AND ola_minutes IS NOT NULL
                   AND ABS(TIMESTAMPDIFF(MINUTE,received_at,completed_at)-ola_minutes)>2")??0);
            if($badOla===0){
                $this->log('SLA_OLA_ACC','⏱️ SLA/OLA','دقة حساب ola_minutes','pass','جميع قيم OLA صحيحة');
            } else {
                $this->log('SLA_OLA_ACC','⏱️ SLA/OLA','دقة حساب ola_minutes','warn',
                    "$badOla سجل بقيمة ola_minutes غير دقيقة",
                    "UPDATE stage_times SET ola_minutes=TIMESTAMPDIFF(MINUTE,received_at,completed_at) WHERE received_at IS NOT NULL AND completed_at IS NOT NULL;");
            }
        }

        // ── خطأ منطقي: completed_at < started_at ─────────────────────────
        $logic=(int)($this->val("SELECT COUNT(*) FROM stage_times WHERE completed_at<started_at")??0);
        if($logic===0){
            $this->log('SLA_LOGIC','⏱️ SLA/OLA','اتساق الأوقات (completed ≥ started)','pass','لا أخطاء منطقية');
        } else {
            $this->log('SLA_LOGIC','⏱️ SLA/OLA','اتساق الأوقات (completed ≥ started)','fail',
                "$logic سجل به completed_at أقدم من started_at",
                "SELECT * FROM stage_times WHERE completed_at<started_at;  ← صحّح يدوياً");
        }

        // ── انتهاكات SLA لكل مرحلة ────────────────────────────────────────
        $limits=['receiving'=>SLA_RECEIVING,'budget'=>SLA_BUDGET,'payment'=>SLA_PAYMENT,'invoice'=>SLA_INVOICE];
        foreach($limits as $stage=>$lim){
            $cnt=(int)($this->val(
                "SELECT COUNT(*) FROM stage_times
                 WHERE stage='$stage' AND completed_at IS NULL AND started_at IS NOT NULL
                   AND TIMESTAMPDIFF(MINUTE,started_at,NOW())>$lim")??0);
            if($cnt===0){
                $this->log("SLA_$stage",'⏱️ SLA/OLA',"SLA مرحلة '$stage' (≤ $lim دقيقة)",'pass','لا انتهاكات نشطة');
            } else {
                $this->log("SLA_$stage",'⏱️ SLA/OLA',"SLA مرحلة '$stage' (≤ $lim دقيقة)",'warn',
                    "$cnt معاملة تجاوزت حد SLA",
                    "SELECT t.transaction_number,TIMESTAMPDIFF(MINUTE,st.started_at,NOW()) AS elapsed FROM stage_times st JOIN transactions t ON t.id=st.transaction_id WHERE st.stage='$stage' AND st.completed_at IS NULL AND TIMESTAMPDIFF(MINUTE,st.started_at,NOW())>$lim;");
            }
        }

        // ── OLA انتهاكات ──────────────────────────────────────────────────
        $olaB=(int)($this->val(
            "SELECT COUNT(*) FROM stage_times
             WHERE completed_at IS NULL AND received_at IS NOT NULL
               AND TIMESTAMPDIFF(MINUTE,received_at,NOW())>".OLA_RESPONSE)??0);
        if($olaB===0){
            $this->log('OLA_BREACH','⏱️ SLA/OLA','OLA وقت الاستجابة (≤ '.OLA_RESPONSE.' دقيقة)','pass','لا انتهاكات OLA نشطة');
        } else {
            $this->log('OLA_BREACH','⏱️ SLA/OLA','OLA وقت الاستجابة (≤ '.OLA_RESPONSE.' دقيقة)','warn',
                "$olaB مرحلة تجاوزت OLA",'أرسل تذكيراً للموظفين المسؤولين');
        }

        // ── مراحل بدون started_at ─────────────────────────────────────────
        $noStart=(int)($this->val("SELECT COUNT(*) FROM stage_times WHERE started_at IS NULL")??0);
        if($noStart===0){
            $this->log('SLA_NOSTART','⏱️ SLA/OLA','مراحل بدون وقت بدء','pass','جميع المراحل لها started_at');
        } else {
            $this->log('SLA_NOSTART','⏱️ SLA/OLA','مراحل بدون وقت بدء','warn',
                "$noStart سجل بـ started_at = NULL",
                "UPDATE stage_times SET started_at=created_at WHERE started_at IS NULL;");
        }

        // ── إحصاء تحليلي ──────────────────────────────────────────────────
        $distRes=$this->q("SELECT stage,COUNT(*) AS t,ROUND(AVG(duration_minutes),1) AS avg,MAX(duration_minutes) AS mx,MIN(duration_minutes) AS mn FROM stage_times WHERE duration_minutes IS NOT NULL GROUP BY stage");
        if($distRes) while($r=$distRes->fetch_assoc()){
            $this->log("SLA_STAT_{$r['stage']}",'⏱️ SLA/OLA',"إحصاء زمني: '{$r['stage']}'",'info',
                "المجموع: {$r['t']} | متوسط: {$r['avg']}د | أقصى: {$r['mx']}د | أدنى: {$r['mn']}د");
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // §4  نظام المعاملات المالية
    // ════════════════════════════════════════════════════════════════════════════
    public function testFinance(): void
    {
        if($this->suite!=='all' && $this->suite!=='finance') return;
        if(!$this->db||!$this->tblExists('transactions')) return;

        // ── إحصاء عام ────────────────────────────────────────────────────
        $r=$this->q("SELECT COUNT(*) AS c,COALESCE(SUM(amount),0) AS s FROM transactions")?->fetch_assoc();
        $this->log('FIN_TOTAL','💰 المعاملات المالية','إجمالي المعاملات','info',
            number_format((int)$r['c']).' معاملة | '.number_format((float)$r['s'],2).' ر.س');

        // ── مبالغ ≤ 0 ────────────────────────────────────────────────────
        $neg=(int)($this->val("SELECT COUNT(*) FROM transactions WHERE amount<=0")??0);
        if($neg===0){
            $this->log('FIN_AMOUNTS','💰 المعاملات المالية','صحة المبالغ (> 0)','pass','لا مبالغ سالبة أو صفرية');
        } else {
            $this->log('FIN_AMOUNTS','💰 المعاملات المالية','صحة المبالغ (> 0)','warn',
                "$neg معاملة بمبلغ ≤ 0",
                "SELECT id,transaction_number,amount FROM transactions WHERE amount<=0;");
        }

        // ── معاملات بدون نوع ─────────────────────────────────────────────
        $nt=(int)($this->val("SELECT COUNT(*) FROM transactions WHERE type_id IS NULL")??0);
        if($nt===0){
            $this->log('FIN_TYPE','💰 المعاملات المالية','ربط المعاملات بنوع','pass','جميع المعاملات لها نوع');
        } else {
            $this->log('FIN_TYPE','💰 المعاملات المالية','ربط المعاملات بنوع','warn',
                "$nt معاملة بدون type_id",
                "SELECT id,transaction_number FROM transactions WHERE type_id IS NULL;");
        }

        // ── معاملات بدون created_by ───────────────────────────────────────
        $nc=(int)($this->val("SELECT COUNT(*) FROM transactions WHERE created_by IS NULL")??0);
        if($nc===0){
            $this->log('FIN_CREATOR','💰 المعاملات المالية','ربط المعاملات بمنشئ','pass','جميع المعاملات لها created_by');
        } else {
            $this->log('FIN_CREATOR','💰 المعاملات المالية','ربط المعاملات بمنشئ','warn',
                "$nc معاملة بدون created_by",
                "SELECT id,transaction_number FROM transactions WHERE created_by IS NULL;");
        }

        // ── تكرار transaction_number ─────────────────────────────────────
        $dup=(int)($this->val("SELECT COUNT(*) FROM (SELECT transaction_number,COUNT(*) AS d FROM transactions GROUP BY transaction_number HAVING d>1) AS x")??0);
        if($dup===0){
            $this->log('FIN_UNIQUE','💰 المعاملات المالية','تفرّد أرقام المعاملات','pass','جميع الأرقام فريدة');
        } else {
            $this->log('FIN_UNIQUE','💰 المعاملات المالية','تفرّد أرقام المعاملات','fail',
                "$dup رقم معاملة مكرر",
                "SELECT transaction_number,COUNT(*) FROM transactions GROUP BY transaction_number HAVING COUNT(*)>1;");
        }

        // ── صحة حالات الدفع ───────────────────────────────────────────────
        if($this->tblExists('payment_data')){
            $vs="'".implode("','",VALID_PAYMENT_STATUS)."'";
            $bp=(int)($this->val("SELECT COUNT(*) FROM payment_data WHERE status NOT IN ($vs) AND status IS NOT NULL")??0);
            if($bp===0){
                $this->log('FIN_PAY_STATUS','💰 المعاملات المالية','صحة قيم حالة الدفع','pass','جميع القيم معتمدة');
            } else {
                $this->log('FIN_PAY_STATUS','💰 المعاملات المالية','صحة قيم حالة الدفع','warn',
                    "$bp سجل بحالة غير معرّفة",
                    "SELECT DISTINCT status FROM payment_data WHERE status NOT IN ($vs);");
            }

            // ── طريقة الدفع عند الإكمال ───────────────────────────────────
            $vm="'".implode("','",VALID_PAYMENT_METHODS)."'";
            $bm=(int)($this->val("SELECT COUNT(*) FROM payment_data WHERE status='تم الدفع' AND (payment_method IS NULL OR payment_method NOT IN ($vm))")??0);
            if($bm===0){
                $this->log('FIN_PAY_METHOD','💰 المعاملات المالية','طريقة الدفع عند الإكمال','pass','جميع المدفوعات المكتملة لها طريقة صحيحة');
            } else {
                $this->log('FIN_PAY_METHOD','💰 المعاملات المالية','طريقة الدفع عند الإكمال','warn',
                    "$bm دفعة مكتملة بدون طريقة دفع صحيحة",
                    "SELECT id,transaction_id,payment_method FROM payment_data WHERE status='تم الدفع' AND payment_method NOT IN ($vm);");
            }

            // ── ملخص مالي ─────────────────────────────────────────────────
            $fs=$this->q(
                "SELECT COALESCE(SUM(CASE WHEN p.status='تم الدفع' THEN t.amount ELSE 0 END),0) AS paid,
                        COALESCE(SUM(CASE WHEN p.status='معلق'     THEN t.amount ELSE 0 END),0) AS pending,
                        COALESCE(SUM(CASE WHEN p.status='ملغي'     THEN t.amount ELSE 0 END),0) AS cancelled
                 FROM transactions t LEFT JOIN payment_data p ON t.id=p.transaction_id"
            )?->fetch_assoc();
            if($fs) $this->log('FIN_SUMMARY','💰 المعاملات المالية','ملخص مالي إجمالي','info',
                'مدفوع: '.number_format((float)$fs['paid'],2).' ر.س  |  معلق: '.number_format((float)$fs['pending'],2).' ر.س  |  ملغي: '.number_format((float)$fs['cancelled'],2).' ر.س');
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // §5  ربط مراحل سير العمل (الحجوزات وتدفق المعاملات)
    // ════════════════════════════════════════════════════════════════════════════
    public function testWorkflowLinkage(): void
    {
        if($this->suite!=='all' && $this->suite!=='finance') return;
        if(!$this->db) return;

        // ── كل معاملة لها سجل في المراحل الأربع ─────────────────────────
        $stages=[
            ['tbl'=>'receiving_data','lbl'=>'الاستلام'],
            ['tbl'=>'budget_data',   'lbl'=>'الموازنة'],
            ['tbl'=>'payment_data',  'lbl'=>'الدفع'],
            ['tbl'=>'invoice_data',  'lbl'=>'الفوترة'],
        ];
        foreach($stages as $s){
            if(!$this->tblExists($s['tbl'])||!$this->tblExists('transactions')) continue;
            $miss=(int)($this->val(
                "SELECT COUNT(*) FROM transactions t
                 LEFT JOIN `{$s['tbl']}` st ON t.id=st.transaction_id
                 WHERE st.transaction_id IS NULL")??0);
            if($miss===0){
                $this->log("FLOW_{$s['tbl']}",'🔄 تدفق العمل',"كل معاملة لها سجل في: {$s['lbl']}",'pass','الربط مكتمل');
            } else {
                $this->log("FLOW_{$s['tbl']}",'🔄 تدفق العمل',"كل معاملة لها سجل في: {$s['lbl']}",'warn',
                    "$miss معاملة بدون سجل في {$s['tbl']}",
                    "INSERT INTO `{$s['tbl']}` (transaction_id) SELECT id FROM transactions WHERE id NOT IN (SELECT transaction_id FROM `{$s['tbl']}`);");
            }
        }

        // ── صحة alert_type ────────────────────────────────────────────────
        if($this->tblExists('invoice_data')){
            $va="'".implode("','",VALID_ALERT_TYPES)."'";
            $ba=(int)($this->val("SELECT COUNT(*) FROM invoice_data WHERE alert_type NOT IN ($va) AND alert_type IS NOT NULL")??0);
            if($ba===0){
                $this->log('FLOW_ALERT','🔄 تدفق العمل','صحة قيم alert_type','pass','جميع الأنواع معتمدة');
            } else {
                $this->log('FLOW_ALERT','🔄 تدفق العمل','صحة قيم alert_type','warn',
                    "$ba سجل بـ alert_type غير معرّف",
                    "UPDATE invoice_data SET alert_type='انتظار' WHERE alert_type NOT IN ($va);");
            }
        }

        // ── مدفوعة بدون فاتورة (تنبيه متابعة) ───────────────────────────
        if($this->tblExists('payment_data')&&$this->tblExists('invoice_data')){
            $pni=(int)($this->val(
                "SELECT COUNT(*) FROM payment_data p
                 LEFT JOIN invoice_data i ON p.transaction_id=i.transaction_id
                 WHERE p.status='تم الدفع' AND (i.status IS NULL OR i.status NOT IN ('صدرت الفاتورة','ملغاة'))")??0);
            if($pni===0){
                $this->log('FLOW_PAID_INV','🔄 تدفق العمل','معاملات مدفوعة لها فاتورة','pass','جميع المدفوعات لها فاتورة أو قيد الإصدار');
            } else {
                $this->log('FLOW_PAID_INV','🔄 تدفق العمل','معاملات مدفوعة لها فاتورة','info',
                    "$pni معاملة مدفوعة لم تصدر فاتورتها بعد",
                    "SELECT p.transaction_id FROM payment_data p LEFT JOIN invoice_data i ON p.transaction_id=i.transaction_id WHERE p.status='تم الدفع' AND (i.status IS NULL OR i.status NOT IN ('صدرت الفاتورة','ملغاة'));");
            }
        }

        // ── تسلسل منطقي: دفع يجب أن يكون بعد استلام ─────────────────────
        if($this->tblExists('payment_data')&&$this->tblExists('receiving_data')){
            $oo=(int)($this->val(
                "SELECT COUNT(*) FROM payment_data p
                 JOIN receiving_data r ON p.transaction_id=r.transaction_id
                 WHERE p.status='تم الدفع' AND r.status='معلق'")??0);
            if($oo===0){
                $this->log('FLOW_ORDER','🔄 تدفق العمل','تسلسل سير العمل (دفع بعد استلام)','pass','لا مخالفات');
            } else {
                $this->log('FLOW_ORDER','🔄 تدفق العمل','تسلسل سير العمل (دفع بعد استلام)','warn',
                    "$oo معاملة مدفوعة بدون استلام مسبق",'راجع هذه المعاملات — تخالف ترتيب سير العمل');
            }

            // ── مرفوضة الاستلام لكنها مدفوعة (تناقض خطير) ────────────────
            $cx=(int)($this->val(
                "SELECT COUNT(*) FROM receiving_data r
                 JOIN payment_data p ON r.transaction_id=p.transaction_id
                 WHERE r.status='مرفوض' AND p.status='تم الدفع'")??0);
            if($cx===0){
                $this->log('FLOW_CANCEL','🔄 تدفق العمل','معاملات مرفوضة لم تُدفع','pass','لا تناقضات منطقية');
            } else {
                $this->log('FLOW_CANCEL','🔄 تدفق العمل','معاملات مرفوضة لم تُدفع','fail',
                    "$cx معاملة مرفوضة الاستلام لكنها مدفوعة!",
                    'تناقض منطقي خطير — راجع هذه المعاملات فوراً');
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // §6  نظام التنبيهات
    // ════════════════════════════════════════════════════════════════════════════
    public function testNotifications(): void
    {
        if($this->suite!=='all' && $this->suite!=='notifications') return;
        if(!$this->db) return;

        if(!$this->tblExists('invoice_data')){
            $this->log('NOTIF_TABLE','🔔 التنبيهات','جدول invoice_data (مصدر التنبيهات)','fail','الجدول غير موجود');
            return;
        }

        // ── وجود عمود alert_type ─────────────────────────────────────────
        $ac=$this->q("SHOW COLUMNS FROM invoice_data WHERE Field='alert_type'")?->fetch_assoc();
        if(!$ac){
            $this->log('NOTIF_COL','🔔 التنبيهات',"عمود 'alert_type'",'fail',
                'غير موجود — التنبيهات معطّلة',
                "ALTER TABLE invoice_data ADD COLUMN alert_type ENUM('انتظار','عاجل','متابعة') DEFAULT 'انتظار';");
            return;
        }
        $this->log('NOTIF_COL','🔔 التنبيهات',"عمود 'alert_type'",'pass',$ac['Type']??'موجود');

        // ── إحصاء التنبيهات ───────────────────────────────────────────────
        $nr=$this->q("SELECT alert_type,COUNT(*) AS c FROM invoice_data GROUP BY alert_type ORDER BY c DESC");
        if($nr) while($r=$nr->fetch_assoc()){
            $lvl = $r['alert_type']==='عاجل' ? 'warn' : 'info';
            $this->log("NOTIF_{$r['alert_type']}",'🔔 التنبيهات',"تنبيهات: {$r['alert_type']}",$lvl,"{$r['c']} معاملة");
        }

        // ── التنبيهات العاجلة ─────────────────────────────────────────────
        $urg=(int)($this->val("SELECT COUNT(*) FROM invoice_data WHERE alert_type='عاجل'")??0);
        $this->log('NOTIF_URGENT','🔔 التنبيهات','التنبيهات العاجلة',$urg>0?'warn':'pass',
            $urg>0?"$urg معاملة عاجلة بحاجة لمتابعة فورية":'لا تنبيهات عاجلة',
            $urg>0?"SELECT t.transaction_number,t.amount FROM transactions t JOIN invoice_data i ON t.id=i.transaction_id WHERE i.alert_type='عاجل';":'');

        // ── اختبار استعلام getRecentNotifications (UNION ALL) ────────────
        $uq="SELECT 1 FROM (
            SELECT r.updated_at FROM transactions t LEFT JOIN receiving_data r ON t.id=r.transaction_id WHERE r.status IS NOT NULL AND r.status!='معلق' AND r.updated_at IS NOT NULL
            UNION ALL
            SELECT b.updated_at FROM transactions t LEFT JOIN budget_data b ON t.id=b.transaction_id WHERE b.budget_status IS NOT NULL AND b.budget_status!='معلق' AND b.updated_at IS NOT NULL
            UNION ALL
            SELECT p.updated_at FROM transactions t LEFT JOIN payment_data p ON t.id=p.transaction_id WHERE p.status IS NOT NULL AND p.status!='معلق' AND p.updated_at IS NOT NULL
            UNION ALL
            SELECT i.updated_at FROM transactions t LEFT JOIN invoice_data i ON t.id=i.transaction_id WHERE i.status IS NOT NULL AND i.status!='' AND i.updated_at IS NOT NULL
        ) AS u ORDER BY updated_at DESC LIMIT 5";
        $utest=$this->q($uq);
        if($utest!==false){
            $this->log('NOTIF_QUERY','🔔 التنبيهات','استعلام getRecentNotifications (UNION ALL)','pass','يعمل بدون أخطاء');
        } else {
            $this->log('NOTIF_QUERY','🔔 التنبيهات','استعلام getRecentNotifications (UNION ALL)','fail',
                'خطأ: '.$this->db->error,
                'راجع functions.php::getRecentNotifications() — أحد الجداول يحتوي خطأ في البنية');
        }

        // ── updated_at في جداول المراحل (شرط صحة الاستعلام) ─────────────
        foreach(['receiving_data','budget_data','payment_data','invoice_data'] as $tbl){
            if(!$this->tblExists($tbl)) continue;
            $uc=$this->q("SHOW COLUMNS FROM `$tbl` WHERE Field='updated_at'");
            if($uc&&$uc->num_rows>0){
                $this->log("NOTIF_UPD_$tbl",'🔔 التنبيهات',"عمود updated_at في $tbl",'pass','موجود');
            } else {
                $this->log("NOTIF_UPD_$tbl",'🔔 التنبيهات',"عمود updated_at في $tbl",'fail',
                    'غير موجود — التنبيهات ستكون فارغة لهذه المرحلة',
                    "ALTER TABLE `$tbl` ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;");
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // §7  سجل الأحداث والتغييرات
    // ════════════════════════════════════════════════════════════════════════════
    public function testEventLog(): void
    {
        if($this->suite!=='all' && $this->suite!=='log') return;
        if(!$this->db) return;

        // ── activity_log ──────────────────────────────────────────────────
        if(!$this->tblExists('activity_log')){
            $this->log('LOG_ACTIVITY','📋 سجل الأحداث','جدول activity_log','fail','الجدول غير موجود');
        } else {
            $cnt=$this->rowCount('activity_log');
            $this->log('LOG_ACTIVITY','📋 سجل الأحداث','جدول activity_log','pass',number_format($cnt).' سجل');

            // تغطية المعاملات
            if($this->tblExists('transactions')){
                $nl=(int)($this->val(
                    "SELECT COUNT(*) FROM transactions t
                     LEFT JOIN activity_log al ON t.id=al.transaction_id WHERE al.id IS NULL")??0);
                if($nl===0){
                    $this->log('LOG_COVERAGE','📋 سجل الأحداث','تغطية activity_log للمعاملات','pass','جميع المعاملات موثقة');
                } else {
                    $this->log('LOG_COVERAGE','📋 سجل الأحداث','تغطية activity_log للمعاملات','warn',
                        "$nl معاملة بدون سجل نشاط",
                        "SELECT id,transaction_number FROM transactions WHERE id NOT IN (SELECT DISTINCT transaction_id FROM activity_log);");
                }
            }

            // تواريخ مستقبلية
            $fut=(int)($this->val("SELECT COUNT(*) FROM activity_log WHERE created_at>NOW()")??0);
            if($fut===0){
                $this->log('LOG_FUTURE','📋 سجل الأحداث','تواريخ سجل النشاط (لا مستقبلية)','pass','جميع التواريخ سليمة');
            } else {
                $this->log('LOG_FUTURE','📋 سجل الأحداث','تواريخ سجل النشاط (لا مستقبلية)','warn',
                    "$fut سجل بتاريخ مستقبلي",
                    "تحقق من ضبط timezone في config.php::date_default_timezone_set()");
            }

            // كثافة الأحداث (آخر 30 يوم)
            $dr=$this->q("SELECT DATE(created_at) AS day,COUNT(*) AS c FROM activity_log WHERE created_at>=DATE_SUB(NOW(),INTERVAL 30 DAY) GROUP BY DATE(created_at) ORDER BY c DESC LIMIT 3");
            if($dr&&$dr->num_rows>0){
                $rows=[];
                while($r=$dr->fetch_assoc()) $rows[]="{$r['day']}: {$r['c']}";
                $this->log('LOG_DENSITY','📋 سجل الأحداث','كثافة الأحداث (أعلى 3 أيام — آخر 30 يوم)','info',implode(' | ',$rows));
            }
        }

        // ── transaction_events ────────────────────────────────────────────
        if(!$this->tblExists('transaction_events')){
            $this->log('LOG_EVENTS','📋 سجل الأحداث','جدول transaction_events','warn',
                'غير موجود — سيُنشأ تلقائياً عند أول حدث',
                'راجع functions.php::ensureEventsTable()');
        } else {
            $ec=$this->rowCount('transaction_events');
            $this->log('LOG_EVENTS','📋 سجل الأحداث','جدول transaction_events','pass',number_format($ec).' حدث');

            // أعمدة متوقعة من functions.php::ensureEventsTable()
            $expCols=['id','transaction_id','stage','employee_id','action','old_status','new_status','notes','event_time','duration_from_previous','created_at'];
            $excols=$this->cols('transaction_events');
            foreach($expCols as $col){
                if(!in_array($col,$excols)){
                    $this->log("LOG_COL_$col",'📋 سجل الأحداث',"عمود `$col` في transaction_events",'warn',
                        'مفقود',
                        "ALTER TABLE transaction_events ADD COLUMN `$col` ... ← functions.php::ensureEventsTable()");
                }
            }

            // event_time مستقبلي
            $fe=(int)($this->val("SELECT COUNT(*) FROM transaction_events WHERE event_time>NOW()")??0);
            if($fe===0){
                $this->log('LOG_EVT_FUTURE','📋 سجل الأحداث','أوقات الأحداث (لا مستقبلية)','pass','جميع أوقات الأحداث سليمة');
            } else {
                $this->log('LOG_EVT_FUTURE','📋 سجل الأحداث','أوقات الأحداث (لا مستقبلية)','warn',
                    "$fe حدث بـ event_time مستقبلي",'تحقق من ضبط timezone في PHP وMySQL');
            }

            // duration_from_previous ≥ 0
            if(in_array('duration_from_previous',$excols)){
                $nd=(int)($this->val("SELECT COUNT(*) FROM transaction_events WHERE duration_from_previous<0")??0);
                if($nd===0){
                    $this->log('LOG_DUR','📋 سجل الأحداث','صحة duration_from_previous (≥ 0)','pass','جميع القيم صحيحة');
                } else {
                    $this->log('LOG_DUR','📋 سجل الأحداث','صحة duration_from_previous (≥ 0)','warn',
                        "$nd حدث بمدة سالبة",
                        "UPDATE transaction_events SET duration_from_previous=0 WHERE duration_from_previous<0;");
                }
            }

            // نسبة الأحداث/المعاملات
            if($this->tblExists('transactions')){
                $tc=$this->rowCount('transactions');
                $ratio=$tc>0?round($ec/$tc,1):0;
                $rs=$ratio>=1?'pass':($tc>0?'warn':'info');
                $this->log('LOG_RATIO','📋 سجل الأحداث','نسبة الأحداث/المعاملات',$rs,
                    "معدل $ratio حدث/معاملة",
                    $ratio<1&&$tc>0?'معدل منخفض — قد لا تُستدعى logTransactionEvent() في كل تحديث':'');
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // §8  نظام المراسلات
    // ════════════════════════════════════════════════════════════════════════════
    public function testCorrespondence(): void
    {
        if($this->suite!=='all') return;
        if(!$this->db) return;

        $tbls=['correspondence','correspondence_stages','correspondence_workflow_templates',
               'correspondence_attachments','correspondence_templates','correspondence_audit_log'];
        foreach($tbls as $tbl){
            if($this->tblExists($tbl)){
                $this->log("CORR_$tbl",'📨 المراسلات',"جدول: $tbl",'pass',
                    number_format($this->rowCount($tbl)).' صف');
            } else {
                $this->log("CORR_$tbl",'📨 المراسلات',"جدول: $tbl",'warn',
                    'غير موجود','راجع db_diagnostic.php لإنشاء جداول نظام المراسلات');
            }
        }

        if($this->tblExists('correspondence')){
            $vt="'internal_finance','internal_general','incoming','outgoing'";
            $bt=(int)($this->val("SELECT COUNT(*) FROM correspondence WHERE type NOT IN ($vt)")??0);
            if($bt===0){
                $this->log('CORR_TYPE','📨 المراسلات','صحة أنواع المراسلات','pass','جميع الأنواع معتمدة');
            } else {
                $this->log('CORR_TYPE','📨 المراسلات','صحة أنواع المراسلات','warn',
                    "$bt مراسلة بنوع غير معرّف",
                    "SELECT DISTINCT type FROM correspondence WHERE type NOT IN ($vt);");
            }
        }

        if($this->tblExists('correspondence_workflow_templates')){
            $wc=$this->rowCount('correspondence_workflow_templates');
            if($wc>0){
                $this->log('CORR_WF','📨 المراسلات','قوالب سير عمل المراسلات','pass',"$wc قالب");
            } else {
                $this->log('CORR_WF','📨 المراسلات','قوالب سير عمل المراسلات','warn',
                    'لا توجد قوالب — سير عمل المراسلات لن يعمل',
                    'أدخل القوالب من db_diagnostic.php → REQUIRED_DATA');
            }
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  ████  تشغيل جميع الاختبارات  ████
    // ════════════════════════════════════════════════════════════════════════════
    public function run(): void
    {
        if(!RUNNING_CLI) $this->htmlHeader();
        else             $this->cliHeader();

        if(!$this->connect()){
            $this->report();
            return;
        }

        $this->testDatabase();
        $this->testPermissions();
        $this->testSLA();
        $this->testFinance();
        $this->testWorkflowLinkage();
        $this->testNotifications();
        $this->testEventLog();
        $this->testCorrespondence();

        $this->report();

        if($this->db) $this->db->close();
        if(!RUNNING_CLI) echo '</body></html>';
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  ████  إخراج التقرير  ████
    // ════════════════════════════════════════════════════════════════════════════
    private function report(): void
    {
        if(RUNNING_CLI) $this->cliReport();
        else            $this->htmlReport();
    }

    private function cliHeader(): void
    {
        $c=self::C;
        echo "\n{$c['head']}╔════════════════════════════════════════════════════════════════╗\n";
        echo "║     🧪  ملف الاختبار الشامل — نظام إدارة المعاملات المالية      ║\n";
        echo "║         Comprehensive System Test Suite v".TEST_VERSION."                ║\n";
        echo "╚════════════════════════════════════════════════════════════════╝{$c['reset']}\n";
        echo "  القاعدة : ".DB_NAME." @ ".DB_HOST."\n";
        echo "  التاريخ : ".date('Y-m-d H:i:s')."\n";
        echo "  PHP     : ".PHP_VERSION."\n\n";
    }

    private function cliReport(): void
    {
        $c=self::C;
        $grouped=[];
        foreach($this->results as $r) $grouped[$r['suite']][]=$r;

        foreach($grouped as $suite=>$tests){
            echo "\n{$c['head']}╔══════════════════════════════════════════════════════════════╗{$c['reset']}\n";
            printf("{$c['head']}║  %-60s║{$c['reset']}\n", "  $suite  ");
            echo "{$c['head']}╚══════════════════════════════════════════════════════════════╝{$c['reset']}\n";

            foreach($tests as $t){
                $icon =match($t['status']){'pass'=>'✅','fail'=>'❌','warn'=>'⚠️',default=>'ℹ️'};
                $col  =$c[$t['status']]??$c['info'];
                $rst  =$c['reset'];
                printf("  %s {$col}%-52s{$rst} %s\n",$icon,mb_substr($t['name'],0,52),$t['detail']);
                if($t['fix']&&in_array($t['status'],['fail','warn'])){
                    echo "     {$c['info']}💡 ".mb_substr($t['fix'],0,92)."{$rst}\n";
                }
            }
        }

        $elapsed=round((microtime(true)-TEST_START_TIME)*1000,1);
        $total=$this->passed+$this->failed+$this->warnings+$this->info;
        $health=$total>0?round(($this->passed/$total)*100):0;

        echo "\n{$c['head']}═══════════════════════════════════════════════════════════════{$c['reset']}\n";
        echo "  📊 ملخص النتائج:\n";
        printf("  {$c['pass']}✅ ناجح     : %-5d{$c['reset']}\n",$this->passed);
        printf("  {$c['fail']}❌ فشل      : %-5d{$c['reset']}\n",$this->failed);
        printf("  {$c['warn']}⚠️  تحذير    : %-5d{$c['reset']}\n",$this->warnings);
        printf("  {$c['info']}ℹ️  معلومات  : %-5d{$c['reset']}\n",$this->info);
        printf("  📈 صحة النظام : %d%%\n",$health);
        printf("  ⏱️  زمن الاختبار: %s ms\n",$elapsed);
        echo "{$c['head']}═══════════════════════════════════════════════════════════════{$c['reset']}\n\n";
    }

    private function htmlHeader(): void
    {
        $v=TEST_VERSION;
        echo <<<HTML
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>اختبار شامل للنظام — v{$v}</title>
<style>
:root{--bg:#0f172a;--card:#1e293b;--brd:#334155;--pass:#22c55e;--fail:#ef4444;--warn:#f59e0b;--info:#3b82f6;--tx:#f1f5f9;--mu:#94a3b8}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--tx);font-family:'Segoe UI',Tahoma,sans-serif;padding:20px;min-height:100vh}
h1{color:#38bdf8;text-align:center;font-size:1.8rem;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid var(--brd)}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:28px}
.sc{background:var(--card);border-radius:12px;padding:16px;text-align:center;border:1px solid var(--brd)}
.sn{font-size:2rem;font-weight:700}.sl{font-size:.8rem;color:var(--mu);margin-top:4px}
.bar{background:var(--brd);border-radius:99px;height:10px;overflow:hidden;margin-bottom:28px}
.fill{height:100%;background:linear-gradient(90deg,#22c55e,#38bdf8);border-radius:99px}
.suite{background:var(--card);border-radius:14px;padding:20px;margin-bottom:20px;border:1px solid var(--brd)}
.st{font-size:1.1rem;font-weight:600;color:#38bdf8;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--brd)}
.tr{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #1a2744}
.tr:last-child{border-bottom:none}
.badge{padding:2px 10px;border-radius:6px;font-size:.75rem;font-weight:700;white-space:nowrap;flex-shrink:0}
.bp{background:rgba(34,197,94,.15);color:var(--pass)}.bf{background:rgba(239,68,68,.15);color:var(--fail)}
.bw{background:rgba(245,158,11,.15);color:var(--warn)}.bi{background:rgba(59,130,246,.15);color:var(--info)}
.tn{font-weight:500;flex:1}.td{font-size:.82rem;color:var(--mu)}
.fx{background:#0f1a2e;border:1px solid #1e40af;border-radius:6px;padding:6px 10px;margin-top:4px;font-size:.76rem;color:#93c5fd;font-family:monospace;word-break:break-all}
.fb{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}
.fb button{background:var(--card);border:1px solid var(--brd);color:var(--tx);padding:6px 14px;border-radius:8px;cursor:pointer;font-size:.85rem}
.fb button:hover,.fb button.active{background:#1e40af;border-color:#3b82f6}
</style>
</head>
<body>
<h1>🧪 نتائج الاختبار الشامل للنظام</h1>
HTML;
    }

    private function htmlReport(): void
    {
        $elapsed=round((microtime(true)-TEST_START_TIME)*1000,1);
        $total=$this->passed+$this->failed+$this->warnings+$this->info;
        $health=$total>0?round(($this->passed/$total)*100):0;

        // ملخص
        echo '<div class="summary">';
        foreach([
            [$this->passed,  '✅ ناجح',    'var(--pass)'],
            [$this->failed,  '❌ فشل',     'var(--fail)'],
            [$this->warnings,'⚠️ تحذير',  'var(--warn)'],
            [$this->info,    'ℹ️ معلومة',  'var(--info)'],
            [$total,         '📊 الإجمالي','#f1f5f9'],
            [$health.'%',    '📈 صحة النظام','#38bdf8'],
            [$elapsed.'ms',  '⏱️ الزمن',   '#a78bfa'],
        ] as [$n,$l,$col]){
            echo "<div class='sc'><div class='sn' style='color:$col'>$n</div><div class='sl'>$l</div></div>";
        }
        echo '</div>';

        echo "<div class='bar'><div class='fill' style='width:{$health}%'></div></div>";

        // أزرار فلتر
        $suites=array_unique(array_column($this->results,'suite'));
        echo "<div class='fb'><button class='active' onclick='fs(\"all\")'>الكل</button>";
        foreach($suites as $s) echo "<button onclick='fs(\"".htmlspecialchars($s)."\")'>".htmlspecialchars($s)."</button>";
        echo '</div>';

        // التقارير
        $grouped=[];
        foreach($this->results as $r) $grouped[$r['suite']][]=$r;
        foreach($grouped as $suite=>$tests){
            $slug=htmlspecialchars($suite);
            echo "<div class='suite' data-s='$slug'><div class='st'>$slug</div>";
            foreach($tests as $t){
                $bc=match($t['status']){'pass'=>'bp','fail'=>'bf','warn'=>'bw',default=>'bi'};
                $bl=match($t['status']){'pass'=>'✅ ناجح','fail'=>'❌ فشل','warn'=>'⚠️ تحذير',default=>'ℹ️ معلومة'};
                $n =htmlspecialchars($t['name']); $d=htmlspecialchars($t['detail']); $f=htmlspecialchars($t['fix']);
                echo "<div class='tr'><span class='badge $bc'>$bl</span><div><div class='tn'>$n</div>";
                if($d) echo "<div class='td'>$d</div>";
                if($f) echo "<div class='fx'>💡 $f</div>";
                echo '</div></div>';
            }
            echo '</div>';
        }

        echo "<script>function fs(n){document.querySelectorAll('.suite').forEach(e=>e.style.display=(n==='all'||e.dataset.s===n)?'':'none');document.querySelectorAll('.fb button').forEach(b=>b.classList.toggle('active',b.textContent.trim()===n||(n==='all'&&b.textContent.trim()==='الكل')));}</script>";
        echo "<div style='text-align:center;color:var(--mu);font-size:.82rem;margin-top:24px;padding-bottom:20px'>نظام إدارة المعاملات — اختبار شامل v".TEST_VERSION." | {$elapsed}ms</div>";
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ████  نقطة الدخول  ████
// ═══════════════════════════════════════════════════════════════════════════════
$suite='all';
if(RUNNING_CLI){
    foreach($argv??[] as $arg)
        if(str_starts_with($arg,'--suite=')) $suite=substr($arg,8);
} else {
    $suite=$_GET['suite']??'all';
}

(new TestEngine($suite))->run();