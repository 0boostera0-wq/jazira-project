import ResourceState from "./ResourceState";

// Server-safe (no hooks). items: resourceView() objects, already sorted.

/** The official files of a subject: link-outs only (CSP frame-src 'self'; nothing is embedded or rehosted). */
export default function ResourceList({ items, t, locale, titleId, heading = true, className }) {
  return (
    <section aria-labelledby={heading ? titleId : undefined} className={className}>
      {heading && (
        <>
          <h2 id={titleId} className="t-h4">{t("resources.title")}</h2>
          <p className="t-caption mt-0.5">{t("resources.lead")}</p>
        </>
      )}
      {items.length ? (
        <ul className="mt-1 divide-y divide-line/10">
          {items.map((it) => (
            <li key={it.id}>
              <ResourceState item={it} t={t} locale={locale} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-small mt-3 rounded-md border border-dashed border-line/20 px-3.5 py-3 text-ink-3">{t("resources.empty")}</p>
      )}
    </section>
  );
}
