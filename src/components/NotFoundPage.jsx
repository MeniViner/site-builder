import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Home, Shield } from 'lucide-react';

export default function NotFoundPage({ adminMode = false }) {
    const location = useLocation();
    const primaryPath = adminMode ? '/admin' : '/';
    const secondaryPath = adminMode ? '/' : '/admin';
    const primaryLabel = adminMode ? 'חזרה למסך ניהול' : 'חזרה לעמוד הבית';
    const secondaryLabel = adminMode ? 'מעבר לאתר הראשי' : 'מעבר לניהול';

    return (
        <div dir="rtl" className="min-h-screen w-full flex items-center justify-center bg-theme-bg-base text-theme px-6 py-10 font-heebo">
            <div className="w-full max-w-2xl rounded-3xl border border-theme-strong bg-theme-card/95 backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,0.35)] overflow-hidden">
                <div className="px-8 py-7 border-b border-theme-subtle bg-gradient-to-l from-theme-grad-start/60 via-transparent to-theme-grad-end/70">
                    <div className="flex items-center gap-3 text-theme">
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/15 border border-primary/35 text-primary-300">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.22em] text-theme-muted">Error 404</p>
                            <h1 className="text-2xl md:text-3xl font-black mt-1">העמוד לא נמצא</h1>
                        </div>
                    </div>
                </div>

                <div className="px-8 py-7 space-y-6">
                    <p className="text-theme-muted leading-relaxed">
                        הקישור שביקשת לא קיים או הוסר. בדוק את הכתובת ונסה שוב.
                    </p>

                    <div className="rounded-xl border border-theme-subtle bg-theme-elevated/70 px-4 py-3">
                        <p className="text-xs text-theme-muted mb-1">נתיב שנדרש</p>
                        <code className="text-sm text-theme-primary break-all">{location.pathname || '/'}</code>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            to={primaryPath}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/35 bg-primary/15 text-primary-200 hover:bg-primary/20 transition"
                        >
                            {adminMode ? <Shield size={17} /> : <Home size={17} />}
                            <span>{primaryLabel}</span>
                        </Link>

                        <Link
                            to={secondaryPath}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-theme-subtle bg-theme-elevated text-theme hover:bg-theme-card-hover transition"
                        >
                            <ArrowRight size={17} />
                            <span>{secondaryLabel}</span>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
