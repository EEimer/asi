#!/usr/bin/env python3
"""Erzeugt alle Rastericons aus der Geometrie von favicon.svg.

    pip3 install Pillow
    python3 scripts/menubar/build-icons.py

Zwei Ziele aus derselben Quelle:

  scripts/menubar/asi*.png       Menueleiste, drei Statusfarben (bar/bar.sh)
  public/assets/favicon/*        Browser-Tab, Lesezeichen, Homescreen

Warum die Kachel hier nachgebaut und nicht aus einem der PNGs skaliert wird:
die alten Rasterdateien hatten alle deckend weisse Ecken statt Transparenz. Auf
dunklem Grund — Menueleiste wie dunkler Tab-Streifen — ergibt das vier helle
Zipfel um die runde Kachel. Nur favicon.svg war korrekt.

Einzige Ausnahme bleibt apple-touch-icon.png: das ist bewusst deckend UND ohne
runde Ecken. iOS legt seine eigene Maske darueber; eine mitgelieferte Rundung
scheint daneben als heller Rand durch, Transparenz wird dort schwarz hinterlegt.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
MENUBAR_OUT = ROOT / "scripts/menubar"
FAVICON_OUT = ROOT / "public/assets/favicon"

# --------------------------------------------------------------- Menueleiste --
# SwiftBar rendert ein Bild in seiner natuerlichen Groesse — 1 Bildpunkt wird
# 1 Punkt auf dem Schirm, es skaliert nichts auf Leistenhoehe. Mehr Pixel heisst
# also groesser, nicht schaerfer.
#
# Schaerfe geht trotzdem, ueber die DPI im PNG: macOS leitet die Punktgroesse aus
# Pixelzahl und Aufloesung ab (Punkte = Pixel * 72 / dpi). Ein 38px-Bild mit
# 144 dpi ist damit 19 Punkte gross — gleiche Groesse wie ein 19px-Bild, aber mit
# der doppelten Pixelzahl, die ein Retina-Schirm auch tatsaechlich zeichnet.
TILE_PT = 19     # Kachelgroesse in Punkten. Der Groessen-Knopf.
                 # Auf die Hoehe der Flaggen-Emojis in der Leiste abgestimmt.
SIDE_PAD_PT = 1  # Luft links und rechts. Die Datei wird sonst eng um die Kachel
                 # geschnitten — jeder Punkt hier ist Abstand zu den Nachbarn,
                 # zusaetzlich zu dem, den macOS zwischen Leisten-Elementen setzt.
                 # 0 geht auch.
RETINA = 2       # Pixel je Punkt. 2 fuer Retina. Sollte SwiftBar die DPI einmal
                 # ignorieren, macht 1 daraus wieder das alte Verhalten.

TILE_PX = TILE_PT * RETINA
PAD_PX = SIDE_PAD_PT * RETINA
DPI = 72 * RETINA

# ------------------------------------------------------------------ Geometrie --
# Alles im 512er-Koordinatensystem von favicon.svg.
SS = 4  # Supersampling gegen ausgefranste Rundungen
RADIUS = 112
JADE = ((0x3F, 0xD9, 0xA2), (0x0C, 0x7C, 0x59))
GRAD_END = (0.35, 1.0)  # Richtung des Verlaufs, aus x2/y2 des linearGradient
GRAPHITE = (0x12, 0x16, 0x1F)
ANGLE = [(134, 148), (240, 250), (134, 352)]
STROKE = 70
PILL = (270, 314, 422, 390)

# Statusfarben: derselbe Verlauf, andere Toene.
AMBER = ((0xF5, 0xC1, 0x4E), (0xB8, 0x7A, 0x0C))
RED = ((0xE8, 0x6A, 0x72), (0x9B, 0x1C, 0x2B))

_gradients: dict[tuple, Image.Image] = {}


def gradient(colors: tuple) -> Image.Image:
    """Linearer Verlauf ueber die 512er-Flaeche, Richtung wie im SVG."""
    if colors in _gradients:
        return _gradients[colors]
    top, bottom = colors
    img = Image.new("RGB", (512, 512))
    px = img.load()
    dx, dy = GRAD_END[0] * 512, GRAD_END[1] * 512
    length_sq = dx * dx + dy * dy
    for y in range(512):
        for x in range(512):
            t = min(1.0, max(0.0, (x * dx + y * dy) / length_sq))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
    _gradients[colors] = img
    return img


def tile(colors: tuple, size: int, radius: int = RADIUS) -> Image.Image:
    """Fertige Kachel in Zielgroesse. radius=0 gibt ein randloses Quadrat."""
    big = 512 * SS
    img = gradient(colors).resize((big, big), Image.BILINEAR).convert("RGBA")

    if radius:
        mask = Image.new("L", (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            (0, 0, big - 1, big - 1), radius=radius * SS, fill=255
        )
        img.putalpha(mask)

    d = ImageDraw.Draw(img)
    if radius:
        # Innenkante: im SVG ein weisser Rahmen mit 16% Deckkraft
        d.rounded_rectangle(
            (4 * SS, 4 * SS, 508 * SS, 508 * SS),
            radius=108 * SS, outline=(255, 255, 255, 41), width=8 * SS,
        )

    pts = [(x * SS, y * SS) for x, y in ANGLE]
    d.line(pts, fill=GRAPHITE + (255,), width=STROKE * SS, joint="curve")
    r = STROKE * SS / 2
    for x, y in (pts[0], pts[2]):  # ImageDraw kennt keine runden Enden
        d.ellipse((x - r, y - r, x + r, y + r), fill=GRAPHITE + (255,))

    x0, y0, x1, y1 = (v * SS for v in PILL)
    d.rounded_rectangle((x0, y0, x1, y1), radius=(y1 - y0) / 2, fill=(255, 255, 255, 255))

    return img.resize((size, size), Image.LANCZOS)


def build_menubar() -> None:
    for name, colors in {"asi": JADE, "asi-amber": AMBER, "asi-red": RED}.items():
        t = tile(colors, TILE_PX)
        # Nur seitliche Luft. Oben und unten eng — macOS zentriert das Element
        # ohnehin in der Leiste, jeder Punkt Rand waere dort verschenkte Breite.
        icon = Image.new("RGBA", (t.width + 2 * PAD_PX, t.height), (0, 0, 0, 0))
        icon.alpha_composite(t, (PAD_PX, 0))
        # Die DPI ist hier kein Beiwerk: ohne sie waere das Icon doppelt so gross.
        icon.save(MENUBAR_OUT / f"{name}.png", dpi=(DPI, DPI))
    print(f"Menueleiste: 3 Icons {TILE_PX + 2*PAD_PX}x{TILE_PX}px @ {DPI}dpi "
          f"= {TILE_PT + 2*SIDE_PAD_PT}x{TILE_PT}pt")


def build_favicons() -> None:
    for size in (16, 32):
        tile(JADE, size).save(FAVICON_OUT / f"favicon-{size}x{size}.png")

    # Ein .ico traegt mehrere Groessen; Windows und aeltere Pfade suchen sich die
    # passende heraus. Aus der groessten gerendert, Pillow legt die Stufen an.
    tile(JADE, 48).save(FAVICON_OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # Randlos und deckend: iOS maskiert selbst, siehe Modul-Docstring.
    apple = tile(JADE, 180, radius=0).convert("RGB")
    apple.save(FAVICON_OUT / "apple-touch-icon.png")

    print("Favicons: 16, 32, .ico (16/32/48), apple-touch-icon 180 (randlos, deckend)")


if __name__ == "__main__":
    build_menubar()
    build_favicons()
