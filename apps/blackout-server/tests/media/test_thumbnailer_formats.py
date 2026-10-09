#
# Regression test for GHSA-vp6v-whfm-rv3g, ported by hand into the Blackout
# fork. Upstream Synapse 1.120.1 restricted the formats Pillow may decode when
# thumbnailing; it shipped no test, this one is ours. See
# apps/blackout-server/PATCHES.md and
# docs/security/upstream-advisory-triage-2026-10-09.md.
#
import os
import tempfile

from parameterized import parameterized
from PIL import Image

from synapse.media.thumbnailer import ThumbnailError, Thumbnailer

from tests import unittest


class ThumbnailerFormatAllowlistTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)

    def _write_image(self, pil_format: str, ext: str) -> str:
        path = os.path.join(self._tmpdir.name, "img." + ext)
        mode = "RGB" if pil_format not in ("GIF",) else "P"
        Image.new(mode, (4, 4)).save(path, format=pil_format)
        return path

    @parameterized.expand(
        [("PNG", "png"), ("JPEG", "jpg"), ("GIF", "gif"), ("WEBP", "webp")]
    )
    def test_allowed_format_is_decoded(self, pil_format: str, ext: str) -> None:
        t = Thumbnailer(self._write_image(pil_format, ext))
        try:
            self.assertEqual(t.width, 4)
        finally:
            t.close()

    @parameterized.expand(
        [("BMP", "bmp"), ("TIFF", "tiff"), ("PPM", "ppm")]
    )
    def test_other_format_is_refused(self, pil_format: str, ext: str) -> None:
        path = self._write_image(pil_format, ext)
        # Sentinel: Pillow itself can decode this file, so the refusal below is
        # the allowlist and not a broken fixture.
        with Image.open(path) as im:
            self.assertEqual(im.format, pil_format)
        with self.assertRaises(ThumbnailError):
            Thumbnailer(path)
