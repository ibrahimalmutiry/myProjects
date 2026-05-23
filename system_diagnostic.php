<?php
/**
 * ════════════════════════════════════════════════════════════════
 *  تشخيص النظام v5 — Workflow Management System
 *  ضعه في الجذر بجانب index.php ← ibrahimalmutairi.com/system_diagnostic.php
 *  ⚠️ احذفه فور الانتهاء!
 * ════════════════════════════════════════════════════════════════
 */
ini_set('display_errors', 1);
error_reporting(E_ALL);
mysqli_report(MYSQLI_REPORT_OFF);
define('T0', microtime(true));

$ROOT     = __DIR__;
$INCLUDES = $ROOT . '/includes';
$API_DIR  = $ROOT . '/api';

// ─── مساعدات ────────────────────────────────────────────────────
$R = [];
function add(string $s, string $l, string $d = ''): void { global $R; $R[] = ['s'=>$s,'l'=>$l,'d'=>$d]; }
function ok(string $l,  string $d=''):void { add('PASS',$l,$d); }
function no(string $l,  string $d=''):void { add('FAIL',$l,$d); }
function meh(string $l, string $d=''):void { add('WARN',$l,$d); }
function nfo(string $l, string $d=''):void { add('INFO',$l,$d); }
function sec(string $l):void               { add('SEC', $l,''); }

function chkFile(string $dir, string $file, string $desc): bool {
    $p = rtrim($dir,'/') . '/' . $file;
    if (file_exists($p)) { ok($desc, $file.' ('.number_format(filesize($p)).' B)'); return true; }
    no($desc, $file.' — غير موجود في '.basename($dir).'/');
    return false;
}

// ════════════════════════════════════════════════════════════════
// §0  هيكل المجلدات
// ════════════════════════════════════════════════════════════════
sec('📍 هيكل المشروع');
nfo('ROOT',     $ROOT);
nfo('includes', $INCLUDES);
nfo('api',      $API_DIR);
nfo('محتويات الجذر', implode(', ', array_slice(array_diff(scandir($ROOT),['..','.']) ,0,30)));

is_dir($INCLUDES) ? ok('includes/ ✓') : no('includes/ مفقود!');
is_dir($API_DIR)  ? ok('api/ ✓')      : no('api/ مفقود!');

// ════════════════════════════════════════════════════════════════
// §1  PHP
// ════════════════════════════════════════════════════════════════
sec('🔧 بيئة PHP');
nfo('PHP', PHP_VERSION);
version_compare(PHP_VERSION,'8.0','>=') ? ok('PHP >= 8.0') : no('PHP < 8.0');
foreach (['mysqli','mbstring','json','session','openssl','fileinfo','zip'] as $e)
    extension_loaded($e) ? ok("ext: $e") : no("ext: $e",'غير مُحمَّل');

// ════════════════════════════════════════════════════════════════
// §2  .env
// ════════════════════════════════════════════════════════════════
sec('📄 ملف .env');
$envData  = [];
$envFound = false;
foreach ([dirname($ROOT).'/.env', $ROOT.'/.env', dirname($ROOT,2).'/.env'] as $ep) {
    if (!file_exists($ep)) continue;
    $inside = str_starts_with(realpath($ep), realpath($ROOT));
    ok('.env موجود'.($inside?' (داخل public_html — انقله لمستوى أعلى!)':' ✓'), realpath($ep));
    if ($inside) meh('أمان','.env داخل public_html مكشوف — انقله إلى: '.dirname($ROOT).'/.env');
    $envFound = true;
    foreach (file($ep, FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES) as $ln) {
        $ln = trim($ln);
        if (!$ln || $ln[0]==='#' || !str_contains($ln,'=')) continue;
        [$k,$v] = array_map('trim', explode('=',$ln,2));
        if (strlen($v)>=2 && (($v[0]==='"'&&$v[-1]==='"')||($v[0]==="'"&&$v[-1]==="'"))) $v=substr($v,1,-1);
        $envData[$k]=$v;
    }
    break;
}
if (!$envFound) no('.env غير موجود','ضروري للاتصال بـ DB');
foreach (['DB_HOST','DB_NAME','DB_USER','DB_PASS','DB_CHARSET','APP_ENV'] as $k)
    isset($envData[$k])
        ? ok(".env → $k", $k==='DB_PASS'?str_repeat('*',min(strlen($envData[$k]),8)):($envData[$k]?:'(فارغ)'))
        : meh(".env → $k",'مفقود');

