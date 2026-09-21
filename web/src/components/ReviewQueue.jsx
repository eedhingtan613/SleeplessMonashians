import { useEffect, useMemo, useState } from "react";
import { getReviewQueue } from "../data/reports";
import ReportView from "./ReportView";
import { useT } from "../i18n";

export default function ReviewQueue() {
  const t = useT();
  const [queue, setQueue] = useState([]);
  const [selectedEmailId, setSelectedEmailId] = useState(null);

  // Fetch the queue from the backend
  const loadQueue = () => {
    getReviewQueue().then(setQueue);
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const reasonBreakdown = useMemo(() => {
    return queue.reduce((counts, item) => {
      const reason = item.review_reason || "unspecified";
      counts[reason] = (counts[reason] || 0) + 1;
      return counts;
    }, {});
  }, [queue]);

  const downloadTextFile = (filename, content, type) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const escapeCsv = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n]/.test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };

  const reviewQueueReport = () => ({
    report_type: "shipping_document_human_review_queue",
    exported_at: new Date().toISOString(),
    summary: {
      total_cases: queue.length,
      reason_breakdown: reasonBreakdown,
    },
    cases: queue.map((item) => ({
      email_id: item.email_id ?? null,
      status: item.status ?? null,
      category: item.classification?.category ?? null,
      classification_confidence: item.classification?.confidence ?? null,
      classification_method: item.classification?.method ?? null,
      review_reason: item.review_reason ?? null,
      has_defect: item.has_defect ?? false,
      defect_fields: item.defect_fields ?? [],
      unconfirmed_mismatches: item.unconfirmed_mismatches ?? [],
      notes: item.notes ?? [],
      documents: {
        si: item.si
          ? {
              path: item.si.path ?? null,
              doc_type: item.si.doc_type ?? null,
              ingest_method: item.si.ingest_method ?? null,
              readable: item.si.readable ?? null,
              warnings: item.si.warnings ?? [],
            }
          : null,
        bl: item.bl
          ? {
              path: item.bl.path ?? null,
              doc_type: item.bl.doc_type ?? null,
              ingest_method: item.bl.ingest_method ?? null,
              readable: item.bl.readable ?? null,
              warnings: item.bl.warnings ?? [],
            }
          : null,
      },
      comparisons: (item.comparisons || []).map((comparison) => ({
        field: comparison.field ?? null,
        status: comparison.status ?? null,
        reason: comparison.reason ?? null,
        si_value: comparison.si?.value ?? null,
        bl_value: comparison.bl?.value ?? null,
        si_confidence: comparison.si?.confidence ?? null,
        bl_confidence: comparison.bl?.confidence ?? null,
      })),
    })),
  });

  const exportReviewQueue = (format) => {
    const report = reviewQueueReport();

    if (format === "json") {
      downloadTextFile(
        "review-queue-summary.json",
        JSON.stringify(report, null, 2),
        "application/json;charset=utf-8"
      );
      return;
    }

    const rows = [
      ["HUMAN REVIEW QUEUE REPORT"],
      ["Report type", report.report_type],
      ["Exported at", report.exported_at],
      ["Total cases", report.summary.total_cases],
      [],
      ["REASON BREAKDOWN"],
      ["Review reason", "Cases"],
      ...Object.entries(report.summary.reason_breakdown).map(([reason, count]) => [
        reason,
        count,
      ]),
      [],
      ["REVIEW CASES"],
      [
        "Email ID",
        "Category",
        "Status",
        "Review reason",
        "Classification confidence",
        "Classification method",
        "Has defect",
        "Defect fields",
        "Unconfirmed mismatches",
        "Notes",
        "SI path",
        "SI doc type",
        "SI ingest method",
        "SI readable",
        "BL path",
        "BL doc type",
        "BL ingest method",
        "BL readable",
        "Comparison fields",
      ],
      ...report.cases.map((item) => [
        item.email_id,
        item.category,
        item.status,
        item.review_reason,
        item.classification_confidence,
        item.classification_method,
        item.has_defect,
        item.defect_fields.join(" | "),
        item.unconfirmed_mismatches.join(" | "),
        item.notes.join(" | "),
        item.documents.si?.path ?? "",
        item.documents.si?.doc_type ?? "",
        item.documents.si?.ingest_method ?? "",
        item.documents.si?.readable ?? "",
        item.documents.bl?.path ?? "",
        item.documents.bl?.doc_type ?? "",
        item.documents.bl?.ingest_method ?? "",
        item.documents.bl?.readable ?? "",
        item.comparisons
          .map((comparison) => `${comparison.field}:${comparison.status}`)
          .join(" | "),
      ]),
    ];

    const csv = rows
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");

    downloadTextFile(
      "review-queue-summary.csv",
      csv,
      "text/csv;charset=utf-8"
    );
  };

  if (selectedEmailId) {
    return (
      <ReportView
        emailId={selectedEmailId}
        onBack={() => {
          setSelectedEmailId(null);
          loadQueue(); // Refresh the list so the completed item disappears
        }}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-8 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">{t("Action Required")}</h2>
          <p className="text-sm text-neutral-500 mt-1">{t("Cases escalated for human review")}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportReviewQueue("json")}
            disabled={queue.length === 0}
            className="text-xs font-bold px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("Export JSON")}
          </button>

          <button
            type="button"
            onClick={() => exportReviewQueue("csv")}
            disabled={queue.length === 0}
            className="text-xs font-bold px-3 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("Export CSV")}
          </button>

          <span className="bg-rose-100 text-rose-800 text-xs font-bold px-3 py-1 rounded-full">
            {queue.length} {t("Cases")}
          </span>
        </div>
      </div>

      <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 bg-white shadow-xs overflow-hidden">
        {queue.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 font-medium">
            {t("No items in the review queue! You're all caught up.")}
          </div>
        ) : (
          queue.map((item) => (
            <button
              key={item.email_id}
              onClick={() => setSelectedEmailId(item.email_id)}
              className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-rose-50/50 transition-all group"
            >
              <div>
                <p className="text-sm font-bold text-neutral-900 group-hover:text-rose-700 transition-colors">
                  {item.email_id}
                </p>
                <p className="text-[10px] text-rose-500 font-extrabold uppercase tracking-wider mt-1">
                  ↳ {t(item.review_reason?.replace(/_/g, " ") || "NEEDS REVIEW")}
                </p>
              </div>

              <span className="text-xs font-bold px-4 py-2 rounded-lg bg-neutral-900 text-white group-hover:bg-rose-600 transition-colors shadow-sm">
                {t("Open Workspace")}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
