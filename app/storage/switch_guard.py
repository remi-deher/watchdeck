"""One Arr root for the complete title; Plex keeps both library locations."""

import os


async def confirm_complete(instance, item, snap, source_files, destination_files, request):
    from .worker import VIDEO

    expected = set(snap["files"])
    if set(source_files) != expected or set(destination_files) != expected:
        raise ValueError("Tous les fichiers doivent être copiés avant de modifier la racine Arr.")
    resource = "movie" if item.media_type == "movie" else "series"
    media = await request(instance, "GET", f"{resource}/{item.arr_id}")
    if media["path"] != snap["source_arr"]:
        raise ValueError("Chemin Arr modifié pendant la copie : bascule refusée.")
    files = await request(
        instance,
        "GET",
        f"moviefile?movieId={item.arr_id}" if resource == "movie" else f"episodefile?seriesId={item.arr_id}",
    )
    videos = {name.replace(os.sep, "/") for name in expected if name.lower().endswith(VIDEO)}
    if {file.get("relativePath") for file in files} != videos:
        raise ValueError("Inventaire Arr modifié pendant la copie : racine source conservée.")
    return media
