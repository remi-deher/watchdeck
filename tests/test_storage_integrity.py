import os
import shutil
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from app.storage import integrite as t


class HashDistantTests(unittest.TestCase):
    def test_hybride_repli_nfs(self):
        from app.storage import ssh_hash

        with (
            patch.dict(ssh_hash.CONFIG, {"hash_destination": "hybride", "ssh_map": {"/usb/": "/remote/"}}),
            patch.object(ssh_hash, "executer", side_effect=RuntimeError("hors ligne")),
            patch("app.storage.integrite.empreinte", return_value="hash") as local,
        ):
            self.assertEqual(ssh_hash.empreinte_destination("/usb/film.mkv"), "hash")
            local.assert_called_once()

    def test_ssh_obligatoire_sans_repli(self):
        from app.storage import ssh_hash

        with (
            patch.dict(ssh_hash.CONFIG, {"hash_destination": "ssh", "ssh_map": {"/usb/": "/remote/"}}),
            patch.object(ssh_hash, "executer", side_effect=RuntimeError("hors ligne")),
            patch("app.storage.integrite.empreinte") as local,
        ):
            with self.assertRaises(RuntimeError):
                ssh_hash.empreinte_destination("/usb/film.mkv")
            local.assert_not_called()

    def test_hash_different_ne_declenche_pas_repli(self):
        from app.storage import ssh_hash

        with (
            patch.dict(ssh_hash.CONFIG, {"hash_destination": "hybride", "ssh_map": {"/usb/": "/remote/"}}),
            patch.object(ssh_hash, "executer", return_value={"sha256": "a" * 64, "size": 10}),
            patch.object(ssh_hash.os.path, "getsize", return_value=10),
            patch("app.storage.integrite.empreinte") as local,
        ):
            self.assertEqual(ssh_hash.empreinte_destination("/usb/film.mkv"), "a" * 64)
            local.assert_not_called()


