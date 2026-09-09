/**
 * Téléchargement d'un contenu généré côté navigateur.
 *
 * L'URL d'objet est révoquée au tour suivant : la révoquer immédiatement annule le
 * téléchargement dans certains navigateurs, la garder indéfiniment retient le blob en
 * mémoire jusqu'au rechargement de la page.
 */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
