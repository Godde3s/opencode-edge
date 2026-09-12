<div align="center">

# ⚡ opencode-edge

**درگاه لبه‌ای سازگار با OpenAI / Anthropic برای مدل‌های رایگان OpenCode — روی پلن رایگان Cloudflare Workers.**

یک فایل. بدون وابستگی. بدون بیلد. بدون سرور، بدون VPS، بدون کارت بانکی.

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Diploy%20be%20Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](#راه‌اندازی-در-۳-دقیقهبدون-هیچ-تخصصی)

[**English**](README.md) | 🌐 فارسی

</div>

---

## این چیست؟

`opencode-edge` یک Worker کوچک برای Cloudflare است که بین ابزارهای کدنویسی هوش مصنوعی شما و **مدل‌های رایگان [OpenCode Zen](https://opencode.ai)** قرار می‌گیرد و دو endpoint استاندارد را ارائه می‌دهد:

- `POST /v1/chat/completions` — پروتکل OpenAI (‏opencode CLI، Cursor، Continue، Cline، aider و …)
- `POST /v1/messages` — پروتکل Anthropic (مثل claude code) که همان لحظه به OpenAI تبدیل می‌شود — **با پشتیبانی کامل استریم**

چون روی شبکه‌ی لبه (Edge) کلادفلر اجرا می‌شود، روی سیستم شما هیچ چیز نصب نمی‌شود: نه پروسه‌ی Node، نه استخر پروکسی برای نگهداری، نه باز کردن پورت. پلن رایگان Workers روزی ۱۰۰٬۰۰۰ درخواست می‌دهد که برای استفاده‌ی شخصی کاملاً کافی است.

## امکانات

| | |
|---|---|
| ⚡ | فقط یک فایل `worker.js` — بدون npm و بدون bundler |
| 🔀 | هم‌زمان پروتکل OpenAI **و** Anthropic با تبدیل خودکار |
| 🌊 | استریم کامل در هر دو پروتکل |
| 🔐 | قفل اختیاری با `API_KEYS` — یا احراز هویت باز برای ابزارهای محلی |
| 🗺️ | تغییر نام مدل با `MODEL_MAP` (مثلاً `gpt-4o → deepseek-v4-flash-free`) |
| 📊 | داشبورد وضعیت تیره و تمیز روی `/` |

---

## راه‌اندازی در ۳ دقیقه (بدون هیچ تخصصی)

> فقط مرورگر لازم دارید. نه ترمینال، نه دانش برنامه‌نویسی.

### قدم ۱ — ساخت حساب رایگان

1. به [dash.cloudflare.com](https://dash.cloudflare.com) بروید و **Sign up** بزنید (ایمیل + رمز، بدون کارت بانکی).
2. بعد از ورود، صفحه‌ای با نام **Workers & Pages** می‌بینید.

### قدم ۲ — ساخت Worker

1. روی **Create** و بعد **Create Worker** بزنید.
2. نام دلخواه بدهید (مثلاً `my-edge`) و **Deploy** بزنید — همین پیش‌فرض کافی است.
3. حالا روی **Edit code** بزنید تا ویرایشگر کد باز شود.

### قدم ۳ — چسباندن کد و انتشار

1. محتوای فایل [`worker.js`](./worker.js) این مخزن را **کامل کپی** کنید (Ctrl+A داخل فایل، Ctrl+C).
2. در ویرایشگر کلادفلر همه‌ی کد پیش‌فرض را پاک کنید (Ctrl+A سپس Delete) و کد کپی‌شده را Paste کنید.
3. دکمه‌ی **Deploy** را بزنید.
4. تمام! آدرس شما این است:

```
https://my-edge.<نام-کاربری>.workers.dev/v1
```

این همان **Base URL** شماست — در داشبورد Worker هم می‌توانید ببینیدش.

---

## اتصال ابزارها

### opencode CLI

```bash
opencode auth login
#   Provider:  OpenAI-compatible
#   Base URL:  https://my-edge.<username>.workers.dev/v1
#   API key:   هر متنی — مثلا local
```

### claude code (پروتکل Anthropic)

```bash
export ANTHROPIC_BASE_URL=https://my-edge.<username>.workers.dev
export ANTHROPIC_API_KEY=local
claude
```

### تست سریع با مرورگر

آدرس `https://my-edge.<username>.workers.dev` را باز کنید — داشبورد وضعیت با لیست امکانات می‌بینید. اگر JSON برگرداند یعنی همه‌چیز سالم است.

---

## قفل کردن endpoint (اختیاری ولی توصیه‌شده)

به‌صورت پیش‌فرض هر کلیدی پذیرفته می‌شود (مناسب استفاده‌ی شخصی). اگر می‌خواهید فقط خودتان دسترسی داشته باشید:

1. در داشبورد Worker به **Settings → Variables and Secrets** بروید.
2. متغیری با نام `API_KEYS` بسازید و مقدارش را یک کلید دلخواه بگذارید (مثلاً `my-secret-123`).
3. از این به بعد درخواست‌ها باید همان کلید را بفرستند:

```bash
curl https://my-edge.<username>.workers.dev/v1/chat/completions \
  -H "Authorization: Bearer my-secret-123" ...
```

---

## سوالات پرتکرار

**هزینه دارد؟** — نه. پلن رایگان Workers روزی ۱۰۰٬۰۰۰ درخواست می‌دهد؛ برای کدنویسی روزمره شخصی خیلی بیشتر از حد نیاز است.

**داده‌ای ذخیره می‌شود؟** — نه. این Worker فقط ترجمه‌ی پروتکل و عبور درخواست است؛ هیچ چیزی روی دیسک نمی‌نویسد و لاگ نگه نمی‌دارد.

**مدل‌ها را کجا عوض کنم؟** — لیست مدل‌های فعال را در `/v1/models` ببینید. نام مدل را در همان درخواست‌ها می‌فرستید (مثلاً `deepseek-v4-flash-free`).

**محدودیت سرویس بالادست؟** — سهمیه و دسترس‌پذیری مدل‌های رایگان بر عهده‌ی خود OpenCode است؛ این پروژه فقط از نزدیک‌ترین نقطه‌ی لبه، هر دو زبانِ کلاینت را برایتان ترجمه می‌کند.

---

## اعتبار و الهام

این پروژه از ایده‌ی [Parsa013Ah/OpenCode-Unlimited-ProxyPool](https://github.com/Parsa013Ah/OpenCode-Unlimited-ProxyPool) (پروکسی محلی با استخر پروکسی چرخان) الهام گرفته شده، اما یک پیاده‌سازی مستقل و مخصوص Edge است و هیچ کدی از آن مخزن استفاده نشده است. اگر نسخه‌ی دسکتاپ‌محور با داشبورد و tray می‌خواهید، همان مخزن را ببینید.

## مجوز

[MIT](./LICENSE) © 2026 Usf (Godde3s)
