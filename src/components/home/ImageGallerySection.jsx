import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, ImageOff, X } from 'lucide-react';
import { resolveSiteImageUrl } from '../../utils/assetUrl';
import { isLocalGalleryMediaReference, resolveLocalGalleryMedia } from '../../services/galleryMediaStorage';

function modulo(value, length) {
    if (length <= 0) return 0;
    return ((value % length) + length) % length;
}

function readDirection(direction) {
    if (direction === 'ltr' || direction === 'rtl') return direction;
    if (typeof document !== 'undefined') {
        return document.documentElement.dir === 'ltr' ? 'ltr' : 'rtl';
    }
    return 'rtl';
}

function useReducedMotion() {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(query.matches);
        update();
        query.addEventListener?.('change', update);
        return () => query.removeEventListener?.('change', update);
    }, []);

    return reduced;
}

function useResolvedGalleryMedia(mediaRef) {
    const externalSource = isLocalGalleryMediaReference(mediaRef) ? '' : resolveSiteImageUrl(mediaRef);
    const [localMedia, setLocalMedia] = useState({ reference: '', source: '', missing: false });

    useEffect(() => {
        let objectUrl = '';
        let cancelled = false;
        if (!isLocalGalleryMediaReference(mediaRef)) {
            return undefined;
        }

        resolveLocalGalleryMedia(mediaRef)
            .then((record) => {
                if (cancelled) return;
                if (!record?.blob) {
                    setLocalMedia({ reference: mediaRef, source: '', missing: true });
                    return;
                }
                objectUrl = URL.createObjectURL(record.blob);
                setLocalMedia({ reference: mediaRef, source: objectUrl, missing: false });
            })
            .catch(() => {
                if (!cancelled) setLocalMedia({ reference: mediaRef, source: '', missing: true });
            });

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [mediaRef]);

    const isLocal = isLocalGalleryMediaReference(mediaRef);
    const localMatchesReference = localMedia.reference === mediaRef;
    const source = isLocal ? (localMatchesReference ? localMedia.source : '') : externalSource;
    const missing = isLocal && localMatchesReference && localMedia.missing;
    return { source, missing };
}

export function GalleryImage({
    image,
    alt,
    className = '',
    loading = 'lazy',
    onClick,
    sizes,
    decorative = false,
}) {
    const { source, missing } = useResolvedGalleryMedia(image?.mediaRef || '');
    const [failedReference, setFailedReference] = useState('');
    const width = Number(image?.width) || 1600;
    const height = Number(image?.height) || 900;

    const isBroken = missing || failedReference === image?.mediaRef;
    if (!source || isBroken) {
        return (
            <div
                className={`flex min-h-24 items-center justify-center bg-slate-800/60 text-center text-xs font-bold text-slate-200 ${className}`}
                style={{ aspectRatio: `${width} / ${height}` }}
                role="img"
                aria-label={isBroken ? 'התמונה אינה זמינה' : 'טוען תמונה'}
            >
                <span className="inline-flex items-center gap-2"><ImageOff size={16} aria-hidden="true" />{isBroken ? 'התמונה אינה זמינה' : 'טוען תמונה'}</span>
            </div>
        );
    }

    return (
        <img
            src={source}
            alt={decorative ? '' : alt}
            width={width}
            height={height}
            className={className}
            loading={loading}
            decoding="async"
            sizes={sizes}
            onClick={onClick}
            onError={() => setFailedReference(image?.mediaRef || '')}
        />
    );
}

function useGalleryControls(images, direction) {
    const [activeIndex, setActiveIndex] = useState(0);
    const pointerStart = useRef(null);
    const imageCount = images.length;
    const isRtl = direction === 'rtl';

    const move = useCallback((delta) => {
        setActiveIndex((index) => modulo(index + delta, imageCount));
    }, [imageCount]);

    const onKeyDown = useCallback((event) => {
        if (imageCount < 2) return;
        const previousKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
        const nextKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
        if (event.key === previousKey) {
            event.preventDefault();
            move(-1);
        }
        if (event.key === nextKey) {
            event.preventDefault();
            move(1);
        }
    }, [imageCount, isRtl, move]);

    const onPointerDown = useCallback((event) => {
        pointerStart.current = { x: event.clientX, y: event.clientY };
    }, []);

    const onPointerUp = useCallback((event) => {
        const start = pointerStart.current;
        pointerStart.current = null;
        if (!start || imageCount < 2) return;
        const deltaX = event.clientX - start.x;
        const deltaY = event.clientY - start.y;
        if (Math.abs(deltaX) < 36 || Math.abs(deltaX) < Math.abs(deltaY)) return;
        const visualNext = deltaX < 0;
        move((visualNext === isRtl) ? -1 : 1);
    }, [imageCount, isRtl, move]);

    return {
        activeIndex,
        setActiveIndex,
        move,
        onKeyDown,
        onPointerDown,
        onPointerUp,
        isRtl,
    };
}

function GalleryNavButton({ direction, rtl = true, onClick, label, disabled }) {
    const Icon = direction === 'previous'
        ? (rtl ? ChevronRight : ChevronLeft)
        : (rtl ? ChevronLeft : ChevronRight);
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-slate-950/75 text-white shadow-lg transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
            <Icon size={22} aria-hidden="true" />
        </button>
    );
}

