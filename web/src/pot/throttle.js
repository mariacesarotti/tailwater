export function createThrottle(intervalMs, now = () => performance.now()) {

  let lastFireMs = null;

  function tryFire({ force = false } = {}) {
    const currentMs = now();
    const isWithinInterval = lastFireMs !== null && currentMs - lastFireMs < intervalMs;

    if (isWithinInterval && !force) return false;

    lastFireMs = currentMs;
    return true;
  }

  return { tryFire };
}