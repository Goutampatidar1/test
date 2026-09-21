import { Navigate, Outlet, Route } from "react-router-dom";
import { AdminLayout } from "../layout/AdminLayout.jsx";
import { AdminProfile } from "../pages/AdminProfile.jsx";
import { DashboardPage } from "../pages/DashboardPage.jsx";
import { NotFoundPage } from "../pages/NotFoundPage.jsx";
import { SectionPage } from "../pages/SectionPage.jsx";
import { BusinessSetting } from "../pages/setting/BusinessSetting.jsx";
import { AttributeTitlePage } from "../pages/attributes/AttributeTitle.jsx";
import { AttributeValuePage } from "../pages/attributes/AttributeValue.jsx";
import { BannerPage } from "../pages/banners/BannerPage.jsx";
import { VendorPlanPage } from "../pages/plans/VendorPlanPage.jsx";
import { PromotionPlanPage } from "../pages/promotionAdvertising/PromotionPlanPage.jsx";
import { PromotionRequestsPage } from "../pages/promotionAdvertising/PromotionRequestsPage.jsx";
import { PromotionDashboardPage } from "../pages/promotionAdvertising/PromotionDashboardPage.jsx";
import { CategoryPage } from "../pages/category/CategoryPage.jsx";
import { AmenitiesAdd } from "../pages/amenities/AmenitiesAdd.jsx";
import { AmenitiesEdit } from "../pages/amenities/AmenitiesEdit.jsx";
import { AmenitiesList } from "../pages/amenities/AmenitiesList.jsx";
import { AmenitiesView } from "../pages/amenities/AmenitiesView.jsx";
import { DeliveryAdd } from "../pages/delivery/DeliveryAdd.jsx";
import { DeliveryEdit } from "../pages/delivery/DeliveryEdit.jsx";
import { DeliveryList } from "../pages/delivery/DeliveryList.jsx";
import { DeliveryView } from "../pages/delivery/DeliveryView.jsx";
import { DeliveryCodList } from "../pages/deliveryCod/DeliveryCodList.jsx";
import { DeliveryCodSettle } from "../pages/deliveryCod/DeliveryCodSettle.jsx";
import { FaqPage } from "../pages/faq/Faq.jsx";
import { StaticPageList } from "../pages/static-pages/StaticPageList.jsx";
import { StaticPageAdd } from "../pages/static-pages/StaticPageAdd.jsx";
import { StaticPageUpdate } from "../pages/static-pages/StaticPageUpdate.jsx";
import { SubCategoryPage } from "../pages/subcategory/SubCategoryPage.jsx";
import { LocationsPage } from "../pages/locations/LocationsPage.jsx";
import { PromotionAdd } from "../pages/promotion/PromotionAdd.jsx";
import { PromotionEdit } from "../pages/promotion/PromotionEdit.jsx";
import { PromotionList } from "../pages/promotion/PromotionList.jsx";
import { PromotionView } from "../pages/promotion/PromotionView.jsx";
import { NotificationPage } from "../pages/notification/Notification.jsx";
import { ProductAdd } from "../pages/product/ProductAdd.jsx";
import { ProductEdit } from "../pages/product/ProductEdit.jsx";
import { ProductList } from "../pages/product/ProductList.jsx";
import { ProductView } from "../pages/product/ProductView.jsx";
import { FasttagRechargeList } from "../pages/recharge/FasttagRechargeList.jsx";
import { GasRechargeList } from "../pages/recharge/GasRechargeList.jsx";
import { MobileRechargeList } from "../pages/recharge/MobileRechargeList.jsx";
import { VenueEdit } from "../pages/venues/VenueEdit.jsx";
import { VenueList } from "../pages/venues/VenueList.jsx";
import { VenueView } from "../pages/venues/VenueView.jsx";
import { UserAdd } from "../pages/user/UserAdd.jsx";
import { UserEdit } from "../pages/user/UserEdit.jsx";
import { UserList } from "../pages/user/UserList.jsx";
import { UserView } from "../pages/user/UserView.jsx";
import { VendorAdd } from "../pages/vendor/VendorAdd.jsx";
import { VendorEdit } from "../pages/vendor/VendorEdit.jsx";
import { VendorList } from "../pages/vendor/VendorList.jsx";
import { VendorView } from "../pages/vendor/VendorView.jsx";
import { VenueVendorAdd } from "../pages/venueVendor/VenueVendorAdd.jsx";
import { VenueVendorEdit } from "../pages/venueVendor/VenueVendorEdit.jsx";
import { VenueVendorList } from "../pages/venueVendor/VenueVendorList.jsx";
import { VenueVendorView } from "../pages/venueVendor/VenueVendorView.jsx";
import { OrderAndBookingDetailPage } from "../pages/orderAndBooking/OrderAndBookingDetailPage.jsx";
import { OrderAndBookingPage } from "../pages/orderAndBooking/OrderAndBookingPage.jsx";
import { OrderAndBookingTransactionPage } from "../pages/orderAndBookingTransaction/OrderAndBookingTransactionPage.jsx";
import { PaymentTransactionDetailPage } from "../pages/orderAndBookingTransaction/PaymentTransactionDetailPage.jsx";
import { VideoFeedPage } from "../pages/videoFeeds/VideoFeedPage.jsx";