function GalleryLightbox({ images, activeIndex, onClose, onChange, direction }) {
    const dialogRef = useRef(null);
    const image = images[activeIndex];
    const isRtl = direction === 'rtl';

    useEffect(() => {
        dialogRef.current?.focus();
        const onWindowKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
            const previousKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
            const nextKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
            if (images.length > 1 && event.key === previousKey) onChange(-1);
            if (images.length > 1 && event.key === nextKey) onChange(1);
        };
        window.addEventListener('keydown', onWindowKeyDown);
        return () => window.removeEventListener('keydown', onWindowKeyDown);
    }, [images.length, isRtl, onChange, onClose]);

    if (!image) return null;
    const previousLabel = isRtl ? 'לתמונה הקודמת' : 'Previous image';
    const nextLabel = isRtl ? 'לתמונה הבאה' : 'Next image';

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/95 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={image.alt || 'תמונה מוגדלת'} tabIndex={-1} className="relative flex max-h-full w-full max-w-6xl flex-col items-center outline-none">
                <button type="button" onClick={onClose} className="absolute left-1 top-1 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="סגור תצוגת תמונה">
                    <X size={24} aria-hidden="true" />
                </button>
                {images.length > 1 && (
                    <div className="absolute inset-x-2 top-1/2 z-10 flex -translate-y-1/2 justify-between" dir={direction}>
                        <GalleryNavButton direction="previous" rtl={isRtl} onClick={() => onChange(-1)} label={previousLabel} />
                        <GalleryNavButton direction="next" rtl={isRtl} onClick={() => onChange(1)} label={nextLabel} />
                    </div>
                )}
                <GalleryImage image={image} alt={image.alt} loading="eager" className="max-h-[78vh] max-w-full rounded-xl object-contain shadow-2xl" sizes="100vw" />
                {(image.caption || image.alt) && <p className="mt-3 max-w-3xl text-center text-sm text-white/90">{image.caption || image.alt}</p>}
            </div>
        </div>
    );
}

function GalleryFrame({ gallery, children, className = '' }) {
    return (
        <section className={`relative overflow-hidden border-y border-theme-subtle bg-theme-bg-base/85 px-4 py-10 backdrop-blur-sm sm:px-8 lg:px-12 ${className}`} aria-labelledby={`gallery-title-${gallery.id}`}>
            <div className="mx-auto max-w-7xl">
                <div className="mb-6 max-w-3xl">
                    <h2 id={`gallery-title-${gallery.id}`} className="text-2xl font-black text-theme sm:text-3xl">{gallery.title}</h2>
                    {gallery.description && <p className="mt-2 text-sm leading-6 text-theme-muted sm:text-base">{gallery.description}</p>}
                </div>
                {children}
            </div>
        </section>
    );
}

function Caption({ image }) {
    if (!image.caption) return null;
    return <p className="mt-3 text-center text-sm font-medium text-theme-muted">{image.caption}</p>;
}

