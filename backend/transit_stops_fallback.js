// Fallback transit stops for Stuttgart when external data sources are unavailable
// Data sourced from known major Stuttgart transit nodes
const FALLBACK_STOPS = [
  // ===== S-Bahn Stations (train) =====
  { name: 'Hauptbahnhof (oben)', coordinates: [48.7841, 9.1812], type: 'train s-bahn station' },
  { name: 'Arnulf-Klett-Platz', coordinates: [48.7836, 9.1814], type: 'train u-bahn station' },
  { name: 'Jagstfeld Bahnhof 1, Bad Friedrichshall', coordinates: [49.2320, 9.1994], type: 'train s-bahn station' },
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

  // ===== Karlsruhe (train / tram) =====
  { name: 'Karlsruhe Hauptbahnhof', coordinates: [49.0036, 8.4034], type: 'train station' },
  { name: 'Karlsruhe-Durlach', coordinates: [48.9984, 8.4690], type: 'train station' },
  { name: 'Karlsruhe Marktplatz', coordinates: [49.0087, 8.3975], type: 'train station' },
  { name: 'Karlsruhe Mühlburger Tor', coordinates: [49.0147, 8.3865], type: 'train station' },
  { name: 'Karlsruhe Schloss', coordinates: [49.0126, 8.4035], type: 'train station' },

  // ===== Baden-Baden corridor (train / bus) =====
  { name: 'Rastatt', coordinates: [48.8803, 8.2140], type: 'train station' },
  { name: 'Kuppenheim', coordinates: [48.8294, 8.2549], type: 'train station' },
  { name: 'Baden-Baden Hauptbahnhof', coordinates: [48.7902, 8.1919], type: 'train station' },
  { name: 'Baden-Baden Rebland', coordinates: [48.8097, 8.1666], type: 'train station' },
  { name: 'Baden-Baden Stadtwerke', coordinates: [48.7847, 8.1831], type: 'train halt' },
  { name: 'Baden-Baden Leopoldsplatz', coordinates: [48.7604, 8.2339], type: 'bus stop' },
  { name: 'Baden-Baden Augustaplatz', coordinates: [48.7586, 8.2382], type: 'bus stop' },
  { name: 'Baden-Baden Hauptbahnhof (Bus)', coordinates: [48.7905, 8.1915], type: 'bus station' },

  // ===== Stuttgart – Bad Friedrichshall corridor (train / bus) =====
  { name: 'Ludwigsburg', coordinates: [48.8954, 9.1918], type: 'train station' },
  { name: 'Bietigheim-Bissingen', coordinates: [48.9625, 9.1295], type: 'train station' },
  { name: 'Besigheim', coordinates: [49.0041, 9.1409], type: 'train station' },
  { name: 'Neckarwestheim', coordinates: [49.0372, 9.1900], type: 'train station' },
  { name: 'Lauffen am Neckar', coordinates: [49.0752, 9.1484], type: 'train station' },
  { name: 'Heilbronn Hauptbahnhof', coordinates: [49.1439, 9.2260], type: 'train station' },
  { name: 'Heilbronn Marktplatz', coordinates: [49.1424, 9.2187], type: 'train tram_stop' },
  { name: 'Heilbronn Friedensplatz', coordinates: [49.1441, 9.2180], type: 'train tram_stop' },
  { name: 'Neckarsulm', coordinates: [49.1914, 9.2278], type: 'train station' },
  { name: 'Bad Wimpfen', coordinates: [49.2277, 9.1627], type: 'train halt' },
  { name: 'Bad Friedrichshall Hauptbahnhof', coordinates: [49.2378, 9.2163], type: 'train station' },
  { name: 'Bad Friedrichshall-Kochendorf', coordinates: [49.2289, 9.1906], type: 'train halt' },
  { name: 'Weinsberg West', coordinates: [49.1449, 9.2770], type: 'train halt' },
  { name: 'Weinsberg', coordinates: [49.1530, 9.2890], type: 'train halt' },

  // ===== Heilbronn / Weinsberg / Bad Friedrichshall region (bus) =====
  { name: 'Heilbronn Hauptbahnhof (Bus)', coordinates: [49.1427, 9.2258], type: 'bus station' },
  { name: 'Heilbronn Theater (Bus)', coordinates: [49.1415, 9.2212], type: 'bus stop' },
  { name: 'Weinsberg Marktplatz', coordinates: [49.1495, 9.2830], type: 'bus stop' },
  { name: 'Bad Friedrichshall Marktplatz', coordinates: [49.2317, 9.2070], type: 'bus stop' },
  { name: 'Neckarsulm Marktplatz', coordinates: [49.1900, 9.2290], type: 'bus stop' },
];

module.exports = FALLBACK_STOPS;