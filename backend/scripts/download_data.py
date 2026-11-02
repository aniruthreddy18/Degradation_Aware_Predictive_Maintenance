"""Fetch the NASA C-MAPSS FD001 files into backend/data.

The official source is NASA's Prognostics Center of Excellence data repository
(https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/).
If that host is unreachable from your network, this script falls back to a public GitHub mirror of the
same files; it verifies the row counts against the published FD001 dimensions either way.
"""
import sys, urllib.request, zipfile, io
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
FILES = {"train_FD001.txt": 20631, "test_FD001.txt": 13096, "RUL_FD001.txt": 100}
NASA = "https://data.nasa.gov/docs/legacy/CMAPSSData.zip"
MIRROR = "https://raw.githubusercontent.com/hankroark/Turbofan-Engine-Degradation/master/CMAPSSData/{}"


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read()


def main():
    DATA.mkdir(exist_ok=True)
    if all((DATA / f).exists() for f in FILES):
        print("data already present"); return
    try:
        z = zipfile.ZipFile(io.BytesIO(fetch(NASA)))
        for f in FILES:
            (DATA / f).write_bytes(z.read(f))
        print("downloaded from NASA")
    except Exception as e:
        print(f"NASA host failed ({e}); using GitHub mirror")
        for f in FILES:
            (DATA / f).write_bytes(fetch(MIRROR.format(f)))
    for f, n in FILES.items():
        got = len((DATA / f).read_text().strip().splitlines())
        if got != n:
            sys.exit(f"{f}: expected {n} rows, got {got}")
    print("OK: FD001 verified", {f: n for f, n in FILES.items()})


if __name__ == "__main__":
    main()
