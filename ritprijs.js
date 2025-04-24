async function berekenRit() {
  const ophaaladres = document.getElementById("ophaaladres").value;
  const afzetadres = document.getElementById("afzetadres").value;
  const resultaatDiv = document.getElementById("resultaat");
  resultaatDiv.innerHTML = "⏳ Bezig met berekenen...";

  if (!ophaaladres || !afzetadres) {
    resultaatDiv.innerHTML = "❌ Vul zowel het ophaal- als afzetadres in.";
    return;
  }

  const apiKey = "5b3ce3597851110001cf6248f6f37c4dbbc546fc8f8d34dcf69a6a99"; // jouw OpenRouteService API
  const coords = await getCoords(ophaaladres, afzetadres);
  if (!coords) {
    resultaatDiv.innerHTML = "❌ Adrescoördinaten konden niet worden opgehaald.";
    return;
  }

  const { afstandKm, duurMin } = await getRoute(coords.start, coords.end, apiKey);
  if (afstandKm === null) {
    resultaatDiv.innerHTML = "❌ Route kon niet worden berekend.";
    return;
  }

  let prijs = berekenPrijs(afstandKm, duurMin);
  prijs += spoedToeslag;

  resultaatDiv.innerHTML =
    `📍 Afstand: ${afstandKm.toFixed(2)} km\n` +
    `🕒 Duur: ${duurMin.toFixed(1)} min\n` +
    `💰 Totale ritprijs: €${prijs.toFixed(2)}`;
}

function berekenPrijs(afstand, duur) {
  if (afstand < 3) return 15;
  if (afstand < 4) return 17.5;
  if (afstand < 5) return 20;
  if (afstand < 6) return 22.5;
  if (afstand < 7) return 25;
  if (afstand < 8) return 27.5;
  if (afstand < 9) return 30;
  // vanaf 10 km: dynamisch tarief
  return 2.5 + afstand * 2 + duur * 0.3;
}

async function getCoords(startAdres, endAdres) {
  try {
    const fetchCoords = async adres => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(adres)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.length === 0) return null;
      return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
    };
    const start = await fetchCoords(startAdres);
    const end = await fetchCoords(endAdres);
    return start && end ? { start, end } : null;
  } catch {
    return null;
  }
}

async function getRoute(start, end, apiKey) {
  const url = "https://api.openrouteservice.org/v2/directions/driving-car";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      coordinates: [start, end]
    })
  });
  const data = await res.json();
  if (!data.routes || !data.routes[0]) return { afstandKm: null, duurMin: null };

  const afstandKm = data.routes[0].summary.distance / 1000;
  const duurMin = data.routes[0].summary.duration / 60;
  return { afstandKm, duurMin };
}
