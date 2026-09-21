import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAllEmails,
  getValidationRuns,
  processInbox,
  resetToDefault,
} from "../data/reports";
import { useT } from "../i18n";

const statusColor = {
  OK: "text-emerald-700 bg-emerald-50 border-emerald-200",
  MISMATCH: "text-amber-700 bg-amber-50 border-amber-200",
  NEEDS_REVIEW: "text-rose-700 bg-rose-50 border-rose-200",
};

// Keyed by the review_reason codes the API sends (lowercase). The keys were
// previously UPPERCASE, so the lookup never matched and no explanation showed.
const reasonDetails = {
  unreadable:
    "Document could not be parsed, likely a scan quality or corrupted file issue",
  missing_value:
    "One or more required fields were not found in the extracted data",
  low_confidence:
    "Extraction confidence fell below the review threshold",
  missing_attachment:
    "A comparison was requested but the documents were not attached",
  wrong_doc_type:
    "An attachment is not a Shipping Instruction or Bill of Lading",
};

export default function InboxView({ onSelect }) {
  const t = useT();
  const [emails, setEmails] = useState([]);

  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // ------------------------------------------------------------
  // Dataset / pipeline controls
  // ------------------------------------------------------------
  const [seed, setSeed] = useState("42");
  const [datasetSize, setDatasetSize] = useState("500");

  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState("");
  const [processResult, setProcessResult] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const [resetting, setResetting] = useState(false);

  // Prevent polling from overwriting the table with stale/intermediate responses
  // while a long pipeline run is in progress.
  const processingRef = useRef(false);
  const validationRequestIdRef = useRef(0);
  const emailsRequestIdRef = useRef(0);

  // ------------------------------------------------------------
  // Inbox loading state
  // ------------------------------------------------------------
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [loadError, setLoadError] = useState("");

  // ------------------------------------------------------------
  // Load emails from backend
  // ------------------------------------------------------------
  async function loadEmails({ force = false } = {}) {
    const requestId = ++emailsRequestIdRef.current;

    try {
      setLoadError("");
      const data = await getAllEmails();

      // Ignore an older response if a newer refresh has already started.
      if (requestId !== emailsRequestIdRef.current) return;
      // During our own long pipeline run, keep the currently displayed inbox
      // until /process finishes and we explicitly refresh it.
      if (processingRef.current && !force) return;

      setEmails(data);
    } catch (err) {
      console.error(err);
      if (requestId === emailsRequestIdRef.current) {
        setLoadError(
          err?.message || t("Unable to load inbox results from the backend.")
        );
      }
    } finally {
      if (requestId === emailsRequestIdRef.current) {
        setLoadingEmails(false);
      }
    }
  }

  async function loadValidationHistory({ force = false } = {}) {
    const requestId = ++validationRequestIdRef.current;

    try {
      const runs = await getValidationRuns(5);

      // Avoid out-of-order polling responses replacing newer history.
      if (requestId !== validationRequestIdRef.current) return;
      // Never replace the table with an intermediate backend snapshot while
      // this browser is actively running a large validation job.
      if (processingRef.current && !force) return;

      setRunHistory(runs);
      setProcessResult(runs[0] || null);
    } catch (err) {
      console.error("Unable to load shared validation history", err);
    }
  }

  useEffect(() => {
    loadEmails();
    loadValidationHistory();

    // Keep multiple teammates' dashboards in sync while they are open.
    // Skip polling while THIS browser is running a large pipeline job.
    const syncId = window.setInterval(() => {
      if (processingRef.current) return;
      loadEmails();
      loadValidationHistory();
    }, 5000);

    return () => window.clearInterval(syncId);
  }, []);

  // ------------------------------------------------------------
  // Run pipeline
  // ------------------------------------------------------------
  async function handleRunPipeline() {
    processingRef.current = true;
    setProcessing(true);
    setProcessError("");

    try {
      const trimmedSeed = seed.trim();

      const result = await processInbox(
        trimmedSeed === "" ? null : trimmedSeed,
        datasetSize
      );

      setProcessResult(result);

      // Reload shared backend state exactly once after the full run has been
      // committed. `force` allows this explicit refresh while processingRef
      // is still true.
      await Promise.all([
        loadEmails({ force: true }),
        loadValidationHistory({ force: true }),
      ]);

      // Reset filters so the new dataset is easy to inspect.
      setCategoryFilter("ALL");
      setStatusFilter("ALL");
    } catch (err) {
      console.error(err);

      setProcessError(
        err?.message || t("Failed to run the verification pipeline.")
      );
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  }

  async function handleResetToDefault() {
    const confirmed = window.confirm(
      t("Reset the shared dashboard to the supplied dataset and clear generated validation history for everyone?")
    );

    if (!confirmed) return;

    setResetting(true);
    setProcessError("");

    try {
      await resetToDefault();
      setSeed("42");
      setDatasetSize("500");
      setCategoryFilter("ALL");
      setStatusFilter("ALL");
      await Promise.all([
        loadEmails({ force: true }),
        loadValidationHistory({ force: true }),
      ]);
    } catch (err) {
      console.error(err);
      setProcessError(
        err?.message || t("Failed to reset the dashboard.")
      );
    } finally {
      setResetting(false);
    }
  }

  // ------------------------------------------------------------
  // Filters
  // ------------------------------------------------------------
  const categories = useMemo(
    () => ["ALL", ...new Set(emails.map((e) => e.category).filter(Boolean))],
    [emails]
  );

  const statuses = useMemo(
    () => ["ALL", ...new Set(emails.map((e) => e.status).filter(Boolean))],
    [emails]
  );

  const filtered = emails.filter(
    (e) =>
      (categoryFilter === "ALL" || e.category === categoryFilter) &&
      (statusFilter === "ALL" || e.status === statusFilter)
  );

  // ------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------
  const summary = {
    total: emails.length,
    ok: emails.filter((e) => e.status === "OK").length,
    mismatch: emails.filter((e) => e.status === "MISMATCH").length,
    review: emails.filter((e) => e.status === "NEEDS_REVIEW").length,
  };

  // ------------------------------------------------------------
  // Live evaluation returned by POST /process
  // ------------------------------------------------------------
  const evaluation = processResult?.evaluation;
  const aiFallbackEnabled = processResult?.llm_enabled;

  const formatScore = (value, digits = 4) =>
    typeof value === "number" ? value.toFixed(digits) : "—";

  const validationExportReport = (run) => {
    const ev = run?.evaluation || {};

    return {
      report_type: "shipping_document_validation_summary",
      exported_at: new Date().toISOString(),
      selected_run: {
        dataset: run?.dataset ?? null,
        seed: run?.seed ?? null,
        created_at: run?.created_at ?? null,
        ai_fallback_enabled: run?.llm_enabled ?? null,
      },
      volume: {
        base_emails: run?.requested_n ?? null,
        processed_emails: run?.processed ?? null,
        clean_ok: run?.ok ?? null,
        mismatches: run?.mismatches ?? null,
        needs_review: run?.needs_review ?? null,
      },
      validation_scores: {
        rules_score: run?.rules_score ?? null,
        rules_plus_gemini_score: ev.final_score ?? null,
        classification_macro_f1: ev.macro_f1 ?? null,
        defect_f1: ev.defect_f1 ?? null,
        end_to_end_rate: ev.end_to_end ?? null,
        defect_precision: ev.defect_precision ?? null,
        defect_recall: ev.defect_recall ?? null,
        end_to_end_success: ev.end_to_end_success ?? null,
        end_to_end_total: ev.end_to_end_total ?? null,
      },
      dashboard_snapshot: {
        total_emails: summary.total,
        clean_ok: summary.ok,
        mismatches: summary.mismatch,
        needs_review: summary.review,
      },
      reference_benchmarks: {
        supplied_seed_42: {
          base_emails: 500,
          rules_score: 0.9904,
          rules_plus_gemini_score: 0.9995,
          end_to_end_rate: 1.0,
          defect_precision: 1.0,
          defect_recall: 1.0,
        },
        five_unseen_seeds: {
          base_emails_each: 500,
          rules_mean: 0.9918,
          rules_plus_gemini_mean: 0.9990,
          rules_plus_gemini_std_dev: 0.0011,
          end_to_end_rate: 1.0,
          defect_precision: 1.0,
          defect_recall: 1.0,
        },
      },
    };
  };

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

  const exportValidation = (run, format) => {
    const report = validationExportReport(run);
    const seedLabel = run?.seed ?? "unknown";

    if (format === "json") {
      downloadTextFile(
        `validation-summary-seed-${seedLabel}.json`,
        JSON.stringify(report, null, 2),
        "application/json;charset=utf-8"
      );
      return;
    }

    // Human-readable multi-section CSV report rather than a single data row.
    const rows = [
      ["VALIDATION SUMMARY REPORT"],
      ["Report type", report.report_type],
      ["Exported at", report.exported_at],
      [],
      ["SELECTED RUN"],
      ["Dataset", report.selected_run.dataset],
      ["Seed", report.selected_run.seed],
      ["Created at", report.selected_run.created_at],
      ["AI fallback enabled", report.selected_run.ai_fallback_enabled],
      [],
      ["VOLUME"],
      ["Base emails", report.volume.base_emails],
      ["Processed emails", report.volume.processed_emails],
      ["Clean (OK)", report.volume.clean_ok],
      ["Mismatches", report.volume.mismatches],
      ["Needs review", report.volume.needs_review],
      [],
      ["VALIDATION SCORES"],
      ["Rules score", report.validation_scores.rules_score],
      ["Rules + Gemini score", report.validation_scores.rules_plus_gemini_score],
      ["Classification macro F1", report.validation_scores.classification_macro_f1],
      ["Defect F1", report.validation_scores.defect_f1],
      ["End-to-end rate", report.validation_scores.end_to_end_rate],
      ["Defect precision", report.validation_scores.defect_precision],
      ["Defect recall", report.validation_scores.defect_recall],
      ["End-to-end successes", report.validation_scores.end_to_end_success],
      ["End-to-end defect cases", report.validation_scores.end_to_end_total],
      [],
      ["CURRENT DASHBOARD SNAPSHOT"],
      ["Total emails", report.dashboard_snapshot.total_emails],
      ["Clean (OK)", report.dashboard_snapshot.clean_ok],
      ["Mismatches", report.dashboard_snapshot.mismatches],
      ["Needs review", report.dashboard_snapshot.needs_review],
      [],
      ["REFERENCE BENCHMARK - SUPPLIED SEED 42"],
      ["Base emails", report.reference_benchmarks.supplied_seed_42.base_emails],
      ["Rules score", report.reference_benchmarks.supplied_seed_42.rules_score],
      ["Rules + Gemini score", report.reference_benchmarks.supplied_seed_42.rules_plus_gemini_score],
      ["End-to-end rate", report.reference_benchmarks.supplied_seed_42.end_to_end_rate],
      ["Defect precision", report.reference_benchmarks.supplied_seed_42.defect_precision],
      ["Defect recall", report.reference_benchmarks.supplied_seed_42.defect_recall],
      [],
      ["REFERENCE BENCHMARK - 5 UNSEEN SEEDS"],
      ["Base emails each", report.reference_benchmarks.five_unseen_seeds.base_emails_each],
      ["Rules mean", report.reference_benchmarks.five_unseen_seeds.rules_mean],
      ["Rules + Gemini mean", report.reference_benchmarks.five_unseen_seeds.rules_plus_gemini_mean],
      ["Rules + Gemini std dev", report.reference_benchmarks.five_unseen_seeds.rules_plus_gemini_std_dev],
      ["End-to-end rate", report.reference_benchmarks.five_unseen_seeds.end_to_end_rate],
      ["Defect precision", report.reference_benchmarks.five_unseen_seeds.defect_precision],
      ["Defect recall", report.reference_benchmarks.five_unseen_seeds.defect_recall],
    ];

    const csv = rows
      .map((row) => row.map(escapeCsv).join(","))
      .join("\n");

    downloadTextFile(
      `validation-summary-seed-${seedLabel}.csv`,
      csv,
      "text/csv;charset=utf-8"
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-8 pb-12">
      {/* ========================================================
          RUN PIPELINE
      ======================================================== */}
      <div className="bg-white p-6 mb-8 border border-neutral-200 rounded-xl shadow-xs">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-neutral-900">
                {t("Run Verification Pipeline")}
              </h2>

              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
                {t("Live Backend")}
              </span>
            </div>

            <p className="text-xs text-neutral-500 mt-1 max-w-2xl leading-relaxed">
              {t(
                "Generate a reproducible test dataset using a seed, then run the emails through classification, document extraction and SI/BL comparison."
              )}
            </p>

            <p className="text-[11px] text-neutral-400 mt-2">
              {t(
                "Leave the seed empty to process the supplied dataset instead."
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {/* Seed */}
            <div>
              <label
                htmlFor="dataset-seed"
                className="block text-xs font-bold text-neutral-600 mb-1.5"
              >
                {t("Dataset Seed")}
              </label>

              <input
                id="dataset-seed"
                type="number"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                disabled={processing}
                placeholder="42"
                className="w-32 border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-neutral-800 bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all disabled:bg-neutral-100 disabled:text-neutral-400"
              />
            </div>

            {/* Number of generated base emails */}
            <div>
              <label
                htmlFor="dataset-size"
                className="block text-xs font-bold text-neutral-600 mb-1.5"
              >
                {t("Base Emails")}
              </label>

              <input
                id="dataset-size"
                type="number"
                value={datasetSize}
                onChange={(e) => setDatasetSize(e.target.value)}
                disabled={processing}
                min="1"
                max="2000"
                className="w-28 border border-neutral-200 rounded-lg px-3 py-2.5 text-sm text-neutral-800 bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all disabled:bg-neutral-100 disabled:text-neutral-400"
              />
            </div>

            {/* Run button */}
            <button
              type="button"
              onClick={handleRunPipeline}
              disabled={processing}
              className={`min-w-[150px] px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                processing
                  ? "bg-neutral-200 text-neutral-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
              }`}
            >
              {processing ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="animate-spin w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>

                  {t("Processing...")}
                </span>
              ) : (
                t("Run Pipeline")
              )}
            </button>

            <button
              type="button"
              onClick={handleResetToDefault}
              disabled={processing || resetting}
              className="min-w-[150px] px-5 py-2.5 rounded-lg text-sm font-bold border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed transition-all"
            >
              {resetting ? t("Resetting...") : t("Reset to Default")}
            </button>
          </div>
        </div>

        {/* Processing progress message */}
        {processing && (
          <div className="mt-5 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm font-semibold text-blue-800">
              {t("Processing dataset...")}
            </p>

            <p className="text-xs text-blue-700 mt-1">
              {t(
                "The backend is generating the dataset and running classification, extraction and document comparison. This may take a moment."
              )}
            </p>
          </div>
        )}

        {/* Processing error */}
        {processError && (
          <div className="mt-5 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg">
            <p className="text-sm font-bold text-rose-800">
              {t("Pipeline failed")}
            </p>

            <p className="text-xs text-rose-700 mt-1">
              {processError}
            </p>
          </div>
        )}

        {/* Processing success */}
        {processResult && !processing && (
          <div className="mt-5 px-4 py-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-sm font-bold text-emerald-800">
                  {t("Pipeline completed successfully")}
                </p>

                <p className="text-xs text-emerald-700 mt-1">
                  {processResult.dataset
                    ? `${t("Dataset")}: ${processResult.dataset}`
                    : t("Dataset processed")}
                  {processResult.seed !== null &&
                    processResult.seed !== undefined &&
                    ` · ${t("Seed")} ${processResult.seed}`}
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-x-6 gap-y-2 text-xs">
                {processResult.processed !== undefined && (
                  <div>
                    <span className="text-emerald-600">
                      {t("Processed")}
                    </span>

                    <span className="font-bold text-emerald-900 ml-1.5">
                      {processResult.processed}
                    </span>
                  </div>
                )}

                {processResult.evaluation?.final_score !== undefined && (
                  <div>
                    <span className="text-emerald-600">
                      {t("Score")}
                    </span>

                    <span className="font-bold text-emerald-900 ml-1.5">
                      {formatScore(
                        processResult.evaluation.final_score
                      )}
                    </span>
                  </div>
                )}

                {processResult.ok !== undefined && (
                  <div>
                    <span className="text-emerald-600">
                      OK
                    </span>

                    <span className="font-bold text-emerald-900 ml-1.5">
                      {processResult.ok}
                    </span>
                  </div>
                )}

                {processResult.mismatches !== undefined && (
                  <div>
                    <span className="text-emerald-600">
                      {t("Mismatch")}
                    </span>

                    <span className="font-bold text-emerald-900 ml-1.5">
                      {processResult.mismatches}
                    </span>
                  </div>
                )}

                {processResult.needs_review !== undefined && (
                  <div>
                    <span className="text-emerald-600">
                      {t("Review")}
                    </span>

                    <span className="font-bold text-emerald-900 ml-1.5">
                      {processResult.needs_review}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          VALIDATION PERFORMANCE
      ======================================================== */}
      <div className="bg-white p-6 mb-8 border border-neutral-200 rounded-xl shadow-xs">
        <div className="flex justify-between items-center mb-4 gap-4">
          <div>
            <h2 className="text-base font-bold text-neutral-900">
              {t("Validation Performance")}
            </h2>

            <p className="text-xs text-neutral-500 mt-0.5">
              {t(
                "Current pipeline performance alongside pre-computed validation benchmarks."
              )}
            </p>
          </div>

          <span
            className={`border text-xs font-bold px-3 py-1.5 rounded-md ${
              aiFallbackEnabled === false
                ? "bg-neutral-50 text-neutral-600 border-neutral-200"
                : aiFallbackEnabled === true
                ? "bg-blue-50 text-blue-700 border-blue-200"
                : "bg-neutral-50 text-neutral-500 border-neutral-200"
            }`}
          >
            {t("AI Fallback")}:{" "}
            {aiFallbackEnabled === true
              ? t("ON")
              : aiFallbackEnabled === false
              ? t("OFF")
              : "—"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-neutral-600 border-collapse">
            <thead className="text-xs text-neutral-500 uppercase bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3 font-semibold">
                  {t("Dataset")}
                </th>

                <th className="px-4 py-3 font-semibold">
                  {t("Base Emails")}
                </th>

                <th className="px-4 py-3 font-semibold">
                  {t("Rules")}
                </th>

                <th className="px-4 py-3 font-semibold">
                  + Gemini
                </th>

                <th className="px-4 py-3 font-semibold">
                  {t("End-to-End")}
                </th>

                <th className="px-4 py-3 font-semibold">
                  {t("Defect P/R")}
                </th>

                <th className="px-4 py-3 font-semibold">
                  {t("Export")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-neutral-100">
              {/* LIVE CURRENT RUN */}
              {runHistory.map((run, index) => {
                const ev = run.evaluation;

                return (
                  <tr
                    key={run.runId}
                    className={
                      index === 0
                        ? "bg-blue-50/50 hover:bg-blue-50"
                        : "hover:bg-neutral-50/50"
                    }
                  >
                    <td
                      className={`px-4 py-3 ${
                        index === 0
                          ? "font-bold text-blue-900"
                          : "font-medium text-neutral-800"
                      }`}
                    >
                      {index === 0 ? t("Current Run") : t("Previous Run")}
                      {run.seed !== null &&
                        run.seed !== undefined &&
                        ` (${t("Seed")} ${run.seed})`}
                    </td>

                    <td className="px-4 py-3 text-neutral-700">
                      {run.requested_n ?? "—"}
                    </td>

                    <td className="px-4 py-3 font-semibold text-neutral-700">
                      {formatScore(run.rules_score)}
                    </td>

                    <td
                      className={`px-4 py-3 font-bold ${
                        index === 0
                          ? "text-blue-700"
                          : "text-neutral-700"
                      }`}
                    >
                      {formatScore(ev.final_score)}
                    </td>

                    <td
                      className={`px-4 py-3 ${
                        index === 0
                          ? "font-semibold text-blue-700"
                          : ""
                      }`}
                    >
                      {formatScore(ev.end_to_end)}
                    </td>

                    <td
                      className={`px-4 py-3 ${
                        index === 0
                          ? "font-semibold text-blue-700"
                          : ""
                      }`}
                    >
                      {formatScore(ev.defect_precision, 3)}
                      {" / "}
                      {formatScore(ev.defect_recall, 3)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => exportValidation(run, "json")}
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                        >
                          JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => exportValidation(run, "csv")}
                          className="text-[11px] font-bold px-2.5 py-1.5 rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 transition-colors"
                        >
                          CSV
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* HISTORICAL SUPPLIED DATASET BENCHMARK */}
              <tr className="hover:bg-neutral-50/50">
                <td className="px-4 py-3 font-medium text-neutral-900">
                  {t("Supplied (Seed 42)")}
                </td>

                <td className="px-4 py-3">
                  500
                </td>

                <td className="px-4 py-3">
                  0.9904
                </td>

                <td className="px-4 py-3 font-semibold text-neutral-800">
                  0.9995
                </td>

                <td className="px-4 py-3">
                  1.0000
                </td>

                <td className="px-4 py-3">
                  1.000 / 1.000
                </td>

                <td className="px-4 py-3 text-neutral-400">
                  —
                </td>
              </tr>

              {/* HISTORICAL FIVE-SEED BENCHMARK */}
              <tr className="hover:bg-neutral-50/50">
                <td className="px-4 py-3 font-medium text-neutral-900">
                  {t("5 Unseen Seeds")}
                </td>

                <td className="px-4 py-3">
                  {t("500 each")}
                </td>

                <td className="px-4 py-3">
                  0.9918
                </td>

                <td className="px-4 py-3 font-bold text-blue-600">
                  0.9990 ± 0.0011
                </td>

                <td className="px-4 py-3">
                  1.0000
                </td>

                <td className="px-4 py-3">
                  1.000 / 1.000
                </td>

                <td className="px-4 py-3 text-neutral-400">
                  —
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {!evaluation && (
          <p className="text-[11px] text-neutral-400 mt-3">
            {t(
              "Run a generated dataset to display the score for the current run."
            )}
          </p>
        )}
      </div>

      {/* ========================================================
          SUMMARY STATS
      ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-5 border border-neutral-200 rounded-xl shadow-xs">
          <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider mb-1">
            {t("Total Emails")}
          </p>

          <p className="text-3xl font-extrabold text-neutral-900">
            {summary.total}
          </p>
        </div>

        <div className="bg-emerald-50/50 p-5 border border-emerald-200 rounded-xl shadow-xs">
          <p className="text-xs text-emerald-700 font-bold uppercase tracking-wider mb-1">
            {t("Clean (OK)")}
          </p>

          <p className="text-3xl font-extrabold text-emerald-800">
            {summary.ok}
          </p>
        </div>

        <div className="bg-amber-50/50 p-5 border border-amber-200 rounded-xl shadow-xs">
          <p className="text-xs text-amber-700 font-bold uppercase tracking-wider mb-1">
            {t("Mismatches")}
          </p>

          <p className="text-3xl font-extrabold text-amber-800">
            {summary.mismatch}
          </p>
        </div>

        <div className="bg-rose-50/50 p-5 border border-rose-200 rounded-xl shadow-xs">
          <p className="text-xs text-rose-700 font-bold uppercase tracking-wider mb-1">
            {t("Needs Review")}
          </p>

          <p className="text-3xl font-extrabold text-rose-800">
            {summary.review}
          </p>
        </div>
      </div>

      {/* ========================================================
          LOAD ERROR
      ======================================================== */}
      {loadError && (
        <div className="mb-6 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg">
          <p className="text-sm font-bold text-rose-800">
            {t("Unable to load inbox")}
          </p>

          <p className="text-xs text-rose-700 mt-1">
            {loadError}
          </p>

          <button
            type="button"
            onClick={() => {
              setLoadingEmails(true);
              loadEmails();
            }}
            className="mt-3 text-xs font-bold text-rose-700 underline"
          >
            {t("Retry")}
          </button>
        </div>
      )}

      {/* ========================================================
          FILTER BAR
      ======================================================== */}
      <div className="flex flex-wrap gap-4 mb-6 items-center">
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={categories}
          defaultLabel="All Categories"
        />

        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={statuses}
          defaultLabel="All Statuses"
        />

        <span className="text-sm text-neutral-500 ml-auto font-medium">
          {t("Showing")}{" "}
          <span className="font-bold text-neutral-800">
            {filtered.length}
          </span>{" "}
          {t("of")} {emails.length} {t("items")}
        </span>
      </div>

      {/* ========================================================
          EMAIL LIST
      ======================================================== */}
      <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 bg-white shadow-xs overflow-visible">
        {loadingEmails && emails.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="inline-flex items-center gap-2 text-sm text-neutral-500">
              <svg
                className="animate-spin w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />

                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>

              {t("Loading inbox...")}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-bold text-neutral-700">
              {t("No emails found")}
            </p>

            <p className="text-xs text-neutral-500 mt-1">
              {t("Run the pipeline or change the current filters.")}
            </p>
          </div>
        ) : (
          filtered.map((e) => {
            const detail =
              e.review_detail || reasonDetails[e.review_reason];

            const category =
              e.category?.replaceAll("_", " ") || "UNKNOWN";

            const status =
              e.status?.replaceAll("_", " ") || "UNKNOWN";

            return (
              <button
                key={e.email_id}
                type="button"
                onClick={() => onSelect(e.email_id)}
                className="w-full flex items-center justify-between gap-6 px-6 py-4 text-left hover:bg-neutral-50/80 transition-all group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-neutral-900 group-hover:text-blue-600 transition-colors">
                    {e.email_id}
                  </p>

                  <p className="text-xs text-neutral-500 mt-0.5 font-medium">
                    {t(category)}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full border ${
                      statusColor[e.status] ??
                      "text-neutral-600 bg-neutral-50 border-neutral-200"
                    }`}
                  >
                    {t(status)}
                  </span>

                  {/* Human-review reason */}
                  {e.status === "NEEDS_REVIEW" &&
                    e.review_reason && (
                      <div className="group/reason relative">
                        <span
                          className="text-[10px] text-rose-600 font-extrabold uppercase tracking-wider cursor-help inline-flex items-center gap-1"
                          title={detail || ""}
                        >
                          ↳{" "}
                          {t(
                            e.review_reason.replace(
                              /_/g,
                              " "
                            )
                          )}

                          {detail && (
                            <svg
                              className="w-2.5 h-2.5 opacity-60"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          )}
                        </span>

                        {/* Review detail tooltip */}
                        {detail && (
                          <div className="absolute right-0 top-full mt-1 w-64 bg-neutral-900 text-white text-[11px] font-normal normal-case rounded-md px-3 py-2 opacity-0 invisible group-hover/reason:opacity-100 group-hover/reason:visible transition-all z-20 shadow-lg">
                            {t(detail)}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  defaultLabel = "All",
}) {
  const t = useT();

  return (
    <select
      value={value}
      onChange={(ev) => onChange(ev.target.value)}
      className="text-sm border border-neutral-200 rounded-lg px-4 py-2.5 bg-white text-neutral-700 font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all cursor-pointer shadow-2xs"
    >
      {options.map((option) => (
        <option
          key={option}
          value={option}
        >
          {option === "ALL"
            ? t(defaultLabel)
            : t(option.replaceAll("_", " "))}
        </option>
      ))}
    </select>
  );
}