"""Copie vérifiée indépendante des services et de l’interface."""

import hashlib
import os
import queue
import re
import shutil
import signal
import subprocess
import threading
import time
import uuid

from .ssh_hash import empreinte_destination

SESSION_VERIFICATION = uuid.uuid4().hex

BLOC = 1 << 20
SYNC_OCTETS = 8 << 20


class Arret(Exception):
    """Contrôle de sécurité non respecté."""


class Interrompu(Exception):
    """Arrêt demandé pendant un titre : rien n'est supprimé ni basculé."""


def empreinte(path, stop=None):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            if stop is not None and stop.is_set():
                raise Interrompu()
            bloc = f.read(BLOC)
            if not bloc:
                break
            h.update(bloc)
    return h.hexdigest()


def signature(path):
    st = os.stat(path)
    return [os.path.realpath(path), st.st_size, st.st_mtime_ns, st.st_ctime_ns, st.st_dev, st.st_ino]


def permissions_destination(temporary, destination):
    """Use the destination's access policy, never import a source ACL from another server."""
    reference = destination if os.path.exists(destination) else os.path.dirname(destination)
    permissions = os.stat(reference).st_mode & 0o666
    os.chmod(temporary, permissions | 0o600)


def metadata_destination(source, temporary, destination):
    st = os.stat(source)
    os.utime(temporary, ns=(st.st_atime_ns, st.st_mtime_ns))
    permissions_destination(temporary, destination)


def preuve(src, dst, sha, avant):
    if signature(src) != avant:
        raise Arret(f"Source modifiée pendant la vérification : {src}; original conservé")
    return {"session": SESSION_VERIFICATION, "sha256": sha, "source": avant, "destination": signature(dst)}


def preuve_valide(src, dst, p, mode="renforce"):
    return bool(
        p
        and p.get("session") == SESSION_VERIFICATION
        and (p.get("sha256") or (mode == "standard" and p.get("verification") == "rsync"))
        and p.get("source") == signature(src)
        and p.get("destination") == signature(dst)
    )


def verifier_dossier(src, dst, stop=None, preuves=None, mode="renforce"):
    """Réutilise les preuves du processus courant ; relecture après redémarrage."""
    preuves = preuves if preuves is not None else {}
    fichiers = []
    for racine, _, noms in os.walk(src):
        for nom in noms:
            if stop is not None and stop.is_set():
                raise Interrompu()
            rel = os.path.relpath(os.path.join(racine, nom), src)
            a, b = os.path.join(src, rel), os.path.join(dst, rel)
            if not os.path.isfile(b):
                raise Arret(f"Destination absente : {rel}; original conservé")
            if not preuve_valide(a, b, preuves.get(rel), mode):
                avant, dest_avant = signature(a), signature(b)
                sha = empreinte(a, stop)
                destination_hash = empreinte_destination(b, stop) if mode == "renforce" else empreinte(b, stop)
                if sha != destination_hash or signature(b) != dest_avant:
                    raise Arret(f"Intégrité SHA-256 incorrecte : {rel}; original conservé")
                preuves[rel] = preuve(a, b, sha, avant)
            fichiers.append(rel)
    if not fichiers:
        raise Arret("Source vide : suppression refusée")
    return fichiers


def discard_partial(path, expected):
    """Never remove a published file, a link, or an artifact changed since inspection."""
    import stat
    from pathlib import Path

    if not path.endswith(".partiel") or any(parent.is_symlink() for parent in [Path(path), *Path(path).parents]):
        raise Arret("Nettoyage limité aux fichiers temporaires ordinaires.")
    metadata = os.lstat(path)
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1 or signature(path) != expected:
        raise Arret("Fichier temporaire modifié ou lié : nettoyage refusé.")
    os.unlink(path)
    return True


def _copier_python(src, dst, avance, stop, preuve_existante=None):
    """Reprise du préfixe vérifié, puis contrôle SHA-256 avant renommage."""
    avant = signature(src)
    taille = avant[1]
    if os.path.isfile(dst) and preuve_valide(src, dst, preuve_existante):
        avance(taille)
        return preuve_existante
    if os.path.isfile(dst) and os.path.getsize(dst) == taille:
        dest_avant = signature(dst)
        sha = empreinte(src, stop)
        if sha == empreinte(dst, stop) and signature(dst) == dest_avant:
            p = preuve(src, dst, sha, avant)
            avance(taille)
            return p
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + ".partiel"
    offset = os.path.getsize(tmp) if os.path.isfile(tmp) else 0
    if offset > taille:
        offset = 0
    h = hashlib.sha256()
    if offset:
        with open(src, "rb") as fi, open(tmp, "rb") as fp:
            restant = offset
            while restant:
                if stop is not None and stop.is_set():
                    raise Interrompu()
                n = min(BLOC, restant)
                bloc = fi.read(n)
                if bloc != fp.read(n):
                    offset = 0
                    h = hashlib.sha256()
                    break
                h.update(bloc)
                restant -= n
    with open(src, "rb") as fi, open(tmp, "ab" if offset else "wb") as fo:
        fi.seek(offset)
        avance(offset)
        non_synchronise = 0
        while True:
            if stop is not None and stop.is_set():
                raise Interrompu()
            bloc = fi.read(BLOC)
            if not bloc:
                break
            h.update(bloc)
            fo.write(bloc)
            non_synchronise += len(bloc)
            if non_synchronise >= SYNC_OCTETS:
                fo.flush()
                os.fsync(fo.fileno())
                non_synchronise = 0
            avance(len(bloc))
        fo.flush()
        os.fsync(fo.fileno())
    if signature(src) != avant:
        raise Arret(f"Source modifiée pendant la copie : {src}; original conservé")
    sha = h.hexdigest()
    if os.path.getsize(tmp) != taille or sha != empreinte(tmp, stop):
        raise Arret(f"Intégrité SHA-256 incorrecte : {src}; original conservé")
    metadata_destination(src, tmp, dst)
    os.replace(tmp, dst)
    return preuve(src, dst, sha, avant)