class IntegriteTests(unittest.TestCase):
    def setUp(self):
        moteur = patch.dict(os.environ, {"COPY_ENGINE": "python"})
        moteur.start()
        self.addCleanup(moteur.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.src = Path(self.tmp.name) / "source"
        self.dst = Path(self.tmp.name) / "destination"
        self.src.write_bytes(b"abcdefgh" * 100)

    def test_fichier_meme_taille_corrompu_est_remplace(self):
        self.dst.write_bytes(b"xxxxxxxx" * 100)
        t.copier_fichier(str(self.src), str(self.dst), lambda n: None, None)
        self.assertEqual(self.src.read_bytes(), self.dst.read_bytes())

    def test_ecritures_synchronisees_periodiquement(self):
        self.src.write_bytes(b"a" * (3 << 20))
        with (
            patch("app.storage.integrite.SYNC_OCTETS", 1 << 20),
            patch("app.storage.integrite.os.fsync", wraps=__import__("os").fsync) as sync,
        ):
            t.copier_fichier(str(self.src), str(self.dst), lambda n: None, None)
            self.assertGreaterEqual(sync.call_count, 4)
        self.assertEqual(self.src.read_bytes(), self.dst.read_bytes())

    def test_source_hachee_pendant_copie_une_seule_relecture_destination(self):
        from app.storage import integrite

        with patch("app.storage.integrite.empreinte", wraps=integrite.empreinte) as h:
            preuve = t.copier_fichier(str(self.src), str(self.dst), lambda n: None, None)
            self.assertEqual(h.call_count, 1)
            self.assertEqual(h.call_args.args[0], str(self.dst) + ".partiel")
        self.assertTrue(preuve["sha256"])

    def test_preuve_reutilisee_sans_relecture(self):
        srcdir, dstdir = Path(self.tmp.name) / "a", Path(self.tmp.name) / "b"
        srcdir.mkdir()
        dstdir.mkdir()
        a, b = srcdir / "film", dstdir / "film"
        a.write_bytes(b"abcdef")
        p = t.copier_fichier(str(a), str(b), lambda n: None, None)
        with patch("app.storage.integrite.empreinte", side_effect=AssertionError("relecture inutile")):
            t.verifier_dossier(str(srcdir), str(dstdir), preuves={"film": p})

    def test_redemarrage_impose_verification_complete(self):
        from app.storage import integrite

        srcdir, dstdir = Path(self.tmp.name) / "a", Path(self.tmp.name) / "b"
        srcdir.mkdir()
        dstdir.mkdir()
        a, b = srcdir / "film", dstdir / "film"
        a.write_bytes(b"abcdef")
        p = t.copier_fichier(str(a), str(b), lambda n: None, None)
        with (
            patch("app.storage.integrite.SESSION_VERIFICATION", "nouvelle-session"),
            patch("app.storage.integrite.empreinte", wraps=integrite.empreinte) as h,
        ):
            t.verifier_dossier(str(srcdir), str(dstdir), preuves={"film": p})
            self.assertEqual(h.call_count, 2)

    def test_modification_destination_invalide_preuve(self):
        srcdir, dstdir = Path(self.tmp.name) / "a", Path(self.tmp.name) / "b"
        srcdir.mkdir()
        dstdir.mkdir()
        a, b = srcdir / "film", dstdir / "film"
        a.write_bytes(b"abcdef")
        p = t.copier_fichier(str(a), str(b), lambda n: None, None)
        b.write_bytes(b"abcdeg")
        with self.assertRaises(t.Arret):
            t.verifier_dossier(str(srcdir), str(dstdir), preuves={"film": p})
        self.assertTrue(a.exists())

    def test_source_modifiee_pendant_copie_refuse_renommage(self):
        def avance(n):
            if n:
                self.src.write_bytes(b"change")

        with self.assertRaises(t.Arret):
            t.copier_fichier(str(self.src), str(self.dst), avance, None)
        self.assertFalse(self.dst.exists())
        self.assertTrue(self.src.exists())

    def test_reprise_prefixe_valide(self):
        Path(str(self.dst) + ".partiel").write_bytes(self.src.read_bytes()[:100])
        avances = []
        t.copier_fichier(str(self.src), str(self.dst), avances.append, None)
        self.assertEqual(avances[0], 100)
        self.assertEqual(self.dst.read_bytes(), self.src.read_bytes())

    def test_prefixe_corrompu_est_recommence(self):
        Path(str(self.dst) + ".partiel").write_bytes(b"x" * 100)
        t.copier_fichier(str(self.src), str(self.dst), lambda n: None, None)
        self.assertEqual(self.dst.read_bytes(), self.src.read_bytes())

    def test_arret_conserve_partiel_et_original(self):
        partiel = Path(str(self.dst) + ".partiel")
        partiel.write_bytes(self.src.read_bytes()[:100])
        stop = threading.Event()
        stop.set()
        with self.assertRaises(t.Interrompu):
            t.copier_fichier(str(self.src), str(self.dst), lambda n: None, stop)
        self.assertTrue(self.src.exists())
        self.assertEqual(partiel.stat().st_size, 100)
        self.assertFalse(self.dst.exists())

    def test_verification_refuse_corruption_meme_taille(self):
        a, b = Path(self.tmp.name) / "a", Path(self.tmp.name) / "b"
        a.mkdir()
        b.mkdir()
        (a / "film").write_bytes(b"abcd")
        (b / "film").write_bytes(b"abce")
        with self.assertRaises(t.Arret):
            t.verifier_dossier(str(a), str(b))
        self.assertTrue((a / "film").exists())


@unittest.skipUnless(shutil.which("rsync"), "rsync absent sur cet hôte ; tests exécutés dans l’image Linux")
class RsyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.src = Path(self.tmp.name) / "source avec espaces.mkv"
        self.dst = Path(self.tmp.name) / "destination.mkv"
        self.src.write_bytes(os.urandom(2 << 20))

    def test_copie_rsync_et_preuve(self):
        from app.storage import integrite

        p = integrite.copier_rsync(str(self.src), str(self.dst), lambda n: None, None)
        self.assertEqual(self.src.read_bytes(), self.dst.read_bytes())
        self.assertTrue(integrite.preuve_valide(str(self.src), str(self.dst), p))
        self.assertFalse(Path(str(self.dst) + ".partiel").exists())

    def test_standard_sans_relecture_et_preuve_expiree(self):
        from app.storage import integrite

        with patch.object(integrite, "empreinte", side_effect=AssertionError("Relecture inattendue")):
            p = integrite.copier_rsync(str(self.src), str(self.dst), lambda n: None, None, mode="standard")
        self.assertEqual(self.src.read_bytes(), self.dst.read_bytes())
        self.assertTrue(integrite.preuve_valide(str(self.src), str(self.dst), p, "standard"))
        self.assertFalse(integrite.preuve_valide(str(self.src), str(self.dst), p, "renforce"))
        with patch.object(integrite, "SESSION_VERIFICATION", "nouveau processus"):
            self.assertFalse(integrite.preuve_valide(str(self.src), str(self.dst), p, "standard"))
        self.dst.write_bytes(b"x" * self.src.stat().st_size)
        self.assertFalse(integrite.preuve_valide(str(self.src), str(self.dst), p, "standard"))

    def test_standard_repare_partiel_meme_taille(self):
        from app.storage import integrite

        Path(str(self.dst) + ".partiel").write_bytes(b"x" * self.src.stat().st_size)
        with patch.object(integrite, "empreinte", side_effect=AssertionError("Relecture inattendue")):
            integrite.copier_rsync(str(self.src), str(self.dst), lambda n: None, None, mode="standard")
        self.assertEqual(self.src.read_bytes(), self.dst.read_bytes())

    def test_reprise_repare_partiel_corrompu_meme_taille(self):
        from app.storage import integrite

        partial = Path(str(self.dst) + ".partiel")
        partial.write_bytes(b"x" * self.src.stat().st_size)
        shutil.copystat(self.src, partial)
        integrite.copier_rsync(str(self.src), str(self.dst), lambda n: None, None)
        self.assertEqual(self.src.read_bytes(), self.dst.read_bytes())

    def test_interruption_et_reprise_verifiee(self):
        from app.storage import integrite

        stop = threading.Event()
        timer = threading.Timer(0.3, stop.set)
        timer.start()
        try:
            with patch.dict(os.environ, {"RSYNC_BWLIMIT": "128"}):
                with self.assertRaises(t.Interrompu):
                    integrite.copier_rsync(str(self.src), str(self.dst), lambda n: None, stop)
        finally:
            timer.cancel()
        self.assertTrue(self.src.exists())
        self.assertFalse(self.dst.exists())
        self.assertTrue(Path(str(self.dst) + ".partiel").exists())
        stop.clear()
        integrite.copier_rsync(str(self.src), str(self.dst), lambda n: None, stop)
        self.assertEqual(self.src.read_bytes(), self.dst.read_bytes())

    def test_partiel_lie_refuse(self):
        from app.storage import integrite

        os.link(self.src, str(self.dst) + ".partiel")
        with self.assertRaises(t.Arret):
            integrite.copier_rsync(str(self.src), str(self.dst), lambda n: None, None)
        self.assertFalse(self.dst.exists())
