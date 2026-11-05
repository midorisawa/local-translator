import gzip
import json

import numpy as np
from py3langid.langid import _get_identifier

from local_translate_ui.languages import LANGUAGES


def package_languages(static):
    (static / "languages.json").write_text(json.dumps(LANGUAGES, ensure_ascii=False), encoding="utf-8")
    model = _get_identifier()
    metadata = {
        "classes": model.nb_classes,
        "transitions": len(model.tk_nextmove),
        "states": len(model.tk_row),
    }
    (static / "langid.json").write_text(json.dumps(metadata), encoding="utf-8")
    with gzip.open(static / "langid.bin.gz", "wb", compresslevel=3) as destination:
        for data, dtype in (
            (model.tk_nextmove, "<u4"),
            (model.tk_row, "<u4"),
            (model.tk_output, "<i4"),
            (model.nb_pc, "<f4"),
            (model.nb_ptc, "<f4"),
        ):
            destination.write(np.asarray(data, dtype=dtype).tobytes())
