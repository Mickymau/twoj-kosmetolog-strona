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
})();
