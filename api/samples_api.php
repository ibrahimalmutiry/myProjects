<?php
/**
 * ════════════════════════════════════════════════════════════════════
 *  samples_api.php  —  Sample Tracking Workflow System
 *  نظام تتبع العينات (Workflow تشغيلي صناعي)
 * ────────────────────────────────────────────────────────────────────
 *  دورة الحياة:
 *    new_request → operations_review (مراجعة وتخطيط) → production
 *    → quality_check → ready_for_dispatch → dispatched → delivered
 *  مع مساري رفض/تعديل:
 *    operations_review → rejected
 *    quality_check     → rejected | need_modification (يرجع للإنتاج)
 *
 *  الإدارات المسؤولة (تُربط عبر sector_id / department code):
 *    commercial · operations · production · quality · samples
 *
 *  الجداول المُنشأة تلقائياً (boot):
 *    samples · sample_events · sample_attachments
 * ════════════════════════════════════════════════════════════════════
 */
ob_start();
session_start(); session_write_close();
header('Content-Type: application/json; charset=utf-8');

set_exception_handler(fn($e) => _die(['success'=>false,'message'=>$e->getMessage(),'line'=>$e->getLine()], 500));

require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/permissions_functions.php';
@require_once __DIR__ . '/../includes/notification_functions.php';

if (!function_exists('db'))       _die(['success'=>false,'message'=>'functions.php missing']);
if (!isset($_SESSION['user_id'])) _die(['success'=>false,'message'=>'غير مصرح'], 401);

$uid    = (int)$_SESSION['user_id'];
$action = $_GET['action'] ?? '';
$conn   = db();
$body   = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw  = file_get_contents('php://input');
    $body = $raw ? (json_decode($raw, true) ?? []) : $_POST;
}

// ── تهيئة الجداول مرة واحدة لكل عملية تشغيل ───────────────────────────
if (!isset($GLOBALS['_swb'])) { $GLOBALS['_swb'] = 1; _boot($conn); }

// ── CSRF للعمليات الكتابية ───────────────────────────────────────────
$writes = ['create','update','advance','reject','need_modification','dispatch',
           'mark_delivered','upload_attachment','delete','sla_save'];
