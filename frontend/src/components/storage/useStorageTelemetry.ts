import type {Ref} from 'vue';

/* Libelles du stockage : volumes, dates, nom d'un emplacement, etat d'une tache ou d'un titre. */
const LABELS:Record<string,string>={draft:'À lancer',queued:'En attente',running:'En cours',pending:'En attente',prepared:'Préparé',copying:'Copie',verifying:'Vérification',switching:'Bascule Arr',finalizing:'Finalisation Plex',plex_pending:'Copie terminée · finalisation Plex',arr_pending:'Déplacement confié à Arr',cleaning:'Nettoyage',completed:'Terminé',blocked:'À traiter',deferred:'Reporté',paused:'En pause',stopped:'Arrêté',cancelling:'Annulation en cours',cancelled:'Annulé',cancel_blocked:'Annulation à traiter'};

export function useStorageTelemetry(locations:Ref<any[]>){
 const gb=(n:any)=>n==null?'—':`${(Number(n)/1e9).toLocaleString('fr-FR',{maximumFractionDigits:1})} Go`;
 const date=(n:any)=>n?new Date(n.endsWith('Z')?n:n+'Z').toLocaleString('fr-FR'):'Non contrôlé';
 const locationName=(id:number)=>locations.value.find(l=>l.id===id)?.name||`Stockage ${id}`;
 const status=(value:string)=>LABELS[value]||value;
 return {gb,date,locationName,status};
}