// ════════════════════════════════════════════════════════════════
// §3  ملفات includes/
// ════════════════════════════════════════════════════════════════
sec('📁 includes/');
foreach ([
    'config.php'=>'الإعدادات','functions.php'=>'الدوال العامة','auth.php'=>'المصادقة',
    'permissions_functions.php'=>'الصلاحيات','pr_functions.php'=>'دوال طلبات الشراء',
    'bank_functions.php'=>'دوال البنك','bank_investment_functions.php'=>'دوال الاستثمار',
    'archive_functions.php'=>'دوال الأرشيف','correspondence_functions.php'=>'دوال الخطابات',
    'notification_functions.php'=>'دوال الإشعارات','sla_functions.php'=>'دوال SLA',
    'dispatch_functions.php'=>'دوال الإرسال',
] as $f=>$d) chkFile($INCLUDES,$f,$d);

// ════════════════════════════════════════════════════════════════
// §4  ملفات api/
// ════════════════════════════════════════════════════════════════
sec('📁 api/');
foreach ([
    'purchase_requests_api.php'=>'API طلبات الشراء',
    'correspondence_api.php'=>'API الخطابات',
    'budget_workflow_api.php'=>'API سير الموازنة',
    'budget_plan_api.php'=>'API خطط الموازنة',
    'ceo_approvals_api.php'=>'API موافقات الرئيس',
    'bank_deposits.php'=>'API البنك (يُرسَل عبر api/index.php)',
    'daily_payments_api.php'=>'API المدفوعات',
    'archive_api.php'=>'API الأرشيف',
    'reports_api.php'=>'API التقارير',
    'sla_central.php'=>'API مستوى الخدمة',
    'suppliers_api.php'=>'API الموردين',
    'security_log_api.php'=>'API سجل الأمان',
    'backup_api.php'=>'API النسخ الاحتياطي',
    'db_admin_api.php'=>'API إدارة DB',
] as $f=>$d) chkFile($API_DIR,$f,$d);

// راوتر api/index.php
if (file_exists($API_DIR.'/index.php'))
    ok('api/index.php (الراوتر الرئيسي ✓)', number_format(filesize($API_DIR.'/index.php')).' B');
else
    meh('api/index.php','غير موجود — الـ fetch من JS يستدعي api/?action=xxx');

// ════════════════════════════════════════════════════════════════
// §5  Bundle JS
// ════════════════════════════════════════════════════════════════
sec('📦 Bundle JS');
$manifestPaths = [$ROOT.'/js/manifest.json', $ROOT.'/manifest.json'];
$mFound = false;
foreach ($manifestPaths as $mp) {
    if (!file_exists($mp)) continue;
    $mFound = true;
    $mData  = @json_decode(file_get_contents($mp), true) ?: [];
    nfo('manifest.json', $mp);
    $bundle = is_array($mData) ? (array_values($mData)[0]??null) : null;
    if ($bundle) {
        $bPaths = [$ROOT.'/js/'.$bundle, $ROOT.'/'.$bundle];
        $bFound = false;
        foreach ($bPaths as $bp) {
            if (file_exists($bp)) { ok('Bundle ✓', $bundle.' — '.number_format(filesize($bp)).' B'); $bFound=true; break; }
        }
        if (!$bFound) no('Bundle مفقود', 'manifest يشير إلى '.$bundle.' لكنه غير موجود — شغّل: node build.js');
    }
    break;
}
if (!$mFound) no('manifest.json مفقود','شغّل: node build.js — الواجهة لن تعمل بدونه');

// ════════════════════════════════════════════════════════════════
// §6  مسارات require_once
// ════════════════════════════════════════════════════════════════
sec('🔗 مسارات require_once');
$apiFiles = array_filter(array_merge(
    glob($API_DIR.'/*.php')?: [],
    glob($INCLUDES.'/*.php')?: []
),'file_exists');

