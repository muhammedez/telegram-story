export type Lang = "en" | "ar";

export const messages = {
  en: {
    welcome:
      "👋 Send @username (or t.me/username) to choose how many stories to download:\n" +
      "• Today's active stories\n" +
      "• Last 3 stories\n" +
      "• Last 10 stories\n" +
      "and more!\n\n" +
      "Or send a single story link: t.me/user/s/123",
    choose_stories: (user: string) => `📖 Stories for @${user}\nChoose what you want to download:`,
    btn_active: "📅 Today's Active Stories",
    btn_latest: "1️⃣ Latest Story",
    btn_last3: "3️⃣ Last 3 Stories",
    btn_last5: "5️⃣ Last 5 Stories",
    btn_last10: "🔟 Last 10 Stories",
    btn_cancel: "❌ Cancel",
    btn_quality_media: "🖼️ Mode: Media",
    btn_quality_doc: "📁 Mode: Document (HQ)",
    btn_lang_switch: "🌐 العربية",
    fetching: (label: string, user: string) => `⏳ Fetching ${label} for @${user}...`,
    fetching_single: (id: number, user: string) => `⏳ Fetching story #${id} for @${user}...`,
    sent_count: (count: number, user: string, note = "") =>
      `✅ Sent ${count} ${count === 1 ? "story" : "stories"} for @${user}${note}.`,
    only_available: (count: number) =>
      ` (only ${count} public ${count === 1 ? "story is" : "stories are"} available)`,
    posted: "🕒 Posted:",
    expires_in: (h: number, m: number) => `⏳ Expires in: ${h}h ${m}m`,
    profile_story: "📌 Profile Story",
    direct_link: "🔗 Link:",
    slow_down: "Slow down: max 5 requests/minute.",
    busy: (s: number) => `Busy, try again in ${s}s.`,
    err_unknown: (user: string) => `❌ Username @${user} does not exist.`,
    err_protected: "❌ Stories for this account are protected and can't be saved.",
    err_no_active: (user: string) =>
      `ℹ️ No active 24h stories found for @${user}. Try "Last 3" or "Last 10" for profile stories.`,
    err_not_found: (user: string) => `ℹ️ No public stories found for @${user}.`,
    err_server_busy: "⚠️ Server is busy right now, please try again in a few seconds.",
    err_too_large: "⚠️ Story is too large to send (>45MB).",
    err_rate_limited: (s: number) => `⚠️ Rate limited by Telegram, retry in ${s}s.`,
    err_failed: "❌ Failed to fetch stories.",
    prompt_usage: "Send @username or t.me/username, or t.me/user/s/123 for one story.",
    cancelled: "Cancelled.",
    lang_changed: "🌐 Language changed to English.",
    mode_toggled_doc: "📁 Document mode enabled (high-quality original files).",
    mode_toggled_media: "🖼️ Standard media mode enabled.",
    label_active: "today's active stories",
    label_latest: "the latest story",
    label_last_n: (n: number) => `the last ${n} stories`,
  },
  ar: {
    welcome:
      "👋 أرسل اسم المستخدم (مثل @username أو t.me/username) لاختيار الستوريات التي تريد تحميلها:\n" +
      "• ستوريات اليوم النشطة\n" +
      "• آخر 3 ستوريات\n" +
      "• آخر 10 ستوريات\n" +
      "والمزيد!\n\n" +
      "أو أرسل رابط ستوري مباشر: t.me/user/s/123",
    choose_stories: (user: string) => `📖 ستوريات @${user}\nاختر ما تريد تحميله:`,
    btn_active: "📅 ستوريات اليوم النشطة",
    btn_latest: "1️⃣ آخر ستوري",
    btn_last3: "3️⃣ آخر 3 ستوريات",
    btn_last5: "5️⃣ آخر 5 ستوريات",
    btn_last10: "🔟 آخر 10 ستوريات",
    btn_cancel: "❌ إلغاء",
    btn_quality_media: "🖼️ الوضع: وسائط عادية",
    btn_quality_doc: "📁 الوضع: ملف بدون ضغط",
    btn_lang_switch: "🌐 English",
    fetching: (label: string, user: string) => `⏳ جاري جلب ${label} لـ @${user}...`,
    fetching_single: (id: number, user: string) => `⏳ جاري جلب الستوري #${id} لـ @${user}...`,
    sent_count: (count: number, user: string, note = "") =>
      `✅ تم إرسال ${count} ستوري لـ @${user}${note}.`,
    only_available: (count: number) => ` (يوجد فقط ${count} ستوري متاح)`,
    posted: "🕒 تاريخ النشر:",
    expires_in: (h: number, m: number) => `⏳ ينتهي خلال: ${h}س ${m}د`,
    profile_story: "📌 ستوري مثبت في الملف الشخصي",
    direct_link: "🔗 الرابط:",
    slow_down: "مهلاً: الحد الأقصى 5 طلبات في الدقيقة.",
    busy: (s: number) => `مشغول، حاول مجدداً بعد ${s} ثانية.`,
    err_unknown: (user: string) => `❌ اسم المستخدم @${user} غير موجود.`,
    err_protected: "❌ ستوريات هذا الحساب محمية ولا يمكن حفظها.",
    err_no_active: (user: string) =>
      `ℹ️ لا توجد ستوريات نشطة خلال 24 ساعة لـ @${user}. جرب "آخر 3" أو "آخر 10" لستوريات الملف الشخصي.`,
    err_not_found: (user: string) => `ℹ️ لم يتم العثور على ستوريات عامة لـ @${user}.`,
    err_server_busy: "⚠️ الخادم مشغول حالياً، يرجى المحاولة بعد قليل.",
    err_too_large: "⚠️ حجم الستوري كبير جداً (>45 ميغابايت).",
    err_rate_limited: (s: number) => `⚠️ تم تجاوز حد الطلبات من تيليجرام، انتظر ${s} ثانية.`,
    err_failed: "❌ فشل في جلب الستوريات.",
    prompt_usage: "أرسل @username أو t.me/username، أو رابط ستوري t.me/user/s/123",
    cancelled: "تم الإلغاء.",
    lang_changed: "🌐 تم تغيير اللغة إلى العربية.",
    mode_toggled_doc: "📁 تم تفعيل وضع الملفات (بدون ضغط بالجودة الأصلية).",
    mode_toggled_media: "🖼️ تم تفعيل وضع الوسائط العادية.",
    label_active: "ستوريات اليوم النشطة",
    label_latest: "آخر ستوري",
    label_last_n: (n: number) => `آخر ${n} ستوريات`,
  },
};
