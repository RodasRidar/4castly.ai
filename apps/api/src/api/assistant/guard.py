"""Number guard for the streamed answer (plan 7c, S17).

The model never writes a number: it writes `[[f7_3]]` and this filter swaps in the exact value. Any
digit it writes on its own is masked before the text is forwarded, so nothing is shown and later
retracted. Digits are buffered across chunk boundaries (`1` + `2.5` is one number), and so are
partial references (`[[f7` + `_3]]`).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from api.assistant.figures import Refs
from api.assistant.format import format_figure
from api.schemas.chat import Annotation, FilterAnnotation, ProductAnnotation

MASK = "…"
MAX_REF_LENGTH = 24  # longer than any real id: a longer "reference" is just text
_REF = re.compile(r"^[fp]\d+_\d+$")


@dataclass
class GuardOutput:
    text: str = ""
    annotations: list[Annotation] = field(default_factory=list)


class StreamGuard:
    def __init__(self, refs: Refs, locale: str) -> None:
        self._refs = refs
        self._locale = locale
        self._buffer = ""
        self._length = 0  # code points emitted so far: annotation offsets
        self.hits = 0
        self.annotations: list[Annotation] = []

    def feed(self, chunk: str) -> GuardOutput:
        self._buffer += chunk
        return self._drain(final=False)

    def finish(self) -> GuardOutput:
        return self._drain(final=True)

    # -- internals -----------------------------------------------------------------------------
    def _drain(self, *, final: bool) -> GuardOutput:
        out: list[str] = []
        new: list[Annotation] = []
        buf, i, n = self._buffer, 0, len(self._buffer)
        while i < n:
            ch = buf[i]
            if ch == "[":
                if buf.startswith("[[", i):
                    end = buf.find("]]", i + 2)
                    if end == -1 or end - i > MAX_REF_LENGTH:
                        if end == -1 and n - i <= MAX_REF_LENGTH and not final:
                            break  # the reference may still be arriving
                        self._emit(out, "[")  # not a reference: plain text
                        i += 1
                        continue
                    self._reference(out, new, buf[i + 2 : end])
                    i = end + 2
                    continue
                if i == n - 1 and not final:
                    break  # a lone "[" at the end may become "[["
                self._emit(out, "[")
                i += 1
            elif ch.isdigit():
                j, waiting = self._number_end(buf, i)
                if (j == n or waiting) and not final:
                    break  # the number may continue in the next chunk
                self.hits += 1
                self._emit(out, MASK)
                i = j
            else:
                self._emit(out, ch)
                i += 1
        self._buffer = buf[i:]
        return GuardOutput("".join(out), new)

    @staticmethod
    def _number_end(buf: str, start: int) -> tuple[int, bool]:
        """End of a run like `1.355,50`; also whether it stopped at a separator ending the chunk."""
        j, n = start, len(buf)
        while j < n:
            c = buf[j]
            if c.isdigit():
                j += 1
            elif c in ".,":
                if j + 1 >= n:
                    return j, True
                if not buf[j + 1].isdigit():
                    break
                j += 1
            else:
                break
        return j, False

    def _emit(self, out: list[str], text: str) -> None:
        out.append(text)
        self._length += len(text)

    def _reference(self, out: list[str], new: list[Annotation], token: str) -> None:
        figure = self._refs.resolve_figure(token) if _REF.match(token) else None
        product = self._refs.resolve_product(token) if _REF.match(token) else None
        if figure is None and product is None:
            self.hits += 1
            self._emit(out, MASK)
            return
        start = self._length
        if figure is not None:
            shown = format_figure(figure, self._locale)
            self._emit(out, shown)
            if figure.filter is not None:
                annotation = FilterAnnotation(start=start, end=self._length, link=figure.filter)
                new.append(annotation)
                self.annotations.append(annotation)
        elif product is not None:
            self._emit(out, product.code)
            annotation = ProductAnnotation(start=start, end=self._length, code=product.code)
            new.append(annotation)
            self.annotations.append(annotation)
