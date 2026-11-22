import { useEffect, useState } from 'react';

/** Hours remaining until `target`, ticking every 30 s. */
export function useCountdown(target) {
  const calc = () => (target ? (new Date(target).getTime() - Date.now()) / 3_600_000 : null);
  const [hours, setHours] = useState(calc);
  useEffect(() => {
    setHours(calc());
    const id = setInterval(() => setHours(calc()), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return hours;
}