export const adminRouteTree = (
  <Route path="/admin" element={<AdminLayout />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<DashboardPage />} />
    <Route path="profile" element={<AdminProfile />} />
    <Route path="settings" element={<BusinessSetting />} />

    <Route path="static-pages" element={<Outlet />}>
      <Route index element={<StaticPageList />} />
      <Route path="new" element={<StaticPageAdd />} />
      <Route path=":pageId/edit" element={<StaticPageUpdate />} />
    </Route>

    <Route path="users" element={<Outlet />}>
      <Route index element={<UserList />} />
      <Route path="new" element={<UserAdd />} />
      <Route path=":userId/edit" element={<UserEdit />} />
      <Route path=":userId" element={<UserView />} />
    </Route>

    <Route path="vendors" element={<Outlet />}>
      <Route index element={<VendorList />} />
      <Route path="new" element={<VendorAdd />} />
      <Route path=":vendorId/edit" element={<VendorEdit />} />
      <Route path=":vendorId" element={<VendorView />} />
    </Route>
    <Route path="venue-vendors" element={<Outlet />}>
      <Route index element={<VenueVendorList />} />
      <Route path="new" element={<VenueVendorAdd />} />
      <Route path=":venueVendorId/edit" element={<VenueVendorEdit />} />
      <Route path=":venueVendorId" element={<VenueVendorView />} />
    </Route>
    <Route path="venues" element={<Outlet />}>
      <Route index element={<VenueList />} />
      <Route path=":venueId/edit" element={<VenueEdit />} />
      <Route path=":venueId" element={<VenueView />} />
    </Route>
    <Route path="amenities" element={<Outlet />}>
      <Route index element={<AmenitiesList />} />
      <Route path="new" element={<AmenitiesAdd />} />
      <Route path=":amenityId/edit" element={<AmenitiesEdit />} />
      <Route path=":amenityId" element={<AmenitiesView />} />
    </Route>
    <Route path="delivery" element={<Outlet />}>
      <Route index element={<DeliveryList />} />
      <Route path="new" element={<DeliveryAdd />} />
      <Route path=":deliveryId/edit" element={<DeliveryEdit />} />
      <Route path=":deliveryId" element={<DeliveryView />} />
    </Route>
    <Route path="delivery-cod" element={<Outlet />}>
      <Route index element={<DeliveryCodList />} />
      <Route path=":driverId" element={<DeliveryCodSettle />} />
    </Route>
    <Route path="products" element={<Outlet />}>
      <Route index element={<ProductList />} />
      <Route path="new" element={<ProductAdd />} />
      <Route path=":productId/edit" element={<ProductEdit />} />
      <Route path=":productId" element={<ProductView />} />
    </Route>
    <Route path="mobile-recharge" element={<MobileRechargeList />} />
    <Route path="gas-recharge" element={<GasRechargeList />} />
    <Route path="fastag-recharge" element={<FasttagRechargeList />} />
    <Route path="categories" element={<CategoryPage />} />
    <Route path="sub-categories" element={<SubCategoryPage />} />
    <Route path="locations" element={<LocationsPage />} />
    <Route path="attribute-sets" element={<AttributeTitlePage />} />
    <Route path="attributes" element={<AttributeValuePage />} />
    <Route path="promo" element={<Outlet />}>
      <Route index element={<PromotionList />} />
      <Route path="new" element={<PromotionAdd />} />
      <Route path=":promotionId/edit" element={<PromotionEdit />} />
      <Route path=":promotionId" element={<PromotionView />} />
    </Route>
    <Route path="recharge" element={<SectionPage title="Recharge Monitoring" />} />
    <Route path="commission" element={<SectionPage title="Commission" />} />
    <Route path="payments" element={<Outlet />}>
      <Route index element={<OrderAndBookingTransactionPage />} />
      <Route path=":kind/:transactionId" element={<PaymentTransactionDetailPage />} />
    </Route>
    <Route path="orders" element={<Outlet />}>
      <Route index element={<OrderAndBookingPage />} />
      <Route path=":kind/:orderId" element={<OrderAndBookingDetailPage />} />
    </Route>
    <Route path="banners" element={<BannerPage />} />
    <Route path="video-feeds" element={<VideoFeedPage />} />
    <Route path="plans" element={<VendorPlanPage />} />
    <Route path="promotion-dashboard" element={<PromotionDashboardPage />} />
    <Route path="promotion-plans" element={<PromotionPlanPage />} />
    <Route path="promotion-requests" element={<PromotionRequestsPage />} />
    <Route path="faq" element={<FaqPage />} />
    <Route path="reports" element={<SectionPage title="Reports & Analytics" />} />
    <Route path="notifications" element={<NotificationPage />} />

    <Route path="*" element={<NotFoundPage />} />
  </Route>
);
