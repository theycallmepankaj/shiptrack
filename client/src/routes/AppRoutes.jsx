import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GuestRoute, ProtectedRoute } from './guards';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DriverProvider } from '@/context/DriverContext';

// Routes are code-split (§11.6), except the landing page: it's the most common first page,
// so it ships in the entry bundle instead of costing a second round trip.
import Landing from '@/pages/public/Landing';
const NotFound = lazy(() => import('@/pages/public/NotFound'));
const Login = lazy(() => import('@/pages/public/Login'));
const Register = lazy(() => import('@/pages/public/Register'));
const ForgotPassword = lazy(() => import('@/pages/public/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/public/ResetPassword'));
const CustomerDashboard = lazy(() => import('@/pages/customer/Dashboard'));
const DriverToday = lazy(() => import('@/pages/driver/Today'));
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const Profile = lazy(() => import('@/pages/shared/Profile'));
const Notifications = lazy(() => import('@/pages/shared/Notifications'));
const Track = lazy(() => import('@/pages/public/Track'));
const BookShipment = lazy(() => import('@/pages/customer/BookShipment'));
const MyShipments = lazy(() => import('@/pages/customer/MyShipments'));
const ShipmentDetail = lazy(() => import('@/pages/customer/ShipmentDetail'));
const DriverShipmentDetail = lazy(() => import('@/pages/driver/ShipmentDetail'));
const Deliver = lazy(() => import('@/pages/driver/Deliver'));
const DriverHistory = lazy(() => import('@/pages/driver/History'));
const Fleet = lazy(() => import('@/pages/admin/Fleet'));
const AdminShipments = lazy(() => import('@/pages/admin/Shipments'));
const AdminDrivers = lazy(() => import('@/pages/admin/Drivers'));
const AdminPricing = lazy(() => import('@/pages/admin/Pricing'));
const AdminDocuments = lazy(() => import('@/pages/admin/Documents'));

function Page({ children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      {children}
    </motion.div>
  );
}

// The prerendered landing page is hydrated outside any Suspense boundary: an update that reaches a
// boundary still hydrating (e.g. the real theme replacing the prerender's "light") would make React
// throw the markup away and render it again (error #421). The landing page isn't lazy, so it never suspends.
function MaybeSuspense({ skip, children }) {
  return skip ? children : <Suspense fallback={<div className="min-h-screen" />}>{children}</Suspense>;
}

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

const guarded = (role) => {
  const layout = (
    <Suspense fallback={null}>
      <DashboardLayout role={role} />
    </Suspense>
  );
  // Drivers share duty state + live GPS across every driver page.
  return <ProtectedRoute roles={[role]}>{role === 'driver' ? <DriverProvider>{layout}</DriverProvider> : layout}</ProtectedRoute>;
};

export function AppRoutes() {
  const location = useLocation();
  // Keep the dashboard layout mounted across its child routes; animate public pages per path.
  const area = location.pathname.match(/^\/(app|driver|admin|track)(\/|$)/)?.[1];
  return (
    <>
      <ScrollManager />
      <MaybeSuspense skip={location.pathname === '/'}>
        <Routes location={location} key={area ?? location.pathname}>
          {/* No fade wrapper: the landing page is prerendered and must be visible before JS runs. */}
          <Route path="/" element={<Landing />} />
          <Route path="/track/:trackingId?" element={<Page><Track /></Page>} />
          <Route path="/login" element={<GuestRoute><Page><Login /></Page></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><Page><Register /></Page></GuestRoute>} />
          <Route path="/forgot-password" element={<Page><ForgotPassword /></Page>} />
          <Route path="/reset-password/:token" element={<Page><ResetPassword /></Page>} />

          <Route path="/app" element={guarded('customer')}>
            <Route index element={<CustomerDashboard />} />
            <Route path="book" element={<BookShipment />} />
            <Route path="shipments" element={<MyShipments />} />
            <Route path="shipments/:id" element={<ShipmentDetail />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route path="/driver" element={guarded('driver')}>
            <Route index element={<DriverToday />} />
            <Route path="shipments/:id" element={<DriverShipmentDetail />} />
            <Route path="shipments/:id/deliver" element={<Deliver />} />
            <Route path="history" element={<DriverHistory />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route path="/admin" element={guarded('admin')}>
            <Route index element={<AdminDashboard />} />
            <Route path="fleet" element={<Fleet />} />
            <Route path="shipments" element={<AdminShipments />} />
            <Route path="shipments/:id" element={<ShipmentDetail variant="admin" />} />
            <Route path="drivers" element={<AdminDrivers />} />
            <Route path="pricing" element={<AdminPricing />} />
            <Route path="documents" element={<AdminDocuments />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route path="*" element={<Page><NotFound /></Page>} />
        </Routes>
      </MaybeSuspense>
    </>
  );
}
