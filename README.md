# Las Torres de la Madrugada

> Experimento audiovisual interactivo de música electroacústica generativa, redes estelares paramétricas y estética de dithering EGA de los años 90.

---

## Concepto

Un paisaje nocturno de madrugada donde **torres de telecomunicaciones** y **estrellas** forman una red de energía y sonido que el usuario activa progresivamente. Al hacer clic sobre los 18 nodos interactivos (9 torres terrestres + 9 estrellas celestes), se tejen láseres en el cielo, se activan sintetizadores y el paisaje sonoro se transforma desde el silencio hacia la sobrecarga eléctrica.

Cada tanto, un **auto** cruza por la ruta al pie de las torres con audio Doppler real. Y cada dos a cinco minutos, un **OVNI** atraviesa el cielo con un theremin de los años 50.

El proyecto ofrece dos modos visuales completamente distintos: el modo **normal** (atmósfera realista, bruma, halos) y el modo **dithering EGA**, que convierte toda la escena a la paleta de 16 colores de las PC de los años 90, con dithering Bayer 4x4 renderizado en canvas.

---

## Características

### Escena visual

- **9 torres de comunicación** en CSS puro con perspectiva atmosférica: las lejanas se desvanecen en el tono azul/púrpura del cielo nocturno; las cercanas son oscuras y nítidas.
- **Horizonte SVG fractal** e irregular — no hay simetría artificial.
- **9 micro-estrellas** invisibles hasta ser descubiertas, dispersas por el firmamento.
- **Auto** que cruza en ambas direcciones por la ruta, con dos puntos blancos de faro delantero, luz trasera roja tenue y cono de iluminación sobre el asfalto.
- **OVNI** con platillo, cúpula, luces de posición parpadeantes y rayo tractor, que aparece desde un extremo del cielo al otro.
- **Cielo dinámico** con drift ultra-lento (skyDrift 900 s) y capa de dither Bayer animada.

### Interacción y niveles de energía

Los 18 nodos (torres + estrellas) son clicables. Al activarse, generan una red de líneas SVG entre nodos activos con tres estados de energía:

| Nodos activos | Estado             | Color de láseres  | Audio                         |
|---------------|--------------------|-------------------|-------------------------------|
| 1 - 5         | Tensión baja       | Rojo cálido       | Drones base                   |
| 6 - 11        | Energía media      | Cyan frío         | FM distorsión en drones       |
| 12 - 18       | Sobrecarga crítica | Violeta / Blanco  | Arpegiador a máxima velocidad |

### Audio generativo (Tone.js)

Toda la síntesis corre en Tone.js 15.1.22 enrutada en buses de canal independientes hacia masterDelay -> masterReverb -> Destination.

| Canal     | Descripción técnica                                                            |
|-----------|--------------------------------------------------------------------------------|
| Torres    | FMSynth — zumbido de antenas, detuning leve                                    |
| Viento    | Noise (brown) + filtro pasa-bajos — ruido nocturno de fondo                    |
| Metal     | MembraneSynth — golpes metálicos de estructura                                 |
| Radio     | PluckSynth — transmisiones FM digitales                                        |
| Estrellas | PolySynth — pads celestiales al activar nodos estelares                        |
| Gotas     | PluckSynth arpegiado — balizas rítmicas                                        |
| Auto      | Noise (brown) -> Filter Doppler -> Panner — motor + efecto Doppler estéreo     |
| OVNI      | Oscillator x2 (432 + 418 Hz batientes) + LFO + Tremolo — theremin de los 50s  |
| Master    | Bus sumador -> FX -> salida                                                    |

**Auto — detalle técnico:**
Ruido marrón pasa por un filtro paso-bajos que barre de 70 Hz (posición lejana) a 220 Hz (pase cercano) y vuelve a 70 Hz, simulando efecto Doppler. Simultáneamente el Panner estéreo barre de -1 a +1 (o inverso según dirección). El volumen tiene fade-in de 2,5 s y fade-out de 3,5 s antes del final del recorrido.

**OVNI — detalle técnico:**
Dos osciladores desintonizados (432 Hz y 418 Hz) generan un batimiento de 14 Hz. Cada uno tiene su propio LFO de modulación de frecuencia (2,2 Hz y 0,7 Hz). Un Tremolo a 7 Hz agrega el efecto theremin escalofriante de las películas de ciencia ficción de los años 50. El OVNI siempre viaja en dirección opuesta al último auto que cruzó.

