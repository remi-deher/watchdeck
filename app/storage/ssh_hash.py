"""SHA-256 distant avec identité SSH épinglée et repli NFS explicite."""

import base64
import hashlib
import json
import os
import posixpath
import shlex
import time

CONFIG: dict = {}


def configurer(r):
    CONFIG.clear()
    CONFIG.update(r)


def chemin_distant(path):
    for local, distant in sorted(CONFIG.get("ssh_map", {}).items(), key=lambda kv: -len(kv[0])):
        racine = os.path.abspath(local).rstrip(os.sep)
        cible = os.path.abspath(path)
        if cible == racine or cible.startswith(racine + os.sep):
            rel = os.path.relpath(cible, racine).replace(os.sep, "/")
            return posixpath.join(distant, rel) if rel != "." else distant
    raise RuntimeError("Chemin destination sans correspondance SSH")


def connecter(config=None):
    config = CONFIG if config is None else config
    import io

    import paramiko

    host, user = config.get("ssh_host"), config.get("ssh_user")
    attendu = config.get("ssh_fingerprint", "").strip()
    if not host or not user or not attendu:
        raise RuntimeError("SSH incomplet : hôte, utilisateur et empreinte serveur requis")

    class Epingle(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, client, hostname, key):
            reel = "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
            if reel != attendu:
                raise RuntimeError("Identité SSH différente de l’empreinte enregistrée")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(Epingle())
    args = dict(
        hostname=host,
        port=int(config.get("ssh_port", 22)),
        username=user,
        timeout=10,
        banner_timeout=10,
        auth_timeout=10,
        allow_agent=False,
        look_for_keys=False,
    )
    if config.get("ssh_auth", "password") == "key":
        cle = config.get("ssh_private_key", "")
        mot = config.get("ssh_passphrase") or None
        pkey = None
        for classe in (paramiko.Ed25519Key, paramiko.RSAKey, paramiko.ECDSAKey):
            try:
                pkey = classe.from_private_key(io.StringIO(cle), password=mot)
                break
            except (paramiko.SSHException, ValueError):
                continue
        if pkey is None:
            raise RuntimeError("Clé privée SSH invalide ou phrase secrète incorrecte")
        args["pkey"] = pkey
    else:
        args["password"] = config.get("ssh_password", "")
    try:
        client.connect(**args)
        return client
    except RuntimeError:
        client.close()
        raise
    except Exception:
        client.close()
        raise RuntimeError("Connexion SSH refusée ou indisponible ; vérifier identité et authentification") from None


def executer(script, stop=None):
    from .integrite import Interrompu

    client = connecter()
    channel = None
    try:
        transport = client.get_transport()
        channel = transport.open_session(timeout=10)
        encoded = base64.b64encode(script.encode()).decode()
        channel.exec_command("python3 -c " + shlex.quote("import base64;exec(base64.b64decode(" + repr(encoded) + "))"))
        limite = time.monotonic() + int(CONFIG.get("ssh_timeout", 3600))
        output = bytearray()
        while True:
            if stop is not None and stop.is_set():
                raise Interrompu()
            if time.monotonic() > limite:
                raise RuntimeError("Délai du calcul SSH dépassé")
            if channel.recv_ready():
                output.extend(channel.recv(4096))
                if len(output) > 16384:
                    raise RuntimeError("Réponse SSH trop volumineuse")
            if channel.recv_stderr_ready():
                channel.recv_stderr(4096)
            if channel.exit_status_ready() and not channel.recv_ready():
                break
            time.sleep(0.1)
        if channel.recv_exit_status() != 0:
            raise RuntimeError("Calcul SSH impossible : Python ou fichier indisponible, ou fichier modifié")
        return json.loads(output.decode())
    finally:
        if channel is not None:
            channel.close()
        client.close()


def tester():
    racine = next(iter(CONFIG.get("ssh_map", {}).values()), "")
    if not racine:
        raise RuntimeError("Correspondance SSH manquante")
    return executer(
        "import os,json,hashlib\np="
        + repr(racine)
        + '\nassert os.path.isdir(p) and os.access(p,os.R_OK)\nprint(json.dumps({"ok": True, "detail": "Connexion authentifiée, identité vérifiée, Python SHA-256 et répertoire accessibles"}))'
    )


def empreinte_destination(path, stop=None, phase=None):
    from .integrite import Interrompu, empreinte

    mode = CONFIG.get("hash_destination", "hybride")
    if mode not in ("hybride", "nfs", "ssh"):
        raise RuntimeError("Méthode de calcul destination inconnue")
    if mode != "nfs":
        try:
            remote = chemin_distant(path)
            script = """import os,json,hashlib
p=PATH
before=os.stat(p)
h=hashlib.sha256()
with open(p,'rb') as f:
 while True:
  b=f.read(1048576)
  if not b: break
  h.update(b)
after=os.stat(p)
assert (before.st_size,before.st_mtime_ns,before.st_ctime_ns,before.st_ino)==(after.st_size,after.st_mtime_ns,after.st_ctime_ns,after.st_ino)
print(json.dumps({'sha256':h.hexdigest(),'size':after.st_size}))
""".replace("PATH", repr(remote))
            if phase:
                phase("vérification SHA-256 destination via SSH")
            result = executer(script, stop)
            digest = result.get("sha256", "")
            if (
                len(digest) != 64
                or any(c not in "0123456789abcdef" for c in digest)
                or result.get("size") != os.path.getsize(path)
            ):
                raise RuntimeError("Réponse ou correspondance de fichier SSH invalide")
            return digest
        except Interrompu:
            raise
        except Exception as exc:
            if mode == "ssh":
                raise RuntimeError("Vérification SSH obligatoire indisponible") from exc
            if phase:
                phase("repli SHA-256 via NFS : " + str(exc))
    elif phase:
        phase("vérification SHA-256 destination via NFS")
    return empreinte(path, stop)