function ClassicCarousel({ gallery, direction }) {
    const images = gallery.images;
    const controls = useGalleryControls(images, direction);
    const image = images[controls.activeIndex];
    const reducedMotion = useReducedMotion();
    const previousLabel = controls.isRtl ? 'לתמונה הקודמת' : 'Previous image';
    const nextLabel = controls.isRtl ? 'לתמונה הבאה' : 'Next image';

    return (
        <GalleryFrame gallery={gallery}>
            <div className="mx-auto max-w-5xl" dir={direction} role="region" aria-roledescription="carousel" aria-label={gallery.title} tabIndex={0} onKeyDown={controls.onKeyDown} onPointerDown={controls.onPointerDown} onPointerUp={controls.onPointerUp}>
                <div className="relative overflow-hidden rounded-3xl border border-theme-subtle bg-slate-950 shadow-2xl" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
                    <GalleryImage key={image.id} image={image} alt={image.alt} loading="eager" sizes="(max-width: 1024px) 100vw, 960px" className={`h-full w-full object-cover ${reducedMotion ? '' : 'transition-opacity duration-500'}`} />
                    {images.length > 1 && (
                        <div className="absolute inset-x-4 top-1/2 flex -translate-y-1/2 justify-between">
                            <GalleryNavButton direction="previous" rtl={controls.isRtl} onClick={() => controls.move(-1)} label={previousLabel} />
                            <GalleryNavButton direction="next" rtl={controls.isRtl} onClick={() => controls.move(1)} label={nextLabel} />
                        </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-5 pb-5 pt-12">
                        <p className="text-sm font-bold text-white">{image.alt}</p>
                        {image.caption && <p className="mt-1 text-sm text-white/80">{image.caption}</p>}
                    </div>
                </div>
                {images.length > 1 && (
                    <div className="mt-4 flex justify-center gap-2" aria-label="בחירת תמונה">
                        {images.map((item, index) => (
                            <button key={item.id} type="button" onClick={() => controls.setActiveIndex(index)} className={`h-2.5 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${index === controls.activeIndex ? 'w-7 bg-primary' : 'w-2.5 bg-theme-muted/50 hover:bg-theme-muted'}`} aria-label={`הצג תמונה ${index + 1}`} aria-current={index === controls.activeIndex ? 'true' : undefined} />
                        ))}
                    </div>
                )}
            </div>
        </GalleryFrame>
    );
}

function CenterCarousel({ gallery, direction }) {
    const images = gallery.images;
    const controls = useGalleryControls(images, direction);
    const reducedMotion = useReducedMotion();
    const active = images[controls.activeIndex];
    const leftIndex = modulo(controls.activeIndex - 1, images.length);
    const rightIndex = modulo(controls.activeIndex + 1, images.length);
    const sideItems = images.length > 1 ? [images[leftIndex], images[rightIndex]] : [];

    return (
        <GalleryFrame gallery={gallery} className="bg-theme-card/50">
            <div className="relative mx-auto max-w-6xl" dir={direction} role="region" aria-roledescription="carousel" aria-label={gallery.title} tabIndex={0} onKeyDown={controls.onKeyDown} onPointerDown={controls.onPointerDown} onPointerUp={controls.onPointerUp}>
                <div className="grid items-center gap-3 md:grid-cols-[minmax(0,0.65fr)_minmax(0,1fr)_minmax(0,0.65fr)]">
                    <button type="button" onClick={() => controls.setActiveIndex(leftIndex)} className={`order-2 hidden overflow-hidden rounded-2xl border border-theme-subtle bg-slate-950 md:block ${reducedMotion ? '' : 'transition-transform duration-500 hover:scale-[1.02]'}`} aria-label="הצג את התמונה הקודמת">
                        {sideItems[0] && <GalleryImage image={sideItems[0]} alt="" decorative loading="lazy" sizes="30vw" className="h-64 w-full object-cover opacity-65" />}
                    </button>
                    <div className={`order-1 overflow-hidden rounded-3xl border-2 border-primary/60 bg-slate-950 shadow-2xl md:order-2 ${reducedMotion ? '' : 'transition-transform duration-500'}`}>
                        <GalleryImage key={active.id} image={active} alt={active.alt} loading="eager" sizes="(max-width: 768px) 100vw, 52vw" className="aspect-[16/10] w-full object-cover" />
                    </div>
                    <button type="button" onClick={() => controls.setActiveIndex(rightIndex)} className={`order-3 hidden overflow-hidden rounded-2xl border border-theme-subtle bg-slate-950 md:block ${reducedMotion ? '' : 'transition-transform duration-500 hover:scale-[1.02]'}`} aria-label="הצג את התמונה הבאה">
                        {sideItems[1] && <GalleryImage image={sideItems[1]} alt="" decorative loading="lazy" sizes="30vw" className="h-64 w-full object-cover opacity-65" />}
                    </button>
                </div>
                {images.length > 1 && (
                    <div className="mt-5 flex items-center justify-center gap-5">
                        <GalleryNavButton direction="previous" rtl={controls.isRtl} onClick={() => controls.move(-1)} label="לתמונה הקודמת" />
                        <span className="text-sm font-bold text-theme-muted" aria-live="polite">{controls.activeIndex + 1} / {images.length}</span>
                        <GalleryNavButton direction="next" rtl={controls.isRtl} onClick={() => controls.move(1)} label="לתמונה הבאה" />
                    </div>
                )}
                <Caption image={active} />
            </div>
        </GalleryFrame>
    );
}

function CoverflowCarousel({ gallery, direction }) {
    const images = gallery.images;
    const controls = useGalleryControls(images, direction);
    const reducedMotion = useReducedMotion();
    return (
        <GalleryFrame gallery={gallery} className="bg-[radial-gradient(circle_at_center,rgba(8,145,178,0.18),transparent_58%)]">
            <div className="mx-auto max-w-5xl" dir={direction} role="region" aria-roledescription="carousel" aria-label={gallery.title} tabIndex={0} onKeyDown={controls.onKeyDown} onPointerDown={controls.onPointerDown} onPointerUp={controls.onPointerUp}>
                <div className="relative mx-auto h-[300px] max-w-4xl sm:h-[390px]">
                    {images.map((image, index) => {
                        const rawOffset = index - controls.activeIndex;
                        const offset = rawOffset > images.length / 2 ? rawOffset - images.length : (rawOffset < -images.length / 2 ? rawOffset + images.length : rawOffset);
                        const distance = Math.abs(offset);
                        const transform = `translateX(${offset * (direction === 'rtl' ? -20 : 20)}%) translateZ(${-distance * 100}px) rotateY(${offset * -18}deg) scale(${Math.max(0.72, 1 - distance * 0.12)})`;
                        const isActive = index === controls.activeIndex;
                        return (
                            <button key={image.id} type="button" onClick={() => controls.setActiveIndex(index)} className={`absolute left-1/2 top-1/2 h-[235px] w-[72%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border bg-slate-950 text-right shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-[330px] sm:w-[62%] ${isActive ? 'border-primary/80' : 'border-white/20'}`} style={{ transform, zIndex: 20 - distance, opacity: distance > 2 ? 0 : Math.max(0.35, 1 - distance * 0.24), transition: reducedMotion ? 'none' : 'transform 420ms ease, opacity 420ms ease' }} aria-label={`הצג תמונה ${index + 1}: ${image.alt}`} aria-current={isActive ? 'true' : undefined}>
                                <GalleryImage image={image} alt={isActive ? image.alt : ''} decorative={!isActive} loading={isActive ? 'eager' : 'lazy'} sizes="(max-width: 768px) 72vw, 640px" className="h-full w-full object-cover" />
                                {isActive && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-5 pb-4 pt-12 text-sm font-bold text-white">{image.caption || image.alt}</span>}
                            </button>
                        );
                    })}
                </div>
                {images.length > 1 && <div className="mt-5 flex justify-center gap-4"><GalleryNavButton direction="previous" rtl={controls.isRtl} onClick={() => controls.move(-1)} label="לתמונה הקודמת" /><GalleryNavButton direction="next" rtl={controls.isRtl} onClick={() => controls.move(1)} label="לתמונה הבאה" /></div>}
            </div>
        </GalleryFrame>
    );
}

function MasonryGallery({ gallery, direction }) {
    const [lightboxIndex, setLightboxIndex] = useState(null);
    const returnFocusRef = useRef(null);
    const openLightbox = (index, event) => {
        returnFocusRef.current = event.currentTarget;
        setLightboxIndex(index);
    };
    const closeLightbox = () => {
        setLightboxIndex(null);
        window.setTimeout(() => returnFocusRef.current?.focus(), 0);
    };
    const changeLightbox = (delta) => {
        setLightboxIndex((index) => modulo(index + delta, gallery.images.length));
    };

    return (
        <GalleryFrame gallery={gallery}>
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3" dir={direction}>
                {gallery.images.map((image, index) => (
                    <button key={image.id} type="button" className="group relative mb-4 block w-full break-inside-avoid overflow-hidden rounded-2xl border border-theme-subtle bg-slate-950 text-right shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={(event) => openLightbox(index, event)} aria-label={`הגדל תמונה: ${image.alt}`}>
                        <GalleryImage image={image} alt={image.alt} loading={index === 0 ? 'eager' : 'lazy'} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="h-auto w-full object-cover transition duration-300 group-hover:scale-[1.03] motion-reduce:transition-none" />
                        <span className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/75 via-transparent to-transparent p-4 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
                            <span className="text-sm font-bold text-white">{image.caption || image.alt}</span>
                            <span className="rounded-full bg-white/20 p-2 text-white"><Expand size={18} aria-hidden="true" /></span>
                        </span>
                    </button>
                ))}
            </div>
            {lightboxIndex !== null && <GalleryLightbox images={gallery.images} activeIndex={lightboxIndex} onClose={closeLightbox} onChange={changeLightbox} direction={direction} />}
        </GalleryFrame>
    );
}

export function ImageGalleryRenderer({ gallery, direction, preview = false }) {
    const normalizedDirection = readDirection(direction);
    if (!gallery?.images?.length) return null;
    const props = { gallery, direction: normalizedDirection, preview };
    if (gallery.style === 'center-carousel') return <CenterCarousel {...props} />;
    if (gallery.style === 'coverflow') return <CoverflowCarousel {...props} />;
    if (gallery.style === 'masonry') return <MasonryGallery {...props} />;
    return <ClassicCarousel {...props} />;
}

export default function ImageGallerySection({ galleries = [], direction }) {
    if (!Array.isArray(galleries) || galleries.length === 0) return null;
    const normalizedDirection = readDirection(direction);
    return (
        <div className="relative z-10 w-full" dir={normalizedDirection} data-testid="image-gallery-section">
            {galleries.map((gallery) => <ImageGalleryRenderer key={gallery.id} gallery={gallery} direction={normalizedDirection} />)}
        </div>
    );
}