$badFiles = [];
foreach ($apiFiles as $af) {
    $c = file_get_contents($af); $b = basename($af);
    foreach (explode("\n",$c) as $ln=>$line) {
        if (!str_contains($line,'require') && !str_contains($line,'include')) continue;
        if (!preg_match('/["\']([^"\']+\.php)["\']/', $line, $m)) continue;
        $reqPath = $m[1];
        // تخطي المسارات المطلقة
        if (str_starts_with($reqPath,'/') || str_starts_with($reqPath,'http')) continue;
        $resolved = realpath(dirname($af).'/'.$reqPath);
        if ($resolved && file_exists($resolved)) continue;
        if (str_contains($reqPath,'functions.php')||str_contains($reqPath,'config.php')||str_contains($reqPath,'auth.php')) {
            no("مسار خاطئ: $b", 'سطر '.($ln+1).': '.$reqPath.' ← غير قابل للحل');
            $badFiles[]=$b; break;
        }
    }
}
empty($badFiles) ? ok('جميع مسارات require_once سليمة ✓') : null;

// ════════════════════════════════════════════════════════════════
// §7  قاعدة البيانات
// ════════════════════════════════════════════════════════════════
sec('🗄️ قاعدة البيانات');
$dbHost = $envData['DB_HOST']??'localhost';
$dbName = $envData['DB_NAME']??'';
$dbUser = $envData['DB_USER']??'';
$dbPass = $envData['DB_PASS']??'';
$dbCs   = $envData['DB_CHARSET']??'utf8mb4';

// fallback من includes/config.php
if (($dbName===''||$dbUser==='') && file_exists($INCLUDES.'/config.php')) {
    $cfg = file_get_contents($INCLUDES.'/config.php');
    if (preg_match("/define\('DB_NAME'[^;]+?'([^']+)'/", $cfg,$m)) $dbName=$dbName?:$m[1];
    if (preg_match("/define\('DB_USER'[^;]+?'([^']+)'/", $cfg,$m)) $dbUser=$dbUser?:$m[1];
    if (preg_match("/define\('DB_HOST'[^;]+?'([^']+)'/", $cfg,$m)) $dbHost=$dbHost?:$m[1];
    nfo('بيانات DB','من includes/config.php');
}

nfo('محاولة الاتصال',"$dbUser@$dbHost / $dbName");
$db = null; $allTables = [];
try {
    $db = new mysqli($dbHost,$dbUser,$dbPass,$dbName);
    if ($db->connect_error) {
        no('اتصال MySQL','خطأ '.$db->connect_errno.': '.$db->connect_error);
        meh('Hostinger','في hPanel → Databases → MySQL Databases — انسخ اسم DB والمستخدم بالضبط (يبدآن بـ u876202964_)');
        $db=null;
    } else {
        $db->set_charset($dbCs);
        ok('اتصال MySQL ✓',"$dbUser@$dbHost/$dbName");
        $r=$db->query('SELECT VERSION() v, NOW() t');
        if ($r){$row=$r->fetch_assoc();nfo('MySQL',$row['v'].' | '.$row['t']);}
        $r=$db->query("SHOW VARIABLES LIKE 'character_set_database'");
        if ($r){$cs=$r->fetch_assoc()['Value']??'';$cs==='utf8mb4'?ok('Charset utf8mb4 ✓'):meh('Charset',$cs);}
    }
} catch (Throwable $e) {
    no('MySQL exception',$e->getMessage());
    meh('Hostinger tip','hPanel → Databases → تأكد كلمة مرور المستخدم وصلاحياته على قاعدة البيانات');
}

// ════════════════════════════════════════════════════════════════
// §8  الجداول — بالأسماء الحقيقية المستخدمة في الكود
// ════════════════════════════════════════════════════════════════
sec('📊 الجداول (بالأسماء الحقيقية)');

