import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Check,
    ChevronDown,
    ChevronUp,
    Eye,
    EyeOff,
    GripVertical,
    Image as ImageIcon,
    Layers3,
    LayoutGrid,
    Link as LinkIcon,
    Loader2,
    PanelsTopLeft,
    Pencil,
    Plus,
    Trash2,
    Upload,
    Waves,
    X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useImageGalleries } from '../context/ImageGalleryContext';
import { uploadGalleryImage } from '../services/galleryMediaStorage';
import { confirmToast } from '../utils/confirmToast';
import {
    createEmptyImageGallery,
    createImageGalleryImageId,
    getImageGalleryValidationIssues,
    IMAGE_GALLERY_STYLES,
    isSafeGalleryMediaReference,
    normalizeImageGalleryRecord,
    reorderGalleryImages,
    reorderImageGalleryItems,
} from '../utils/imageGallery';
import { GalleryImage, ImageGalleryRenderer } from './home/ImageGallerySection';

const STYLE_ICONS = {
    'magal-strips': Waves,
    'classic-carousel': PanelsTopLeft,
    'center-carousel': ImageIcon,
    coverflow: Layers3,
    masonry: LayoutGrid,
};

function MovingStripsStyleMiniature() {
    return (
        <span className="magal-style-miniature" aria-hidden="true">
            {[0, 1].map((rowIndex) => (
                <span className="magal-style-miniature__row" key={rowIndex}>
                    {Array.from({ length: 8 }, (_, cardIndex) => (
                        <span className="magal-style-miniature__card" key={`${rowIndex}-${cardIndex}`} />
                    ))}
                </span>
            ))}
        </span>
    );
}

