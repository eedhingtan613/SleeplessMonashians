import { LANGUAGES, useLanguage, useT } from "../i18n";
import { useTheme } from "../theme";
export default function Nav({ view, setView }) {
  const t = useT();
  const { lang, setLang } = useLanguage();
  const { theme, toggle } = useTheme();
  return (
    <nav className="bg-white border-b border-neutral-200 mb-8 shadow-xs">
      <div className="max-w-7xl mx-auto px-8 flex items-center gap-8">
        <button
          onClick={() => setView("inbox")}
          className={`py-4 text-sm font-bold border-b-2 transition-colors ${
            view === "inbox" || view === "report"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          {t("Inbox Dashboard")}
        </button>
        <button
          onClick={() => setView("review")}
          className={`py-4 text-sm font-bold border-b-2 transition-colors ${
            view === "review"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-neutral-500 hover:text-neutral-700"
          }`}
        >
          {t("Review Queue")}
        </button>

        <button
          type="button"
          onClick={toggle}
          title={theme === "dark" ? t("Light mode") : t("Dark mode")}
          aria-label={theme === "dark" ? t("Light mode") : t("Dark mode")}
          className="ml-auto w-9 h-9 flex items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>

        <label className="flex items-center gap-2 text-xs font-bold text-neutral-500">
          <span aria-hidden="true">🌐</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            aria-label={t("Language")}
            className="border border-neutral-200 rounded-lg px-2 py-1.5 bg-white text-neutral-700 font-medium outline-none focus:border-blue-500 cursor-pointer"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </label>
      </div>
    </nav>
  );
}