// الأسماء الحقيقية مستخرجة من الكود مباشرة
$tables = [
    // المعاملات الرئيسية
    'transactions'              => 'المعاملات الرئيسية',
    'transaction_types'         => 'أنواع المعاملات',
    'receiving_data'            => 'بيانات الاستلام',
    'budget_data'               => 'بيانات الموازنة',
    'payment_data'              => 'بيانات الدفع (daily_payments)',
    'invoice_data'              => 'بيانات الفواتير',
    'stage_times'               => 'أوقات المراحل',
    'transaction_events'        => 'أحداث المعاملات',
    'transaction_attachments'   => 'مرفقات المعاملات',
    // الموظفون
    'employees'                 => 'الموظفون',
    'departments'               => 'الأقسام والقطاعات',
    'employee_page_permissions' => 'صلاحيات الصفحات',
    // البنك
    'bank_accounts'             => 'الحسابات البنكية',
    'bank_deposits'             => 'الودائع البنكية',
    'bank_deposits_investment'  => 'الودائع الاستثمارية (bank_investments)',
    'investment_transactions'   => 'حركات الاستثمار',
    'daily_balances'            => 'الأرصدة اليومية',
    'monthly_deposit_schedule'  => 'جدول الودائع الشهرية',
    // الموازنة
    'budget_plans'              => 'خطط الموازنة',
    'budget_reservations'       => 'حجوزات الموازنة',
    // الخطابات وطلبات الشراء
    'correspondence'            => 'الخطابات',
    'purchase_requests'         => 'طلبات الشراء',
    'pr_workflow_stages'        => 'مراحل سير طلبات الشراء',
    'suppliers'                 => 'الموردين',
    // الموافقات والأرشيف
    'ceo_approval_actions'      => 'موافقات الرئيس (ceo_approvals)',
    'ceo_stamp_settings'        => 'إعدادات ختم الرئيس',
    'financial_archive'         => 'الأرشيف المالي (archive)',
    // SLA
    'sla_policies'              => 'سياسات SLA (sla_definitions)',
    'ola_rules'                 => 'قواعد OLA',
    'sla_breaches'              => 'خروقات SLA',
    // الإشعارات والأمان
    'system_notifications'      => 'الإشعارات',
    'security_log'              => 'سجل الأمان',
    'login_attempts'            => 'محاولات الدخول',
    // إعدادات
    'system_settings'           => 'إعدادات النظام',
    'notification_settings'     => 'إعدادات الإشعارات',
    'payment_order_attachments' => 'مرفقات أوامر الدفع',
];

if ($db) {
    $tr = $db->query('SHOW TABLES');
    while ($row=$tr->fetch_row()) $allTables[]=$row[0];

    foreach ($tables as $t=>$d) {
        if (in_array($t,$allTables)) {
            $cr=$db->query("SELECT COUNT(*) c FROM `$t`");
            $cnt=$cr?$cr->fetch_assoc()['c']:'?';
            ok("$d",'['.$t.'] — '.$cnt.' سجل');
        } else {
            no("$d",'['.$t.'] — الجدول غير موجود!');
        }
    }
    $extra=array_diff($allTables,array_keys($tables));
    if ($extra) nfo('جداول إضافية لم تُفحص',implode(', ',array_values($extra)));
} else {
    meh('تخطي','لا يوجد اتصال DB');
}

// ════════════════════════════════════════════════════════════════
// §9  الأعمدة الحساسة
// ════════════════════════════════════════════════════════════════
sec('🔍 الأعمدة الحساسة');

// الأعمدة الحقيقية من INSERT/UPDATE statements في الكود
$critCols = [
    'transactions' => [
        'id','transaction_number','transaction_date',
        'type_id',          // ← الاسم الحقيقي (وليس transaction_type_id)
        'sub_type_id','description','amount','currency',
        'status','priority',
        'created_by','created_at','updated_at',
    ],
    'purchase_requests' => [
        'id','current_stage','workflow_path','assigned_to',
        'rejection_reason','rejected_at','rejected_by',
        'returned_to_manager','returned_at',
        'po_number','final_supplier_id','payment_status',
        'budget_reservation_id','payment_route','final_amount',
    ],
    'employees' => [
        'id','employee_number','permission_level','role',
        'sector_id','department_id','is_active',
    ],
    'pr_workflow_stages' => [
        'id','request_id','stage_name','stage_order',
        'status','arrived_at','completed_at',
    ],
    'bank_deposits_investment' => [
        'id','account_id','deposit_name','status',
        'maturity_date','interest_rate',
    ],
];

if ($db) {
    foreach ($critCols as $table=>$cols) {
        if (!in_array($table,$allTables)) { meh("أعمدة $table",'الجدول غير موجود'); continue; }
        $cr=$db->query("SHOW COLUMNS FROM `$table`"); $ex=[];
        while ($row=$cr->fetch_assoc()) $ex[]=$row['Field'];
        foreach ($cols as $col)
            in_array($col,$ex)?ok("$table.$col"):no("$table.$col",'مفقود ← مصدر خطأ 400');
    }
} else { meh('تخطي','لا يوجد اتصال'); }

