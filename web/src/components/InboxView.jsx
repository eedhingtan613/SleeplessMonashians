import { useEffect, useMemo, useState } from "react";
import {
  getAllEmails,
  processInbox,
} from "../data/reports";
import { useT } from "../i18n";

const statusColor = {
  OK: "text-emerald-700 bg-emerald-50 border-emerald-200",
  MISMATCH: "text-amber-700 bg-amber-50 border-amber-200",
  NEEDS_REVIEW: "text-rose-700 bg-rose-50 border-rose-200",
};

const reasonDetails = {
  UNREADABLE:
    "Document could not be parsed, likely a scan quality or corrupted file issue",
  MISSING_FIELD:
    "One or more required fields were not found in the extracted data",
  LOW_CONFIDENCE:
    "Extraction confidence fell below the review threshold",
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

  // ------------------------------------------------------------
  // Inbox loading state
  // ------------------------------------------------------------
  const [loadingEmails, setLoadingEmails] = useState(true);
  const [loadError, setLoadError] = useState("");

  // ------------------------------------------------------------
  // Load emails from backend
  // ------------------------------------------------------------
  async function loadEmails() {
    try {
      setLoadError("");

      const data = await getAllEmails();

      setEmails(data);
    } catch (err) {
      console.error(err);

      setLoadError(
        err?.message || t("Unable to load inbox results from the backend.")
      );
    } finally {
      setLoadingEmails(false);
    }
  }

  useEffect(() => {
    loadEmails();
  }, []);

  // ------------------------------------------------------------
  // Run pipeline
  // ------------------------------------------------------------
  async function handleRunPipeline() {
    setProcessing(true);
    setProcessError("");

    try {
      const trimmedSeed = seed.trim();

      const result = await processInbox(
        trimmedSeed === "" ? null : trimmedSeed,
        datasetSize
      );

      setProcessResult(result);

      if (result?.evaluation) {
        setRunHistory((previous) =>
          [
            {
              ...result,
              runId: `${Date.now()}-${result.seed ?? "supplied"}`,
            },
            ...previous,
          ].slice(0, 5)
        );
      }

      // Reload the inbox because /process writes new results
      // into the backend database.
      await loadEmails();

      // Reset filters so the new dataset is easy to inspect.
      setCategoryFilter("ALL");
      setStatusFilter("ALL");
    } catch (err) {
      console.error(err);

      setProcessError(
        err?.message || t("Failed to run the verification pipeline.")
      );
    } finally {
      setProcessing(false);
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
                    ` · Seed ${processResult.seed}`}
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
                      {index === 0 ? "Current Run" : "Previous Run"}
                      {run.seed !== null &&
                        run.seed !== undefined &&
                        ` (Seed ${run.seed})`}
                    </td>

                    <td className="px-4 py-3 text-neutral-400">
                      —
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
                  </tr>
                );
              })}

              {/* HISTORICAL SUPPLIED DATASET BENCHMARK */}
              <tr className="hover:bg-neutral-50/50">
                <td className="px-4 py-3 font-medium text-neutral-900">
                  {t("Supplied (Seed 42)")}
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
              </tr>

              {/* HISTORICAL FIVE-SEED BENCHMARK */}
              <tr className="hover:bg-neutral-50/50">
                <td className="px-4 py-3 font-medium text-neutral-900">
                  {t("5 Unseen Seeds")}
                </td>

                <td className="px-4 py-3">
                  —
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
                            {detail}
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