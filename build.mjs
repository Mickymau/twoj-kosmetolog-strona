// build.mjs — Twój Kosmetolog. Bez zależności: tylko node:fs i node:path.
//
//   node build.mjs                 build deweloperski (ostrzeżenia, strony _robocze)
//   node build.mjs --prod          build produkcyjny (ostrzeżenia z danych = błędy)
//   node build.mjs --prod --zgoda-stock   produkcja mimo plików STOCK-
//   --src=ścieżka --dist=ścieżka   inne katalogi (testy)
//
// Znaczniki w HTML (strony i partials):
//   <!-- @include nazwa -->          src/partials/nazwa.html
//   {{cena:id}} {{cena:id/wariant}}  z cennik.json
//   {{czas:id}} {{czas:id/wariant}}
//   {{booksy:id}} {{booksy:id/wariant}}
//   {{firma:pole}}                   z firma.json (+ pola wyliczane: adres, telefonHref, emailHref)
//   {{suma:id1,id2}} {{roznica:id1,id2}}  suma / różnica dwóch cen (np. „590 zł zamiast 640 zł”)
// Nieznany znacznik, id, pole lub partial = błąd i przerwanie builda.

import fs from 'node:fs';
import path from 'node:path';

// ---------- argumenty ----------
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=') || d;

const PROD = flag('--prod');
const ZGODA_STOCK = flag('--zgoda-stock');
const ROOT = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'));
const SRC = path.resolve(ROOT, opt('src', 'src'));
const DIST = path.resolve(ROOT, opt('dist', 'dist'));

// ---------- stałe z BRIEF ----------
const PROBLEMY = [
  'tradzik', 'przebarwienia', 'naczynka', 'cera-sucha', 'starzenie-skory',
  'owal-twarzy', 'okolica-oczu', 'blizny-i-rozstepy', 'cellulit',
];
const PODSTRONY = [
  'bezpieczne-oczyszczanie-manualne', 'peeling-kawitacyjny', 'oxybrazja', 'terapia-kwasami',
  'kwasy-depigmentacyjne', 'retix-c', 'geneo', 'prx-t33', 'dermapen', 'dermapen-prx-t33',
  'dermapen-biorepeel', 'carbolift', 'karboksyterapia-twarzy', 'karboksyterapia-oczu',
  'karboksyterapia-blizny-rozstepy', 'karboksyterapia-ciala', 'mezoterapia-neauvia',
  'xela-rederm', 'sunekos', 'polinukleotydy', 'anti-redness', 'morska-bryza',
  'zabieg-ujedrniajacy', 'depilacja-laserowa',
];
// znaczniki blokowe — powstaną w kolejnych etapach
const BLOKI_POZNIEJ = { cennik: 'etap 7', 'lista-zabiegow': 'etap 6', 'zobacz-tez': 'etap 5' };

// ---------- raportowanie ----------
const bledy = new Set();
const ostrzezenia = new Set();
const blad = (msg) => bledy.add(msg);
const ostrz = (msg) => (PROD ? blad(msg) : ostrzezenia.add(msg));
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const stop = () => {
  if (!bledy.size) return;
  console.error(`\n✖ Build przerwany — błędy: ${bledy.size}\n`);
  for (const b of bledy) console.error('  • ' + b);
  console.error('');
  process.exit(1);
};

// ---------- dane ----------
function wczytajJson(plik) {
  const p = path.join(SRC, 'data', plik);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    blad(`${rel(p)}: nie da się wczytać (${e.message})`);
    return null;
  }
}
const firma = wczytajJson('firma.json');
const cennik = wczytajJson('cennik.json');
stop();

// ---------- walidacja cennik.json ----------
const reId = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const reData = /^\d{4}-\d{2}-\d{2}$/;
const uslugi = new Map();