if (in_array($action, $writes) && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $tok = $body['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (function_exists('verifyCsrfToken') && !verifyCsrfToken($tok))
        _die(['success'=>false,'message'=>'CSRF error'], 403);
}

// ════════════════════════════════════════════════════════════════════
//  تعريف مراحل الـ Workflow (المصدر الوحيد للحقيقة)
// ════════════════════════════════════════════════════════════════════
/**
 * كل مرحلة:
 *   dept   = كود الإدارة المسؤولة (للصلاحية)
 *   next   = المرحلة التالية الطبيعية عند "advance"
 *   color  = تصنيف لوني (blue/yellow/green/red)
 */
function WF(): array {
    static $w = null;
    if ($w !== null) return $w;
    // sla_days = المهلة الافتراضية بالأيام (تُتجاوز من جدول sample_sla إن وُجد)
    return $w = [
        'new_request'        => ['ar'=>'طلب جديد',                'dept'=>'commercial', 'next'=>'operations_review', 'color'=>'blue',   'sla_days'=>1],
        'operations_review'  => ['ar'=>'مراجعة وتخطيط العمليات', 'dept'=>'operations', 'next'=>'production',         'color'=>'yellow', 'sla_days'=>3],
        'production'         => ['ar'=>'الإنتاج',                  'dept'=>'production', 'next'=>'quality_check',      'color'=>'yellow', 'sla_days'=>5],
        'quality_check'      => ['ar'=>'فحص الجودة',               'dept'=>'quality',    'next'=>'ready_for_dispatch', 'color'=>'yellow', 'sla_days'=>2],
        'ready_for_dispatch' => ['ar'=>'جاهزة للإرسال',           'dept'=>'samples',    'next'=>'dispatched',         'color'=>'green',  'sla_days'=>1],
        'dispatched'         => ['ar'=>'تم الإرسال',               'dept'=>'samples',    'next'=>'delivered',          'color'=>'green',  'sla_days'=>3],
        'delivered'          => ['ar'=>'تم التسليم',               'dept'=>'samples',    'next'=>null,                 'color'=>'green',  'sla_days'=>0],
        'need_modification'  => ['ar'=>'تحتاج تعديل',              'dept'=>'production', 'next'=>'quality_check',      'color'=>'yellow', 'sla_days'=>2],
        'rejected'           => ['ar'=>'مرفوضة',                   'dept'=>null,         'next'=>null,                 'color'=>'red',    'sla_days'=>0],
    ];
}

/** مهل الـ SLA الفعلية لكل مرحلة (من جدول sample_sla، مع رجوع للقيم الافتراضية) */
function slaDays(mysqli $conn, string $stage): int {
    static $cache = null;
    if ($cache === null) {
        $cache = [];
        $r = $conn->query("SELECT stage, sla_days FROM sample_sla");
        if ($r) while ($row = $r->fetch_assoc()) $cache[$row['stage']] = (int)$row['sla_days'];
    }
    if (isset($cache[$stage])) return $cache[$stage];
    return (int)(WF()[$stage]['sla_days'] ?? 0);
}

/** حالة SLA لمرحلة عينة: المهلة بالأيام، المنقضي، والحالة (ok/warn/breach) */
function _slaStatus(mysqli $conn, string $stage, ?string $stageEnteredAt): array {
    $days = slaDays($conn, $stage);
    if ($days <= 0 || in_array($stage, ['delivered','rejected'], true) || !$stageEnteredAt)
        return ['days'=>$days, 'elapsed_h'=>0, 'state'=>'none', 'due'=>null];
    $enter = strtotime($stageEnteredAt);
    $due   = $enter + $days * 86400;
    $now   = time();
    $elapsedH = max(0, (int)round(($now - $enter) / 3600));
    $state = 'ok';
    if ($now > $due) $state = 'breach';
    elseif ($now > $due - 86400) $state = 'warn'; // ضمن آخر يوم
    return ['days'=>$days, 'elapsed_h'=>$elapsedH, 'state'=>$state, 'due'=>date('Y-m-d H:i', $due)];
}

/** ترتيب المراحل للعرض الخطي في الـ Timeline */
function WF_ORDER(): array {
    return ['new_request','operations_review','production',
            'quality_check','ready_for_dispatch','dispatched','delivered'];
}

// ════════════════════════════════════════════════════════════════════
//  الصلاحيات: هل يملك المستخدم إدارة المرحلة الحالية؟
// ════════════════════════════════════════════════════════════════════
/**
 * الربط الفعلي مع قاعدة البيانات (من workflow_system.sql):
 *   commercial → sector_id 3  (القطاع التجاري)
 *   operations → sector_id 7  (قطاع العمليات — يشمل المراجعة والتخطيط معاً)
 *   production → sector_id 9  (قطاع الإنتاج)
 *   quality    → sector_id 8  (قطاع الجودة)
 *   samples    → sector_id 8  + قسم إدارة العينات: 88
 *
 *  ملاحظة: الجودة/العينات يتشاركان القطاع 8، لذا نميّز بـ department_id.
 */
if (!defined('WF_SAMPLES_DEPT_IDS'))  define('WF_SAMPLES_DEPT_IDS',  [88]);          // إدارة العينات
// القطاعات المصرّح لها بإنشاء طلبات العينات: التجاري(3) · المالي(4) · الجودة والسلامة والاستدامة(8)
if (!defined('WF_CREATE_SECTORS'))    define('WF_CREATE_SECTORS',   [3, 4, 8]);

function _stageSector(string $stage): ?int {
    return [
        'commercial' => 3, 'operations' => 7,
        'production' => 9, 'quality' => 8, 'samples' => 8,
    ][$stage] ?? null;
}

function _userStageDepts(mysqli $conn, int $uid): array {
    static $cache = [];
    if (isset($cache[$uid])) return $cache[$uid];
    $r = $conn->query("
        SELECT e.permission_level, e.department_id,
               d.code dept_code, d.dept_type,
               COALESCE(d.sector_id, IF(d.dept_type='sector', d.id, d.parent_id)) AS sector_id
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.id=$uid LIMIT 1
    ")->fetch_assoc();
    if ($r) {
        $r['sector_id']     = $r['sector_id'] !== null ? (int)$r['sector_id'] : null;
        $r['department_id'] = (int)($r['department_id'] ?? 0);
    }
    return $cache[$uid] = $r ?: [];
}

function canActOnStage(mysqli $conn, int $uid, string $stage): bool {
    $emp = _userStageDepts($conn, $uid);
    if (!$emp) return false;
    $lvl = $emp['permission_level'] ?? '';
    if (in_array($lvl, ['system_admin','CEO'])) return true;

    $wf = WF();
    $needDept = $wf[$stage]['dept'] ?? null;
    if (!$needDept) return false; // rejected / terminal — لا أحد يتصرف عدا admin (مُعالج أعلاه)

    $needSector = _stageSector($needDept);
    $secId      = $emp['sector_id'] ?? null;
    $deptId     = (int)($emp['department_id'] ?? 0);

    // العينات: قطاع الجودة (8) + قسم إدارة العينات تحديداً
    // ولمرحلتي الإرسال/التسليم: يُسمح أيضاً للقطاع التجاري (3) بتأكيد الوصول
    if ($needDept === 'samples') {
        $ok = $secId === 8 || in_array($deptId, WF_SAMPLES_DEPT_IDS, true);
        if (!$ok && in_array($stage, ['dispatched','delivered','ready_for_dispatch'], true))
            $ok = ($secId === 3); // القطاع التجاري صاحب الطلب
        return $ok;
    }

    // باقي المراحل: مطابقة القطاع مباشرة (العمليات=7 تشمل المراجعة والتخطيط)
    if ($needSector && $secId === $needSector) return true;

    // رئيس القطاع يتصرف على مراحل قطاعه فقط
    if ($lvl === 'sector_head' && $needSector && $secId === $needSector) return true;
    return false;
}

// ════════════════════════════════════════════════════════════════════
switch ($action) {

// ── إحصائيات لوحة التحكم ─────────────────────────────────────────────
case 'stats':
    $r = $conn->query("
        SELECT
            COUNT(*)                                    total,
            SUM(current_stage='new_request')            cnt_new,
            SUM(current_stage='production')             cnt_production,
            SUM(current_stage='need_modification')      cnt_modification,
            SUM(current_stage='quality_check')          cnt_quality,
            SUM(current_stage IN('delivered'))          cnt_completed,
            SUM(current_stage='rejected')               cnt_rejected,
            SUM(
                current_stage NOT IN('delivered','rejected')
                AND need_date IS NOT NULL
                AND need_date < CURDATE()
            )                                           cnt_overdue
        FROM samples
    ")->fetch_assoc();
    _out(['success'=>true,'data'=>array_map(fn($v)=>(int)$v, $r)]);

// ── قائمة العينات (بحث/تصفية/ترقيم) ──────────────────────────────────
case 'list':
    $page = max(1, (int)($_GET['page'] ?? 1)); $per = 20;
    $w = ['1=1']; $p = []; $t = '';

    $stage = trim($_GET['stage'] ?? '');
    if ($stage && isset(WF()[$stage])) { $w[]='s.current_stage=?'; $p[]=$stage; $t.='s'; }

    if ($prio = trim($_GET['priority'] ?? '')) {
        if (in_array($prio,['low','normal','high','urgent'])) { $w[]='s.priority=?'; $p[]=$prio; $t.='s'; }
    }
    // فلتر "متأخرة"
    if (($_GET['overdue'] ?? '') === '1') {
        $w[] = "s.current_stage NOT IN('delivered','rejected') AND s.need_date IS NOT NULL AND s.need_date < CURDATE()";
    }
    if ($q = trim($_GET['search'] ?? '')) {
        $lk = '%'.$q.'%';
        $w[] = '(s.request_number LIKE ? OR s.client_name LIKE ? OR s.sample_type LIKE ? OR s.product_desc LIKE ?)';
        array_push($p,$lk,$lk,$lk,$lk); $t.='ssss';
    }
    $sql = implode(' AND ', $w);

    // عزل البيانات حسب الإدارة (كل مستخدم يرى ما يخصه) — إلا الأدوار العليا
    $emp = _userStageDepts($conn, $uid);
    $lvl = $emp['permission_level'] ?? '';
    $scopeNote = null;
    // القائمة تعرض كل العينات للجميع (شفافية للقراءة) — والتصرّف يبقى مقيّداً
    // عبر canActOnStage في كل عملية كتابة. لا تقييد على نطاق القائمة.

    $cnt = $conn->prepare("SELECT COUNT(*) FROM samples s WHERE $sql");
    if ($t) $cnt->bind_param($t, ...$p);
    $cnt->execute();
    $total = (int)$cnt->get_result()->fetch_row()[0];

    array_push($p, $per, ($page-1)*$per); $t .= 'ii';
    $st = $conn->prepare("
        SELECT s.id, s.request_number, s.client_name, s.sample_type,
               s.product_desc, s.priority, s.current_stage, s.need_date,
               s.created_at, s.stage_entered_at,
               e.name creator_name,
               TIMESTAMPDIFF(HOUR, s.created_at, NOW())          age_hours,
               TIMESTAMPDIFF(HOUR, s.stage_entered_at, NOW())    stage_hours
        FROM samples s
        LEFT JOIN employees e ON e.id=s.created_by
        WHERE $sql
        ORDER BY
            FIELD(s.priority,'urgent','high','normal','low'),
            s.updated_at DESC
        LIMIT ? OFFSET ?");
    $st->bind_param($t, ...$p); $st->execute();
    $rows = $st->get_result()->fetch_all(MYSQLI_ASSOC);

    // إثراء كل صف بمعلومات المرحلة
    $wf = WF();
    foreach ($rows as &$row) {
        $stg = $row['current_stage'];
        $row['stage_ar']   = $wf[$stg]['ar']   ?? $stg;
        $row['stage_dept'] = $wf[$stg]['dept'] ?? null;
        $row['color']      = $wf[$stg]['color']?? 'blue';
        $row['is_overdue'] = ($row['need_date'] && $row['need_date'] < date('Y-m-d')
                              && !in_array($stg,['delivered','rejected'])) ? 1 : 0;
        $row['can_act']    = canActOnStage($conn,$uid,$stg) ? 1 : 0;
        $sla = _slaStatus($conn, $stg, $row['stage_entered_at'] ?? null);
        $row['sla_state'] = $sla['state']; // none/ok/warn/breach
    }
    _out(['success'=>true,'data'=>$rows,'total'=>$total,'page'=>$page,
          'pages'=>(int)ceil($total/$per),'scope'=>$scopeNote]);

// ── تفاصيل عينة كاملة ────────────────────────────────────────────────
case 'get':
    $id = _id();
    $st = $conn->prepare("
        SELECT s.*, e.name creator_name, d.name creator_dept
        FROM samples s
        LEFT JOIN employees   e ON e.id=s.created_by
        LEFT JOIN departments d ON d.id=e.department_id
        WHERE s.id=?");
    $st->bind_param('i',$id); $st->execute();
    $s = $st->get_result()->fetch_assoc();
    if (!$s) _die(['success'=>false,'message'=>'غير موجود'], 404);

    $wf = WF();
    $stg = $s['current_stage'];
    $s['stage_ar']   = $wf[$stg]['ar']   ?? $stg;
    $s['stage_dept'] = $wf[$stg]['dept'] ?? null;
    $s['color']      = $wf[$stg]['color']?? 'blue';
    $s['next_stage'] = $wf[$stg]['next'] ?? null;
    $s['can_act']    = canActOnStage($conn,$uid,$stg) ? 1 : 0;
    $s['is_overdue'] = ($s['need_date'] && $s['need_date'] < date('Y-m-d')
                        && !in_array($stg,['delivered','rejected'])) ? 1 : 0;

    // حساب SLA للمرحلة الحالية: المهلة، المنقضي، والحالة (ضمن/قريب/متجاوز)
    $s['sla'] = _slaStatus($conn, $stg, $s['stage_entered_at']);

    // باركود EAN-13 (كود السعودية 628) — يُولّد ويُحفظ مرة واحدة
    if (empty($s['barcode'])) {
        $s['barcode'] = _ean13($id);
        $conn->query("UPDATE samples SET barcode='".$conn->real_escape_string($s['barcode'])."' WHERE id=$id");
    }

    // الأحداث (Audit Trail)
    $events = $conn->query("
        SELECT se.*, e.name actor_name
        FROM sample_events se
        LEFT JOIN employees e ON e.id=se.actor_id
        WHERE se.sample_id=$id ORDER BY se.created_at ASC
    ")->fetch_all(MYSQLI_ASSOC);

    // المرفقات
    $atts = $conn->query("
        SELECT id, file_name, file_path, file_size, stage, uploaded_at
        FROM sample_attachments WHERE sample_id=$id ORDER BY uploaded_at DESC
    ")->fetch_all(MYSQLI_ASSOC);

    // بناء حالة كل مرحلة للـ Timeline (done/current/pending)
    $order = WF_ORDER();
    $curIdx = array_search($stg, $order);
    if ($curIdx === false) $curIdx = -1; // rejected/need_modification خارج المسار الخطي
    // أزمنة دخول كل مرحلة من سجل الأحداث
    $stageTimes = [];
    foreach ($events as $ev) {
        if ($ev['event_type'] === 'stage_change' && $ev['to_stage'])
            $stageTimes[$ev['to_stage']] = $ev['created_at'];
    }
    $timeline = [];
    foreach ($order as $i=>$k) {
        $state = 'pending';
        if ($stg === 'rejected') {
            $state = ($i <= ($curIdx===-1? -1 : $curIdx)) ? 'done' : 'pending';
        } else {
            if ($i < $curIdx)      $state = 'done';
            elseif ($i === $curIdx) $state = 'current';
        }
        $timeline[] = [
            'stage'  => $k,
            'ar'     => $wf[$k]['ar'],
            'dept'   => $wf[$k]['dept'],
            'state'  => $state,
            'at'     => $stageTimes[$k] ?? null,
        ];
    }

    _out(['success'=>true,'data'=>$s,'events'=>$events,
          'attachments'=>$atts,'timeline'=>$timeline,
          'workflow'=>$wf]);

// ── إنشاء طلب عينة (المرحلة 1) ───────────────────────────────────────
case 'create':
    $client = _r($body,'client_name');
    $type   = _r($body,'sample_type');
    if (!$client || !$type) _die(['success'=>false,'message'=>'الاسم ونوع العينة مطلوبان'], 400);

    // قطاع الطالب يُحدّد تلقائياً من جلسة المستخدم (لا إدخال يدوي — منع التلاعب)
    $emp = _userStageDepts($conn, $uid);
    $mySec = (int)($emp['sector_id'] ?? 0);
    // الإنشاء مسموح فقط لـ: المالي(4) · التجاري(3) · الجودة والسلامة والاستدامة(8)
    // مع استثناء مدير النظام والرئيس التنفيذي
    $lvl = $emp['permission_level'] ?? '';
    if (!in_array($lvl, ['system_admin','CEO'], true) && !in_array($mySec, WF_CREATE_SECTORS, true))
        _die(['success'=>false,'message'=>'قطاعك غير مصرّح له بإنشاء طلبات العينات'], 403);

    // طبيعة الطلب: عميل | مورد
    $kind = _r($body,'request_kind','client');
    if (!in_array($kind, ['client','supplier'])) $kind = 'client';

    $reqSide = ($mySec === 8 || in_array((int)($emp['department_id'] ?? 0), WF_SAMPLES_DEPT_IDS, true))
        ? 'samples' : 'commercial';

    $code   = _reqNum($conn);
    $desc   = _r($body,'product_desc');
    $specs  = _r($body,'specifications');
    $purpose= _r($body,'purpose');
    $prio   = _r($body,'priority','normal');
    if (!in_array($prio,['low','normal','high','urgent'])) $prio='normal';
    $need   = _r($body,'need_date') ?: null;
    $typeOther = $type === 'أخرى' ? _r($body,'type_other') : '';

    // الحقول الشرطية حسب طبيعة الطلب
    $contractFields = [];
    if ($kind === 'client') {
        $contractFields = [
            'contract_number' => _r($body,'contract_number'),
            'letter_number'   => _r($body,'letter_number'),
            'contract_date'   => _r($body,'contract_date') ?: null,
            'contract_party'  => _r($body,'contract_party'),
        ];
    } else { // supplier
        $contractFields = [
            'supplier_cr'      => _r($body,'supplier_cr'),
            'po_code'          => _r($body,'po_code'),
            'contract_ref'     => _r($body,'contract_ref'),
            'supplier_contact' => _r($body,'supplier_contact'),
        ];
    }

    // بناء INSERT ديناميكياً (يتضمن الأعمدة الأساسية + الشرطية + القديمة الإلزامية)
    $tcols = _tableColumns($conn, 'samples');
    $insCols = ['request_number','client_name','sample_type','type_other','product_desc',
                'specifications','purpose','priority','need_date','requester_side','request_kind'];
    $insVals = [$code,$client,$type,$typeOther,$desc,$specs,$purpose,$prio,$need,$reqSide,$kind];
    foreach ($contractFields as $c => $v) { if (isset($tcols[$c])) { $insCols[] = $c; $insVals[] = $v; } }
    // أعمدة قديمة إلزامية
    if (isset($tcols['sample_code'])) { $insCols[] = 'sample_code'; $insVals[] = $code; }
    if (isset($tcols['name']))        { $insCols[] = 'name';        $insVals[] = $type ?: $client; }

    $place = implode(',', array_fill(0, count($insVals), '?'));
    $sql = "INSERT INTO samples (".implode(',', $insCols).
           ", current_stage, created_by, created_at, stage_entered_at, updated_at)
           VALUES ($place, 'new_request', ?, NOW(), NOW(), NOW())";
    $st = $conn->prepare($sql);
    if (!$st) _die(['success'=>false,'message'=>'prepare فشل: '.$conn->error], 500);
    $insVals[] = $uid;
    $types = str_repeat('s', count($insVals) - 1) . 'i';
    $st->bind_param($types, ...$insVals);
    if (!$st->execute()) _die(['success'=>false,'message'=>'execute فشل: '.$st->error], 500);
    $sid = $conn->insert_id;

    _event($conn,$sid,'created',$uid,'تم إنشاء طلب العينة ('.($kind==='client'?'عميل':'مورد').')',null,'new_request');
    _notifyStage($conn,'operations',$sid,$code,$client,'طلب عينة جديد بانتظار مراجعة العمليات');
    _out(['success'=>true,'id'=>$sid,'request_number'=>$code,'message'=>"تم إنشاء الطلب $code"]);

// ── تحديث بيانات الطلب ───────────────────────────────────────────────
case 'update':
    $id = _id($body);
    $cur = $conn->query("SELECT current_stage,created_by FROM samples WHERE id=$id")->fetch_assoc();
    if (!$cur) _die(['success'=>false,'message'=>'غير موجود'], 404);
    // التعديل متاح للمنشئ في مرحلة الطلب، أو لصاحب صلاحية المرحلة
    $isOwner = ((int)$cur['created_by'] === $uid && $cur['current_stage']==='new_request');
    if (!$isOwner && !canActOnStage($conn,$uid,$cur['current_stage']))
        _die(['success'=>false,'message'=>'غير مصرح بتعديل هذه المرحلة'], 403);

    $map = [
        'client_name'    => ['client_name','s'],
        'sample_type'    => ['sample_type','s'],
        'product_desc'   => ['product_desc','s'],
        'quantity'       => ['quantity','d'],
        'unit'           => ['unit','s'],
        'purpose'        => ['purpose','s'],
        'specifications' => ['specifications','s'],
        'priority'       => ['priority','s'],
        'need_date'      => ['need_date','s'],
        // حقول التخطيط
        'production_order_no' => ['production_order_no','s'],
        'schedule_date'       => ['schedule_date','s'],
        'expected_exec_date'  => ['expected_exec_date','s'],
        'raw_materials'       => ['raw_materials','s'],
        // حقول الإنتاج
        'prod_start'     => ['prod_start','s'],
        'prod_end'       => ['prod_end','s'],
        'batch_number'   => ['batch_number','s'],
        'produced_qty'   => ['produced_qty','d'],
        'production_notes'=> ['production_notes','s'],
        // حقول الجودة
        'inspection_result' => ['inspection_result','s'],
        'quality_notes'     => ['quality_notes','s'],
        'inspector_name'    => ['inspector_name','s'],
        'inspection_date'   => ['inspection_date','s'],
    ];
    $dateCols = ['need_date','schedule_date','expected_exec_date','prod_start',
                 'prod_end','inspection_date'];
    $sets=[]; $p=[]; $t='';
    foreach ($map as $js=>[$col,$tp]) {
        if (!array_key_exists($js,$body)) continue;
        if ($tp==='d')      $v = (float)$body[$js];
        elseif ($tp==='i')  $v = (int)$body[$js] ?: null;
        else                $v = _c((string)$body[$js]);
        if ($tp==='s' && in_array($col,$dateCols) && $v==='') $v=null;
        $sets[]="$col=?"; $p[]=$v; $t.=$tp;
    }
    if (!$sets) _die(['success'=>false,'message'=>'لا شيء للتحديث'], 400);
    $p[]=$id; $t.='i';
    $upd = $conn->prepare("UPDATE samples SET ".implode(',',$sets).",updated_at=NOW() WHERE id=?");
    $upd->bind_param($t,...$p); $upd->execute();
    _event($conn,$id,'updated',$uid,'تحديث بيانات العينة');
    _out(['success'=>true,'message'=>'تم الحفظ']);

// ── تقديم العينة للمرحلة التالية (advance) ───────────────────────────
case 'advance':
    $id = _id($body);
    $s = $conn->query("SELECT * FROM samples WHERE id=$id")->fetch_assoc();
    if (!$s) _die(['success'=>false,'message'=>'غير موجود'], 404);
    $cur = $s['current_stage'];
    if (!canActOnStage($conn,$uid,$cur))
        _die(['success'=>false,'message'=>'غير مصرح لك بتقديم هذه المرحلة'], 403);

    $wf  = WF();
    $next = $wf[$cur]['next'] ?? null;
    if (!$next) _die(['success'=>false,'message'=>'لا توجد مرحلة تالية'], 400);

    // تحقق من الحقول الإلزامية لكل مرحلة قبل التقديم
    $missing = _requiredCheck($cur, $s);
    if ($missing) _die(['success'=>false,'message'=>"يجب تعبئة: $missing"], 400);

    $note = _r($body,'notes');
    $conn->query("UPDATE samples SET current_stage='$next', stage_entered_at=NOW(), updated_at=NOW() WHERE id=$id");
    _event($conn,$id,'stage_change',$uid,
        $note ?: ($wf[$cur]['ar'].' ← '.$wf[$next]['ar']), $cur, $next);

    // إشعار الإدارة المسؤولة عن المرحلة التالية
    $nextDept = $wf[$next]['dept'];
    if ($nextDept) _notifyStage($conn,$nextDept,$id,$s['request_number'],$s['client_name'],
        'العينة وصلت إلى مرحلة: '.$wf[$next]['ar']);

    _out(['success'=>true,'new_stage'=>$next,'stage_ar'=>$wf[$next]['ar'],
          'message'=>'تم التقديم إلى: '.$wf[$next]['ar']]);

// ── رفض ──────────────────────────────────────────────────────────────
case 'reject':
    $id = _id($body);
    $reason = _r($body,'reason');
    if (!$reason) _die(['success'=>false,'message'=>'سبب الرفض مطلوب'], 400);
    $s = $conn->query("SELECT * FROM samples WHERE id=$id")->fetch_assoc();
    if (!$s) _die(['success'=>false,'message'=>'غير موجود'], 404);
    if (!canActOnStage($conn,$uid,$s['current_stage']))
        _die(['success'=>false,'message'=>'غير مصرح'], 403);
    $from = $s['current_stage'];
    $conn->query("UPDATE samples SET current_stage='rejected', reject_reason='".$conn->real_escape_string($reason)."', stage_entered_at=NOW(), updated_at=NOW() WHERE id=$id");
    _event($conn,$id,'stage_change',$uid,"رفض: $reason",$from,'rejected');
    _notifyCreator($conn,(int)$s['created_by'],$id,$s['request_number'],$s['client_name'],
        'تم رفض العينة: '.$reason,'urgent');
    _out(['success'=>true,'message'=>'تم تسجيل الرفض']);

// ── طلب تعديل (الجودة → الإنتاج) ─────────────────────────────────────
case 'need_modification':
    $id = _id($body);
    $note = _r($body,'notes');
    if (!$note) _die(['success'=>false,'message'=>'ملاحظات الجودة مطلوبة'], 400);
    $s = $conn->query("SELECT * FROM samples WHERE id=$id")->fetch_assoc();
    if (!$s) _die(['success'=>false,'message'=>'غير موجود'], 404);
    if ($s['current_stage'] !== 'quality_check')
        _die(['success'=>false,'message'=>'هذا الإجراء متاح في مرحلة الجودة فقط'], 400);
    if (!canActOnStage($conn,$uid,'quality_check'))
        _die(['success'=>false,'message'=>'غير مصرح'], 403);
    $conn->query("UPDATE samples SET current_stage='production', quality_notes='".$conn->real_escape_string($note)."', stage_entered_at=NOW(), updated_at=NOW() WHERE id=$id");
    _event($conn,$id,'stage_change',$uid,"إرجاع للإنتاج للتعديل: $note",'quality_check','production');
    _notifyStage($conn,'production',$id,$s['request_number'],$s['client_name'],
        'العينة أُرجعت للإنتاج بطلب تعديل من الجودة');
    _out(['success'=>true,'message'=>'تم إرجاع العينة للإنتاج']);

// ── الإرسال عبر موظف الشركة (لا شركات شحن) ───────────────────────────
case 'dispatch':
    $id = _id($body);
    $s = $conn->query("SELECT * FROM samples WHERE id=$id")->fetch_assoc();
    if (!$s) _die(['success'=>false,'message'=>'غير موجود'], 404);
    if ($s['current_stage'] !== 'ready_for_dispatch')
        _die(['success'=>false,'message'=>'العينة ليست جاهزة للإرسال'], 400);
    if (!canActOnStage($conn,$uid,'ready_for_dispatch'))
        _die(['success'=>false,'message'=>'غير مصرح'], 403);
    $courier   = _r($body,'dispatched_by_name'); // اسم الموظف المندوب
    $recipient = _r($body,'recipient_party');     // الجهة المستلمة
    if (!$courier)   _die(['success'=>false,'message'=>'اسم الموظف المندوب مطلوب'], 400);
    if (!$recipient) _die(['success'=>false,'message'=>'الجهة المستلمة مطلوبة'], 400);
    // التاريخ تلقائي من الخادم (NOW) — لا إدخال يدوي لمنع التلاعب
    $st = $conn->prepare("UPDATE samples SET current_stage='dispatched',
        dispatched_by_name=?, recipient_party=?, dispatch_date=NOW(),
        stage_entered_at=NOW(), updated_at=NOW() WHERE id=?");
    $st->bind_param('ssi',$courier,$recipient,$id); $st->execute();
    _event($conn,$id,'stage_change',$uid,"إرسال عبر الموظف: $courier — إلى: $recipient",'ready_for_dispatch','dispatched');
    _notifyCreator($conn,(int)$s['created_by'],$id,$s['request_number'],$s['client_name'],
        "تم إرسال العينة عبر الموظف $courier",'info');
    _out(['success'=>true,'message'=>'تم تسجيل الإرسال']);

// ── تأكيد التسليم (إدارة العينات أو القطاع التجاري) — تاريخ تلقائي ────
case 'mark_delivered':
    $id = _id($body);
    $s = $conn->query("SELECT * FROM samples WHERE id=$id")->fetch_assoc();
    if (!$s) _die(['success'=>false,'message'=>'غير موجود'], 404);
    if ($s['current_stage'] !== 'dispatched')
        _die(['success'=>false,'message'=>'العينة ليست في حالة إرسال'], 400);
    if (!canActOnStage($conn,$uid,'dispatched'))
        _die(['success'=>false,'message'=>'غير مصرح'], 403);
    $recv = _r($body,'received_by_name'); // اسم مستلم الجهة (اختياري)
    $extra = $recv ? ", received_by_name='".$conn->real_escape_string($recv)."'" : '';
    $conn->query("UPDATE samples SET current_stage='delivered', delivered_at=NOW()$extra,
        stage_entered_at=NOW(), updated_at=NOW() WHERE id=$id");
    _event($conn,$id,'stage_change',$uid, $recv ? "تم التسليم — استلمها: $recv" : 'تم تأكيد تسليم العينة','dispatched','delivered');
    _notifyCreator($conn,(int)$s['created_by'],$id,$s['request_number'],$s['client_name'],
        'اكتملت دورة العينة — تم التسليم','info');
    _out(['success'=>true,'message'=>'تم تأكيد التسليم']);

// ── رفع مرفق ─────────────────────────────────────────────────────────
case 'upload_attachment':
    $id = (int)($_POST['id'] ?? 0);
    if (!$id) _die(['success'=>false,'message'=>'id مطلوب'], 400);
    if (!isset($_FILES['file'])) _die(['success'=>false,'message'=>'لا ملف'], 400);
    $f = $_FILES['file'];
    if ($f['error'] !== UPLOAD_ERR_OK) _die(['success'=>false,'message'=>'خطأ رفع'], 400);
    if ($f['size'] > 10485760) _die(['success'=>false,'message'=>'> 10MB'], 400);
    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    if (!in_array($ext,['pdf','jpg','jpeg','png','webp','xlsx','docx','doc'])) _die(['success'=>false,'message'=>'نوع غير مدعوم'], 400);
    $dir = dirname(__DIR__).'/uploads/samples/';
    if (!is_dir($dir)) mkdir($dir,0755,true);
    $fn  = "sample_{$id}_".time()."_".mt_rand(100,999).".$ext";
    if (!move_uploaded_file($f['tmp_name'],$dir.$fn)) _die(['success'=>false,'message'=>'فشل الحفظ'], 500);
    $rel = "uploads/samples/$fn";
    $cur = $conn->query("SELECT current_stage FROM samples WHERE id=$id")->fetch_assoc()['current_stage'] ?? '';
    $name= $conn->real_escape_string($f['name']);
    $sz  = (int)$f['size'];
    $conn->query("INSERT INTO sample_attachments(sample_id,file_name,file_path,file_size,stage,uploaded_by,uploaded_at)
                  VALUES($id,'$name','$rel',$sz,'".$conn->real_escape_string($cur)."',$uid,NOW())");
    _event($conn,$id,'attachment',$uid,"رفع مرفق: ".$f['name']);
    _out(['success'=>true,'file_path'=>$rel,'message'=>'تم رفع المرفق']);

// ── حذف (أرشفة منطقية للمرفوض/المكتمل فقط — admin) ───────────────────
case 'delete':
    $id = _id($body);
    $emp = _userStageDepts($conn,$uid);
    if (($emp['permission_level'] ?? '') !== 'system_admin')
        _die(['success'=>false,'message'=>'الحذف لمدير النظام فقط'], 403);
    $conn->query("DELETE FROM sample_attachments WHERE sample_id=$id");
    $conn->query("DELETE FROM sample_events WHERE sample_id=$id");
    $conn->query("DELETE FROM samples WHERE id=$id");
    _out(['success'=>true,'message'=>'تم الحذف']);

// ── قوائم منسدلة ─────────────────────────────────────────────────────
case 'options':
    switch ($_GET['type'] ?? '') {
        case 'workflow':
            $wf = WF(); $out=[];
            foreach (WF_ORDER() as $k) $out[] = ['key'=>$k,'ar'=>$wf[$k]['ar'],'dept'=>$wf[$k]['dept'],'color'=>$wf[$k]['color']];
            _out(['success'=>true,'data'=>$out]);
        case 'departments':
            _out(['success'=>true,'data'=>$conn->query("SELECT id,name,code FROM departments WHERE is_active=1 ORDER BY name")->fetch_all(MYSQLI_ASSOC)]);
        default:
            _die(['success'=>false,'message'=>'type غير معروف'], 400);
    }

// ── فحص العينات المتأخرة (cron / يدوي) ───────────────────────────────
case 'check_overdue':
    $n=0;
    $q = $conn->query("
        SELECT id, request_number, client_name, created_by, current_stage
        FROM samples
        WHERE current_stage NOT IN('delivered','rejected')
          AND need_date IS NOT NULL AND need_date < CURDATE()
          AND overdue_notified IS NULL
    ");
    if ($q) while ($row=$q->fetch_assoc()) {
        if (function_exists('createInternalNotification') && $row['created_by'])
            createInternalNotification('sample_overdue','sample',(int)$row['id'],
                $row['request_number'],$row['client_name'],'تجاوزت العينة تاريخ الاحتياج','urgent',(int)$row['created_by']);
        $conn->query("UPDATE samples SET overdue_notified=NOW() WHERE id={$row['id']}");
        _event($conn,(int)$row['id'],'overdue',$uid,'تنبيه: تجاوز تاريخ الاحتياج');
        $n++;
    }
    _out(['success'=>true,'notified'=>$n]);

// ── بيانات المستخدم الحالي (لتعبئة النموذج تلقائياً) ─────────────────
case 'whoami':
    $r = $conn->query("
        SELECT e.id, e.name, e.permission_level, e.department_id,
               d.name dept_name,
               COALESCE(sd.name, d.name) sector_name,
               COALESCE(d.sector_id, IF(d.dept_type='sector', d.id, d.parent_id)) sector_id
        FROM employees e
        LEFT JOIN departments d  ON d.id = e.department_id
        LEFT JOIN departments sd ON sd.id = COALESCE(d.sector_id, IF(d.dept_type='sector', d.id, d.parent_id))
        WHERE e.id=$uid LIMIT 1
    ")->fetch_assoc();
    $secId = (int)($r['sector_id'] ?? 0);
    $reqSide = ($secId === 8 || in_array((int)($r['department_id'] ?? 0), WF_SAMPLES_DEPT_IDS, true)) ? 'samples' : 'commercial';
    $lvl = $r['permission_level'] ?? '';
    $canCreate = in_array($lvl, ['system_admin','CEO'], true) || in_array($secId, WF_CREATE_SECTORS, true);
    _out(['success'=>true,'data'=>[
        'name'           => $r['name'] ?? '',
        'dept_name'      => $r['dept_name'] ?? '',
        'sector_name'    => $r['sector_name'] ?? ($reqSide==='samples'?'إدارة العينات':'القطاع التجاري'),
        'requester_side' => $reqSide,
        'can_create'     => $canCreate ? 1 : 0,
    ]]);

// ── SLA: جلب المهل ───────────────────────────────────────────────────
case 'sla_list':
    $rows = $conn->query("SELECT stage, stage_ar, sla_days FROM sample_sla")->fetch_all(MYSQLI_ASSOC);
    // رتّبها حسب ترتيب الـ workflow
    $order = array_flip(WF_ORDER());
    usort($rows, fn($a,$b)=>($order[$a['stage']]??99)<=>($order[$b['stage']]??99));
    _out(['success'=>true,'data'=>$rows]);

// ── SLA: حفظ المهل (مدير النظام / صلاحية الإعدادات) ──────────────────
case 'sla_save':
    $emp = _userStageDepts($conn,$uid);
    if (!in_array(($emp['permission_level'] ?? ''), ['system_admin','CEO','sector_head']))
        _die(['success'=>false,'message'=>'غير مصرح بتعديل الـ SLA'], 403);
    $items = $body['items'] ?? [];
    if (!is_array($items) || !$items) _die(['success'=>false,'message'=>'لا بيانات'], 400);
    foreach ($items as $it) {
        $stg = $conn->real_escape_string($it['stage'] ?? '');
        $d   = max(0, (int)($it['sla_days'] ?? 0));
        if ($stg) $conn->query("UPDATE sample_sla SET sla_days=$d WHERE stage='$stg'");
    }
    _out(['success'=>true,'message'=>'تم حفظ مهل الـ SLA']);

default:
    _die(['success'=>false,'message'=>"action غير معروف: $action"], 400);
}

// ════════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════════
function _out(array $d, int $s=200): void {
    if (ob_get_level()) ob_end_clean();
    http_response_code($s);
    echo json_encode($d, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}
function _die(array $d, int $s=400): void { _out($d,$s); }
function _c(string $v): string { return htmlspecialchars(trim($v), ENT_QUOTES, 'UTF-8'); }
function _r(array $a, string $k, string $def=''): string { return _c((string)($a[$k] ?? $def)); }
function _id(array $a=[]): int {
    $id = (int)(empty($a) ? ($_GET['id'] ?? 0) : ($a['id'] ?? 0));
    if (!$id) _die(['success'=>false,'message'=>'id مطلوب'], 400);
    return $id;
}
function _reqNum(mysqli $conn): string {    $conn->query("LOCK TABLES samples WRITE");
    $yr = date('Y');
    $n  = (int)$conn->query("SELECT COUNT(*) FROM samples WHERE YEAR(created_at)='$yr'")->fetch_row()[0];
    $conn->query("UNLOCK TABLES");
    return "SR-$yr-".str_pad($n+1, 4, '0', STR_PAD_LEFT);
}
/** توليد باركود EAN-13 — البادئة 628 (السعودية) + 0001 (الشركة) + معرّف العينة + رقم تحقق */
function _ean13(int $sampleId): string {
    $base  = '6280001' . str_pad((string)$sampleId, 5, '0', STR_PAD_LEFT); // 12 رقماً
    $sum = 0;
    for ($i = 0; $i < 12; $i++) $sum += (int)$base[$i] * ($i % 2 === 0 ? 1 : 3);
    $check = (10 - ($sum % 10)) % 10;
    return $base . $check; // 13 رقماً
}
function _event(mysqli $conn, int $sid, string $type, int $uid, string $desc, ?string $from=null, ?string $to=null): void {
    $type = $conn->real_escape_string($type);
    $desc = $conn->real_escape_string($desc);
    $from = $from ? "'".$conn->real_escape_string($from)."'" : 'NULL';
    $to   = $to   ? "'".$conn->real_escape_string($to)."'"   : 'NULL';
    $conn->query("INSERT INTO sample_events(sample_id,event_type,actor_id,description,from_stage,to_stage,created_at)
                  VALUES($sid,'$type',$uid,'$desc',$from,$to,NOW())");
}
/** إشعار موظفي القطاع/الإدارة المسؤولة عن المرحلة (حسب sector_id الفعلي) */
function _notifyStage(mysqli $conn, string $deptCode, int $sid, string $reqNum, string $title, string $msg): void {
    if (!function_exists('createInternalNotification')) return;
    $sector = ['commercial'=>3,'operations'=>7,'production'=>9,'quality'=>8,'samples'=>8][$deptCode] ?? null;
    if (!$sector) return;
    // خصّص العينات لقسم إدارة العينات (88) إن وُجد، وإلا كل قطاع الجودة
    $extra = '';
    if ($deptCode === 'samples') {
        $ids = implode(',', WF_SAMPLES_DEPT_IDS);
        $extra = " OR e.department_id IN($ids)";
    }
    $r = $conn->query("
        SELECT e.id FROM employees e
        JOIN departments d ON d.id=e.department_id
        WHERE e.is_active=1
          AND (
              COALESCE(d.sector_id, IF(d.dept_type='sector', d.id, d.parent_id)) = $sector
              $extra
          )
        LIMIT 25
    ");
    if ($r) while ($row=$r->fetch_assoc())
        createInternalNotification('sample_stage','sample',$sid,$reqNum,$title,$msg,'info',(int)$row['id']);
}
function _notifyCreator(mysqli $conn, int $creatorId, int $sid, string $reqNum, string $title, string $msg, string $sev='info'): void {
    if ($creatorId && function_exists('createInternalNotification'))
        createInternalNotification('sample_update','sample',$sid,$reqNum,$title,$msg,$sev,$creatorId);
}
/** الحقول الإلزامية قبل التقديم من كل مرحلة */
function _requiredCheck(string $stage, array $s): string {
    $need = [];
    switch ($stage) {
        case 'operations_review':
            if (!$s['production_order_no']) $need[]='رقم أمر الإنتاج';
            if (!$s['schedule_date'])       $need[]='تاريخ الجدولة';
            break;
        case 'production':
            if (!$s['batch_number']) $need[]='رقم التشغيلة';
            if (!$s['produced_qty']) $need[]='الكمية المنتجة';
            break;
        case 'quality_check':
            if (!$s['inspection_result']) $need[]='نتيجة الفحص';
            if (!$s['inspector_name'])    $need[]='اسم الفاحص';
            break;
    }
    return implode('، ', $need);
}

// ════════════════════════════════════════════════════════════════════
//  Schema — تُنشأ مرة واحدة (idempotent عبر SHOW COLUMNS اللحظي)
// ════════════════════════════════════════════════════════════════════
/** يُعيد أعمدة جدول كمصفوفة [اسم_صغير => صف SHOW COLUMNS] — آمن ضد حالة النتائج */
function _tableColumns(mysqli $conn, string $table): array {
    $out = [];
    $t = $conn->real_escape_string($table);
    // SHOW COLUMNS لحظي ويعكس تعديلات الجلسة فوراً (عكس INFORMATION_SCHEMA المُخزَّن مؤقتاً)
    $r = $conn->query("SHOW COLUMNS FROM `$t`");
    if ($r) {
        while ($row = $r->fetch_assoc()) {
            $out[strtolower($row['Field'])] = [
                'Field'   => $row['Field'],
                'Null'    => $row['Null'],          // 'YES' | 'NO'
                'Default' => $row['Default'],
                'Type'    => $row['Type'],
                'Extra'   => $row['Extra'],
            ];
        }
        $r->free();
    }
    return $out;
}

function _boot(mysqli $conn): void {
    // ── 1) جدول samples: إنشاء إن لم يوجد ───────────────────────────
    $conn->query("CREATE TABLE IF NOT EXISTS samples(
        id INT AUTO_INCREMENT PRIMARY KEY,
        created_by INT NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // ── 2) الأعمدة المطلوبة للـ Workflow (كلها NULL-able لتعايش الجدول القديم) ──
    $cols = [
        'request_number'      => "VARCHAR(30) NULL",
        'client_name'         => "VARCHAR(255) NULL",
        'sample_type'         => "VARCHAR(150) NULL",
        'product_desc'        => "TEXT NULL",
        'quantity'            => "DECIMAL(12,2) DEFAULT 0",
        'unit'                => "VARCHAR(30) DEFAULT 'piece'",
        'purpose'             => "TEXT NULL",
        'specifications'      => "TEXT NULL",
        'priority'            => "ENUM('low','normal','high','urgent') DEFAULT 'normal'",
        'need_date'           => "DATE NULL",
        'requester_side'      => "ENUM('commercial','samples') DEFAULT 'commercial'",
        'request_kind'        => "ENUM('client','supplier') DEFAULT 'client'",
        'type_other'          => "VARCHAR(150) NULL",
        'letter_number'       => "VARCHAR(100) NULL",
        'contract_number'     => "VARCHAR(100) NULL",
        'contract_date'       => "DATE NULL",
        'contract_party'      => "VARCHAR(255) NULL",
        'supplier_cr'         => "VARCHAR(60) NULL",
        'po_code'             => "VARCHAR(60) NULL",
        'contract_ref'        => "VARCHAR(100) NULL",
        'supplier_contact'    => "VARCHAR(150) NULL",
        'current_stage'       => "VARCHAR(40) NOT NULL DEFAULT 'new_request'",
        'reject_reason'       => "TEXT NULL",
        'production_order_no' => "VARCHAR(60) NULL",
        'schedule_date'       => "DATE NULL",
        'expected_exec_date'  => "DATE NULL",
        'raw_materials'       => "TEXT NULL",
        'prod_start'          => "DATETIME NULL",
        'prod_end'            => "DATETIME NULL",
        'batch_number'        => "VARCHAR(60) NULL",
        'produced_qty'        => "DECIMAL(12,2) DEFAULT 0",
        'production_notes'    => "TEXT NULL",
        'inspection_result'   => "ENUM('','pass','fail','conditional') DEFAULT ''",
        'quality_notes'       => "TEXT NULL",
        'inspector_name'      => "VARCHAR(150) NULL",
        'inspection_date'     => "DATE NULL",
        'shipping_company'    => "VARCHAR(150) NULL",
        'tracking_number'     => "VARCHAR(100) NULL",
        'dispatched_by_name'  => "VARCHAR(150) NULL",
        'recipient_party'     => "VARCHAR(255) NULL",
        'received_by_name'    => "VARCHAR(150) NULL",
        'dispatch_date'       => "DATETIME NULL",
        'delivered_at'        => "DATETIME NULL",
        'stage_entered_at'    => "DATETIME NULL",
        'overdue_notified'    => "DATETIME NULL",
        'barcode'             => "VARCHAR(20) NULL",
    ];

    // الأعمدة الموجودة فعلاً
    $existing = _tableColumns($conn, 'samples');

    // أضف الناقص فقط (آمن: SHOW COLUMNS لحظي يعكس تعديلات الجلسة)
    foreach ($cols as $name => $def) {
        if (!isset($existing[strtolower($name)])) {
            @$conn->query("ALTER TABLE samples ADD COLUMN `$name` $def");
        }
    }

    // ── 2.1) توفيق ENUM الأولوية مع القيم القديمة (high/medium/low) ──
    // النظام القديم يستخدم medium؛ نوسّع الـ ENUM ونحوّل القيم القديمة.
    if (isset($existing['priority'])) {
        $cur = strtolower($existing['priority']['Type']);
        if (strpos($cur, "'normal'") === false || strpos($cur, "'urgent'") === false) {
            // وسّع الـ ENUM ليقبل كل القيم القديمة والجديدة مؤقتاً
            $conn->query("ALTER TABLE samples MODIFY COLUMN `priority`
                ENUM('low','normal','high','urgent','medium') DEFAULT 'normal'");
            // حوّل medium → normal
            $conn->query("UPDATE samples SET priority='normal' WHERE priority='medium'");
            // ثبّت الـ ENUM النهائي
            $conn->query("ALTER TABLE samples MODIFY COLUMN `priority`
                ENUM('low','normal','high','urgent') DEFAULT 'normal'");
        }
    }

    // ── 2.2) عمود unit القديم ENUM محدود → حوّله VARCHAR لقبول وحدات حرة (عربية) ──
    if (isset($existing['unit']) && stripos($existing['unit']['Type'], 'enum') === 0) {
        $conn->query("ALTER TABLE samples MODIFY COLUMN `unit` VARCHAR(30) DEFAULT 'piece'");
    }

    // ── 2.3) أعمدة ENUM قديمة يكتب فيها الـ workflow نصاً حراً → حوّلها لنوع نصّي ──
    // (purpose كان ENUM محدود؛ category قد يكون ENUM) — نمنع خطأ "Data truncated"
    $enumToText = [
        'purpose'  => 'TEXT NULL',
        'category' => 'VARCHAR(150) NULL',
    ];
    foreach ($enumToText as $col => $newType) {
        if (isset($existing[$col]) && stripos($existing[$col]['Type'], 'enum') === 0) {
            @$conn->query("ALTER TABLE samples MODIFY COLUMN `$col` $newType");
        }
    }

    // ── 3) تليين الأعمدة القديمة الإلزامية (NOT NULL بلا default) كي لا يفشل الإدراج ──
    // مثل sample_code / name / category من النظام المخزني القديم
    $afterCols = _tableColumns($conn, 'samples');
    foreach ($afterCols as $f => $row) {
        if (in_array($f, ['id','current_stage','created_by'])) continue;
        $isNotNull = ($row['Null'] === 'NO');
        $noDefault = ($row['Default'] === null && stripos((string)$row['Extra'],'auto_increment') === false);
        if ($isNotNull && $noDefault && !array_key_exists($f, $cols)) {
            // اجعله NULL-able حتى لا يعطّل الـ workflow الجديد
            $type = $row['Type'];
            @$conn->query("ALTER TABLE samples MODIFY COLUMN `{$row['Field']}` $type NULL");
        }
    }

    // ── 4) فهارس (تجاهل الخطأ إن وُجدت) ─────────────────────────────
    foreach ([
        "idx_stage"    => "current_stage",
        "idx_priority" => "priority",
        "idx_creator"  => "created_by",
        "idx_need"     => "need_date",
    ] as $idx => $col) {
        $chk = $conn->query("SHOW INDEX FROM samples WHERE Key_name='$idx'");
        if ($chk && $chk->num_rows === 0) @$conn->query("ALTER TABLE samples ADD INDEX `$idx`(`$col`)");
    }

    // ── 5) ضبط القيم الفارغة للسجلات القديمة (إن وُجدت) ─────────────
    // ترحيل status المخزني القديم → مرحلة workflow مناسبة (مرة واحدة فقط:
    // فقط للسجلات التي لم تُلمس بعد، أي current_stage فارغ/افتراضي وعمود status قديم موجود)
    $hasStatus = false;
    $sc = $conn->query("SHOW COLUMNS FROM samples LIKE 'status'");
    if ($sc && $sc->num_rows) $hasStatus = true;
    // ترحيل: مرحلة «التخطيط» المحذوفة → مدمجة في «مراجعة وتخطيط العمليات»
    $conn->query("UPDATE samples SET current_stage='operations_review' WHERE current_stage='planning'");
    if ($hasStatus) {
        // طبّق الترحيل فقط على السجلات التي ما زالت على القيمة الافتراضية ولم يُولّد لها رقم طلب
        $conn->query("UPDATE samples SET current_stage='delivered'  WHERE (request_number IS NULL OR request_number='') AND status='approved'");
        $conn->query("UPDATE samples SET current_stage='rejected'   WHERE (request_number IS NULL OR request_number='') AND status='rejected'");
        $conn->query("UPDATE samples SET current_stage='delivered'  WHERE (request_number IS NULL OR request_number='') AND status='archived'");
        $conn->query("UPDATE samples SET current_stage='new_request' WHERE (request_number IS NULL OR request_number='') AND status IN('new','testing')");
        // عبّئ حقول الـ workflow من الأعمدة القديمة المقابلة (اسم العميل/النوع) إن كانت فارغة
        $conn->query("UPDATE samples SET client_name=COALESCE(NULLIF(client_name,''), contract_party, 'غير محدد') WHERE client_name IS NULL OR client_name=''");
        $conn->query("UPDATE samples SET sample_type=COALESCE(NULLIF(sample_type,''), name, 'عينة') WHERE sample_type IS NULL OR sample_type=''");
        $conn->query("UPDATE samples SET request_number=sample_code WHERE (request_number IS NULL OR request_number='') AND sample_code IS NOT NULL AND sample_code<>''");
    }
    $conn->query("UPDATE samples SET current_stage='new_request' WHERE current_stage IS NULL OR current_stage=''");
    $conn->query("UPDATE samples SET stage_entered_at=created_at WHERE stage_entered_at IS NULL");

    $conn->query("CREATE TABLE IF NOT EXISTS sample_events(
        id INT AUTO_INCREMENT PRIMARY KEY,
        sample_id   INT NOT NULL,
        event_type  VARCHAR(40) NOT NULL,
        actor_id    INT NOT NULL,
        description TEXT NOT NULL,
        from_stage  VARCHAR(40),
        to_stage    VARCHAR(40),
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_s(sample_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // جدول sample_events قد يكون موجوداً مسبقاً بلا from_stage/to_stage → أضفهما بأمان
    $evCols = _tableColumns($conn, 'sample_events');
    if (!isset($evCols['from_stage'])) @$conn->query("ALTER TABLE sample_events ADD COLUMN `from_stage` VARCHAR(40) NULL");
    if (!isset($evCols['to_stage']))   @$conn->query("ALTER TABLE sample_events ADD COLUMN `to_stage` VARCHAR(40) NULL");

    $conn->query("CREATE TABLE IF NOT EXISTS sample_attachments(
        id INT AUTO_INCREMENT PRIMARY KEY,
        sample_id   INT NOT NULL,
        file_name   VARCHAR(255) NOT NULL,
        file_path   VARCHAR(500) NOT NULL,
        file_size   INT DEFAULT 0,
        stage       VARCHAR(40),
        uploaded_by INT NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_s(sample_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // ── جدول SLA لكل مرحلة (قابل للتعديل من الإعدادات) ──────────────
    $conn->query("CREATE TABLE IF NOT EXISTS sample_sla(
        stage      VARCHAR(40) PRIMARY KEY,
        stage_ar   VARCHAR(80),
        sla_days   INT NOT NULL DEFAULT 2,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    // تعبئة المهل الافتراضية مرة واحدة (لا تُكتب فوق تعديلات المستخدم)
    foreach (WF() as $k => $v) {
        if (($v['sla_days'] ?? 0) <= 0) continue;
        $kEsc = $conn->real_escape_string($k);
        $arEsc = $conn->real_escape_string($v['ar']);
        $d = (int)$v['sla_days'];
        $conn->query("INSERT IGNORE INTO sample_sla(stage,stage_ar,sla_days) VALUES('$kEsc','$arEsc',$d)");
    }
}