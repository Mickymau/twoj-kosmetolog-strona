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
// --podglad: wersja testowa online (GitHub Pages) — jak produkcja w treści, ale pola ❓ dozwolone, całość noindex
const PODGLAD = flag('--podglad') && !PROD;
const PUBLICZNY = PROD || PODGLAD; // build trafiający do internetu: bez znaczników dev i stron roboczych
const ZGODA_STOCK = flag('--zgoda-stock');
// --baza=/nazwa-repo: strona pod podkatalogiem (GitHub Pages z repo projektowego) — prefiks dla ścieżek od „/”
const BAZA = opt('baza', '').replace(/\/+$/, '');
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
const NAZWY_PROBLEMOW = {
  tradzik: 'Trądzik i zaskórniki', przebarwienia: 'Przebarwienia', naczynka: 'Naczynka i zaczerwienienia',
  'cera-sucha': 'Cera sucha i odwodniona', 'starzenie-skory': 'Oznaki starzenia i jędrność',
  'owal-twarzy': 'Owal twarzy i szyja', 'okolica-oczu': 'Okolica oczu',
  'blizny-i-rozstepy': 'Blizny i rozstępy', cellulit: 'Cellulit i ciało',
};
const BLOKI_POZNIEJ = {};
// podstrony z PODSTRONY, które są zwykłymi plikami w src/pages (nie generowane z JSON)
const STRONY_STATYCZNE = ['depilacja-laserowa'];
const STATYCZNE_OPISY = {
  'depilacja-laserowa': { tytul: 'Depilacja laserowa', opis: 'Epilacja laserowa — 21 obszarów i pakietów, od twarzy po całe nogi.' },
};

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
const slub = wczytajJson('slub.json');
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

// opis usługi / wariantu: tablica bloków — tekst (akapit), {h}, {lista:[…]}, {link:{href,tekst}}
const reZakazane = /diagnoz|gwarant|wykry|wiek biologiczn|wylecz|usunie|bakteri(?!al)/i;
function walidujOpis(o, gdzie) {
  if (o.opis === undefined) return;
  if (!Array.isArray(o.opis) || !o.opis.length) return blad(`${gdzie}: „opis” musi być niepustą tablicą bloków`);
  if (!o.opisZrodlo) blad(`${gdzie}: opis wymaga pola „opisZrodlo” (źródło i status do akceptu Malwiny)`);
  const teksty = [];
  for (const [i, b] of o.opis.entries()) {
    const g = `${gdzie}: opis #${i + 1}`;
    if (typeof b === 'string') teksty.push(b);
    else if (b && typeof b.h === 'string') teksty.push(b.h);
    else if (b && Array.isArray(b.lista) && b.lista.length && b.lista.every((x) => typeof x === 'string')) teksty.push(...b.lista);
    else if (b && b.link && typeof b.link.href === 'string' && b.link.href.startsWith('/') && typeof b.link.tekst === 'string') teksty.push(b.link.tekst);
    else blad(`${g}: niepoprawny blok (tekst, {h}, {lista} albo {link:{href,tekst}})`);
  }
  const t = teksty.join(' ');
  const m = t.match(reZakazane);
  if (m) blad(`${gdzie}: opis zawiera zakazane sformułowanie „${m[0]}” (BRIEF sekcja 7)`);
  if (/[0-9]\s?zł/.test(t)) blad(`${gdzie}: w opisie nie wpisujemy cen — ceny tylko z pól „cena” (CLAUDE.md)`);
}

(function walidujCennik() {
  const G = 'src/data/cennik.json';
  if (!Array.isArray(cennik.grupy) || !cennik.grupy.length) blad(`${G}: brak listy „grupy”`);
  if (!Array.isArray(cennik.uslugi)) return blad(`${G}: brak tablicy „uslugi”`);

  for (const u of cennik.uslugi) {
    const g = `${G} [${u.id ?? '?'}]`;
    if (!u.id || !reId.test(u.id)) { blad(`${g}: niepoprawne „id”`); continue; }
    if (uslugi.has(u.id)) blad(`${g}: zduplikowane id`);
    uslugi.set(u.id, u);
    if (!u.nazwa) blad(`${g}: brak „nazwa”`);
    if ('kategoria' in u) blad(`${g}: pole „kategoria” nie istnieje — układ cennika jest w „grupy”`);
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
    walidujOpis(u, g);
    for (const w of u.warianty || []) walidujOpis(w, `${g}/${w.id}`);
    for (const d of u.dodatki || []) if (!d.nazwa || !Number.isInteger(d.cena)) blad(`${g}: dodatek wymaga „nazwa” i liczby „cena”`);
  }
  for (const s of PODSTRONY)
    if (![...uslugi.values()].some((u) => u.podstrona === s)) ostrzezenia.add(`cennik.json: podstrona „${s}” nie ma żadnej pozycji w cenniku`);

  // grupy pełnego cennika (układ jak na Booksy): pozycja = odwołanie do usługi / wariantu
  const grupyId = new Set(), wGrupach = new Set();
  for (const gr of cennik.grupy || []) {
    const gg = `${G} grupa [${gr.id ?? '?'}]`;
    if (!gr.id || !reId.test(gr.id)) { blad(`${gg}: niepoprawne „id”`); continue; }
    if (grupyId.has(gr.id)) blad(`${gg}: zduplikowane id grupy`);
    grupyId.add(gr.id);
    if (!gr.nazwa) blad(`${gg}: brak „nazwa”`);
    else if (/[%!]|\b\d{1,2}\.\d{1,2}\b/.test(gr.nazwa)) blad(`${gg}: nazwa grupy bez znaczników promocji i dat (% ! 05.12) — decyzja 2026-11-09`);
    if (!Array.isArray(gr.pozycje) || !gr.pozycje.length) { blad(`${gg}: pusta lista „pozycje”`); continue; }
    const ref = new Set();
    for (const p of gr.pozycje) {
      const gp = `${gg} ${p.ref ?? '?'}`;
      const [uid, wid, ...nadmiar] = String(p.ref).split('#');
      const u = uslugi.get(uid);
      if (!u || nadmiar.length) { blad(`${gp}: nieznana usługa w „ref”`); continue; }
      if (wid !== undefined ? !(u.warianty || []).some((w) => w.id === wid) : !!u.warianty) { blad(`${gp}: „ref” musi wskazywać wariant (usługa#wariant), gdy usługa ma warianty, i nie może go mieć, gdy nie ma`); continue; }
      if (ref.has(p.ref)) blad(`${gp}: pozycja powtórzona w grupie`);
      ref.add(p.ref);
      wGrupach.add(p.ref); wGrupach.add(uid);
      for (const k of Object.keys(p)) if (!['ref', 'cena', 'czas', 'pakiety'].includes(k)) blad(`${gp}: nieznane pole „${k}” (dozwolone: ref, cena, czas, pakiety)`);
      if ('cena' in p && (!Number.isInteger(p.cena) || p.cena <= 0)) blad(`${gp}: „cena” musi być dodatnią liczbą całkowitą`);
      if ('czas' in p && (!Number.isInteger(p.czas) || p.czas <= 0)) blad(`${gp}: „czas” musi być liczbą minut`);
      if ('pakiety' in p) {
        if (!Array.isArray(p.pakiety)) blad(`${gp}: „pakiety” musi być tablicą`);
        else for (const k of p.pakiety) if (!Number.isInteger(k.zabiegi) || !Number.isInteger(k.cena)) blad(`${gp}: pakiet wymaga liczb „zabiegi” i „cena”`);
      }
    }
  }
  for (const u of uslugi.values()) {
    if (u.pozaGrupami) continue;
    for (const w of u.warianty || [null])
      if (!wGrupach.has(w ? `${u.id}#${w.id}` : u.id)) ostrzezenia.add(`cennik.json: „${u.id}${w ? '#' + w.id : ''}” nie stoi w żadnej grupie pełnego cennika (jeśli celowo — pole „pozaGrupami”: true w usłudze)`);
  }
})();
stop();

