# 🚀 نظام إدارة المعاملات | Workflow Management System

نظام متكامل لإدارة سير المعاملات المالية بين ثلاثة موظفين: موظف الاستلام، موظف الدفع، وموظف الفوترة.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![PHP](https://img.shields.io/badge/PHP-8.0+-purple)
![MySQL](https://img.shields.io/badge/MySQL-5.7+-orange)

---

## 📋 المميزات

### لوحة التحكم
- 📊 إحصائيات حية للمعاملات
- 📈 رسوم بيانية تفاعلية
- ⚠️ قائمة المعاملات العاجلة
- 🔔 نظام تنبيهات

### إدارة المعاملات
- ➕ إضافة معاملات جديدة
- 📝 تعديل بيانات كل مرحلة
- 🔍 بحث وفلترة متقدمة
- 📋 عرض تفصيلي للمعاملات

### سير العمل
1. **موظف الاستلام** ← استلام ومراجعة البيانات
2. **موظف الدفع** ← معالجة وتنفيذ الدفع
3. **موظف الفوترة** ← إصدار الفواتير والمتابعة

---

## 🛠️ متطلبات التشغيل

- PHP 8.0 أو أحدث
- MySQL 5.7 أو أحدث
- خادم ويب (Apache/Nginx)
- متصفح حديث

---

## ⚡ التثبيت

### 1. نسخ الملفات
```bash
# انسخ مجلد المشروع إلى مجلد الويب
cp -r workflow-system /var/www/html/
```

### 2. إنشاء قاعدة البيانات
```bash
# سجل الدخول إلى MySQL
mysql -u root -p

# نفذ ملف قاعدة البيانات
source /path/to/workflow-system/database.sql
```

### 3. تعديل إعدادات الاتصال
افتح ملف `includes/config.php` وعدّل:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'workflow_system');
define('DB_USER', 'your_username');
define('DB_PASS', 'your_password');
```

### 4. تشغيل النظام
افتح المتصفح وانتقل إلى:
```
http://localhost/workflow-system/
```

---

## 📁 هيكل المشروع

```
workflow-system/
├── api/
│   └── index.php          # واجهة API
├── css/
│   └── style.css          # التنسيقات
├── includes/
│   ├── config.php         # الإعدادات
│   └── functions.php      # الدوال المساعدة
├── js/
│   └── app.js             # JavaScript
├── database.sql           # قاعدة البيانات
├── index.php              # الصفحة الرئيسية
└── README.md              # التوثيق
```

---

## 🔌 نقاط API

| الإجراء | الوصف | الطريقة |
|---------|-------|---------|
| `stats` | الإحصائيات | GET |
| `chart` | بيانات الرسم البياني | GET |
| `transactions` | جميع المعاملات | GET |
| `transaction` | معاملة واحدة | GET |
| `urgent` | المعاملات العاجلة | GET |
| `employees` | الموظفين | GET |
| `types` | أنواع المعاملات | GET |
| `add` | إضافة معاملة | POST |
| `update_receiving` | تحديث الاستلام | POST |
| `update_payment` | تحديث الدفع | POST |
| `update_invoice` | تحديث الفوترة | POST |
| `delete` | حذف معاملة | POST |

### أمثلة

```javascript
// جلب الإحصائيات
fetch('api/?action=stats')
  .then(res => res.json())
  .then(data => console.log(data));

// إضافة معاملة
fetch('api/?action=add', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    date: '2025-02-03',
    type_id: 1,
    description: 'وصف المعاملة',
    amount: 5000
  })
});
```

---

## 🎨 التخصيص

### تغيير الألوان
عدّل المتغيرات في `css/style.css`:

```css
:root {
    --bg-primary: #0f172a;
    --accent-blue: #0ea5e9;
    --accent-green: #10b981;
    /* ... */
}
```

### إضافة أنواع معاملات
```sql
INSERT INTO transaction_types (name, description) 
VALUES ('النوع الجديد', 'وصف النوع');
```

### إضافة موظفين
```sql
INSERT INTO employees (name, email, role, phone) 
VALUES ('اسم الموظف', 'email@example.com', 'receiver', '05xxxxxxxx');
-- role: receiver | payment | invoice
```

---

## 🔒 الأمان

- ✅ تنظيف المدخلات
- ✅ Prepared Statements
- ✅ حماية من XSS
- ✅ حماية من SQL Injection

### للإنتاج
```php
// في config.php
error_reporting(0);
ini_set('display_errors', 0);
```

---

## 📱 التجاوب

النظام متجاوب بالكامل ويعمل على:
- 🖥️ أجهزة الكمبيوتر
- 💻 الأجهزة اللوحية
- 📱 الهواتف الذكية

---

## 🤝 المساهمة

نرحب بمساهماتكم! يرجى:
1. عمل Fork للمشروع
2. إنشاء Branch جديد
3. إرسال Pull Request

---

## 📄 الترخيص

هذا المشروع مرخص تحت MIT License.

---

## 📞 الدعم

للاستفسارات والدعم الفني، يرجى التواصل عبر:
- 📧 البريد الإلكتروني
- 💬 فتح Issue على GitHub

---

**تم التطوير بـ ❤️**
