#!/usr/bin/env python3
"""Složí index.html pro GitHub Pages ze src/page.html (obsah stránky bez <html>, <head> a <body>)."""
import os

here = os.path.dirname(os.path.abspath(__file__))
page = open(os.path.join(here, "src", "page.html"), encoding="utf-8").read()
split = page.index('<header class="top">')
head, body = page[:split].strip(), page[split:].strip()
html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head}
</head>
<body>
{body}
</body>
</html>
"""
open(os.path.join(here, "index.html"), "w", encoding="utf-8").write(html)
print("index.html", len(html), "B")