### Mezclador HUD (Glassmorphism)

9 canales con fader vertical + botón mute, panel de cristal semitransparente. El bus master expone sliders de rango para reverb decay, delay feedback y delay time. Todos los cambios son en tiempo real sin interrupciones de audio.

---

## Modos visuales

### Modo normal

Atmósfera realista: halos de luz con blur, gradientes radiales, estrellas con brillo oscilante suave (transición CSS), efectos glassmorphism en el mezclador.

### Modo dithering EGA

Activa el motor de dithering Bayer 4x4 renderizado en canvas. La escena completa se convierte a la paleta EGA de 16 colores de las aventuras gráficas LucasArts / Sierra de los años 90:

```
#000000  #0000aa  #00aa00  #00aaaa
#aa0000  #aa00aa  #aa5500  #aaaaaa
#555555  #5555ff  #55ff55  #55ffff
#ff5555  #ff55ff  #ffff55  #ffffff
```

- El canvas se renderiza a **1/3 de resolución** con `image-rendering: pixelated`, dando el efecto de píxeles grandes.
- Las estrellas animan a través de 8 escalones discretos (`steps(8, end)`) pasando por `#000000 -> #000055 -> #0000aa -> #5555ff -> #55ffff -> #ffffff` con opacidad de 0,10 a 1,00 — igual comportamiento de fade que el modo normal pero dentro de los 16 colores EGA.
- El auto se muestra como dos píxeles amarillos (`#ffff55`) con rojo (`#aa0000`) al costado.
- El OVNI se muestra como bloques escalonados en `#0000aa` (platillo), `#5555ff` (cúpula), `#55ff55` (rayo tractor).
- El canvas EGA respira con una animación sutil de opacidad (`egaPaletteCycle` 8 s).

---

## Estructura del proyecto

```
soundnightlight/
├── index.html        — Estructura HTML, mixer panel, elementos de escena
├── app.js            — Motor JS: audio, EGA canvas, interacción, animaciones (~760 líneas)
├── style.css         — Todo el CSS: escena, mixer, dither overrides, animaciones (~1830 líneas)
├── vite.config.js    — Config Vite (base: /nighttowers/)
└── package.json
```

---

## Instalación y ejecución local

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo con HMR
npm run dev
# -> http://localhost:5005/nighttowers/

# Build de producción
npm run build

# Preview del build
npm run preview
```

Requiere **Node.js >= 18**. No hay backend ni assets de imagen — todo es CSS puro, SVG inline y canvas JS.

> Para la mejor experiencia: pantalla completa + auriculares. El paisaje tarda unos segundos en "despertar" tras el primer clic (política de autoplay del navegador).

---

## Dependencias

| Paquete | Versión  | Rol                                             |
|---------|----------|-------------------------------------------------|
| tone    | ^15.1.22 | Motor de síntesis y secuenciado (Web Audio API) |
| vite    | ^5.4.0   | Bundler / servidor de desarrollo                |

---

## Notas técnicas

- **Afinación:** escala C menor 11 — todos los osciladores y sintetizadores están templados en esta escala para garantizar armonía independientemente del nivel de activación.
- **Canvas EGA:** el dithering Bayer 4x4 se recalcula en cada frame de `requestAnimationFrame`. El canvas vive en `z-index: 0` y los elementos HTML de la escena en `z-index: 1+`.
- **Bus de reverb:** al modificar el slider de decay, se llama `masterReverb.generate()` con debounce de 400 ms para regenerar el IR sin glitches.
- **Arpegiador:** `Tone.Pattern` con escala C menor 11 extendida, velocidad inversamente proporcional al conteo de nodos activos. Se inicia con `arpPattern.start()` sin argumento de tiempo para evitar salto al tiempo 0 del Transport.
- **Pads celestiales:** `PolySynth -> Chorus -> channels.pads`. El Chorus procesa la señal en exclusiva (sin doble ruteo) para evitar phasing.
- **Sin imágenes estáticas:** toda la gráfica es CSS puro + SVG inline + canvas JS. Cero assets de imagen.

---

*Prototipado durante sesiones de agente AI — "Berisso Incident" / Las Torres de la Madrugada.*
## License

MIT License — © 2026 [Vladimiro Bellini](https://github.com/vlasvlasvlas). Free to use and modify, attribution required.
