"""Safe access to uploaded workbooks and CSV files (S11).

Parsing happens only here, in the worker: container checks first (zip bombs, macros, encrypted
or legacy files), then openpyxl in read-only mode (defusedxml when installed) or the csv module.
"""

from __future__ import annotations

import csv
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from worker.domain.errors import UnreadableFileError

MAX_UNCOMPRESSED_BYTES = 400 * 1024 * 1024
OLE_MAGIC = bytes.fromhex("D0CF11E0A1B11AE1")
CSV_SHEET = "CSV"
_CSV_DELIMITERS = ",;\t|"
_SNIFF_BYTES = 64 * 1024

Row = tuple[Any, ...]


def check_container(path: Path, suffix: str | None = None) -> str:
    """Validate the file by content; return its kind (`xlsx` or `csv`) or raise."""
    extension = (suffix or path.suffix).lower()
    head = path.read_bytes()[:8] if path.stat().st_size else b""
    if path.stat().st_size == 0:
        raise UnreadableFileError("empty", "the file has no content")
    if extension == ".csv":
        if b"\x00" in path.read_bytes()[:_SNIFF_BYTES]:
            raise UnreadableFileError("corrupt", "binary content in a csv file")
        return "csv"
    if extension == ".xls":
        raise UnreadableFileError("unsupported_format", "legacy .xls files are not supported")
    if extension not in {".xlsx", ".xlsm"}:
        raise UnreadableFileError("unsupported_format", f"unsupported extension {extension}")
    if head.startswith(OLE_MAGIC):  # an .xlsx that is really an OLE container is an encrypted one
        raise UnreadableFileError("password_protected", "the workbook is encrypted")
    if not zipfile.is_zipfile(path):
        raise UnreadableFileError("corrupt", "not a valid workbook")
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        if sum(info.file_size for info in archive.infolist()) > MAX_UNCOMPRESSED_BYTES:
            raise UnreadableFileError("corrupt", "uncompressed size over the limit")
    if "xl/vbaProject.bin" in names or extension == ".xlsm":
        raise UnreadableFileError("unsupported_format", "macro-enabled workbooks are rejected")
    if "xl/workbook.xml" not in names:
        raise UnreadableFileError("corrupt", "the workbook has no workbook.xml")
    return "xlsx"


def _decode(path: Path) -> str:
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace")


def _csv_reader(path: Path) -> Iterator[Row]:
    text = _decode(path)
    try:
        dialect = csv.Sniffer().sniff(text[:_SNIFF_BYTES], delimiters=_CSV_DELIMITERS)
    except csv.Error:
        dialect = csv.excel
    for row in csv.reader(text.splitlines(), dialect):
        yield tuple(cell.strip() for cell in row)


def sheet_names(path: Path, kind: str) -> list[str]:
    if kind == "csv":
        return [CSV_SHEET]
    try:
        workbook = load_workbook(path, read_only=True, data_only=True)
    except Exception as error:
        raise UnreadableFileError(
            "corrupt", f"cannot open the workbook: {type(error).__name__}"
        ) from error
    try:
        return list(workbook.sheetnames)
    finally:
        workbook.close()


def read_rows(path: Path, kind: str, sheet: str) -> Iterator[Row]:
    """Rows of one sheet as tuples of raw values (datetimes and numbers stay native)."""
    if kind == "csv":
        yield from _csv_reader(path)
        return
    try:
        workbook = load_workbook(path, read_only=True, data_only=True)
    except Exception as error:
        raise UnreadableFileError(
            "corrupt", f"cannot open the workbook: {type(error).__name__}"
        ) from error
    try:
        if sheet not in workbook.sheetnames:
            raise UnreadableFileError("corrupt", f"sheet {sheet!r} not found")
        for row in workbook[sheet].iter_rows(values_only=True):
            yield tuple(row)
    finally:
        workbook.close()