// ════════════════════════════════════════════════════════════════
// §10  فحص HTTP للـ APIs
// ════════════════════════════════════════════════════════════════
sec('🌐 فحص API عبر HTTP');

if (php_sapi_name() !== 'cli') {
    $scheme  = (!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')?'https':'http';
    $host    = $_SERVER['HTTP_HOST']??'localhost';
    $docRoot = rtrim(realpath($_SERVER['DOCUMENT_ROOT']??$ROOT),'/\\');
    $rel     = ltrim(str_replace($docRoot,'',$ROOT),'/\\');
    $base    = $scheme.'://'.$host.($rel?"/$rel":'');
    nfo('Base URL',$base);

    // الـ API endpoints الحقيقية — JS يستدعي api/?action=xxx
    $eps = [
        '/api/?action=bank_accounts'              => 'البنك — accounts',
        '/api/?action=bank_deposits'              => 'البنك — deposits',
        '/api/?action=investments'                => 'الاستثمار',
        '/api/purchase_requests_api.php?action=list' => 'طلبات الشراء',
        '/api/correspondence_api.php?action=list'    => 'الخطابات',
        '/api/daily_payments_api.php?action=list'    => 'المدفوعات',
        '/api/archive_api.php?action=list'           => 'الأرشيف',
        '/api/reports_api.php?action=list'           => 'التقارير',
        '/api/suppliers_api.php?action=list'         => 'الموردين',
        '/api/sla_central.php?action=list'           => 'SLA',
        '/api/security_log_api.php?action=list'      => 'سجل الأمان',
        '/api/budget_workflow_api.php?action=list'   => 'سير الموازنة',
        '/api/ceo_approvals_api.php?action=list'     => 'موافقات الرئيس',
    ];

    $ctx=stream_context_create(['http'=>['timeout'=>6,'ignore_errors'=>true,'follow_location'=>false]]);
    foreach ($eps as $ep=>$desc) {
        $url=$base.$ep;
        $t0=microtime(true);
        $resp=@file_get_contents($url,false,$ctx);
        $ms=round((microtime(true)-$t0)*1000);
        $code=0;
        foreach ($http_response_header??[] as $h)
            if (preg_match('/HTTP\/\S+ (\d+)/',$h,$m)){$code=(int)$m[1];break;}
        $dec=$resp?@json_decode($resp,true):null;
        $msg=$dec['message']??'';
        match(true){
            $code===404=>no($desc,"404 — الملف غير موجود | $url"),
            $code===500=>no($desc,"500 — $msg"),
            $code===401||str_contains($msg,'تسجيل')||str_contains($msg,'مصرح')=>ok($desc,"✓ يتطلب مصادقة ({$ms}ms)"),
            $code===400=>meh($desc,"400 — $msg ({$ms}ms)"),
            $code===200=>ok($desc,"200 OK ({$ms}ms)"),
            default=>meh($desc,"HTTP $code | $url"),
        };
    }
} else { nfo('HTTP','افتح السكريبت في المتصفح'); }

// ════════════════════════════════════════════════════════════════
// §11  تحليل purchase_requests_api
// ════════════════════════════════════════════════════════════════
sec('🧪 تحليل purchase_requests_api');

$prFile = $API_DIR.'/purchase_requests_api.php';
if (file_exists($prFile)) {
    $pc=file_get_contents($prFile);
    (str_contains($pc,'php://input')&&str_contains($pc,'json_decode'))?ok('يقرأ JSON body ✓'):no('لا يقرأ JSON body');
    preg_match('/\$(\w+)\s*=\s*json_decode\s*\(\s*file_get_contents\s*\(\s*[\'"]php:\/\/input/',$pc,$bm);
    $bv=$bm[1]??null; $bv?nfo('متغير body','$'.$bv):meh('متغير body','لم يُكتشف');

    foreach (['list','get','approve','reject','refer','resubmit','assign','add_comment'] as $a)
        (str_contains($pc,"'$a'")||str_contains($pc,"\"$a\""))?ok("action '$a' ✓"):no("action '$a' مفقود");

    // return_correction — قد يُرسَل كـ reject في مرحلة reception
    if (str_contains($pc,"'return_correction'")) {
        ok("action 'return_correction' موجود ✓");
    } else {
        meh("action 'return_correction'",
            "غير موجود كـ action منفصل — زر الإرجاع يُرسَل كـ reject+stage=reception وهذا صحيح في pr_functions.php");
    }

    (str_contains($pc,'csrf')||str_contains($pc,'CSRF'))?ok('CSRF ✓'):meh('CSRF','غير موجود');

    // تحقق approve يستخدم المتغير الصحيح
    if ($bv && preg_match("/'approve'.*?(?=elseif|$)/s",$pc,$am))
        str_contains($am[0],'$'.$bv)?ok("approve يستخدم \$$bv ✓"):no("approve لا يستخدم \$$bv",'مصدر خطأ 400!');

    foreach (['prApproveStage','prReferRequest','prGetRequest','prLogEvent'] as $fn)
        str_contains($pc,$fn)?ok("$fn() مستخدمة ✓"):no("$fn() مفقودة",'الدالة غير موجودة في الملف');
} else { no('purchase_requests_api.php','الملف غير موجود في api/'); }

// ════════════════════════════════════════════════════════════════
// §12  الأمان
// ════════════════════════════════════════════════════════════════
sec('🔒 الأمان');
$gc=(int)ini_get('session.gc_maxlifetime');
nfo('session lifetime',$gc.'s = '.round($gc/60).' دقيقة');
$gc>=7200?ok('جلسة >= 2h ✓'):meh('جلسة قصيرة',round($gc/60).' دقيقة');
ini_get('session.cookie_httponly')?ok('HttpOnly ✓'):meh('HttpOnly','مُعطَّل');
$ss=ini_get('session.cookie_samesite');
$ss==='Strict'?ok('SameSite=Strict ✓'):meh('SameSite',"الحالي: '$ss'");

// htaccess
$htFile = file_exists($ROOT.'/.htaccess')?$ROOT.'/.htaccess'
        :(file_exists($ROOT.'/htaccess')?$ROOT.'/htaccess':null);
if ($htFile) {
    $ht=file_get_contents($htFile);
    str_contains($ht,'includes')?ok('.htaccess يحمي includes/ ✓'):meh('.htaccess','لا يحمي includes/');
    str_contains($ht,'.env')?ok('.htaccess يحمي .env ✓'):meh('.htaccess','لا يحمي .env');
} else { meh('.htaccess','غير موجود'); }

// ════════════════════════════════════════════════════════════════
// §13  ملخص المشاكل المكتشفة
// ════════════════════════════════════════════════════════════════
sec('💡 ملخص المشاكل وأولويات الإصلاح');

$fails = array_filter($R, fn($r)=>$r['s']==='FAIL');
$warns = array_filter($R, fn($r)=>$r['s']==='WARN');

if (empty($fails)&&empty($warns)) {
    ok('🎉 النظام سليم تماماً!','لا توجد مشاكل');
} else {
    nfo('إجمالي المشاكل',count($fails).' فشل + '.count($warns).' تحذير');
    // أولوية الإصلاح
    $dbFail = array_filter($fails, fn($r)=>str_contains($r['l'],'MySQL')||str_contains($r['l'],'DB'));
    if (!empty($dbFail)) no('أولوية 1: إصلاح الاتصال بـ DB','hPanel → MySQL Databases → تحقق الاسم+كلمة المرور');
    $missingTables = array_filter($fails,fn($r)=>str_contains($r['d'],'الجدول غير موجود'));
    if (!empty($missingTables)) no('أولوية 2: جداول مفقودة',count($missingTables).' جدول — تحقق من ملف migration أو schema.sql');
    $missingCols = array_filter($fails,fn($r)=>str_contains($r['d'],'مصدر خطأ 400'));
    if (!empty($missingCols)) no('أولوية 3: أعمدة مفقودة ← مصدر أخطاء 400',count($missingCols).' عمود — راجع §9');
    $missing404 = array_filter($fails,fn($r)=>str_contains($r['d'],'404'));
    if (!empty($missing404)) no('أولوية 4: APIs تُعيد 404',count($missing404).' API — تحقق من مسارات الملفات');
}

// ─── إغلاق ──────────────────────────────────────────────────────
if ($db) $db->close();
$ms=round((microtime(true)-T0)*1000);
$nP=count(array_filter($R,fn($r)=>$r['s']==='PASS'));
$nF=count(array_filter($R,fn($r)=>$r['s']==='FAIL'));
$nW=count(array_filter($R,fn($r)=>$r['s']==='WARN'));
$nI=count(array_filter($R,fn($r)=>$r['s']==='INFO'));
nfo('وقت التشخيص',$ms.'ms');
?>
<!DOCTYPE html>
<html dir="rtl" lang="ar">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>تشخيص v5</title>
    <style>
    :root {
        --bg: #090b0f;
        --s1: #0f1117;
        --s2: #181c24;
        --bd: #22272f;
        --tx: #d8e0ed;
        --mt: #60697a;
        --gr: #2ea043;
        --rd: #da3633;
        --yw: #b8870a;
        --bl: #388bfd;
        --vl: #9f6eff;
        --gr-l: rgba(46, 160, 67, .09);
        --rd-l: rgba(218, 54, 51, .09);
        --yw-l: rgba(184, 135, 10, .09);
        --bl-l: rgba(56, 139, 253, .09);
    }

    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }

    body {
        background: var(--bg);
        color: var(--tx);
        font: 13px/1.55 'Segoe UI', system-ui, sans-serif;
        padding: 14px;
    }

    .hdr {
        background: linear-gradient(135deg, #0d1117 0%, #0f1a40 100%);
        border: 1px solid #263060;
        border-radius: 10px;
        padding: 16px 20px;
        margin-bottom: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
    }

    .hdr h1 {
        font-size: 16px;
        font-weight: 700;
        color: #79adf7;
        letter-spacing: -.2px;
    }

    .hdr small {
        color: var(--mt);
        font-size: 11px;
        display: block;
        margin-top: 2px;
    }

    .warn {
        background: rgba(218, 54, 51, .07);
        border: 1px solid rgba(218, 54, 51, .28);
        border-radius: 7px;
        padding: 9px 14px;
        margin-bottom: 11px;
        font-size: 12px;
        color: #ff8585;
    }

    .stats {
        display: flex;
        gap: 8px;
        margin-bottom: 11px;
        flex-wrap: wrap;
    }

    .st {
        background: var(--s1);
        border: 1px solid var(--bd);
        border-radius: 8px;
        padding: 10px 16px;
        flex: 1;
        min-width: 80px;
        text-align: center;
    }

    .st .n {
        font-size: 22px;
        font-weight: 700;
        line-height: 1;
    }

    .st .l {
        font-size: 10px;
        color: var(--mt);
        margin-top: 2px;
    }

    .st.p {
        border-color: rgba(46, 160, 67, .35);
    }

    .st.p .n {
        color: var(--gr);
    }

    .st.f {
        border-color: rgba(218, 54, 51, .35);
    }

    .st.f .n {
        color: var(--rd);
    }

    .st.w {
        border-color: rgba(184, 135, 10, .35);
    }

    .st.w .n {
        color: var(--yw);
    }

    .st.i {
        border-color: rgba(56, 139, 253, .35);
    }

    .st.i .n {
        color: var(--bl);
    }

    .fb-bar {
        display: flex;
        gap: 6px;
        margin-bottom: 9px;
        flex-wrap: wrap;
    }

    .fb {
        padding: 4px 12px;
        border-radius: 5px;
        border: 1px solid var(--bd);
        background: var(--s1);
        color: var(--tx);
        cursor: pointer;
        font-size: 11px;
        transition: .12s;
    }

    .fb:hover,
    .fb.on {
        border-color: var(--vl);
        color: var(--vl);
        background: rgba(159, 110, 255, .08);
    }

    .sec {
        background: var(--s2);
        border: 1px solid var(--bd);
        border-radius: 5px;
        padding: 6px 12px;
        margin: 11px 0 3px;
        font-weight: 600;
        font-size: 11px;
        color: var(--vl);
    }

    table {
        width: 100%;
        border-collapse: collapse;
        background: var(--s1);
        border: 1px solid var(--bd);
        border-radius: 6px;
        overflow: hidden;
        margin-bottom: 3px;
    }

    tr {
        border-bottom: 1px solid var(--bd);
    }

    tr:last-child {
        border: none;
    }

    tr:hover {
        background: var(--s2);
    }

    td {
        padding: 5px 10px;
        vertical-align: top;
    }

    .sc {
        width: 72px;
        text-align: center;
    }

    .lc {
        width: 34%;
        font-size: 12px;
    }

    .dc {
        color: var(--mt);
        font: 11px/1.4 'Cascadia Code', 'Fira Code', monospace;
        word-break: break-all;
    }

    .b {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        white-space: nowrap;
    }

    .bp {
        background: var(--gr-l);
        color: var(--gr);
        border: 1px solid rgba(46, 160, 67, .22);
    }

    .bf {
        background: var(--rd-l);
        color: var(--rd);
        border: 1px solid rgba(218, 54, 51, .22);
    }

    .bw {
        background: var(--yw-l);
        color: var(--yw);
        border: 1px solid rgba(184, 135, 10, .22);
    }

    .bi {
        background: var(--bl-l);
        color: var(--bl);
        border: 1px solid rgba(56, 139, 253, .22);
    }
    </style>
</head>

<body>
    <div class="hdr">
        <div>
            <h1>🔬 تشخيص النظام v5 — Workflow Management System</h1>
            <small><?=date('Y-m-d H:i:s')?> | <?=$ms?>ms | <?=htmlspecialchars($ROOT)?></small>
        </div>
        <div style="font-size:11px;color:var(--mt);text-align:left">
            <div><?=htmlspecialchars($_SERVER['HTTP_HOST']??'CLI')?></div>
            <div>✅<?=$nP?> ❌<?=$nF?> ⚠️<?=$nW?> ℹ️<?=$nI?></div>
        </div>
    </div>
    <div class="warn">⚠️ <b>احذف هذا الملف فور الانتهاء من التشخيص!</b></div>
    <div class="stats">
        <div class="st p">
            <div class="n"><?=$nP?></div>
            <div class="l">✅ ناجح</div>
        </div>
        <div class="st f">
            <div class="n"><?=$nF?></div>
            <div class="l">❌ فشل</div>
        </div>
        <div class="st w">
            <div class="n"><?=$nW?></div>
            <div class="l">⚠️ تحذير</div>
        </div>
        <div class="st i">
            <div class="n"><?=$nI?></div>
            <div class="l">ℹ️ معلومة</div>
        </div>
    </div>
    <div class="fb-bar">
        <button class="fb on" onclick="f('all',this)">الكل</button>
        <button class="fb" onclick="f('FAIL',this)" style="color:var(--rd)">❌ المشاكل</button>
        <button class="fb" onclick="f('WARN',this)" style="color:var(--yw)">⚠️ التحذيرات</button>
        <button class="fb" onclick="f('PASS',this)" style="color:var(--gr)">✅ الناجح</button>
        <button class="fb" onclick="f('INFO',this)" style="color:var(--bl)">ℹ️ المعلومات</button>
    </div>
    <?php
$tOpen=false;
foreach($R as $r){
  if($r['s']==='SEC'){
    if($tOpen){echo'</tbody></table>';$tOpen=false;}
    echo'<div class="sec">'.htmlspecialchars($r['l']).'</div><table><tbody>';
    $tOpen=true;continue;
  }
  $bc=match($r['s']){'PASS'=>'bp','FAIL'=>'bf','WARN'=>'bw',default=>'bi'};
  $ic=match($r['s']){'PASS'=>'✅','FAIL'=>'❌','WARN'=>'⚠️',default=>'ℹ️'};
  echo'<tr data-s="'.$r['s'].'">'.
    '<td class="sc"><span class="b '.$bc.'">'.$ic.' '.$r['s'].'</span></td>'.
    '<td class="lc">'.htmlspecialchars($r['l']).'</td>'.
    '<td class="dc">'.htmlspecialchars($r['d']).'</td>'.
    '</tr>';
}
if($tOpen)echo'</tbody></table>';
?>
    <script>
    function f(s, btn) {
        document.querySelectorAll('.fb').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        document.querySelectorAll('tr[data-s]').forEach(r => {
            r.style.display = (s === 'all' || r.dataset.s === s) ? '' : 'none';
        });
    }
    </script>
</body>

</html>