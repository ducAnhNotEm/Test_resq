import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Config, Fetcher, RouteTracker } from './routeTracker';
import { serverFetcher } from './goongFetcher';
import { turfGeo } from './geoTurf';

export interface UseRouteOptions {
  vehicle?: string;
  fetcher?: Fetcher;
  config?: Partial<Config>;
}

export function useRoute(
  destLng?: number,
  destLat?: number,
  options: UseRouteOptions = {}
) {
  const {
    vehicle = 'car',
    fetcher = serverFetcher,
    config = {},
  } = options;

  const ref = useRef<RouteTracker | null>(null);
  if (!ref.current) {
    // __DEV__: cooldown ngắn hơn để demo thấy tuyến phản ứng nhanh
    const devConfig: Partial<Config> = __DEV__
      ? { cooldownMs: 4000, maxCooldownMs: 15000, ...config }
      : config;
    ref.current = new RouteTracker(fetcher, turfGeo, devConfig);
  }
  const t = ref.current;

  useEffect(() => {
    if (
      destLng == null ||
      destLat == null ||
      !Number.isFinite(destLng) ||
      !Number.isFinite(destLat)
    ) {
      t.clearDestination();
      return;
    }
    t.setDestination([destLng, destLat], vehicle);
  }, [t, destLng, destLat, vehicle]);

  useEffect(() => () => t.dispose(), [t]);

  const snap = useSyncExternalStore(t.subscribe, t.getSnapshot);

  return {
    ...snap,
    onLocation: t.onLocation,
    retry: t.retry,
    setDestination: t.setDestination,
    clearDestination: t.clearDestination,
    tracker: t,
  };
}

/* Màn hình: đăng ký GPS MỘT lần, an toàn vì onLocation có identity ổn định.
   useEffect(() => {
     let sub: Location.LocationSubscription | undefined;
     (async () => {
       sub = await Location.watchPositionAsync(
         { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5 },
         loc => onLocation([loc.coords.longitude, loc.coords.latitude], loc.coords.accuracy ?? 10, loc.timestamp));
     })();
     return () => sub?.remove();
   }, [onLocation]);
*/
