const https = require('https');
const querystring = require('querystring');
const data = querystring.stringify({
  data: '[out:json][timeout:20];area["name"="Stuttgart"];(node(area)["highway"="bus_stop"];node(area)["railway"="station"];node(area)["railway"="tram_stop"];node(area)["railway"="halt"];node(area)["amenity"="bicycle_rental"];);out body;'
});
const options = {
  hostname: 'overpass.kumi.systems',
  port: 443,
  path: '/api/interpreter',
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }
};
const req = https.request(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    try {
      const j = JSON.parse(body);
      console.log('Elements:', j.elements.length);
      j.elements.slice(0, 8).forEach(e => console.log(' -', e.tags.name || '(unnamed)', 'type=', e.tags.highway || e.tags.railway || e.tags.amenity, 'at', e.lat.toFixed(4), e.lon.toFixed(4)));
      // Save to file
      const fs = require('fs');
      fs.writeFileSync('stuttgart_transit.json', JSON.stringify(j, null, 2));
      console.log('Saved to stuttgart_transit.json');
    } catch (e) {
      console.log('Parse error:', body.substring(0, 500));
    }
  });
});
req.on('error', e => console.log('Error:', e.message));
req.write(data);
req.end();
