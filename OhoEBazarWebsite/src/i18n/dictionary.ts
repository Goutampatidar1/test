export type Lang = "hi" | "en";

/** A headline segment; `accent` renders in the brand colour. Spaces are part of the text. */
export type Segment = { t: string; accent?: boolean };
export type Lines = Segment[][];

type ValueItem = { title: string; body: string };
type CaptionKey = "blockPrint" | "silk" | "lehenga" | "brass" | "flower";

export type Dictionary = {
  meta: { title: string };
  a11y: { skip: string; openMenu: string; closeMenu: string; language: string };
  nav: { categories: string; products: string; sellers: string; services: string; story: string; cta: string };
  hero: {
    eyebrow: string;
    lines: Lines;
    sub: string;
    primary: string;
    secondary: string;
    scroll: string;
    caption: string;
  };
  categories: { eyebrow: string; lines: Lines; body: string; count: (n: number) => string; swipe: string };
  products: {
    eyebrow: string;
    lines: Lines;
    body: string;
    soldBy: string;
    representative: string;
    mrp: string;
    more: string;
  };
  people: {
    eyebrow: string;
    lines: Lines;
    body: string;
    types: [string, string, string];
    featured: string;
    productCount: (n: number) => string;
    join: string;
    captions: Record<CaptionKey, string>;
  };
  services: {
    eyebrow: string;
    lines: Lines;
    body: string;
    enquiry: string;
    listings: (n: number) => string;
    from: string;
    unit: Record<"day" | "hour" | "full", string>;
    noListings: string;
    closing: Lines;
    closingBody: string;
  };
  promo: { eyebrow: string; lines: Lines; body: string; deals: (n: number) => string; caption: string };
  story: { eyebrow: string; line1: Lines; line2: Lines; body: string };
  value: { eyebrow: string; lines: Lines; items: ValueItem[] };
  bridge: { quote: string };
  cta: { lines: Lines; body: string; primary: string; secondary: string };
  footer: {
    tagline: string;
    shop: string;
    services: string;
    sellers: string;
    sellerLogin: string;
    sellerRegister: string;
    contact: string;
    credits: string;
    creditsNote: string;
    rights: string;
    top: string;
    dev: string;
  };
  categoryNames: Record<string, string>;
  categoryTaglines: Record<string, string>;
  serviceTaglines: Record<string, string>;
};

