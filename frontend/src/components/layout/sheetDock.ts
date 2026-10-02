/**
 * Les feuilles du dock laissent le dock a lui-meme.
 *
 * Retoucher l'entree du dock qui a ouvert une feuille la referme : c'est le dock qui
 * bascule. Sans cette exception, Reka UI voyait d'abord un appui a l'exterieur de la
 * feuille et la fermait, puis le dock la rouvrait aussitot.
 */
export function laisserAuDock(event: Event): void {
  const cible = (event as CustomEvent<{ originalEvent?: Event }>).detail?.originalEvent?.target ?? event.target;
  if (cible instanceof Element && cible.closest('.app-dock')) event.preventDefault();
}