function walidujCene(o, gdzie) {
  if (!Number.isInteger(o.cena) || o.cena <= 0) blad(`${gdzie}: „cena” musi być dodatnią liczbą całkowitą`);
  if (o.od !== undefined && typeof o.od !== 'boolean') blad(`${gdzie}: „od” musi być true/false`);
  if (o.czas !== null && (!Number.isInteger(o.czas) || o.czas <= 0)) blad(`${gdzie}: „czas” musi być liczbą minut albo null`);
  if (o.zweryfikowano !== undefined && o.zweryfikowano !== null && !reData.test(o.zweryfikowano))
    blad(`${gdzie}: „zweryfikowano” musi być datą RRRR-MM-DD albo null`);
  if (o.booksyUrl !== undefined && o.booksyUrl !== null && !/^https:\/\//.test(o.booksyUrl))
    blad(`${gdzie}: „booksyUrl” musi zaczynać się od https:// albo być null`);
  for (const [i, p] of (o.pakiety || []).entries())
    if (!Number.isInteger(p.zabiegi) || !Number.isInteger(p.cena)) blad(`${gdzie}: pakiet #${i + 1} wymaga liczb „zabiegi” i „cena”`);
}

(function walidujCennik() {
  const G = 'src/data/cennik.json';
  const kategorie = new Set((cennik.kategorie || []).map((k) => k.id));
  if (!kategorie.size) blad(`${G}: brak listy „kategorie”`);
  if (!Array.isArray(cennik.uslugi)) return blad(`${G}: brak tablicy „uslugi”`);

  for (const u of cennik.uslugi) {
    const g = `${G} [${u.id ?? '?'}]`;
    if (!u.id || !reId.test(u.id)) { blad(`${g}: niepoprawne „id”`); continue; }
    if (uslugi.has(u.id)) blad(`${g}: zduplikowane id`);
    uslugi.set(u.id, u);
    if (!u.nazwa) blad(`${g}: brak „nazwa”`);
    if (!kategorie.has(u.kategoria)) blad(`${g}: nieznana kategoria „${u.kategoria}”`);
    if (!Array.isArray(u.problemy)) blad(`${g}: „problemy” musi być tablicą`);
    else for (const p of u.problemy) if (!PROBLEMY.includes(p)) blad(`${g}: nieznany problem „${p}” (dozwolone: ${PROBLEMY.join(', ')})`);
    if (u.podstrona !== null && !PODSTRONY.includes(u.podstrona)) blad(`${g}: nieznana podstrona „${u.podstrona}”`);
    if (!('booksyUrl' in u)) blad(`${g}: brak pola „booksyUrl” (null = profil)`);

    const maWarianty = Array.isArray(u.warianty);
    if (maWarianty === ('cena' in u)) blad(`${g}: usługa ma mieć albo „cena” + „czas”, albo „warianty”`);
    if (maWarianty) {
      if (!u.warianty.length) blad(`${g}: pusta lista wariantów`);
      const ids = new Set();
      for (const w of u.warianty) {
        const gw = `${g}/${w.id ?? '?'}`;
        if (!w.id || !reId.test(w.id)) { blad(`${gw}: niepoprawne „id” wariantu`); continue; }
        if (ids.has(w.id)) blad(`${gw}: zduplikowane id wariantu`);
        ids.add(w.id);
        if (!w.nazwa) blad(`${gw}: brak „nazwa”`);
        if (!('czas' in w)) blad(`${gw}: brak pola „czas” (null = nieznany)`);
        walidujCene(w, gw);
        if (zweryfikowano(u, w) === undefined) blad(`${gw}: brak „zweryfikowano” (w wariancie ani w usłudze)`);
      }
    } else {
      if (!('czas' in u)) blad(`${g}: brak pola „czas” (null = nieznany)`);
      if (!('zweryfikowano' in u)) blad(`${g}: brak pola „zweryfikowano”`);
      walidujCene(u, g);
    }
    for (const d of u.dodatki || []) if (!d.nazwa || !Number.isInteger(d.cena)) blad(`${g}: dodatek wymaga „nazwa” i liczby „cena”`);
  }
  for (const s of PODSTRONY)
    if (![...uslugi.values()].some((u) => u.podstrona === s)) ostrzezenia.add(`cennik.json: podstrona „${s}” nie ma żadnej pozycji w cenniku`);
})();
stop();

function zweryfikowano(u, w) {
  if (w && 'zweryfikowano' in w) return w.zweryfikowano;
  return u.zweryfikowano;
}

// ---------- formatowanie ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtZl = (n) => n.toLocaleString('pl-PL').replace(/\s/g, ' ') + ' zł';
function fmtMin(m) {
  const h = Math.floor(m / 60), r = m % 60;
  return [h ? `${h} h` : '', r ? `${r} min` : ''].filter(Boolean).join(' ');
}

// ---------- znaczniki ----------
function znajdzUsluge(arg, kto) {
  const [id, wid, nadmiar] = (arg || '').split('/');
  if (!id || nadmiar !== undefined) throw `${kto}: oczekiwano „id” albo „id/wariant”, jest „${arg ?? ''}”`;
  const u = uslugi.get(id);
  if (!u) throw `${kto}: nieznane id usługi „${id}”`;
  if (wid === undefined) return { u, pozycje: u.warianty ? u.warianty : [u], w: null };
  if (!u.warianty) throw `${kto}: usługa „${id}” nie ma wariantów`;
  const w = u.warianty.find((x) => x.id === wid);
  if (!w) throw `${kto}: usługa „${id}” nie ma wariantu „${wid}” (są: ${u.warianty.map((x) => x.id).join(', ')})`;
  return { u, pozycje: [w], w };
}

function sprawdzStatus(u, pozycje, kto) {
  for (const p of pozycje) {
    const pid = p === u ? u.id : `${u.id}/${p.id}`;
    if (zweryfikowano(u, p) === null) ostrz(`${kto}: cena „${pid}” niezweryfikowana w Booksy`);
    if (p.doWyjasnienia || u.doWyjasnienia) ostrz(`${kto}: pozycja „${pid}” oznaczona doWyjasnienia${p.uwagi ? ` (${p.uwagi})` : ''}`);
  }
}

const ZNACZNIKI = {
  cena(arg, kto) {
    const { u, pozycje } = znajdzUsluge(arg, kto);
    sprawdzStatus(u, pozycje, kto);
    const min = Math.min(...pozycje.map((p) => p.cena));
    const od = pozycje.length > 1 || pozycje.some((p) => p.od);
    return esc((od ? 'od ' : '') + fmtZl(min));
  },
  czas(arg, kto) {
    const { u, pozycje } = znajdzUsluge(arg, kto);
    sprawdzStatus(u, pozycje, kto);
    const czasy = pozycje.map((p) => p.czas);
    if (czasy.some((c) => c === null)) {
      ostrz(`${kto}: brak czasu dla „${arg}” w cenniku`);
      if (czasy.every((c) => c === null)) return '❓';
    }
    const znane = czasy.filter((c) => c !== null);
    const min = Math.min(...znane), max = Math.max(...znane);
    return esc(min === max ? fmtMin(min) : `${fmtMin(min)} – ${fmtMin(max)}`);
  },
  booksy(arg, kto) {
    const { u, w } = znajdzUsluge(arg, kto);
    return esc((w && w.booksyUrl) || u.booksyUrl || poleFirmy('booksy', kto));
  },
  firma(arg, kto) {
    return esc(poleFirmy(arg, kto));
  },
  // {{suma:a,b}} / {{roznica:a,b}} — np. „590 zł zamiast 640 zł”, „dopłacisz 300 zł”;
  // tylko usługi z jedną ceną (bez „od”), żeby wynik był jednoznaczny
  suma: (arg, kto) => esc(fmtZl(dzialanie(arg, kto, 'suma').reduce((a, b) => a + b))),
  roznica: (arg, kto) => esc(fmtZl(dzialanie(arg, kto, 'roznica').reduce((a, b) => a - b))),
};

function dzialanie(arg, kto, nazwa) {
  const ids = (arg || '').split(',').map((s) => s.trim());
  if (ids.length !== 2 || ids.some((i) => !i)) throw `${kto}: {{${nazwa}:…}} wymaga dwóch id po przecinku`;
  return ids.map((id) => {
    const { u, pozycje } = znajdzUsluge(id, kto);
    if (pozycje.length !== 1 || pozycje[0].od) throw `${kto}: {{${nazwa}}}: „${id}” nie ma jednej, stałej ceny`;
    sprawdzStatus(u, pozycje, kto);
    return pozycje[0].cena;
  });
}

const FIRMA_WYLICZANE = {
  adres: (k) => `${poleFirmy('ulica', k)}, ${poleFirmy('kodPocztowy', k)} ${poleFirmy('miasto', k)}`,
  telefonHref: (k) => 'tel:' + poleFirmy('telefon', k).replace(/[^\d+]/g, ''),
  emailHref: (k) => 'mailto:' + poleFirmy('email', k),
};

function poleFirmy(nazwa, kto) {
  if (!nazwa) throw `${kto}: brak nazwy pola w {{firma:…}}`;
  if (FIRMA_WYLICZANE[nazwa]) return FIRMA_WYLICZANE[nazwa](kto);
  const p = firma[nazwa];
  if (!p || nazwa.startsWith('_') || typeof p !== 'object') throw `${kto}: nieznane pole firmy „${nazwa}”`;
  if (p.wartosc === null || p.wartosc === undefined || p.wartosc === '') throw `${kto}: pole firmy „${nazwa}” nie ma wartości (${p.zrodlo || 'brak danych'})`;
  if (p.status === '❓') ostrz(`${kto}: pole firmy „${nazwa}” ma status ❓ (${p.zrodlo || ''})`);
  return p.wartosc;
}

// ---------- renderowanie ----------
const reZnacznik = /<!--\s*@include\s+([^\s]+?)\s*-->|\{\{([^{}]*)\}\}/g;
const liniaZ = (txt, i) => txt.slice(0, i).split('\n').length;

function renderuj(plik, stos = []) {
  const kod = fs.readFileSync(plik, 'utf8');
  const nazwa = rel(plik);
  const wynik = kod.replace(reZnacznik, (cale, include, znacznik, idx) => {
    const kto = `${nazwa}:${liniaZ(kod, idx)}`;
    try {
      if (include !== undefined) {
        if (!/^[a-z0-9-]+$/.test(include)) throw `${kto}: niepoprawna nazwa partiala „${include}”`;
        const p = path.join(SRC, 'partials', include + '.html');
        if (!fs.existsSync(p)) throw `${kto}: brak partiala „${include}” (src/partials/${include}.html)`;
        if (stos.includes(p)) throw `${kto}: zapętlony include „${include}”`;
        return renderuj(p, [...stos, plik]).replace(/\n$/, '');
      }
      const [typ, ...reszta] = znacznik.trim().split(':');
      const arg = reszta.length ? reszta.join(':').trim() : undefined;
      if (BLOKI_POZNIEJ[typ]) throw `${kto}: znacznik {{${typ}}} jeszcze nie zaimplementowany (${BLOKI_POZNIEJ[typ]})`;
      if (!ZNACZNIKI[typ]) throw `${kto}: nieznany znacznik {{${znacznik}}}`;
      return ZNACZNIKI[typ](arg, kto);
    } catch (e) {
      if (typeof e !== 'string') throw e;
      blad(e);
      return cale;
    }
  });
  // resztki: niedomknięte {{ lub uszkodzony @include
  const bezZnacznikow = kod.replace(reZnacznik, (m) => ' '.repeat(m.length));
  for (const m of bezZnacznikow.matchAll(/\{\{|\}\}|@include/g))
    blad(`${nazwa}:${liniaZ(kod, m.index)}: niedomknięty lub uszkodzony znacznik „${m[0]}”`);
  return wynik;
}

// ---------- pliki ----------
function* pliki(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* pliki(p);
    else yield p;
  }
}
const robocze = (p) => p.split(path.sep).some((s) => s.startsWith('_'));

