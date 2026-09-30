import glob
import os
from html.parser import HTMLParser


class TagValidator(HTMLParser):
    VOID_ELEMENTS = {
        "area", "base", "br", "col", "embed", "hr", "img",
        "input", "link", "meta", "param", "source", "track", "wbr"
    }

    def __init__(self):
        super().__init__()
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() not in self.VOID_ELEMENTS:
            self.stack.append((tag.lower(), self.getpos()))

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in self.VOID_ELEMENTS:
            return
        if not self.stack:
            self.errors.append(f"Extra closing tag </{tag}> at line {self.getpos()[0]}")
            return
        expected_tag, pos = self.stack.pop()
        if expected_tag != tag:
            self.errors.append(
                f"Mismatched closing tag </{tag}> at line {self.getpos()[0]}, "
                f"expected </{expected_tag}> opened at line {pos[0]}"
            )


def test_all_html_files_balanced_tags():
    frontend_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
    )
    html_files = sorted(glob.glob(os.path.join(frontend_dir, "*.html")))

    expected_pages = {
        "alerts.html", "analytics.html", "index.html", "map-view.html",
        "notifications.html", "profile.html", "security.html", "siren-control.html"
    }
    found_pages = {os.path.basename(f) for f in html_files}
    assert expected_pages.issubset(found_pages), f"Missing HTML pages: {expected_pages - found_pages}"

    for html_file in html_files:
        with open(html_file, "r", encoding="utf-8") as f:
            content = f.read()

        validator = TagValidator()
        validator.feed(content)

        if validator.stack:
            for tag, pos in validator.stack:
                validator.errors.append(f"Unclosed tag <{tag}> opened at line {pos[0]}")

        assert len(validator.errors) == 0, (
            f"HTML validation errors in {os.path.basename(html_file)}: {validator.errors}"
        )
