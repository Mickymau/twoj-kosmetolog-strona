// main.js — menu, nagłówek po przewinięciu, dolny pasek „Umów”. Vanilla JS, bez bibliotek.
(() => {
  const html = document.documentElement;
  html.classList.add('js');

  // --- menu (telefon / tablet) ---
  const przycisk = document.querySelector('.menu-przycisk');
  const menu = document.getElementById('menu');
  if (przycisk && menu) {
    const ustaw = (otwarte) => {
      przycisk.setAttribute('aria-expanded', String(otwarte));
      przycisk.querySelector('.menu-przycisk__tekst').textContent = otwarte ? 'Zamknij' : 'Menu';
      menu.classList.toggle('menu--otwarte', otwarte);
    };
    przycisk.addEventListener('click', () => ustaw(przycisk.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) ustaw(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && przycisk.getAttribute('aria-expanded') === 'true') { ustaw(false); przycisk.focus(); }
    });
    matchMedia('(min-width: 1200px)').addEventListener('change', () => ustaw(false));
  }

  // --- rozwijane menu (Problemy skóry, Zabiegi i cennik) ---
  // Zakładka zostaje zwykłym linkiem; strzałka obok otwiera listę. Desktop: panel pod nagłówkiem otwierany myszą (z krótkim
  // opóźnieniem zamknięcia — między linkiem a panelem jest odstęp), fokusem z klawiatury albo strzałką (ekrany dotykowe).
  // Telefon / tablet: lista rozwijana w menu. Bez JS: desktop pokazuje panel na :hover / :focus-within, telefon tylko link.
  const rozwijane = [...document.querySelectorAll('[data-rozwijane]')];
  if (rozwijane.length) {
    const desktop = matchMedia('(min-width: 1200px)');
    const timery = new Map();
    let bezOtwierania = false;
    const ustawPoz = (li, otwarte) => {
      li.classList.toggle('menu__poz--otwarte', otwarte);
      li.querySelector('.menu__strzalka').setAttribute('aria-expanded', String(otwarte));
    };
    const zamknijWszystkie = (poza) => rozwijane.forEach((li) => { if (li !== poza) ustawPoz(li, false); });
    for (const li of rozwijane) {
      li.querySelector('.menu__strzalka').addEventListener('click', () => {
        const otworz = desktop.matches ? true : !li.classList.contains('menu__poz--otwarte');
        zamknijWszystkie(li);
        ustawPoz(li, otworz);
      });
      li.addEventListener('mouseenter', () => {
        if (!desktop.matches) return;
        clearTimeout(timery.get(li));
        zamknijWszystkie(li);
        ustawPoz(li, true);
      });
      li.addEventListener('mouseleave', () => {
        if (desktop.matches) timery.set(li, setTimeout(() => ustawPoz(li, false), 250));
      });
      li.addEventListener('focusin', () => {
        if (desktop.matches && !bezOtwierania) { zamknijWszystkie(li); ustawPoz(li, true); }
      });
      li.addEventListener('focusout', (e) => {
        if (desktop.matches && !li.contains(e.relatedTarget)) ustawPoz(li, false);
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const otwarte = rozwijane.find((li) => li.classList.contains('menu__poz--otwarte'));
      if (!otwarte) return;
      ustawPoz(otwarte, false);
      bezOtwierania = true;
      otwarte.querySelector('.menu__strzalka').focus();
      bezOtwierania = false;
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('[data-rozwijane]')) zamknijWszystkie(null); });
    desktop.addEventListener('change', () => zamknijWszystkie(null));
  }

  // --- nagłówek: cień i zmniejszenie po przewinięciu ---
  const naglowek = document.querySelector('.naglowek');
  if (naglowek) {
    const sprawdz = () => naglowek.classList.toggle('naglowek--przewiniety', scrollY > 8);
    addEventListener('scroll', sprawdz, { passive: true });
    sprawdz();
  }

  // --- dolny pasek „Umów”: wysuwa się po minięciu hero ---
  const pasek = document.querySelector('.umow-mobile');
  const hero = document.querySelector('[data-hero]');
  if (pasek && hero && 'IntersectionObserver' in window) {
    pasek.classList.add('umow-mobile--ukryty');
    new IntersectionObserver(([w]) => pasek.classList.toggle('umow-mobile--ukryty', w.isIntersecting))
      .observe(hero);
  }
  // --- pakiety ślubne: „Ile masz czasu do ślubu?” — podświetla program (bez JS: wszystkie widoczne) ---
  const wybor = document.querySelector('[data-slub-wybor]');
  if (wybor) {
    wybor.hidden = false;
    const karty = [...document.querySelectorAll('[data-slub-program]')];
    const wynik = wybor.querySelector('.slub-wybor__wynik');
    wybor.addEventListener('click', (e) => {
      const b = e.target.closest('[data-slub-czas]');
      if (!b) return;
      const id = b.dataset.slubCzas;
      wybor.querySelectorAll('[data-slub-czas]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      karty.forEach((k) => k.classList.toggle('slub-program--polecany', k.dataset.slubProgram === id));
      wynik.textContent = '';
      if (id === 'mniej') {
        wynik.append('Mniej niż miesiąc? ');
        const a = document.createElement('a');
        a.href = '/kontakt/#formularz';
        a.textContent = 'Napisz do mnie';
        wynik.append(a, ' — sprawdzimy, co jest możliwe w tym terminie.');
        return;
      }
      const karta = karty.find((k) => k.dataset.slubProgram === id);
      if (!karta) return;
      wynik.textContent = 'Dla Ciebie: ' + karta.querySelector('h3').textContent + '.';
      karta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
  // --- filtr zabiegów po problemie (/zabiegi/) ---
  const filtr = document.querySelector('[data-filtr]');
  const lista = document.querySelector('[data-filtrowane]');
  if (filtr && lista) {
    const licznik = document.querySelector('[data-filtr-licznik]');
    const pozycje = [...lista.children];
    const ustaw = (problem) => {
      let n = 0;
      for (const li of pozycje) {
        const pasuje = !problem || li.dataset.problemy.split(' ').includes(problem);
        li.hidden = !pasuje;
        if (pasuje) n++;
      }
      for (const b of filtr.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.problem === problem));
      if (licznik) licznik.textContent = problem ? `Zabiegi: ${n}` : '';
    };
    filtr.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ustaw(b.dataset.problem); });
    const z = new URLSearchParams(location.search).get('problem');
    if (z) ustaw(z);
  }
  // --- mapa ciała: obszar ↔ wiersze cennika ---
  for (const mapa of document.querySelectorAll('[data-mapa]')) {
    const obszary = [...mapa.querySelectorAll('[data-obszar]')];
    const wiersze = [...mapa.querySelectorAll('tr[data-obszary]')];
    let przypiety = null;
    const pokaz = (id) => {
      for (const o of obszary) o.classList.toggle('aktywny', !!id && o.dataset.obszar === id);
      for (const w of wiersze) {
        const ma = !!id && w.dataset.obszary.split(' ').includes(id);
        w.classList.toggle('podswietlony', ma);
        w.classList.toggle('przygaszony', !!id && !ma);
      }
    };
    const pokazWiersz = (w) => {
      const ids = w ? w.dataset.obszary.split(' ') : [];
      for (const o of obszary) o.classList.toggle('aktywny', ids.includes(o.dataset.obszar));
    };
    for (const o of obszary) {
      o.addEventListener('mouseenter', () => pokaz(o.dataset.obszar));
      o.addEventListener('mouseleave', () => pokaz(przypiety));
      o.addEventListener('focus', () => pokaz(o.dataset.obszar));
      const wybierz = () => { przypiety = przypiety === o.dataset.obszar ? null : o.dataset.obszar; pokaz(przypiety); };
      o.addEventListener('click', wybierz);
      o.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wybierz(); } });
    }
    for (const w of wiersze) {
      w.addEventListener('mouseenter', () => { if (!przypiety) pokazWiersz(w); });
      w.addEventListener('mouseleave', () => { if (!przypiety) pokazWiersz(null); });
    }
  }
  // --- pojawianie się przy przewijaniu (raz, z opóźnieniem dla kolejnych elementów) ---
  const bezRuchu = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!bezRuchu && 'IntersectionObserver' in window) {
    const SELEKTORY = '.sekcja__glowa, .karta, .karta-zabiegu, .kafel, .kroki > li, .sciezka > li, .os > li, .opcja, .przekroj, .baner-diagnostyka, .pytania > li, .wybor > li, .zdjecie, .mapa__sylwetki, .przygotowanie';
    const el = [...document.querySelectorAll(SELEKTORY)].filter((e) => !e.closest('[data-hero]'));
    const obs = new IntersectionObserver((wpisy) => {
      for (const w of wpisy) if (w.isIntersecting) { w.target.classList.add('widoczny'); obs.unobserve(w.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    for (const e of el) {
      const rodzenstwo = e.parentElement ? [...e.parentElement.children].filter((x) => x.matches(SELEKTORY)) : [];
      e.style.setProperty('--opoznienie', `${Math.min(rodzenstwo.indexOf(e), 6) * 70}ms`);
      e.classList.add('pojaw');
      obs.observe(e);
    }
    for (const sch of document.querySelectorAll('.sciezka, .os')) {
      sch.classList.add('rysuj');
      new IntersectionObserver(([w], o) => { if (w.isIntersecting) { sch.classList.add('narysowana'); o.disconnect(); } }, { threshold: 0.3 }).observe(sch);
    }
  }
})();