// czyścimy ZAWARTOŚĆ dist/, nie sam katalog — na Windows serwer podglądu uruchomiony
// w dist/ blokuje katalog i rmSync(dist) kończy się EPERM
fs.mkdirSync(DIST, { recursive: true });
for (const e of fs.readdirSync(DIST)) fs.rmSync(path.join(DIST, e), { recursive: true, force: true });

const KAT_STRON = path.join(SRC, 'pages');
const strony = [];
for (const p of pliki(KAT_STRON)) {
  const r = path.relative(KAT_STRON, p);
  if (robocze(r) && PROD) continue;
  const cel = path.join(DIST, r);
  fs.mkdirSync(path.dirname(cel), { recursive: true });
  if (p.endsWith('.html')) {
    const html = renderuj(p);
    fs.writeFileSync(cel, html);
    strony.push({ r, html });
  } else fs.copyFileSync(p, cel);
}

// assets (bez plików .md — to dokumentacja robocza) i static (do katalogu głównego)
const kopiuj = (zrodlo, cel) => {
  for (const p of pliki(zrodlo)) {
    if (p.endsWith('.md')) continue;
    const c = path.join(cel, path.relative(zrodlo, p));
    fs.mkdirSync(path.dirname(c), { recursive: true });
    fs.copyFileSync(p, c);
  }
};
kopiuj(path.join(SRC, 'assets'), path.join(DIST, 'assets'));
kopiuj(path.join(SRC, 'static'), DIST);

