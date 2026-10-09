export type ApiEnvelope<T> = {
  status: boolean;
  message: string;
  data: T[];
  enabled?: boolean;
  pagination?: { page: number; limit: number; total: number; pages?: number };
};

type Ref = { _id: string; name: string } | null;

export type PublicCategory = {
  _id: string;
  name: string;
  image?: string | null;
  mode?: "ecom" | "venue" | string;
};

export type PublicProduct = {
  _id: string;
  name: string;
  slug?: string;
  shortDescription?: string | null;
  thumbnail?: string | null;
  image?: string | null;
  price?: number | null;
  mrp?: number | null;
  hasDiscount?: boolean;
  discountPercent?: number;
  category?: Ref;
  subCategory?: Ref;
  vendor?: (Ref & { shopLogo?: string | null }) | null;
};

export type PublicVendor = {
  _id: string;
  name: string;
  businessName?: string | null;
  description?: string | null;
  location?: string | null;
  city?: string | null;
  shopLogo?: string | null;
  coverImage?: string | null;
  productCount?: number;
  category?: Ref;
};

export type PublicVenue = {
  _id: string;
  name: string;
  shortDescription?: string | null;
  thumbnail?: string | null;
  location?: string | null;
  category?: Ref;
  priceInfo?: { amount?: number; unit?: "day" | "hour" | "full" | string; hasDiscount?: boolean } | null;
};

/** Hot-deal cards are only rendered when the API returns them; shape is read defensively. */
export type PublicHotDeal = {
  _id?: string;
  name?: string;
  title?: string;
  image?: string | null;
  thumbnail?: string | null;
};

export type AppConfig = {
  app_name?: string;
  app_email?: string;
  app_mobile?: string;
  address?: string;
  app_details?: string;
  app_footer_text?: string;
  facebook?: string;
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  features?: { hotDealsEnabled?: boolean; videoEnabledUser?: boolean; venueBookingMode?: string };
};
