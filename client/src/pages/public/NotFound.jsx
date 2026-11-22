import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/Navbar';

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="container grid min-h-screen place-items-center text-center">
        <div>
          <p className="font-mono text-7xl font-bold text-primary">404</p>
          <h1 className="mt-4 text-2xl font-extrabold">This parcel took a wrong turn</h1>
          <p className="mt-2 text-muted">The page you’re looking for doesn’t exist.</p>
          <Button asChild className="mt-8"><Link to="/">Go home</Link></Button>
        </div>
      </main>
    </>
  );
}
