
// scrape-pinci.js
import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import cheerio from "cheerio";

// Pagine di ricerca da cui leggere gli annunci (puoi aggiungere o togliere pagine)
const LISTING_URLS = [
  "https://www.agence-pinci.com/it/ricerca?page=1",
  "https://www.agence-pinci.com/it/ricerca?page=2",
  "https://www.agence-pinci.com/it/ricerca?page=3",
  "https://www.agence-pinci.com/it/ricerca?page=4",
  "https://www.agence-pinci.com/it/ricerca?page=5"
];

const OUTPUT_DIR = path.join(process.cwd(), "public");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "knowledge-annunci.txt");

function clean(t) {
  return (t || "").replace(/\s+/g, " ").trim();
}

function parseListing(html, url) {
  const $ = cheerio.load(html);
  const results = [];

  // Ogni annuncio è strutturato come:
  // ### Appartamento, Mentone
  // ## Vendita Appartamento Mentone
  // * prezzo
  // * locali
  // * camere (a volte)
  // * bagno(i)
  // * m²
  //
  // Le immagini (link) sono subito sopra al blocco, nello stesso container visuale.
  // Qui prendiamo h3 come "tipo, città" e h2 come titolo.
  const blocks = $("h3").filter((i, el) => {
    const txt = clean($(el).text());
    return txt.includes(","); // es: "Appartamento, Mentone"
  });

  blocks.each((i, h3) => {
    const h3El = $(h3);
    const container = h3El.parent(); // blocco principale

    const tipoCitta = clean(h3El.text()); // es: "Appartamento, Mentone"

    // estraggo città da dopo la virgola
    let zona = "";
    const parts = tipoCitta.split(",");
    if (parts.length > 1) {
      zona = clean(parts.slice(1).join(","));
    }

    const titolo = clean(container.find("h2").first().text());

    // elenco puntato subito sotto il titolo
    const items = container.find("ul li, div > *").filter((i, el) => clean($(el).text()).includes("€") || clean($(el).text()).includes("m²") || clean($(el).text()).includes("locale"));
    let prezzo = "";
    let superficie = "";
    let locali = "";
    let camere = "";
    let bagni = "";

    container.find("li").each((i, li) => {
      const txt = clean($(li).text());
      if (!txt) return;
      if (txt.includes("€")) prezzo = txt;
      else if (txt.includes("m²") || txt.lower().endsWith("m2")) superficie = txt;
      else if (txt.includes("locale")) locali = txt;
      else if (txt.includes("camera")) camere = txt;
      else if (txt.includes("bagno")) bagni = txt;
    });

    // descrizione: un paragrafo sotto, se presente
    const descrizione = clean(container.find("p").first().text());

    // link: prendiamo il primo <a> significativo nel container
    let link = container.find("a").first().attr("href") || "";
    if (link && !link.startsWith("http")) {
      link = "https://www.agence-pinci.com" + link;
    }

    if (!titolo && !prezzo) return;

    results.push({
      titolo: titolo || tipoCitta,
      zona,
      prezzo,
      superficie,
      locali,
      camere,
      bagni,
      descrizione,
      link,
      sorgente: url
    });
  });

  return results;
}

async function scrapeAll() {
  let all = [];

  for (const url of LISTING_URLS) {
    console.log("Scarico:", url);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0"
        }
      });

      if (!res.ok) {
        console.error("Errore HTTP", res.status, "su", url);
        continue;
      }

      const html = await res.text();
      const estratti = parseListing(html, url);
      console.log("Annunci trovati su questa pagina:", estratti.length);
      all = all.concat(estratti);
    } catch (err) {
      console.error("Errore su", url, err.message);
    }
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, buildKnowledge(all), "utf-8");
  console.log("Knowledge aggiornata in:", OUTPUT_FILE);
}

function buildKnowledge(list) {
  let out = "";
  out += "=== KNOWLEDGE AGENCE PINCI – ANNUNCI IMMOBILIARI ===\n";
  out += "File generato automaticamente per Avatar HeyGen (consulenza e vendita immobiliare).\n";
  out += "Ogni blocco '=== ANNUNCIO_ID: N ===' rappresenta un immobile.\n\n";

  list.forEach((a, i) => {
    const id = i + 1;
    out += `=== ANNUNCIO_ID: ${id} ===\n`;
    out += `Titolo: ${a.titolo}\n`;
    out += `Zona: ${a.zona}\n`;
    out += `Prezzo: ${a.prezzo}\n`;
    out += `Superficie: ${a.superficie}\n`;
    out += `Locali: ${a.locali}\n`;
    out += `Camere: ${a.camere}\n`;
    out += `Bagni: ${a.bagni}\n`;
    out += `Descrizione: ${a.descrizione}\n`;
    out += `Link: ${a.link}\n`;
    out += `Sorgente: ${a.sorgente}\n\n`;
  });

  if (!list.length) {
    out += "Nessun annuncio trovato. Controlla i selettori di scrape-pinci.js.\n";
  }

  return out;
}

scrapeAll();