const hi: Dictionary = {
  meta: { title: "ओहो ई-बाज़ार — आपकी दुनिया, आपकी पसंद, आपका बाज़ार" },
  a11y: {
    skip: "मुख्य सामग्री पर जाएँ",
    openMenu: "मेनू खोलें",
    closeMenu: "मेनू बंद करें",
    language: "भाषा चुनें",
  },
  nav: {
    categories: "श्रेणियाँ",
    products: "उत्पाद",
    sellers: "विक्रेता",
    services: "इवेंट सेवाएँ",
    story: "हमारी कहानी",
    cta: "ओहो ई-बाज़ार देखें",
  },
  hero: {
    eyebrow: "स्थानीय दुकानें · ऑनलाइन बाज़ार · इवेंट सेवाएँ",
    lines: [[{ t: "आपकी दुनिया।" }], [{ t: "आपकी " }, { t: "पसंद।", accent: true }], [{ t: "आपका बाज़ार।" }]],
    sub: "हर दिन की ज़रूरतों से लेकर खास मौकों तक — अपनी अगली पसंद खोजें।",
    primary: "ओहो ई-बाज़ार देखें",
    secondary: "हमारी दुनिया जानें",
    scroll: "स्क्रॉल करें",
    caption: "प्रतिनिधि उत्पाद चित्र",
  },
  categories: {
    eyebrow: "श्रेणियाँ",
    lines: [[{ t: "हर ज़रूरत की " }], [{ t: "एक दुनिया", accent: true }]],
    body: "फ़ैशन से रसोई तक — हर श्रेणी में आस-पास की दुकानों के उत्पाद।",
    count: (n) => `${n.toLocaleString("hi-IN-u-nu-deva")} श्रेणियाँ`,
    swipe: "स्वाइप करें",
  },
  products: {
    eyebrow: "उत्पाद",
    lines: [[{ t: "चीज़ें, जो " }], [{ t: "नज़र रोक लें", accent: true }]],
    body: "मंच पर मौजूद उत्पाद — नाम, कीमत और विक्रेता सीधे ओहो ई-बाज़ार से।",
    soldBy: "विक्रेता",
    representative: "प्रतिनिधि चित्र",
    mrp: "एमआरपी",
    more: "और उत्पाद",
  },
  people: {
    eyebrow: "विक्रेता",
    lines: [[{ t: "हर कारोबार की " }], [{ t: "अपनी कहानी", accent: true }]],
    body: "बुनकर, कारीगर, किराना दुकानें और सेवा देने वाले — ओहो ई-बाज़ार उनके काम को सीधे ग्राहकों तक पहुँचाने का मंच है।",
    types: ["दुकानदार", "कारीगर", "सेवा प्रदाता"],
    featured: "मंच पर विक्रेता",
    productCount: (n) => `${n.toLocaleString("hi-IN-u-nu-deva")} उत्पाद`,
    join: "विक्रेता के रूप में जुड़ें",
    captions: {
      blockPrint: "बाग़ ब्लॉक प्रिंट के कारीगर, मध्य प्रदेश",
      silk: "रेशमी साड़ी की बुनाई, कांचीपुरम",
      lehenga: "लहंगा दिखाते दुकानदार",
      brass: "पीतल के बर्तनों की दुकान",
      flower: "फूल विक्रेता, वाराणसी",
    },
  },
  services: {
    eyebrow: "इवेंट सेवाएँ",
    lines: [[{ t: "हर उत्सव, " }], [{ t: "पूरी तैयारी", accent: true }, { t: " के साथ" }]],
    body: "कैटरिंग, डीजे, टेंट, रोशनी और बग्घी — शादी और ख़ास मौकों की सेवाएँ, स्थानीय सेवा प्रदाताओं से।",
    enquiry: "सेवा प्रदाता को पूछताछ भेजकर बुकिंग करें",
    listings: (n) => `${n.toLocaleString("hi-IN-u-nu-deva")} ${n === 1 ? "सेवा" : "सेवाएँ"} उपलब्ध`,
    from: "शुरुआत",
    unit: { day: "/दिन", hour: "/घंटा", full: "पूरा पैकेज" },
    noListings: "जल्द ही नई सेवाएँ",
    closing: [[{ t: "शादी, सगाई, " }], [{ t: "हर जश्न", accent: true }, { t: " के लिए।" }]],
    closingBody: "एक ही मंच पर स्थानीय सेवा प्रदाता — मेन्यू से मंडप तक।",
  },
  promo: {
    eyebrow: "ओहो ई-बाज़ार",
    lines: [[{ t: "रोज़ की ज़रूरतें।" }], [{ t: "ख़ास मौकों", accent: true }, { t: " की तैयारी।" }]],
    body: "दुकानें और सेवाएँ एक ही मंच पर — जो चाहिए, जब चाहिए।",
    deals: (n) => `${n.toLocaleString("hi-IN-u-nu-deva")} लाइव हॉट डील्स`,
    caption: "प्रतिनिधि चित्र",
  },
  story: {
    eyebrow: "हमारी कहानी",
    line1: [[{ t: "एक बाज़ार।" }]],
    line2: [[{ t: "अनगिनत", accent: true }, { t: " संभावनाएँ।" }]],
    body: "ओहो ई-बाज़ार ग्राहकों को स्थानीय दुकानों और सेवा प्रदाताओं से जोड़ता है — रोज़ की खरीदारी से लेकर ज़िंदगी के सबसे ख़ास दिनों तक।",
  },
  value: {
    eyebrow: "मंच पर",
    lines: [[{ t: "यहाँ आप " }, { t: "क्या कर सकते हैं", accent: true }]],
    items: [
      { title: "उत्पाद खोजें", body: "श्रेणियों में आस-पास की दुकानों के उत्पाद देखें।" },
      { title: "स्थानीय विक्रेताओं से जुड़ें", body: "हर दुकान की प्रोफ़ाइल, उत्पाद और जानकारी एक जगह।" },
      { title: "इवेंट सेवाएँ खोजें", body: "कैटरिंग, डीजे, टेंट और सजावट देखें और पूछताछ भेजें।" },
      { title: "रील्स देखें", body: "विक्रेताओं के वीडियो से उत्पादों और सेवाओं को करीब से जानें।" },
      { title: "विक्रेता बनें", body: "अपनी दुकान या सेवा को ओहो ई-बाज़ार पर लाएँ।" },
    ],
  },
  bridge: { quote: "हर चीज़ के पीछे एक हाथ है।" },
  cta: {
    lines: [[{ t: "आपकी अगली पसंद" }], [{ t: "यहीं से ", accent: true }, { t: "शुरू होती है।" }]],
    body: "श्रेणियाँ देखें, स्थानीय विक्रेताओं को जानें, या अपनी दुकान को मंच पर लाएँ।",
    primary: "श्रेणियाँ देखें",
    secondary: "विक्रेता बनें",
  },
  footer: {
    tagline: "आपकी दुनिया। आपकी पसंद। आपका बाज़ार।",
    shop: "खरीदारी",
    services: "इवेंट सेवाएँ",
    sellers: "विक्रेताओं के लिए",
    sellerLogin: "विक्रेता लॉगिन",
    sellerRegister: "विक्रेता पंजीकरण",
    contact: "संपर्क",
    credits: "फ़ोटो श्रेय",
    creditsNote: "हीरो, ब्यूटी श्रेणी, प्रचार और अंतिम दृश्य के उत्पाद चित्र स्टूडियो-शैली के प्रतिनिधि चित्र हैं।",
    rights: "सर्वाधिकार सुरक्षित।",
    top: "ऊपर जाएँ",
    dev: "डेवलपमेंट प्रीव्यू डेटा — API उपलब्ध नहीं है",
  },
  categoryNames: {
    Fashion: "फ़ैशन",
    Electronics: "इलेक्ट्रॉनिक्स",
    "Beauty & Personal Care": "ब्यूटी और पर्सनल केयर",
    Groceries: "किराना",
    "Home & Kitchen": "घर और रसोई",
    "Sports & Outdoors": "खेल और आउटडोर",
    Gifts: "उपहार",
    Catering: "कैटरिंग",
    DJ: "डीजे",
    Tent: "टेंट",
    "Light Decoration": "लाइट डेकोरेशन",
    Baggi: "बग्घी",
    "Bhangra Team": "भांगड़ा टीम",
    Other: "अन्य सेवाएँ",
  },
  categoryTaglines: {
    fashion: "हथकरघा से रोज़ के पहनावे तक",
    electronics: "रोज़ के साथी गैजेट",
    beauty: "देखभाल की हर चीज़",
    groceries: "ताज़ा और रोज़ का सामान",
    home: "घर को सजाने और संवारने के लिए",
    sports: "खेल और सैर का सामान",
    default: "स्थानीय दुकानों से चुनी चीज़ें",
  },
  serviceTaglines: {
    catering: "शादी के बुफ़े से ऑफ़िस के लंच तक",
    dj: "संगीत, लाइट्स और साउंड",
    tent: "मंडप और टेंट की पूरी व्यवस्था",
    light: "रोशनी से सजी हर शाम",
    baggi: "बारात के लिए शाही बग्घी",
    bhangra: "ढोल और भांगड़ा की रौनक",
    default: "और भी कई सेवाएँ",
  },
};

