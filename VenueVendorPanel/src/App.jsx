import { Navigate, Route, Routes } from "react-router-dom";
import { AppConfigSync } from "./components/AppConfigSync.jsx";
import { AuthSessionWatcher } from "./components/AuthSessionWatcher.jsx";
import { RootRedirect } from "./components/RootRedirect.jsx";
import { VendorFallbackRedirect } from "./components/VendorFallbackRedirect.jsx";
import {
  VENDOR_FORGOT_PASSWORD_PATH,
  VENDOR_LOGIN_PATH,
  VENDOR_REGISTER_PATH,
  VENDOR_RESET_PASSWORD_PATH,
} from "./constants/authRoutes.js";
import { VendorLayout } from "./layout/VendorLayout.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage.jsx";
import { LoginPage } from "./pages/LoginPage.jsx";
import { NotFoundPage } from "./pages/NotFoundPage.jsx";
import { PlaceholderPage } from "./pages/PlaceholderPage.jsx";
import { BookingDetailPage } from "./pages/bookings/BookingDetailPage.jsx";
import { BookingsListPage } from "./pages/bookings/BookingsListPage.jsx";
import { AddVenuePage } from "./pages/venues/AddVenuePage.jsx";
import { EditVenuePage } from "./pages/venues/EditVenuePage.jsx";
import { ViewVenuePage } from "./pages/venues/ViewVenuePage.jsx";
import { VenuesListPage } from "./pages/venues/VenuesListPage.jsx";
import { VideoFeedsPage } from "./pages/videoFeeds/VideoFeedsPage.jsx";
import { ProfilePage } from "./pages/ProfilePage.jsx";
import { PromotionPlansPage } from "./pages/PromotionPlansPage.jsx";
import { StaticPageView } from "./pages/StaticPageView.jsx";
import { RegisterPage } from "./pages/RegisterPage.jsx";
import { ResetPasswordPage } from "./pages/ResetPasswordPage.jsx";
import { AddProductPage } from "./pages/ecom/AddProductPage.jsx";
import { EcomProductsPage } from "./pages/ecom/EcomProductsPage.jsx";
import { EcomOrdersPage } from "./pages/ecom/EcomOrdersPage.jsx";

export default function App() {
  return (
    <>
      <AppConfigSync />
      <AuthSessionWatcher />
      <Routes>
        <Route path="/" element={<RootRedirect />} />

        <Route path={VENDOR_LOGIN_PATH} element={<LoginPage />} />
        <Route path={VENDOR_REGISTER_PATH} element={<RegisterPage />} />
        <Route path={VENDOR_FORGOT_PASSWORD_PATH} element={<ForgotPasswordPage />} />
        <Route path={VENDOR_RESET_PASSWORD_PATH} element={<ResetPasswordPage />} />

        {/* Legacy paths (bookmarks / old links) */}
        <Route path="/login" element={<Navigate to={VENDOR_LOGIN_PATH} replace />} />
        <Route path="/register" element={<Navigate to={VENDOR_REGISTER_PATH} replace />} />
        <Route path="/forgot-password" element={<Navigate to={VENDOR_FORGOT_PASSWORD_PATH} replace />} />
        <Route path="/reset-password" element={<Navigate to={VENDOR_RESET_PASSWORD_PATH} replace />} />

        <Route path="/vendor" element={<VendorLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="products">
            <Route index element={<EcomProductsPage />} />
            <Route path="new" element={<AddProductPage />} />
          </Route>
          <Route path="orders" element={<EcomOrdersPage />} />
          <Route path="venues">
            <Route index element={<VenuesListPage />} />
            <Route path="new" element={<AddVenuePage />} />
            <Route path=":venueId/edit" element={<EditVenuePage />} />
            <Route path=":venueId" element={<ViewVenuePage />} />
          </Route>
          <Route path="reels" element={<VideoFeedsPage />} />
          <Route path="bookings" element={<BookingsListPage />} />
          <Route path="bookings/:id" element={<BookingDetailPage />} />
          <Route
            path="payments"
            element={
              <PlaceholderPage title="Payments" description="Track payouts and transaction history for your services." />
            }
          />
          <Route path="promotions" element={<PromotionPlansPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="pages/:slug" element={<StaticPageView />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="*" element={<VendorFallbackRedirect />} />
      </Routes>
    </>
  );
}
