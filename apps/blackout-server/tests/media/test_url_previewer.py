# Copyright 2023 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
import datetime
import os
from asyncio import CancelledError
from unittest import mock

from twisted.test.proto_helpers import MemoryReactor

from synapse.api.errors import Codes, SynapseError
from synapse.server import HomeServer
from synapse.types import UserID
from synapse.util import Clock

from tests import unittest
from tests.unittest import override_config

try:
    import lxml
except ImportError:
    lxml = None  # type: ignore[assignment]


class URLPreviewTests(unittest.HomeserverTestCase):
    if not lxml:
        skip = "url preview feature requires lxml"

    def make_homeserver(self, reactor: MemoryReactor, clock: Clock) -> HomeServer:
        config = self.default_config()
        config["url_preview_enabled"] = True
        # Only set max_spider_size if not already overridden by @override_config.
        config.setdefault("max_spider_size", 9999999)
        config["url_preview_ip_range_blacklist"] = (
            "192.168.1.1",
            "1.0.0.0/8",
            "3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
            "2001:800::/21",
        )

        self.storage_path = self.mktemp()
        self.media_store_path = self.mktemp()
        os.mkdir(self.storage_path)
        os.mkdir(self.media_store_path)
        config["media_store_path"] = self.media_store_path

        provider_config = {
            "module": "synapse.media.storage_provider.FileStorageProviderBackend",
            "store_local": True,
            "store_synchronous": False,
            "store_remote": True,
            "config": {"directory": self.storage_path},
        }

        config["media_storage_providers"] = [provider_config]

        return self.setup_test_homeserver(config=config)

    def prepare(self, reactor: MemoryReactor, clock: Clock, hs: HomeServer) -> None:
        media_repo = hs.get_media_repository()
        assert media_repo.url_previewer is not None
        self.url_previewer = media_repo.url_previewer

    def test_all_urls_allowed(self) -> None:
        self.assertFalse(self.url_previewer._is_url_blocked("http://matrix.org"))
        self.assertFalse(self.url_previewer._is_url_blocked("https://matrix.org"))
        self.assertFalse(self.url_previewer._is_url_blocked("http://localhost:8000"))
        self.assertFalse(
            self.url_previewer._is_url_blocked("http://user:pass@matrix.org")
        )

    @override_config(
        {
            "url_preview_url_blacklist": [
                {"username": "user"},
                {"scheme": "http", "netloc": "matrix.org"},
            ]
        }
    )
    def test_blocked_url(self) -> None:
        # Blocked via scheme and URL.
        self.assertTrue(self.url_previewer._is_url_blocked("http://matrix.org"))
        # Not blocked because all components must match.
        self.assertFalse(self.url_previewer._is_url_blocked("https://matrix.org"))

        # Blocked due to the user.
        self.assertTrue(
            self.url_previewer._is_url_blocked("http://user:pass@example.com")
        )
        self.assertTrue(self.url_previewer._is_url_blocked("http://user@example.com"))

    @override_config({"url_preview_url_blacklist": [{"netloc": "*.example.com"}]})
    def test_glob_blocked_url(self) -> None:
        # All subdomains are blocked.
        self.assertTrue(self.url_previewer._is_url_blocked("http://foo.example.com"))
        self.assertTrue(self.url_previewer._is_url_blocked("http://.example.com"))

        # The TLD is not blocked.
        self.assertFalse(self.url_previewer._is_url_blocked("https://example.com"))

    @override_config({"url_preview_url_blacklist": [{"netloc": "^.+\\.example\\.com"}]})
    def test_regex_blocked_urL(self) -> None:
        # All subdomains are blocked.
        self.assertTrue(self.url_previewer._is_url_blocked("http://foo.example.com"))
        # Requires a non-empty subdomain.
        self.assertFalse(self.url_previewer._is_url_blocked("http://.example.com"))

        # The TLD is not blocked.
        self.assertFalse(self.url_previewer._is_url_blocked("https://example.com"))

    def test_get_expiration_ms_prefers_cache_control(self) -> None:
        headers = {
            b"Cache-Control": [b"public, max-age=120"],
            b"Expires": [b"Wed, 21 Oct 2030 07:28:00 GMT"],
        }

        self.assertEqual(self.url_previewer._get_expiration_ms(headers), 120000)

    def test_get_expiration_ms_uses_expires_header(self) -> None:
        now_s = self.clock.time_msec() // 1000
        expires = now_s + 90

        with mock.patch(
            "synapse.media.url_previewer.parsedate_to_datetime"
        ) as parse_dt:
            parse_dt.return_value = datetime.datetime.fromtimestamp(
                expires, tz=datetime.timezone.utc
            )
            headers = {b"Expires": [b"ignored by patched parser"]}
            expiration_ms = self.url_previewer._get_expiration_ms(headers)

        self.assertGreaterEqual(expiration_ms, 89000)
        self.assertLessEqual(expiration_ms, 90000)

    @override_config({"max_spider_size": 8})
    def test_data_url_respects_max_spider_size(self) -> None:
        user = UserID.from_string("@user:test")
        # The data URL content is 10 bytes, larger than max_spider_size=8.
        # Expect a 502 TOO_LARGE SynapseError to propagate directly.
        failure = self.get_failure(
            self.url_previewer._handle_url(
                "data:text/plain,0123456789", user, allow_data_urls=True
            ),
            SynapseError,
        )
        exc = failure.value
        self.assertEqual(exc.code, 502)
        self.assertEqual(exc.errcode, Codes.TOO_LARGE)

    def test_handle_url_cleans_up_file_on_store_failure(self) -> None:
        def fail_store_local_media(**kwargs: object) -> object:
            raise SynapseError(500, "boom")

        with mock.patch(
            "synapse.media.url_previewer.random_string", return_value="abcdefghijklmnop"
        ), mock.patch.object(
            self.url_previewer,
            "_download_url",
            new=mock.AsyncMock(
                return_value=mock.Mock(
                    media_type="text/plain",
                    length=3,
                    download_name=None,
                    uri="http://example.com",
                    response_code=200,
                    expires=1000,
                    etag=None,
                )
            ),
        ), mock.patch.object(
            self.url_previewer.store,
            "store_local_media",
            side_effect=fail_store_local_media,
        ):
            self.get_failure(
                self.url_previewer._handle_url(
                    "http://example.com", UserID.from_string("@user:test")
                ),
                SynapseError,
            )

        media_id = f"{datetime.date.today().isoformat()}_abcdefghijklmnop"
        self.assertFalse(
            os.path.exists(self.url_previewer.filepaths.url_cache_filepath(media_id))
        )

    def test_precache_image_url_propagates_cancellation(self) -> None:
        user = UserID.from_string("@user:test")
        media_info = mock.Mock(uri="http://example.com", media_type="text/html")

        with mock.patch.object(
            self.url_previewer,
            "_handle_url",
            side_effect=CancelledError(),
        ):
            # CancelledError must propagate out rather than being silently
            # swallowed as a non-fatal image-fetch failure.
            self.get_failure(
                self.url_previewer._precache_image_url(
                    user,
                    media_info,
                    {"og:image": "http://cdn.example/image.png"},
                ),
                CancelledError,
            )

    def test_download_result_handles_non_ascii_content_type(self) -> None:
        """Non-ASCII bytes in the Content-Type header must not crash the
        download; they should be replaced rather than raising UnicodeDecodeError."""
        headers = {
            b"Content-Type": [b"text/html; charset=\xff"],
        }
        result = self.get_success(self._download_with_headers(headers))
        # The replacement character should appear instead of the invalid byte.
        self.assertIn("\ufffd", result.media_type)

    def test_download_result_handles_non_ascii_etag(self) -> None:
        """Non-ASCII bytes in the ETag header must not crash the download."""
        headers = {
            b"Content-Type": [b"text/html"],
            b"ETag": [b"\x80invalid"],
        }
        result = self.get_success(self._download_with_headers(headers))
        self.assertIsNotNone(result.etag)
        self.assertIn("\ufffd", result.etag)

    async def _download_with_headers(self, response_headers: dict):
        """Helper that exercises _download_url's header parsing with given
        response headers."""
        with mock.patch.object(
            self.url_previewer.client,
            "get_file",
            new=mock.AsyncMock(
                return_value=(0, response_headers, "http://example.com", 200)
            ),
        ):
            result = await self.url_previewer._download_url(
                "http://example.com", mock.MagicMock()
            )
        return result

    @override_config({"max_spider_size": 16})
    def test_read_file_for_parsing_rejects_oversized_body(self) -> None:
        body_file = self.mktemp()
        with open(body_file, "wb") as f:
            f.write(b"x" * 32)

        self.assertIsNone(self.url_previewer._read_file_for_parsing(body_file))

    @override_config({"max_spider_size": 32})
    def test_read_file_for_parsing_reads_small_body(self) -> None:
        body_file = self.mktemp()
        with open(body_file, "wb") as f:
            f.write(b"hello")

        self.assertEqual(self.url_previewer._read_file_for_parsing(body_file), b"hello")
