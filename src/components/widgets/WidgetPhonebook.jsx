import React, { useMemo, useState } from 'react';
import { Building2, Phone, Search, X } from 'lucide-react';
import WidgetEmptyState, { getInitials } from './WidgetEmptyState';
import Tooltip from '../Tooltip';
import { useRotatingWidgetItems } from '../../utils/widgetDisplay';

export default function WidgetPhonebook({ data = [], settings = {} }) {
  const [query, setQuery] = useState('');

  const contacts = useMemo(
    () => [...data].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'he')),
    [data]
  );

  const filteredContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return contacts;

    return contacts.filter((contact) => {
      const haystack = [contact.name, contact.department, contact.number]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [contacts, query]);

  const rotationSettings = query ? { ...settings, itemsPerView: filteredContacts.length, autoScroll: false } : settings;
  const { visibleItems, page, totalPages } = useRotatingWidgetItems(filteredContacts, rotationSettings, 5000);

  if (!data || data.length === 0) {
    return <WidgetEmptyState icon={Phone} title="אין אנשי קשר" description="כשתוזן רשימת קשר, היא תופיע כאן עם גישה מהירה לחיוג." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-[22px] border border-gray-200/80 bg-white/90 p-3 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.45)] backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-primary/80">גישה מהירה</div>
            <div className="mt-1 text-sm font-semibold text-gray-600 dark:text-gray-300">
              {filteredContacts.length} מתוך {contacts.length} אנשי קשר
            </div>
          </div>
          <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            חיוג
          </div>
        </div>

        <div className="relative mt-3">
          <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="חפש לפי שם, מחלקה או מספר"
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-2.5 pr-10 pl-10 text-sm font-medium text-gray-700 outline-none transition focus:border-primary/30 focus:bg-white focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-[#171a22] dark:text-white dark:focus:bg-[#1b1f29]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
              aria-label="נקה חיפוש"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {filteredContacts.length === 0 ? (
        <WidgetEmptyState icon={Search} title="לא נמצאו תוצאות" description="נסה לחפש בשם אחר, מחלקה או מספר טלפון." />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            <div className="space-y-3">
              {visibleItems.map((contact) => (
                <div
                  key={contact.id}
                  className="rounded-[22px] border border-gray-200/80 bg-gradient-to-br from-white via-white to-gray-50 p-3.5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_20px_50px_-28px_rgba(15,23,42,0.55)] dark:border-white/10 dark:from-white/[0.07] dark:via-white/[0.05] dark:to-white/[0.03]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-sm font-black text-primary shadow-[0_0_18px_hsl(var(--color-primary)/0.15)]">
                      {getInitials(contact.name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-black text-gray-900 dark:text-white">
                        {contact.name || 'ללא שם'}
                      </div>
                      {contact.department ? (
                        <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-300">
                          <Building2 size={12} className="shrink-0 text-primary/80" />
                          <span className="truncate">{contact.department}</span>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">ללא שיוך מחלקתי</div>
                      )}
                    </div>
                  </div>

                  {contact.number ? (
                    <Tooltip text={`התקשר ל-${contact.name}`}>
                      <a
                        href={`tel:${contact.number}`}
                        className="mt-3 flex items-center justify-between rounded-2xl border border-primary/15 bg-primary/[0.06] px-3.5 py-2.5 text-right transition hover:border-primary/30 hover:bg-primary/[0.1]"
                      >
                        <div className="flex items-center gap-2 text-primary">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15">
                            <Phone size={15} />
                          </div>
                          <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary/80">חיוג מהיר</span>
                        </div>
                        <span className="text-sm font-black tracking-[0.18em] text-gray-700 dark:text-gray-100" dir="ltr">
                          {contact.number}
                        </span>
                      </a>
                    </Tooltip>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-dashed border-gray-200 px-3.5 py-2.5 text-xs font-medium text-gray-400 dark:border-white/10 dark:text-gray-500">
                      לא הוגדר מספר טלפון לאיש קשר זה
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {!query && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: totalPages }).map((_, index) => (
                <span
                  key={index}
                  className={`transition-all ${index === page ? 'h-2.5 w-7 rounded-full bg-primary shadow-[0_0_16px_hsl(var(--color-primary)/0.35)]' : 'h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-white/15'}`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
