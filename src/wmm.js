/* World Magnetic Model (WMM2025, epoch 2025.0–2030.0) offline magnetic variation (declination) calculator.
   Zero dependencies, < 2.5 KB. Returns magnetic variation in degrees (East = +, West = -). */
(function (root) {
  'use strict';

  const RAD = Math.PI / 180;
  /* WMM2025 Schmidt semi-normalized spherical harmonic coefficients (n = 1..6) and secular variation (nT/yr):
     [n, m, g, h, dg, dh] */
  const COEFF = [
    [1,0,-29351.8,0,12.0,0],[1,1,-1410.8,4545.4,9.7,-21.5],
    [2,0,-2556.6,0,-11.6,0],[2,1,2951.1,-3133.6,-5.2,-27.7],[2,2,1649.3,-815.1,-8.0,-12.1],
    [3,0,1361.0,0,-1.3,0],[3,1,-2404.1,-56.6,-4.2,4.8],[3,2,1243.8,237.5,0.4,-0.3],[3,3,453.6,-549.5,-15.6,-4.9],
    [4,0,895.0,0,-1.6,0],[4,1,799.5,278.6,-2.4,-1.1],[4,2,55.7,-133.9,-6.0,4.1],[4,3,-281.4,212.0,5.6,1.6],[4,4,12.1,-375.6,-7.0,-4.4],
    [5,0,-233.2,0,0.6,0],[5,1,368.9,47.7,1.4,-0.5],[5,2,187.2,208.8,0.0,2.2],[5,3,-138.7,-121.3,0.6,0.9],[5,4,-142.0,32.2,2.2,1.7],[5,5,20.9,99.1,0.9,0.5],
    [6,0,64.4,0,-0.2,0],[6,1,63.8,-19.1,-0.4,0.3],[6,2,76.9,25.0,0.9,-1.6],[6,3,-115.7,52.7,1.2,-0.4],[6,4,-40.9,-57.8,-0.9,0.9],[6,5,14.9,10.9,0.3,0.7],[6,6,-60.7,72.7,0.9,0.9]
  ];
  const MAX_N = 6;

  function declination(latDeg, lonDeg, date) {
    const dt = ((date instanceof Date ? date.getTime() : Date.now()) / 86400000 / 365.2425 + 1970) - 2025.0;
    const lat = Math.max(-89.9, Math.min(89.9, +latDeg || 0)) * RAD;
    const lon = (+lonDeg || 0) * RAD;

    /* WGS84 geodetic to geocentric at sea level */
    const a = 6378.137, b = 6356.7523142, r0 = 6371.2;
    const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
    const gcLat = Math.atan2(b * b * sinLat, a * a * cosLat);
    const r = Math.sqrt((a * cosLat) ** 2 + (b * sinLat) ** 2);
    const theta = Math.PI / 2 - gcLat;
    const cosT = Math.cos(theta), sinT = Math.max(1e-10, Math.sin(theta));

    /* Gauss-normalized Legendre polynomials and colatitude derivatives */
    const P = Array.from({ length: MAX_N + 1 }, () => new Float64Array(MAX_N + 1));
    const dP = Array.from({ length: MAX_N + 1 }, () => new Float64Array(MAX_N + 1));
    const S = Array.from({ length: MAX_N + 1 }, () => new Float64Array(MAX_N + 1));
    P[0][0] = 1; S[0][0] = 1;
    for (let n = 1; n <= MAX_N; n++) {
      P[n][n] = sinT * P[n - 1][n - 1];
      dP[n][n] = sinT * dP[n - 1][n - 1] + cosT * P[n - 1][n - 1];
      S[n][0] = S[n - 1][0] * (2 * n - 1) / n;
      for (let m = 0; m < n; m++) {
        const k = n === 1 ? 0 : ((n - 1) ** 2 - m * m) / ((2 * n - 1) * (2 * n - 3));
        const pm2 = n >= 2 ? P[n - 2][m] : 0, dpm2 = n >= 2 ? dP[n - 2][m] : 0;
        P[n][m] = cosT * P[n - 1][m] - k * pm2;
        dP[n][m] = cosT * dP[n - 1][m] - sinT * P[n - 1][m] - k * dpm2;
      }
      for (let m = 1; m <= n; m++) {
        S[n][m] = S[n][m - 1] * Math.sqrt((n - m + 1) * (m === 1 ? 2 : 1) / (n + m));
      }
    }

    let Xc = 0, Y = 0, Zc = 0;
    for (const [n, m, g0, h0, dg, dh] of COEFF) {
      const g = (g0 + dg * dt) * S[n][m], h = (h0 + dh * dt) * S[n][m];
      const ratio = (r0 / r) ** (n + 2);
      const cosM = Math.cos(m * lon), sinM = Math.sin(m * lon);
      const gm = g * cosM + h * sinM;
      Xc += ratio * gm * dP[n][m];
      Y  += ratio * m * (g * sinM - h * cosM) * P[n][m] / sinT;
      Zc -= (n + 1) * ratio * gm * P[n][m];
    }
    const psi = gcLat - lat;
    const X = Xc * Math.cos(psi) - Zc * Math.sin(psi);
    return Math.atan2(Y, X) / RAD;
  }

  /* Request device geolocation and resolve rounded integer variation (fallback 0 on deny/timeout/error) */
  function detectVariation(cb, timeoutMs) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { cb(0, null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        const v = Math.max(-30, Math.min(30, Math.round(declination(latitude, longitude))));
        cb(v, { lat: latitude, lon: longitude, exact: declination(latitude, longitude) });
      },
      () => cb(0, null),
      { enableHighAccuracy: false, maximumAge: 86400000, timeout: timeoutMs || 4000 }
    );
  }

  root.WMM = { declination, detectVariation };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.WMM;
})(typeof window !== 'undefined' ? window : globalThis);
