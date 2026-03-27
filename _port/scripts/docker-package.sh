#!/usr/bin/env bash

set -ex

if git rev-parse --git-dir >/dev/null 2>&1; then
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
else
    BRANCH=""
fi

DIR=$(dirname "$0")

# If the branch comes out as HEAD then we're probably checked out to a tag, so if the thing is *not*
# coming out as HEAD then we're on a branch. When we're on a branch, we want to resolve ourselves to
# a few SHAs rather than a version.
if [[ -n "$BRANCH" && $BRANCH != HEAD && ! $BRANCH =~ heads/v.+ ]]
then
    DIST_VERSION=$("$DIR"/get-version-from-git.sh 2>/dev/null || true)
fi

if [[ -z "$DIST_VERSION" && -n "$BRANCH" ]]; then
    DIST_VERSION=$(git describe --abbrev=0 --tags 2>/dev/null || true)
fi

if [[ -z "$DIST_VERSION" ]]; then
    DIST_VERSION=$(node -p "require('./package.json').version")
fi

DIST_VERSION=$("$DIR"/normalize-version.sh "$DIST_VERSION")

VERSION=$DIST_VERSION yarn build
