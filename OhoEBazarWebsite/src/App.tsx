import { useEffect } from "react";
import { HeroSection } from "@/components/hero/HeroSection";
import { AnimatedNavbar } from "@/components/layout/AnimatedNavbar";
import { Footer } from "@/components/layout/Footer";
import { PageTransition } from "@/components/layout/PageTransition";
import { SmoothScroll } from "@/components/layout/SmoothScroll";
import { BrandStory } from "@/components/sections/BrandStory";
import { CategoryWorld } from "@/components/sections/CategoryWorld";
import { EventsSection } from "@/components/sections/EventsSection";
import { FinalCta } from "@/components/sections/FinalCta";
import { PeopleSection } from "@/components/sections/PeopleSection";
import { ProductGallery } from "@/components/sections/ProductGallery";
import { PromoSection } from "@/components/sections/PromoSection";
import { ValueSection } from "@/components/sections/ValueSection";
import { useLandingData } from "@/hooks/useLandingData";
import { LanguageProvider, useI18n } from "@/i18n/LanguageProvider";
import { ScrollTrigger } from "@/lib/gsap";

function Landing() {
  const data = useLandingData();
  const { t, lang } = useI18n();
  const ready = data.status === "ready";

  // Devanagari and Latin set to different heights; re-measure pinned sections after a switch or data load.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
    });
    return () => window.cancelAnimationFrame(id);
  }, [lang, ready]);

  return (
    <>
      <a
        href="#main"
        className="sr-only z-[200] rounded-full bg-charcoal px-5 py-3 text-ivory focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t.a11y.skip}
      </a>
      <AnimatedNavbar />
      <main id="main">
        <HeroSection />
        {ready ? (
          <>
            <CategoryWorld categories={data.ecomCategories} />
            <ProductGallery products={data.products} fixtures={data.source === "fixtures"} />
            <PeopleSection vendors={data.vendors} />
            <EventsSection
              categories={data.venueCategories}
              venues={data.venues}
              enquiryMode={data.config?.features?.venueBookingMode === "enquiry"}
            />
            <PromoSection hotDeals={data.hotDeals} />
            <BrandStory />
            <ValueSection />
            <FinalCta />
          </>
        ) : (
          <div id="categories" data-nav="light" className="relative z-10 h-[100svh] bg-ivory" />
        )}
      </main>
      {ready && <Footer config={data.config} ecomCategories={data.ecomCategories} venueCategories={data.venueCategories} />}
      <div aria-hidden className="grain-overlay" />
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <SmoothScroll>
        <PageTransition>
          <Landing />
        </PageTransition>
      </SmoothScroll>
    </LanguageProvider>
  );
}