// ---------- walidacja slub.json (pakiety ślubne, BRIEF 6.8) ----------
(function walidujSlub() {
  const G = 'src/data/slub.json';
  if (!slub) return;
  const teksty = [];
  const txt = (t, gdzie) => {
    if (typeof t !== 'string' || !t.trim()) { blad(`${G}: ${gdzie}: pusty tekst`); return; }
    teksty.push([gdzie, t]);
  };
  const lista = (a, gdzie) => {
    if (!Array.isArray(a) || !a.length) blad(`${G}: ${gdzie}: musi być niepustą tablicą`);
    else a.forEach((t, i) => txt(t, `${gdzie}[${i}]`));
  };
  const zabiegiLista = (a, gdzie) => {
    if (!Array.isArray(a) || !a.length) return blad(`${G}: ${gdzie}: brak listy zabiegów`);
    for (const [i, z] of a.entries()) {
      txt(z && z.nazwa, `${gdzie}[${i}].nazwa`);
      if (z && z.slug !== undefined && !PODSTRONY.includes(z.slug)) blad(`${G}: ${gdzie}[${i}]: nieznana podstrona „${z.slug}”`);
    }
  };
  if (!Array.isArray(slub.przywileje) || !slub.przywileje.some((p) => p.id === 'zabiegi')) blad(`${G}: „przywileje” musi zawierać pozycję o id „zabiegi”`);
  for (const p of slub.przywileje || []) {
    txt(p.usluga, `przywileje/${p.id}`);
    if (!Number.isInteger(p.rabat) || p.rabat < 1 || p.rabat > 50) blad(`${G}: przywileje/${p.id}: „rabat” musi być liczbą całkowitą 1–50 (procent)`);
  }
  lista(slub.wspolne, 'wspolne');
  if (!Array.isArray(slub.programy) || slub.programy.length !== 3) blad(`${G}: „programy” musi mieć 3 pozycje (Przemiana, Harmonia, Blask)`);
  const ids = new Set();
  for (const p of slub.programy || []) {
    const g = `programy/${p.id ?? '?'}`;
    if (!p.id || !reId.test(p.id) || ids.has(p.id)) blad(`${G}: ${g}: niepoprawne lub zduplikowane „id”`);
    ids.add(p.id);
    for (const k of ['nazwa', 'czas', 'czasKrotko', 'dlaKogo']) txt(p[k], `${g}.${k}`);
    zabiegiLista(p.zabiegi, `${g}.zabiegi`);
  }
  for (const k of ['panMlody', 'razem']) {
    const o = slub[k];
    if (!o) { blad(`${G}: brak sekcji „${k}”`); continue; }
    txt(o.nazwa, `${k}.nazwa`); txt(o.opis, `${k}.opis`); lista(o.zawiera, `${k}.zawiera`);
    if (o.zdjecie) {
      txt(o.zdjecie.alt, `${k}.zdjecie.alt`);
      for (const w of [480, 800, 1200]) if (!fs.existsSync(path.join(SRC, 'assets', 'img', `${o.zdjecie.plik}-${w}.webp`))) blad(`${G}: ${k}.zdjecie: brak pliku src/assets/img/${o.zdjecie.plik}-${w}.webp`);
    }
    if (o.zabiegi) zabiegiLista(o.zabiegi, `${k}.zabiegi`);
    if (o.plus) { txt(o.plus.nazwa, `${k}.plus.nazwa`); txt(o.plus.opis, `${k}.plus.opis`); }
  }
  txt(slub.zastrzezenieRabaty, 'zastrzezenieRabaty');
  lista((slub.wazne || []).filter((t) => t !== '@zastrzezenieRabaty'), 'wazne');
  for (const [gdzie, t] of teksty) {
    const m = t.match(reZakazane);
    if (m) blad(`${G}: ${gdzie}: zakazane sformułowanie „${m[0]}” (BRIEF sekcja 7)`);
    if (/[0-9]\s?zł/.test(t)) blad(`${G}: ${gdzie}: cen programów ślubnych nie publikujemy („do ustalenia” w źródle)`);
    if (/\{(?!rabat\})/.test(t)) blad(`${G}: ${gdzie}: nieznany znacznik w nawiasach klamrowych`);
  }
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
  return renderujKod(fs.readFileSync(plik, 'utf8'), rel(plik), [...stos, plik]);
}

function renderujKod(kod, nazwa, stos = []) {
  const wynik = kod.replace(reZnacznik, (cale, include, znacznik, idx) => {
    const kto = `${nazwa}:${liniaZ(kod, idx)}`;
    try {
      if (include !== undefined) {
        if (!/^[a-z0-9-]+$/.test(include)) throw `${kto}: niepoprawna nazwa partiala „${include}”`;
        const p = path.join(SRC, 'partials', include + '.html');
        if (!fs.existsSync(p)) throw `${kto}: brak partiala „${include}” (src/partials/${include}.html)`;
        if (stos.includes(p)) throw `${kto}: zapętlony include „${include}”`;
        return renderuj(p, stos).replace(/\n$/, '');
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

// ======================================================================
// TREŚCI: zabiegi (src/data/zabiegi/*.json) i problemy (src/data/problemy.json)
// ======================================================================
const zabiegi = new Map();
for (const p of pliki(path.join(SRC, 'data', 'zabiegi'))) {
  if (!p.endsWith('.json')) continue;
  let z;
  try { z = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { blad(`${rel(p)}: ${e.message}`); continue; }
  const g = rel(p);
  if (path.basename(p, '.json') !== z.slug) blad(`${g}: nazwa pliku musi być równa „slug”`);
  if (!PODSTRONY.includes(z.slug)) blad(`${g}: slug „${z.slug}” spoza listy podstron (BRIEF 5)`);
  for (const pole of ['nazwa', 'podtytul', 'glownaUsluga', 'naCzymPolega', 'dlaKogo', 'efekty'])
    if (!z[pole] || (Array.isArray(z[pole]) && !z[pole].length)) blad(`${g}: brak wymaganej sekcji „${pole}” (BRIEF 6.1)`);
  for (const pole of ['przebieg', 'przeciwwskazania', 'poZabiegu', 'seria', 'faq', 'meta'])
    if (!z[pole]) ostrzezenia.add(`${g}: brak sekcji „${pole}” — nie wyrenderuje się`);
  if (z.glownaUsluga && !uslugi.has(z.glownaUsluga.split('/')[0])) blad(`${g}: nieznana glownaUsluga „${z.glownaUsluga}”`);
  if (![...uslugi.values()].some((u) => u.podstrona === z.slug)) blad(`${g}: żadna usługa w cenniku nie wskazuje podstrony „${z.slug}”`);
  for (const w of z.warstwy || []) if (!['naskorek', 'skora-wlasciwa', 'tkanka-podskorna'].includes(w)) blad(`${g}: nieznana warstwa „${w}”`);
  zabiegi.set(z.slug, z);
}
const problemyDane = fs.existsSync(path.join(SRC, 'data', 'problemy.json')) ? wczytajJson('problemy.json') : null;
stop();

// --- pozycje cennika (usługa / wariant) ---
function pozycje(u) {
  const booksy = (w) => (w && w.booksyUrl) || u.booksyUrl || poleFirmy('booksy', 'cennik');
  return (u.warianty || [null]).map((w) => {
    const o = w || u;
    const zw = zweryfikowano(u, w);
    return {
      u, w, nazwa: o.nazwa, cena: o.cena, od: !!o.od, czas: o.czas, pakiety: o.pakiety || [],
      booksy: booksy(w), niepewna: zw === null || !!(o.doWyjasnienia || u.doWyjasnienia), uwagi: o.uwagi,
    };
  });
}
// w --prod pozycje niezweryfikowane nie trafiają do list ani tabel (lista w podsumowaniu builda)
const pominiete = new Set();
const widoczne = (lista) => lista.filter((p) => {
  if (PUBLICZNY && p.niepewna) { pominiete.add(`${p.u.id}${p.w ? '/' + p.w.id : ''}`); return false; }
  return true;
});
const devUwaga = (p) => (!PUBLICZNY && p.niepewna)
  ? ` <span class="dev-uwaga" title="${esc(p.uwagi || 'Cena niezweryfikowana w Booksy — w buildzie produkcyjnym ukryta')}">❓ do weryfikacji</span>` : '';
const cenaTxt = (lista) => {
  if (!lista.length) return '';
  const min = Math.min(...lista.map((p) => p.cena));
  return (lista.length > 1 || lista.some((p) => p.od) ? 'od ' : '') + fmtZl(min);
};
const czasTxt = (lista) => {
  const c = lista.map((p) => p.czas).filter((x) => x !== null && x !== undefined);
  if (!c.length) return '';
  const a = Math.min(...c), b = Math.max(...c);
  return a === b ? fmtMin(a) : `${fmtMin(a)} – ${fmtMin(b)}`;
};
const linkZabiegu = (slug) => `/zabiegi/${slug}/`;
const uslugiPodstrony = (slug) => [...uslugi.values()].filter((u) => u.podstrona === slug);
const problemyPodstrony = (slug) => [...new Set(uslugiPodstrony(slug).flatMap((u) => u.problemy))];

// --- opis pozycji cennika: rozwijany blok „Co obejmuje” (tylko usługi bez własnej podstrony) ---
function opisHtml(opis) {
  const html = opis.map((b) => {
    if (typeof b === 'string') return `<p>${esc(b)}</p>`;
    if (b.h !== undefined) return `<p class="cennik__opis-h">${esc(b.h)}</p>`;
    if (b.lista) return `<ul>${b.lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    return `<p><a href="${esc(b.link.href)}">${esc(b.link.tekst)}</a></p>`;
  }).join('');
  return `<details class="cennik__opis"><summary>Co obejmuje</summary><div class="cennik__opis-tresc">${html}</div></details>`;
}

// --- tabela cennika (podstrona zabiegu i /zabiegi/) ---
function tabelaCennika(lista, { linkuj = false, pokazKat = false } = {}) {
  const zCzasem = lista.some((p) => p.czas);
  const opisPokazany = new Set();
  const wiersze = lista.map((p) => {
    let opis = '';
    if (linkuj && !p.u.podstrona) {
      if (p.w && p.w.opis) opis = opisHtml(p.w.opis);
      else if (p.u.opis && !opisPokazany.has(p.u.id)) { opis = opisHtml(p.u.opis); opisPokazany.add(p.u.id); }
    }
    const nazwa = linkuj && p.u.podstrona && (zabiegi.has(p.u.podstrona) || STRONY_STATYCZNE.includes(p.u.podstrona))
      ? `<a href="${linkZabiegu(p.u.podstrona)}">${esc(p.nazwa)}</a>` : esc(p.nazwa);
    const pakiety = p.pakiety.length
      ? `<span class="cennik__pakiety">${p.pakiety.map((k) => `pakiet ${k.zabiegi} zabiegów: ${esc(fmtZl(k.cena))}`).join(' · ')}</span>` : '';
    return `<tr><th scope="row">${nazwa}${devUwaga(p)}${pakiety}${opis}</th>`
      + (zCzasem ? `<td class="cennik__czas">${esc(p.czas ? fmtMin(p.czas) : '')}</td>` : '')
      + `<td class="cennik__cena">${esc((p.od ? 'od ' : '') + fmtZl(p.cena))}</td>`
      + `<td class="cennik__umow"><a class="btn btn--maly btn--kontur" href="${esc(p.booksy)}" rel="noopener" data-umow="cennik-${esc(p.u.id)}">Umów<span class="sr-only"> — ${esc(p.nazwa)}</span></a></td></tr>`;
  });
  const dodatki = [...new Set(lista.flatMap((p) => (p.w ? [] : []).concat(p.u.dodatki || [])
    .map((d) => `${d.nazwa}: +${fmtZl(d.cena)}`)))];
  return `<div class="cennik-tabela"><table class="cennik"><thead><tr><th scope="col">Usługa</th>${zCzasem ? '<th scope="col">Czas</th>' : ''}<th scope="col">Cena</th><th scope="col"><span class="sr-only">Rezerwacja</span></th></tr></thead><tbody>${wiersze.join('')}</tbody></table>`
    + (dodatki.length ? `<p class="cennik__dodatki">Dodatkowo: ${esc(dodatki.join(' · '))}</p>` : '') + '</div>';
}

// --- karta zabiegu / usługi (listy na stronach problemów, „Zobacz też”) ---
function kartaZabiegu({ tytul, href, lista, zewn, opis }) {
  const cena = cenaTxt(lista), czas = czasTxt(lista);
  return `<li><a class="karta-zabiegu" href="${esc(href)}"${zewn ? ' rel="noopener" data-umow="lista"' : ''}>`
    + `<h3>${esc(tytul)}</h3>${opis ? `<p>${esc(opis)}</p>` : ''}`
    + `<p class="karta-zabiegu__cena">${esc(cena)}${czas ? ` <span>· ${esc(czas)}</span>` : ''}${lista.some((p) => p.niepewna) && !PUBLICZNY ? ' <span class="dev-uwaga">❓</span>' : ''}</p>`
    + `<span class="link-strzalka">${zewn ? 'Umów w Booksy' : 'Zobacz zabieg'}</span></a></li>`;
}

function kartyDlaProblemu(problem) {
  const karty = [], uzyte = new Set();
  for (const u of uslugi.values()) {
    if (!u.problemy.includes(problem)) continue;
    if (u.podstrona && zabiegi.has(u.podstrona)) {
      if (uzyte.has(u.podstrona)) continue;
      uzyte.add(u.podstrona);
      const lista = widoczne(uslugiPodstrony(u.podstrona).flatMap(pozycje));
      if (lista.length) karty.push({ tytul: zabiegi.get(u.podstrona).nazwa, href: linkZabiegu(u.podstrona), lista, opis: zabiegi.get(u.podstrona).podtytul });
    } else {
      const lista = widoczne(pozycje(u));
      if (lista.length) karty.push({ tytul: u.nazwa, href: lista[0].booksy, lista, zewn: true });
    }
  }
  return karty;
}

// --- pakiety ślubne (BRIEF 6.8): bloki z slub.json ---
const slubRabat = () => slub.przywileje.find((p) => p.id === 'zabiegi').rabat;
const slubT = (t) => esc(t.replace('{rabat}', String(slubRabat())));
const slubChipy = (zab) => `<ul class="chipy chipy--male slub-zabiegi">${zab.map((z) => (z.slug
  ? `<li><a class="chip" href="${linkZabiegu(z.slug)}">${esc(z.nazwa)}</a></li>`
  : `<li><span class="chip chip--tekst">${esc(z.nazwa)}</span></li>`)).join('')}</ul>`;
const slubObraczki = '<svg class="obraczki" viewBox="0 0 120 72" width="60" height="36" aria-hidden="true" focusable="false"><circle cx="44" cy="36" r="26"/><circle cx="76" cy="36" r="26"/></svg>';
const slubFoto = (z) => (z ? `<img class="slub-karta__foto" src="/assets/img/${z.plik}-800.webp" srcset="${[480, 800, 1200].map((w) => `/assets/img/${z.plik}-${w}.webp ${w}w`).join(', ')}" sizes="(min-width: 900px) 580px, 100vw" width="800" height="600" alt="${esc(z.alt)}" loading="lazy">` : '');
const slubKarta = (o, nadtytul, plus) => `<article class="karta slub-karta">
  ${slubFoto(o.zdjecie)}
  <span class="nadtytul">${esc(nadtytul)}</span>
  <h3>${esc(o.nazwa)}</h3>
  <p>${esc(o.opis)}</p>
  <ul class="lista-ptaszki">${o.zawiera.map((t) => `<li>${slubT(t)}</li>`).join('')}</ul>
  ${o.zabiegi ? `<p class="slub-etykieta">Przykładowe zabiegi</p>${slubChipy(o.zabiegi)}` : ''}
  ${plus ? `<div class="slub-plus"><strong>${esc(plus.nazwa)}</strong><p>${esc(plus.opis)}</p></div>` : ''}
  <a class="btn btn--kontur" href="/kontakt/#formularz" data-umow="slub-${esc(nadtytul.toLowerCase().replace(/\s+/g, '-'))}">Napisz do mnie</a>
</article>`;
Object.assign(ZNACZNIKI, {
  'slub-rabat': () => String(slubRabat()),
  'slub-programy'() {
    return `<ol class="slub-programy" aria-label="Programy ślubne według czasu do ślubu">${slub.programy.map((p) => `
<li class="slub-programy__poz"><span class="slub-programy__czas">${esc(p.czas)}</span>
<article class="karta slub-program" data-slub-program="${esc(p.id)}" aria-labelledby="sp-${esc(p.id)}">
<span class="etykieta slub-program__polecany">Dla Ciebie</span>
<h3 id="sp-${esc(p.id)}">${esc(p.nazwa)}</h3>
<p>${esc(p.dlaKogo)}</p>
<p class="slub-etykieta">Przykładowe zabiegi</p>${slubChipy(p.zabiegi)}
</article></li>`).join('')}
<li class="slub-slub" aria-hidden="true">${slubObraczki}<span>Dzień ślubu</span></li></ol>`;
  },
  'slub-wspolne'() {
    return `<ul class="lista-ptaszki">${slub.wspolne.map((t) => `<li>${slubT(t)}</li>`).join('')}</ul>`;
  },
  'slub-pozostale'() {
    return `<div class="slub-duet">${slubKarta(slub.panMlody, 'Dla Niego', slub.panMlody.plus)}${slubKarta(slub.razem, 'Dla Was')}</div>`;
  },
  'slub-przywileje'() {
    return `<div class="slub-kupon">
<div class="slub-kupon__glowa">${slubObraczki}<h3>Rabaty w programie ślubnym</h3></div>
<ul class="slub-kupon__lista">${slub.przywileje.map((p) => `<li><span class="slub-kupon__rabat" aria-hidden="true">−${p.rabat}%</span><span class="slub-kupon__usluga"><span class="sr-only">Rabat ${p.rabat}%: </span>${esc(p.usluga)}</span></li>`).join('')}</ul>
<p class="slub-kupon__uwaga">${esc(slub.zastrzezenieRabaty)}</p>
</div>`;
  },
  'slub-wazne'() {
    const poz = slub.wazne.map((t) => (t === '@zastrzezenieRabaty' ? slub.zastrzezenieRabaty : t));
    return `<ul class="lista-kropki">${poz.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  },
});

// --- znaczniki blokowe ---
Object.assign(ZNACZNIKI, {
  cennik(arg, kto) {
    if (arg) throw `${kto}: {{cennik}} nie przyjmuje argumentu`;
    // grupy jak na Booksy: pozycja grupy odwołuje się do usługi/wariantu; nadpisania tylko tam, gdzie Booksy pokazuje inną wartość
    return cennik.grupy.map((k) => {
      const lista = widoczne(k.pozycje.map((gp) => {
        const [uid, wid] = gp.ref.split('#');
        const p = pozycje(uslugi.get(uid)).find((x) => (x.w ? x.w.id : undefined) === wid);
        const { ref, ...nadpisania } = gp;
        return { ...p, ...nadpisania };
      }));
      if (!lista.length) return '';
      return `<section class="cennik-grupa" id="cennik-${k.id}" aria-labelledby="cg-${k.id}"><h3 id="cg-${k.id}">${esc(k.nazwa)}</h3>${tabelaCennika(lista, { linkuj: true })}</section>`;
    }).join('\n');
  },
  'lista-zabiegow'(arg, kto) {
    if (!PROBLEMY.includes(arg)) throw `${kto}: {{lista-zabiegow:…}} — nieznany problem „${arg}”`;
    const karty = kartyDlaProblemu(arg);
    if (!karty.length) throw `${kto}: brak zabiegów dla problemu „${arg}”`;
    return `<ul class="karty-zabiegow" role="list">${karty.map(kartaZabiegu).join('')}</ul>`;
  },
  // lista A–Z wszystkich podstron zabiegów z atrybutem do filtra po problemie (/zabiegi/)
  'zabiegi-az'(arg, kto) {
    if (arg) throw `${kto}: {{zabiegi-az}} nie przyjmuje argumentu`;
    // zabiegi z JSON + podstrony statyczne (depilacja laserowa — bez tagów problemów, BRIEF 5)
    const wpisy = [...zabiegi.values()].map((z) => ({ slug: z.slug, tytul: z.nazwa, opis: z.podtytul }))
      .concat(STRONY_STATYCZNE.map((slug) => ({ slug, ...STATYCZNE_OPISY[slug] })));
    const karty = wpisy.sort((a, b) => a.tytul.localeCompare(b.tytul, 'pl'))
      .map((w) => ({ w, lista: widoczne(uslugiPodstrony(w.slug).flatMap(pozycje)) })).filter((x) => x.lista.length)
      .map(({ w, lista }) => kartaZabiegu({ tytul: w.tytul, href: linkZabiegu(w.slug), opis: w.opis, lista })
        .replace('<li>', `<li data-problemy="${problemyPodstrony(w.slug).join(' ')}">`));
    return `<ul class="karty-zabiegow" role="list" data-filtrowane>${karty.join('')}</ul>`;
  },
  'zobacz-tez'(arg, kto) {
    if (!zabiegi.has(arg)) throw `${kto}: {{zobacz-tez:…}} — nieznany zabieg „${arg}”`;
    const moje = problemyPodstrony(arg);
    const inne = [...zabiegi.keys()].filter((s) => s !== arg)
      .map((s) => ({ s, wspolne: problemyPodstrony(s).filter((p) => moje.includes(p)).length }))
      .filter((x) => x.wspolne).sort((a, b) => b.wspolne - a.wspolne).slice(0, 6);
    const karty = inne.map(({ s }) => ({ tytul: zabiegi.get(s).nazwa, href: linkZabiegu(s), opis: zabiegi.get(s).podtytul, lista: widoczne(uslugiPodstrony(s).flatMap(pozycje)) }))
      .filter((k) => k.lista.length);
    return karty.length ? `<ul class="karty-zabiegow" role="list">${karty.map(kartaZabiegu).join('')}</ul>` : '';
  },
});

// --- mapa ciała (wizualizacja 5) ---
const mapaDane = fs.existsSync(path.join(SRC, 'data', 'mapa-ciala.json')) ? wczytajJson('mapa-ciala.json') : {};
const OBSZARY = { twarz: 'Twarz', pachy: 'Pachy', ramiona: 'Ramiona', klatka: 'Klatka piersiowa', brzuch: 'Brzuch i boczki', bikini: 'Bikini', plecy: 'Plecy', posladki: 'Pośladki', uda: 'Uda', lydki: 'Łydki i kolana' };
function sylwetka(strona) {
  const o = (id, ksztalt) => OBSZARY[id] ? `<g class="mapa__obszar" data-obszar="${id}" tabindex="0" role="button" aria-label="${OBSZARY[id]}">${ksztalt}</g>` : ksztalt;
  const glowa = '<ellipse cx="100" cy="38" rx="20" ry="25"/>';
  const szyja = '<path class="mapa__tlo" d="M92 60h16v14H92z"/>';
  const rece = '<path d="M70 82c-12 4-16 14-18 30l-6 70c-1 8 8 10 10 2l12-62z"/><path d="M130 82c12 4 16 14 18 30l6 70c1 8-8 10-10 2l-12-62z"/>';
  const uda = '<path d="M76 196h23l-3 92H80z"/><path d="M101 196h23l-4 92h-16z"/>';
  const lydki = '<path d="M80 292h16l-2 90h-12z"/><path d="M104 292h16l-2 90h-12z"/>';
  if (strona === 'przod') return `<svg viewBox="30 0 140 400" class="mapa__svg" aria-hidden="false" role="group" aria-label="Przód sylwetki">
${o('twarz', glowa)}${szyja}${o('ramiona', rece)}
${o('klatka', '<path d="M72 78h56l-3 56H75z"/>')}${o('pachy', '<ellipse cx="73" cy="96" rx="6" ry="9"/><ellipse cx="127" cy="96" rx="6" ry="9"/>')}
${o('brzuch', '<path d="M75 136h50l-1 50H76z"/>')}${o('bikini', '<path d="M76 188h48l-14 22h-20z"/>')}
${o('uda', uda)}${o('lydki', lydki)}</svg>`;
  return `<svg viewBox="30 0 140 400" class="mapa__svg" role="group" aria-label="Tył sylwetki">
<g class="mapa__tlo">${glowa}</g>${szyja}${o('ramiona', rece)}
${o('plecy', '<path d="M72 78h56l-2 108H74z"/>')}${o('posladki', '<path d="M75 188h50l-2 26H77z"/>')}
${o('uda', uda.replace(/196/g, '216'))}${o('lydki', lydki)}</svg>`;
}
ZNACZNIKI['mapa-ciala'] = (arg, kto) => {
  const u = uslugi.get(arg);
  if (!u || !u.warianty) throw `${kto}: {{mapa-ciala:…}} — usługa „${arg}” nie istnieje albo nie ma wariantów`;
  const map = mapaDane[arg];
  if (!map) throw `${kto}: brak przypisań obszarów dla „${arg}” w mapa-ciala.json`;
  for (const w of u.warianty) if (!map[w.id]) blad(`mapa-ciala.json: „${arg}/${w.id}” nie ma przypisanych obszarów`);
  const lista = widoczne(pozycje(u));
  const tabela = tabelaCennika(lista).replace(/<tr><th scope="row">/g, () => '<tr data-obszary="__"><th scope="row">');
  let i = 0;
  const tabelaZObszarami = tabela.replace(/data-obszary="__"/g, () => `data-obszary="${(map[lista[i++].w.id] || []).join(' ')}"`);
  return `<div class="mapa" data-mapa><div class="mapa__sylwetki"><figure>${sylwetka('przod')}<figcaption>Przód</figcaption></figure><figure>${sylwetka('tyl')}<figcaption>Tył</figcaption></figure>
<p class="tekst-maly mapa__podpowiedz">Wskaż obszar, żeby zobaczyć jego ceny.</p></div><div class="mapa__cennik">${tabelaZObszarami}</div></div>`;
};

// --- ikony liniowe kroków (wizualizacja 6) ---
const IKONY = {
  konsultacja: '<path d="M4 5h16v10H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  oczyszczanie: '<path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  peeling: '<path d="M4 8l8-4 8 4-8 4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/>',
  znieczulenie: '<rect x="8" y="3" width="8" height="5" rx="1"/><path d="M7 8h10l-1 13H8z"/>',
  dezynfekcja: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
  igla: '<path d="M14 4l6 6"/><path d="M17 7L8 16l-3 1 1-3 9-9"/><path d="M5 19l-2 2"/><path d="M11 9l4 4"/>',
  kropla: '<path d="M9 3h6"/><path d="M12 3v4"/><rect x="9" y="7" width="6" height="7" rx="1"/><path d="M12 14v3"/><path d="M12 20.5a1 1 0 1 0 0-.01"/>',
  urzadzenie: '<rect x="7" y="3" width="10" height="13" rx="2"/><path d="M12 16v5"/><path d="M10 7h4M10 10h4"/>',
  maska: '<path d="M12 3c4 0 7 3 7 8 0 5-3 10-7 10s-7-5-7-10c0-5 3-8 7-8z"/><path d="M9 10h.01M15 10h.01M10 15c1.2.8 2.8.8 4 0"/>',
  masaz: '<path d="M7 11V5a1.5 1.5 0 0 1 3 0v5"/><path d="M10 10V4a1.5 1.5 0 0 1 3 0v6"/><path d="M13 10V5a1.5 1.5 0 0 1 3 0v6"/><path d="M16 11V8a1.5 1.5 0 0 1 3 0v5a8 8 0 0 1-8 8h-1a6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.5-1.5L7 14"/>',
  pielegnacja: '<path d="M7 9h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M8 9V6h8v3"/><path d="M10 14h4"/>',
  slonce: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  zalecenia: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  punkt: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>',
};
const SLOWA_IKON = [
  [/konsult|wywiad|kwalifik|ocen/i, 'konsultacja'], [/dezynfek/i, 'dezynfekcja'], [/znieczul/i, 'znieczulenie'],
  [/demakij|oczyszcz|mycie|ozon|ekstrakc/i, 'oczyszczanie'], [/peeling|kwas|złuszcz|eksfol/i, 'peeling'],
  [/mikronak|dermapen|nakłu|iniekc|igł|co₂|co2|dwutlen|mezoterap|podani/i, 'igla'],
  [/kawitac|oxybraz|tripollar|geneo|sonofor|infuzj|urządzen|głowic/i, 'urzadzenie'],
  [/mask/i, 'maska'], [/masaż/i, 'masaz'], [/serum|ampuł|koktajl|preparat|aplikac/i, 'kropla'],
  [/spf|słońc|przeciwsłon/i, 'slonce'], [/krem|pielęgnac|zalec/i, 'pielegnacja'],
];
const ikona = (nazwa) => `<svg class="ikona" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${IKONY[nazwa] || IKONY.punkt}</svg>`;
const ikonaDla = (tekst) => (SLOWA_IKON.find(([re]) => re.test(tekst)) || [null, 'punkt'])[1];

// --- przekrój skóry (wizualizacja 4) — schemat poglądowy, ❓ do akceptacji Malwiny ---
function przekrojSkory(warstwy = []) {
  const W = { naskorek: 'Naskórek', 'skora-wlasciwa': 'Skóra właściwa', 'tkanka-podskorna': 'Tkanka podskórna' };
  const akt = (w) => warstwy.includes(w) ? ' aktywna' : '';
  const komorki = Array.from({ length: 9 }, (_, i) => `<ellipse cx="${30 + i * 30}" cy="${178 + (i % 2) * 14}" rx="13" ry="10"/>`).join('');
  const wlokna = Array.from({ length: 6 }, (_, i) => `<path d="M${14 + i * 46} ${70 + (i % 3) * 18}c14-10 22 10 36 0"/>`).join('');
  return `<figure class="przekroj">
<svg viewBox="0 0 300 220" role="img" aria-label="Schemat przekroju skóry. Zabieg działa w warstwie: ${esc(warstwy.map((w) => W[w]).join(', '))}">
<path class="przekroj__warstwa przekroj__warstwa--tp${akt('tkanka-podskorna')}" d="M0 150h300v70H0z"/>
<g class="przekroj__komorki${akt('tkanka-podskorna')}">${komorki}</g>
<path class="przekroj__warstwa przekroj__warstwa--sw${akt('skora-wlasciwa')}" d="M0 46c50-6 100 6 150 0s100-6 150 0v104H0z"/>
<g class="przekroj__wlokna${akt('skora-wlasciwa')}">${wlokna}</g>
<path class="przekroj__warstwa przekroj__warstwa--n${akt('naskorek')}" d="M0 22c50-8 100 8 150 0s100-8 150 0v24c-50-6-100 6-150 0S50 40 0 46z"/>
</svg>
<ul class="przekroj__legenda" role="list">${Object.entries(W).map(([k, v]) => `<li class="${warstwy.includes(k) ? 'aktywna' : ''}"><span></span>${v}${warstwy.includes(k) ? ' <strong>— tu działa zabieg</strong>' : ''}</li>`).join('')}</ul>
<figcaption>Schemat poglądowy.</figcaption>
</figure>`;
}

// --- oś czasu serii (wizualizacja 3) ---
function osCzasu(seria) {
  if (!seria.zabiegi) return '';
  const kropki = Array.from({ length: seria.zabiegi }, (_, i) => `<li><span class="os__znak" aria-hidden="true">${i + 1}</span><span class="os__opis">${i === 0 ? 'Zabieg 1' : `Zabieg ${i + 1}${seria.odstep ? `<small>${esc(seria.odstep)}</small>` : ''}`}</span></li>`).join('');
  const ocena = seria.ocena ? `<li class="os__ocena"><span class="os__znak" aria-hidden="true">✓</span><span class="os__opis">Ocena efektu<small>${esc(seria.ocena)}</small></span></li>` : '';
  return `<ol class="os" aria-label="Seria: ${seria.zabiegi} zabiegi">${kropki}${ocena}</ol>`;
}

// --- pomocnicze: akapity, listy (płaskie lub w grupach) ---
const akapity = (a) => (Array.isArray(a) ? a : [a]).map((t) => `<p>${t}</p>`).join('');
function lista(dane, klasa = 'lista-ptaszki') {
  if (!dane || !dane.length) return '';
  if (typeof dane[0] === 'object' && dane[0].grupa)
    return dane.map((g) => `<h3 class="lista-grupa">${esc(g.grupa)}</h3>${lista(g.lista, klasa)}`).join('');
  return `<ul class="${klasa}">${dane.map((t) => `<li>${t}</li>`).join('')}</ul>`;
}
const uwaga = (t) => t ? `<p class="tekst-maly uwaga-zrodla">${t}</p>` : '';
const sekcjaTlo = (() => { let i = 0; return (reset) => { if (reset) { i = 0; return ''; } return (i++ % 2) ? ' sekcja--krem' : ''; }; })();

// --- STRONA ZABIEGU (BRIEF 6.1 — stały układ) ---
function stronaZabiegu(z) {
  const problemy = problemyPodstrony(z.slug);
  const listaCen = widoczne(uslugiPodstrony(z.slug).flatMap(pozycje));
  const [gId] = z.glownaUsluga.split('/');
  sekcjaTlo(true);
  sekcjaTlo(); // nagłówek = białe tło
  const s = [];
  const sekcja = (id, tytul, wnetrze, nadtytul) =>
    `<section class="sekcja${sekcjaTlo()}" id="${id}" aria-labelledby="${id}-t"><div class="kontener">`
    + `<div class="sekcja__glowa">${nadtytul ? `<span class="nadtytul">${nadtytul}</span>` : ''}<h2 id="${id}-t">${tytul}</h2></div>${wnetrze}</div></section>`;

  // 1. nagłówek
  s.push(`<section class="naglowek-strony naglowek-zabiegu" data-hero aria-labelledby="z-tytul"><div class="kontener">
<nav class="okruszki" aria-label="Okruszki"><ol><li><a href="/">Strona główna</a></li><li><a href="/zabiegi/">Zabiegi</a></li><li aria-current="page">${z.nazwa}</li></ol></nav>
<ul class="chipy chipy--male" aria-label="Problemy skóry">${problemy.map((p) => `<li><a class="chip" href="/problemy-skory/${p}/">${NAZWY_PROBLEMOW[p]}</a></li>`).join('')}</ul>
<h1 id="z-tytul">${z.nazwa}</h1>
<p class="lead">${z.podtytul}</p>
<p class="naglowek-zabiegu__cena"><strong>{{cena:${z.glownaUsluga}}}</strong> <span>· {{czas:${z.glownaUsluga}}}</span></p>
<div class="przyciski"><a class="btn" href="{{booksy:${z.glownaUsluga}}}" rel="noopener" data-umow="zabieg-${z.slug}">Umów w Booksy</a><a class="btn btn--kontur" href="#cennik">Cennik wariantów</a></div>
</div></section>`);

  // 2. na czym polega + przekrój
  s.push(sekcja('na-czym-polega', 'Na czym polega zabieg',
    `<div class="duet duet--start"><div class="tresc">${akapity(z.naCzymPolega)}${z.sklad ? `<h3 class="lista-grupa">${esc(z.sklad.tytul)}</h3>${lista(z.sklad.lista, 'lista-kropki')}${z.sklad.uwaga ? `<p>${z.sklad.uwaga}</p>` : ''}` : ''}</div>${z.warstwy ? przekrojSkory(z.warstwy) : ''}</div>`));
  // 3. dla kogo
  s.push(sekcja('dla-kogo', 'Dla kogo', (z.dlaKogoWstep ? `<p class="lead" style="margin-bottom:var(--s-5)">${z.dlaKogoWstep}</p>` : '') + lista(z.dlaKogo) + uwaga(z.dlaKogoUwaga)));
  // 4. efekty
  s.push(sekcja('efekty', 'Efekty', lista(z.efekty) + (z.zastrzezenie ? `<p class="zastrzezenie">${z.zastrzezenie}</p>` : '')));
  // 5. przebieg
  if (z.przebieg) s.push(sekcja('przebieg', 'Przebieg zabiegu',
    `<ol class="kroki" role="list">${z.przebieg.map((k, i) => `<li><span class="kroki__ikona">${ikona(ikonaDla(k))}</span><span class="kroki__nr">${i + 1}</span><p>${k}</p></li>`).join('')}</ol>` + uwaga(z.przebiegUwaga)));
  // 6. seria
  if (z.seria) s.push(sekcja('seria', 'Seria i częstotliwość', osCzasu(z.seria) + akapity(z.seria.tekst)));
  // 7. cennik
  s.push(sekcja('cennik', 'Cennik', z.mapaCiala ? `{{mapa-ciala:${gId}}}` : (listaCen.length ? tabelaCennika(listaCen) : '') + `<p class="tekst-maly">Aktualne ceny i wolne terminy sprawdzisz w Booksy.</p>`, 'Warianty i ceny'));
  // 8–10. akordeony
  const akord = (id, tytul, wnetrze) => `<details id="${id}"><summary>${tytul}</summary><div class="akordeon__tresc">${wnetrze}</div></details>`;
  const tekstLubLista = (x) => (typeof x === 'string' ? akapity(x) : lista(x, 'lista-kropki'));
  const ak = [];
  if (z.przeciwwskazania) ak.push(akord('przeciwwskazania', 'Przeciwwskazania', tekstLubLista(z.przeciwwskazania) + uwaga(z.przeciwwskazaniaUwaga)));
  if (z.poZabiegu) ak.push(akord('po-zabiegu', 'Po zabiegu', tekstLubLista(z.poZabiegu) + uwaga(z.poZabieguUwaga)));
  if (ak.length) s.push(sekcja('bezpieczenstwo', z.przeciwwskazania && z.poZabiegu ? 'Przeciwwskazania i zalecenia' : z.przeciwwskazania ? 'Przeciwwskazania' : 'Po zabiegu', `<div class="akordeon">${ak.join('')}</div>`));
  if (z.faq && z.faq.length)
    s.push(sekcja('faq', 'Najczęstsze pytania', `<!-- [N:claude-draft] FAQ wyłącznie z faktów źródła — do akceptacji Malwiny -->`
      + `<div class="akordeon" data-faq>${z.faq.map((f) => `<details><summary>${f.p}</summary><div class="akordeon__tresc"><p>${f.o}</p></div></details>`).join('')}</div>`));
  // 11. terapie łączone
  if (z.laczone) s.push(sekcja('laczone', z.laczone.tytul || 'Chcesz rozszerzyć terapię?', akapity(z.laczone.tekst || []) + lista(z.laczone.lista)));
  if (z.przypisy) s.push(sekcja('zrodla', 'Źródła', `<ol class="przypisy">${z.przypisy.map((p) => `<li>${p}</li>`).join('')}</ol>`));
  // 12. nie wiesz?
  s.push(`<section class="sekcja${sekcjaTlo()}" aria-labelledby="niewiesz-t"><div class="kontener"><div class="baner-diagnostyka">
<div><h2 id="niewiesz-t">${z.diagnostyka?.tytul || 'Nie wiesz, czy to zabieg dla Ciebie?'}</h2>
${z.diagnostyka ? akapity(z.diagnostyka.tekst) : '<p>Przed każdym zabiegiem oceniam skórę i wykluczam przeciwwskazania. Jeśli chcesz najpierw dokładnie poznać swoją skórę, zacznij od diagnostyki Lumiscan™ — albo umów konsultację kosmetologiczną ({{cena:konsultacja}}).</p>'}</div>
<div class="przyciski"><a class="btn" href="/diagnostyka-skory/">Poznaj diagnostykę</a><a class="btn btn--kontur" href="{{booksy:konsultacja}}" rel="noopener" data-umow="zabieg-${z.slug}-konsultacja">Umów konsultację</a></div>
</div></div></section>`);
  // 13. zobacz też
  s.push(`<section class="sekcja${sekcjaTlo()}" aria-labelledby="zobacz-t"><div class="kontener"><div class="sekcja__glowa"><span class="nadtytul">Na te same problemy</span><h2 id="zobacz-t">Zobacz też</h2></div>{{zobacz-tez:${z.slug}}}</div></section>`);

  return szkieletStrony({
    tytul: z.meta?.tytul || `${z.nazwa.replace(/<[^>]+>/g, '')} – Warszawa Włochy | Twój Kosmetolog`,
    opis: z.meta?.opis || '', komentarz: `Źródło treści: ${z.zrodlo || '—'}. Generowane z src/data/zabiegi/${z.slug}.json`,
    tresc: s.join('\n'),
  });
}

// --- STRONA PROBLEMU (BRIEF 6.2) ---
function stronaProblemu(p) {
  const ma = {};
  return szkieletStrony({
    tytul: p.tytul, opis: p.meta, komentarz: '[N:claude-draft] teksty: teksty/problemy-skory-robocze.md — do akceptacji Malwiny',
    tresc: `<section class="naglowek-strony" data-hero aria-labelledby="p-tytul"><div class="kontener">
<nav class="okruszki" aria-label="Okruszki"><ol><li><a href="/">Strona główna</a></li><li><a href="/problemy-skory/">Problemy skóry</a></li><li aria-current="page">${p.nazwa}</li></ol></nav>
<span class="nadtytul">Problemy skóry</span>
<h1 id="p-tytul">${p.h1}</h1>
<div class="tresc lead-tresc">${akapity(p.opis)}</div>
</div></section>
<section class="sekcja sekcja--krem" aria-labelledby="p-diag"><div class="kontener"><div class="baner-diagnostyka">
<div><h2 id="p-diag">${p.diagnostykaTytul || 'Kiedy warto zacząć od diagnostyki?'}</h2><p>${p.diagnostyka}</p></div>
<div class="przyciski"><a class="btn" href="/diagnostyka-skory/">Poznaj diagnostykę</a><a class="btn btn--kontur" href="{{booksy:konsultacja}}" rel="noopener" data-umow="problem-${p.slug}-konsultacja">Umów konsultację</a></div>
</div></div></section>
<section class="sekcja" aria-labelledby="p-zab"><div class="kontener">
<div class="sekcja__glowa"><span class="nadtytul">Zabiegi, które mogą pomóc</span><h2 id="p-zab">Zabiegi — ${p.nazwa.toLowerCase()}</h2></div>
{{lista-zabiegow:${p.slug}}}
${p.linki ? `<ul class="linki-pomocnicze" role="list">${p.linki.map((l) => `<li><a class="link-strzalka" href="${l.href}">${l.tekst}</a></li>`).join('')}</ul>` : ''}
</div></section>
<section class="sekcja sekcja--krem cta-koniec" aria-labelledby="p-cta"><div class="kontener">
<h2 id="p-cta">Umów wizytę</h2>
<p class="lead">Przed każdym zabiegiem oceniam skórę i wykluczam przeciwwskazania.</p>
<div class="przyciski"><a class="btn" href="{{firma:booksy}}" rel="noopener" data-umow="problem-${p.slug}">Umów wizytę w Booksy</a></div>
</div></section>`,
  });
}

function szkieletStrony({ tytul, opis, komentarz, tresc, head = '' }) {
  return `<!doctype html>
<html lang="pl">
<head>
  <title>${tytul}</title>
  <meta name="description" content="${esc(opis)}">
  <!-- @include head -->${head}
</head>
<body>
  <!-- @include naglowek -->
  <main id="tresc">
  <!-- ${komentarz} -->
${tresc}
  </main>
  <!-- @include stopka -->
  <!-- @include umow-mobile -->
</body>
</html>
`;
}

// lista stron generowanych: [ścieżka względna w dist, html, nazwa do komunikatów]
const generowane = [];
for (const z of zabiegi.values()) generowane.push([path.join('zabiegi', z.slug, 'index.html'), stronaZabiegu(z), `src/data/zabiegi/${z.slug}.json`]);
if (problemyDane) for (const p of problemyDane.problemy) {
  if (!PROBLEMY.includes(p.slug)) { blad(`problemy.json: nieznany problem „${p.slug}”`); continue; }
  generowane.push([path.join('problemy-skory', p.slug, 'index.html'), stronaProblemu(p), `src/data/problemy.json [${p.slug}]`]);
}

// ======================================================================
// SEO (BRIEF 9.3): canonical, Open Graph, JSON-LD — dokładane automatycznie do każdej strony
// ======================================================================
const SEO = 'SEO (head)';
const tekstBezTagow = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
function dodajSeo(html, r) {
  let domena;
  try { domena = poleFirmy('domena', SEO).replace(/\/$/, ''); } catch (e) { blad(String(e)); return html; }
  const sciezka = '/' + r.split(path.sep).join('/').replace(/index\.html$/, '');
  const url = domena + sciezka;
  const tytul = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const opis = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const noindex = /<meta\s+name=["']robots["'][^>]*noindex/i.test(html);
  if (!opis && !robocze(r)) ostrzezenia.add(`${r}: brak meta description`);

  const firmaLd = {
    '@type': 'BeautySalon', '@id': domena + '/#gabinet',
    name: poleFirmy('nazwa', SEO), url: domena + '/',
    telephone: poleFirmy('telefon', SEO).replace(/\s/g, ''),
    image: domena + '/assets/img/marka/tk-logo-gold-512.png',
    address: { '@type': 'PostalAddress', streetAddress: poleFirmy('ulica', SEO), postalCode: poleFirmy('kodPocztowy', SEO), addressLocality: poleFirmy('miasto', SEO), addressRegion: 'mazowieckie', addressCountry: 'PL' },
    geo: (([la, lo]) => ({ '@type': 'GeoCoordinates', latitude: Number(la), longitude: Number(lo) }))(poleFirmy('wspolrzedne', SEO).split(',')),
    areaServed: 'Warszawa Włochy',
    sameAs: [poleFirmy('booksy', SEO)],
  };
  const graf = [firmaLd];

  // okruszki → BreadcrumbList
  const ok = html.match(/<nav class="okruszki"[\s\S]*?<\/nav>/);
  if (ok) {
    const elementy = [...ok[0].matchAll(/<li(?: aria-current="page")?>(?:<a href="([^"]+)">)?([\s\S]*?)(?:<\/a>)?<\/li>/g)];
    graf.push({ '@type': 'BreadcrumbList', itemListElement: elementy.map((m, i) => ({ '@type': 'ListItem', position: i + 1, name: tekstBezTagow(m[2]), item: domena + (m[1] || sciezka) })) });
  }
  // FAQ → FAQPage (akordeon z data-faq albo sekcja id="faq")
  const faqBlok = html.match(/<div class="akordeon" data-faq>([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/)
    || html.match(/id="faq"[\s\S]*?<div class="akordeon">([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/);
  if (faqBlok) {
    const pytania = [...faqBlok[1].matchAll(/<summary>([\s\S]*?)<\/summary>\s*<div class="akordeon__tresc">([\s\S]*?)<\/div><\/details>/g)];
    if (pytania.length) graf.push({ '@type': 'FAQPage', mainEntity: pytania.map((m) => ({ '@type': 'Question', name: tekstBezTagow(m[1]), acceptedAnswer: { '@type': 'Answer', text: tekstBezTagow(m[2]) } })) });
  }
  // podstrona zabiegu → Service z zakresem cen (BEZ AggregateRating — BRIEF 9.3)
  const slug = (sciezka.match(/^\/zabiegi\/([^/]+)\/$/) || [])[1];
  if (slug && PODSTRONY.includes(slug)) {
    const lista = widoczne(uslugiPodstrony(slug).flatMap(pozycje));
    const nazwaUslugi = tekstBezTagow((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '');
    const usl = { '@type': 'Service', name: nazwaUslugi, description: opis, provider: { '@id': domena + '/#gabinet' }, areaServed: 'Warszawa' };
    if (lista.length) usl.offers = { '@type': 'AggregateOffer', priceCurrency: 'PLN', lowPrice: Math.min(...lista.map((p) => p.cena)), highPrice: Math.max(...lista.map((p) => p.cena)), offerCount: lista.length };
    graf.push(usl);
  }

  const glowa = [
    `<link rel="canonical" href="${esc(url)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:locale" content="pl_PL">',
    '<meta property="og:site_name" content="Twój Kosmetolog">',
    `<meta property="og:title" content="${tytul}">`,
    opis ? `<meta property="og:description" content="${opis}">` : '',
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(domena)}/assets/img/marka/tk-logo-gold-512.png">`,
    noindex ? '' : `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graf }).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n  ');
  const blokada = PODGLAD && !noindex ? '<meta name="robots" content="noindex, nofollow">\n  ' : '';
  return html.replace('</head>', `  ${blokada}${glowa}\n</head>`);
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
  if (robocze(r) && PUBLICZNY) continue;
  const cel = path.join(DIST, r);
  fs.mkdirSync(path.dirname(cel), { recursive: true });
  if (p.endsWith('.html')) {
    const html = dodajSeo(renderuj(p), r);
    fs.writeFileSync(cel, html);
    strony.push({ r, html });
  } else fs.copyFileSync(p, cel);
}
for (const [r, kod, nazwa] of generowane) {
  const cel = path.join(DIST, r);
  if (fs.existsSync(cel)) { blad(`${nazwa}: kolizja — strona ${r} istnieje też w src/pages`); continue; }
  fs.mkdirSync(path.dirname(cel), { recursive: true });
  const html = dodajSeo(renderujKod(kod, nazwa), r);
  fs.writeFileSync(cel, html);
  strony.push({ r, html });
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

// ---------- --baza: prefiks podkatalogu w ścieżkach od „/” (HTML i CSS) ----------
if (BAZA) {
  const pre = (u) => (u.startsWith('/') && !u.startsWith('//') ? BAZA + u : u);
  for (const p of pliki(DIST)) {
    if (p.endsWith('.html')) {
      let h = fs.readFileSync(p, 'utf8');
      h = h.replace(/(href|src|action|poster)="(\/(?!\/)[^"]*)"/g, (_, at, u) => `${at}="${pre(u)}"`);
      h = h.replace(/(srcset|imagesrcset)="([^"]*)"/g, (_, at, v) =>
        `${at}="${v.split(',').map((x) => { const t = x.trim(); return pre(t); }).join(', ')}"`);
      fs.writeFileSync(p, h);
    } else if (p.endsWith('.css')) {
      const c = fs.readFileSync(p, 'utf8').replace(/url\((['"]?)(\/(?!\/))/g, (_, q, sl) => `url(${q}${BAZA}${sl}`);
      fs.writeFileSync(p, c);
    }
  }
}


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

// ---------- wersja testowa: blokada indeksowania ----------
if (PODGLAD) {
  fs.writeFileSync(path.join(DIST, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.writeFileSync(path.join(DIST, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n');
}

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
console.log(`\n✔ Build ${PROD ? 'PRODUKCYJNY' : PODGLAD ? 'PODGLĄD (noindex)' : 'deweloperski'} OK → ${rel(DIST) || DIST}`);
console.log(`  strony: ${strony.length} · w sitemap: ${urle.length} · usługi w cenniku: ${uslugi.size}`);
const stockZdjecia = [...new Set(stocki.map((p) => path.basename(p).replace(/-\d+\.\w+$/, '')))];
console.log(`  STOCK: ${stockZdjecia.length} zdjęć (${stocki.length} plików)${stockZdjecia.length ? ' → ' + stockZdjecia.join(', ') : ''}\n`);
