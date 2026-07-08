import json
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
INCLUDE_PATHS = [
    "manifest.json",
    "src",
    "_locales",
    "LICENSE",
]
EXCLUDED_NAMES = {".DS_Store"}


def iter_package_files(path: Path):
    if path.name in EXCLUDED_NAMES:
        return
    if path.is_file():
        yield path
        return
    for child in sorted(path.iterdir(), key=lambda item: item.as_posix()):
        yield from iter_package_files(child)


def main() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    DIST.mkdir(exist_ok=True)
    package_path = DIST / f"download-manager-lite-v{version}.zip"

    with zipfile.ZipFile(package_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative_path in INCLUDE_PATHS:
            source = ROOT / relative_path
            if not source.exists():
                raise FileNotFoundError(source)
            for file_path in iter_package_files(source):
                archive.write(file_path, file_path.relative_to(ROOT).as_posix())

    print(package_path.relative_to(ROOT).as_posix())


if __name__ == "__main__":
    main()
