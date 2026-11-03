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
    matchMedia('(min-width: 1024px)').addEventListener('change', () => ustaw(false));
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
