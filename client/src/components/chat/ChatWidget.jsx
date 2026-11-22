import { lazy, Suspense, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const ChatPanel = lazy(() => import('./ChatPanel'));

/**
 * Floating chat button (FR-45). The panel and its socket load only when it's first opened.
 * z-[1100] keeps it above Leaflet's panes and controls (up to 1000) on map pages.
 */
export function ChatWidget({ trackingId, className }) {
  const [open, setOpen] = useState(false);
  const launcher = useRef(null);
  return (
    <>
      <AnimatePresence>
        {open && (
          <Suspense fallback={null}>
            <ChatPanel onClose={() => setOpen(false)} trackingId={trackingId} launcherRef={launcher} />
          </Suspense>
        )}
      </AnimatePresence>
      <motion.button
        ref={launcher}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Chat with the ShipTrack assistant'}
        aria-expanded={open}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'fixed bottom-4 right-4 z-[1100] grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:bottom-6 sm:right-6',
          open && 'max-sm:hidden',
          className,
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={open ? 'x' : 'chat'} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
            {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </>
  );
}