def _sync_partiel(path):
    if os.path.isfile(path):
        with open(path, "r+b") as f:
            os.fsync(f.fileno())


def _arreter_rsync(proc):
    if proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGINT)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait()


def copier_rsync(src, dst, avance, stop, preuve_existante=None, phase=None, mode="renforce"):
    """Publication après rsync vérifié, et relecture SHA-256 en mode renforcé."""
    if mode not in ("standard", "renforce"):
        raise Arret("Mode de vérification inconnu")
    if stop is not None and stop.is_set():
        raise Interrompu()
    executable = shutil.which("rsync")
    if not executable:
        raise Arret("rsync absent : reconstruire l’image avec rsync")
    avant = signature(src)
    taille = avant[1]
    if os.path.isfile(dst):
        if preuve_valide(src, dst, preuve_existante, mode):
            avance(taille)
            return preuve_existante
        if os.path.getsize(dst) == taille:
            dest_avant = signature(dst)
            sha = empreinte(src, stop)
            destination_hash = empreinte_destination(dst, stop, phase) if mode == "renforce" else empreinte(dst, stop)
            if sha == destination_hash and signature(dst) == dest_avant:
                p = preuve(src, dst, sha, avant)
                avance(taille)
                return p
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + ".partiel"
    if os.path.lexists(tmp) and (os.path.islink(tmp) or os.stat(tmp).st_nlink > 1):
        raise Arret(f"Fichier partiel lié à un autre chemin : {tmp}")
    commande = [
        executable,
        "--times",
        "--ignore-times",
        "--inplace",
        "--fsync",
        "--info=progress2",
        "--outbuf=L",
        "--checksum-choice=xxh128",
    ]
    # Le delta répare les blocs du fichier partiel, même si taille/date concordent.
    if os.path.isfile(tmp):
        commande.append("--no-whole-file")
    limite = os.environ.get("RSYNC_BWLIMIT", "")
    if limite:
        commande.append("--bwlimit=" + limite)
    commande.extend(["--", os.path.abspath(src), os.path.abspath(tmp)])
    proc = subprocess.Popen(
        commande,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        env=dict(os.environ, LC_ALL="C"),
    )
    sorties = queue.Queue()

    def lire_sortie():
        try:
            while True:
                bloc = os.read(proc.stdout.fileno(), 4096)
                if not bloc:
                    break
                sorties.put(bloc.decode("utf8", errors="replace"))
        finally:
            sorties.put(None)

    lecteur = threading.Thread(target=lire_sortie, daemon=True)
    lecteur.start()
    texte, compte, sync = "", 0, time.monotonic()
    try:
        while proc.poll() is None or lecteur.is_alive() or not sorties.empty():
            if stop is not None and stop.is_set():
                raise Interrompu()
            try:
                bloc = sorties.get(timeout=0.2)
                if bloc:
                    texte = (texte + bloc)[-16000:]
                    valeurs = re.findall(r"(?:^|[\r\n])\s*([\d,]+)\s+\d+%", texte)
                    if valeurs:
                        nouveau = min(taille, int(valeurs[-1].replace(",", "")))
                        if nouveau > compte:
                            avance(nouveau - compte)
                            compte = nouveau
            except queue.Empty:
                pass
            if time.monotonic() - sync >= 1:
                _sync_partiel(tmp)
                sync = time.monotonic()
        if proc.returncode:
            raise Arret(f"rsync en échec ({proc.returncode}) : {texte[-1500:]}")
    finally:
        _arreter_rsync(proc)
        lecteur.join(timeout=2)
        proc.stdout.close()
        _sync_partiel(tmp)
    if stop is not None and stop.is_set():
        raise Interrompu()
    if signature(src) != avant or not os.path.isfile(tmp) or os.path.getsize(tmp) != taille:
        raise Arret(f"Source modifiée ou copie incomplète : {src}; original conservé")
    sha = None
    if mode == "renforce":
        if phase:
            phase("vérification SHA-256 du fichier")
        dest_avant = signature(tmp)
        sha = empreinte(src, stop)
        if sha != empreinte_destination(tmp, stop, phase) or signature(tmp) != dest_avant:
            raise Arret(f"Intégrité SHA-256 incorrecte : {src}; original conservé")
    if signature(src) != avant:
        raise Arret(f"Source modifiée pendant la vérification : {src}")
    metadata_destination(src, tmp, dst)
    os.replace(tmp, dst)
    p = preuve(src, dst, sha, avant)
    p["verification"] = "sha256" if sha else "rsync"
    if compte < taille:
        avance(taille - compte)
    return p


def copier_fichier(src, dst, avance, stop, preuve_existante=None, phase=None, mode="renforce"):
    # Le moteur Python reste disponible pour les tests Windows et le retour arrière.
    if os.name == "nt" or os.environ.get("COPY_ENGINE") == "python":
        return _copier_python(src, dst, avance, stop, preuve_existante)
    return copier_rsync(src, dst, avance, stop, preuve_existante, phase, mode)
