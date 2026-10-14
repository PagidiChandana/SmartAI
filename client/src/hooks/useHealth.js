import { useEffect, useState } from 'react';
import { healthCheck } from '../api/auth';

export function useHealth() {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    healthCheck()
      .then((data) => !cancelled && setState({ status: 'success', data, error: null }))
      .catch((err) => !cancelled && setState({ status: 'error', data: null, error: err?.response?.data?.message || err.message }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
