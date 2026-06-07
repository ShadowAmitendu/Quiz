"""
generate_manifest.py
--------------------
Run this whenever you add or remove subjects/topics.
It scans the quiz/ folder and writes quiz/manifest.json automatically.

Usage:
    python generate_manifest.py

Place this file next to index.html (same root as the quiz/ folder).
"""

import json
import os
import re


QUIZ_DIR = "quiz"
OUTPUT   = os.path.join(QUIZ_DIR, "manifest.json")

# Words that should be fully uppercased regardless of .title() output.
# Add any acronyms or abbreviations you use in folder/file names here.
ACRONYMS = {
    "Dbms", "Cpu", "Os", "Sql", "Nosql", "Api", "Tcp",
    "Ip", "Http", "Html", "Css", "Dns", "Oop", "Dsa",
    "Ai", "Ml", "Dl", "Nlp", "Crm", "Erp", "Ui", "Ux",
}

def fix_acronyms(label: str) -> str:
    """Cpu Scheduling  →  CPU Scheduling"""
    return " ".join(
        word.upper() if word in ACRONYMS else word
        for word in label.split()
    )


def folder_to_label(folder_name: str) -> str:
    """operating-systems  →  Operating Systems"""
    return fix_acronyms(re.sub(r"[-_]+", " ", folder_name).title())


def file_to_label(filename: str) -> str:
    """cpu-scheduling.json  →  CPU Scheduling"""
    name = os.path.splitext(filename)[0]          # strip .json
    return fix_acronyms(re.sub(r"[-_]+", " ", name).title())


def build_manifest() -> list:
    manifest = []

    if not os.path.isdir(QUIZ_DIR):
        print(f"[error] '{QUIZ_DIR}' folder not found next to this script.")
        return manifest

    def add_entry(subject: str, folder: str, files: list[str]) -> None:
        entry = {
            "subject": subject,
            "folder": folder,
            "files": [
                {
                    "label": file_to_label(f),
                    "file": f,
                }
                for f in files
            ],
        }
        manifest.append(entry)
        print(
            f"[+] {entry['subject']}  ({len(files)} topic{'s' if len(files) != 1 else ''})"
        )
        for f in files:
            print(f"      • {file_to_label(f)}  ({f})")

    # sort subjects alphabetically
    subjects = sorted(
        d for d in os.listdir(QUIZ_DIR)
        if os.path.isdir(os.path.join(QUIZ_DIR, d))
    )

    for folder in subjects:
        folder_path = os.path.join(QUIZ_DIR, folder)

        # collect valid .json files, sorted alphabetically
        files = sorted(
            f for f in os.listdir(folder_path)
            if f.endswith(".json") and not f.startswith("_")
        )

        if not files:
            print(f"[skip] '{folder}' — no .json files found.")
            continue

        add_entry(folder_to_label(folder), folder, files)

    # Also support quiz/*.json files directly under quiz/.
    root_files = sorted(
        f for f in os.listdir(QUIZ_DIR)
        if os.path.isfile(os.path.join(QUIZ_DIR, f))
        and f.endswith(".json")
        and not f.startswith("_")
        and f != "manifest.json"
    )

    for filename in root_files:
        add_entry(file_to_label(filename), ".", [filename])

    return manifest


def main():
    print(f"Scanning '{QUIZ_DIR}/' ...\n")
    manifest = build_manifest()

    if not manifest:
        print("\nNothing to write — no subjects found.")
        return

    with open(OUTPUT, "w", encoding="utf-8") as fp:
        json.dump(manifest, fp, indent=2, ensure_ascii=False)

    print(f"\n✓ Written {len(manifest)} subject{'s' if len(manifest) != 1 else ''} → {OUTPUT}")


if __name__ == "__main__":
    main()
