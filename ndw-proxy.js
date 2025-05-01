// NDW Proxy: Haal actuele files op uit NDW open data, converteer CSV naar JSON en serveer als API
const express = require('express');
const fetch = require('node-fetch');
const csv = require('csvtojson');
const app = express();
const PORT = process.env.PORT || 3001;

// CORS headers toestaan voor lokale dev en fataxi.github.io
app.use((req, res, next) => {
  const allowedOrigins = ['https://fataxi.github.io', 'https://yolo-n9xa.onrender.com'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// NDW actuele files feeds
const NDW_CSV_URL = 'https://opendata.ndw.nu/files_ndw.csv.gz';
const NDW_XML_URL = 'https://opendata.ndw.nu/trafficspeed.xml.gz';
const xml2js = require('xml2js');

const zlib = require('zlib');

app.get('/api/ndwfiles', async (req, res) => {
  // Probeer eerst CSV-feed
  try {
    const ndwResp = await fetch(NDW_CSV_URL);
    if (ndwResp.ok) {
      const zipped = await ndwResp.buffer();
      zlib.gunzip(zipped, async (err, buffer) => {
        if (err) {
          console.error('GZIP decompressie mislukt', err);
          return tryXmlFallback(res);
        }
        try {
          const csvStr = buffer.toString('utf-8');
          const json = await csv().fromString(csvStr);
          const filtered = json.filter(f => f.latitude && f.longitude);
          return res.json(filtered);
        } catch (csvErr) {
          console.error('CSV parsing mislukt', csvErr);
          return tryXmlFallback(res);
        }
      });
    } else {
      console.error('NDW CSV feed niet bereikbaar', ndwResp.status);
      return tryXmlFallback(res);
    }
  } catch (e) {
    console.error('NDW proxy CSV error', e);
    return tryXmlFallback(res);
  }
});

// Fallback: probeer XML-feed
async function tryXmlFallback(res) {
  try {
    const xmlResp = await fetch(NDW_XML_URL);
    if (!xmlResp.ok) {
      console.error('NDW XML feed niet bereikbaar', xmlResp.status);
      return res.status(502).json({error: 'NDW XML feed niet bereikbaar'});
    }
    const zipped = await xmlResp.buffer();
    zlib.gunzip(zipped, async (err, buffer) => {
      if (err) {
        console.error('GZIP decompressie XML mislukt', err);
        return res.status(500).json({error: 'GZIP decompressie XML mislukt'});
      }
      try {
        const xmlStr = buffer.toString('utf-8');
        xml2js.parseString(xmlStr, { explicitArray: false }, (xmlErr, result) => {
          if (xmlErr) {
            console.error('XML parsing mislukt', xmlErr);
            return res.status(500).json({error: 'XML parsing mislukt'});
          }
          // Extracteer relevante file info uit XML (afhankelijk van NDW structuur)
          // Hier een voorbeeld voor trafficspeed.xml.gz
          let files = [];
          try {
            const records = result?.TRAFFICSPEED?.TRAFFIC?.SPEED;
            if (Array.isArray(records)) {
              files = records.map(r => ({
                id: r['$']?.id,
                road: r['$']?.road,
                latitude: r['$']?.lat,
                longitude: r['$']?.lon,
                speed: r['$']?.speed,
                reason: r['$']?.reason
              }));
            }
          } catch (extractErr) {
            console.error('Extractie van files uit XML mislukt', extractErr);
          }
          res.json(files);
        });
      } catch (parseErr) {
        console.error('XML buffer parsing error', parseErr);
        return res.status(500).json({error: 'XML buffer parsing error'});
      }
    });
  } catch (err) {
    console.error('NDW proxy XML fallback error', err);
    res.status(500).json({error: 'NDW proxy XML fallback error', details: err.message});
  }
}

app.listen(PORT, () => {
  console.log('NDW proxy running on port', PORT);
});
