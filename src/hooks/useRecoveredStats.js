import { useEffect, useState } from 'react';
import { subscribeToRecoveryStats } from '../lib/recoveryStats';

// Live subscription to the public all-time recovery counter. Returns
// { lamports, burns, loading } — lamports/burns tick up in real time for
// every viewer whenever anyone else completes a burn.
export function useRecoveredStats() {
  const [state, setState] = useState({ lamports: 0, burns: 0, loading: true });

  useEffect(() => {
    const unsub = subscribeToRecoveryStats(
      ({ lamports, burns }) => setState({ lamports, burns, loading: false }),
      () => setState(s => ({ ...s, loading: false })),
    );
    return unsub;
  }, []);

  return state;
}