const en: Dictionary = {
  meta: { title: "OHO E-Bazar — Your World. Your Choices. Your Marketplace." },
  a11y: {
    skip: "Skip to main content",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    language: "Choose language",
  },
  nav: {
    categories: "Categories",
    products: "Products",
    sellers: "Sellers",
    services: "Event services",
    story: "Our story",
    cta: "Explore OHO E-Bazar",
  },
  hero: {
    eyebrow: "Local shops · Online marketplace · Event services",
    lines: [[{ t: "Your World." }], [{ t: "Your " }, { t: "Choices.", accent: true }], [{ t: "Your Marketplace." }]],
    sub: "From everyday essentials to life's biggest moments — find your next discovery.",
    primary: "Explore OHO E-Bazar",
    secondary: "Discover Our Story",
    scroll: "Scroll",
    caption: "Representative product images",
  },
  categories: {
    eyebrow: "Categories",
    lines: [[{ t: "A World for " }], [{ t: "Every Need", accent: true }]],
    body: "From fashion to the kitchen — every category brings together products from neighbourhood shops.",
    count: (n) => `${n} ${n === 1 ? "category" : "categories"}`,
    swipe: "Swipe",
  },
  products: {
    eyebrow: "Products",
    lines: [[{ t: "Objects " }], [{ t: "in Motion", accent: true }]],
    body: "Products live on the platform — names, prices and sellers straight from OHO E-Bazar.",
    soldBy: "Sold by",
    representative: "Representative image",
    mrp: "MRP",
    more: "More products",
  },
  people: {
    eyebrow: "Sellers",
    lines: [[{ t: "Every Business " }], [{ t: "Has a Story", accent: true }]],
    body: "Weavers, artisans, neighbourhood stores and service providers — OHO E-Bazar is where their work reaches customers directly.",
    types: ["Shopkeepers", "Artisans", "Service providers"],
    featured: "On the platform",
    productCount: (n) => `${n} ${n === 1 ? "product" : "products"}`,
    join: "Join as a seller",
    captions: {
      blockPrint: "Bagh block-print master craftsman, Madhya Pradesh",
      silk: "Silk sari weaving, Kanchipuram",
      lehenga: "A store owner presents a lehenga",
      brass: "A brassware shop",
      flower: "Flower seller, Varanasi",
    },
  },
  services: {
    eyebrow: "Event services",
    lines: [[{ t: "Every Celebration, " }], [{ t: "Fully Arranged", accent: true }]],
    body: "Catering, DJs, tents, lighting and baggi — wedding and special-occasion services from local providers.",
    enquiry: "Book by sending the provider an enquiry",
    listings: (n) => `${n} ${n === 1 ? "service" : "services"} listed`,
    from: "From",
    unit: { day: "/day", hour: "/hour", full: "full package" },
    noListings: "New services coming soon",
    closing: [[{ t: "Weddings, Engagements, " }], [{ t: "Every Celebration.", accent: true }]],
    closingBody: "Local service providers on one platform — from the menu to the mandap.",
  },
  promo: {
    eyebrow: "OHO E-Bazar",
    lines: [[{ t: "Everyday Needs." }], [{ t: "Special-Day", accent: true }, { t: " Plans." }]],
    body: "Shops and services on one platform — whatever you need, whenever you need it.",
    deals: (n) => `${n} live hot ${n === 1 ? "deal" : "deals"}`,
    caption: "Representative image",
  },
  story: {
    eyebrow: "Our story",
    line1: [[{ t: "One Marketplace." }]],
    line2: [[{ t: "Endless", accent: true }, { t: " Possibilities." }]],
    body: "OHO E-Bazar connects customers with local shops and service providers — from everyday shopping to life's most special days.",
  },
  value: {
    eyebrow: "On the platform",
    lines: [[{ t: "What You " }, { t: "Can Do Here", accent: true }]],
    items: [
      { title: "Discover products", body: "Browse products from nearby shops across categories." },
      { title: "Connect with local sellers", body: "Every shop's profile, products and details in one place." },
      { title: "Explore event services", body: "Find catering, DJs, tents and decor, and send an enquiry." },
      { title: "Watch reels", body: "Get closer to products and services through sellers' videos." },
      { title: "Become a seller", body: "Bring your shop or service to OHO E-Bazar." },
    ],
  },
  bridge: { quote: "Behind every product, a person." },
  cta: {
    lines: [[{ t: "Your Next Discovery" }], [{ t: "Starts ", accent: true }, { t: "Here." }]],
    body: "Browse categories, meet local sellers, or bring your own shop to the platform.",
    primary: "Browse categories",
    secondary: "Become a seller",
  },
  footer: {
    tagline: "Your World. Your Choices. Your Marketplace.",
    shop: "Shop",
    services: "Event services",
    sellers: "For sellers",
    sellerLogin: "Seller login",
    sellerRegister: "Seller registration",
    contact: "Contact",
    credits: "Photo credits",
    creditsNote: "Product visuals in the hero, the beauty category, the promotion and the closing scene are studio-style representative images.",
    rights: "All rights reserved.",
    top: "Back to top",
    dev: "Development preview data — API unavailable",
  },
  categoryNames: {},
  categoryTaglines: {
    fashion: "From handloom to everyday wear",
    electronics: "Everyday gadgets",
    beauty: "Everything for self-care",
    groceries: "Fresh, everyday essentials",
    home: "To furnish and brighten your home",
    sports: "Gear for play and the outdoors",
    default: "Picks from local shops",
  },
  serviceTaglines: {
    catering: "From wedding buffets to office lunches",
    dj: "Music, lights and sound",
    tent: "Complete mandap and tent setups",
    light: "Every evening, beautifully lit",
    baggi: "A royal baggi for the baraat",
    bhangra: "The energy of dhol and bhangra",
    default: "And many more services",
  },
};

export const dictionary: Record<Lang, Dictionary> = { hi, en };

/** Zero-padded index in the active numeral system. */
export function formatIndex(n: number, lang: Lang) {
  const s = String(n).padStart(2, "0");
  return lang === "hi" ? s.replace(/\d/g, (d) => "०१२३४५६७८९"[Number(d)]!) : s;
}

export function localeOf(lang: Lang) {
  return lang === "hi" ? "hi-IN" : "en-IN";
}
