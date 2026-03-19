import OverlayImageElement from './OverlayImageElement';

export default function HeroSection({
  hero,
  logoSrc,
  renderHeroTitle,
  renderDescription,
  showOverlayImage,
  overlayImage,
  isPreview,
}) {
  return (
    <div className="relative flex-1 flex flex-col justify-center px-4 sm:px-8 lg:px-12 xl:px-24 pointer-events-auto z-20">
      {showOverlayImage && overlayImage.displayArea === 'hero-content' && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-y-0 right-0 w-full lg:w-[75%] xl:w-[65%]">
            <OverlayImageElement overlayImage={overlayImage} isPreview={isPreview} />
          </div>
        </div>
      )}

      <div className="w-full lg:w-[75%] xl:w-[65%] text-right self-end md:self-auto">
        <div className="text-primary font-bold lg:text-lg [@media(max-height:850px)]:text-sm mb-1 mr-1">{hero.subtitle}</div>
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 lg:gap-6 [@media(max-height:850px)]:gap-4 mb-4 xl:mb-6 [@media(max-height:850px)]:mb-2 mt-1">
          <img src={logoSrc} alt="Logo" className="h-[70px] md:h-[90px] lg:h-[110px] xl:h-[130px] 2xl:h-[160px] [@media(max-height:850px)]:h-[70px] xl:[@media(max-height:850px)]:h-[80px] w-auto drop-shadow-[0_0_15px_var(--color-primary-700)] transition-transform duration-500 hover:scale-105" />
          <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-[4.2rem] 2xl:text-7xl [@media(max-height:850px)]:text-4xl lg:[@media(max-height:850px)]:text-5xl font-black text-theme drop-shadow-lg tracking-tight leading-tight lg:leading-none break-words">
            {renderHeroTitle()}
          </h1>
        </div>
        <p className="text-theme-muted text-base md:text-lg lg:text-xl xl:text-2xl [@media(max-height:850px)]:text-xl [@media(max-height:850px)]:leading-tight leading-relaxed mb-4 lg:mb-8 [@media(max-height:850px)]:mb-3 drop-shadow-md max-w-2xl break-words">
          {renderDescription()}
        </p>
      </div>
    </div>
  );
}
