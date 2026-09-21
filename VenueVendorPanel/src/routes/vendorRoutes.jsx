import { Route } from "react-router-dom";
import { VendorLayout } from "../layout/VendorLayout.jsx";
import { DashboardPage } from "../pages/DashboardPage.jsx";
import { PlaceholderPage } from "../pages/PlaceholderPage.jsx";
import { ProfilePage } from "../pages/ProfilePage.jsx";

export const vendorRouteTree = (
  <Route path="/vendor" element={<VendorLayout />}>
    <Route path="dashboard" element={<DashboardPage />} />
    <Route
      path="venues"
      element={
        <PlaceholderPage title="My Services" description="Add and manage banquet halls, lawns, and event spaces." />
      }
    />
    <Route
      path="bookings"
      element={<PlaceholderPage title="Bookings" description="View and manage service booking requests and schedules." />}
    />
    <Route
      path="payments"
      element={<PlaceholderPage title="Payments" description="Track payouts and transaction history for your services." />}
    />
    <Route path="profile" element={<ProfilePage />} />
    <Route index element={<DashboardPage />} />
  </Route>
);
