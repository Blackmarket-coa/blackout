# Copyright 2026 The Matrix.org Foundation C.I.C.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.

from synapse.util.gai_resolver import HostResolution

from tests import unittest


class HostResolutionTestCase(unittest.TestCase):
    def test_cancel_is_noop(self) -> None:
        resolution = HostResolution("example.com")

        self.assertIsNone(resolution.cancel())
