// NDW Proxy: Haal actuele files op uit NDW open data, converteer CSV naar JSON en serveer als API
const express = require('express');
const fetch = require('node-fetch');
const csv = require('csvtojson');
const app = express();
const PORT = process.env.PORT || 3001;

// NDW actuele files CSV feed
const NDW_CSV_URL = 'https://opendata.ndw.nu/files_ndw.csv.gz';

const zlib = require('zlib');

app.get('/api/ndwfiles', async (req, res) => {
  try {
    // Haal de .gz file op
    const ndwResp = await fetch(NDW_CSV_URL);
    if (!ndwResp.ok) return res.status(502).json({error: 'NDW feed niet bereikbaar'});
    const zipped = await ndwResp.buffer();
    // Unzip
    zlib.gunzip(zipped, async (err, buffer) => {
      if (err) return res.status(500).json({error: 'GZIP decompressie mislukt'});
      // CSV naar JSON
      const csvStr = buffer.toString('utf-8');
      const json = await csv().fromString(csvStr);
      // Optioneel: filter lege entries
      const filtered = json.filter(f => f.latitude && f.longitude);
      res.json(filtered);
    });
  } catch (e) {
    res.status(500).json({error: 'NDW proxy error', details: e.message});
  }
});

app.listen(PORT, () => {
  console.log('NDW proxy running on port', PORT);
});
