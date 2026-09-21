// web/src/i18n.jsx
//
// Interface translation: English, Bahasa Melayu, 中文.
//
// Keys are the English strings themselves, so a string with no translation
// simply shows in English - nothing ever renders blank or as a raw key.
//
// Lookup is case- and underscore-insensitive, which lets the same entry
// translate values that arrive from the API in different shapes:
// "NEEDS_REVIEW", "NEEDS REVIEW" and "needs review" all resolve alike.
//
// Scope: the interface only. Documents, email bodies and extracted values are
// deliberately NOT translated - a reviewer must check a value against what
// the document actually says, and a translation is not the document.
//
// The Malay and Chinese text was drafted for this prototype and should be
// reviewed by a native speaker before production use.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "zh", label: "中文" },
];

const DICT = {
  ms: {
    // added after the dashboard gained reset, export and run history
    "Document could not be parsed, likely a scan quality or corrupted file issue": "Dokumen tidak dapat dihuraikan, mungkin disebabkan kualiti imbasan atau fail yang rosak",
    "One or more required fields were not found in the extracted data": "Satu atau lebih medan wajib tidak ditemui dalam data yang diekstrak",
    "Extraction confidence fell below the review threshold": "Keyakinan pengekstrakan berada di bawah ambang semakan",
    "A comparison was requested but the documents were not attached": "Perbandingan diminta tetapi dokumen tidak dilampirkan",
    "An attachment is not a Shipping Instruction or Bill of Lading": "Lampiran bukan Arahan Penghantaran atau Bil Muatan",
    "Reset the shared dashboard to the supplied dataset and clear generated validation history for everyone?": "Tetapkan semula papan pemuka kongsi kepada set data yang dibekalkan dan padam sejarah pengesahan yang dijana untuk semua pengguna?",
    "Language": "Bahasa",
    "Reset to Default": "Tetap Semula ke Lalai",
    "Resetting...": "Menetapkan semula...",
    "Failed to reset the dashboard.": "Gagal menetapkan semula papan pemuka.",
    "Score": "Skor",
    "Seed": "Benih",
    "Validation Performance": "Prestasi Pengesahan",
    "Current pipeline performance alongside pre-computed validation benchmarks.": "Prestasi saluran semasa bersama penanda aras pengesahan yang dikira terlebih dahulu.",
    "AI Fallback": "Sandaran AI",
    "ON": "HIDUP",
    "OFF": "MATI",
    "Export": "Eksport",
    "Export JSON": "Eksport JSON",
    "Export CSV": "Eksport CSV",
    "Current Run": "Larian Semasa",
    "Previous Run": "Larian Sebelumnya",
    "500 each": "500 setiap satu",
    "Run a generated dataset to display the score for the current run.": "Jalankan set data yang dijana untuk memaparkan skor larian semasa.",

    // navigation
    "Inbox Dashboard": "Papan Pemuka Peti Masuk",
    "Review Queue": "Barisan Semakan",
    "Dark mode": "Mod gelap",
    "Light mode": "Mod cerah",

    // inbox and pipeline
    "Run Verification Pipeline": "Jalankan Saluran Pengesahan",
    "Live Backend": "Pelayan Langsung",
    "Generate a reproducible test dataset using a seed, then run the emails through classification, document extraction and SI/BL comparison.":
      "Jana set data ujian yang boleh diulang menggunakan benih, kemudian proses e-mel melalui pengelasan, pengekstrakan dokumen dan perbandingan SI/BL.",
    "Leave the seed empty to process the supplied dataset instead.":
      "Biarkan benih kosong untuk memproses set data yang dibekalkan.",
    "Dataset Seed": "Benih Set Data",
    "Base Emails": "E-mel Asas",
    "Run Pipeline": "Jalankan Saluran",
    "Processing...": "Memproses...",
    "Processing dataset...": "Memproses set data...",
    "The backend is generating the dataset and running classification, extraction and document comparison. This may take a moment.":
      "Pelayan sedang menjana set data dan menjalankan pengelasan, pengekstrakan dan perbandingan dokumen. Ini mungkin mengambil sedikit masa.",
    "Pipeline failed": "Saluran gagal",
    "Pipeline completed successfully": "Saluran selesai dengan jayanya",
    "Failed to run the verification pipeline.": "Gagal menjalankan saluran pengesahan.",
    "Dataset": "Set Data",
    "Dataset processed": "Set data telah diproses",
    "Processed": "Diproses",
    "Review": "Semakan",
    "Offline Validation Benchmarks": "Penanda Aras Pengesahan Luar Talian",
    "Pre-computed development results against reference datasets.":
      "Keputusan pembangunan yang dikira terlebih dahulu terhadap set data rujukan.",
    "AI Fallback: ON": "Sandaran AI: HIDUP",
    "Rules": "Peraturan",
    "End-to-End": "Hujung ke Hujung",
    "Defect P/R": "Kecacatan P/R",
    "Supplied (Seed 42)": "Dibekalkan (Benih 42)",
    "5 Unseen Seeds": "5 Benih Baharu",
    "Total Emails": "Jumlah E-mel",
    "Clean (OK)": "Bersih (OK)",
    "Mismatches": "Ketidaksepadanan",
    "Needs Review": "Perlu Semakan",
    "Unable to load inbox": "Tidak dapat memuatkan peti masuk",
    "Unable to load inbox results from the backend.": "Tidak dapat memuatkan keputusan peti masuk daripada pelayan.",
    "Retry": "Cuba Semula",
    "Showing": "Menunjukkan",
    "of": "daripada",
    "items": "item",
    "Loading inbox...": "Memuatkan peti masuk...",
    "No emails found": "Tiada e-mel ditemui",
    "Run the pipeline or change the current filters.": "Jalankan saluran atau ubah penapis semasa.",
    "All": "Semua",
    "All Categories": "Semua Kategori",
    "All Statuses": "Semua Status",

    // review queue
    "Action Required": "Tindakan Diperlukan",
    "Cases escalated for human review": "Kes yang dirujuk untuk semakan manusia",
    "Cases": "Kes",
    "No items in the review queue! You're all caught up.": "Tiada item dalam barisan semakan. Semua sudah selesai.",
    "Open Workspace": "Buka Ruang Kerja",

    // report
    "Loading": "Memuatkan",
    "Data not found.": "Data tidak ditemui.",
    "← Back to Inbox": "← Kembali ke Peti Masuk",
    "Human Intervention Required:": "Campur Tangan Manusia Diperlukan:",
    "Document Comparison & Audit Workspace": "Ruang Kerja Perbandingan & Audit Dokumen",
    "Compare reference SI values with target BL data. Editable fields allow direct overrides.":
      "Bandingkan nilai rujukan SI dengan data sasaran BL. Medan yang boleh diedit membenarkan pembetulan terus.",
    "Fields Checked": "Medan Disemak",
    "Show this field in the source documents": "Tunjukkan medan ini dalam dokumen sumber",
    "SI (Reference)": "SI (Rujukan)",
    "BL (Target Value)": "BL (Nilai Sasaran)",
    "· OCR, verify": "· OCR, sila sahkan",
    "Verify reference values against the left viewer, adjust fields in the audit list below, and submit all changes at once.":
      "Sahkan nilai rujukan dengan paparan di sebelah kiri, laraskan medan dalam senarai audit di bawah, dan hantar semua perubahan sekali gus.",
    "Review the source files. You can confirm this failure or retry processing.":
      "Semak fail sumber. Anda boleh mengesahkan kegagalan ini atau cuba memproses semula.",
    "Confirm Issue": "Sahkan Isu",
    "Retrying...": "Mencuba semula...",
    "Retry Pipeline": "Cuba Semula Saluran",
    "Submitting All Changes...": "Menghantar Semua Perubahan...",
    "Confirm & Save All Corrections": "Sahkan & Simpan Semua Pembetulan",
    "Successfully submitted all corrections!": "Semua pembetulan berjaya dihantar!",
    "Failed to submit corrections:": "Gagal menghantar pembetulan:",
    "Failed to confirm issue:": "Gagal mengesahkan isu:",
    "Failed to retry pipeline:": "Gagal mencuba semula saluran:",
    "Failed to fetch email details": "Gagal mendapatkan butiran e-mel",
    "No mismatch detected": "Tiada ketidaksepadanan dikesan",
    "No comparison needed": "Tiada perbandingan diperlukan",
    "Email": "E-mel",
    "Raw Document": "Dokumen Asal",
    "Unknown": "Tidak diketahui",

    // amendment draft
    "Draft amendment request": "Draf permintaan pindaan",
    "Drafting…": "Mendraf…",
    "Writes the email asking the counterparty to correct the draft B/L.":
      "Menulis e-mel yang meminta pihak berkenaan membetulkan draf B/L.",
    "Amendment request": "Permintaan pindaan",
    "drafted by Gemini": "didraf oleh Gemini",
    "template": "templat",
    "· review before sending": "· semak sebelum dihantar",
    "Subject:": "Subjek:",
    "Copy": "Salin",
    "Copied": "Disalin",
    "Regenerate": "Jana Semula",
    "Regenerating...": "Menjana semula...",
    "Amendment email copied to clipboard!": "E-mel pindaan disalin ke papan keratan!",
    "Could not draft the request. Try again.": "Tidak dapat mendraf permintaan. Cuba lagi.",
    "This API does not have the amendment endpoint yet...": "API ini belum mempunyai titik akhir pindaan...",

    // document viewer
    "Source documents": "Dokumen sumber",
    "Open original": "Buka asal",
    "· read as": "· dibaca sebagai",
    "No text could be recovered from this file.": "Tiada teks dapat dipulihkan daripada fail ini.",
    "Scanned page - this is OCR text. Check values against the original.":
      "Halaman imbasan - ini teks OCR. Semak nilai dengan dokumen asal.",
    "Could not load the document.": "Tidak dapat memuatkan dokumen.",
    "Loading email…": "Memuatkan e-mel…",
    "From": "Daripada",
    "To": "Kepada",
    "Date": "Tarikh",
    "Subject": "Subjek",
    "Attached": "Lampiran",

    // statuses and field states (data values)
    "OK": "OK",
    "Mismatch": "Tidak Sepadan",
    "Needs review": "Perlu Semakan",
    "Uncertain": "Tidak Pasti",
    "Match": "Sepadan",

    // categories (data values)
    "BL comparison": "Perbandingan BL",
    "SI request": "Permintaan SI",
    "Invoice query": "Pertanyaan Invois",
    "General": "Umum",
    "Spam": "Spam",

    // review reasons (data values)
    "Missing attachment": "Lampiran tiada",
    "Unreadable": "Tidak boleh dibaca",
    "Wrong doc type": "Jenis dokumen salah",
    "Missing value": "Nilai tiada",
    "Low confidence": "Keyakinan rendah",

    // the seven fields (data values)
    "Shipper": "Pengirim",
    "Consignee": "Penerima",
    "Notify party": "Pihak Dimaklumkan",
    "Port of loading": "Pelabuhan Muatan",
    "Port of discharge": "Pelabuhan Punggah",
    "Container count": "Bilangan Kontena",
    "Gross weight kg": "Berat Kasar (kg)",
  },

  zh: {
    // added after the dashboard gained reset, export and run history
    "Document could not be parsed, likely a scan quality or corrupted file issue": "无法解析文件，可能是扫描质量问题或文件已损坏",
    "One or more required fields were not found in the extracted data": "提取的数据中缺少一个或多个必填字段",
    "Extraction confidence fell below the review threshold": "提取置信度低于审核阈值",
    "A comparison was requested but the documents were not attached": "已请求比对，但未附上文件",
    "An attachment is not a Shipping Instruction or Bill of Lading": "附件不是装运指示或提单",
    "Reset the shared dashboard to the supplied dataset and clear generated validation history for everyone?": "要将共享面板恢复为所提供的数据集，并为所有人清除已生成的验证记录吗？",
    "Language": "语言",
    "Reset to Default": "恢复默认",
    "Resetting...": "正在重置…",
    "Failed to reset the dashboard.": "重置面板失败。",
    "Score": "得分",
    "Seed": "种子",
    "Validation Performance": "验证表现",
    "Current pipeline performance alongside pre-computed validation benchmarks.": "当前流程表现，以及预先计算的验证基准。",
    "AI Fallback": "AI 后备",
    "ON": "开启",
    "OFF": "关闭",
    "Export": "导出",
    "Export JSON": "导出 JSON",
    "Export CSV": "导出 CSV",
    "Current Run": "本次运行",
    "Previous Run": "上次运行",
    "500 each": "每个 500 封",
    "Run a generated dataset to display the score for the current run.": "运行生成的数据集，以显示本次运行的得分。",

    // navigation
    "Inbox Dashboard": "收件箱面板",
    "Review Queue": "审核队列",
    "Dark mode": "深色模式",
    "Light mode": "浅色模式",

    // inbox and pipeline
    "Run Verification Pipeline": "运行核验流程",
    "Live Backend": "实时后端",
    "Generate a reproducible test dataset using a seed, then run the emails through classification, document extraction and SI/BL comparison.":
      "使用种子生成可复现的测试数据集，然后对邮件进行分类、文件提取以及 SI/BL 比对。",
    "Leave the seed empty to process the supplied dataset instead.": "种子留空则处理所提供的数据集。",
    "Dataset Seed": "数据集种子",
    "Base Emails": "基础邮件数",
    "Run Pipeline": "运行流程",
    "Processing...": "处理中…",
    "Processing dataset...": "正在处理数据集…",
    "The backend is generating the dataset and running classification, extraction and document comparison. This may take a moment.":
      "后端正在生成数据集，并进行分类、提取和文件比对，请稍候。",
    "Pipeline failed": "流程失败",
    "Pipeline completed successfully": "流程已成功完成",
    "Failed to run the verification pipeline.": "核验流程运行失败。",
    "Dataset": "数据集",
    "Dataset processed": "数据集已处理",
    "Processed": "已处理",
    "Review": "审核",
    "Offline Validation Benchmarks": "离线验证基准",
    "Pre-computed development results against reference datasets.": "基于参考数据集预先计算的开发结果。",
    "AI Fallback: ON": "AI 后备：开启",
    "Rules": "规则",
    "End-to-End": "端到端",
    "Defect P/R": "差异 精确率/召回率",
    "Supplied (Seed 42)": "所提供数据（种子 42）",
    "5 Unseen Seeds": "5 个未见过的种子",
    "Total Emails": "邮件总数",
    "Clean (OK)": "无问题（OK）",
    "Mismatches": "不一致",
    "Needs Review": "需人工审核",
    "Unable to load inbox": "无法加载收件箱",
    "Unable to load inbox results from the backend.": "无法从后端加载收件箱结果。",
    "Retry": "重试",
    "Showing": "显示",
    "of": "/",
    "items": "项",
    "Loading inbox...": "正在加载收件箱…",
    "No emails found": "未找到邮件",
    "Run the pipeline or change the current filters.": "请运行流程或更改筛选条件。",
    "All": "全部",
    "All Categories": "全部类别",
    "All Statuses": "全部状态",

    // review queue
    "Action Required": "需要处理",
    "Cases escalated for human review": "已上报人工审核的案例",
    "Cases": "个案例",
    "No items in the review queue! You're all caught up.": "审核队列为空，全部处理完毕。",
    "Open Workspace": "打开工作区",

    // report
    "Loading": "加载中",
    "Data not found.": "未找到数据。",
    "← Back to Inbox": "← 返回收件箱",
    "Human Intervention Required:": "需要人工介入：",
    "Document Comparison & Audit Workspace": "文件比对与审核工作区",
    "Compare reference SI values with target BL data. Editable fields allow direct overrides.":
      "将 SI 参考值与 BL 目标数据进行比对。可编辑字段支持直接修正。",
    "Fields Checked": "已核对字段",
    "Show this field in the source documents": "在源文件中显示此字段",
    "SI (Reference)": "SI（参考）",
    "BL (Target Value)": "BL（目标值）",
    "· OCR, verify": "· OCR，请核实",
    "Verify reference values against the left viewer, adjust fields in the audit list below, and submit all changes at once.":
      "请对照左侧查看器核实参考值，在下方审核列表中调整字段，然后一次性提交所有更改。",
    "Review the source files. You can confirm this failure or retry processing.":
      "请查看源文件。您可以确认此问题，或重新处理。",
    "Confirm Issue": "确认问题",
    "Retrying...": "重试中…",
    "Retry Pipeline": "重新运行流程",
    "Submitting All Changes...": "正在提交所有更改…",
    "Confirm & Save All Corrections": "确认并保存所有修正",
    "Successfully submitted all corrections!": "所有修正已成功提交！",
    "Failed to submit corrections:": "修正提交失败：",
    "Failed to confirm issue:": "确认问题失败：",
    "Failed to retry pipeline:": "重新运行流程失败：",
    "Failed to fetch email details": "获取邮件详情失败",
    "No mismatch detected": "未发现不一致",
    "No comparison needed": "无需比对",
    "Email": "邮件",
    "Raw Document": "原始文件",
    "Unknown": "未知",

    // amendment draft
    "Draft amendment request": "起草更正请求",
    "Drafting…": "起草中…",
    "Writes the email asking the counterparty to correct the draft B/L.": "撰写邮件，请对方更正提单草稿。",
    "Amendment request": "更正请求",
    "drafted by Gemini": "由 Gemini 起草",
    "template": "模板",
    "· review before sending": "· 发送前请审阅",
    "Subject:": "主题：",
    "Copy": "复制",
    "Copied": "已复制",
    "Regenerate": "重新生成",
    "Regenerating...": "重新生成中…",
    "Amendment email copied to clipboard!": "更正邮件已复制到剪贴板！",
    "Could not draft the request. Try again.": "无法起草请求，请重试。",
    "This API does not have the amendment endpoint yet...": "此 API 尚无更正接口…",

    // document viewer
    "Source documents": "源文件",
    "Open original": "打开原件",
    "· read as": "· 读取方式",
    "No text could be recovered from this file.": "无法从此文件中提取文本。",
    "Scanned page - this is OCR text. Check values against the original.": "扫描页面——此为 OCR 文本，请对照原件核对数值。",
    "Could not load the document.": "无法加载文件。",
    "Loading email…": "正在加载邮件…",
    "From": "发件人",
    "To": "收件人",
    "Date": "日期",
    "Subject": "主题",
    "Attached": "附件",

    // statuses and field states (data values)
    "OK": "正常",
    "Mismatch": "不一致",
    "Needs review": "需人工审核",
    "Uncertain": "不确定",
    "Match": "一致",

    // categories (data values)
    "BL comparison": "提单比对",
    "SI request": "SI 请求",
    "Invoice query": "发票查询",
    "General": "一般",
    "Spam": "垃圾邮件",

    // review reasons (data values)
    "Missing attachment": "缺少附件",
    "Unreadable": "无法读取",
    "Wrong doc type": "文件类型错误",
    "Missing value": "缺少数值",
    "Low confidence": "置信度低",

    // the seven fields (data values)
    "Shipper": "发货人",
    "Consignee": "收货人",
    "Notify party": "通知方",
    "Port of loading": "装货港",
    "Port of discharge": "卸货港",
    "Container count": "集装箱数量",
    "Gross weight kg": "毛重（公斤）",
  },
};

// "NEEDS_REVIEW", "Needs Review" and "needs review" share one entry.
const normalise = (s) => String(s).replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const INDEX = Object.fromEntries(
  Object.entries(DICT).map(([lang, table]) => [
    lang,
    Object.fromEntries(Object.entries(table).map(([k, v]) => [normalise(k), v])),
  ])
);

const STORAGE_KEY = "sdoc.language";

const LanguageContext = createContext({ lang: "en", setLang: () => {} });

function initialLanguage() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch {
    /* storage unavailable - fall through */
  }
  return "en";
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(initialLanguage);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* not fatal */
    }
    document.documentElement.lang = lang === "zh" ? "zh-Hans" : lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang }), [lang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

/** Returns t(text): the translation, or the original text if there is none. */
export function useT() {
  const { lang } = useContext(LanguageContext);
  return useCallback(
    (text) => {
      if (text == null || lang === "en") return text;
      const table = DICT[lang];
      return table[text] ?? INDEX[lang][normalise(text)] ?? text;
    },
    [lang]
  );
}