function fileNameToAlt(fileName = '') {
    return String(fileName)
        .replace(/\.[a-z0-9]{1,8}$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim()
        .slice(0, 500);
}

function moveItem(items, index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function GalleryStyleSelector({ value, onChange }) {
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {IMAGE_GALLERY_STYLES.map((style) => {
                const Icon = STYLE_ICONS[style.value] || ImageIcon;
                const selected = value === style.value;
                return (
                    <button
                        key={style.value}
                        type="button"
                        onClick={() => onChange(style.value)}
                        className={`relative min-h-44 overflow-hidden rounded-2xl border p-4 text-right transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-gray-200 bg-white hover:border-primary/50 dark:border-white/10 dark:bg-white/5'}`}
                        aria-pressed={selected}
                    >
                        <span className="mb-3 flex h-16 items-center justify-center rounded-xl bg-gradient-to-br from-primary/35 via-primary/10 to-transparent">
                            {style.value === 'magal-strips'
                                ? <MovingStripsStyleMiniature />
                                : <Icon size={32} className="text-primary" aria-hidden="true" />}
                        </span>
                        <span className="block text-sm font-black text-gray-900 dark:text-white">{style.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">{style.description}</span>
                        {selected && <Check size={17} className="absolute left-3 top-3 text-primary" aria-label="נבחר" />}
                    </button>
                );
            })}
        </div>
    );
}

function MovingStripsSettingsEditor({ settings, onChange }) {
    const updateSettings = (patch) => onChange({ ...settings, ...patch });
    const updateRow = (rowIndex, patch) => updateSettings({
        rows: settings.rows.map((row, index) => (index === rowIndex ? { ...row, ...patch } : row)),
    });

    return (
        <div className="mt-5 rounded-2xl bg-slate-50 p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_8px_24px_-20px_rgba(15,23,42,0.45)] dark:bg-slate-950/45 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.10)]" data-testid="magal-settings">
            <div>
                <h3 className="font-black text-gray-900 dark:text-white">הגדרות רצועות בתנועה</h3>
                <p className="mt-1 text-pretty text-xs leading-5 text-gray-500 dark:text-gray-400">הכיוונים הם פיזיים ונשמרים גם בממשק RTL. התצוגה המקדימה מושהית כדי להקל על העריכה.</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-xs font-bold">מספר שורות
                    <select value={settings.rowCount} onChange={(event) => updateSettings({ rowCount: Number(event.target.value) })} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm dark:border-white/15 dark:bg-slate-900" aria-label="מספר שורות – רצועות בתנועה">
                        {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
                    </select>
                </label>
                <label className="grid gap-1 text-xs font-bold">גודל כרטיס (px)
                    <input type="number" min="120" max="280" step="4" value={settings.cardSizePx} onChange={(event) => updateSettings({ cardSizePx: Number(event.target.value) })} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-left text-sm tabular-nums dark:border-white/15 dark:bg-slate-900" aria-label="גודל כרטיסים – רצועות בתנועה" />
                </label>
                <label className="grid gap-1 text-xs font-bold">מרווח (px)
                    <input type="number" min="4" max="32" step="1" value={settings.gapPx} onChange={(event) => updateSettings({ gapPx: Number(event.target.value) })} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-left text-sm tabular-nums dark:border-white/15 dark:bg-slate-900" aria-label="מרווח כרטיסים – רצועות בתנועה" />
                </label>
            </div>

            <div className="mt-4 space-y-3">
                {settings.rows.slice(0, settings.rowCount).map((row, rowIndex) => (
                    <fieldset key={row.id} className="rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(15,23,42,0.07)] dark:bg-white/5 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                        <legend className="px-1 text-xs font-black">שורה {rowIndex + 1}</legend>
                        <div className="mt-1 grid gap-3 sm:grid-cols-3">
                            <label className="grid gap-1 text-xs font-bold">כיוון
                                <select value={row.direction} onChange={(event) => updateRow(rowIndex, { direction: event.target.value })} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm dark:border-white/15 dark:bg-slate-900" aria-label={`כיוון שורה ${rowIndex + 1}`}>
                                    <option value="left">שמאלה</option>
                                    <option value="right">ימינה</option>
                                </select>
                            </label>
                            <label className="grid gap-1 text-xs font-bold">משך מחזור (שניות)
                                <input type="number" min="10" max="120" step="1" value={row.durationSeconds} onChange={(event) => updateRow(rowIndex, { durationSeconds: Number(event.target.value) })} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-left text-sm tabular-nums dark:border-white/15 dark:bg-slate-900" aria-label={`מהירות שורה ${rowIndex + 1}`} />
                            </label>
                            <label className="grid gap-1 text-xs font-bold">זווית (°)
                                <input type="number" min="-12" max="12" step="0.5" value={row.angleDegrees} onChange={(event) => updateRow(rowIndex, { angleDegrees: Number(event.target.value) })} className="min-h-10 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-left text-sm tabular-nums dark:border-white/15 dark:bg-slate-900" aria-label={`זווית שורה ${rowIndex + 1}`} />
                            </label>
                        </div>
                    </fieldset>
                ))}
            </div>
        </div>
    );
}

function GalleryListItem({ gallery, onEdit, onDelete, onToggle, onMove, moveDisabled }) {
    const firstImage = gallery.images.find((image) => image.mediaRef);
    const activeImageCount = gallery.images.filter((image) => image.mediaRef && image.alt).length;
    return (
        <article className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 sm:flex-row sm:items-center">
            <div className="h-20 w-full shrink-0 overflow-hidden rounded-xl bg-slate-900 sm:w-32">
                {firstImage ? <GalleryImage image={firstImage} alt="" decorative loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-300"><ImageIcon aria-hidden="true" /></div>}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-black text-gray-900 dark:text-white">{gallery.title || 'גלריה ללא כותרת'}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${gallery.active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>{gallery.active ? 'פעילה' : 'מוסתרת'}</span>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{gallery.images.length} תמונות · {activeImageCount} תקינות להצגה · {IMAGE_GALLERY_STYLES.find((style) => style.value === gallery.style)?.label}</p>
                {gallery.description && <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{gallery.description}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => onMove(-1)} disabled={moveDisabled.previous} className="rounded-lg border border-gray-200 p-2 text-gray-600 disabled:opacity-40 dark:border-white/10 dark:text-gray-300" aria-label="העבר גלריה למעלה"><ArrowUp size={17} aria-hidden="true" /></button>
                <button type="button" onClick={() => onMove(1)} disabled={moveDisabled.next} className="rounded-lg border border-gray-200 p-2 text-gray-600 disabled:opacity-40 dark:border-white/10 dark:text-gray-300" aria-label="העבר גלריה למטה"><ArrowDown size={17} aria-hidden="true" /></button>
                <button type="button" onClick={() => onToggle(!gallery.active)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 dark:border-white/10 dark:text-gray-200" aria-label={gallery.active ? 'הסתר גלריה' : 'הצג גלריה'}>{gallery.active ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{gallery.active ? 'הסתר' : 'הצג'}</button>
                <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white"><Pencil size={16} aria-hidden="true" />עריכה</button>
                <button type="button" onClick={onDelete} className="rounded-lg border border-red-200 p-2 text-red-700 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-300" aria-label="מחק גלריה"><Trash2 size={17} aria-hidden="true" /></button>
            </div>
        </article>
    );
}

function GalleryEditor({ initialGallery, onClose }) {
    const { saveGallery } = useImageGalleries();
    const [draft, setDraft] = useState(() => normalizeImageGalleryRecord(initialGallery));
    const [uploading, setUploading] = useState(false);
    const [autoSaveState, setAutoSaveState] = useState('saved');
    const [draggedImageId, setDraggedImageId] = useState(null);
    const [replaceImageId, setReplaceImageId] = useState(null);
    const [expandedImageId, setExpandedImageId] = useState(null);
    const fileInputRef = useRef(null);
    const autoSaveTimerRef = useRef(null);
    const saveGalleryRef = useRef(saveGallery);
    const saveQueueRef = useRef(Promise.resolve());
    const scheduledSnapshotRef = useRef('');
    const initialSnapshot = JSON.stringify(normalizeImageGalleryRecord(initialGallery));
    const savedSnapshotRef = useRef(initialSnapshot);
    const draftSnapshotRef = useRef(initialSnapshot);

    const validationIssues = useMemo(() => getImageGalleryValidationIssues(draft), [draft]);
    const errorsByField = useMemo(() => new Map(validationIssues.map((issue) => [issue.field, issue.message])), [validationIssues]);
    const draftSnapshot = useMemo(() => JSON.stringify(normalizeImageGalleryRecord(draft)), [draft]);
    const isDirty = draftSnapshot !== savedSnapshotRef.current;

    useEffect(() => {
        saveGalleryRef.current = saveGallery;
    }, [saveGallery]);

    useEffect(() => {
        draftSnapshotRef.current = draftSnapshot;
    }, [draftSnapshot]);

    const updateDraft = (updater) => {
        setAutoSaveState('pending');
        setDraft((current) => normalizeImageGalleryRecord(
            typeof updater === 'function' ? updater(current) : updater,
        ));
    };

    const updateDisplay = (patch) => updateDraft((current) => ({
        ...current,
        display: {
            ...current.display,
            ...patch,
        },
    }));

    const persistDraft = useCallback(async (payload, snapshot) => {
        if (scheduledSnapshotRef.current === snapshot) {
            try {
                await saveQueueRef.current;
                return savedSnapshotRef.current === snapshot;
            } catch {
                return false;
            }
        }

        scheduledSnapshotRef.current = snapshot;
        setAutoSaveState('saving');
        const saveTask = saveQueueRef.current
            .catch(() => undefined)
            .then(() => saveGalleryRef.current(payload));
        saveQueueRef.current = saveTask;

        try {
            await saveTask;
            savedSnapshotRef.current = snapshot;
            setAutoSaveState(draftSnapshotRef.current === snapshot ? 'saved' : 'pending');
            return true;
        } catch (error) {
            setAutoSaveState('error');
            toast.error(error?.message || 'השמירה האוטומטית של הגלריה נכשלה.');
            return false;
        } finally {
            if (scheduledSnapshotRef.current === snapshot) scheduledSnapshotRef.current = '';
        }
    }, []);

    useEffect(() => {
        if (!isDirty || uploading || scheduledSnapshotRef.current === draftSnapshot) return undefined;

        setAutoSaveState('pending');
        const payload = normalizeImageGalleryRecord(draft);
        autoSaveTimerRef.current = window.setTimeout(() => {
            persistDraft(payload, draftSnapshot);
        }, 700);

        return () => {
            window.clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
        };
    }, [draft, draftSnapshot, isDirty, persistDraft, uploading]);

    const closeEditor = async () => {
        if (autoSaveTimerRef.current) {
            window.clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
        }
        if (draftSnapshotRef.current !== savedSnapshotRef.current) {
            const saved = await persistDraft(normalizeImageGalleryRecord(draft), draftSnapshotRef.current);
            if (!saved) return;
        }
        onClose();
    };

    const triggerUpload = (imageId = null) => {
        setReplaceImageId(imageId);
        fileInputRef.current?.click();
    };

    const handleUpload = async (event) => {
        const files = [...(event.target.files || [])];
        if (files.length === 0) return;
        setUploading(true);
        try {
            const uploaded = [];
            for (const file of files) {
                const media = await uploadGalleryImage(file);
                uploaded.push({
                    id: createImageGalleryImageId(),
                    mediaRef: media.mediaRef,
                    alt: fileNameToAlt(file.name),
                    caption: '',
                    width: media.width,
                    height: media.height,
                    media: media.media,
                });
            }
            updateDraft((current) => {
                if (!replaceImageId) return { ...current, images: [...current.images, ...uploaded] };
                const replacement = uploaded[0];
                return {
                    ...current,
                    images: current.images.map((image) => image.id === replaceImageId
                        ? { ...replacement, id: image.id, alt: image.alt || replacement.alt, caption: image.caption }
                        : image),
                };
            });
            toast.success(replaceImageId ? 'התמונה הוחלפה.' : `${uploaded.length} תמונות נוספו לגלריה.`);
        } catch (error) {
            toast.error(error?.message || 'העלאת התמונה נכשלה.');
        } finally {
            setUploading(false);
            setReplaceImageId(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const removeImage = async (imageId) => {
        const confirmed = await confirmToast({
            title: 'מחיקת תמונה',
            message: 'להסיר את התמונה מהגלריה? קובץ המדיה המקורי לא יימחק מאחסון האתר.',
            confirmText: 'הסר תמונה',
            cancelText: 'ביטול',
            type: 'warning',
        });
        if (confirmed) updateDraft((current) => ({ ...current, images: current.images.filter((image) => image.id !== imageId) }));
    };

    const updateImage = (imageId, patch) => updateDraft((current) => ({
        ...current,
        images: current.images.map((image) => image.id === imageId ? { ...image, ...patch } : image),
    }));

    const reorderImages = (sourceId, targetId) => updateDraft((current) => ({
        ...current,
        images: reorderGalleryImages(current.images, sourceId, targetId),
    }));

    const autoSaveLabel = (() => {
        if (uploading) return 'מעלה תמונות…';
        if (autoSaveState === 'saving') return 'שומר אוטומטית…';
        if (autoSaveState === 'error') return 'השמירה נכשלה';
        if (isDirty || autoSaveState === 'pending') return 'ממתין לשמירה אוטומטית';
        return 'כל השינויים נשמרו';
    })();

    const autoSaveClassName = autoSaveState === 'error'
        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';

    const renderAutoSaveStatus = () => (
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${autoSaveClassName}`} role="status">
            {(uploading || autoSaveState === 'saving') ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
            {autoSaveLabel}
        </span>
    );

    return (
        <div className="min-h-screen bg-gray-100 p-4 text-gray-900 dark:bg-[#1e212b] dark:text-white sm:p-8" dir="rtl">
            <input ref={fileInputRef} type="file" accept="image/avif,image/gif,image/jpeg,image/png,image/svg+xml,image/webp" multiple={!replaceImageId} className="hidden" onChange={handleUpload} />
            <div className="mx-auto max-w-7xl">
                <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-6 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-black">{initialGallery.title ? 'עריכת גלריית תמונות' : 'גלריית תמונות חדשה'}</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">כל שינוי נשמר אוטומטית. קבצי המדיה נשמרים באחסון האתר.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {renderAutoSaveStatus()}
                        <button type="button" onClick={closeEditor} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 font-bold dark:border-white/10 dark:bg-white/5"><X size={18} aria-hidden="true" />חזרה לרשימה</button>
                    </div>
                </div>

                <form onSubmit={(event) => event.preventDefault()} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
                    <div className="space-y-6">
                        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
                            <h2 className="text-lg font-black">פרטי הגלריה</h2>
                            <div className="mt-4 grid gap-4">
                                <label className="grid gap-1.5 text-sm font-bold">כותרת
                                    <input value={draft.title} onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))} maxLength={180} required className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base dark:border-white/15 dark:bg-slate-900" aria-describedby={errorsByField.has('title') ? 'gallery-title-error' : undefined} />
                                    {errorsByField.has('title') && <span id="gallery-title-error" className="text-xs text-red-600">{errorsByField.get('title')}</span>}
                                </label>
                                <label className="grid gap-1.5 text-sm font-bold">תיאור (אופציונלי)
                                    <textarea value={draft.description} onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))} maxLength={2000} rows={3} className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base dark:border-white/15 dark:bg-slate-900" />
                                </label>
                                <label className="inline-flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={draft.active} onChange={(event) => updateDraft((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-primary" />הצג גלריה זו בדף הבית</label>
                                <fieldset className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
                                    <legend className="px-1 text-sm font-black">כותרת ותיאור בדף הבית</legend>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <label className="inline-flex items-center gap-2 text-sm font-bold">
                                            <input type="checkbox" checked={draft.display.showTitle !== false} onChange={(event) => updateDisplay({ showTitle: event.target.checked })} className="h-4 w-4 accent-primary" />
                                            הצג כותרת
                                        </label>
                                        <label className="inline-flex items-center gap-2 text-sm font-bold">
                                            <input type="checkbox" checked={draft.display.showDescription !== false} onChange={(event) => updateDisplay({ showDescription: event.target.checked })} className="h-4 w-4 accent-primary" />
                                            הצג תיאור
                                        </label>
                                    </div>
                                    <div className="mt-4">
                                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">יישור הכותרת והתיאור</span>
                                        <div className="mt-2 inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-white/10 dark:bg-slate-950/50" role="group" aria-label="יישור כותרת הגלריה">
                                            {[
                                                { value: 'center', label: 'מרכז' },
                                                { value: 'right', label: 'ימין' },
                                            ].map((option) => {
                                                const selected = (draft.display.titleAlignment || 'center') === option.value;
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => updateDisplay({ titleAlignment: option.value })}
                                                        className={`rounded-lg px-4 py-2 text-sm font-bold transition-[background-color,color,box-shadow] ${selected ? 'bg-white text-primary shadow-sm dark:bg-white/10' : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                                                        aria-pressed={selected}
                                                    >
                                                        {option.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </fieldset>
                            </div>
                        </section>

                        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="text-lg font-black">תמונות וסדר תצוגה</h2>
                                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">{draft.images.length} תמונות</span>
                                    </div>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">הרשימה נגללת בנפרד. פתחו רק את התמונה שצריך לערוך, וגררו או השתמשו בחיצים לשינוי הסדר.</p>
                                </div>
                                <button type="button" onClick={() => triggerUpload()} disabled={uploading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Upload size={18} aria-hidden="true" />{uploading ? <Loader2 size={17} className="animate-spin" /> : 'העלאת תמונות'}</button>
                            </div>
                            {draft.images.length === 0 ? (
                                <div className="mt-5 rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-white/20 dark:text-gray-400"><ImageIcon className="mx-auto mb-3" aria-hidden="true" />עדיין לא נוספו תמונות. העלו קובץ או הוסיפו הפניה קיימת.</div>
                            ) : (
                                <div className="mt-5 max-h-[min(62vh,720px)] space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-gray-50/70 p-2 [scrollbar-gutter:stable] dark:border-white/10 dark:bg-slate-950/25" data-testid="gallery-image-list">
                                    {draft.images.map((image, index) => (
                                        <article
                                            key={image.id}
                                            draggable
                                            onDragStart={() => setDraggedImageId(image.id)}
                                            onDragEnd={() => setDraggedImageId(null)}
                                            onDragOver={(event) => event.preventDefault()}
                                            onDrop={() => { if (draggedImageId) reorderImages(draggedImageId, image.id); setDraggedImageId(null); }}
                                            className={`grid gap-3 rounded-xl border bg-white p-2 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center dark:bg-white/5 ${draggedImageId === image.id ? 'border-primary bg-primary/5' : 'border-gray-200 dark:border-white/10'}`}
                                        >
                                            <div className="relative h-16 w-full overflow-hidden rounded-lg bg-slate-900 sm:w-16">
                                                <GalleryImage image={image} alt="" decorative loading="lazy" className="h-full w-full object-cover" />
                                                <span className="absolute right-1 top-1 cursor-grab rounded bg-black/60 p-1 text-white" title="גרירה לשינוי הסדר"><GripVertical size={16} aria-hidden="true" /></span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-black text-gray-900 dark:text-white">תמונה {index + 1}{image.media.fileName ? ` · ${image.media.fileName}` : ''}</p>
                                                <p className={`mt-1 truncate text-xs ${image.alt ? 'text-gray-500 dark:text-gray-400' : 'font-bold text-red-600 dark:text-red-300'}`}>{image.alt || 'חסר טקסט חלופי'}</p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-1 sm:justify-end">
                                                <button type="button" onClick={() => updateDraft((current) => ({ ...current, images: moveItem(current.images, index, -1) }))} disabled={index === 0} className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-35 dark:hover:bg-white/10" aria-label="העבר תמונה למעלה"><ArrowUp size={16} /></button>
                                                <button type="button" onClick={() => updateDraft((current) => ({ ...current, images: moveItem(current.images, index, 1) }))} disabled={index === draft.images.length - 1} className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-35 dark:hover:bg-white/10" aria-label="העבר תמונה למטה"><ArrowDown size={16} /></button>
                                                <button type="button" onClick={() => triggerUpload(image.id)} className="rounded p-1.5 text-primary hover:bg-primary/10" aria-label="החלף תמונה"><Upload size={16} /></button>
                                                <button type="button" onClick={() => removeImage(image.id)} className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10" aria-label="הסר תמונה"><Trash2 size={16} /></button>
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedImageId((current) => current === image.id ? null : image.id)}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-bold dark:border-white/10"
                                                    aria-expanded={expandedImageId === image.id}
                                                    aria-controls={`gallery-image-fields-${image.id}`}
                                                >
                                                    עריכה
                                                    {expandedImageId === image.id ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
                                                </button>
                                            </div>
                                            {expandedImageId === image.id && (
                                                <div id={`gallery-image-fields-${image.id}`} className="col-span-full grid gap-3 border-t border-gray-200 pt-3 dark:border-white/10">
                                                <label className="grid gap-1 text-xs font-bold">טקסט חלופי
                                                    <input value={image.alt} onChange={(event) => updateImage(image.id, { alt: event.target.value })} maxLength={500} required className="rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm dark:border-white/15 dark:bg-slate-900" />
                                                    {errorsByField.has(`images.${image.id}.alt`) && <span className="text-red-600">{errorsByField.get(`images.${image.id}.alt`)}</span>}
                                                </label>
                                                <label className="grid gap-1 text-xs font-bold">כיתוב (אופציונלי)<input value={image.caption} onChange={(event) => updateImage(image.id, { caption: event.target.value })} maxLength={1000} className="rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm dark:border-white/15 dark:bg-slate-900" /></label>
                                                <label className="grid gap-1 text-xs font-bold"><span className="inline-flex items-center gap-1"><LinkIcon size={13} aria-hidden="true" />הפניה לקובץ מדיה קיים</span><input value={image.mediaRef} onChange={(event) => updateImage(image.id, { mediaRef: event.target.value })} maxLength={4096} className="rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-sm ltr:text-left dark:border-white/15 dark:bg-slate-900" />{errorsByField.has(`images.${image.id}.mediaRef`) && <span className="text-red-600">{errorsByField.get(`images.${image.id}.mediaRef`)}</span>}</label>
                                                </div>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    const imageId = createImageGalleryImageId();
                                    setExpandedImageId(imageId);
                                    updateDraft((current) => ({ ...current, images: [...current.images, { id: imageId, mediaRef: '', alt: '', caption: '', width: 1600, height: 900, media: { fileName: '', mimeType: '', sizeBytes: 0 } }] }));
                                }}
                                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/10"
                            >
                                <Plus size={16} aria-hidden="true" />הוספת הפניה לתמונה קיימת
                            </button>
                        </section>
                    </div>

                    <aside className="space-y-6">
                        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
                            <h2 className="text-lg font-black">סגנון תצוגה</h2>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">הבחירה מתעדכנת בתצוגה המקדימה.</p>
                            <div className="mt-4"><GalleryStyleSelector value={draft.style} onChange={(style) => updateDraft((current) => ({ ...current, style }))} /></div>
                            {draft.style === 'magal-strips' && (
                                <MovingStripsSettingsEditor
                                    settings={draft.display.magalStrips}
                                    onChange={(magalStrips) => updateDraft((current) => ({
                                        ...current,
                                        display: {
                                            ...current.display,
                                            magalStrips,
                                        },
                                    }))}
                                />
                            )}
                        </section>
                        {validationIssues.length > 0 && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"><h2 className="flex items-center gap-2 font-black"><AlertTriangle size={18} aria-hidden="true" />נדרשת השלמה לפני פרסום</h2><ul className="mt-2 list-disc space-y-1 pr-5 text-sm">{validationIssues.slice(0, 5).map((issue) => <li key={issue.field}>{issue.message}</li>)}</ul></section>}
                    </aside>

                    <section className="overflow-hidden rounded-3xl bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_18px_50px_-32px_rgba(15,23,42,0.45)] dark:bg-white/5 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.10)] xl:col-span-2">
                        <div className="border-b border-gray-200 px-6 py-5 dark:border-white/10">
                            <h2 className="text-balance text-xl font-black">תצוגה מקדימה חיה</h2>
                            <p className="mt-1 text-pretty text-sm text-gray-500 dark:text-gray-400">תצוגה רחבה של הגלריה כפי שתופיע בדף הבית.</p>
                        </div>
                        <div className="min-h-[520px] w-full overflow-hidden bg-theme-bg-base">
                            <ImageGalleryRenderer gallery={{ ...draft, active: true, images: draft.images.filter((image) => image.mediaRef && isSafeGalleryMediaReference(image.mediaRef) && image.alt) }} direction="rtl" preview />
                        </div>
                    </section>

                    <div className="flex flex-wrap items-center justify-between gap-3 xl:col-span-2">
                        {renderAutoSaveStatus()}
                        <button type="button" onClick={closeEditor} disabled={uploading || autoSaveState === 'saving'} className="rounded-xl bg-primary px-5 py-3 font-black text-white disabled:opacity-60">סיום וחזרה</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function AdminImageGalleries() {
    const { galleries, loading, error, saveGalleries, saveGallery, deleteGallery } = useImageGalleries();
    const [editingGallery, setEditingGallery] = useState(null);

    const reorderGalleries = async (sourceId, targetId) => {
        try {
            await saveGalleries((current) => reorderImageGalleryItems(current, sourceId, targetId));
        } catch (saveError) {
            toast.error(saveError?.message || 'עדכון סדר הגלריות נכשל.');
        }
    };

    const toggleGallery = async (gallery, active) => {
        try {
            await saveGallery({ ...gallery, active });
        } catch (saveError) {
            toast.error(saveError?.message || 'עדכון הגלריה נכשל.');
        }
    };

    const removeGallery = async (gallery) => {
        const confirmed = await confirmToast({
            title: 'מחיקת גלריית תמונות',
            message: `למחוק את "${gallery.title || 'הגלריה'}"? ההפניות לתמונות יוסרו מהאתר, אך קבצי המדיה המקוריים לא יימחקו מאחסון האתר.`,
            confirmText: 'מחק גלריה',
            cancelText: 'ביטול',
            type: 'warning',
        });
        if (!confirmed) return;
        try {
            await deleteGallery(gallery.id);
            toast.success('הגלריה נמחקה.');
        } catch (deleteError) {
            toast.error(deleteError?.message || 'מחיקת הגלריה נכשלה.');
        }
    };

    if (editingGallery) {
        return <GalleryEditor initialGallery={editingGallery} onClose={() => setEditingGallery(null)} />;
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4 text-gray-900 dark:bg-[#1e212b] dark:text-white sm:p-8" dir="rtl">
            <div className="mx-auto max-w-6xl">
                <div className="mb-7 flex flex-col gap-4 border-b border-gray-200 pb-6 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3"><span className="rounded-xl bg-primary/10 p-3 text-primary"><ImageIcon size={24} aria-hidden="true" /></span><div><h1 className="text-2xl font-black sm:text-3xl">גלריות תמונות</h1><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ניהול גלריות פעילות, תמונות, סדר תצוגה וסגנון בדף הבית.</p></div></div>
                    <button type="button" onClick={() => setEditingGallery(createEmptyImageGallery(galleries.length))} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-black text-white"><Plus size={18} aria-hidden="true" />גלריה חדשה</button>
                </div>
                {error && <div className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">{error}</div>}
                {loading ? <div className="rounded-2xl bg-white p-10 text-center text-gray-500 shadow-sm dark:bg-white/5">טוען גלריות…</div> : galleries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center shadow-sm dark:border-white/20 dark:bg-white/5"><ImageIcon className="mx-auto mb-4 text-primary" size={40} aria-hidden="true" /><h2 className="text-xl font-black">אין עדיין גלריות תמונות</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-gray-500 dark:text-gray-400">צרו גלריה, העלו תמונות דרך מנגנון המדיה הקיים ובחרו את סגנון ההצגה. כל גלריה פעילה תתווסף לתחתית דף הבית.</p><button type="button" onClick={() => setEditingGallery(createEmptyImageGallery(0))} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-white"><Plus size={18} aria-hidden="true" />יצירת גלריה ראשונה</button></div>
                ) : <div className="space-y-4">{galleries.map((gallery, index) => <GalleryListItem key={gallery.id} gallery={gallery} onEdit={() => setEditingGallery(gallery)} onDelete={() => removeGallery(gallery)} onToggle={(active) => toggleGallery(gallery, active)} onMove={(delta) => reorderGalleries(gallery.id, galleries[index + delta]?.id)} moveDisabled={{ previous: index === 0, next: index === galleries.length - 1 }} />)}</div>}
            </div>
        </div>
    );
}
