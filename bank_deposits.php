<?php
/**
 * ═══════════════════════════════════════════
 * MASAR PATCH — bank_deposits.php
 * التعديلات المطلوبة في bank_deposits.php
 * ═══════════════════════════════════════════
 *
 * 1. في <head> — تغيير العنوان:
 * ─────────────────────────────
 * قديم:
 *   <title><?php echo $pageTitle; ?> - نظام إدارة المعاملات</title>
*
* جديد:
* <title><?php echo $pageTitle; ?> | مسار MASAR</title>
*
* ─────────────────────────────
* 2. في sidebar-header — استبدال كامل:
* ─────────────────────────────
* قديم:
* <div class="sidebar-header">
    * <div class="logo">
        * <svg class="logo-icon" ...>...</svg>
        * <span class="logo-text">نظام المعاملات</span>
        * </div>
    * <button class="sidebar-toggle" onclick="toggleSidebar()">...</button>
    * </div>
*
* جديد:
*/
?>

<!-- ════ sidebar-header الجديد لـ bank_deposits.php ════ -->
<div class="sidebar-header">

    <div class="sidebar-logos">
        <!-- <div class="sidebar-logo-icon">
            <img src="images/logo.png" alt="شعار المنظمة"
                onerror="this.style.display='none'"
                style="width:32px;height:32px;border-radius:6px;object-fit:cover;display:block">
        </div> -->
        <div class="logo-divider"></div>
        <div class="sidebar-logo-masar">
            <img src="images/logo-masar.png" alt="مسار MASAR"
                onerror="this.style.display='none';this.parentElement.innerHTML='<span style=\'font-size:0.55rem;font-weight:900;color:#fff;line-height:1.1;text-align:center\'>مسار<br>MASAR</span>'"
                style="width:32px;height:32px;border-radius:6px;object-fit:contain;display:block">
        </div>
    </div>

    <div class="sidebar-logo-text">
        <h1>مسار MASAR</h1>
        <span>الحسابات البنكية</span>
    </div>

</div>
<!-- ════════════════════════════════════════════════════ -->