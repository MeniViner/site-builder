import React from 'react';

type UnauthorizedSiteBlockerProps = {
  currentLocation?: string;
  expectedSiteRoot?: string;
  showDetails?: boolean;
};

export default function UnauthorizedSiteBlocker({
  currentLocation = '',
  expectedSiteRoot = '',
  showDetails = false,
}: UnauthorizedSiteBlockerProps) {
  return (
    <main
      dir="rtl"
      role="alert"
      aria-live="assertive"
      className="min-h-screen w-full bg-[#101114] text-white font-heebo flex items-center justify-center px-5 py-10"
    >
      <section className="w-full max-w-2xl border border-red-500/45 bg-[#181b22] p-6 text-right shadow-2xl sm:p-8">
        <div className="inline-flex border border-red-400/50 bg-red-500/15 px-3 py-1 text-xs font-bold text-red-100">
          אזהרת אבטחה
        </div>
        <h1 className="mt-5 text-3xl font-black text-white sm:text-4xl">
          שימוש לא מורשה באתר
        </h1>
        <p className="mt-5 text-base leading-8 text-gray-100">
          האתר הופעל ממיקום שאינו מאושר. שימוש בעותק לא מורשה של האתר אסור. פרטי הגישה ונתוני המשתמש עשויים להיבדק ולהועבר לטיפול לגורם האחראי.
        </p>

        {showDetails && (
          <dl className="mt-6 grid gap-3 border-t border-white/10 pt-5 text-sm text-gray-300">
            <div>
              <dt className="font-bold text-gray-100">מיקום האתר הנוכחי:</dt>
              <dd className="mt-1 break-all text-left" dir="ltr">{currentLocation || 'unavailable'}</dd>
            </div>
            <div>
              <dt className="font-bold text-gray-100">אתר מורשה:</dt>
              <dd className="mt-1 break-all text-left" dir="ltr">{expectedSiteRoot || 'not configured'}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}
