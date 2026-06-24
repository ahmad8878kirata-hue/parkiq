// Fallback transit stops for Stuttgart when external data sources are unavailable
// Data sourced from known major Stuttgart transit nodes
const FALLBACK_STOPS = [
  // ===== S-Bahn Stations (train) =====
  { name: 'Hauptbahnhof (oben)', coordinates: [48.7841, 9.1812], type: 'train s-bahn station' },
  { name: 'Hauptbahnhof (unten)', coordinates: [48.7833, 9.1825], type: 'train s-bahn station' },
  { name: 'Stadtmitte', coordinates: [48.7768, 9.1765], type: 'train s-bahn station' },
  { name: 'Feuersee', coordinates: [48.7739, 9.1668], type: 'train s-bahn station' },
  { name: 'Schwabstraße', coordinates: [48.7703, 9.1568], type: 'train s-bahn station' },
  { name: 'Universität', coordinates: [48.7668, 9.1783], type: 'train u-bahn' },
  { name: 'Charlottenplatz', coordinates: [48.7766, 9.1845], type: 'train u-bahn' },
  { name: 'Schlossplatz', coordinates: [48.7787, 9.1800], type: 'train u-bahn' },
  { name: 'Neckartor', coordinates: [48.7871, 9.1909], type: 'train u-bahn' },
  { name: 'Österfeld', coordinates: [48.7579, 9.1674], type: 'train u-bahn' },
  { name: 'Vaihingen', coordinates: [48.7345, 9.1081], type: 'train s-bahn' },
  { name: 'Rohr', coordinates: [48.7187, 9.1062], type: 'train s-bahn' },
  { name: 'Bad Cannstatt', coordinates: [48.8032, 9.2160], type: 'train s-bahn station' },
  { name: 'Untertürkheim', coordinates: [48.7853, 9.2590], type: 'train s-bahn' },
  { name: 'Nürnberger Straße', coordinates: [48.7933, 9.2043], type: 'train u-bahn' },
  { name: 'Rathaus', coordinates: [48.7770, 9.1784], type: 'train u-bahn' },
  { name: 'Olgaeck', coordinates: [48.7759, 9.1824], type: 'train u-bahn' },
  { name: 'Börsenplatz', coordinates: [48.7792, 9.1764], type: 'train u-bahn' },
  { name: 'Rotebühlplatz', coordinates: [48.7749, 9.1705], type: 'train u-bahn station' },
  { name: 'Liederhalle', coordinates: [48.7787, 9.1686], type: 'train u-bahn' },
  { name: 'Berliner Platz', coordinates: [48.7789, 9.1722], type: 'train u-bahn' },

  // ===== Bus Stops =====
  { name: 'Hauptbahnhof (Bus)', coordinates: [48.7848, 9.1800], type: 'bus station' },
  { name: 'Schlossplatz (Bus)', coordinates: [48.7782, 9.1793], type: 'bus stop' },
  { name: 'Charlottenplatz (Bus)', coordinates: [48.7761, 9.1849], type: 'bus stop' },
  { name: 'Stadtmitte (Bus)', coordinates: [48.7772, 9.1751], type: 'bus stop' },
  { name: 'Killesberg', coordinates: [48.8045, 9.1686], type: 'bus stop' },
  { name: 'Möhringen', coordinates: [48.7274, 9.1490], type: 'bus stop' },
  { name: 'Degerloch', coordinates: [48.7468, 9.1698], type: 'bus stop' },
  { name: 'Heslach', coordinates: [48.7610, 9.1481], type: 'bus stop' },
  { name: 'Zuffenhausen', coordinates: [48.8278, 9.1588], type: 'bus stop' },
  { name: 'Feuerbach', coordinates: [48.8063, 9.1627], type: 'bus stop' },
  { name: 'Botnang', coordinates: [48.7800, 9.1277], type: 'bus stop' },
  { name: 'Wangen', coordinates: [48.7809, 9.2356], type: 'bus stop' },
  { name: 'Obertürkheim', coordinates: [48.7643, 9.2696], type: 'bus stop' },
  { name: 'Münster', coordinates: [48.8097, 9.2224], type: 'bus stop' },
  { name: 'Hofen', coordinates: [48.8191, 9.2331], type: 'bus stop' },

  // ===== Bicycle Rentals =====
  { name: 'Hauptbahnhof (RegioRad)', coordinates: [48.7845, 9.1808], type: 'bike bicycle rental' },
  { name: 'Schlossplatz (RegioRad)', coordinates: [48.7785, 9.1795], type: 'bike bicycle rental' },
  { name: 'Universität (RegioRad)', coordinates: [48.7665, 9.1788], type: 'bike bicycle rental' },
  { name: 'Charlottenplatz (RegioRad)', coordinates: [48.7763, 9.1850], type: 'bike bicycle rental' },
  { name: 'Feuersee (RegioRad)', coordinates: [48.7737, 9.1670], type: 'bike bicycle rental' },
  { name: 'Marienplatz', coordinates: [48.7668, 9.1718], type: 'bike bicycle rental' },
  { name: 'Wilhelma', coordinates: [48.8056, 9.2080], type: 'bike bicycle rental' },
  { name: 'Killesberg (RegioRad)', coordinates: [48.8048, 9.1680], type: 'bike bicycle rental' },
  { name: 'Bad Cannstatt (RegioRad)', coordinates: [48.8035, 9.2155], type: 'bike bicycle rental' },
  { name: 'Vaihingen (RegioRad)', coordinates: [48.7340, 9.1075], type: 'bike bicycle rental' },
];

module.exports = FALLBACK_STOPS;
