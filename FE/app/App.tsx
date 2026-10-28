import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
} from 'react-router-dom';
import { Toaster } from 'sonner';
import { GoogleOAuthProvider } from '@react-oauth/google';

// Các trang chính
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import MerchantDashboard from './components/Merchant/MerchantDashboard';
import MerchantInfo from './components/Merchant/MerchantProfile';
import Admin from './components/admin/Admin';
import CustomerProfile from './components/CustomerProfile';
import NotFoundPage from './components/NotFoundPage';

// Các trang booking
import CheckoutPage from './components/bookings/CheckoutPage';
import BusBooking from './components/bookings/BusBooking';
import BookingSuccess from './components/bookings/BookingSuccess';
import PaymentResult from './components/bookings/PaymentResult';

// Các trang tài khoản
import ForgotPasswordPage from './components/ui/ForgotPasswordPage';
import ResetPasswordPage from './components/ui/ResetPasswordPage';
import CustomerChatWidget from './components/communications/CustomerChatWidget';

function Root() {
  return (
    <>
      <Outlet />
      <CustomerChatWidget />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <NotFoundPage />,

    children: [
      {
        path: '/',
        element: <LandingPage />,
      },
      {
        path: '/login',
        element: <LoginPage />,
      },
      {
        path: '/register',
        element: <RegisterPage />,
      },
      {
        path: '/forgot-password',
        element: <ForgotPasswordPage />,
      },
      {
        path: '/reset-password',
        element: <ResetPasswordPage />,
      },
      {
        path: '/merchant',
        element: <MerchantDashboard />,
      },
      {
        path: '/merchant/:section',
        element: <MerchantDashboard />,
      },
      {
        path: '/merchant/info',
        element: <MerchantInfo />,
      },
      {
        path: '/admin',
        element: <Admin />,
      },
      {
        path: '/profile',
        element: <CustomerProfile />,
      },
      {
        path: '/booking/bus',
        element: <BusBooking />,
      },
      {
        path: '/checkout',
        element: <CheckoutPage />,
      },
      {
        path: '/booking/success',
        element: <BookingSuccess />,
      },

      /*
       * VNPay trả kết quả về route này
       */
      {
        path: '/payment-result',
        element: <PaymentResult />,
      },
    ],
  },
]);

export default function App() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  console.log("Google Client ID:", clientId);
  return (
    <GoogleOAuthProvider
      clientId={
        import.meta.env.VITE_GOOGLE_CLIENT_ID
      }
    >
      <RouterProvider router={router} />

      <Toaster
        richColors
        position="top-right"
      />
    </GoogleOAuthProvider>
  );
}