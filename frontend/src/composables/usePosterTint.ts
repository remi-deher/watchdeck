import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

/* Couleur dominante du bas d'une affiche, pour teinter la fiche qui la porte : le bas de
   l'affiche est ce qui touche le fond de la page, c'est lui qui doit s'y raccorder.

   La lecture des pixels passe par un canevas, qui refuse toute image d'une autre origine
   sauf si son serveur l'autorise (en-tete CORS) et que l'image est demandee en mode
   `anonymous`. Le proxy de l'application est de meme origine ; TMDB repond
   `Access-Control-Allow-Origin: *`, donc une URL TMDB directe passe aussi. Un hote sans CORS
   fait echouer le chargement : la fiche garde alors son fond habituel. */
const SAMPLE_WIDTH = 24;
const SAMPLE_HEIGHT = 8;
/** Part basse de l'affiche echantillonnee. */
const BOTTOM_SHARE = 0.2;

const memo = new Map<string, string | null>();

/** Moyenne des pixels de la bande basse, les teintes saturees comptant davantage : un bas
    d'affiche presque noir avec une touche de couleur doit donner cette couleur, pas du gris. */
export function dominantOfBottom(data: Uint8ClampedArray): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const weight = 0.15 + saturation;
    r += data[i] * weight;
    g += data[i + 1] * weight;
    b += data[i + 2] * weight;
    total += weight;
  }
  if (!total) return null;
  return `${Math.round(r / total)} ${Math.round(g / total)} ${Math.round(b / total)}`;
}

function sample(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.decoding = 'async';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE_WIDTH;
        canvas.height = SAMPLE_HEIGHT;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context || !image.naturalWidth) return resolve(null);
        const band = Math.max(1, Math.round(image.naturalHeight * BOTTOM_SHARE));
        context.drawImage(image, 0, image.naturalHeight - band, image.naturalWidth, band, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        resolve(dominantOfBottom(context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data));
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** « r g b » de la couleur dominante du bas de l'affiche, ou `null` tant qu'elle est inconnue. */
export function usePosterTint(url: () => string | null | undefined): Ref<string | null> {
  const tint = ref<string | null>(null);
  let current = 0;

  const stop = watch(
    url,
    async (next) => {
      const ticket = ++current;
      if (!next) {
        tint.value = null;
        return;
      }
      if (memo.has(next)) {
        tint.value = memo.get(next) ?? null;
        return;
      }
      const color = await sample(next);
      memo.set(next, color);
      // Une fiche plus recente a pris la main pendant la lecture : son resultat prime.
      if (ticket === current) tint.value = color;
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    current += 1;
    stop();
  });
  return tint;
}
