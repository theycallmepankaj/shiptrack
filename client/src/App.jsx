import { BrowserRouter } from 'react-router-dom';
import { useIsClient } from '@/hooks/useIsClient';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { SocketProvider } from '@/context/SocketContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { AppRoutes } from '@/routes/AppRoutes';

function ThemedToaster() {
  const { theme } = useTheme();
  // Browser-only: keeps the prerendered landing page and its hydration identical.
  if (!useIsClient()) return null;
  return <Toaster theme={theme} position="top-center" richColors closeButton />;
}

/** `router`/`location` let scripts/prerender.mjs render the same tree with a StaticRouter. */
export default function App({ router: Router = BrowserRouter, location }) {
  return (
    <ThemeProvider>
      {/* Respect prefers-reduced-motion for every Framer Motion animation (§11.3). */}
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <SocketProvider>
            <NotificationProvider>
              <Router location={location}>
                <AppRoutes />
              </Router>
            </NotificationProvider>
          </SocketProvider>
        </AuthProvider>
        <ThemedToaster />
      </MotionConfig>
    </ThemeProvider>
  );
}