// ---------- strażnik złota: #B8975A nigdy jako kolor tekstu ani tło przycisku ----------
for (const p of pliki(path.join(SRC, 'assets', 'css'))) {
  if (!p.endsWith('.css')) continue;
  const css = fs.readFileSync(p, 'utf8');
  for (const m of css.matchAll(/(?<![-\w])color\s*:\s*(var\(--gold\)|#b8975a)/gi))
    blad(`${rel(p)}:${liniaZ(css, m.index)}: złoto użyte jako kolor tekstu („${m[0]}”) — tylko dekoracja`);
  for (const m of css.matchAll(/\.btn[^{]*\{[^}]*background(-color)?\s*:\s*(var\(--gold\)|#b8975a)/gi))
    blad(`${rel(p)}:${liniaZ(css, m.index)}: złoto jako tło przycisku — zabronione`);
}

// ---------- sitemap.xml ----------
const domena = (() => {
  try { return poleFirmy('domena', 'sitemap.xml').replace(/\/$/, ''); }
  catch (e) { blad(String(e)); return ''; }
})();
const doMapy = strony.filter(({ r, html }) =>
  !robocze(r) && r !== '404.html' && !/<meta\s+name=["']robots["'][^>]*noindex/i.test(html));
const urle = doMapy.map(({ r }) => {
  const sciezka = '/' + r.split(path.sep).join('/').replace(/index\.html$/, '');
  return `  <url><loc>${esc(domena + sciezka)}</loc></url>`;
});
fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urle.join('\n')}${urle.length ? '\n' : ''}</urlset>\n`);

// ---------- zdjęcia STOCK- ----------
const stocki = [...pliki(path.join(SRC, 'assets', 'img'))].filter((p) => path.basename(p).startsWith('STOCK-'));
if (PROD && stocki.length && !ZGODA_STOCK)
  blad(`pliki STOCK- w buildzie produkcyjnym: ${stocki.length} — dodaj --zgoda-stock tylko po świadomej decyzji Michała`);

// ---------- podsumowanie ----------
stop();
if (ostrzezenia.size) {
  console.warn(`\n⚠ Ostrzeżenia (${ostrzezenia.size}) — w --prod część z nich to błędy:`);
  for (const o of ostrzezenia) console.warn('  • ' + o);
}
console.log(`\n✔ Build ${PROD ? 'PRODUKCYJNY' : 'deweloperski'} OK → ${rel(DIST) || DIST}`);
console.log(`  strony: ${strony.length} · w sitemap: ${urle.length} · usługi w cenniku: ${uslugi.size}`);
const stockZdjecia = [...new Set(stocki.map((p) => path.basename(p).replace(/-\d+\.\w+$/, '')))];
console.log(`  STOCK: ${stockZdjecia.length} zdjęć (${stocki.length} plików)${stockZdjecia.length ? ' → ' + stockZdjecia.join(', ') : ''}\n`);
