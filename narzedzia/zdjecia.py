"""zdjecia.py — jednorazowa konwersja zdjęć do WebP w kilku szerokościach (BRIEF 8.4.6).

Narzędzie deweloperskie (Pillow), NIE zależność strony.

    python -P narzedzia/zdjecia.py zrodla-zdjec/PLIK.jpg [--kadr 4:5] [--szer 480,800,1200,1600] [--powieksz]

Wynik: src/assets/img/<nazwa>-<szer>.webp (max 2000 px). Prefiks STOCK- z nazwy pliku zostaje.
--kadr przycina środek do proporcji (np. 4:5, 4:3), zanim powstaną rozmiary.
--alfa zachowuje przezroczystość (grafiki PNG z wycięciem; domyślnie tło staje się czarne).
--powieksz pozwala wygenerować rozmiary większe niż źródło (dla małych zdjęć od klientki; efekt: miększy obraz).
"""
import argparse
import pathlib
import sys

from PIL import Image, ImageOps

CEL = pathlib.Path(__file__).resolve().parent.parent / "src" / "assets" / "img"


def przytnij(img, kadr):
    w, h = (int(x) for x in kadr.split(":"))
    docelowa = w / h
    szer, wys = img.size
    if szer / wys > docelowa:          # za szerokie → tniemy boki
        nowa = round(wys * docelowa)
        lewo = (szer - nowa) // 2
        return img.crop((lewo, 0, lewo + nowa, wys))
    nowa = round(szer / docelowa)      # za wysokie → tniemy górę i dół
    gora = (wys - nowa) // 2
    return img.crop((0, gora, szer, gora + nowa))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("plik")
    p.add_argument("--kadr")
    p.add_argument("--szer", default="480,800,1200,1600")
    p.add_argument("--powieksz", action="store_true")
    p.add_argument("--alfa", action="store_true")
    a = p.parse_args()

    zrodlo = pathlib.Path(a.plik)
    img = ImageOps.exif_transpose(Image.open(zrodlo)).convert("RGBA" if a.alfa else "RGB")
    if a.kadr:
        img = przytnij(img, a.kadr)

    CEL.mkdir(parents=True, exist_ok=True)
    for s in sorted({min(int(x), 2000) for x in a.szer.split(",")}):
        if s > img.width and not a.powieksz:
            continue
        h = round(img.height * s / img.width)
        out = CEL / f"{zrodlo.stem}-{s}.webp"
        img.resize((s, h), Image.LANCZOS).save(out, "WEBP", quality=80, method=6)
        print(f"{out.name}  {s}x{h}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    sys.exit(main())
